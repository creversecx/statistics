'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ALERT_RATE, DIMS, DIM_LABEL, METRICS, WARN_RATE, brandName, compareLabels, type DimId, type Metric } from '@/lib/dims';
import { PRESETS, TIME_DIMS, counts, dimValues, getCell, rateOf, resolveLatest, runPivot, type PivotConfig, type PivotResult } from '@/lib/pivot';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { LineChart } from '@/components/charts/LineChart';
import { BarList } from '@/components/charts/BarList';
import { MAX_SERIES, num, pct } from '@/components/charts/common';

type Report = { id: string; name: string; description: string; config: PivotConfig; created_by: string };
type DatasetLite = { id: string; name: string };

const DEFAULT: PivotConfig = PRESETS[1].config;
const PINNED_FILTERS: DimId[] = ['brand', 'semester'];

function encode(cfg: PivotConfig) {
  return encodeURIComponent(JSON.stringify(cfg));
}

export function Analyzer({ me }: { me: { email: string; role: string } }) {
  const [cfg, setCfg] = useState<PivotConfig>(DEFAULT);
  const [active, setActive] = useState<{ kind: 'preset' | 'report' | 'custom'; id?: string; name: string }>({
    kind: 'preset',
    id: PRESETS[1].id,
    name: PRESETS[1].name,
  });
  const [values, setValues] = useState<Record<string, string[]>>({});
  const [result, setResult] = useState<PivotResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [datasets, setDatasets] = useState<DatasetLite[]>([]);
  const [saving, setSaving] = useState<{ name: string; description: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const run = useRef(0);
  const shapeRef = useRef('');

  const m = METRICS[cfg.metric];
  const dsName = useCallback((id: string) => datasets.find((d) => d.id === id)?.name ?? id.slice(0, 8), [datasets]);
  const fmt = useCallback(
    (dim: DimId | null) => (v: string) => (dim === 'brand' ? brandName(v) : dim === 'dataset' ? dsName(v) : dim === 'week' && v !== '(없음)' ? `${v}주` : v),
    [dsName]
  );

  // ---- loading ------------------------------------------------------------
  const loadReports = useCallback(async () => {
    const r = await fetch('/api/reports').then((x) => x.json()).catch(() => ({}));
    setReports(r.reports ?? []);
  }, []);

  useEffect(() => {
    loadReports();
    fetch('/api/datasets')
      .then((x) => x.json())
      .then((d) => setDatasets(d.datasets ?? []))
      .catch(() => {});
    // A shared link carries its setup in ?q=
    const q = new URLSearchParams(window.location.search).get('q');
    if (q) {
      try {
        setCfg(JSON.parse(decodeURIComponent(q)));
        setActive({ kind: 'custom', name: '공유된 분석' });
      } catch {
        /* ignore */
      }
    }
    setReady(true);
  }, [loadReports]);

  useEffect(() => {
    dimValues(cfg.metric)
      .then(setValues)
      .catch((e) => setError(e.message));
  }, [cfg.metric]);

  useEffect(() => {
    if (!ready) return;
    const id = ++run.current;
    setLoading(true);
    setError(null);
    setResolvedFilters(null);
    // A different shape (지표·행·열) makes the old numbers misleading: drop them while the new ones load.
    const shape = `${cfg.metric}|${cfg.rows}|${cfg.cols}`;
    if (shape !== shapeRef.current) {
      setResult(null);
      shapeRef.current = shape;
    }
    window.history.replaceState(null, '', `?q=${encode(cfg)}`);
    (async () => {
      try {
        const resolved = await resolveLatest(cfg);
        const res = await runPivot(resolved);
        if (id !== run.current) return;
        if (resolved !== cfg && JSON.stringify(resolved.filters) !== JSON.stringify(cfg.filters)) {
          // Show what "최신" turned into, but keep it as "latest" in the saved setup.
          setResolvedFilters(resolved.filters);
        } else setResolvedFilters(null);
        setResult(res);
      } catch (e) {
        if (id === run.current) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (id === run.current) setLoading(false);
      }
    })();
  }, [cfg, ready]);
  const [resolvedFilters, setResolvedFilters] = useState<PivotConfig['filters'] | null>(null);

  // ---- editing ------------------------------------------------------------
  function edit(patch: Partial<PivotConfig>) {
    setCfg((c) => ({ ...c, ...patch }));
    setActive((a) => (a.kind === 'custom' ? a : { kind: 'custom', name: `${a.name} (수정)` }));
  }
  function setFilter(dim: DimId, v: string[]) {
    const latest = (cfg.latest ?? []).filter((l) => l !== dim);
    edit({ filters: { ...cfg.filters, [dim]: v }, latest });
  }
  function removeFilter(dim: DimId) {
    const f = { ...cfg.filters };
    delete f[dim];
    edit({ filters: f, latest: (cfg.latest ?? []).filter((l) => l !== dim) });
  }
  function open(kind: 'preset' | 'report', id: string, name: string, config: PivotConfig) {
    setCfg({ ...config, filters: { ...config.filters } });
    setActive({ kind, id, name });
  }

  async function save(asNew: boolean) {
    if (!saving?.name.trim()) return;
    const body: Record<string, unknown> = { name: saving.name.trim(), description: saving.description, config: cfg };
    if (!asNew && active.kind === 'report') body.id = active.id;
    const res = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error ?? '저장하지 못했습니다.');
    setSaving(null);
    setActive({ kind: 'report', id: data.id, name: String(body.name) });
    setNotice('보고서를 저장했습니다. 왼쪽 목록에서 모두가 볼 수 있습니다.');
    loadReports();
  }

  async function removeReport(r: Report) {
    if (!window.confirm(`"${r.name}" 보고서를 지울까요?`)) return;
    await fetch(`/api/reports/${r.id}`, { method: 'DELETE' });
    loadReports();
  }

  async function exportXlsx() {
    if (!result) return;
    const XLSX = await import('xlsx');
    const rl = cfg.rows ? DIM_LABEL[cfg.rows] : '구분';
    const cols = cfg.cols ? result.colKeys : [];
    const aoa: (string | number | null)[][] = [];
    aoa.push([`${m.label} · ${active.name}`]);
    aoa.push([filterSummary()]);
    aoa.push([]);
    const head = [rl, ...cols.map(fmt(cfg.cols)), '합계'];
    aoa.push([`${m.rate}`, ...head.slice(1)].map((h, i) => (i === 0 ? rl : h)));
    for (const r of result.rowKeys) {
      aoa.push([fmt(cfg.rows)(r), ...cols.map((c) => round(rateOf(getCell(result, r, c)))), round(rateOf(result.rowTotal.get(r)))]);
    }
    if (cfg.rows) aoa.push(['합계', ...cols.map((c) => round(rateOf(result.colTotal.get(c)))), round(rateOf(result.total))]);
    aoa.push([]);
    aoa.push([`${m.denom} / ${m.numer}${cfg.metric === 'enroll' ? ' (여러 주는 주 평균)' : ''}`]);
    aoa.push([rl, ...cols.flatMap((c) => [`${fmt(cfg.cols)(c)} ${m.denom}`, `${fmt(cfg.cols)(c)} ${m.numer}`]), `합계 ${m.denom}`, `합계 ${m.numer}`]);
    for (const r of result.rowKeys) {
      const t = counts(result.rowTotal.get(r), cfg.metric);
      aoa.push([
        fmt(cfg.rows)(r),
        ...cols.flatMap((c) => {
          const k = counts(getCell(result, r, c), cfg.metric);
          return [k.d, k.n];
        }),
        t.d,
        t.n,
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, m.short);
    XLSX.writeFile(wb, `${active.name.replace(/[\\/:*?"<>|]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  const round = (v: number | null) => (v === null ? null : Math.round(v * 10000) / 10000);

  function filterSummary() {
    const f = { ...cfg.filters, ...(resolvedFilters ?? {}) };
    const parts = Object.entries(f)
      .filter(([, v]) => v && v.length)
      .map(([k, v]) => `${DIM_LABEL[k as DimId]}: ${(v as string[]).map(fmt(k as DimId)).join(', ')}`);
    if (cfg.week_from || cfg.week_to) parts.push(`주차 ${cfg.week_from ?? 1}~${cfg.week_to ?? ''}`);
    return parts.length ? parts.join(' · ') : '전체 데이터';
  }

  // ---- derived view -------------------------------------------------------
  const filterDims = useMemo(() => {
    const extra = (Object.keys(cfg.filters) as DimId[]).filter((d) => !PINNED_FILTERS.includes(d));
    return [...PINNED_FILTERS, ...extra];
  }, [cfg.filters]);
  const addable = DIMS.filter((d) => !filterDims.includes(d.id) && (values[d.id]?.filter((v) => v !== '(없음)').length ?? 0) > 0);
  const layoutDims = DIMS.filter((d) => (values[d.id]?.filter((v) => v !== '(없음)').length ?? 0) > 0 || d.id === cfg.rows || d.id === cfg.cols);
  const weeks = (values.week ?? []).filter((w) => w !== '(없음)').map(Number).sort((a, b) => a - b);
  const noData = Object.keys(values).length > 0 && (values.brand ?? []).length === 0;

  const timeCols = !!cfg.cols && TIME_DIMS.includes(cfg.cols);
  const chart = useMemo(() => {
    if (!result) return null;
    if (timeCols) {
      const rows = cfg.rows ? [...result.rowKeys].sort((a, b) => (result.rowTotal.get(b)?.d ?? 0) - (result.rowTotal.get(a)?.d ?? 0)).slice(0, MAX_SERIES) : ['전체'];
      const ordered = cfg.rows ? result.rowKeys.filter((r) => rows.includes(r)) : rows;
      return {
        kind: 'line' as const,
        hidden: cfg.rows ? Math.max(0, result.rowKeys.length - MAX_SERIES) : 0,
        series: ordered.map((r) => ({
          name: cfg.rows ? fmt(cfg.rows)(r) : '전체',
          values: result.colKeys.map((c) => rateOf(cfg.rows ? getCell(result, r, c) : result.colTotal.get(c) ?? getCell(result, r, c)) ?? null),
          detail: result.colKeys.map((c) => {
            const k = counts(getCell(result, r, c), cfg.metric);
            return k.d === null ? null : `${num(k.n)}/${num(k.d)}`;
          }),
        })),
      };
    }
    const keys = cfg.rows ? result.rowKeys : ['전체'];
    return {
      kind: 'bar' as const,
      hidden: 0,
      items: keys.slice(0, 200).map((r) => {
        const c = result.rowTotal.get(r) ?? result.total;
        const k = counts(c, cfg.metric);
        return { label: cfg.rows ? fmt(cfg.rows)(r) : '전체', rate: rateOf(c), detail: `${num(k.n)} / ${num(k.d)}` };
      }),
    };
  }, [result, cfg.rows, cfg.metric, timeCols, fmt]);

  const totalCounts = counts(result?.total, cfg.metric);
  const below = useMemo(() => {
    if (!result || !cfg.rows) return null;
    let warn = 0;
    let alert = 0;
    for (const r of result.rowKeys) {
      const v = rateOf(result.rowTotal.get(r));
      if (v === null) continue;
      if (v < ALERT_RATE) alert++;
      else if (v < WARN_RATE) warn++;
    }
    return { warn, alert, all: result.rowKeys.length };
  }, [result, cfg.rows]);

  const mine = (r: Report) => r.created_by === me.email || me.role === 'super_admin';

  // ---- render -------------------------------------------------------------
  return (
    <div className="grid gap-8 lg:grid-cols-[250px_1fr]">
      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <section>
          <h2 className="mb-2 px-2 text-xs font-semibold tracking-widest text-white/55">기본 보기</h2>
          <ul className="space-y-0.5">
            {PRESETS.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => open('preset', p.id, p.name, p.config)}
                  className={`w-full rounded-xl px-3 py-2 text-left transition ${active.kind === 'preset' && active.id === p.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={`h-1.5 w-1.5 rounded-full ${p.config.metric === 'enroll' ? 'bg-accent-cyan' : 'bg-accent-pink'}`} />
                    {p.name}
                  </span>
                  <span className="mt-0.5 block pl-3.5 text-xs text-white/55">{p.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 px-2 text-xs font-semibold tracking-widest text-white/55">저장한 보고서</h2>
          <ul className="space-y-0.5">
            {reports.map((r) => (
              <li key={r.id} className="group relative">
                <button
                  onClick={() => open('report', r.id, r.name, r.config)}
                  className={`w-full rounded-xl px-3 py-2 pr-8 text-left transition ${active.kind === 'report' && active.id === r.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <span className={`h-1.5 w-1.5 rounded-full ${r.config.metric === 'enroll' ? 'bg-accent-cyan' : 'bg-accent-pink'}`} />
                    <span className="truncate">{r.name}</span>
                  </span>
                  {r.description && <span className="mt-0.5 block truncate pl-3.5 text-xs text-white/55">{r.description}</span>}
                </button>
                {mine(r) && (
                  <button
                    onClick={() => removeReport(r)}
                    aria-label={`${r.name} 삭제`}
                    className="absolute right-2 top-2 hidden rounded px-1.5 text-xs text-white/50 hover:text-rose-300 group-hover:block"
                  >
                    ×
                  </button>
                )}
              </li>
            ))}
            {reports.length === 0 && <li className="px-3 text-xs leading-relaxed text-white/50">원하는 대로 잘라 본 뒤 “보고서로 저장”하면 여기에 쌓입니다.</li>}
          </ul>
        </section>
      </aside>

      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold tracking-widest text-white/55">{active.kind === 'preset' ? '기본 보기' : active.kind === 'report' ? '저장한 보고서' : '직접 구성'}</p>
            <h1 className="mt-1 text-3xl font-extrabold leading-tight">{active.name}</h1>
            <p className="mt-1 text-sm text-white/65">{m.hint}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                const url = `${window.location.origin}/dashboard?q=${encode(cfg)}`;
                navigator.clipboard?.writeText(url).then(() => setNotice('지금 보는 분석의 링크를 복사했습니다.'));
              }}
              className="btn-secondary !px-4 !py-2"
            >
              링크 복사
            </button>
            <button onClick={exportXlsx} disabled={!result} className="btn-secondary !px-4 !py-2 disabled:opacity-40">
              엑셀로 받기
            </button>
            <button
              onClick={() => setSaving({ name: active.kind === 'custom' ? '' : active.name, description: '' })}
              className="btn-primary !px-4 !py-2"
            >
              보고서로 저장
            </button>
          </div>
        </div>

        {saving && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save(active.kind !== 'report');
            }}
            className="card rise-in grid gap-2 !p-4 sm:grid-cols-[1fr_1.4fr_auto_auto]"
          >
            <input autoFocus className="field !py-2" placeholder="보고서 이름" value={saving.name} onChange={(e) => setSaving({ ...saving, name: e.target.value })} />
            <input className="field !py-2" placeholder="설명 (선택)" value={saving.description} onChange={(e) => setSaving({ ...saving, description: e.target.value })} />
            {active.kind === 'report' && reports.find((r) => r.id === active.id && mine(r)) && (
              <button type="button" onClick={() => save(false)} className="btn-secondary !px-4 !py-2">
                덮어쓰기
              </button>
            )}
            <div className="flex gap-2">
              <button type="submit" className="btn-primary !px-4 !py-2">
                {active.kind === 'report' ? '새로 저장' : '저장'}
              </button>
              <button type="button" onClick={() => setSaving(null)} className="text-sm text-white/65 hover:text-white">
                취소
              </button>
            </div>
          </form>
        )}
        {notice && (
          <p className="rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-2.5 text-sm text-accent-cyan" onClick={() => setNotice(null)}>
            {notice}
          </p>
        )}

        {/* 지표 · 필터 · 배치 */}
        <div className="card space-y-4 !p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-full border border-line bg-white/[0.02] p-1" role="tablist" aria-label="지표">
              {(Object.keys(METRICS) as Metric[]).map((k) => (
                <button
                  key={k}
                  role="tab"
                  aria-selected={cfg.metric === k}
                  onClick={() => edit({ metric: k, filters: {}, latest: cfg.latest })}
                  className={`rounded-full px-4 py-1.5 text-sm transition ${cfg.metric === k ? 'bg-white font-semibold text-base-950' : 'text-white/75 hover:bg-white/5'}`}
                >
                  {METRICS[k].label}
                </button>
              ))}
            </div>
            {(cfg.latest ?? []).length > 0 && (
              <span className="tag-pill">
                {(cfg.latest ?? []).map((l) => DIM_LABEL[l]).join('·')}은 항상 최신 값
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {filterDims.map((d) => (
              <MultiSelect
                key={d}
                label={DIM_LABEL[d]}
                options={values[d] ?? []}
                value={cfg.filters[d]?.length ? cfg.filters[d]! : resolvedFilters?.[d] ?? []}
                onChange={(v) => setFilter(d, v)}
                format={fmt(d)}
                onRemove={PINNED_FILTERS.includes(d) ? undefined : () => removeFilter(d)}
              />
            ))}
            {weeks.length > 0 && (
              <span className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-sm">
                <span className="text-white/60">주차</span>
                <select
                  className="bg-transparent text-white outline-none"
                  value={cfg.week_from ?? ''}
                  onChange={(e) => edit({ week_from: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">처음</option>
                  {weeks.map((w) => (
                    <option key={w} value={w}>
                      {w}주
                    </option>
                  ))}
                </select>
                <span className="text-white/45">~</span>
                <select
                  className="bg-transparent text-white outline-none"
                  value={cfg.week_to ?? ''}
                  onChange={(e) => edit({ week_to: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">끝</option>
                  {weeks.map((w) => (
                    <option key={w} value={w}>
                      {w}주
                    </option>
                  ))}
                </select>
              </span>
            )}
            {addable.length > 0 && (
              <select
                className="rounded-full border border-dashed border-white/25 bg-transparent px-3 py-1.5 text-sm text-white/75 outline-none hover:bg-white/5"
                value=""
                onChange={(e) => e.target.value && edit({ filters: { ...cfg.filters, [e.target.value]: [] } })}
                aria-label="필터 추가"
              >
                <option value="">+ 필터 추가</option>
                {addable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-4 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-white/60">행</span>
              <select className="field !w-auto !rounded-full !py-1.5" value={cfg.rows ?? ''} onChange={(e) => edit({ rows: (e.target.value || null) as DimId | null })}>
                <option value="">(합계만)</option>
                {layoutDims.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              aria-label="행과 열 바꾸기"
              className="rounded-full border border-line px-2.5 py-1 text-white/70 hover:bg-white/5 hover:text-white"
              onClick={() => edit({ rows: cfg.cols, cols: cfg.rows })}
            >
              ⇄
            </button>
            <label className="flex items-center gap-2">
              <span className="text-white/60">열</span>
              <select className="field !w-auto !rounded-full !py-1.5" value={cfg.cols ?? ''} onChange={(e) => edit({ cols: (e.target.value || null) as DimId | null })}>
                <option value="">(없음)</option>
                {layoutDims.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2">
              <span className="text-white/60">정렬</span>
              <select className="field !w-auto !rounded-full !py-1.5" value={cfg.sort ?? 'label'} onChange={(e) => edit({ sort: e.target.value as PivotConfig['sort'] })}>
                <option value="label">이름순</option>
                <option value="rate_desc">{m.rate} 높은 순</option>
                <option value="rate_asc">{m.rate} 낮은 순</option>
                <option value="denom_desc">{m.denom} 많은 순</option>
              </select>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-white/75">
              <input type="checkbox" className="accent-sky-400" checked={!!cfg.showCounts} onChange={(e) => edit({ showCounts: e.target.checked })} />
              표에 {m.denom}·{m.numer} 함께
            </label>
          </div>
        </div>

        {error && <p className="rounded-lg border border-rose-400/30 bg-rose-400/5 px-4 py-2.5 text-sm text-rose-300">{error}</p>}

        {noData ? (
          <div className="card !p-10 text-center">
            <p className="text-lg font-semibold">아직 {m.label} 데이터가 없습니다</p>
            <p className="mt-2 text-sm text-white/65">ERP에서 내려받은 raw 엑셀을 올리면 바로 여기서 볼 수 있습니다.</p>
            <Link href="/upload" className="btn-primary mt-6">
              데이터 올리기
            </Link>
          </div>
        ) : (
          <>
            {/* KPI */}
            <div className={`grid gap-3 transition-opacity sm:grid-cols-4 ${loading ? 'opacity-50' : ''}`} aria-busy={loading}>
              <Kpi label={m.rate} value={pct(rateOf(result?.total))} strong />
              <Kpi label={`${m.denom}${totalCounts.avg ? ' (주 평균)' : ''}`} value={num(totalCounts.d)} />
              <Kpi label={`${m.numer}${totalCounts.avg ? ' (주 평균)' : ''}`} value={num(totalCounts.n)} />
              <Kpi
                label={below ? `${WARN_RATE * 100}% 미만 ${DIM_LABEL[cfg.rows!]}` : '범위'}
                value={below ? `${below.warn + below.alert} / ${below.all}` : filterSummary()}
                sub={below && below.alert ? `그중 ${ALERT_RATE * 100}% 미만 ${below.alert}` : undefined}
                small={!below}
              />
            </div>
            {below && <p className="-mt-2 text-xs text-white/55">{filterSummary()}</p>}

            {/* chart */}
            <div className={`card !p-5 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {chart?.kind === 'line' && chart.series.length > 0 && (
                <>
                  <LineChart
                    categories={result!.colKeys}
                    series={chart.series}
                    reference={{ value: WARN_RATE, label: `${WARN_RATE * 100}%` }}
                    xLabel={fmt(cfg.cols)}
                  />
                  {chart.hidden > 0 && (
                    <p className="mt-2 text-xs text-white/55">
                      {m.denom}이 많은 {MAX_SERIES}개만 그렸습니다 · 나머지 {chart.hidden}개는 아래 표에 있습니다. 필터로 좁히면 원하는 것만 그릴 수 있습니다.
                    </p>
                  )}
                </>
              )}
              {chart?.kind === 'bar' && (
                <div className={chart.items.length > 24 ? 'max-h-[560px] overflow-auto pr-1' : ''}>
                  <BarList items={chart.items} warn={WARN_RATE} alert={ALERT_RATE} />
                </div>
              )}
              {!loading && result && result.rowKeys.length === 0 && <p className="py-10 text-center text-sm text-white/60">조건에 맞는 데이터가 없습니다.</p>}
              {loading && !result && <p className="py-10 text-center text-sm text-white/60">집계하는 중…</p>}
            </div>

            {/* table */}
            {result && result.rowKeys.length > 0 && (
              <div className={`transition-opacity ${loading ? 'opacity-50' : ''}`}>
                <PivotTable result={result} cfg={cfg} fmt={fmt} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, strong, small }: { label: string; value: string; sub?: string; strong?: boolean; small?: boolean }) {
  return (
    <div className="card !p-4">
      <p className="text-xs text-white/60">{label}</p>
      <p className={`mt-1 tabular-nums ${small ? 'text-sm leading-snug text-white/80' : strong ? 'gradient-text text-3xl font-extrabold' : 'text-2xl font-bold'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-rose-300">{sub}</p>}
    </div>
  );
}

function rateClass(v: number | null) {
  if (v === null) return 'text-white/35';
  if (v < ALERT_RATE) return 'bg-rose-400/[0.14] text-rose-200';
  if (v < WARN_RATE) return 'bg-amber-300/[0.12] text-amber-100';
  return 'text-white/90';
}

function PivotTable({ result, cfg, fmt }: { result: PivotResult; cfg: PivotConfig; fmt: (d: DimId | null) => (v: string) => string }) {
  const m = METRICS[cfg.metric];
  const cols = cfg.cols ? result.colKeys : [];
  const rl = cfg.rows ? DIM_LABEL[cfg.rows] : '구분';
  const cellView = (c: Parameters<typeof rateOf>[0], bold = false) => {
    const v = rateOf(c);
    const k = counts(c, cfg.metric);
    return (
      <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${rateClass(v)} ${bold ? 'font-semibold' : ''}`}>
        {pct(v)}
        {cfg.showCounts && k.d !== null && (
          <span className="block text-[11px] font-normal text-white/50">
            {num(k.n)} / {num(k.d)}
          </span>
        )}
      </td>
    );
  };
  return (
    <div className="card !p-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3 text-xs text-white/60">
        <span>
          {result.rowKeys.length}개 {rl}
          {cfg.cols ? ` × ${cols.length}개 ${DIM_LABEL[cfg.cols]}` : ''} · 칸마다 {m.rate}
          {cfg.showCounts ? ` (아래: ${m.numer} / ${m.denom}${cfg.metric === 'enroll' ? ', 여러 주는 주 평균' : ''})` : ''}
        </span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-300/40" /> {WARN_RATE * 100}% 미만
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-rose-400/50" /> {ALERT_RATE * 100}% 미만
          </span>
        </span>
      </div>
      <div className="max-h-[640px] overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-base-900">
            <tr className="text-xs text-white/60">
              <th className="sticky left-0 z-10 bg-base-900 px-4 py-2.5 text-left font-medium">{rl}</th>
              {cols.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2.5 text-right font-medium">
                  {fmt(cfg.cols)(c)}
                </th>
              ))}
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-white/80">{cfg.cols ? '합계' : m.rate}</th>
            </tr>
          </thead>
          <tbody>
            {result.rowKeys.map((r) => (
              <tr key={r} className="border-t border-line hover:bg-white/[0.03]">
                <th className="sticky left-0 bg-base-950/95 px-4 py-2 text-left font-medium text-white/85">{cfg.rows ? fmt(cfg.rows)(r) : '전체'}</th>
                {cols.map((c) => (
                  <Cellx key={c} node={cellView(getCell(result, r, c))} />
                ))}
                <Cellx node={cellView(result.rowTotal.get(r), true)} />
              </tr>
            ))}
            {cfg.rows && (
              <tr className="border-t-2 border-white/15 bg-white/[0.02]">
                <th className="sticky left-0 bg-base-900 px-4 py-2 text-left font-semibold">합계</th>
                {cols.map((c) => (
                  <Cellx key={c} node={cellView(result.colTotal.get(c), true)} />
                ))}
                <Cellx node={cellView(result.total, true)} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const Cellx = ({ node }: { node: React.ReactNode }) => <>{node}</>;
