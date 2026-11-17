'use client';

import { useState } from 'react';
import { pct } from './common';

export type BarItem = { label: string; rate: number | null; detail: string };

/**
 * One rate per category as horizontal bars — readable with long names
 * (학원, 반) and any count. One series, so one color; the 80% / 60% lines are
 * drawn on the track and the status is spelled out in text, not color alone.
 */
export function BarList({ items, warn, alert }: { items: BarItem[]; warn?: number; alert?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="space-y-[2px]">
      {items.map((it, i) => {
        const status = it.rate === null || warn === undefined ? null : alert !== undefined && it.rate < alert ? 'alert' : it.rate < warn ? 'warn' : null;
        return (
          <div
            key={it.label}
            className={`grid grid-cols-[minmax(84px,180px)_1fr_auto] items-center gap-3 rounded-md px-2 py-1 text-xs transition ${hover === i ? 'bg-white/[0.05]' : ''}`}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
          >
            <span className="truncate text-white/80" title={it.label}>
              {it.label}
            </span>
            <span className="relative h-3.5 rounded-[4px] bg-white/[0.05]">
              <span
                className="absolute inset-y-0 left-0 rounded-r-[4px] bg-[#3987e5]"
                style={{ width: `${Math.max(0, Math.min(1, it.rate ?? 0)) * 100}%` }}
              />
              {warn !== undefined && <span className="absolute inset-y-[-3px] w-px bg-amber-300/60" style={{ left: `${warn * 100}%` }} />}
              {alert !== undefined && <span className="absolute inset-y-[-3px] w-px bg-rose-300/50" style={{ left: `${alert * 100}%` }} />}
            </span>
            <span className="flex w-[148px] items-center justify-end gap-1.5 tabular-nums">
              {status && (
                <span className={`rounded px-1 text-[10px] font-semibold ${status === 'alert' ? 'bg-rose-400/15 text-rose-300' : 'bg-amber-300/15 text-amber-200'}`}>
                  {status === 'alert' ? `▼${Math.round((alert ?? 0) * 100)}` : `▼${Math.round(warn! * 100)}`}
                </span>
              )}
              <span className="font-semibold text-white/90">{pct(it.rate)}</span>
              <span className={`text-white/50 ${hover === i ? '' : 'hidden xl:inline'}`}>{it.detail}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
