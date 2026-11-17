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
  /** 최근 N개월만 (열 때마다 데이터에 있는 마지막 달 기준으로 다시 잡음) */
  recentMonths?: number;
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

/** 지표를 처음 열 때 보이는 화면. 수강률 = 브랜드별 월간, 완료율 = 콘텐츠별 학기. */
export const DEFAULTS: Record<Metric, PivotConfig> = {
  enroll: { metric: 'enroll', rows: 'brand', cols: 'month', filters: {}, recentMonths: 12, showCounts: true },
  complete: { metric: 'complete', rows: 'content', cols: 'semester', filters: {}, showCounts: true },
};

/** 행·열로 만든 화면 제목: "브랜드별 월간 수강률", "콘텐츠별 학기별 완료율", "학원 × 레벨 수강률" */
export function autoTitle(cfg: PivotConfig, dimLabel: (d: DimId) => string, rate: string): string {
  const r = cfg.rows ? `${dimLabel(cfg.rows)}별` : '전체';
  const c = cfg.cols === 'month' ? '월간' : cfg.cols === 'week' ? '주차별' : cfg.cols === 'semester' ? '학기별' : cfg.cols ? `× ${dimLabel(cfg.cols)}` : '';
  return [r, c, rate].filter(Boolean).join(' ');
}

/** How many requests a run makes — for the progress bar. */
export function pivotSteps(cfg: PivotConfig): number {
  let n = 2; // cells + total
  if (cfg.cols) n++;
  if (cfg.rows && cfg.cols) n++;
  if (cfg.latest?.includes('semester') && !cfg.filters.semester?.length) n++;
  if (cfg.latest?.includes('week') && !cfg.filters.week?.length) n++;
  if (cfg.recentMonths && !cfg.filters.month?.length) n++;
  return n;
}

const key = (r: string, c: string) => `${r}\u0001${c}`;

/** ESL+EFL(TO) 인원은 수강률 합계에서 빠지고, 수업 형태로 나눠 볼 때만 들어갑니다 (수업 형태 필터를 골라도 들어감). */
const includeEfl = (cfg: PivotConfig) => cfg.rows === 'course_type' || cfg.cols === 'course_type';

export type Coverage = { brand: string; semester: string; weeks: number[]; partial: boolean };
/** 어떤 차원(레벨·학원 …)이 들어 있는 학기·주차 — '(없음)' 안내용 */
export async function dimCoverage(metric: Metric, cut: string | undefined, dim: DimId, brands: string[]): Promise<Coverage[]> {
  const res = await fetch('/api/stats', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'coverage', metric, cut: cut ?? '', dim, brands }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '목록을 불러오지 못했습니다.');
  return (data.coverage ?? []).map((c: Coverage) => ({ ...c, weeks: c.weeks.map(Number).sort((a, b) => a - b) }));
}

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
export async function resolveLatest(cfg: PivotConfig, tick: () => void = () => {}): Promise<PivotConfig> {
  if (!cfg.latest?.length && !cfg.recentMonths) return cfg;
  const filters = { ...cfg.filters };
  const base = { metric: cfg.metric, cut: cfg.cut ?? '', week_from: cfg.week_from ?? null, week_to: cfg.week_to ?? null, include_efl: includeEfl(cfg) };
  if (cfg.latest?.includes('semester') && !filters.semester?.length) {
    const cells = await query({ ...base, filters, rows: 'semester', cols: null });
    tick();
    const sems = cells.map((c) => c.r).filter((s) => s !== '(없음)').sort((a, b) => compareLabels(a, b, 'semester'));
    if (sems.length) filters.semester = [sems[sems.length - 1]];
  }
  if (cfg.latest?.includes('week') && !filters.week?.length) {
    const cells = await query({ ...base, filters, rows: 'week', cols: null });
    tick();
    const weeks = cells.map((c) => c.r).filter((s) => s !== '(없음)').sort((a, b) => compareLabels(a, b));
    if (weeks.length) filters.week = [weeks[weeks.length - 1]];
  }
  if (cfg.recentMonths && !filters.month?.length) {
    // 월 목록은 미리 계산된 필터 목록에서 (전체 행을 훑지 않음)
    const vals = await dimValues(cfg.metric, cfg.cut, filters.brand ?? []);
    tick();
    const months = (vals.month ?? []).filter((s) => /^\d{4}-\d{2}$/.test(s)).sort();
    if (months.length) filters.month = months.slice(-cfg.recentMonths);
  }
  return { ...cfg, filters };
}

export async function runPivot(cfg: PivotConfig, tick: () => void = () => {}): Promise<PivotResult> {
  const base = { metric: cfg.metric, cut: cfg.cut ?? '', filters: cfg.filters, week_from: cfg.week_from ?? null, week_to: cfg.week_to ?? null, include_efl: includeEfl(cfg) };
  const t = <T,>(p: Promise<T>) => p.then((v) => (tick(), v));
  const [cells, rowsOnly, colsOnly, total] = await Promise.all([
    t(query({ ...base, rows: cfg.rows, cols: cfg.cols })),
    cfg.cols ? t(query({ ...base, rows: cfg.rows, cols: null })) : Promise.resolve(null),
    cfg.rows && cfg.cols ? t(query({ ...base, rows: null, cols: cfg.cols })) : Promise.resolve(null),
    t(query({ ...base, rows: null, cols: null })),
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
