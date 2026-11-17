/**
 * The vocabulary of the stats: what we measure and what we cut it by.
 * Shared by the browser (upload parsing, pivot UI) and the server.
 */

export type Metric = 'enroll' | 'complete';

export const METRICS: Record<Metric, { label: string; short: string; denom: string; numer: string; rate: string; hint: string }> = {
  enroll: {
    label: '온라인 수강률',
    short: '수강률',
    denom: '현원생',
    numer: '수강생',
    rate: '수강률',
    hint: '현원생(재원생) 중 온라인 학습 대상자(수강생) 비율 · ERP > i-Learning 수강률',
  },
  complete: {
    label: '학습 완료율',
    short: '완료율',
    denom: '학습 건수',
    numer: '완료 건수',
    rate: '완료율',
    hint: '학습해야 할 건수 중 완료된 건수 비율 · ERP > i-Learning 학습률, 콘텐츠 통계 raw',
  },
};

export const DIMS = [
  { id: 'brand', label: '브랜드' },
  { id: 'semester', label: '학기' },
  { id: 'week', label: '주차' },
  { id: 'month', label: '월' },
  { id: 'branch_type', label: '직/가맹' },
  { id: 'branch', label: '학원' },
  { id: 'alpha', label: '알파/4.0' },
  { id: 'program', label: '프로그램' },
  { id: 'level', label: '레벨' },
  { id: 'level_group', label: '레벨 그룹' },
  { id: 'grade', label: '학년' },
  { id: 'class_name', label: '반' },
  { id: 'content', label: '콘텐츠' },
  { id: 'component', label: '학습 유형' },
  { id: 'dataset', label: '데이터셋' },
] as const;

export type DimId = (typeof DIMS)[number]['id'];
export const DIM_LABEL = Object.fromEntries(DIMS.map((d) => [d.id, d.label])) as Record<DimId, string>;
export const isDim = (v: unknown): v is DimId => DIMS.some((d) => d.id === v);

export const BRANDS = [
  { id: 'CD', name: '청담 (CDI)' },
  { id: 'CD_Prime', name: '청담 Prime' },
  { id: 'AP', name: 'April' },
  { id: 'iG', name: 'i-GARTEN' },
  { id: 'TO', name: 'The Open' },
] as const;
export const brandName = (id: string) => BRANDS.find((b) => b.id === id)?.name ?? id;

// ---------------------------------------------------------------------------
// 학기
// ---------------------------------------------------------------------------

/** 봄 → 여름 → 가을 → 겨울 (겨울학기는 그해 12월~다음 해 2월). iG는 1학기/2학기. */
const TERMS: { term: string; order: number; re: RegExp }[] = [
  { term: '봄', order: 1, re: /봄|spring/i },
  { term: '여름', order: 2, re: /여름|summer/i },
  { term: '가을', order: 3, re: /가을|fall|autumn/i },
  { term: '겨울', order: 4, re: /겨울|winter/i },
  { term: '1학기', order: 1, re: /1\s*학기/ },
  { term: '2학기', order: 3, re: /2\s*학기/ },
];

export type Semester = { year: number | null; term: string | null; label: string; order: number | null };

/**
 * "24 봄학기", "25_1학기(봄)", "26_가을학기_Week9", "2026_가을", "26' 2학기",
 * "24 Summer", "22 Fall" → { year: 2024, term: '봄', label: '24 봄' }.
 */
export function parseSemester(raw: unknown, fallbackYear?: number | null): Semester | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const t = TERMS.find((x) => x.re.test(s));
  const m = s.match(/(?:^|[^\d])(\d{4}|\d{2})(?=[^\d]|$)/);
  let year: number | null = null;
  if (m) {
    const n = Number(m[1]);
    year = n < 100 ? 2000 + n : n;
    if (year < 2010 || year > 2099) year = null;
  }
  if (year === null && fallbackYear) year = fallbackYear;
  if (!t) return null;
  return {
    year,
    term: t.term,
    label: year ? `${String(year).slice(2)} ${t.term}` : t.term,
    order: year ? year * 10 + t.order : null,
  };
}

/** For sorting labels that are semesters ("26 가을") or anything else. */
export function semesterOrder(label: string): number | null {
  return parseSemester(label)?.order ?? null;
}

// ---------------------------------------------------------------------------
// 주차
// ---------------------------------------------------------------------------

/** " Week 1", "Week 1 08-31~09-06", "wk3", "W2", "3주차", 5 → number. */
export function parseWeek(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isInteger(raw) && raw > 0 && raw < 60 ? raw : null;
  const s = String(raw).trim();
  const m = s.match(/(?:week|wk|w)\s*[._-]?\s*(\d{1,2})/i) ?? s.match(/(\d{1,2})\s*주/) ?? s.match(/^(\d{1,2})$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n > 0 && n < 60 ? n : null;
}

/** "Week 1 08-31~09-06" → "08-31" if the label carries its dates. */
export function weekStartFromLabel(raw: unknown, year: number | null): string | null {
  if (!year) return null;
  const m = String(raw ?? '').match(/(\d{1,2})[-./](\d{1,2})\s*~/);
  if (!m) return null;
  return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// 값 정리
// ---------------------------------------------------------------------------

export function normBranchType(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/직영|^직$|direct/i.test(s)) return '직영';
  if (/가맹|^가$|franchise/i.test(s)) return '가맹';
  return null;
}

export function normAlpha(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (/^(α|a|alpha|알파)$/i.test(s)) return '알파';
  if (/^4(\.0)?$/.test(s)) return '4.0';
  return s;
}

/** Subtotal and grand-total rows in pivot exports. */
export const TOTAL_RE = /(^|\s)(sub\s*total|grand\s*total|total|합계|총합계|소계|요약)(\s|$)|\btotal\b/i;

/** Rate thresholds the weekly reports flag (수강률 80% 미만 / 60% 미만 캠퍼스). */
export const WARN_RATE = 0.8;
export const ALERT_RATE = 0.6;

export function compareLabels(a: string, b: string, dim?: string): number {
  if (a === '(없음)') return 1;
  if (b === '(없음)') return -1;
  if (dim === 'semester') {
    const oa = semesterOrder(a);
    const ob = semesterOrder(b);
    if (oa !== null && ob !== null && oa !== ob) return oa - ob;
  }
  const na = Number(a);
  const nb = Number(b);
  if (a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, 'ko', { numeric: true });
}
