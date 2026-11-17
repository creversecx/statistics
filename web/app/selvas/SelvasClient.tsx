'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TARGETS, billingWeeks, computeBill, fmtCount, prevMonth, type Bill, type ProgramRow, type Target, type WeekInfo } from '@/lib/selvas';

type Settings = { unitPrice?: Record<string, number | null> };

const weekKey = (w: WeekInfo) => `${w.semester}|${w.week}`;
const md = (iso: string | null) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : '날짜 미상');
const monthLabel = (m: string) => `${Number(m.slice(5, 7))}월`;

async function post<T>(body: unknown): Promise<T> {
  const res = await fetch('/api/selvas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? '불러오지 못했습니다.');
  return data as T;
}

const countsCache = new Map<string, Promise<{ cut: string; rows: ProgramRow[] }>>();
function counts(brand: string, w: WeekInfo) {
  const k = `${brand}|${w.semester}|${w.week}`;
  if (!countsCache.has(k)) {
    countsCache.set(
      k,
      post<{ cut: string; rows: ProgramRow[] }>({ op: 'counts', brand, semester: w.semester, week: w.week }).then((r) => ({
        cut: r.cut,
        rows: r.rows.map((x) => ({ ...x, d: Number(x.d), n: Number(x.n) })),
      }))
    );
  }
  return countsCache.get(k)!;
}

export function SelvasClient({ isAdmin }: { isAdmin: boolean }) {
  const [month, setMonth] = useState(prevMonth());
  const [weeks, setWeeks] = useState<WeekInfo[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([post<{ weeks: WeekInfo[] }>({ op: 'weeks' }), post<{ value: Settings }>({ op: 'settings' })])
      .then(([w, s]) => {
        setWeeks(w.weeks.map((x) => ({ ...x, week_start: x.week_start ? String(x.week_start).slice(0, 10) : null })));
        setSettings(s.value ?? {});
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
  }, []);

  const months = useMemo(() => {
    const set = new Set(weeks.map((w) => w.week_start?.slice(0, 7)).filter(Boolean) as string[]);
    return [...set].sort().reverse();
  }, [weeks]);

  const unitPrice = (t: Target) => settings.unitPrice?.[t.id] ?? t.unitPriceDefault;

  async function savePrice(t: Target, v: number | null) {
    const next = { ...settings, unitPrice: { ...(settings.unitPrice ?? {}), [t.id]: v } };
    setSettings(next);
    try {
      await post({ op: 'save_settings', value: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-6">
      <div className="card flex flex-wrap items-end justify-between gap-4 !p-5">
        <div className="flex flex-wrap items-end gap-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-white/70">정산 월</span>
            <input type="month" className="field !w-44 !py-2" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
          </label>
          {months.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pb-1">
              {months.slice(0, 6).map((m) => (
                <button
                  key={m}
                  onClick={() => setMonth(m)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${m === month ? 'border-white bg-white font-semibold text-base-950' : 'border-line text-white/75 hover:bg-white/5'}`}
                >
                  {m.slice(2, 4)}년 {monthLabel(m)}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="max-w-md text-xs leading-relaxed text-white/60">
          기준 주차 = 그 달에 시작하는 마지막 주 (새 학기 1주차면 앞 학기 마지막 주). 청담 중등관은 초등관 기준 주차와 시작일이 같은 주. 다르게 보고했다면 카드마다 주차를 바꿀 수 있습니다.
        </p>
      </div>

      {error && <p className="rounded-lg border border-rose-400/30 bg-rose-400/5 px-4 py-2.5 text-sm text-rose-300">{error}</p>}
      {loaded && weeks.length === 0 && (
        <div className="card !p-8 text-center">
          <p className="font-semibold">수강률 데이터가 아직 없습니다</p>
          <Link href="/upload" className="btn-primary mt-4">
            데이터 올리기
          </Link>
        </div>
      )}

      {weeks.length > 0 && (
        <div className="grid gap-6 xl:grid-cols-2">
          {TARGETS.map((t) => (
            <TargetCard key={t.id} target={t} month={month} weeks={weeks} unitPrice={unitPrice(t)} isAdmin={isAdmin} onPrice={(v) => savePrice(t, v)} />
          ))}
        </div>
      )}

      <details className="card !p-5 text-sm">
        <summary className="cursor-pointer font-semibold">계산 규칙</summary>
        <div className="mt-3 grid gap-5 md:grid-cols-2">
          {TARGETS.map((t) => (
            <div key={t.id}>
              <p className="mb-1.5 font-semibold text-white/85">{t.name}</p>
              <ul className="list-disc space-y-1 pl-5 text-white/70">
                {t.rules.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-white/55">
          2026년 8~10월 실제 청구 메일로 검증: April 18,170 / 18,597 / 18,413 (레벨별까지 일치). 청담은 프로그램·레벨이 있는 ERP raw가 올라온 주차부터 계산됩니다.
        </p>
      </details>
    </div>
  );
}

type PartState = { brand: string; label: string; week: WeekInfo | null; bill: Bill | null; cut: string; noProgram: boolean; loading: boolean };

function TargetCard({
  target,
  month,
  weeks,
  unitPrice,
  isAdmin,
  onPrice,
}: {
  target: Target;
  month: string;
  weeks: WeekInfo[];
  unitPrice: number | null;
  isAdmin: boolean;
  onPrice: (v: number | null) => void;
}) {
  const [chosen, setChosen] = useState<Record<string, string>>({}); // brand → weekKey override
  const [parts, setParts] = useState<PartState[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState<string>(unitPrice?.toString() ?? '');

  useEffect(() => setChosen({}), [month]);
  useEffect(() => setPriceDraft(unitPrice?.toString() ?? ''), [unitPrice]);

  const brandWeeks = useCallback((brand: string) => weeks.filter((w) => w.brand === brand), [weeks]);

  useEffect(() => {
    let alive = true;
    const auto = billingWeeks(target, weeks, month);
    const base: PartState[] = target.parts.map((p) => {
      const list = brandWeeks(p.brand);
      const override = chosen[p.brand] ? list.find((w) => weekKey(w) === chosen[p.brand]) : null;
      const week = override ?? auto[p.brand];
      return { ...p, week, bill: null, cut: '', noProgram: false, loading: !!week };
    });
    setParts(base);
    base.forEach((p, i) => {
      if (!p.week) return;
      counts(p.brand, p.week)
        .then((r) => {
          if (!alive) return;
          const noProgram = r.rows.every((x) => x.program === '(없음)');
          setParts((cur) => cur.map((c, j) => (j === i ? { ...c, cut: r.cut, noProgram, bill: noProgram ? null : computeBill(target, p.week!, r.rows), loading: false } : c)));
        })
        .catch(() => alive && setParts((cur) => cur.map((c, j) => (j === i ? { ...c, loading: false } : c))));
    });
    return () => {
      alive = false;
    };
  }, [target, month, chosen, brandWeeks, weeks]);

  const ready = parts.length > 0 && parts.every((p) => !p.loading);
  const usable = parts.filter((p) => p.bill);
  const total = usable.reduce((a, p) => a + p.bill!.counted, 0);
  const complete = ready && parts.every((p) => p.bill || !p.week);
  const missing = parts.filter((p) => !p.week || p.noProgram);
  const fee = unitPrice ? Math.round(total * unitPrice) : null;
  const ml = monthLabel(month);

  const mailText = useMemo(() => {
    if (!usable.length) return '';
    if (target.id === 'AP') {
      const b = usable[0].bill!;
      return [`<${ml} April어학원 회원 리포트>`, '레벨\t수강생', ...b.groups.map((g) => `${g.name}\t${fmtCount(g.n)}`), `Total\t${fmtCount(b.counted)}`].join('\n');
    }
    const detail = usable.map((p) => `${p.label.replace(/ \(Prime\)/, '')} ${fmtCount(p.bill!.counted)}`).join(' + ');
    const basis = usable.map((p) => `${p.label.replace(/ \(Prime\)/, '')}Week${p.week!.week}`).join('/');
    return [
      `${month.slice(2, 4)}년 ${ml} 온라인 수강 학생수 : ${fmtCount(total)}(${detail})명 (${basis} 기준)`,
      fee !== null ? `사용료 : ${fee.toLocaleString('ko-KR')}원(* VAT 포함)` : '',
      '',
      `${ml} <인원수: 명>`,
      fmtCount(total),
    ]
      .filter((l, i) => l || i === 2)
      .join('\n');
  }, [usable, target.id, ml, month, total, fee]);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <section className="card space-y-4 !p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-white/55">셀바스 음성인식 · {ml}</p>
          <h2 className="mt-0.5 text-xl font-extrabold">{target.name}</h2>
        </div>
        <div className="text-right">
          <p className="text-xs text-white/60">청구 인원</p>
          <p className="gradient-text text-4xl font-extrabold tabular-nums">{ready && usable.length ? fmtCount(total) : '–'}</p>
          {fee !== null && usable.length > 0 && <p className="text-xs tabular-nums text-white/70">사용료 {fee.toLocaleString('ko-KR')}원 (VAT 포함)</p>}
        </div>
      </div>

      {parts.map((p) => {
        const list = brandWeeks(p.brand).slice().sort((a, b) => ((b.week_start ?? '') < (a.week_start ?? '') ? -1 : 1));
        return (
          <div key={p.brand} className="rounded-xl border border-line p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{p.label}</span>
              <label className="flex items-center gap-2 text-xs text-white/65">
                기준 주차
                <select
                  className="field !w-auto !rounded-lg !py-1 !text-xs"
                  value={p.week ? weekKey(p.week) : ''}
                  onChange={(e) => setChosen({ ...chosen, [p.brand]: e.target.value })}
                >
                  {!p.week && <option value="">이 달 주차 없음</option>}
                  {list.map((w) => (
                    <option key={weekKey(w)} value={weekKey(w)}>
                      {w.semester} Week {w.week} · {md(w.week_start)}~{w.has_program ? '' : ' (프로그램 없음)'}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {p.loading && <p className="text-xs text-white/55">계산하는 중…</p>}
            {!p.loading && !p.week && <p className="text-xs text-amber-200">{ml}에 시작하는 주차 데이터가 없습니다.</p>}
            {!p.loading && p.noProgram && (
              <p className="text-xs leading-relaxed text-amber-200">
                이 주차는 학기 요약 수치만 있고 프로그램·레벨이 없어 셀바스 대상을 가릴 수 없습니다. ERP raw(Program·Level 포함)를 올리면 계산됩니다.
              </p>
            )}
            {p.bill && (
              <>
                <table className="w-full text-sm">
                  <tbody>
                    {p.bill.groups.map((g) => (
                      <tr key={g.name} className="border-t border-line first:border-t-0">
                        <td className="py-1.5 text-white/80">{g.name}</td>
                        <td className="py-1.5 text-right tabular-nums">{fmtCount(g.n)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-white/15">
                      <td className="py-1.5 font-semibold">셀바스 대상</td>
                      <td className="py-1.5 text-right font-bold tabular-nums">{fmtCount(p.bill.counted)}</td>
                    </tr>
                  </tbody>
                </table>
                <details className="mt-2 text-xs text-white/60">
                  <summary className="cursor-pointer">
                    전체 수강생 {fmtCount(p.bill.total)} 중 제외 {fmtCount(p.bill.total - p.bill.counted)}
                    {p.cut ? ` · ${p.cut} 표 사용` : ''}
                  </summary>
                  <ul className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
                    {p.bill.excluded.slice(0, 30).map((x) => (
                      <li key={x.name} className="flex justify-between gap-2">
                        <span className="truncate">{x.name}</span>
                        <span className="tabular-nums">{fmtCount(x.n)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            )}
          </div>
        );
      })}

      {missing.length > 0 && ready && usable.length > 0 && (
        <p className="text-xs text-amber-200">일부({missing.map((m) => m.label).join(', ')})가 빠진 합계입니다.</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <label className="flex items-center gap-2 text-xs text-white/65">
          단가 (원/명, VAT 포함)
          <input
            className="field !w-24 !rounded-lg !py-1 !text-xs"
            inputMode="decimal"
            value={priceDraft}
            disabled={!isAdmin}
            placeholder="미정"
            onChange={(e) => setPriceDraft(e.target.value)}
            onBlur={() => {
              const v = priceDraft.trim() === '' ? null : Number(priceDraft);
              if (v === null || Number.isFinite(v)) onPrice(v);
            }}
          />
        </label>
        <button onClick={() => copy(mailText, 'mail')} disabled={!complete || !mailText} className="btn-primary !px-4 !py-2 disabled:opacity-40">
          {copied === 'mail' ? '복사했습니다' : '메일 문구 복사'}
        </button>
      </div>
      {mailText && <pre className="whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-xs leading-relaxed text-white/75">{mailText}</pre>}
    </section>
  );
}
