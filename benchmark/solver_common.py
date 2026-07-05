"""solver_text / solver_image 공용 유틸."""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = "gemini-2.5-flash-lite"
API_TIMEOUT_SEC = 300  # 단일 호출 상한 (무한 대기 방지)

OUTPUTS = ROOT / "outputs" / "2025"
RESULTS_DIR = ROOT / "benchmark" / "results"

_env_loaded = False


def _require_key(name: str) -> str:
    """API 키 조회. dotenv 는 실제 API 를 쓸 때만 필요하므로 지연 로드."""
    global _env_loaded
    if not _env_loaded:
        try:
            from dotenv import load_dotenv
            load_dotenv(ROOT / ".env")
        except ImportError:
            pass  # 환경변수를 직접 설정했다면 dotenv 없이도 동작
        _env_loaded = True
    key = os.environ.get(name)
    if not key:
        raise RuntimeError(f"{name} 가 설정되지 않았습니다 (.env 또는 환경변수 필요)")
    return key


def is_claude(model: str) -> bool:
    return model.startswith("claude-")


_gemini_singleton = None
_claude_singleton = None


def get_gemini():
    global _gemini_singleton
    if _gemini_singleton is None:
        from google import genai
        _gemini_singleton = genai.Client(
            api_key=_require_key("GEMINI_API_KEY"),
            http_options={"timeout": API_TIMEOUT_SEC * 1000},
        )
    return _gemini_singleton


def get_claude():
    global _claude_singleton
    if _claude_singleton is None:
        import anthropic
        _claude_singleton = anthropic.Anthropic(
            api_key=_require_key("ANTHROPIC_API_KEY"),
            timeout=float(API_TIMEOUT_SEC),
        )
    return _claude_singleton

CHOICE_MARKS = ["①", "②", "③", "④", "⑤"]

SYSTEM_PROMPT = """\
당신은 한국 수능 시험을 풀고 있습니다.
문제를 주의 깊게 읽고, 최종 답을 먼저 결정한 뒤 JSON 한 객체로 반환하세요.

■ 5지선다형 반환 형식 (키 순서 반드시 준수: answer → confidence → reasoning):
{"answer": "②", "confidence": {"①": 0.05, "②": 0.80, "③": 0.10, "④": 0.03, "⑤": 0.02}, "reasoning": "풀이과정"}

■ 단답형 반환 형식:
{"answer": 14, "confidence": 0.85, "reasoning": "풀이과정"}

규칙:
- answer 를 맨 앞에, reasoning 은 맨 뒤에 배치 (응답이 잘려도 핵심 필드는 보존)
- 5지선다 confidence 합은 약 1.0, answer 는 가장 높은 confidence 의 선택지
- reasoning 에 풀이과정을 한국어로 간결하게 작성
- JSON 만 반환, 다른 텍스트 없이
"""


def load_subject(subject: str) -> tuple[dict, dict]:
    """파싱된 문제 + 정답표 로드."""
    paper = json.loads((OUTPUTS / f"{subject}.json").read_text())
    ans_path = OUTPUTS / "answers" / f"{subject}.json"
    answer_sheets = json.loads(ans_path.read_text()) if ans_path.exists() else []
    ans_map: dict[tuple[int, str], dict] = {}
    for sheet in answer_sheets:
        if sheet.get("form") == "홀수형" or not sheet.get("form"):
            for e in sheet.get("entries", []):
                ans_map[(e["number"], e.get("section", "공통"))] = e
    return paper, ans_map


def load_image_bytes(img_path: str) -> bytes:
    return (OUTPUTS / img_path).read_bytes()


# `\b`(backspace)·`\f`(form feed)는 JSON 표준 escape 지만 실제 응답에선
# LaTeX(`\beta`, `\frac`)일 가능성이 압도적이므로 의도적으로 제외한다.
_VALID_SHORT_ESCAPE = set('"\\/nrt')
_HEX_DIGITS = set("0123456789abcdefABCDEF")


def fix_bad_escapes(s: str) -> str:
    """LaTeX `\\{`, `\\sum` 등 JSON 표준이 아닌 단일 backslash 를 `\\\\` 로 보정.
    유효한 escape(`\\n`, `\\"`, `\\uXXXX` 등)는 그대로 보존한다."""
    out: list[str] = []
    i = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c == "\\" and i + 1 < n:
            nxt = s[i + 1]
            if nxt in _VALID_SHORT_ESCAPE or (
                nxt == "u" and all(ch in _HEX_DIGITS for ch in s[i + 2 : i + 6]) and i + 6 <= n
            ):
                out.append(c)
                out.append(nxt)
                i += 2
                continue
            out.append("\\\\")
            out.append(nxt)
            i += 2
            continue
        out.append(c)
        i += 1
    return "".join(out)


def _scan_answer_object(s: str) -> dict | None:
    """비정형 텍스트에서 "answer" 키를 포함한 JSON 객체를 brace 매칭으로 탐색."""
    for m in re.finditer(r'"answer"', s):
        # "answer" 앞의 여는 중괄호 후보를 가까운 것부터 차례로 시도
        # (가장 가까운 { 가 LaTeX 중괄호일 수 있으므로 한 단계씩 바깥으로 확장)
        start = m.start()
        for _ in range(8):
            start = s.rfind("{", 0, start)
            if start == -1:
                break
            depth = 0
            for i in range(start, len(s)):
                if s[i] == "{":
                    depth += 1
                elif s[i] == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            obj = json.loads(s[start : i + 1])
                        except json.JSONDecodeError:
                            obj = None
                        if isinstance(obj, dict) and "answer" in obj:
                            return obj
                        break
    return None


def parse_response(text: str) -> dict:
    """모델 응답에서 answer + confidence + reasoning 추출."""
    text = (text or "").strip()
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    fixed = fix_bad_escapes(cleaned)

    obj = None
    # 보정본 우선: 온전한 JSON 이라면 보정이 no-op 이고, LaTeX 가 섞였다면 보정본만 파싱된다
    for candidate in (fixed, cleaned):
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            obj = parsed
            break
    if obj is None:
        obj = _scan_answer_object(fixed)

    if isinstance(obj, dict) and "answer" in obj:
        return {
            "answer": obj.get("answer"),
            "confidence": obj.get("confidence"),
            "reasoning": obj.get("reasoning", ""),
        }

    # Fallback: 응답이 잘려 JSON 파싱 실패 시 answer/confidence 만 별도 추출
    result = {"answer": None, "confidence": None, "reasoning": text}
    m = re.search(r'"answer"\s*:\s*"([①②③④⑤])"', fixed)
    if m:
        result["answer"] = m.group(1)
    else:
        m = re.search(r'"answer"\s*:\s*"?(-?\d+)"?', fixed)
        if m:
            try:
                result["answer"] = int(m.group(1))
            except ValueError:
                pass
    m = re.search(r'"confidence"\s*:\s*(\{[^{}]*\})', fixed)
    if m:
        try:
            result["confidence"] = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass
    else:
        m = re.search(r'"confidence"\s*:\s*([01](?:\.\d+)?)', fixed)
        if m:
            try:
                result["confidence"] = float(m.group(1))
            except ValueError:
                pass
    return result


def _coerce_choice(ai_answer, choices: list[str] | None):
    """객관식에서 모델이 선택지 '내용'(예: 14)으로 답한 경우 해당 기호(④)로 변환."""
    if not choices:
        return ai_answer
    if isinstance(ai_answer, str) and ai_answer in CHOICE_MARKS:
        return ai_answer
    if isinstance(ai_answer, float) and ai_answer.is_integer():
        ai_answer = int(ai_answer)
    s = str(ai_answer).strip()
    matches = [i for i, c in enumerate(choices[:5]) if str(c).strip() == s]
    if len(matches) == 1:
        return CHOICE_MARKS[matches[0]]
    return ai_answer


def grade(ai_answer, correct_entry: dict | None, choices: list[str] | None = None) -> dict:
    if correct_entry is None:
        return {"correct_answer": None, "points": 0, "is_correct": False}
    correct = correct_entry["answer"]
    pts = correct_entry.get("points") or 2
    ai_answer = _coerce_choice(ai_answer, choices)
    if isinstance(ai_answer, str) and ai_answer in CHOICE_MARKS:
        is_correct = ai_answer == correct
    elif isinstance(ai_answer, (int, float)):
        try:
            is_correct = int(ai_answer) == int(correct)
        except (ValueError, TypeError):
            is_correct = False
    else:
        is_correct = str(ai_answer) == str(correct)
    return {"correct_answer": correct, "points": pts, "is_correct": is_correct}


def summarize_items(items: list[dict]) -> dict:
    """items 리스트에서 summary 를 일관 규칙으로 재계산.
    skipped(모달리티 미지원)·error(API 실패) 항목은 채점 대상에서 제외한다."""
    graded = [it for it in items if not it.get("skipped") and not it.get("error")]
    skipped = sum(1 for it in items if it.get("skipped"))
    errors = len(items) - len(graded) - skipped
    correct = [it for it in graded if it.get("is_correct")]
    total_time = sum(it.get("elapsed_sec") or 0 for it in graded)
    n_graded = len(graded)
    return {
        "total_questions": len(items),
        "graded_questions": n_graded,
        "skipped": skipped,
        "errors": errors,
        "correct": len(correct),
        "score": sum(it.get("points") or 0 for it in correct),
        "max_score": sum(it.get("points") or 0 for it in graded),
        "accuracy": round(len(correct) / max(n_graded, 1) * 100, 1),
        "total_time_sec": round(total_time, 1),
        "avg_time_sec": round(total_time / max(n_graded, 1), 1),
    }


MAX_ATTEMPTS = 3  # API 오류(연결 실패·과부하 등) 시 재시도 횟수


def run_benchmark(subject: str, mode: str, model_id: str,
                  solve_fn, limit: int | None = None) -> None:
    """solve_fn(question, paper, model_id, subject) -> dict with answer/confidence/reasoning/elapsed_sec/...
    mode: "text" | "image" (결과 파일명에 사용)
    """
    paper, ans_map = load_subject(subject)
    questions = paper["questions"]
    if limit:
        questions = questions[:limit]

    print(f"\n{'━'*60}")
    print(f" AI 풀이: {subject} / {mode} mode / {model_id}")
    print(f" 문항: {len(questions)}개")
    print(f"{'━'*60}")

    items = []
    correct_count = 0
    n_graded = 0  # 채점 대상 (skipped/error 제외)
    n_total = len(questions)
    run_t0 = time.time()

    for i, q in enumerate(questions):
        num = q["number"]
        sec = q.get("section", "공통")
        print(f"  [{i+1:>2}/{n_total}] {sec:<10} {num}번...", end=" ", flush=True)

        for attempt in range(MAX_ATTEMPTS):
            result = solve_fn(q, paper, model_id, subject)
            if result.get("skipped") or not result.get("error"):
                break
            if attempt < MAX_ATTEMPTS - 1:
                wait = 2 * 2 ** attempt
                print(f"⚠ {str(result['error'])[:60]} → {wait}s 후 재시도...", end=" ", flush=True)
                time.sleep(wait)

        correct_entry = ans_map.get((num, sec))
        is_skipped = bool(result.get("skipped"))
        is_error = bool(result.get("error")) and not is_skipped

        if is_skipped or is_error:
            grading = {"correct_answer": correct_entry["answer"] if correct_entry else None,
                       "points": (correct_entry.get("points") or 2) if correct_entry else 0,
                       "is_correct": False}
        else:
            grading = grade(result["answer"], correct_entry, q.get("choices"))
            n_graded += 1
            if grading["is_correct"]:
                correct_count += 1

        done = i + 1
        elapsed_total = time.time() - run_t0
        avg = elapsed_total / done
        remaining = n_total - done
        eta_sec = int(avg * remaining)
        eta_str = f"{eta_sec // 60}m{eta_sec % 60:02d}s" if eta_sec >= 60 else f"{eta_sec}s"
        pct = done / n_total * 100
        acc = correct_count / max(n_graded, 1) * 100
        if is_skipped:
            print(
                f"⊘ skip                정답:{grading['correct_answer']}  AI:-"
                f"  | {pct:5.1f}% acc:{acc:4.1f}% ETA:{eta_str}",
                flush=True,
            )
        elif is_error:
            print(
                f"⚠ error {result['elapsed_sec']:.1f}s  {str(result['error'])[:70]}"
                f"  | {pct:5.1f}% acc:{acc:4.1f}% ETA:{eta_str}",
                flush=True,
            )
        else:
            mark = "✓" if grading["is_correct"] else "✗"
            print(
                f"{mark} {result['elapsed_sec']:.1f}s  정답:{grading['correct_answer']}  AI:{result['answer']}"
                f"  | {pct:5.1f}% acc:{acc:4.1f}% ETA:{eta_str}",
                flush=True,
            )

        items.append({
            "number": num,
            "section": sec,
            "question": q["question"],
            "choices": q.get("choices", []),
            "image_path": q.get("image_path"),
            "passage_id": q.get("passage_id"),
            **result,
            **grading,
        })
        if done < n_total and not is_skipped:
            time.sleep(0.3)

    summary = summarize_items(items)

    output = {
        "model": model_id,
        "subject": subject,
        "mode": mode,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "summary": summary,
        "items": items,
    }

    subject_dir = RESULTS_DIR / subject
    subject_dir.mkdir(parents=True, exist_ok=True)
    out_path = subject_dir / f"{model_id}_{mode}.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2))

    from solver_viewer import generate_html
    html_path = out_path.with_suffix(".html")
    try:
        generate_html(output, html_path)
    except Exception as e:  # HTML 은 부산물 — 실패해도 다음 과목 실행을 막지 않는다
        print(f"  [warn] HTML 생성 실패: {e}")
        html_path = "(생성 실패)"

    total_min = summary["total_time_sec"] / 60
    extra = ""
    if summary["skipped"]:
        extra += f" (skip {summary['skipped']})"
    if summary["errors"]:
        extra += f" (error {summary['errors']})"
    print(f"\n{'═'*60}")
    print(f"  정답률: {summary['accuracy']}% ({summary['correct']}/{summary['graded_questions']}){extra}")
    print(f"  원점수: {summary['score']}/{summary['max_score']}")
    print(f"  총 시간: {total_min:.1f}분 ({summary['total_time_sec']}s, 평균 {summary['avg_time_sec']}s/문항)")
    print(f"  JSON: {out_path}")
    print(f"  HTML: {html_path}")
    print(f"{'═'*60}\n")
