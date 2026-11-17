'use client';

import { useEffect, useState } from 'react';

/**
 * The sign-in screen's example: a raw export comes in, and the same numbers
 * come out cut a different way each time — by 학원, by 주차, by 레벨.
 * Made-up figures, labelled as an example.
 */
const EXAMPLES = [
  {
    source: 'ERP > i-Learning 수강률 · Week 9.xlsx',
    view: '직/가맹별 수강률',
    bars: [
      { label: '직영', v: 0.97 },
      { label: '가맹', v: 0.8 },
    ],
  },
  {
    source: '26 가을 · Week 1–9',
    view: '주차별 추이',
    bars: [0.86, 0.83, 0.85, 0.85, 0.85, 0.82, 0.84, 0.85, 0.85].map((v, i) => ({ label: `${i + 1}`, v })),
  },
  {
    source: 'Vena Talk 학습 raw · 24 여름',
    view: '레벨별 완료율',
    bars: [
      { label: 'Seedbed2', v: 0.87 },
      { label: 'Seed1', v: 0.82 },
      { label: 'Seed2', v: 0.82 },
      { label: 'Sprout1', v: 0.79 },
      { label: 'Sprout2', v: 0.77 },
      { label: 'Sprout3', v: 0.76 },
    ],
  },
  {
    source: 'i-Learning 수강률 · 학원별',
    view: '80% 미만 캠퍼스',
    bars: [
      { label: '강남세곡', v: 0.19 },
      { label: '경기광주', v: 0.29 },
      { label: '경남거제', v: 0.45 },
      { label: '강동명일', v: 0.71 },
      { label: '송파문정', v: 0.68 },
    ],
  },
];

const HOLD_MS = 4200;

export function StatDemo() {
  const [index, setIndex] = useState(0);
  const [grown, setGrown] = useState(false);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setStill(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    if (still) {
      setGrown(true);
      return;
    }
    setGrown(false);
    const a = setTimeout(() => setGrown(true), 60);
    const b = setTimeout(() => setIndex((i) => (i + 1) % EXAMPLES.length), HOLD_MS);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [index, still]);

  const ex = EXAMPLES[index];

  return (
    <div className="card !p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <span className="truncate text-xs text-white/70">{ex.source}</span>
        <span className="ml-3 shrink-0 text-xs text-white/55">분석 예시</span>
      </div>
      <div className="px-5 pb-2 pt-4">
        <p className="mb-3 text-sm font-semibold text-white/85">{ex.view}</p>
        <div className="flex h-36 items-end gap-2" key={index}>
          {ex.bars.map((b, i) => (
            <div key={b.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className={`text-[11px] tabular-nums text-white/75 transition-opacity duration-500 ${grown ? 'opacity-100' : 'opacity-0'}`}>
                {Math.round(b.v * 100)}%
              </span>
              <span
                className={`w-full max-w-[44px] rounded-t-[4px] ${b.v < 0.6 ? 'bg-rose-400/80' : b.v < 0.8 ? 'bg-amber-300/80' : 'bg-accent-cyan/80'}`}
                style={{
                  height: grown ? `${b.v * 100}%` : '0%',
                  transition: still ? undefined : `height 0.7s cubic-bezier(0.2,0.9,0.3,1) ${i * 60}ms`,
                }}
              />
              <span className="w-full truncate text-center text-[11px] text-white/60">{b.label}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex gap-1.5 px-5 pb-4 pt-2" aria-hidden>
        {EXAMPLES.map((_, i) => (
          <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            <span
              key={i === index ? `on-${index}` : 'off'}
              className="block h-full rounded-full bg-accent-gradient"
              style={
                i < index
                  ? { width: '100%' }
                  : i === index
                    ? { width: still ? '100%' : undefined, animation: still ? undefined : `demo-progress ${HOLD_MS}ms linear both` }
                    : { width: 0 }
              }
            />
          </span>
        ))}
      </div>
    </div>
  );
}
