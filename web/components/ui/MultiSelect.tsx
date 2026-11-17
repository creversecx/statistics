'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/** A chip that opens a searchable checklist. Empty selection = 전체. */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  format,
  onRemove,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  format?: (v: string) => string;
  onRemove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const show = format ?? ((v: string) => v);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => show(o).toLowerCase().includes(s)) : options;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options, q]);

  const summary =
    value.length === 0 ? '전체' : value.length === 1 ? show(value[0]) : `${show(value[0])} 외 ${value.length - 1}`;

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`flex max-w-[260px] items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${
          value.length ? 'border-accent-cyan/50 bg-accent-cyan/10 text-white' : 'border-line text-white/80 hover:bg-white/5'
        }`}
      >
        <span className="shrink-0 text-white/60">{label}</span>
        <span className="truncate font-medium">{summary}</span>
        <span className="text-white/45" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="rise-in absolute left-0 top-[calc(100%+6px)] z-50 w-72 rounded-2xl border border-line bg-base-900/95 p-2 shadow-2xl backdrop-blur-xl">
          {options.length > 8 && (
            <input autoFocus className="field mb-2 !rounded-lg !py-2 !text-xs" placeholder="검색" value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          <div className="mb-1 flex items-center justify-between px-1 text-xs">
            <button type="button" className="text-white/70 hover:text-white" onClick={() => onChange(shown)}>
              {q ? '검색 결과 모두' : '모두 선택'}
            </button>
            <button type="button" className="text-white/70 hover:text-white" onClick={() => onChange([])}>
              선택 해제 (전체)
            </button>
          </div>
          <ul className="max-h-72 overflow-auto pr-1">
            {shown.map((o) => (
              <li key={o}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/5">
                  <input type="checkbox" className="accent-sky-400" checked={value.includes(o)} onChange={() => toggle(o)} />
                  <span className="truncate">{show(o)}</span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-3 text-xs text-white/55">값이 없습니다.</li>}
          </ul>
          {onRemove && (
            <button type="button" onClick={onRemove} className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-rose-300 hover:bg-white/5">
              이 필터 빼기
            </button>
          )}
        </div>
      )}
    </div>
  );
}
