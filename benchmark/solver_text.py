"""수능 문제를 **텍스트 JSON** 으로 풀이.

사용법:
  python solver_text.py --subject 수학
  python solver_text.py --subject 수학 --limit 3
  python solver_text.py --subject 수학 --model gemini-2.5-flash
"""
from __future__ import annotations

import argparse
import time

from solver_common import (
    CHOICE_MARKS, DEFAULT_MODEL, SYSTEM_PROMPT,
    client, parse_response, run_benchmark,
)


def _build_prompt(question: dict, passage_text: str = "") -> str:
    parts = []
    num = question["number"]
    sec = question.get("section", "")
    if sec and sec != "공통":
        parts.append(f"[{sec}]")
    parts.append(f"{num}번 문제:")
    parts.append(question["question"])
    if question.get("choices"):
        parts.append("\n선택지:")
        for i, c in enumerate(question["choices"]):
            parts.append(f"  {CHOICE_MARKS[i]} {c}")
    else:
        parts.append("\n(단답형 — 정수로 답하세요)")
    if passage_text:
        parts.insert(0, f"[지문]\n{passage_text}\n")
    return "\n".join(parts)


def solve_text(question: dict, paper: dict, model: str) -> dict:
    t0 = time.time()
    try:
        passage_text = ""
        pid = question.get("passage_id")
        if pid:
            for p in paper.get("passages", []):
                if p["id"] == pid:
                    passage_text = p.get("text", "")
                    break
        prompt = _build_prompt(question, passage_text)
        resp = client.models.generate_content(
            model=model,
            contents=[SYSTEM_PROMPT + "\n\n" + prompt],
        )
        elapsed = time.time() - t0
        parsed = parse_response(resp.text)
        usage = getattr(resp, "usage_metadata", None)
        return {
            **parsed,
            "elapsed_sec": round(elapsed, 2),
            "input_tokens": getattr(usage, "prompt_token_count", 0) if usage else 0,
            "output_tokens": getattr(usage, "candidates_token_count", 0) if usage else 0,
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
    ap = argparse.ArgumentParser(description="AI 수능 풀이 (text 모드)")
    ap.add_argument("--subject", default="수학")
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--limit", type=int, default=None)
    args = ap.parse_args()
    run_benchmark(args.subject, "text", args.model, solve_text, args.limit)


if __name__ == "__main__":
    main()
