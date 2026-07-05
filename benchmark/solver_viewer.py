"""solver.py 결과를 HTML로 렌더링."""
import json
from pathlib import Path

CHOICE_MARKS = ["①", "②", "③", "④", "⑤"]

HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>__TITLE__</title>
<script>
window.MathJax = {
  tex: { inlineMath: [['$','$'],['\\(','\\)']], displayMath: [['$$','$$']] },
  options: { skipHtmlTags: ['script','noscript','style','textarea','pre'] }
};
</script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js" async></script>
<style>
*{box-sizing:border-box}
body{font-family:'Noto Sans KR',sans-serif;max-width:960px;margin:0 auto;padding:20px;background:#f5f5f5;font-size:14px;line-height:1.6}
h1{font-size:1.3rem;border-bottom:2px solid #222;padding-bottom:8px}
.meta{font-size:.8rem;color:#666;margin-bottom:16px}
.summary{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}
.stat{background:#fff;border:1px solid #ddd;border-radius:6px;padding:12px 20px;text-align:center;min-width:100px}
.stat b{font-size:1.4rem;display:block}
.stat.good b{color:#1e7e34}
.stat.bad b{color:#c5221f}
.stat.info b{color:#1a56db}
.filters{margin-bottom:16px;display:flex;gap:6px}
.fbtn{padding:5px 14px;border:1px solid #aaa;border-radius:4px;cursor:pointer;background:#e8e8e8;font-size:.82rem;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08);transition:background .12s,border-color .12s,color .12s,box-shadow .12s,transform .05s}
.fbtn:hover{background:#f3f6ff;border-color:#1a56db;color:#1a56db;box-shadow:0 2px 5px rgba(26,86,219,.18)}
.fbtn:active{transform:translateY(1px);box-shadow:none}
.fbtn.active{background:#fff;color:#1a56db;border-color:#1a56db;box-shadow:inset 0 0 0 1px #1a56db}
.item{background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:16px 18px;margin-bottom:12px}
.item.correct{border-left:4px solid #1e7e34}
.item.wrong{border-left:4px solid #c5221f}
.item-header{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.qnum{font-weight:700;color:#1a56db;min-width:40px}
.badge{font-size:.7rem;padding:2px 8px;border-radius:10px;font-weight:600}
.badge-sec{background:#f0f0f0;color:#555}
.mark{margin-left:auto;font-size:1.1rem;font-weight:700}
.mark.ok{color:#1e7e34}
.mark.ng{color:#c5221f}
.time{font-size:.75rem;color:#888}
.question-text{position:relative;margin:8px 0;color:#333;white-space:pre-wrap;font-size:.9rem;max-height:80px;overflow:hidden;cursor:pointer;border-radius:4px;transition:background .12s}
.question-text.static{cursor:auto}
.question-text:not(.static):hover{background:#f3f6ff}
.question-text:not(.expanded):not(.static)::after{content:"⌄ 펼치기";position:absolute;right:0;bottom:0;font-size:.72rem;font-weight:600;color:#1a56db;background:linear-gradient(90deg,transparent,#fff 30%);padding:0 4px 0 24px}
.question-text.expanded{max-height:none}
.choices{list-style:none;padding:0;margin:8px 0}
.choices li{padding:6px 10px;margin:3px 0;border-radius:4px;display:grid;grid-template-columns:1fr 160px;align-items:center;gap:10px;border:1px solid transparent}
.choices li.correct-choice{background:#e6f4ea;border-color:#81c995}
.choices li.ai-pick{outline:2px solid #1a56db}
.choices li.ai-pick.wrong-pick{outline-color:#c5221f}
.conf-bar{height:12px;background:#f0f0f0;border-radius:3px;overflow:hidden}
.conf-fill{height:100%;background:linear-gradient(90deg,#9cc7ff,#1a56db);border-radius:3px}
.conf-fill.top{background:linear-gradient(90deg,#86e29b,#1e7e34)}
.conf-label{font-size:.7rem;color:#555;text-align:right;font-family:monospace}
.reasoning{background:#fafafa;border:1px solid #eee;border-radius:4px;padding:10px 14px;margin-top:8px;font-size:.82rem;color:#444;white-space:pre-wrap;max-height:120px;overflow:auto}
.ans-row{display:flex;gap:14px;font-size:.85rem;margin-top:8px;padding-top:6px;border-top:1px solid #f0f0f0}
.ans-row b{color:#444}
.short-conf{font-size:.78rem;color:#666;font-family:monospace}
.choices.no-conf li{grid-template-columns:1fr}
.ai-pick-tag{font-size:.72rem;background:#1a56db;color:#fff;padding:2px 10px;border-radius:10px;font-weight:600;justify-self:end}
.item.skipped{border-left:4px solid #aaa;background:#fafafa;opacity:.85}
.item.error{border-left:4px solid #e08b00;background:#fffdf5}
.skipped-msg{color:#666;font-size:.8rem;margin-top:6px;font-style:italic}
.mark.skip{color:#888}
.mark.err{color:#e08b00}
</style>
</head>
<body>
<h1>__TITLE__</h1>
<p class="meta">__META__</p>
<div class="summary">__SUMMARY__</div>
<div class="filters">
  <button class="fbtn active" onclick="setFilter('all',this)">전체</button>
  <button class="fbtn" onclick="setFilter('wrong',this)">오답만</button>
  <button class="fbtn" onclick="setFilter('correct',this)">정답만</button>
</div>
<div id="items">__ITEMS__</div>
<script>
function setFilter(f,btn){
  document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.item').forEach(el=>{
    el.style.display=(f==='all'||el.classList.contains(f))?'':'none';
  });
}
document.querySelectorAll('.question-text').forEach(el=>{
  if(el.scrollHeight<=el.clientHeight){el.classList.add('static');return;}
  el.addEventListener('click',()=>el.classList.toggle('expanded'));
});
</script>
</body>
</html>
"""


def _esc(s):
    if s is None:
        return ""
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _to_float(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _render_item(item: dict) -> str:
    is_skipped = bool(item.get("skipped"))
    is_error = bool(item.get("error")) and not is_skipped
    is_correct = item.get("is_correct", False)
    is_short = not item.get("choices")
    if is_skipped:
        cls = "skipped"
    elif is_error:
        cls = "error"
    else:
        cls = "correct" if is_correct else "wrong"

    html = f'<div class="item {cls}">'
    html += '<div class="item-header">'
    html += f'<span class="qnum">{item["number"]}번</span>'
    sec = item.get("section", "")
    if sec and sec != "공통":
        html += f'<span class="badge badge-sec">{_esc(sec)}</span>'
    pts = item.get("points", 0)
    html += f'<span class="badge" style="background:#f0f4ff;color:#1a56db">{pts}점</span>'
    html += f'<span class="time">{_to_float(item.get("elapsed_sec")):.1f}s</span>'
    if is_skipped:
        html += '<span class="mark skip">⊘</span>'
    elif is_error:
        html += '<span class="mark err">⚠</span>'
    else:
        mark_cls = "ok" if is_correct else "ng"
        mark_txt = "✓" if is_correct else "✗"
        html += f'<span class="mark {mark_cls}">{mark_txt}</span>'
    html += '</div>'

    html += f'<div class="question-text">{_esc(item.get("question", ""))}</div>'

    if not is_short and item.get("choices"):
        conf_raw = item.get("confidence")
        conf = conf_raw if isinstance(conf_raw, dict) else {}
        has_conf = bool(conf)
        ai_ans = item.get("answer")
        correct_ans = item.get("correct_answer")
        ul_cls = "choices" if has_conf else "choices no-conf"
        html += f'<ul class="{ul_cls}">'
        for i, c in enumerate(item["choices"]):
            mark = CHOICE_MARKS[i] if i < 5 else str(i + 1)
            li_cls = []
            if mark == correct_ans:
                li_cls.append("correct-choice")
            if mark == ai_ans:
                li_cls.append("ai-pick")
                if not is_correct:
                    li_cls.append("wrong-pick")
            html += f'<li class="{" ".join(li_cls)}">'
            html += f'<div>{_esc(mark)} {_esc(c)}</div>'
            if has_conf:
                v = _to_float(conf.get(mark, 0))
                pct = max(0, min(100, round(v * 100)))
                fill_cls = "conf-fill top" if mark == ai_ans and is_correct else "conf-fill"
                html += f'<div><div class="conf-bar"><div class="{fill_cls}" style="width:{pct}%"></div></div>'
                html += f'<div class="conf-label">{v*100:.1f}%</div></div>'
            elif mark == ai_ans:
                html += '<span class="ai-pick-tag">AI 선택</span>'
            html += '</li>'
        html += '</ul>'

    html += '<div class="ans-row">'
    html += f'<span><b>정답:</b> {_esc(str(item.get("correct_answer", "")))}</span>'
    html += f'<span><b>AI:</b> {_esc(str(item.get("answer", "")))}</span>'
    if is_short and item.get("confidence") is not None:
        html += f'<span class="short-conf">confidence: {_to_float(item.get("confidence"))*100:.1f}%</span>'
    html += '</div>'

    reasoning = item.get("reasoning", "")
    if reasoning:
        html += f'<div class="reasoning">{_esc(reasoning)}</div>'

    if is_skipped:
        html += f'<div class="skipped-msg">⊘ 풀이 제외: {_esc(item.get("error", "skipped"))}</div>'
    elif item.get("error"):
        html += f'<div style="color:#c5221f;font-size:.8rem;margin-top:6px">⚠ {_esc(item["error"])}</div>'

    html += '</div>'
    return html


def generate_html(data: dict, out_path: Path) -> None:
    summary = data.get("summary", {})
    title = f"AI 수능 — {data.get('model', '?')} / {data.get('subject', '?')} / {data.get('mode', '?')}"
    meta = f"모델: {data.get('model')} · 모드: {data.get('mode')} · {data.get('timestamp', '')}"

    graded = summary.get("graded_questions", summary.get("total_questions", 0))
    skipped = summary.get("skipped", 0)
    errors = summary.get("errors", 0)
    wrong = max(graded - summary.get("correct", 0), 0)
    summary_html = (
        f'<div class="stat info"><b>{summary.get("accuracy", 0)}%</b>정답률</div>'
        f'<div class="stat good"><b>{summary.get("correct", 0)}</b>정답</div>'
        f'<div class="stat bad"><b>{wrong}</b>오답</div>'
    )
    if skipped:
        summary_html += f'<div class="stat"><b>{skipped}</b>제외</div>'
    if errors:
        summary_html += f'<div class="stat"><b>⚠ {errors}</b>오류</div>'
    summary_html += (
        f'<div class="stat info"><b>{summary.get("score", 0)}/{summary.get("max_score", 0)}</b>원점수</div>'
        f'<div class="stat"><b>{summary.get("total_time_sec", 0)}s</b>총 시간</div>'
        f'<div class="stat"><b>{summary.get("avg_time_sec", 0)}s</b>문항 평균</div>'
    )

    items_html = "\n".join(_render_item(item) for item in data.get("items", []))

    html = (HTML_TEMPLATE
            .replace("__TITLE__", _esc(title))
            .replace("__META__", _esc(meta))
            .replace("__SUMMARY__", summary_html)
            .replace("__ITEMS__", items_html))

    out_path.write_text(html, encoding="utf-8")
