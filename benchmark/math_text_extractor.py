"""
문항 텍스트를 Gemini Vision으로 재추출.
PyMuPDF 가 CID 폰트(수식·화학식·그리스 문자·도표 라벨 등)를 PUA 영역으로
잘못 추출하는 모든 과목에 사용 가능합니다.

사용법:
  python math_text_extractor.py                     # 수학
  python math_text_extractor.py --subject 과학탐구_물리학Ⅰ
  python math_text_extractor.py --subject all       # outputs/2025 전체
"""
from __future__ import annotations

import argparse
import json
import os
import re
import time
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
MODEL = "gemini-2.5-flash"
OUTPUTS = ROOT / "outputs" / "2025"

client = genai.Client(api_key=GEMINI_API_KEY)


def _subject_label(subject: str) -> str:
    if "_" in subject:
        category, name = subject.split("_", 1)
        return f"{category} {name}"
    return subject


def _build_prompt(subject: str) -> str:
    return f"""\
이 이미지는 수능 {_subject_label(subject)} 문항입니다.
문제 본문과 선택지를 **정확하게** 추출해 JSON 으로 반환하세요.

규칙:
- 수식은 LaTeX 인라인 ($...$) 으로 표기
- 화학식·그리스 문자·아래첨자/위첨자·단위·화살표 등 특수 기호도 원문 그대로 정확히
- 문제 번호("N.")와 배점("[N점]")은 제외
- 조건, 보기(<보기>), 그래프/도표 설명은 question 에 포함
- 원문 그대로, 요약하지 말 것
- 선택지(①~⑤)가 보이면 choices 배열에 순서대로 5개. 번호 기호(①②③④⑤)는 제거하고 내용만
- 선택지가 없는 단답형(주관식)이면 choices 는 빈 배열 []

반환 형식 (JSON only, 다른 텍스트 금지):
{{"question": "...", "choices": ["...", "...", "...", "...", "..."]}}
"""

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)
_VALID_ESCAPE = set('"\\/bfnrtu')


def _fix_bad_escapes(s: str) -> str:
    """LaTeX `\\{`, `\\sum` 등 JSON 표준이 아닌 단일 backslash 를 `\\\\` 로 보정.
    이미 valid 한 `\\\\X` 시퀀스는 한 쌍씩 건너뛰어 손상시키지 않는다."""
    out: list[str] = []
    i = 0
    n = len(s)
    while i < n:
        c = s[i]
        if c == "\\" and i + 1 < n:
            nxt = s[i + 1]
            if nxt in _VALID_ESCAPE:
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


def _parse_response(text: str) -> tuple[str, list[str]] | None:
    cleaned = _JSON_FENCE_RE.sub("", text).strip()
    try:
        obj = json.loads(cleaned)
    except json.JSONDecodeError:
        try:
            obj = json.loads(_fix_bad_escapes(cleaned))
        except json.JSONDecodeError:
            return None
    q = obj.get("question")
    ch = obj.get("choices")
    if not isinstance(q, str) or not isinstance(ch, list):
        return None
    return q.strip(), [str(c).strip() for c in ch]


def extract_question_text(img_path: Path, prompt: str) -> tuple[str, list[str]] | None:
    img_bytes = img_path.read_bytes()
    contents = [
        types.Part.from_bytes(data=img_bytes, mime_type="image/png"),
        prompt,
    ]
    config = types.GenerateContentConfig(response_mime_type="application/json")
    for attempt in range(3):
        try:
            resp = client.models.generate_content(
                model=MODEL, contents=contents, config=config
            )
            parsed = _parse_response(resp.text or "")
            if parsed is not None:
                return parsed
            if attempt < 2:
                time.sleep(1)
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
            else:
                print(f"    [ERROR] {e}")
                return None
    return None


def process_subject(subject: str) -> None:
    json_path = OUTPUTS / f"{subject}.json"
    if not json_path.exists():
        print(f"[{subject}] JSON 없음 — skip")
        return
    data = json.loads(json_path.read_text())
    questions = data["questions"]
    prompt = _build_prompt(subject)

    print(f"\n{'━'*55}")
    print(f" {subject} 문항 텍스트 재추출 ({MODEL})")
    print(f" 문항: {len(questions)}개")
    print(f"{'━'*55}")

    updated = 0
    for q in questions:
        num = q["number"]
        sec = q.get("section", "공통")
        img_rel = q.get("image_path", "")
        img_path = OUTPUTS / img_rel
        if not img_path.exists():
            print(f"  Q{num}: 이미지 없음")
            continue

        print(f"  Q{num:>2} ({sec})...", end=" ", flush=True)
        result = extract_question_text(img_path, prompt)
        if result is not None:
            new_text, new_choices = result
            q["question"] = new_text
            q["choices"] = new_choices
            q["text_source"] = "gemini_vision"
            updated += 1
            print(f"✓ {len(new_text)}자 / choices={len(new_choices)}")
        else:
            print("✗")
        time.sleep(0.3)

    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"\n  → {updated}/{len(questions)} 업데이트")
    print(f"  → {json_path}")
    print(f"{'━'*55}\n")


def _all_subjects() -> list[str]:
    return sorted(p.stem for p in OUTPUTS.glob("*.json") if not p.stem.startswith("_"))


def main():
    ap = argparse.ArgumentParser(description="문항 텍스트 Vision 재추출")
    ap.add_argument("--subject", default="수학",
                    help="과목명 또는 'all' (outputs/2025 전체)")
    args = ap.parse_args()

    subjects = _all_subjects() if args.subject == "all" else [args.subject]
    for subj in subjects:
        process_subject(subj)


if __name__ == "__main__":
    main()
