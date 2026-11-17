'use client';

/** The page numbers to show: the ends, and two either side of the current one. */
function pageList(pages: number, current: number): (number | 'gap')[] {
  const keep = new Set([0, pages - 1]);
  for (let i = current - 2; i <= current + 2; i++) if (i >= 0 && i < pages) keep.add(i);
  const out: (number | 'gap')[] = [];
  let last = -1;
  for (const i of [...keep].sort((a, b) => a - b)) {
    if (i - last > 1) out.push('gap');
    out.push(i);
    last = i;
  }
  return out;
}

/** "청담 38개 중 1–20" and 이전 · 1 2 3 … 9 · 다음, below a list shown a page at a time. */
export function Pager({
  total,
  page,
  pageSize,
  onPage,
  label,
  noun = '',
}: {
  total: number;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  /** For screen readers: what is being paged. */
  label: string;
  /** Before the count: "청담 38개 중 …". */
  noun?: string;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, pages - 1);
  const button = 'rounded-md px-2.5 py-1 hover:bg-white/5 disabled:opacity-35';
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-white/70">
      <span>
        {noun ? `${noun} ` : ''}
        {total}개 중 {current * pageSize + 1}–{Math.min(total, (current + 1) * pageSize)}
      </span>
      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label={label}>
          <button className={button} disabled={current === 0} onClick={() => onPage(current - 1)}>
            이전
          </button>
          {pageList(pages, current).map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="px-1 text-white/45">
                …
              </span>
            ) : (
              <button
                key={p}
                aria-current={p === current ? 'page' : undefined}
                onClick={() => onPage(p)}
                className={`min-w-[28px] rounded-md px-2 py-1 tabular-nums ${p === current ? 'bg-white font-semibold text-base-950' : 'hover:bg-white/5'}`}
              >
                {p + 1}
              </button>
            )
          )}
          <button className={button} disabled={current === pages - 1} onClick={() => onPage(current + 1)}>
            다음
          </button>
        </nav>
      )}
    </div>
  );
}
