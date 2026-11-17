'use client';

import { useEffect, useMemo, useState } from 'react';
import { BRANDS, brandName } from '@/lib/dims';

type Branch = { brand: string; name: string; branch_type: string | null; alpha: string | null; aliases: string[]; note: string };

/**
 * The 학원 master. Uploads fill it in (any file that has 직/가맹 or 알파 for a
 * 학원 teaches it), and it fills those in for files that don't — i-GARTEN's
 * 학원별 표 has no 직/가맹 column, for one. Renamed campuses keep their old
 * names as 별칭 so a semester-over-semester view lines up.
 */
export function BranchesPanel() {
  const [list, setList] = useState<Branch[]>([]);
  const [brand, setBrand] = useState<string>('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<(Branch & { aliasText: string; isNew?: boolean }) | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch('/api/branches').then((x) => x.json()).catch(() => ({}));
    setList(r.branches ?? []);
  }
  useEffect(() => {
    refresh();
  }, []);

  const brands = useMemo(() => [...new Set(list.map((b) => b.brand))], [list]);
  const shown = list.filter((b) => (!brand || b.brand === brand) && (!q || [b.name, ...b.aliases].join(' ').includes(q.trim())));

  async function post(body: Record<string, unknown>) {
    setError(null);
    const res = await fetch('/api/branches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? '저장하지 못했습니다.');
      return null;
    }
    return data;
  }

  async function save() {
    if (!editing) return;
    const ok = await post({
      op: 'upsert',
      brand: editing.brand,
      name: editing.name,
      branch_type: editing.branch_type,
      alpha: editing.alpha,
      note: editing.note,
      aliases: editing.aliasText.split(',').map((s) => s.trim()).filter(Boolean),
    });
    if (ok) {
      setEditing(null);
      setNotice('저장했습니다. 이미 올라간 데이터에도 반영하려면 “기존 데이터에 적용”을 누르세요.');
      refresh();
    }
  }

  async function apply() {
    const r = await post({ op: 'apply' });
    if (r) setNotice(`기존 데이터에 반영했습니다 · 이름 바꿈 ${r.renamed}행, 직/가맹 갱신 ${r.updated}행`);
  }

  async function remove(b: Branch) {
    if (!window.confirm(`${brandName(b.brand)} ${b.name}을 학원 정보에서 뺄까요? (올라간 데이터는 그대로입니다)`)) return;
    if (await post({ op: 'delete', brand: b.brand, name: b.name })) refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select className="field !w-auto !rounded-full !py-1.5" value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">모든 브랜드</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {brandName(b)}
              </option>
            ))}
          </select>
          <input className="field !w-56 !py-1.5" placeholder="학원 이름" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button onClick={apply} className="btn-secondary !px-4 !py-2">
            기존 데이터에 적용
          </button>
          <button
            onClick={() => setEditing({ brand: brand || 'AP', name: '', branch_type: '가맹', alpha: null, aliases: [], note: '', aliasText: '', isNew: true })}
            className="btn-primary !px-4 !py-2"
          >
            학원 추가
          </button>
        </div>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {notice && <p className="rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-3 text-sm text-accent-cyan">{notice}</p>}

      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="card rise-in grid gap-3 !p-4 md:grid-cols-6"
        >
          <select className="field !py-2" value={editing.brand} disabled={!editing.isNew} onChange={(e) => setEditing({ ...editing, brand: e.target.value })}>
            {BRANDS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <input className="field !py-2" placeholder="학원 이름" value={editing.name} disabled={!editing.isNew} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <select className="field !py-2" value={editing.branch_type ?? ''} onChange={(e) => setEditing({ ...editing, branch_type: e.target.value || null })}>
            <option value="">직/가맹 ?</option>
            <option value="직영">직영</option>
            <option value="가맹">가맹</option>
          </select>
          <select className="field !py-2" value={editing.alpha ?? ''} onChange={(e) => setEditing({ ...editing, alpha: e.target.value || null })}>
            <option value="">알파/4.0 ?</option>
            <option value="알파">알파</option>
            <option value="4.0">4.0</option>
          </select>
          <input className="field !py-2 md:col-span-2" placeholder="예전 이름 (쉼표로, 예: 강릉제1)" value={editing.aliasText} onChange={(e) => setEditing({ ...editing, aliasText: e.target.value })} />
          <input className="field !py-2 md:col-span-4" placeholder="메모 (예: 26봄 알파 전환)" value={editing.note} onChange={(e) => setEditing({ ...editing, note: e.target.value })} />
          <div className="flex items-center gap-2 md:col-span-2">
            <button type="submit" disabled={!editing.name.trim()} className="btn-primary !px-4 !py-2 disabled:opacity-40">
              저장
            </button>
            <button type="button" onClick={() => setEditing(null)} className="text-sm text-white/65 hover:text-white">
              취소
            </button>
          </div>
        </form>
      )}

      <div className="card !p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-white/55">
              <th className="px-4 py-2.5 text-left font-medium">브랜드</th>
              <th className="px-3 py-2.5 text-left font-medium">학원</th>
              <th className="px-3 py-2.5 text-left font-medium">직/가맹</th>
              <th className="px-3 py-2.5 text-left font-medium">알파/4.0</th>
              <th className="px-3 py-2.5 text-left font-medium">예전 이름</th>
              <th className="px-3 py-2.5 text-left font-medium">메모</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {shown.map((b) => (
              <tr key={`${b.brand}/${b.name}`} className="border-t border-line">
                <td className="px-4 py-2 text-white/70">{brandName(b.brand)}</td>
                <td className="px-3 py-2 font-medium">{b.name}</td>
                <td className="px-3 py-2">{b.branch_type ?? <span className="text-amber-200">미정</span>}</td>
                <td className="px-3 py-2 text-white/80">{b.alpha ?? '–'}</td>
                <td className="px-3 py-2 text-xs text-white/60">{b.aliases.join(', ')}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-xs text-white/60">{b.note}</td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-3 text-xs">
                    <button onClick={() => setEditing({ ...b, aliasText: b.aliases.join(', ') })} className="text-white/70 hover:text-white">
                      고치기
                    </button>
                    <button onClick={() => remove(b)} className="text-rose-400 hover:text-rose-300">
                      빼기
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-white/60">
                  학원 정보는 데이터를 올리면 자동으로 채워집니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
