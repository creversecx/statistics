/**
 * 셀바스 AI 음성인식 라이선스 정산 — 월별 청구 인원 계산 규칙.
 *
 * 2026년 8~10월 실제 청구 메일과 맞춰 본 규칙입니다.
 *  - April:  8월 18,170 · 9월 18,597 · 10월 18,413 — 레벨별 숫자까지 모두 일치
 *  - 청담:   초등관(CD) + 중등관(CD Prime) 수강생, 셀바스 사용 프로그램·레벨만 (= TS·MASTER·B2 제외)
 *            raw의 Week 5~7에서 TS 제외 합계가 학기 요약 시트와 정확히 같고, 청구 인원 = 요약 합계 − MASTER
 *
 * 규칙이 바뀌면 이 파일만 고치면 됩니다.
 */

export type WeekInfo = {
  brand: string;
  semester: string;
  sem_order: number | null;
  term: string | null;
  week: number;
  week_start: string | null;
  has_program: boolean;
};

export type ProgramRow = { program: string; level: string; d: number; n: number };

export type Target = {
  id: 'AP' | 'CD';
  name: string;
  /**
   * Brands summed into this bill (청담 = 초등관 + 중등관). A part with `sameDateAs` uses the week that
   * starts on the same date as that part's billing week (중등관 numbers its weeks differently:
   * 9월 = 초등관 W4 / 중등관 W4 (09-21), 10월 = 초등관 W8 / 중등관 W9 (10-26)).
   */
  parts: { brand: string; label: string; sameDateAs?: string }[];
  /** Is this program·level counted? `term` decides 봄/가을 vs 여름/겨울 lists. */
  counts: (program: string, level: string, term: string | null) => boolean;
  /** How the bill groups the counted students (April: by 프로그램; 청담: one number per 관). */
  groupOf: (program: string, level: string) => string;
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
    parts: [{ brand: 'AP', label: 'April' }],
    counts: (program, level) => {
      if (/^phonics$/i.test(program)) return false;
      if (/^ivy$/i.test(program)) return /^prep$/i.test(level);
      return program !== '(없음)';
    },
    groupOf: (program) => program,
    groupOrder: ['Seedbed', 'Seed', 'Sprout', 'Sapling', 'Junior Master', 'Rookie', 'ivy'],
    rules: [
      '기준 주차의 온라인 수강생(학습대상자) 수',
      'Phonics 제외',
      'ivy는 Prep만 포함 (ivy Level 1·2는 셀바스 엔진 미사용, 26 봄학기부터)',
      '프로그램(레벨 그룹)별로 묶어서 보고',
    ],
    unitPriceDefault: null,
  },
  {
    id: 'CD',
    name: '청담',
    parts: [
      { brand: 'CD', label: '초등관' },
      { brand: 'CD_Prime', label: '중등관 (Prime)', sameDateAs: 'CD' },
    ],
    counts: (program, level, term) => {
      const set = term === '여름' || term === '겨울' ? CD_LEVELS.여름겨울 : CD_LEVELS.봄가을;
      return (set[cdProgram(program)] ?? []).includes(level.trim());
    },
    groupOf: (program) => cdProgram(program),
    groupOrder: ['C1', 'C2', 'C2D', 'F1', 'A2', 'A3', 'V1'],
    rules: [
      '기준 주차의 i-Learning 수강생(학습대상자) 수, 초등관 + 중등관(Prime) 합산',
      '중등관은 초등관 기준 주차와 시작일이 같은 주 (주차 번호가 달라서 10월 = 초등관 W8 · 중등관 W9)',
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
export function billingWeeks(target: Target, weeks: WeekInfo[], month: string): Record<string, WeekInfo | null> {
  const out: Record<string, WeekInfo | null> = {};
  for (const p of target.parts) {
    const own = weeks.filter((w) => w.brand === p.brand);
    const anchor = p.sameDateAs ? out[p.sameDateAs] : null;
    const aligned = anchor?.week_start ? own.find((w) => w.week_start === anchor.week_start) ?? null : null;
    // No same-date week (e.g. 8월, before Prime opened) means that part is not billed that month.
    out[p.brand] = p.sameDateAs ? (anchor ? aligned : null) : billingWeek(own, month);
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
    if (target.counts(r.program, r.level, week.term)) {
      const g = target.groupOf(r.program, r.level);
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
