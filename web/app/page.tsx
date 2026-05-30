import manifest from '@/data/results.json';
import type { Manifest, ModelSummary } from '@/lib/types';
import { LeaderboardTable } from './leaderboard-table';

const data = manifest as Manifest;

function buildModelSummaries(m: Manifest): ModelSummary[] {
  return m.models
    .map((model) => {
      const rows = m.rows.filter((r) => r.model === model);
      const subjects = new Set(rows.map((r) => r.subject));
      const sumScore = rows.reduce((a, r) => a + r.score, 0);
      const sumMax = rows.reduce((a, r) => a + r.maxScore, 0);
      const avgAcc =
        rows.length > 0
          ? rows.reduce((a, r) => a + r.accuracy, 0) / rows.length
          : 0;
      return {
        model,
        subjectCount: subjects.size,
        resultCount: rows.length,
        avgAccuracy: Math.round(avgAcc * 10) / 10,
        score: sumScore,
        maxScore: sumMax,
        scorePct: sumMax > 0 ? Math.round((sumScore / sumMax) * 1000) / 10 : 0,
        totalTimeSec: rows.reduce((a, r) => a + r.totalTimeSec, 0),
      };
    })
    .sort((a, b) => b.avgAccuracy - a.avgAccuracy);
}

function fmtMin(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

export default function Home() {
  const summaries = buildModelSummaries(data);
  const genDate = data.generatedAt?.slice(0, 10) ?? '';

  return (
    <main className="wrap">
      <h1>AI 수능 벤치마크</h1>
      <p className="intro">
        2025학년도 수능을 AI 모델이 <b>이미지 모드</b>로 풀고 채점한 결과를
        과목·모델·모드별로 비교합니다. 행의 <b>상세</b> 링크로 문항별 풀이 리포트를 볼 수 있습니다.
        {' '}총 {data.rows.length}건 · 모델 {data.models.length}종 · 과목 {data.subjects.length}종.
      </p>

      <div className="section-title">모델별 요약</div>
      <div className="cards">
        {summaries.map((s) => (
          <div className="card" key={s.model}>
            <div className="card-model">{s.model}</div>
            <div className="card-main">
              {s.avgAccuracy}% <small>평균 정답률</small>
            </div>
            <div className="card-rows">
              <div>
                <span>원점수 합</span>
                <b>
                  {s.score}/{s.maxScore} ({s.scorePct}%)
                </b>
              </div>
              <div>
                <span>과목 수</span>
                <b>{s.subjectCount}</b>
              </div>
              <div>
                <span>결과 수</span>
                <b>{s.resultCount}</b>
              </div>
              <div>
                <span>총 풀이시간</span>
                <b>{fmtMin(s.totalTimeSec)}</b>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="section-title">전체 결과</div>
      <LeaderboardTable
        rows={data.rows}
        categories={data.categories}
        models={data.models}
        modes={data.modes}
      />

      <p className="foot">생성: {genDate} · 데이터 출처: benchmark/results/</p>
    </main>
  );
}
