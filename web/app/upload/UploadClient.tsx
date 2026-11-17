'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BRANDS, METRICS, brandName, type Metric } from '@/lib/dims';
import {
  FIELDS,
  colName,
  detectLayout,
  extract,
  guessBrand,
  guessMetric,
  type Constants,
  type FactRow,
  type FieldId,
  type Grid,
  type Layout,
  type ParseResult,
} from '@/lib/ingest';
import { num, pct } from '@/components/charts/common';

type XLSXMod = typeof import('xlsx');
type Overlap = { id: string; name: string; rows: number; created_at: string };

const CHUNK = 3000;

async function loadXlsx(): Promise<XLSXMod> {
  return import('xlsx');
}

/** CSV from Korean Excel is often CP949; try UTF-8 first. */
async function readCsv(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('euc-kr').decode(buf);
  }
}

function toGrid(XLSX: XLSXMod, sheet: import('xlsx').WorkSheet): Grid {
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true }) as Grid;
}

export function UploadClient() {
  const [file, setFile] = useState<File | null>(null);
  const [buf, setBuf] = useState<ArrayBuffer | string | null>(null);
  const [sheets, setSheets] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [sheetQ, setSheetQ] = useState('');
  const [grid, setGrid] = useState<Grid | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [k, setK] = useState<Constants>({
    brand: '',
    metric: 'enroll',
    semester: '',
    week: '',
    branch_type: '',
    program: '',
    content: '',
    firstWeekStart: '',
    semesterFromSheet: true,
    weekFromSheet: true,
  });
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overlap, setOverlap] = useState<{ id: string; list: Overlap[] } | null>(null);
  const [done, setDone] = useState<{ rows: number; removed: number; name: string } | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);

  // Questions and results appear above the button the uploader just pressed: bring them into view.
  useEffect(() => {
    if (overlap || done || (error && !busy)) top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [overlap, done, error, busy]);

  // ---- file ----------------------------------------------------------------
  async function onFile(f: File) {
    reset();
    setFile(f);
    setBusy('파일을 읽는 중…');
    try {
      const XLSX = await loadXlsx();
      let names: string[];
      if (/\.csv$/i.test(f.name)) {
        const text = await readCsv(f);
        setBuf(text);
        names = XLSX.read(text, { type: 'string', bookSheets: true }).SheetNames;
      } else {
        const ab = await f.arrayBuffer();
        setBuf(ab);
        names = XLSX.read(ab, { bookSheets: true }).SheetNames;
      }
      setSheets(names);
      const brand = guessBrand(f.name);
      setK((c) => ({ ...c, brand: brand ?? c.brand }));
      setName(f.name.replace(/\.[^.]+$/, ''));
      if (names.length === 1) await pick([names[0]], f, names);
    } catch (e) {
      setError(`파일을 읽지 못했습니다: ${e instanceof Error ? e.message : e}`);
    } finally {
      setBusy(null);
    }
  }

  function reset() {
    setFile(null);
    setBuf(null);
    setSheets([]);
    setPicked([]);
    setGrid(null);
    setLayout(null);
    setError(null);
    setDone(null);
    setOverlap(null);
    setProgress(null);
  }

  async function readSheets(names: string[], source = buf, f = file): Promise<Record<string, Grid>> {
    const XLSX = await loadXlsx();
    const wb =
      typeof source === 'string'
        ? XLSX.read(source, { type: 'string', cellDates: true })
        : XLSX.read(source as ArrayBuffer, { sheets: names, cellDates: true });
    const out: Record<string, Grid> = {};
    for (const n of names) if (wb.Sheets[n]) out[n] = toGrid(XLSX, wb.Sheets[n]);
    void f;
    return out;
  }

  /** The first picked sheet is the sample the mapping is built on. */
  async function pick(next: string[], f = file, names = sheets) {
    setPicked(next);
    setError(null);
    if (next.length === 0) {
      setGrid(null);
      setLayout(null);
      return;
    }
    if (grid && layout && next[0] === picked[0]) return;
    setBusy('시트를 살펴보는 중…');
    try {
      let source = buf;
      if (!source && f) source = /\.csv$/i.test(f.name) ? await readCsv(f) : await f.arrayBuffer();
      const g = (await readSheets([next[0]], source, f))[next[0]];
      setGrid(g);
      const l = detectLayout(g);
      setLayout(l);
      if (l) setK((c) => ({ ...c, metric: guessMetric(l) }));
      else setError('표의 머리글(현원생, 수강생, 학습해야 할 건수 같은 열 이름)을 찾지 못했습니다. 아래에서 머리글 행을 직접 고르세요.');
      void names;
    } finally {
      setBusy(null);
    }
  }

  function relayout(prefer: { headerRow?: number; block?: number }) {
    if (!grid) return;
    const l = detectLayout(grid, { headerRow: prefer.headerRow ?? layout?.headerRow, block: prefer.block });
    setLayout(l);
    if (l) setK((c) => ({ ...c, metric: guessMetric(l) }));
  }

  function setField(index: number, field: FieldId) {
    if (!layout) return;
    setLayout({
      ...layout,
      columns: layout.columns.map((c) =>
        c.index === index ? { ...c, field } : field !== 'ignore' && c.field === field ? { ...c, field: 'ignore' } : c
      ),
    });
  }

  // ---- preview (first picked sheet) -----------------------------------------
  const preview: ParseResult | null = useMemo(() => {
    if (!grid || !layout || !file) return null;
    return extract(grid, layout, k, { sheetName: picked[0], fileName: file.name });
  }, [grid, layout, k, picked, file]);

  const has = (f: FieldId) => !!layout?.columns.some((c) => c.field === f);
  const samples = useMemo(() => {
    if (!grid || !layout) return [];
    const out: Grid = [];
    for (let r = layout.headerRow + 1; r < grid.length && out.length < 4; r++) {
      const row = grid[r];
      if (row && row.some((v) => v !== null && v !== '')) out.push(row);
    }
    return out;
  }, [grid, layout]);

  const shownSheets = useMemo(() => {
    const q = sheetQ.trim().toLowerCase();
    return q ? sheets.filter((s) => s.toLowerCase().includes(q)) : sheets;
  }, [sheets, sheetQ]);

  const breakdown = useMemo(() => {
    if (!preview) return [];
    const m = new Map<string, { d: number; n: number }>();
    for (const r of preview.rows) {
      const key = `${r.semester ?? '학기?'} · ${r.week ? `${r.week}주` : '주차 없음'}`;
      const cur = m.get(key) ?? { d: 0, n: 0 };
      cur.d += r.denom;
      cur.n += r.numer;
      m.set(key, cur);
    }
    return [...m.entries()].slice(0, 12);
  }, [preview]);

  const canUpload = !!preview && preview.used > 0 && !!k.brand && !!name.trim() && !busy;

  // ---- upload --------------------------------------------------------------
  async function upload() {
    if (!file || !layout || !grid) return;
    setError(null);
    setBusy('선택한 시트를 모두 읽는 중…');
    setProgress(0);
    let datasetId: string | null = null;
    try {
      // Parse every picked sheet with the same mapping (matched by header text, else by position).
      const grids = picked.length === 1 ? { [picked[0]]: grid } : await readSheets(picked);
      const map = new Map<string, FactRow>();
      let used = 0;
      const unread: string[] = [];
      for (const s of picked) {
        const g = grids[s];
        if (!g) continue;
        const l = s === picked[0] ? layout : adapt(layout, g);
        if (!l) {
          unread.push(s);
          continue;
        }
        const res = extract(g, l, k, { sheetName: s, fileName: file.name }, map);
        used += res.used;
        await new Promise((r) => setTimeout(r, 0));
      }
      const rows = [...map.values()];
      if (rows.length === 0) throw new Error('올릴 행이 없습니다.');

      setBusy(`${num(rows.length)}행을 올리는 중…`);
      const created = await post('/api/datasets', {
        name: name.trim(),
        brand: k.brand,
        metric: k.metric,
        source_file: file.name,
        source_sheets: picked,
        note,
        mapping: {
          headerRow: layout.headerRow,
          block: layout.block,
          fillDown: layout.fillDown,
          columns: layout.columns.filter((c) => c.field !== 'ignore').map((c) => ({ header: c.header, field: c.field })),
          constants: k,
          unread,
          used,
        },
      });
      datasetId = created.id;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await post(`/api/datasets/${datasetId}/rows`, { rows: rows.slice(i, i + CHUNK) });
        setProgress(Math.min(1, (i + CHUNK) / rows.length));
      }
      const ov = await fetch(`/api/datasets/${datasetId}/finish`).then((r) => r.json());
      if ((ov.overlap ?? []).length > 0) {
        setOverlap({ id: datasetId!, list: ov.overlap });
        setBusy(null);
        if (unread.length) setError(`머리글을 찾지 못해 건너뛴 시트: ${unread.join(', ')}`);
        return;
      }
      await finish(datasetId!, false, unread);
    } catch (e) {
      if (datasetId) await fetch(`/api/datasets/${datasetId}`, { method: 'DELETE' }).catch(() => {});
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
      setProgress(null);
    }
  }

  async function finish(id: string, replace: boolean, unread: string[] = []) {
    setBusy('마무리하는 중…');
    try {
      const res = await post(`/api/datasets/${id}/finish`, { replace_overlap: replace });
      setDone({ rows: res.rows, removed: res.removed, name: name.trim() });
      setOverlap(null);
      if (unread.length) setError(`머리글을 찾지 못해 건너뛴 시트: ${unread.join(', ')}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  async function cancelOverlap() {
    if (!overlap) return;
    await fetch(`/api/datasets/${overlap.id}`, { method: 'DELETE' });
    setOverlap(null);
    setProgress(null);
  }

  // ---- render --------------------------------------------------------------
  if (done) {
    return (
      <div ref={top} className="card rise-in max-w-2xl scroll-mt-24 space-y-4 !p-8">
        <p className="text-xs font-semibold tracking-widest text-accent-cyan">업로드 완료</p>
        <h2 className="text-2xl font-extrabold">{done.name}</h2>
        <p className="text-sm text-white/75">
          {num(done.rows)}개 집계 행을 저장했습니다.{done.removed > 0 && ` 겹치던 기존 데이터 ${num(done.removed)}행은 이번 파일로 대체했습니다.`}
        </p>
        {error && <p className="text-sm text-amber-200">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard" className="btn-primary">
            분석 보러 가기
          </Link>
          <button onClick={reset} className="btn-secondary">
            다른 파일 올리기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={top} className="scroll-mt-24 space-y-6">
      {/* 1. 파일 */}
      <section
        className={`card spot flex flex-col items-center justify-center gap-3 border-dashed !p-10 text-center transition ${drag ? 'border-accent-cyan bg-accent-cyan/5' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onFile(f);
        }}
      >
        <input
          ref={input}
          type="file"
          accept=".xlsx,.xlsm,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        {file ? (
          <>
            <p className="text-lg font-semibold">{file.name}</p>
            <p className="text-sm text-white/65">
              {(file.size / 1024 / 1024).toFixed(1)}MB · 시트 {sheets.length}개
            </p>
            <button onClick={() => input.current?.click()} className="btn-secondary !py-2">
              다른 파일
            </button>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">raw 엑셀을 끌어다 놓거나 고르세요</p>
            <p className="max-w-xl text-sm leading-relaxed text-white/65">
              ERP &gt; Report &gt; i-Learning 수강률·학습률 내보내기, 콘텐츠 학습 raw(brch_name, week_name, total, complete_total …), 주간 집계 시트 모두 됩니다.
              .xlsx · .xlsm · .xls · .csv · 파일은 서버에 올라가지 않고, 브라우저에서 읽은 숫자만 저장합니다.
            </p>
            <button onClick={() => input.current?.click()} className="btn-primary mt-2">
              파일 고르기
            </button>
          </>
        )}
      </section>

      {busy && (
        <div className="card !p-4">
          <p className="text-sm text-white/80">{busy}</p>
          {progress !== null && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-accent-gradient transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {error && <p className="rounded-lg border border-rose-400/30 bg-rose-400/5 px-4 py-2.5 text-sm text-rose-300">{error}</p>}

      {overlap && (
        <div className="card rise-in space-y-3 border-amber-300/40 !p-5">
          <p className="font-semibold">이미 올라간 데이터와 겹칩니다</p>
          <p className="text-sm text-white/75">같은 브랜드·학기·주차·콘텐츠가 아래 데이터셋에 이미 있습니다. 그대로 두면 합계가 두 번 더해집니다.</p>
          <ul className="space-y-1 text-sm">
            {overlap.list.map((o) => (
              <li key={o.id} className="flex justify-between rounded-lg border border-line px-3 py-2">
                <span>{o.name}</span>
                <span className="text-white/60">겹치는 {num(o.rows)}행</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => finish(overlap.id, true)} className="btn-primary !py-2">
              겹치는 기존 행을 이번 파일로 대체
            </button>
            <button onClick={() => finish(overlap.id, false)} className="btn-secondary !py-2">
              둘 다 두기 (다른 기준의 표일 때만)
            </button>
            <button onClick={cancelOverlap} className="px-3 text-sm text-white/65 hover:text-white">
              올리지 않기
            </button>
          </div>
        </div>
      )}

      {/* 2. 시트 */}
      {sheets.length > 1 && (
        <section className="card !p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">시트 고르기</h2>
              <p className="text-xs text-white/60">
                같은 모양의 시트(주차별·학기별)를 여러 개 고르면 한 번에 올립니다. 학기·주차는 시트 이름에서 읽습니다. 첫 번째로 고른 시트로 열을 맞춥니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input className="field !w-56 !py-1.5 !text-xs" placeholder="시트 이름 검색 (예: 26_가을)" value={sheetQ} onChange={(e) => setSheetQ(e.target.value)} />
              <button className="text-xs text-white/70 hover:text-white" onClick={() => pick([...new Set([...picked, ...shownSheets])])}>
                보이는 것 모두
              </button>
              <button className="text-xs text-white/70 hover:text-white" onClick={() => pick([])}>
                해제
              </button>
            </div>
          </div>
          <div className="flex max-h-48 flex-wrap gap-1.5 overflow-auto">
            {shownSheets.map((s) => {
              const on = picked.includes(s);
              return (
                <button
                  key={s}
                  onClick={() => pick(on ? picked.filter((x) => x !== s) : [...picked, s])}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    on ? (picked[0] === s ? 'border-white bg-white font-semibold text-base-950' : 'border-accent-cyan/60 bg-accent-cyan/15') : 'border-line text-white/75 hover:bg-white/5'
                  }`}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {picked.length > 0 && <p className="mt-2 text-xs text-white/60">{picked.length}개 시트 선택 · 기준 시트: {picked[0]}</p>}
        </section>
      )}

      {/* 3. 열 */}
      {grid && (
        <section className="card !p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-semibold">열 맞추기</h2>
              <p className="text-xs text-white/60">열 이름과 값으로 자동으로 맞췄습니다. 틀린 곳만 고치세요.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-white/60">머리글 행</span>
                <select className="field !w-auto !py-1.5" value={layout?.headerRow ?? ''} onChange={(e) => relayout({ headerRow: Number(e.target.value), block: -1 })}>
                  {!layout && <option value="">선택</option>}
                  {grid.slice(0, 30).map((row, i) => (
                    <option key={i} value={i}>
                      {i + 1}행: {row.filter((v) => v !== null && v !== '').slice(0, 4).join(' · ').slice(0, 40)}
                    </option>
                  ))}
                </select>
              </label>
              {layout && layout.blocks.length > 1 && (
                <label className="flex items-center gap-2">
                  <span className="text-white/60">표</span>
                  <select className="field !w-auto !py-1.5" value={layout.block} onChange={(e) => relayout({ block: Number(e.target.value) })}>
                    {layout.blocks.map((b, i) => (
                      <option key={i} value={i}>
                        {colName(b.start)}–{colName(b.end)}열: {b.label.slice(0, 40)}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {layout && (
                <label className="flex cursor-pointer items-center gap-2 text-white/75" title="ERP 피벗처럼 그룹 이름이 첫 줄에만 있는 표">
                  <input type="checkbox" className="accent-sky-400" checked={layout.fillDown} onChange={(e) => setLayout({ ...layout, fillDown: e.target.checked })} />
                  빈 칸은 위 값으로 채우기 (병합 셀)
                </label>
              )}
            </div>
          </div>

          {layout && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-white/55">
                    <th className="px-2 py-1.5 text-left font-medium">열</th>
                    <th className="px-2 py-1.5 text-left font-medium">머리글</th>
                    <th className="px-2 py-1.5 text-left font-medium">무엇인가요</th>
                    <th className="px-2 py-1.5 text-left font-medium">값 예시</th>
                  </tr>
                </thead>
                <tbody>
                  {layout.columns.map((c) => (
                    <tr key={c.index} className={`border-t border-line ${c.field === 'ignore' ? 'opacity-60' : ''}`}>
                      <td className="px-2 py-1.5 text-white/55">{colName(c.index)}</td>
                      <td className="max-w-[220px] truncate px-2 py-1.5 font-medium" title={c.header}>
                        {c.header}
                      </td>
                      <td className="px-2 py-1.5">
                        <select
                          className={`field !w-56 !rounded-lg !py-1 !text-xs ${c.field === 'denom' || c.field === 'numer' ? '!border-accent-cyan/60' : ''}`}
                          value={c.field}
                          onChange={(e) => setField(c.index, e.target.value as FieldId)}
                        >
                          {FIELDS.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                        {c.guessed === 'values' && <span className="ml-2 text-[10px] text-accent-cyan">값으로 추정</span>}
                      </td>
                      <td className="max-w-[360px] truncate px-2 py-1.5 text-white/65">
                        {samples.map((r) => (r[c.index] === null || r[c.index] === undefined ? '·' : String(r[c.index]).slice(0, 18))).join('  |  ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 4. 상수 */}
      {layout && (
        <section className="card grid gap-4 !p-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-3">
            <h2 className="font-semibold">무슨 데이터인가요</h2>
            <p className="text-xs text-white/60">표에 없는 정보는 여기서 정합니다. 표에 열이 있으면 표가 우선입니다.</p>
          </div>
          <Field label="브랜드 *">
            <select className="field !py-2" value={k.brand} onChange={(e) => setK({ ...k, brand: e.target.value })}>
              <option value="">고르세요</option>
              {BRANDS.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="지표 *">
            <select className="field !py-2" value={k.metric} onChange={(e) => setK({ ...k, metric: e.target.value as Metric })}>
              {(Object.keys(METRICS) as Metric[]).map((m) => (
                <option key={m} value={m}>
                  {METRICS[m].label} ({METRICS[m].denom} → {METRICS[m].numer})
                </option>
              ))}
            </select>
          </Field>
          <Field label="데이터셋 이름 *">
            <input className="field !py-2" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={has('semester') ? '학기 (표의 학기 열 사용)' : '학기'}>
            <div className="space-y-1.5">
              <input
                className="field !py-2"
                placeholder="예: 26 가을, 26_2학기"
                value={k.semester}
                disabled={has('semester')}
                onChange={(e) => setK({ ...k, semester: e.target.value })}
              />
              {!has('semester') && (
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" className="accent-sky-400" checked={k.semesterFromSheet} onChange={(e) => setK({ ...k, semesterFromSheet: e.target.checked })} />
                  시트·파일 이름에 학기가 있으면 그것을 우선
                </label>
              )}
            </div>
          </Field>
          <Field label={has('week') ? '주차 (표의 주차 열 사용)' : '주차'}>
            <div className="space-y-1.5">
              <input className="field !py-2" placeholder="예: 9 (학기 전체 합계면 비워 두기)" value={k.week} disabled={has('week')} onChange={(e) => setK({ ...k, week: e.target.value })} />
              {!has('week') && (
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input type="checkbox" className="accent-sky-400" checked={k.weekFromSheet} onChange={(e) => setK({ ...k, weekFromSheet: e.target.checked })} />
                  시트 이름의 Week 숫자를 우선
                </label>
              )}
            </div>
          </Field>
          <Field label="1주차 시작일 (월별 보기용, 선택)">
            <input type="date" className="field !py-2" value={k.firstWeekStart} onChange={(e) => setK({ ...k, firstWeekStart: e.target.value })} />
          </Field>
          {!has('branch_type') && (
            <Field label="직/가맹 (표에 없을 때, 선택)">
              <select className="field !py-2" value={k.branch_type} onChange={(e) => setK({ ...k, branch_type: e.target.value })}>
                <option value="">학원 정보에서 채우기</option>
                <option value="직영">모두 직영</option>
                <option value="가맹">모두 가맹</option>
              </select>
            </Field>
          )}
          {!has('program') && (
            <Field label="프로그램 (표에 없을 때, 선택)">
              <input className="field !py-2" placeholder="예: C1" value={k.program} onChange={(e) => setK({ ...k, program: e.target.value })} />
            </Field>
          )}
          {!has('content') && (
            <Field label="콘텐츠 (표에 없을 때, 선택)">
              <input className="field !py-2" placeholder="예: Vena Talk, April Buff, CV" value={k.content} onChange={(e) => setK({ ...k, content: e.target.value })} />
            </Field>
          )}
          <Field label="메모 (선택)" wide>
            <input className="field !py-2" placeholder="예: ERP 기준일 11/09, 셀바스용 제외" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </section>
      )}

      {/* 5. 미리보기 */}
      {preview && layout && (
        <section className="card !p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">미리보기 · {picked[0] ?? ''}</h2>
              <p className="text-xs text-white/60">
                읽은 행 {num(preview.read)} · 사용 {num(preview.used)} · 합계 행 제외 {num(preview.skipped.total)} · 숫자 없음 {num(preview.skipped.noNumber)}
                {preview.skipped.noDim ? ` · 구분 없음 ${num(preview.skipped.noDim)}` : ''} → 저장할 집계 행 {num(preview.rows.length)}
                {picked.length > 1 ? ` (시트 ${picked.length}개 전체는 올릴 때 계산)` : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/60">
                {k.brand ? brandName(k.brand) : '브랜드?'} · {METRICS[k.metric].rate}
              </p>
              <p className="gradient-text text-3xl font-extrabold tabular-nums">
                {pct(preview.rows.reduce((a, r) => a + r.numer, 0) / Math.max(1, preview.rows.reduce((a, r) => a + r.denom, 0)))}
              </p>
              <p className="text-xs text-white/60 tabular-nums">
                {METRICS[k.metric].numer} {num(preview.rows.reduce((a, r) => a + r.numer, 0))} / {METRICS[k.metric].denom} {num(preview.rows.reduce((a, r) => a + r.denom, 0))}
              </p>
            </div>
          </div>
          {preview.warnings.map((w) => (
            <p key={w} className="mb-2 rounded-lg border border-amber-300/30 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">
              {w}
            </p>
          ))}
          {preview.rows.length > 60000 && (
            <p className="mb-2 rounded-lg border border-amber-300/30 bg-amber-300/5 px-3 py-2 text-xs text-amber-100">
              행이 많습니다({num(preview.rows.length)}). 반 단위 분석이 필요 없다면 “반” 열을 “사용 안 함”으로 바꾸면 학원·레벨 단위로 묶여 훨씬 가벼워집니다.
            </p>
          )}
          {breakdown.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {breakdown.map(([key, v]) => (
                <span key={key} className="tag-pill !tracking-normal">
                  {key} · {pct(v.n / Math.max(1, v.d))}
                </span>
              ))}
            </div>
          )}
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-base-900 text-white/55">
                <tr>
                  {['학기', '주차', '직/가맹', '학원', '알파', '프로그램', '레벨', '학년', '반', '콘텐츠', '유형', METRICS[k.metric].denom, METRICS[k.metric].numer, METRICS[k.metric].rate].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 40).map((r, i) => (
                  <tr key={i} className="border-t border-line">
                    {[r.semester, r.week, r.branch_type, r.branch, r.alpha, r.program, r.level, r.grade, r.class_name, r.content, r.component].map((v, j) => (
                      <td key={j} className="max-w-[160px] truncate whitespace-nowrap px-2 py-1 text-white/80">
                        {v ?? <span className="text-white/30">–</span>}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right tabular-nums">{num(r.denom)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{num(r.numer)}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{pct(r.denom ? r.numer / r.denom : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-white/60">
              {!k.brand ? '브랜드를 고르세요.' : !has('denom') || !has('numer') ? '분모·분자 열을 정하세요.' : '올리면 바로 분석 화면에 반영됩니다.'}
            </p>
            <button onClick={upload} disabled={!canUpload} className="btn-primary disabled:opacity-40">
              {picked.length > 1 ? `시트 ${picked.length}개 올리기` : '올리기'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'md:col-span-2 xl:col-span-3' : ''}`}>
      <span className="mb-1.5 block text-xs font-medium text-white/70">{label}</span>
      {children}
    </label>
  );
}

/** Another sheet of the same kind: its own header row and table, columns matched by header text, else position. */
function adapt(base: Layout, g: Grid): Layout | null {
  const own = detectLayout(g);
  if (!own) return null;
  const headerRow = own.headerRow;
  const row = g[headerRow] ?? [];
  const norm = (v: unknown) => String(v ?? '').replace(/\s+/g, '').toLowerCase();
  const offset = own.blocks[own.block].start - base.blocks[base.block].start;
  const columns = base.columns.map((c) => {
    const want = norm(c.header);
    const found = own.columns.find((oc) => norm(oc.header) === want);
    const index = found ? found.index : c.index + offset;
    return { ...c, index, header: String(row[index] ?? c.header) };
  });
  return { ...own, columns, fillDown: base.fillDown };
}

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `요청 실패 (${res.status})`);
  return data;
}
