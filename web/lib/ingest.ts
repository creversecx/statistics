/**
 * Turning an uploaded sheet into rows of stat_facts, in the browser.
 *
 * The raw data the teams pull comes in a few shapes:
 *  - flat tables with one header row (콘텐츠 학습 raw: brch_name, week_name,
 *    cls_name, total, complete_total …; i-GARTEN 주간 시트 A–H열)
 *  - ERP report exports, where a pivot was saved as a sheet: the header sits a
 *    few rows down, group labels appear only on the first row of each group
 *    (merged cells) and there are "가맹 Total", "Week 9 Total" rows
 *  - working sheets with two tables side by side (April 주간 시트: 학원별 A–F,
 *    프로그램·레벨별 H–M)
 *
 * So: find the header row, split it into tables at blank columns, guess what
 * each column is from its header text and, failing that, from its values,
 * fill merged group labels down, drop total rows, and take semester/week from
 * the sheet or file name when the table itself doesn't carry them. Every guess
 * is shown to the uploader and can be changed before anything is saved.
 */
import {
  TOTAL_RE,
  normAlpha,
  normBranchType,
  parseSemester,
  parseWeek,
  weekStartFromLabel,
  type Metric,
} from './dims';
import { normalizeHierarchy } from './levels';

export type FieldId =
  | 'ignore'
  | 'brand'
  | 'semester'
  | 'year'
  | 'week'
  | 'branch_type'
  | 'branch'
  | 'alpha'
  | 'program'
  | 'level'
  | 'level_group'
  | 'grade'
  | 'class_name'
  | 'content'
  | 'component'
  | 'denom'
  | 'numer'
  | 'rest'
  | 'rate';

export const FIELDS: { id: FieldId; label: string; dim?: boolean }[] = [
  { id: 'ignore', label: '— 사용 안 함' },
  { id: 'denom', label: '분모 (현원생 / 학습해야 할 건수)' },
  { id: 'numer', label: '분자 (수강생 / 완료 건수)' },
  { id: 'rest', label: '나머지 (미수강생 / 미완료 건수) — 분모 = 분자 + 나머지' },
  { id: 'rate', label: '비율 (참고용, 저장 안 함)' },
  { id: 'brand', label: '브랜드', dim: true },
  { id: 'semester', label: '학기', dim: true },
  { id: 'year', label: '연도', dim: true },
  { id: 'week', label: '주차', dim: true },
  { id: 'branch_type', label: '직/가맹', dim: true },
  { id: 'branch', label: '학원', dim: true },
  { id: 'alpha', label: '알파/4.0', dim: true },
  { id: 'program', label: '프로그램', dim: true },
  { id: 'level', label: '레벨', dim: true },
  { id: 'level_group', label: '레벨 그룹', dim: true },
  { id: 'grade', label: '학년', dim: true },
  { id: 'class_name', label: '반', dim: true },
  { id: 'content', label: '콘텐츠', dim: true },
  { id: 'component', label: '학습 유형', dim: true },
];

/** Header text (lowercase, spaces and punctuation removed) → field. First match wins, most specific first. */
const ALIASES: [FieldId, string[]][] = [
  ['rest', ['미수강', '미완료', '미학습']],
  ['numer', ['학습완료된건수', '학습완료건수', '완료건수', 'complete_total', 'completetotal', '온라인수강생', '수강생수', '수강생', '학습대상자수', '학습대상자', 'elearning학생수', '완료학생수', 'numer']],
  ['denom', ['학습해야할건수', '총학습건수', '학습건수', '현원생수', '현원생', '재원생수', '재원생', '대상건수', 'total', 'denom']],
  ['rate', ['수강률', '수강율', '완료율', '학습완료율', 'rate', '학습률']],
  ['alpha', ['알파여부', 'alpha여부', 'α/4.0', 'alpha']],
  ['branch_type', ['직/가맹', '직가맹', 'branch_type', 'branchtype', '학원분류', '직영가맹']],
  ['class_name', ['cls_name', 'clsname', '반명', '반이름', 'class']],
  ['branch', ['brch_name', 'brchname', '학원명', '학원', '캠퍼스', 'branch', '지점']],
  ['semester', ['sem_name', 'semname', '학기명', '학기', 'semester']],
  ['week', ['week_name', 'weekname', '주차', 'week', 'wk']],
  ['year', ['년도', '연도', 'year']],
  ['level_group', ['levelgroup', '레벨그룹']],
  ['level', ['level_code', 'levelcode', 'levelname', '레벨', 'level']],
  ['program', ['syl_name', '프로그램', 'program']],
  ['grade', ['학년그룹', '학년', 'grade']],
  ['content', ['learn_div', 'learndiv', '콘텐츠', '컨텐츠', 'content']],
  ['component', ['esdtl_type', 'esdtltype', 'componentname', 'component', '학습유형', 'learn_type']],
  ['brand', ['브랜드', 'brand']],
];

const norm = (v: unknown) =>
  String(v ?? '')
    .toLowerCase()
    .replace(/[\s\n\r'"`()[\]{}:.,·]/g, '');

export function fieldFromHeader(h: unknown): FieldId | null {
  const n = norm(h);
  if (!n || n.length > 40) return null;
  for (const [field, list] of ALIASES) {
    // A cell with digits ("Level 2", "Week 9") is a value, not a header, unless it is exactly an alias.
    if (list.some((a) => n === a || (a.length >= 2 && !/\d/.test(n) && n.includes(a)))) return field;
  }
  return null;
}

export type Cell = string | number | boolean | Date | null;
export type Grid = Cell[][];

export type Block = { start: number; end: number; score: number; label: string };

export type Layout = {
  headerRow: number; // 0-based
  blocks: Block[];
  block: number; // index into blocks
  columns: { index: number; header: string; field: FieldId; guessed: 'header' | 'values' | 'none' }[];
  fillDown: boolean;
};

const isNum = (v: Cell) => typeof v === 'number' && Number.isFinite(v);
const text = (v: Cell) => (v === null || v === undefined ? '' : v instanceof Date ? v.toISOString().slice(0, 10) : String(v).trim());

function headerScore(row: Cell[]) {
  let s = 0;
  for (const c of row) {
    if (typeof c === 'string' && fieldFromHeader(c)) s++;
    else if (typeof c === 'number') s -= 0.5; // data rows carry numbers; header rows don't
  }
  return s;
}

function splitBlocks(row: Cell[]): Block[] {
  const blocks: Block[] = [];
  let start = -1;
  for (let i = 0; i <= row.length; i++) {
    const filled = i < row.length && text(row[i]) !== '';
    if (filled && start < 0) start = i;
    if (!filled && start >= 0) {
      const cells = row.slice(start, i);
      const score = headerScore(cells);
      blocks.push({ start, end: i - 1, score, label: cells.map(text).filter(Boolean).slice(0, 4).join(' · ') });
      start = -1;
    }
  }
  return blocks;
}

/** Pivot exports leave room for the group labels: a header row with blanks between filled cells. Merge blocks then. */
function mergeBlocksForPivot(row: Cell[], blocks: Block[]): Block[] {
  if (blocks.length < 2) return blocks;
  const gaps = blocks.slice(1).map((b, i) => b.start - blocks[i].end - 1);
  // Short gaps (1–3 blank header cells) between scored blocks = one table with merged group columns.
  const out: Block[] = [];
  let cur = { ...blocks[0] };
  blocks.slice(1).forEach((b, i) => {
    // A run of label columns (Week, 구분 …) left of the counts belongs to the counts' table.
    if (gaps[i] <= 4 && !hasCounts(row, cur)) {
      cur = { start: cur.start, end: b.end, score: cur.score + b.score, label: `${cur.label} · ${b.label}` };
    } else {
      out.push(cur);
      cur = { ...b };
    }
  });
  out.push(cur);
  return out;
}

const hasCounts = (row: Cell[], b: Block) => hasField(row, b, 'denom') || hasField(row, b, 'numer');

function hasField(row: Cell[], b: Block, f: FieldId) {
  for (let i = b.start; i <= b.end; i++) if (fieldFromHeader(row[i]) === f) return true;
  return false;
}

/** What a column's values look like, for columns the header doesn't explain ("구분", blank). */
function sniff(values: Cell[]): FieldId | null {
  const filled = values.map(text).filter((v) => v && !TOTAL_RE.test(v));
  if (filled.length < 2) return null;
  const share = (fn: (v: string) => boolean) => filled.filter(fn).length / filled.length;
  if (share((v) => normBranchType(v) !== null) >= 0.8) return 'branch_type';
  if (share((v) => /^(α|alpha|알파|4|4\.0)$/i.test(v)) >= 0.8) return 'alpha';
  if (share((v) => /week|wk/i.test(v) && parseWeek(v) !== null) >= 0.8) return 'week';
  if (share((v) => /학기|봄|여름|가을|겨울/.test(v) && parseSemester(v) !== null) >= 0.8) return 'semester';
  return null;
}

export function detectLayout(grid: Grid, prefer?: { headerRow?: number; block?: number }): Layout | null {
  const scan = Math.min(grid.length, 25);
  let headerRow = prefer?.headerRow ?? -1;
  if (headerRow < 0) {
    let best = 1;
    for (let r = 0; r < scan; r++) {
      const s = headerScore(grid[r] ?? []);
      if (s > best) {
        best = s;
        headerRow = r;
      }
    }
  }
  if (headerRow < 0) return null;
  const row = grid[headerRow] ?? [];
  const blocks = mergeBlocksForPivot(row, splitBlocks(row)).filter((b) => b.score > 0);
  if (blocks.length === 0) return null;
  let block = prefer?.block ?? -1;
  if (block < 0 || block >= blocks.length) {
    // The leftmost table that has counts: side tables to the right are usually summaries of it.
    block = Math.max(0, blocks.findIndex((b) => hasCounts(row, b)));
  }
  const { start, end } = blocks[block];
  const body = grid.slice(headerRow + 1, headerRow + 301);
  const used = new Set<FieldId>();
  const columns: Layout['columns'] = [];
  for (let i = start; i <= end; i++) {
    const header = text(row[i]);
    const values = body.map((r) => r?.[i] ?? null);
    let field: FieldId | null = null;
    let guessed: 'header' | 'values' | 'none' = 'none';
    const sniffed = sniff(values);
    const byHeader = fieldFromHeader(header);
    // Values beat a generic header ("구분" holding 직영/가맹), headers beat values otherwise.
    if (sniffed && (!byHeader || ['branch_type', 'week', 'semester'].includes(sniffed))) {
      field = sniffed;
      guessed = 'values';
    } else if (byHeader) {
      field = byHeader;
      guessed = 'header';
    }
    // Numbers in a text dimension's place mean we guessed wrong.
    if (field && FIELDS.find((f) => f.id === field)?.dim && field !== 'week' && field !== 'year') {
      const nums = values.filter(isNum).length;
      const filled = values.filter((v) => text(v) !== '').length;
      if (filled > 0 && nums / filled > 0.9 && !['level', 'class_name', 'branch'].includes(field)) field = null;
    }
    if (field && used.has(field) && field !== 'ignore') field = null;
    if (field) used.add(field);
    columns.push({ index: i, header: header || `(${colName(i)}열)`, field: field ?? 'ignore', guessed: field ? guessed : 'none' });
  }
  // Group labels shown only on the first row of each group → fill them down.
  const dimCols = columns.filter((c) => FIELDS.find((f) => f.id === c.field)?.dim);
  const denomCol = columns.find((c) => c.field === 'denom') ?? columns.find((c) => c.field === 'numer');
  let blanks = 0;
  let counted = 0;
  if (denomCol) {
    for (const r of body.slice(0, 200)) {
      if (!isNum(r?.[denomCol.index] ?? null)) continue;
      counted++;
      if (dimCols.some((c) => text(r?.[c.index] ?? null) === '')) blanks++;
    }
  }
  return { headerRow, blocks, block, columns, fillDown: counted > 0 && blanks / counted > 0.15 };
}

// ---------------------------------------------------------------------------
// 가로로 펼친 ERP 피벗 (Week → 학년그룹 → 학년 → 재원생 수 / 학습대상자수 / Rate)
// ---------------------------------------------------------------------------

export type Unpivoted = { grid: Grid; leaves: number; rows: number };

/** "초1 (grade 1)" → "초1", "중" → "중" */
/** "초1 (grade 1)" → "초1", "유아 6세" → "유6", "중" → "중", "유" → "유" */
function normGrade(v: string): string | null {
  const s = v.trim();
  const kid = s.match(/^유(?:아|치)?\s*(\d)?\s*세?$/);
  if (kid) return `유${kid[1] ?? ''}`;
  const m = s.match(/^(초|중|고)\s*(\d)?/);
  return m ? `${m[1]}${m[2] ?? ''}` : null;
}

/**
 * ERP report exports with measures repeated across the columns, one block per
 * week (and per 학년) — the shape the IT team's API will send. Turns them
 * into a long table: one row per (원래 행 × 주차 × 학년) with the row labels
 * filled in, subtotal rows and Total columns dropped. Returns null when the
 * sheet isn't laid out that way.
 */
export function unpivotWide(grid: Grid): Unpivoted | null {
  const scan = Math.min(grid.length, 15);
  let mrow = -1;
  for (let r = 0; r < scan; r++) {
    const row = grid[r] ?? [];
    const denoms = row.filter((c) => typeof c === 'string' && fieldFromHeader(c) === 'denom').length;
    const numers = row.filter((c) => typeof c === 'string' && fieldFromHeader(c) === 'numer').length;
    if (denoms >= 2 && numers >= 2) {
      mrow = r;
      break;
    }
  }
  if (mrow < 0) return null;
  const width = Math.max(...grid.slice(0, mrow + 1).map((r) => (r ?? []).length), 0);
  const meas = grid[mrow] ?? [];
  const first = meas.findIndex((c) => typeof c === 'string' && ['denom', 'numer'].includes(fieldFromHeader(c) ?? ''));
  // Column paths: header rows above the measure row, carried to the right from the first measure column on.
  const paths: string[][] = Array.from({ length: width }, () => []);
  for (let r = 0; r < mrow; r++) {
    let last = '';
    for (let j = first; j < width; j++) {
      const v = text((grid[r] ?? [])[j] ?? null);
      if (v) last = v;
      if (last) paths[j].push(last);
    }
  }
  type Leaf = { week: number | null; grade: string | null; other: string | null; cols: Partial<Record<'denom' | 'numer' | 'rest', number>> };
  const leaves = new Map<string, Leaf>();
  for (let j = first; j < width; j++) {
    const f = fieldFromHeader(meas[j]);
    if (f !== 'denom' && f !== 'numer' && f !== 'rest') continue;
    const path = paths[j];
    if (path.some((p) => TOTAL_RE.test(p))) continue;
    let week: number | null = null;
    let grade: string | null = null;
    let other: string | null = null;
    for (const p of path) {
      if (/week|wk|주차/i.test(p) && parseWeek(p) !== null) week = parseWeek(p);
      else if (normGrade(p)) {
        // The path holds both 학년그룹 ("초") and 학년 ("초3 (grade 3)"): keep the more specific one.
        const g = normGrade(p)!;
        if (grade === null || g.length >= grade.length) grade = g;
      }
      else if (!/^(학년|학년그룹|level group|week|구분)/i.test(p)) other = p;
    }
    if (week === null && grade === null && other === null) continue;
    const key = `${week}|${grade}|${other}`;
    const leaf = leaves.get(key) ?? { week, grade, other, cols: {} };
    if (leaf.cols[f] === undefined) leaf.cols[f] = j;
    leaves.set(key, leaf);
  }
  const usable = [...leaves.values()].filter((l) => l.cols.numer !== undefined && (l.cols.denom !== undefined || l.cols.rest !== undefined));
  if (usable.length === 0) return null;

  const dimCols = Array.from({ length: first }, (_, j) => ({ j, label: text(meas[j] ?? null) })).filter((d) => d.label);
  const hasOther = usable.some((l) => l.other !== null);
  const header: Cell[] = [...dimCols.map((d) => d.label), '주차', '학년', ...(hasOther ? ['프로그램'] : []), '재원생 수', '학습대상자수', '미수강생'];
  const out: Grid = [header];
  const last: (string | null)[] = dimCols.map(() => null);
  let rows = 0;
  for (let r = mrow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    let total = false;
    dimCols.forEach((d, k) => {
      const v = text(row[d.j] ?? null);
      if (v) {
        if (TOTAL_RE.test(v)) total = true;
        // A *different* outer label starts a new group and clears the inner ones; the same label
        // repeated on every row (ERP writes Branch each time but leaves a repeated Program blank) does not.
        if (v !== last[k]) for (let i = k + 1; i < last.length; i++) if (!text(row[dimCols[i].j] ?? null)) last[i] = null;
        last[k] = v;
      }
    });
    if (total) continue;
    let any = false;
    for (const l of usable) {
      const n = row[l.cols.numer!];
      const d = l.cols.denom !== undefined ? row[l.cols.denom] : null;
      const rest = l.cols.rest !== undefined ? row[l.cols.rest] : null;
      if (!isNum(n) && !isNum(d) && !isNum(rest)) continue;
      any = true;
      out.push([
        ...last,
        l.week !== null ? `Week ${l.week}` : null,
        l.grade,
        ...(hasOther ? [l.other] : []),
        isNum(d) ? d : null,
        isNum(n) ? n : 0,
        isNum(rest) ? rest : null,
      ]);
    }
    if (any) rows++;
  }
  return { grid: out, leaves: usable.length, rows };
}

export function colName(i: number) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// ---------------------------------------------------------------------------
// 상수(시트/파일 이름에서 얻거나 직접 입력)
// ---------------------------------------------------------------------------

export function guessBrand(fileName: string): string | null {
  const f = fileName.toLowerCase();
  if (/prime/.test(f)) return 'CD';
  if (/i-?garten|igarten|\big\b|아이가튼/.test(f)) return 'iG';
  if (/april|에이프릴|\bap\b|meme|buff|v-class|vena/.test(f)) return 'AP';
  if (/the\s*open|p-learning|\bto\b/.test(f)) return 'CD';
  if (/청담|cdi|\bcd\b/.test(f)) return 'CD';
  return null;
}

/** CD의 서브브랜드: 시트·파일 이름에 Prime이면 중등관, p-Learning·The Open·TO면 TO(→ 일반관 ESL+EFL), 아니면 일반관. */
export function guessSubBrand(brand: string, name: string): string {
  if (brand !== 'CD') return '';
  const f = name.toLowerCase();
  if (/prime/.test(f)) return 'Prime';
  if (/the\s*open|p-learning|(^|[^a-z])to([^a-z]|$)/.test(f)) return 'TO';
  return 'Regular';
}

export function guessMetric(layout: Layout): Metric {
  const heads = layout.columns.map((c) => norm(c.header)).join(' ');
  return /완료|complete|학습해야|총학습/.test(heads) ? 'complete' : 'enroll';
}

/** "25년 buff" → 2025, so sheet "봄" becomes 25 봄. */
export function yearFromName(name: string): number | null {
  const m = name.match(/(?:^|[^\d])(20\d{2}|\d{2})(?:년|_|\s|'|$|[^\d])/);
  if (!m) return null;
  const n = Number(m[1]);
  const y = n < 100 ? 2000 + n : n;
  return y >= 2010 && y <= 2099 ? y : null;
}

export type Constants = {
  brand: string;
  /** '' = 표에서 찾기 (April: 알파/4.0 열·수업명) */
  sub_brand?: string;
  metric: Metric;
  semester: string; // used when no column and the sheet name has none
  week: string;
  branch_type: string;
  program: string;
  content: string;
  firstWeekStart: string; // yyyy-mm-dd, optional
  semesterFromSheet: boolean;
  weekFromSheet: boolean;
};

export type FactRow = {
  brand: string;
  sub_brand: string | null;
  course_type: string | null;
  track: string | null;
  year: number | null;
  term: string | null;
  semester: string | null;
  sem_order: number | null;
  week: number | null;
  week_start: string | null;
  branch_type: string | null;
  branch: string | null;
  alpha: string | null;
  program: string | null;
  level: string | null;
  level_group: string | null;
  grade: string | null;
  class_name: string | null;
  content: string | null;
  component: string | null;
  denom: number;
  numer: number;
};

export type ParseResult = {
  rows: FactRow[]; // aggregated
  read: number;
  used: number;
  skipped: { total: number; noNumber: number; noDim: number };
  warnings: string[];
};

const KEY_FIELDS: (keyof FactRow)[] = [
  'brand', 'sub_brand', 'course_type', 'semester', 'week', 'week_start', 'branch_type', 'branch', 'alpha', 'program', 'level',
  'level_group', 'track', 'grade', 'class_name', 'content', 'component',
];

function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Applies a layout to one sheet. `into` lets several sheets add up into one result. */
export function extract(
  grid: Grid,
  layout: Layout,
  k: Constants,
  ctx: { sheetName: string; fileName: string },
  into?: Map<string, FactRow>
): ParseResult & { map: Map<string, FactRow> } {
  const map = into ?? new Map<string, FactRow>();
  const warnings: string[] = [];
  const col = (f: FieldId) => layout.columns.find((c) => c.field === f)?.index;
  const denomI = col('denom');
  const numerI = col('numer');
  // Older sheets carry 수강생 + 미수강생 instead of 현원생: the denominator is their sum.
  const restI = denomI === undefined ? col('rest') : undefined;
  if ((denomI === undefined && restI === undefined) || numerI === undefined) {
    return { rows: [], read: 0, used: 0, skipped: { total: 0, noNumber: 0, noDim: 0 }, warnings: ['분모와 분자 열을 정해 주세요.'], map };
  }
  const dimCols = layout.columns.filter((c) => FIELDS.find((f) => f.id === c.field)?.dim);

  const nameYear = yearFromName(ctx.sheetName) ?? yearFromName(ctx.fileName);
  const sheetSem = k.semesterFromSheet ? parseSemester(ctx.sheetName, nameYear) ?? parseSemester(ctx.fileName, nameYear) : null;
  const constSem = parseSemester(k.semester, nameYear);
  const sheetWeek = k.weekFromSheet ? parseWeek(ctx.sheetName.replace(/^[^]*?(week|wk)/i, '$1')) : null;
  const constWeek = parseWeek(k.week);

  const last: Record<string, string> = {};
  let read = 0;
  let used = 0;
  const skipped = { total: 0, noNumber: 0, noDim: 0 };

  for (let r = layout.headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row) continue;
    const raw: Record<string, string> = {};
    let isTotal = false;
    let anyDim = false;
    for (const c of dimCols) {
      let v = text(row[c.index] ?? null);
      if (v && TOTAL_RE.test(v)) {
        isTotal = true;
        continue;
      }
      if (v) {
        anyDim = true;
        last[c.field] = v;
      } else if (layout.fillDown && last[c.field]) {
        v = last[c.field];
      }
      raw[c.field] = v;
    }
    const n = row[numerI];
    const rest = restI !== undefined ? row[restI] : null;
    const d: Cell =
      denomI !== undefined
        ? row[denomI]
        : isNum(n) || isNum(rest)
          ? (isNum(n) ? (n as number) : 0) + (isNum(rest) ? (rest as number) : 0)
          : null;
    const hasNumbers = isNum(d) || isNum(n);
    if (!hasNumbers && !anyDim) continue; // blank line
    read++;
    if (isTotal) {
      skipped.total++;
      continue;
    }
    if (!isNum(d)) {
      skipped.noNumber++;
      continue;
    }
    if (!anyDim && dimCols.length > 0) {
      skipped.noDim++;
      continue;
    }

    const yearCol = raw.year ? Number(raw.year) || null : null;
    const sem =
      (raw.semester ? parseSemester(raw.semester, yearCol ?? nameYear) : null) ?? sheetSem ?? constSem ?? null;
    const week = (raw.week ? parseWeek(raw.week) : null) ?? sheetWeek ?? constWeek ?? null;
    let weekStart = raw.week ? weekStartFromLabel(raw.week, sem?.year ?? null) : null;
    if (!weekStart && k.firstWeekStart && week) weekStart = addDays(k.firstWeekStart, (week - 1) * 7);

    const fact: FactRow = {
      brand: k.brand,
      sub_brand: null,
      course_type: null,
      track: null,
      year: sem?.year ?? yearCol,
      term: sem?.term ?? null,
      semester: sem?.label ?? null,
      sem_order: sem?.order ?? null,
      week,
      week_start: weekStart,
      branch_type: normBranchType(raw.branch_type) ?? (k.branch_type || null),
      branch: raw.branch || null,
      alpha: raw.alpha ? normAlpha(raw.alpha) : null,
      program: raw.program || k.program || null,
      level: raw.level || null,
      level_group: raw.level_group || null,
      grade: raw.grade || null,
      class_name: raw.class_name || null,
      content: raw.content || k.content || null,
      component: raw.component || null,
      denom: d as number,
      numer: isNum(n) ? (n as number) : 0,
    };
    // 브랜드 위계: 서브브랜드, 프로그램(CD만), 레벨그룹, 레벨 이름 정리
    const h = normalizeHierarchy(k.brand, { sub_brand: k.sub_brand || null, program: fact.program, level: fact.level, level_group: fact.level_group, alpha: fact.alpha });
    fact.sub_brand = h.sub_brand;
    fact.program = h.program;
    fact.level_group = h.level_group;
    fact.level = h.level;
    fact.track = h.track;
    fact.course_type = h.course_type ?? null;
    const key = KEY_FIELDS.map((f) => fact[f] ?? '').join('\u0001');
    const prev = map.get(key);
    if (prev) {
      prev.denom += fact.denom;
      prev.numer += fact.numer;
    } else {
      map.set(key, fact);
    }
    used++;
  }

  const rows = [...map.values()];
  if (used > 0 && rows.every((x) => !x.semester)) warnings.push('학기를 알 수 없습니다. 학기 열을 고르거나 학기를 직접 입력하세요.');
  if (used > 0 && rows.every((x) => x.week === null)) warnings.push('주차가 없습니다. 주차별 추이를 보려면 주차 열이나 값을 정하세요.');
  return { rows, read, used, skipped, warnings, map };
}
