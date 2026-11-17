/**
 * 셀바스 AI 음성인식 라이선스 정산 — 월별 청구 인원 계산 규칙.
 *
 * 2026년 8~10월 실제 청구 메일과 맞춰 본 규칙입니다.
 *  - April:  8월 18,170 · 9월 18,597 · 10월 18,413 — 레벨별 숫자까지 모두 일치
 *  - 청담:   일반관(CD) + Prime관(CD Prime) 수강생, 셀바스 사용 프로그램·레벨만 (= TS·MASTER·B2 제외)
 *            raw의 Week 5~7에서 TS 제외 합계가 학기 요약 시트와 정확히 같고, 청구 인원 = 요약 합계 − MASTER
 *            (10월: 일반관 W8 14,150.5 − 400 = 13,750.5 · Prime관 W9 422.5 − 146.5 = 276 → 14,026.5)
 *  - 인원 단위: ERP가 이미 C1·C2·C2 debate처럼 함께 듣는 프로그램은 프로그램당 0.5명, F1 같은 단독 프로그램은 1명으로
 *            세어서 내보냅니다 (raw의 F1 칸은 모두 정수, C1·C2 칸은 0.5 단위). 그래서 학습대상자수를 그대로 더하면 사람 수가 됩니다.
 *
 * 규칙이 바뀌면 이 파일만 고치면 됩니다.
 */

export type WeekInfo = {
  brand: string;
  sub_brand?: string | null;
  semester: string;
  sem_order: number | null;
  term: string | null;
  week: number;
  week_start: string | null;
  has_program: boolean;
};

export type ProgramRow = { program: string; level_group?: string; level: string; d: number; n: number };

export type Target = {
  id: 'AP' | 'CD';
  name: string;
  /**
   * Brands summed into this bill (청담 = 일반관 + Prime관). A part with `sameDateAs` uses the week that
   * starts on the same date as that part's billing week (Prime관 numbers its weeks differently:
   * 9월 = 일반관 W4 / Prime관 W4 (09-21), 10월 = 일반관 W8 / Prime관 W9 (10-26)).
   */
  parts: { key: string; brand: string; subBrand?: string; label: string; sameDateAs?: string }[];
  /** Is this program·level counted? `term` decides 봄/가을 vs 여름/겨울 lists. */
  counts: (r: ProgramRow, term: string | null) => boolean;
  /** How the bill groups the counted students (April: by 프로그램; 청담: one number per 관). */
  groupOf: (r: ProgramRow) => string;
  groupOrder: string[];
  rules: string[];
  unitPriceDefault: number | null; // 원/명, VAT 포함
};

const L = (s: string) => s.split(' ');

/** 참고사항 시트: 셀바스 음성인식 프로그램 사용 레벨 (C2D = 프로그램 이름 "C2 debate"). */
const CD_LEVELS: Record<'봄가을' | '여름겨울', Record<string, string[]>> = {
  봄가을: {
    C1: L('EC4 Mega Giga Tera Bridge Par Birdie Eagle Albatross Albatross+'),
    C2: L('EC4 Mega Giga Tera Bridge Par Birdie Eagle Albatross Albatross+'),
    C2D: L('Eagle Albatross Albatross+'),
    F1: L('EC1 EC2 EC3 EC4'),
  },
  여름겨울: {
    A2: L('Mega Giga Tera Bridge Par Birdie Eagle Albatross Albatross+'),
    A3: L('Mega Giga Tera Bridge Par Birdie'),
    C1: L('EC4'),
    C2: L('EC4'),
    F1: L('EC1 EC2 EC3 EC4'),
    V1: L('Mega Giga Tera Bridge Par Birdie Eagle Albatross Albatross+'),
  },
};

const cdProgram = (p: string) => (/^c2\s*d(ebate)?$/i.test(p.trim()) ? 'C2D' : p.trim());

export const TARGETS: Target[] = [
  {
    id: 'AP',
    name: 'April',
    parts: [{ key: 'AP', brand: 'AP', label: 'April (Alpha + 4.0)' }],
    // April에는 프로그램이 없고 레벨그룹(Seedbed·Seed…)과 레벨(Seed 1…)이 있습니다.
    counts: (r) => {
      const g = r.level_group ?? '(없음)';
      if (/^phonics/i.test(g) || /^phonics/i.test(r.level)) return false;
      if (/^ivy/i.test(g)) return /prep/i.test(r.level);
      return g !== '(없음)';
    },
    groupOf: (r) => r.level_group ?? r.level,
    groupOrder: ['Seedbed', 'Seed', 'Sprout', 'Sapling', 'Junior Master', 'Rookie', 'ivy'],
    rules: [
      '기준 주차의 온라인 수강생(학습대상자) 수, Alpha + 4.0 합산',
      'Phonics 제외',
      'ivy는 Prep만 포함 (ivy Level 1·2는 셀바스 엔진 미사용, 26 봄학기부터)',
      '레벨 그룹(Seedbed·Seed·Sprout·Sapling·Junior Master·Rookie)별로 묶어서 보고',
    ],
    unitPriceDefault: null,
  },
  {
    id: 'CD',
    name: '청담',
    parts: [
      { key: 'CD/Regular', brand: 'CD', subBrand: 'Regular', label: '일반관' },
      { key: 'CD/Prime', brand: 'CD', subBrand: 'Prime', label: 'Prime관', sameDateAs: 'CD/Regular' },
    ],
    counts: (r, term) => {
      const set = term === '여름' || term === '겨울' ? CD_LEVELS.여름겨울 : CD_LEVELS.봄가을;
      return (set[cdProgram(r.program)] ?? []).includes(r.level.trim());
    },
    groupOf: (r) => cdProgram(r.program),
    groupOrder: ['C1', 'C2', 'C2D', 'F1', 'A2', 'A3', 'V1'],
    rules: [
      '기준 주차의 i-Learning 수강생(학습대상자) 수, 일반관 + Prime관 합산',
      'Prime관은 일반관 기준 주차와 시작일이 같은 주 (주차 번호가 달라서 10월 = 일반관 W8 · Prime관 W9)',
      '인원: C1·C2·C2 debate처럼 함께 듣는 프로그램은 프로그램당 0.5명(2개 = 1명), F1 같은 단독 프로그램은 1명 — ERP raw가 이미 이렇게 세어 주므로 그대로 더함',
      '셀바스 음성인식 사용 프로그램·레벨만 — 봄/가을: C1·C2 (EC4~Albatross+), C2 debate (Eagle~Albatross+), F1 (EC1~EC4)',
      '여름/겨울: A2·V1 (Mega~Albatross+), A3 (Mega~Birdie), C1·C2 (EC4), F1 (EC1~EC4)',
      '결과적으로 TS · MASTER(D/GL/IM/ST/WD…) · B2(Jump) 는 빠짐',
      '사용료 = 인원 × 단가 (VAT 포함, 2026년 220원)',
    ],
    unitPriceDefault: 220,
  },
];

/**
 * 그 달의 기준 주차: 그 달에 시작하는 마지막 주.
 * 단, 그 주가 새 학기의 1주차면 앞 학기의 마지막 주를 씁니다 (8월 청구 = 여름 Week 13, 가을 Week 1 아님).
 */
export function billingWeek(weeks: WeekInfo[], month: string): WeekInfo | null {
  const inMonth = weeks
    .filter((w) => w.week_start && w.week_start.slice(0, 7) === month)
    .sort((a, b) => (a.week_start! < b.week_start! ? -1 : a.week_start! > b.week_start! ? 1 : (a.sem_order ?? 0) - (b.sem_order ?? 0)));
  if (inMonth.length === 0) return null;
  const last = inMonth[inMonth.length - 1];
  if (last.week === 1) {
    const before = inMonth.filter((w) => w.semester !== last.semester);
    if (before.length) return before[before.length - 1];
  }
  return last;
}

/** Billing week for every part of a target, applying `sameDateAs`. */
/** The weeks of one part: its brand, and its sub-brand when it has one (CD Regular / Prime number weeks separately). */
export const partWeeks = (part: Target['parts'][number], weeks: WeekInfo[]) => {
  const own = weeks.filter((w) => w.brand === part.brand && (!part.subBrand || w.sub_brand === part.subBrand));
  // April: Alpha와 4.0이 같은 주차를 쓰므로 주차 하나로 합칩니다.
  const seen = new Map<string, WeekInfo>();
  for (const w of own) {
    const k = `${w.semester}|${w.week}`;
    const prev = seen.get(k);
    if (!prev) seen.set(k, { ...w });
    else {
      prev.has_program = prev.has_program || w.has_program;
      if (!prev.week_start || (w.week_start && w.week_start < prev.week_start)) prev.week_start = w.week_start;
    }
  }
  return [...seen.values()];
};

export function billingWeeks(target: Target, weeks: WeekInfo[], month: string): Record<string, WeekInfo | null> {
  const out: Record<string, WeekInfo | null> = {};
  for (const p of target.parts) {
    const own = partWeeks(p, weeks);
    const anchor = p.sameDateAs ? out[p.sameDateAs] : null;
    const aligned = anchor?.week_start ? own.find((w) => w.week_start === anchor.week_start) ?? null : null;
    // No same-date week (e.g. 8월, before Prime opened) means that part is not billed that month.
    out[p.key] = p.sameDateAs ? (anchor ? aligned : null) : billingWeek(own, month);
  }
  return out;
}

export type Bill = {
  week: WeekInfo;
  groups: { name: string; n: number }[];
  counted: number;
  excluded: { name: string; n: number }[];
  total: number; // all 수강생 in that week
};

export function computeBill(target: Target, week: WeekInfo, rows: ProgramRow[]): Bill {
  const groups = new Map<string, number>();
  const excluded = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    total += r.n;
    if (target.counts(r, week.term)) {
      const g = target.groupOf(r);
      groups.set(g, (groups.get(g) ?? 0) + r.n);
    } else {
      const key = target.id === 'CD' && r.level === 'MASTER' ? 'MASTER' : `${r.program}${r.level !== '(없음)' ? ` ${r.level}` : ''}`;
      excluded.set(key, (excluded.get(key) ?? 0) + r.n);
    }
  }
  const order = (a: string, b: string) => {
    const ia = target.groupOrder.indexOf(a);
    const ib = target.groupOrder.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  };
  return {
    week,
    groups: [...groups.entries()].sort((a, b) => order(a[0], b[0])).map(([name, n]) => ({ name, n })),
    counted: [...groups.values()].reduce((a, b) => a + b, 0),
    excluded: [...excluded.entries()].filter(([, n]) => n).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n })),
    total,
  };
}

export const fmtCount = (n: number) => (Number.isInteger(n) ? n.toLocaleString('ko-KR') : n.toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));

export function prevMonth(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
}
