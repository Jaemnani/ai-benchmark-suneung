// 빌드타임 데이터 인제스트: benchmark/results/ 스캔 → 정규화 → 슬러그화 →
// 상세 HTML을 public/results/ 로 복사 → data/results.json 매니페스트 작성.
// Node 내장 모듈만 사용 (무의존). npm predev/prebuild 훅에서 실행.
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = resolve(__dirname, '..');
const RESULTS_DIR = resolve(WEB_ROOT, '../benchmark/results');
const DATA_OUT = join(WEB_ROOT, 'data', 'results.json');
const PUBLIC_OUT = join(WEB_ROOT, 'public', 'results');

// 과목명 → ASCII 슬러그 (폐집합 20개). category 경계는 '__' 로 보존.
const SUBJECT_SLUG = {
  '국어': 'gugeo',
  '수학': 'suhak',
  '영어': 'yeongeo',
  '과학탐구_물리학Ⅰ': 'gwahak__mullihak-1',
  '과학탐구_물리학Ⅱ': 'gwahak__mullihak-2',
  '과학탐구_생명과학Ⅰ': 'gwahak__saengmyeong-1',
  '과학탐구_생명과학Ⅱ': 'gwahak__saengmyeong-2',
  '과학탐구_지구과학Ⅰ': 'gwahak__jigu-1',
  '과학탐구_지구과학Ⅱ': 'gwahak__jigu-2',
  '과학탐구_화학Ⅰ': 'gwahak__hwahak-1',
  '과학탐구_화학Ⅱ': 'gwahak__hwahak-2',
  '사회탐구_경제': 'sahoe__gyeongje',
  '사회탐구_동아시아사': 'sahoe__dongasiasa',
  '사회탐구_사회·문화': 'sahoe__sahoe-munhwa',
  '사회탐구_생활과 윤리': 'sahoe__saenghwal-yulli',
  '사회탐구_세계사': 'sahoe__segyesa',
  '사회탐구_세계지리': 'sahoe__segyejiri',
  '사회탐구_윤리와 사상': 'sahoe__yulli-sasang',
  '사회탐구_정치와 법': 'sahoe__jeongchi-beop',
  '사회탐구_한국지리': 'sahoe__hanguk-jiri',
};

function categoryOf(subject) {
  return subject.includes('_') ? subject.split('_', 1)[0] : subject;
}

function subjectShortOf(subject) {
  const i = subject.indexOf('_');
  return i === -1 ? subject : subject.slice(i + 1);
}

// 구·신 summary 스키마를 단일 형태로 정규화. 'graded_questions' 키 존재로 분기.
function normalizeSummary(s) {
  const total = s.total_questions ?? 0;
  return {
    totalQuestions: total,
    gradedQuestions: s.graded_questions ?? total,
    skipped: s.skipped ?? 0,
    correct: s.correct ?? 0,
    score: s.score ?? 0,
    maxScore: s.max_score ?? 0,
    accuracy: s.accuracy ?? 0,
    totalTimeSec: s.total_time_sec ?? 0,
    avgTimeSec: s.avg_time_sec ?? 0,
  };
}

function listJsonFiles(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listJsonFiles(p));
    else if (ent.isFile() && ent.name.endsWith('.json')) out.push(p);
  }
  return out;
}

function main() {
  // 부모 디렉터리(benchmark/results)가 없으면(예: Vercel 빌드) 커밋된 매니페스트로 대체.
  if (!existsSync(RESULTS_DIR)) {
    if (existsSync(DATA_OUT)) {
      console.log(`[sync] ${RESULTS_DIR} 없음 — 커밋된 매니페스트(${DATA_OUT}) 사용.`);
      return;
    }
    throw new Error(`[sync] 결과 디렉터리 없음: ${RESULTS_DIR} (커밋된 매니페스트도 없음)`);
  }

  // public/results 클린 재생성 (삭제된 결과가 남지 않도록).
  rmSync(PUBLIC_OUT, { recursive: true, force: true });
  mkdirSync(PUBLIC_OUT, { recursive: true });
  mkdirSync(dirname(DATA_OUT), { recursive: true });

  const rows = [];
  const unknownSubjects = new Set();

  for (const jsonPath of listJsonFiles(RESULTS_DIR)) {
    let data;
    try {
      data = JSON.parse(readFileSync(jsonPath, 'utf8'));
    } catch (e) {
      console.warn(`[sync] JSON 파싱 실패, 건너뜀: ${jsonPath} (${e.message})`);
      continue;
    }
    const { model, subject, mode, timestamp, summary } = data;
    if (!model || !subject || !mode || !summary) {
      console.warn(`[sync] 필수 필드 누락, 건너뜀: ${jsonPath}`);
      continue;
    }

    const subjectSlug = SUBJECT_SLUG[subject];
    if (!subjectSlug) {
      unknownSubjects.add(subject);
      continue;
    }

    // 형제 HTML 복사
    const htmlSrc = jsonPath.replace(/\.json$/, '.html');
    let detailHref = null;
    if (existsSync(htmlSrc)) {
      const destDir = join(PUBLIC_OUT, subjectSlug);
      mkdirSync(destDir, { recursive: true });
      const destName = `${model}_${mode}.html`;
      copyFileSync(htmlSrc, join(destDir, destName));
      detailHref = `/results/${subjectSlug}/${destName}`;
    } else {
      console.warn(`[sync] 상세 HTML 없음: ${htmlSrc}`);
    }

    rows.push({
      subject,
      subjectSlug,
      subjectShort: subjectShortOf(subject),
      category: categoryOf(subject),
      model,
      mode,
      timestamp: timestamp ?? null,
      ...normalizeSummary(summary),
      detailHref,
    });
  }

  if (unknownSubjects.size > 0) {
    throw new Error(
      `[sync] SUBJECT_SLUG 표에 없는 과목 발견: ${[...unknownSubjects].join(', ')}\n` +
      `  → scripts/sync-results.mjs 의 SUBJECT_SLUG 에 추가하세요.`
    );
  }

  // 안정적 diff 를 위한 정렬
  rows.sort((a, b) =>
    a.category.localeCompare(b.category, 'ko') ||
    a.subject.localeCompare(b.subject, 'ko') ||
    a.model.localeCompare(b.model) ||
    a.mode.localeCompare(b.mode)
  );

  const models = [...new Set(rows.map((r) => r.model))].sort();
  const categories = [...new Set(rows.map((r) => r.category))];
  const subjects = [...new Set(rows.map((r) => r.subject))];
  const modes = [...new Set(rows.map((r) => r.mode))].sort();

  const manifest = {
    generatedAt: new Date().toISOString(),
    models,
    categories,
    subjects,
    modes,
    rows,
  };

  writeFileSync(DATA_OUT, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`[sync] ${rows.length}개 결과 처리 완료`);
  console.log(`[sync]   모델(${models.length}): ${models.join(', ')}`);
  console.log(`[sync]   과목(${subjects.length}), 모드(${modes.length}): ${modes.join(', ')}`);
  console.log(`[sync]   매니페스트 → ${DATA_OUT}`);
  console.log(`[sync]   상세 HTML 복사 → ${PUBLIC_OUT}`);
}

main();
