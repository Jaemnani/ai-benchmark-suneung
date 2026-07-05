# AI-benchmark-suneung

## Tagline-ko
2025 수능을 구조화 JSON으로 파싱하고, Claude·Gemini 등 멀티 AI가 이미지 모드로 문제를 푸는 과정을 과목별로 벤치마크하는 정적 대시보드.

## Tagline-en
Parses the 2025 Korean SAT (수능) into structured JSON, then benchmarks multiple AI models solving it in image mode — with a leaderboard dashboard.

## Tagline-ja
2025年大学修学能力試験（韓国版SAT）を構造化JSONに解析し、複数のAIが画像モードで解く性能を科目別にベンチマークする静的ダッシュボード。

## 프로젝트 개요
2025학년도 수능 PDF(국어·수학·영어·과학탐구 8과목·사회탐구 9과목)를 문항 단위 구조화 JSON과 문제별 이미지로 파싱하는 파서 파이프라인과, 그 문항을 Claude Haiku 4.5·Gemini 2.5 Flash/Flash-Lite 등 여러 모델이 **이미지 모드(신뢰도 포함)** 로 풀어 채점하는 벤치마크 러너로 구성됩니다. 영어 듣기(1~17번)는 오디오 입력을 지원하는 모델만 음원과 함께 풀고, 미지원 모델은 자동으로 제외 처리합니다. 각 실행은 과목별 자기완결형 HTML 리포트(MathJax 렌더링, 이미지 의존성 없음)와 정답·신뢰도·소요시간·토큰 사용량을 담은 JSON으로 남으며, 이를 집계해 모델·과목·모드별 정확도/원점수/제외/평균시간을 정렬·필터링할 수 있는 Next.js 정적(export) 리더보드 대시보드(`web/`)로 제공합니다. Vercel 정적 호스팅으로 호스팅 비용은 0에 가깝습니다.

## Summary-en
A pipeline that parses the 2025 Korean SAT PDFs into per-question structured JSON plus per-question images, then benchmarks multiple AI models (Claude Haiku 4.5, Gemini 2.5 Flash / Flash-Lite) solving each question in image mode with confidence scores. English listening items (1–17) are solved with the audio source only by audio-capable models; others are skipped automatically. Every run produces a self-contained per-subject HTML report (MathJax, zero image dependencies) and a JSON of answers, confidence, latency, and token usage. A statically exported Next.js dashboard (`web/`) aggregates these into a sortable, filterable leaderboard across model × subject × mode, deployed on Vercel at near-zero cost.

## Summary-ja
2025年大学修学能力試験のPDFを問題単位の構造化JSONと画像に解析し、複数のAIモデル（Claude Haiku 4.5、Gemini 2.5 Flash / Flash-Lite）が画像モードで信頼度付きに解答する性能をベンチマークします。英語リスニング（1〜17番）は音声入力対応モデルのみ音源とともに解き、非対応モデルは自動的に除外します。各実行は自己完結型の科目別HTMLレポート（MathJax、画像依存なし）と、解答・信頼度・処理時間・トークン使用量を含むJSONを生成。これらを集約し、モデル×科目×モードで並べ替え・絞り込み可能なリーダーボードをNext.jsの静的エクスポート（`web/`）で構築し、Vercel上でほぼゼロコストに運用します。

---

## 디렉터리 구조

| 경로 | 설명 |
| --- | --- |
| `parser/` | 수능 PDF → 문항 단위 구조화 JSON + 문제 이미지 파싱 파이프라인 |
| `benchmark/` | AI 풀이 러너(`solver_image.py`/`solver_text.py`)·채점·HTML 리포트(`solver_viewer.py`)·결과(`results/`) |
| `web/` | 결과를 집계해 보여주는 Next.js 정적 리더보드 대시보드 |
| `outputs/` | 파싱 산출물(과목별 JSON·정답표·문항 이미지) — git 추적 (벤치마크 재현용) |
| `raw_datas/` | 원본 수능 PDF·영어 듣기 음원 |

## 웹 대시보드 (`web/`)

`benchmark/results/`의 결과를 모델·과목·모드별 리더보드로 보여주는 Next.js 정적 사이트입니다.

```bash
cd web
npm install
npm run dev        # http://localhost:3000 (predev 가 결과 동기화 자동 실행)
npm run build      # web/out/ 으로 정적 export
```

- `npm run sync` — `benchmark/results/`를 스캔해 `web/data/results.json` 매니페스트 생성 + 상세 HTML을 `web/public/results/`로 복사. `dev`/`build` 전 자동 실행됩니다.
- 새 벤치마크를 돌린 뒤에는 `npm run sync` 후 `web/data`·`web/public/results`를 커밋하면 됩니다.

### 배포 (Vercel)

1. Vercel 프로젝트의 **Root Directory** 를 `web` 로 설정.
2. 프레임워크 Next.js 자동 감지(`output: 'export'` → `out/`). `web/vercel.json` 에 명시되어 있습니다.
3. 커밋된 `web/data/results.json`·`web/public/results/`로 빌드되므로 상위 디렉터리 접근이 필요 없습니다.
