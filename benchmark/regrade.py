"""benchmark/results/ 의 기존 결과를 현재 파서·채점 규칙으로 재채점.

용도:
- 구버전 parse_response 가 놓친 answer 를 reasoning(원문 응답)에서 복구
- API error 항목을 채점 대상에서 제외 (skipped 와 동일하게 분모에서 빠짐)
- 객관식에 선택지 '내용'으로 답한 경우 기호로 환산해 채점
- summary 재계산 + HTML 리포트 재생성

API 키 불필요 (로컬 데이터만 처리).

사용법:
  python regrade.py            # 전체 결과 재채점
  python regrade.py --dry-run  # 변경 사항만 출력
"""
from __future__ import annotations

import argparse
import json

from solver_common import RESULTS_DIR, grade, parse_response, summarize_items
from solver_viewer import generate_html


def regrade_file(path, dry_run: bool = False) -> bool:
    data = json.loads(path.read_text())
    recovered = 0
    changed_grades = 0

    for item in data.get("items", []):
        is_skipped = bool(item.get("skipped"))
        is_error = bool(item.get("error")) and not is_skipped

        # 1) 구버전 파서가 answer 를 못 뽑은 항목 → 원문(reasoning)에서 재추출
        if (not is_skipped and not is_error
                and item.get("answer") is None and item.get("reasoning")):
            parsed = parse_response(item["reasoning"])
            if parsed["answer"] is not None:
                item["answer"] = parsed["answer"]
                item["confidence"] = parsed["confidence"]
                if parsed["reasoning"]:
                    item["reasoning"] = parsed["reasoning"]
                recovered += 1

        # 2) 재채점 (항목에 저장된 정답·배점 사용)
        if is_skipped or is_error:
            new_grading = {
                "correct_answer": item.get("correct_answer"),
                "points": item.get("points", 0),
                "is_correct": False,
            }
        else:
            entry = None
            if item.get("correct_answer") is not None:
                entry = {"answer": item["correct_answer"], "points": item.get("points")}
            new_grading = grade(item.get("answer"), entry, item.get("choices"))
        if item.get("is_correct") != new_grading["is_correct"]:
            changed_grades += 1
        item.update(new_grading)

    old_summary = data.get("summary", {})
    new_summary = summarize_items(data.get("items", []))
    summary_changed = old_summary != new_summary
    data["summary"] = new_summary

    rel = path.relative_to(RESULTS_DIR)
    if not (recovered or changed_grades or summary_changed):
        print(f"  {rel}: 변경 없음")
        return False

    print(f"  {rel}: answer 복구 {recovered}건, 채점 변경 {changed_grades}건, "
          f"정답률 {old_summary.get('accuracy')}% → {new_summary['accuracy']}% "
          f"({new_summary['correct']}/{new_summary['graded_questions']}"
          f"{', 오류 ' + str(new_summary['errors']) if new_summary['errors'] else ''})")
    if dry_run:
        return True

    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    generate_html(data, path.with_suffix(".html"))
    return True


def main():
    ap = argparse.ArgumentParser(description="벤치마크 결과 재채점")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    files = sorted(RESULTS_DIR.rglob("*.json"))
    print(f"재채점 대상: {len(files)}개 파일{' (dry-run)' if args.dry_run else ''}")
    changed = sum(regrade_file(p, args.dry_run) for p in files)
    print(f"완료: {changed}개 파일 변경")


if __name__ == "__main__":
    main()
