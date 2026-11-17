'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Categorical series colors, dark steps (the app is dark only), in fixed
 * order — validated on the card surface #0b0e17: CVD ΔE ≥ 8.4, normal ΔE ≥
 * 19.3, all ≥ 3:1 contrast. A 9th series is never a new hue: charts show the
 * first 8 and say so.
 */
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'];
export const MAX_SERIES = SERIES.length;

export const INK = {
  primary: 'rgba(255,255,255,0.92)',
  secondary: 'rgba(255,255,255,0.68)',
  muted: 'rgba(255,255,255,0.5)',
  grid: 'rgba(255,255,255,0.07)',
  axis: 'rgba(255,255,255,0.18)',
  surface: '#0b0e17',
};

export const pct = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || !Number.isFinite(v) ? '–' : `${(v * 100).toFixed(digits)}%`;

export const num = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? '–' : Math.round(v * 10) / 10 === Math.round(v) ? Math.round(v).toLocaleString('ko-KR') : v.toLocaleString('ko-KR', { maximumFractionDigits: 1 });

/** Rate ticks: a tidy step for the span, never past 0–100%. */
export function rateDomain(values: number[]): { lo: number; hi: number; ticks: number[] } {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return { lo: 0, hi: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  let lo = Math.min(...v);
  let hi = Math.max(...v);
  const span = Math.max(hi - lo, 0.04);
  const step = span > 0.5 ? 0.2 : span > 0.25 ? 0.1 : span > 0.1 ? 0.05 : 0.02;
  lo = Math.max(0, Math.floor((lo - span * 0.12) / step) * step);
  hi = Math.min(1, Math.ceil((hi + span * 0.12) / step) * step);
  if (hi - lo < step) hi = Math.min(1, lo + step);
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return { lo, hi, ticks };
}

export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
