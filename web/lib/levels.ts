/**
 * 브랜드 위계와 레벨 이름 정리.
 *
 *   브랜드      서브브랜드             프로그램                  레벨그룹 → 레벨
 *   April(AP)   Alpha · 4.0           (없음)                    Seedbed → Seedbed 1, Seed → Seed 2 … → 트랙 A·B
 *   CD          일반관(Regular)·중등관(Prime)  C1 C2 C2D F1 A2 A3 V1 …   EC1~4, Mega~Albatross+, MASTER
 *               └ 수업 형태: 주2회 ESL (C1·C2 / C1·C2D / C1·C2·C2D, 여름·겨울 A2·A3·V1)
 *                            ESL+EFL  (ESL 1개 + TO 수업: TO 레벨 Thinker, Hypothesist …) — 수강률 합계에선 뺌
 *                            기타     (F1, Jump B2, MASTER 과정)
 *   iGarten(iG) (없음)                (없음)                    i5 → i5-1, i-Master → Draco …
 *
 * 알파와 4.0은 레벨 체계가 다릅니다: 알파 = Phonics Starter, Seedbed(단일), …, Rise Sapling 1·2, ivy 1·2 / 4.0 = Seedbed 1·2, …, Rookie.
 * April 레벨 아래에는 트랙이 있습니다: 원래 A = 봄·가을, B = 여름·겨울이지만 지금은 A·B를 같이 운영하는 레벨도 있습니다.
 * 트랙은 표에 나올 때만 저장합니다 (MeMe 수업명 "[Alpha]Seed 1A_주2회", 레벨 "Seed 1A" 등).
 * 업로드(lib/ingest)와 기존 데이터 변환(이관 스크립트)이 모두 이 함수를 씁니다.
 */

export const BRAND_IDS = ['AP', 'CD', 'iG'] as const;

export const SUB_BRANDS: Record<string, { id: string; name: string }[]> = {
  AP: [
    { id: 'Alpha', name: 'April Alpha' },
    { id: '4.0', name: 'April 4.0' },
  ],
  CD: [
    { id: 'Regular', name: '일반관' },
    { id: 'Prime', name: '중등관' },
  ],
  iG: [],
};

/** 레벨 정렬 순서 (Phonics Starter → JM, EC1 → Albatross+ → MASTER, TO). 없는 것은 이름순으로 뒤에. */
export const LEVEL_ORDER = [
  'Phonics Starter',
  'Seedbed',
  'Seedbed 1',
  'Seedbed 2',
  'Seed 1',
  'Seed 2',
  'Sprout 1',
  'Sprout 2',
  'Sprout 3',
  'Sapling 1',
  'Sapling 2',
  'Rise Sapling 1',
  'Rise Sapling 2',
  'Junior Master 1',
  'Junior Master 2',
  'Rookie 1',
  'ivy Prep',
  'ivy 1',
  'ivy 2',
  'Extra',
  'EC1',
  'EC2',
  'EC3',
  'EC4',
  'Mega',
  'Giga',
  'Tera',
  'Bridge',
  'Par',
  'Birdie',
  'Eagle',
  'Albatross',
  'Albatross+',
  'MASTER',
  'Thinker',
  'Hypothesist',
  'Experimenter',
  'Originator',
  'Polymath',
  'Starter',
];
export const LEVEL_GROUP_ORDER = ['Phonics', 'Seedbed', 'Seed', 'Sprout', 'Sapling', 'Rise Sapling', 'Junior Master', 'Rookie', 'ivy', 'Extra'];

const AP_FAMILIES: [RegExp, string][] = [
  [/^phonics/i, 'Phonics'],
  [/^seedbed/i, 'Seedbed'],
  [/^seed(?!bed)/i, 'Seed'],
  [/^sprout/i, 'Sprout'],
  [/^sapling/i, 'Sapling'],
  [/^rise\s*_?sapling/i, 'Rise Sapling'],
  [/^(junior\s*master|jun_?mas|jm)/i, 'Junior Master'],
  [/^rookie/i, 'Rookie'],
  [/^ivy/i, 'ivy'],
  [/^extra/i, 'Extra'],
];
const family = (s: string) => AP_FAMILIES.find(([re]) => re.test(s.trim()))?.[1] ?? null;

export type Hierarchy = {
  sub_brand: string | null;
  program: string | null;
  level_group: string | null;
  level: string | null;
  track: string | null;
  /** 청담 수업 형태: 주2회 ESL · ESL+EFL · 기타 */
  course_type?: string | null;
};

/** 청담 수업 형태 (0004 마이그레이션의 기존 데이터 변환과 같은 규칙) */
export const COURSE_TYPES = ['주2회 ESL', 'ESL+EFL', '기타'] as const;
const ESL_PROGRAMS = new Set(['C1', 'C2', 'C2D', 'A2', 'A3', 'V1']);
export function courseTypeOf(program: string | null): string | null {
  if (!program) return null;
  return ESL_PROGRAMS.has(program) ? '주2회 ESL' : '기타';
}

/** "Seed 1A", "Seedbed B", "Level 2A", "[Alpha]Seed 1A_주2회" → A / B */
function trackOf(...texts: (string | null)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const core = t.replace(/^\[[^\]]*\]/, '').replace(/_?주\s*\d\s*회.*$/, '').trim();
    const m = core.match(/(?:\d|\b)\s*([AB])$/);
    if (m) return m[1].toUpperCase();
  }
  return null;
}

const clean = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s && s !== 'None' && s !== '(없음)' ? s : null;
};

/** 알파 표시 값 → 서브브랜드 (알파 / α / O / Y → Alpha, 4 / 4.0 → 4.0) */
export function subBrandFromAlpha(alpha: unknown): string | null {
  const a = clean(alpha);
  if (!a) return null;
  if (/^(알파|α|alpha|o|y)$/i.test(a)) return 'Alpha';
  if (/^4(\.0)?$/.test(a)) return '4.0';
  return null;
}

/**
 * 한 행의 (프로그램, 레벨)을 브랜드 위계에 맞게 정리합니다.
 * subBrand가 정해져 있으면 그대로 두고, April은 알파 값이나 "[Alpha]…" 수업명에서 찾습니다.
 */
export function normalizeHierarchy(
  brand: string,
  raw: { sub_brand?: unknown; program?: unknown; level?: unknown; level_group?: unknown; alpha?: unknown }
): Hierarchy {
  let sub = clean(raw.sub_brand);
  const program = clean(raw.program);
  const level = clean(raw.level);

  if (brand === 'AP') {
    // MeMe 등 콘텐츠 raw의 프로그램 칸은 "[Alpha]Seed 1A_주2회" 같은 수업명 — April에는 프로그램이 없습니다.
    const syllabus = program && /_주\d회|\[alpha/i.test(program) ? program : null;
    if (!sub) sub = subBrandFromAlpha(raw.alpha) ?? (syllabus ? (/\[alpha/i.test(syllabus) ? 'Alpha' : '4.0') : null);
    const famFromProgram = program && !syllabus ? family(program) : null;
    let fam = famFromProgram;
    let suffix: string | null = null;
    if (fam && level) {
      // 주간 시트: 프로그램 Seed + 레벨 "Level 1"
      const m = level.match(/^level\s*(\d)(p)?\s*[AB]?$/i);
      if (m) suffix = m[2] ? `${m[1]}P` : m[1];
      else if (/^starter$/i.test(level)) suffix = 'Starter';
      else if (/^prep$/i.test(level)) suffix = 'Prep';
      else if (/^extra$/i.test(level)) suffix = null;
      else if (family(level) === fam) suffix = level.replace(/^[a-z_ ]+/i, '').replace(/\s*[AB]$/, '').trim() || null;
    } else if (level) {
      // 콘텐츠 raw: 레벨 코드 Seed1, Seedbed2, JUN_MAS1, Rookie1, Phonics
      fam = family(level) ?? (syllabus ? family(syllabus.replace(/^\[[^\]]*\]/, '')) : null);
      const m = level.replace(/\s*[AB]$/, '').match(/(\d)\s*$/);
      suffix = m ? m[1] : null;
    }
    const track = trackOf(level, syllabus);
    if (!fam) return { sub_brand: sub, program: null, level_group: null, level, track };
    let name: string;
    if (fam === 'Phonics') name = 'Phonics Starter';
    else if (fam === 'ivy') name = suffix === 'Prep' || !suffix ? 'ivy Prep' : `ivy ${suffix}`;
    else if (fam === 'Extra') name = 'Extra';
    else name = suffix ? `${fam} ${suffix}` : fam;
    return { sub_brand: sub, program: null, level_group: fam, level: name, track };
  }

  if (brand === 'CD') {
    if (sub === 'TO') {
      // TO(The Open, p-Learning)는 일반관의 ESL+EFL 수업. 레벨 이름 뒤 학기 표시(_AU, _SP …)를 뗍니다.
      return { sub_brand: 'Regular', program: null, level_group: null, level: level ? level.replace(/_(AU|SP|SU|WI|FA|SM)$/i, '') : null, track: null, course_type: 'ESL+EFL' };
    }
    const prog = program ? (/^c2\s*d(ebate)?$/i.test(program) ? 'C2D' : program) : null;
    return { sub_brand: sub ?? 'Regular', program: prog, level_group: null, level, track: null, course_type: courseTypeOf(prog) };
  }

  if (brand === 'iG') {
    // i5, i6, i-Master는 레벨 묶음
    return { sub_brand: null, program: null, level_group: program ?? clean(raw.level_group), level, track: null };
  }

  return { sub_brand: sub, program, level_group: clean(raw.level_group), level, track: null };
}
