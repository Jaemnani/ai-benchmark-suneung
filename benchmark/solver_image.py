"""수능 문제를 **문항/지문 이미지** 로 풀이.

자유 풀이 + 정답 추출 방식:
  - 모델은 자유롭게 풀이 작성
  - 마지막 줄에 `정답: ②` / `정답: 14` 형식으로 명시
  - 파서가 응답에서 추출

사용법:
  python solver_image.py --subject 수학
  python solver_image.py --subject 수학 --limit 3
  python solver_image.py --subject 수학 --model gemini-2.5-flash
"""
from __future__ import annotations

import argparse
import base64
import re
import time

from solver_common import (
    CHOICE_MARKS, DEFAULT_MODEL,
    client, get_claude, is_claude, load_image_bytes, run_benchmark,
)

IMAGE_SYSTEM_PROMPT = """\
당신은 한국 수능 시험을 풀고 있습니다.
주어진 문항 이미지를 보고 자유롭게 단계별로 풀이하세요.

풀이 후 **마지막 줄**에 반드시 아래 형식으로 정답만 명시하세요:
  - 5지선다형: `정답: ②`  (①, ②, ③, ④, ⑤ 중 하나)
  - 단답형: `정답: 14`  (정수)

그 외 형식 제한 없음. 풀이는 한국어로 자유롭게.
"""


def _build_contents(question: dict, paper: dict) -> list:
    contents: list = []
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
    contents.append(
        f"위 이미지는 수능 수학 문항입니다({hint}). "
        f"자유롭게 풀이한 뒤 마지막 줄에 `정답: ...` 형식으로 답을 적어주세요."
    )
    return contents


_ANSWER_LINE_RE = re.compile(r"(?mi)^\s*\**\s*(?:최종\s*)?(?:정)?답\s*[:：]\s*(.+?)\s*\**\s*$")
_DIGIT_TO_MARK = dict(zip("12345", CHOICE_MARKS))


def _extract_answer(text: str, is_short: bool):
    """자유 풀이 응답에서 최종 정답 추출.
    - is_short=True: 정수 반환 (없으면 None)
    - False: ①②③④⑤ 중 하나 반환 (없으면 None)
    """
    if not text:
        return None
    matches = list(_ANSWER_LINE_RE.finditer(text))
    payloads = [m.group(1) for m in matches] if matches else []
    # fallback: 응답 마지막 2줄
    if not payloads:
        tail = "\n".join(text.strip().splitlines()[-2:])
        payloads = [tail]

    for payload in reversed(payloads):
        if is_short:
            m = re.search(r"-?\d+", payload)
            if m:
                try:
                    return int(m.group())
                except ValueError:
                    continue
        else:
            m = re.search(r"[①②③④⑤]", payload)
            if m:
                return m.group()
            m = re.search(r"\b([1-5])\b", payload)
            if m:
                return _DIGIT_TO_MARK[m.group(1)]
    # 전체 텍스트에서 마지막 매치
    if is_short:
        nums = re.findall(r"-?\d+", text)
        if nums:
            try:
                return int(nums[-1])
            except ValueError:
                return None
    else:
        marks = re.findall(r"[①②③④⑤]", text)
        if marks:
            return marks[-1]
    return None


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


def _solve_gemini(question: dict, paper: dict, model: str, is_short: bool):
    contents = _build_contents(question, paper)
    resp = client.models.generate_content(
        model=model,
        contents=[IMAGE_SYSTEM_PROMPT] + contents,
    )
    text = (resp.text or "").strip()
    usage = getattr(resp, "usage_metadata", None)
    return text, (
        getattr(usage, "prompt_token_count", 0) if usage else 0,
        getattr(usage, "candidates_token_count", 0) if usage else 0,
    )


def _solve_claude(question: dict, paper: dict, model: str, is_short: bool):
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
            f"위 이미지는 수능 수학 문항입니다({hint}). "
            f"자유롭게 풀이한 뒤 마지막 줄에 `정답: ...` 형식으로 답을 적어주세요."
        ),
    })
    resp = get_claude().messages.create(
        model=model,
        max_tokens=4096,
        system=IMAGE_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    text = "".join(
        b.text for b in resp.content if getattr(b, "type", None) == "text"
    ).strip()
    return text, (resp.usage.input_tokens, resp.usage.output_tokens)


def solve_image(question: dict, paper: dict, model: str) -> dict:
    t0 = time.time()
    is_short = not question.get("choices")
    try:
        if is_claude(model):
            text, (in_tok, out_tok) = _solve_claude(question, paper, model, is_short)
        else:
            text, (in_tok, out_tok) = _solve_gemini(question, paper, model, is_short)
        elapsed = time.time() - t0
        answer = _extract_answer(text, is_short)
        return {
            "answer": answer,
            "confidence": None,
            "reasoning": text,
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


def main():
    ap = argparse.ArgumentParser(description="AI 수능 풀이 (image 모드, 자유풀이)")
    ap.add_argument("--subject", default="수학")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    run_benchmark(args.subject, "image", args.model, solve_image, args.limit)


if __name__ == "__main__":
    main()
