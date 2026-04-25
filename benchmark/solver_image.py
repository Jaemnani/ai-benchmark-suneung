"""수능 문제를 **문항/지문 이미지** 로 풀이.

JSON 반환 방식 (text 모드와 동일 스키마):
  - 5지선다: {"reasoning": ..., "answer": "②", "confidence": {"①": 0.05, ...}}
  - 단답형: {"reasoning": ..., "answer": 14, "confidence": 0.85}

사용법:
  python solver_image.py --subject 수학
  python solver_image.py --subject 수학 --limit 3
  python solver_image.py --subject 수학 --model gemini-2.5-flash
  python solver_image.py --subject all --model claude-haiku-4-5
"""
from __future__ import annotations

import argparse
import base64
import time

from solver_common import (
    DEFAULT_MODEL, OUTPUTS, SYSTEM_PROMPT,
    client, get_claude, is_claude, load_image_bytes, parse_response, run_benchmark,
)

SUBJECT_LABEL = {"국어", "영어", "수학"}
LISTENING_DIR = OUTPUTS.parent.parent / "raw_datas" / "2025" / "영어영역듣기평가음원"


def _subject_label(subject: str) -> str:
    if subject in SUBJECT_LABEL:
        return subject
    if "_" in subject:
        category, name = subject.split("_", 1)
        return f"{category}({name})"
    return subject


def is_audio_capable(model: str) -> bool:
    """오디오 입력을 지원하는 모델인지. Gemini는 지원, Claude·기타는 미지원."""
    return model.startswith("gemini-")


def _listening_audio_path(number: int):
    """영어 듣기 문항 번호 → mp3 경로 (16,17은 공유 파일). 없으면 None."""
    if not (1 <= number <= 17):
        return None
    fname = "16_문제 16~17.mp3" if number in (16, 17) else None
    if fname is None:
        # 파일명 표기가 "NN_문제 NN.mp3" / "NN_문제_NN.mp3" 두 가지 혼재
        for sep in (" ", "_"):
            cand = LISTENING_DIR / f"{number:02d}_문제{sep}{number:02d}.mp3"
            if cand.exists():
                return cand
        return None
    cand = LISTENING_DIR / fname
    return cand if cand.exists() else None


def _build_contents(question: dict, paper: dict, subject: str) -> list:
    contents: list = []
    audio_path = _listening_audio_path(question["number"]) if subject == "영어" else None
    if audio_path is not None:
        contents.append({
            "inline_data": {
                "mime_type": "audio/mpeg",
                "data": audio_path.read_bytes(),
            }
        })
    pid = question.get("passage_id")
    if pid:
        for p in paper.get("passages", []):
            if p["id"] == pid:
                for img_path in p.get("image_paths", []):
                    try:
                        contents.append({
                            "inline_data": {
                                "mime_type": "image/png",
                                "data": load_image_bytes(img_path),
                            }
                        })
                    except FileNotFoundError:
                        pass
                break
    if question.get("image_path"):
        try:
            contents.append({
                "inline_data": {
                    "mime_type": "image/png",
                    "data": load_image_bytes(question["image_path"]),
                }
            })
        except FileNotFoundError:
            pass
    is_short = not question.get("choices")
    hint = "단답형(정수)" if is_short else "5지선다"
    audio_hint = " (오디오는 듣기평가 음원입니다)" if audio_path is not None else ""
    contents.append(
        f"위 자료는 수능 {_subject_label(subject)} 문항입니다({hint}){audio_hint}. "
        f"시스템 지시에 따라 JSON 한 객체만 반환하세요."
    )
    return contents


def _gather_images(question: dict, paper: dict) -> list[bytes]:
    imgs: list[bytes] = []
    pid = question.get("passage_id")
    if pid:
        for p in paper.get("passages", []):
            if p["id"] == pid:
                for img_path in p.get("image_paths", []):
                    try:
                        imgs.append(load_image_bytes(img_path))
                    except FileNotFoundError:
                        pass
                break
    if question.get("image_path"):
        try:
            imgs.append(load_image_bytes(question["image_path"]))
        except FileNotFoundError:
            pass
    return imgs


def _solve_gemini(question: dict, paper: dict, model: str, subject: str):
    contents = _build_contents(question, paper, subject)
    resp = client.models.generate_content(
        model=model,
        contents=[SYSTEM_PROMPT] + contents,
    )
    text = (resp.text or "").strip()
    usage = getattr(resp, "usage_metadata", None)
    return text, (
        getattr(usage, "prompt_token_count", 0) if usage else 0,
        getattr(usage, "candidates_token_count", 0) if usage else 0,
    )


def _solve_claude(question: dict, paper: dict, model: str, subject: str, is_short: bool):
    imgs = _gather_images(question, paper)
    hint = "단답형(정수)" if is_short else "5지선다"
    user_content: list = []
    for b in imgs:
        user_content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": base64.standard_b64encode(b).decode(),
            },
        })
    user_content.append({
        "type": "text",
        "text": (
            f"위 이미지는 수능 {_subject_label(subject)} 문항입니다({hint}). "
            f"시스템 지시에 따라 JSON 한 객체만 반환하세요."
        ),
    })
    resp = get_claude().messages.create(
        model=model,
        max_tokens=8192,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    text = "".join(
        b.text for b in resp.content if getattr(b, "type", None) == "text"
    ).strip()
    return text, (resp.usage.input_tokens, resp.usage.output_tokens)


def solve_image(question: dict, paper: dict, model: str, subject: str) -> dict:
    t0 = time.time()
    is_short = not question.get("choices")
    needs_audio = subject == "영어" and 1 <= question["number"] <= 17
    if needs_audio and not is_audio_capable(model):
        return {
            "answer": None, "confidence": None, "reasoning": "",
            "elapsed_sec": 0.0, "input_tokens": 0, "output_tokens": 0,
            "error": "skipped: model does not support audio input (영어 듣기)",
            "skipped": True,
        }
    try:
        if is_claude(model):
            text, (in_tok, out_tok) = _solve_claude(question, paper, model, subject, is_short)
        else:
            text, (in_tok, out_tok) = _solve_gemini(question, paper, model, subject)
        elapsed = time.time() - t0
        parsed = parse_response(text)
        return {
            **parsed,
            "elapsed_sec": round(elapsed, 2),
            "input_tokens": in_tok,
            "output_tokens": out_tok,
            "error": None,
        }
    except Exception as e:
        return {
            "answer": None, "confidence": None, "reasoning": "",
            "elapsed_sec": round(time.time() - t0, 2),
            "input_tokens": 0, "output_tokens": 0,
            "error": str(e),
        }


def _all_subjects() -> list[str]:
    return sorted(p.stem for p in OUTPUTS.glob("*.json") if not p.stem.startswith("_"))


def main():
    ap = argparse.ArgumentParser(description="AI 수능 풀이 (image 모드, 자유풀이)")
    ap.add_argument("--subject", default="수학",
                    help="과목명 또는 'all' (outputs/2025 전체)")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()

    if args.subject == "all":
        subjects = _all_subjects()
        print(f"\n▶ 전체 {len(subjects)}개 과목 실행: {subjects}")
    else:
        subjects = [args.subject]

    for subj in subjects:
        run_benchmark(subj, "image", args.model, solve_image, args.limit)


if __name__ == "__main__":
    main()
