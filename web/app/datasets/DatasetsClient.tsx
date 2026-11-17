'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { METRICS, brandName, compareLabels, type Metric } from '@/lib/dims';
import { num, pct } from '@/components/charts/common';
import { Pager } from '@/components/ui/Pager';

type Dataset = {
  id: string;
  name: string;
  brand: string;
  metric: Metric;
  source_file: string;
  source_sheets: string[];
  row_count: number;
  status: string;
  note: string;
  uploaded_by: string | null;
  created_at: string;
  semesters: string[];
  week_min: number | null;
  week_max: number | null;
  denom: number | null;
  numer: number | null;
};

const PAGE = 20;

export function DatasetsClient({ me }: { me: { email: string; role: string } }) {
  const [list, setList] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<{ id: string; name: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const r = await fetch('/api/datasets').then((x) => x.json()).catch(() => ({}));
    setList(r.datasets ?? []);
    setLoading(false);
  }
  useEffect(() => {
    refresh();
  }, []);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s
      ? list.filter((d) => [d.name, d.source_file, brandName(d.brand), d.uploaded_by ?? '', ...(d.semesters ?? [])].join(' ').toLowerCase().includes(s))
      : list;
  }, [list, q]);

  const can = (d: Dataset) => d.uploaded_by === me.email || me.role === 'super_admin';

  async function remove(d: Dataset) {
    if (!window.confirm(`"${d.name}" 데이터셋과 그 안의 ${num(d.row_count)}행을 지울까요? 되돌릴 수 없습니다.`)) return;
    const res = await fetch(`/api/datasets/${d.id}`, { method: 'DELETE' });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? '지우지 못했습니다.');
    refresh();
  }

  async function saveEdit() {
    if (!editing) return;
    const res = await fetch(`/api/datasets/${editing.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editing.name, note: editing.note }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error ?? '저장하지 못했습니다.');
    setEditing(null);
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input className="field !w-80 !py-2" placeholder="이름·파일·학기·올린 사람 검색" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
        <Link href="/upload" className="btn-primary !py-2">
          데이터 올리기
        </Link>
      </div>
      {error && <p className="text-sm text-rose-300">{error}</p>}
      {loading && list.length === 0 && <p className="text-sm text-white/60">불러오는 중…</p>}
      {!loading && list.length === 0 && (
        <div className="card !p-10 text-center">
          <p className="text-lg font-semibold">아직 올린 데이터가 없습니다</p>
          <Link href="/upload" className="btn-primary mt-5">
            첫 데이터 올리기
          </Link>
        </div>
      )}
      <ul className="space-y-2">
        {shown.slice(page * PAGE, (page + 1) * PAGE).map((d) => {
          const sems = [...(d.semesters ?? [])].sort((a, b) => compareLabels(a, b, 'semester'));
          const rate = d.denom ? (d.numer ?? 0) / d.denom : null;
          return (
            <li key={d.id} className="card !p-4">
              {editing?.id === d.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit();
                  }}
                  className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]"
                >
                  <input autoFocus className="field !py-2" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                  <input className="field !py-2" placeholder="메모" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
                  <div className="flex gap-2">
                    <button className="btn-secondary !px-4 !py-2">저장</button>
                    <button type="button" onClick={() => setEditing(null)} className="text-sm text-white/65 hover:text-white">
                      취소
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${d.metric === 'enroll' ? 'bg-accent-cyan/15 text-accent-cyan' : 'bg-accent-pink/15 text-accent-pink'}`}>
                        {METRICS[d.metric].short}
                      </span>
                      <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-white/75">{brandName(d.brand)}</span>
                      <span className="font-semibold">{d.name}</span>
                    </div>
                    <p className="mt-1.5 text-xs text-white/60">
                      {sems.length ? sems.join(', ') : '학기 없음'}
                      {d.week_min !== null ? ` · ${d.week_min === d.week_max ? `${d.week_min}주` : `${d.week_min}–${d.week_max}주`}` : ''} · {num(d.row_count)}행 · {d.source_file}
                      {d.source_sheets?.length > 1 ? ` (시트 ${d.source_sheets.length}개)` : d.source_sheets?.[0] ? ` · ${d.source_sheets[0]}` : ''}
                    </p>
                    {d.note && <p className="mt-1 text-xs text-white/70">{d.note}</p>}
                    <p className="mt-1 text-[11px] text-white/45">
                      {d.uploaded_by} · {new Date(d.created_at).toLocaleString('ko-KR')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-lg font-bold tabular-nums">{pct(rate)}</p>
                      <p className="text-[11px] text-white/50">전체 {METRICS[d.metric].rate}</p>
                    </div>
                    {can(d) && (
                      <div className="flex flex-col items-end gap-1">
                        <button onClick={() => setEditing({ id: d.id, name: d.name, note: d.note })} className="text-xs text-white/70 hover:text-white">
                          이름·메모
                        </button>
                        <button onClick={() => remove(d)} className="text-xs text-rose-400 hover:text-rose-300">
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Pager total={shown.length} page={page} pageSize={PAGE} onPage={setPage} label="데이터셋 페이지" noun="데이터셋" />
    </div>
  );
}
