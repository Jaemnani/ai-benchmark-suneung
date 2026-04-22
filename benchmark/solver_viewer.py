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
.fbtn{padding:5px 14px;border:1px solid #aaa;border-radius:4px;cursor:pointer;background:#e8e8e8;font-size:.82rem;font-weight:600}
.fbtn.active{background:#fff;color:#1a56db;border-color:#1a56db}
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
.question-text{margin:8px 0;color:#333;white-space:pre-wrap;font-size:.9rem;max-height:80px;overflow:hidden;cursor:pointer}
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
</style>
</head>
<body>
<h1>__TITLE__</h1>
<p class="meta">__META__</p>
<div class="summary">__SUMMARY__</div>
<div class="filters">
  <button class="fbtn active" onclick="filterAll()">전체</button>
  <button class="fbtn" onclick="filterWrong()">오답만</button>
  <button class="fbtn" onclick="filterCorrect()">정답만</button>
</div>
<div id="items">__ITEMS__</div>
<script>
function filterAll(){setFilter('all')}
function filterWrong(){setFilter('wrong')}
function filterCorrect(){setFilter('correct')}
function setFilter(f){
  document.querySelectorAll('.fbtn').forEach(b=>b.classList.remove('active'));
  event.target.classList.add('active');
  document.querySelectorAll('.item').forEach(el=>{
    const ok=el.classList.contains('correct');
    el.style.display=(f==='all'||(f==='correct'&&ok)||(f==='wrong'&&!ok))?'':'none';
  });
}
document.querySelectorAll('.question-text').forEach(el=>{
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


def _render_item(item: dict) -> str:
    is_correct = item.get("is_correct", False)
    is_short = not item.get("choices")
    cls = "correct" if is_correct else "wrong"

    html = f'<div class="item {cls}">'
    html += '<div class="item-header">'
    html += f'<span class="qnum">{item["number"]}번</span>'
    sec = item.get("section", "")
    if sec and sec != "공통":
        html += f'<span class="badge badge-sec">{_esc(sec)}</span>'
    pts = item.get("points", 0)
    html += f'<span class="badge" style="background:#f0f4ff;color:#1a56db">{pts}점</span>'
    html += f'<span class="time">{item.get("elapsed_sec", 0):.1f}s</span>'
    mark_cls = "ok" if is_correct else "ng"
    mark_txt = "✓" if is_correct else "✗"
    html += f'<span class="mark {mark_cls}">{mark_txt}</span>'
    html += '</div>'

    html += f'<div class="question-text">{_esc(item.get("question", ""))}</div>'

    if not is_short and item.get("choices"):
        conf = item.get("confidence") or {}
        ai_ans = item.get("answer")
        correct_ans = item.get("correct_answer")
        html += '<ul class="choices">'
        for i, c in enumerate(item["choices"]):
            mark = CHOICE_MARKS[i] if i < 5 else str(i + 1)
            li_cls = []
            if mark == correct_ans:
                li_cls.append("correct-choice")
            if mark == ai_ans:
                li_cls.append("ai-pick")
                if not is_correct:
                    li_cls.append("wrong-pick")
            v = conf.get(mark, 0) if isinstance(conf, dict) else 0
            pct = max(0, min(100, round(float(v) * 100)))
            fill_cls = "conf-fill top" if mark == ai_ans and is_correct else "conf-fill"
            html += f'<li class="{" ".join(li_cls)}">'
            html += f'<div>{_esc(mark)} {_esc(c)}</div>'
            html += f'<div><div class="conf-bar"><div class="{fill_cls}" style="width:{pct}%"></div></div>'
            html += f'<div class="conf-label">{v*100:.1f}%</div></div>'
            html += '</li>'
        html += '</ul>'

    html += '<div class="ans-row">'
    html += f'<span><b>정답:</b> {_esc(str(item.get("correct_answer", "")))}</span>'
    html += f'<span><b>AI:</b> {_esc(str(item.get("answer", "")))}</span>'
    if is_short and item.get("confidence") is not None:
        html += f'<span class="short-conf">confidence: {float(item.get("confidence", 0))*100:.1f}%</span>'
    html += '</div>'

    reasoning = item.get("reasoning", "")
    if reasoning:
        html += f'<div class="reasoning">{_esc(reasoning)}</div>'

    if item.get("error"):
        html += f'<div style="color:#c5221f;font-size:.8rem;margin-top:6px">⚠ {_esc(item["error"])}</div>'

    html += '</div>'
    return html


def generate_html(data: dict, out_path: Path) -> None:
    summary = data.get("summary", {})
    title = f"AI 수능 — {data.get('model', '?')} / {data.get('subject', '?')} / {data.get('mode', '?')}"
    meta = f"모델: {data.get('model')} · 모드: {data.get('mode')} · {data.get('timestamp', '')}"

    summary_html = (
        f'<div class="stat info"><b>{summary.get("accuracy", 0)}%</b>정답률</div>'
        f'<div class="stat good"><b>{summary.get("correct", 0)}</b>정답</div>'
        f'<div class="stat bad"><b>{summary.get("total_questions", 0) - summary.get("correct", 0)}</b>오답</div>'
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
