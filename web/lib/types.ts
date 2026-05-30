// sync-results.mjs 가 생성하는 data/results.json 의 타입 (매니페스트 출력과 mirror).

export interface ResultRow {
  subject: string;
  subjectSlug: string;
  subjectShort: string;
  category: string;
  model: string;
  mode: string;
  timestamp: string | null;
  // normalizeSummary() 출력
  totalQuestions: number;
  gradedQuestions: number;
  skipped: number;
  correct: number;
  score: number;
  maxScore: number;
  accuracy: number;
  totalTimeSec: number;
  avgTimeSec: number;
  detailHref: string | null;
}

export interface Manifest {
  generatedAt: string;
  models: string[];
  categories: string[];
  subjects: string[];
  modes: string[];
  rows: ResultRow[];
}

export interface ModelSummary {
  model: string;
  subjectCount: number;
  resultCount: number;
  avgAccuracy: number; // 행별 accuracy 단순 평균
  score: number;
  maxScore: number;
  scorePct: number; // sumScore / sumMaxScore * 100
  totalTimeSec: number;
}
