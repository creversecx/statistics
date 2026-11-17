import { compareLabels, type DimId, type Metric } from './dims';

export type PivotConfig = {
  metric: Metric;
  rows: DimId | null;
  cols: DimId | null;
  filters: Partial<Record<DimId, string[]>>;
  week_from?: number | null;
  week_to?: number | null;
  /** Filters to resolve to the newest value each time the view opens (e.g. 최신 학기·주차). */
  latest?: ('semester' | 'week')[];
  sort?: 'label' | 'rate_desc' | 'rate_asc' | 'denom_desc';
  /** A supplementary table (e.g. April 레벨별 보조표) instead of the base one. */
  cut?: string;
  showCounts?: boolean;
};

/** d/n: sums. np: periods (학기·주차) in the cell. da/na: weekly-average head counts, per brand then summed. */
export type Cell = { r: string; c: string; d: number; n: number; np: number; da: number; na: number };

export type PivotResult = {
  rowKeys: string[];
  colKeys: string[];
  cell: Map<string, Cell>; // `${r}\u0001${c}`
  rowTotal: Map<string, Cell>;
  colTotal: Map<string, Cell>;
  total: Cell | null;
};

export const TIME_DIMS: DimId[] = ['week', 'month', 'semester'];

/** The views the teams have been building by hand, as starting points. */
export const PRESETS: { id: string; name: string; description: string; config: PivotConfig }[] = [
  {
    id: 'p-branch-week',
    name: '학원별 수강률 (최신 주)',
    description: '주간 보고 · 80%/60% 미만 캠퍼스',
    config: { metric: 'enroll', rows: 'branch', cols: null, filters: {}, latest: ['semester', 'week'], sort: 'rate_asc', showCounts: true },
  },
  {
    id: 'p-sem-week',
    name: '학기별 주차 추이',
    description: '학기 × 주차 수강률 비교',
    config: { metric: 'enroll', rows: 'semester', cols: 'week', filters: {} },
  },
  {
    id: 'p-type-week',
    name: '직/가맹 주차 추이',
    description: '최신 학기 직영·가맹 수강률',
    config: { metric: 'enroll', rows: 'branch_type', cols: 'week', filters: {}, latest: ['semester'], showCounts: true },
  },
  {
    id: 'p-sub-week',
    name: '서브브랜드 주차 추이',
    description: '최신 학기 Alpha·4.0 / Regular·Prime·TO',
    config: { metric: 'enroll', rows: 'sub_brand', cols: 'week', filters: {}, latest: ['semester'], showCounts: true },
  },
  {
    id: 'p-level-week',
    name: '레벨별 주차 추이',
    description: '최신 학기 레벨별 수강률 (브랜드·서브브랜드를 골라 보세요)',
    config: { metric: 'enroll', rows: 'level', cols: 'week', filters: { brand: ['AP'] }, latest: ['semester'] },
  },
  {
    id: 'p-brand-month',
    name: '브랜드별 월간 수강률',
    description: '월별 현원생·수강생·수강률',
    config: { metric: 'enroll', rows: 'brand', cols: 'month', filters: {}, showCounts: true },
  },
  {
    id: 'p-brand-sem',
    name: '브랜드별 학기 추이',
    description: '학기 평균 수강률',
    config: { metric: 'enroll', rows: 'brand', cols: 'semester', filters: {}, showCounts: true },
  },
  {
    id: 'p-c-component-low',
    name: '보완할 학습 (완료율 낮은 순)',
    description: '최신 학기 콘텐츠·학습유형별 완료율, 낮은 것부터',
    config: { metric: 'complete', rows: 'component', cols: null, filters: {}, latest: ['semester'], sort: 'rate_asc', showCounts: true },
  },
  {
    id: 'p-c-level-component',
    name: '레벨 × 학습 유형',
    description: '최신 학기 어느 레벨의 어느 학습이 비는지',
    config: { metric: 'complete', rows: 'level', cols: 'component', filters: {}, latest: ['semester'] },
  },
  {
    id: 'p-c-branch-low',
    name: '학원별 완료율 (낮은 순)',
    description: '최신 학기 완료율이 낮은 학원',
    config: { metric: 'complete', rows: 'branch', cols: null, filters: {}, latest: ['semester'], sort: 'rate_asc', showCounts: true },
  },
  {
    id: 'p-c-type-sem',
    name: '직/가맹 학습 완료율 추이',
    description: '학기별 완료율 (Vena Talk 보고 형식)',
    config: { metric: 'complete', rows: 'branch_type', cols: 'semester', filters: {} },
  },
  {
    id: 'p-c-level-sem',
    name: '레벨별 학습 완료율 추이',
    description: '학기별 레벨 완료율',
    config: { metric: 'complete', rows: 'level', cols: 'semester', filters: {} },
  },
  {
    id: 'p-c-program-level',
    name: '프로그램·레벨 완료율',
    description: '최신 학기 레벨별 완료율',
    config: { metric: 'complete', rows: 'level', cols: null, filters: {}, latest: ['semester'], sort: 'label', showCounts: true },
  },
  {
    id: 'p-c-content-week',
    name: '콘텐츠별 주차 완료율',
    description: '최신 학기 콘텐츠·주차',
    config: { metric: 'complete', rows: 'content', cols: 'week', filters: {}, latest: ['semester'] },
  },
];

const key = (r: string, c: string) => `${r}\u0001${c}`;

async function query(body: Record<string, unknown>): Promise<Cell[]> {
  const res = await fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '집계하지 못했습니다.');
  return (data.cells ?? []).map((c: Cell) => ({ ...c, d: Number(c.d), n: Number(c.n), np: Number(c.np), da: Number(c.da), na: Number(c.na) }));
}

export async function dimValues(metric: Metric, cut?: string, brands: string[] = []): Promise<Record<string, string[]>> {
  const res = await fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'dims', metric, cut: cut ?? '', brands }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '목록을 불러오지 못했습니다.');
  const values: Record<string, string[]> = data.values ?? {};
  for (const [dim, list] of Object.entries(values)) list.sort((a, b) => compareLabels(a, b, dim));
  return values;
}

/** Fills in "latest" filters: the newest semester present (within the other filters), then its newest week. */
export async function resolveLatest(cfg: PivotConfig): Promise<PivotConfig> {
  if (!cfg.latest?.length) return cfg;
  const filters = { ...cfg.filters };
  const base = { metric: cfg.metric, cut: cfg.cut ?? '', week_from: cfg.week_from ?? null, week_to: cfg.week_to ?? null };
  if (cfg.latest.includes('semester') && !filters.semester?.length) {
    const cells = await query({ ...base, filters, rows: 'semester', cols: null });
    const sems = cells.map((c) => c.r).filter((s) => s !== '(없음)').sort((a, b) => compareLabels(a, b, 'semester'));
    if (sems.length) filters.semester = [sems[sems.length - 1]];
  }
  if (cfg.latest.includes('week') && !filters.week?.length) {
    const cells = await query({ ...base, filters, rows: 'week', cols: null });
    const weeks = cells.map((c) => c.r).filter((s) => s !== '(없음)').sort((a, b) => compareLabels(a, b));
    if (weeks.length) filters.week = [weeks[weeks.length - 1]];
  }
  return { ...cfg, filters };
}

export async function runPivot(cfg: PivotConfig): Promise<PivotResult> {
  const base = { metric: cfg.metric, cut: cfg.cut ?? '', filters: cfg.filters, week_from: cfg.week_from ?? null, week_to: cfg.week_to ?? null };
  const [cells, rowsOnly, colsOnly, total] = await Promise.all([
    query({ ...base, rows: cfg.rows, cols: cfg.cols }),
    cfg.cols ? query({ ...base, rows: cfg.rows, cols: null }) : Promise.resolve(null),
    cfg.rows && cfg.cols ? query({ ...base, rows: null, cols: cfg.cols }) : Promise.resolve(null),
    query({ ...base, rows: null, cols: null }),
  ]);
  const cell = new Map<string, Cell>();
  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  for (const c of cells) {
    cell.set(key(c.r, c.c), c);
    rowSet.add(c.r);
    colSet.add(c.c);
  }
  const rowTotal = new Map<string, Cell>();
  for (const c of rowsOnly ?? cells) rowTotal.set(c.r, c);
  const colTotal = new Map<string, Cell>();
  for (const c of colsOnly ?? []) colTotal.set(c.c, c);

  const rate = (c?: Cell) => (c && c.d > 0 ? c.n / c.d : -1);
  let rowKeys = [...rowSet].sort((a, b) => compareLabels(a, b, cfg.rows ?? undefined));
  if (cfg.sort === 'rate_desc') rowKeys.sort((a, b) => rate(rowTotal.get(b)) - rate(rowTotal.get(a)));
  if (cfg.sort === 'rate_asc') rowKeys.sort((a, b) => rate(rowTotal.get(a)) - rate(rowTotal.get(b)));
  if (cfg.sort === 'denom_desc') rowKeys.sort((a, b) => (rowTotal.get(b)?.d ?? 0) - (rowTotal.get(a)?.d ?? 0));
  rowKeys = rowKeys.filter((r) => (rowTotal.get(r)?.d ?? 0) > 0 || (rowTotal.get(r)?.n ?? 0) > 0);
  const colKeys = [...colSet].sort((a, b) => compareLabels(a, b, cfg.cols ?? undefined));
  return { rowKeys, colKeys, cell, rowTotal, colTotal, total: total[0] ?? null };
}

export const getCell = (res: PivotResult, r: string, c: string) => res.cell.get(key(r, c));

export const rateOf = (c?: Cell | null) => (c && c.d > 0 ? c.n / c.d : null);

/** 수강률's 현원생/수강생 are head counts: across several weeks show the weekly average, not the sum. */
export function counts(c: Cell | null | undefined, metric: Metric) {
  if (!c) return { d: null, n: null, avg: false };
  if (metric === 'enroll' && c.np > 1) return { d: c.da, n: c.na, avg: true };
  return { d: c.d, n: c.n, avg: false };
}
