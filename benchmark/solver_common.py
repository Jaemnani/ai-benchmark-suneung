"""solver_text / solver_image 공용 유틸."""
from __future__ import annotations

import json
import os
import re
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from google import genai

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
ANTHROPIC_API_KEY = os.environ["ANTHROPIC_API_KEY"]
DEFAULT_MODEL = "gemini-2.5-flash-lite"

OUTPUTS = ROOT / "outputs" / "2025"
RESULTS_DIR = ROOT / "benchmark" / "results"

client = genai.Client(api_key=GEMINI_API_KEY)


def is_claude(model: str) -> bool:
    return model.startswith("claude-")


def _claude_client():
    import anthropic
    return anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


_claude_singleton = None


def get_claude():
    global _claude_singleton
    if _claude_singleton is None:
        _claude_singleton = _claude_client()
    return _claude_singleton

CHOICE_MARKS = ["①", "②", "③", "④", "⑤"]

SYSTEM_PROMPT = """\
당신은 한국 수능 시험을 풀고 있습니다.
문제를 주의 깊게 읽고, 단계별로 풀이한 뒤 최종 답을 JSON으로 반환하세요.

■ 5지선다형 반환 형식:
{"reasoning": "풀이과정", "answer": "②", "confidence": {"①": 0.05, "②": 0.80, "③": 0.10, "④": 0.03, "⑤": 0.02}}

■ 단답형 반환 형식:
{"reasoning": "풀이과정", "answer": 14, "confidence": 0.85}

규칙:
- confidence 합은 약 1.0
- answer 는 가장 높은 confidence 의 선택지
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


def parse_response(text: str) -> dict:
    """모델 응답에서 answer + confidence + reasoning 추출."""
    text = (text or "").strip()
    cleaned = re.sub(r"```(?:json)?\s*", "", text)
    cleaned = re.sub(r"```\s*$", "", cleaned).strip()
    cleaned = re.sub(r'(?<!\\)\\([a-zA-Z])', r'\\\\\1', cleaned)

    obj = None
    try:
        obj = json.loads(cleaned)
    except json.JSONDecodeError:
        for m in re.finditer(r'"answer"', cleaned):
            start = cleaned.rfind("{", 0, m.start())
            if start == -1:
                continue
            depth = 0
            for i in range(start, len(cleaned)):
                if cleaned[i] == "{":
                    depth += 1
                elif cleaned[i] == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            obj = json.loads(cleaned[start:i + 1])
                            break
                        except json.JSONDecodeError:
                            break
            if obj:
                break

    if isinstance(obj, dict):
        return {
            "answer": obj.get("answer"),
            "confidence": obj.get("confidence"),
            "reasoning": obj.get("reasoning", ""),
        }
    return {"answer": None, "confidence": None, "reasoning": text}


def grade(ai_answer, correct_entry: dict | None) -> dict:
    if correct_entry is None:
        return {"correct_answer": None, "points": 0, "is_correct": False}
    correct = correct_entry["answer"]
    pts = correct_entry.get("points", 2)
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


def run_benchmark(subject: str, mode: str, model_id: str,
                  solve_fn, limit: int | None = None) -> None:
    """solve_fn(question, paper, model_id) -> dict with answer/confidence/reasoning/elapsed_sec/...
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
    total_score = 0
    max_score = 0
    total_time = 0.0
    n_total = len(questions)
    run_t0 = time.time()

    for i, q in enumerate(questions):
        num = q["number"]
        sec = q.get("section", "공통")
        print(f"  [{i+1:>2}/{n_total}] {sec:<10} {num}번...", end=" ", flush=True)

        result = solve_fn(q, paper, model_id)
        correct_entry = ans_map.get((num, sec))
        grading = grade(result["answer"], correct_entry)

        if grading["is_correct"]:
            correct_count += 1
            total_score += grading["points"]
        max_score += grading["points"]
        total_time += result["elapsed_sec"]

        mark = "✓" if grading["is_correct"] else "✗"
        done = i + 1
        elapsed_total = time.time() - run_t0
        avg = elapsed_total / done
        remaining = n_total - done
        eta_sec = int(avg * remaining)
        eta_str = f"{eta_sec // 60}m{eta_sec % 60:02d}s" if eta_sec >= 60 else f"{eta_sec}s"
        pct = done / n_total * 100
        acc = correct_count / done * 100
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
        time.sleep(0.3)

    summary = {
        "total_questions": n_total,
        "correct": correct_count,
        "score": total_score,
        "max_score": max_score,
        "accuracy": round(correct_count / max(n_total, 1) * 100, 1),
        "total_time_sec": round(total_time, 1),
        "avg_time_sec": round(total_time / max(n_total, 1), 1),
    }

    output = {
        "model": model_id,
        "subject": subject,
        "mode": mode,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "summary": summary,
        "items": items,
    }

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out_path = RESULTS_DIR / f"{model_id}_{subject}_{mode}.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2))

    from solver_viewer import generate_html
    html_path = out_path.with_suffix(".html")
    generate_html(output, html_path)

    total_min = summary["total_time_sec"] / 60
    print(f"\n{'═'*60}")
    print(f"  정답률: {summary['accuracy']}% ({summary['correct']}/{summary['total_questions']})")
    print(f"  원점수: {summary['score']}/{summary['max_score']}")
    print(f"  총 시간: {total_min:.1f}분 ({summary['total_time_sec']}s, 평균 {summary['avg_time_sec']}s/문항)")
    print(f"  JSON: {out_path}")
    print(f"  HTML: {html_path}")
    print(f"{'═'*60}\n")
