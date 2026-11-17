'use client';

import { useMemo, useState } from 'react';
import { INK, SERIES, pct, rateDomain, useWidth } from './common';

export type LineSeries = { name: string; values: (number | null)[]; detail?: (string | null)[] };

/**
 * Rates over an ordered axis (주차, 월, 학기). 2px lines, ≥8px markers with a
 * surface ring, one y axis, recessive grid, a reference line at the 80%
 * threshold when it is in view, a crosshair + tooltip on hover, a legend
 * always (≥2 series) and end labels when there are ≤4.
 */
export function LineChart({
  categories,
  series,
  height = 300,
  reference,
  xLabel,
}: {
  categories: string[];
  series: LineSeries[];
  height?: number;
  reference?: { value: number; label: string };
  xLabel?: (c: string) => string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const directLabels = series.length <= 4 && series.length > 1;
  const pad = { l: 48, r: directLabels ? 96 : 16, t: 14, b: 30 };
  const w = Math.max(width, 320);
  const iw = w - pad.l - pad.r;
  const ih = height - pad.t - pad.b;

  const dom = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
    if (reference) all.push(reference.value);
    return rateDomain(all);
  }, [series, reference]);

  const x = (i: number) => pad.l + (categories.length <= 1 ? iw / 2 : (i / (categories.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - ((v - dom.lo) / (dom.hi - dom.lo || 1)) * ih;
  const label = xLabel ?? ((c: string) => c);
  const every = Math.max(1, Math.ceil(categories.length / Math.max(1, Math.floor(iw / 56))));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const box = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const px = e.clientX - box.left;
    const i = categories.length <= 1 ? 0 : Math.round((px / box.width) * (categories.length - 1));
    setHover(Math.max(0, Math.min(categories.length - 1, i)));
  }

  // End labels: nudged apart so they don't collide.
  const ends = useMemo(() => {
    if (!directLabels) return [];
    const items = series
      .map((s, si) => {
        let i = s.values.length - 1;
        while (i >= 0 && s.values[i] === null) i--;
        return i < 0 ? null : { si, name: s.name, yy: y(s.values[i] as number), v: s.values[i] as number };
      })
      .filter(Boolean) as { si: number; name: string; yy: number; v: number }[];
    items.sort((a, b) => a.yy - b.yy);
    for (let k = 1; k < items.length; k++) if (items[k].yy - items[k - 1].yy < 14) items[k].yy = items[k - 1].yy + 14;
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, directLabels, dom, height, width]);

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg width={w} height={height} role="img" aria-label="추이 차트" className="block overflow-visible">
          {dom.ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} stroke={INK.grid} />
              <text x={pad.l - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill={INK.muted} className="tabular-nums">
                {Math.round(t * 100)}%
              </text>
            </g>
          ))}
          {reference && reference.value >= dom.lo && reference.value <= dom.hi && (
            <g>
              <line x1={pad.l} x2={pad.l + iw} y1={y(reference.value)} y2={y(reference.value)} stroke="rgba(252,211,77,0.55)" strokeDasharray="4 4" />
              <text x={pad.l + 4} y={y(reference.value) - 5} fontSize="10.5" fill="rgba(252,211,77,0.85)">
                {reference.label}
              </text>
            </g>
          )}
          <line x1={pad.l} x2={pad.l + iw} y1={pad.t + ih} y2={pad.t + ih} stroke={INK.axis} />
          {categories.map((c, i) =>
            i % every === 0 || i === categories.length - 1 ? (
              <text key={c} x={x(i)} y={pad.t + ih + 18} textAnchor="middle" fontSize="11" fill={INK.secondary}>
                {label(c)}
              </text>
            ) : null
          )}

          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="rgba(255,255,255,0.28)" />}

          {series.map((s, si) => {
            const color = SERIES[si % SERIES.length];
            let d = '';
            let pen = false;
            s.values.forEach((v, i) => {
              if (v === null) {
                pen = false;
                return;
              }
              d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
              pen = true;
            });
            return (
              <g key={s.name}>
                <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                {s.values.map((v, i) =>
                  v === null || (categories.length > 16 && hover !== i) ? null : (
                    <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 4} fill={color} stroke={INK.surface} strokeWidth="2" />
                  )
                )}
              </g>
            );
          })}

          {ends.map((e) => (
            <text key={e.name} x={pad.l + iw + 8} y={e.yy} dy="0.32em" fontSize="11" fill={INK.secondary}>
              <tspan fill={SERIES[e.si]}>●</tspan> {e.name.length > 9 ? `${e.name.slice(0, 9)}…` : e.name}
            </text>
          ))}

          <rect
            x={pad.l - 10}
            y={pad.t}
            width={iw + 20}
            height={ih}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          />
        </svg>
      )}

      {hover !== null && width > 0 && (
        <div
          className="pointer-events-none absolute top-2 z-10 min-w-[160px] max-w-[260px] rounded-xl border border-line bg-base-900/95 px-3 py-2 text-xs shadow-xl backdrop-blur"
          style={x(hover) > w * 0.6 ? { right: w - x(hover) + 12 } : { left: x(hover) + 12 }}
        >
          <p className="mb-1.5 font-semibold text-white/90">{label(categories[hover])}</p>
          <ul className="space-y-1">
            {series
              .map((s, si) => ({ s, si, v: s.values[hover] }))
              .filter((r) => r.v !== null)
              .sort((a, b) => (b.v as number) - (a.v as number))
              .map(({ s, si, v }) => (
                <li key={s.name} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-1.5 text-white/75">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SERIES[si % SERIES.length] }} />
                    <span className="truncate">{s.name}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-white/90">
                    {pct(v)}
                    {s.detail?.[hover] && <span className="ml-1 text-white/50">{s.detail[hover]}</span>}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {series.length > 1 && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1 text-xs text-white/70">
          {series.map((s, si) => (
            <li key={s.name} className="flex items-center gap-1.5">
              <span className="h-[3px] w-3.5 rounded-full" style={{ background: SERIES[si % SERIES.length] }} />
              {s.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
