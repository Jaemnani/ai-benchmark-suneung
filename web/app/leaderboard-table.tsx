'use client';

import { useMemo, useState } from 'react';
import type { ResultRow } from '@/lib/types';

type SortKey =
  | 'subject'
  | 'model'
  | 'mode'
  | 'accuracy'
  | 'score'
  | 'skipped'
  | 'errors'
  | 'avgTime';

const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: 'subject', label: '과목' },
  { key: 'model', label: '모델' },
  { key: 'mode', label: '모드' },
  { key: 'accuracy', label: '정답률' },
  { key: 'score', label: '원점수' },
  { key: 'skipped', label: '제외' },
  { key: 'errors', label: '오류' },
  { key: 'avgTime', label: '평균시간' },
  { key: null, label: '상세' },
];

function accColor(acc: number): string {
  if (acc >= 60) return 'var(--good)';
  if (acc >= 35) return 'var(--info)';
  return 'var(--bad)';
}

export function LeaderboardTable({
  rows,
  categories,
  models,
  modes,
}: {
  rows: ResultRow[];
  categories: string[];
  models: string[];
  modes: string[];
}) {
  const [category, setCategory] = useState<string>('전체');
  const [model, setModel] = useState<string>('전체');
  const [mode, setMode] = useState<string>('전체');
  const [sortKey, setSortKey] = useState<SortKey>('accuracy');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const view = useMemo(() => {
    const filtered = rows.filter(
      (r) =>
        (category === '전체' || r.category === category) &&
        (model === '전체' || r.model === model) &&
        (mode === '전체' || r.mode === mode)
    );
    const dir = sortDir === 'asc' ? 1 : -1;
    const cmp = (a: ResultRow, b: ResultRow): number => {
      switch (sortKey) {
        case 'subject':
          return a.subject.localeCompare(b.subject, 'ko') * dir;
        case 'model':
          return a.model.localeCompare(b.model) * dir;
        case 'mode':
          return a.mode.localeCompare(b.mode) * dir;
        case 'accuracy':
          return (a.accuracy - b.accuracy) * dir;
        case 'score':
          return (a.score - b.score) * dir;
        case 'skipped':
          return (a.skipped - b.skipped) * dir;
        case 'errors':
          return ((a.errors ?? 0) - (b.errors ?? 0)) * dir;
        case 'avgTime':
          return (a.avgTimeSec - b.avgTimeSec) * dir;
        default:
          return 0;
      }
    };
    return [...filtered].sort(cmp);
  }, [rows, category, model, mode, sortKey, sortDir]);

  function toggleSort(key: SortKey | null) {
    if (key === null) return;
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'subject' || key === 'model' || key === 'mode' ? 'asc' : 'desc');
    }
  }

  const chipList = ['전체', ...categories];

  return (
    <div>
      <div className="controls">
        <div className="chips">
          {chipList.map((c) => (
            <button
              key={c}
              type="button"
              className={`chip ${category === c ? 'active' : ''}`}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="select-group">
          <label>
            모델{' '}
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="전체">전체</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label>
            모드{' '}
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="전체">전체</option>
              {modes.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((col) => (
                <th
                  key={col.label}
                  className={col.key === null ? 'no-sort' : ''}
                  onClick={() => toggleSort(col.key)}
                >
                  {col.label}
                  {col.key === sortKey ? (
                    <span className="arrow"> {sortDir === 'asc' ? '▲' : '▼'}</span>
                  ) : (
                    col.key !== null && <span className="sort-hint"> ⇅</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 ? (
              <tr>
                <td className="empty" colSpan={COLUMNS.length}>
                  조건에 맞는 결과가 없습니다.
                </td>
              </tr>
            ) : (
              view.map((r) => (
                <tr key={`${r.subjectSlug}-${r.model}-${r.mode}`}>
                  <td className="subj">
                    {r.category !== r.subject && (
                      <span className="badge">{r.category}</span>
                    )}
                    {r.subjectShort}
                  </td>
                  <td>{r.model}</td>
                  <td>
                    <span className="badge badge-mode">{r.mode}</span>
                  </td>
                  <td>
                    <div className="acc-cell">
                      <div className="acc-bar">
                        <div
                          className="acc-fill"
                          style={{
                            width: `${Math.max(0, Math.min(100, r.accuracy))}%`,
                            background: accColor(r.accuracy),
                          }}
                        />
                      </div>
                      <span className="acc-val" style={{ color: accColor(r.accuracy) }}>
                        {r.accuracy}%
                      </span>
                    </div>
                  </td>
                  <td className="num">
                    {r.score}/{r.maxScore}
                  </td>
                  <td className="num">
                    {r.skipped > 0 ? <span className="skip-tag">{r.skipped}</span> : '–'}
                  </td>
                  <td className="num">
                    {(r.errors ?? 0) > 0 ? (
                      <span className="err-tag">⚠ {r.errors}</span>
                    ) : (
                      '–'
                    )}
                  </td>
                  <td className="num">{r.avgTimeSec.toFixed(1)}s</td>
                  <td>
                    {r.detailHref ? (
                      <a
                        className="detail-link"
                        href={r.detailHref}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        상세 →
                      </a>
                    ) : (
                      '–'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
