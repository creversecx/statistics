'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * The page background: a faint grid of dots that turn into check marks
 * around the pointer, a lens passing over the page and checking what it
 * touches. A click sends a ring of checks outward.
 *
 * It also feeds the pointer position to anything marked .card, .spot or
 * .spot-text (as --sx/--sy, relative to the element) for the glow on their
 * borders and on the wordmark.
 *
 * Nothing redraws while the pointer rests. People who ask for less motion
 * get the lens without the easing and without the ring.
 */

const CELL = 26;
const GLOW_SELECTOR = '.card, .spot, .spot-text';

type Ripple = { x: number; y: number; at: number };

/** Cyan → violet → pink across the page, the accent gradient. */
function gradientAt(f: number): [number, number, number] {
  const stops: [number, number, number][] = [
    [56, 189, 248],
    [167, 139, 250],
    [244, 114, 182],
  ];
  const p = Math.min(1, Math.max(0, f)) * 2;
  const i = Math.min(1, Math.floor(p));
  const t = p - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function PointerField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pathname = usePathname();
  // The sign-in screen is a showpiece; the work screens keep it quiet.
  const strength = pathname === '/login' || pathname === '/signup' || pathname === '/reset-password' ? 1 : 0.55;
  const strengthRef = useRef(strength);
  strengthRef.current = strength;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    const dots = document.createElement('canvas');
    const target = { x: -9999, y: -9999 };
    const lens = { x: -9999, y: -9999, on: 0 };
    let inside = false;
    let ripples: Ripple[] = [];
    let frame = 0;

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      w = window.innerWidth;
      h = window.innerHeight;
      for (const c of [canvas!, dots]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      // The resting grid is drawn once and copied each frame.
      const d = dots.getContext('2d')!;
      d.setTransform(dpr, 0, 0, dpr, 0, 0);
      d.clearRect(0, 0, w, h);
      d.fillStyle = 'rgba(255,255,255,0.075)';
      for (let y = CELL / 2; y < h; y += CELL) {
        for (let x = CELL / 2; x < w; x += CELL) {
          d.beginPath();
          d.arc(x, y, 0.9, 0, Math.PI * 2);
          d.fill();
        }
      }
      draw();
    }

    function check(x: number, y: number, s: number) {
      ctx!.beginPath();
      ctx!.moveTo(x - s, y);
      ctx!.lineTo(x - s * 0.3, y + s * 0.7);
      ctx!.lineTo(x + s, y - s * 0.75);
      ctx!.stroke();
    }

    function draw() {
      // A window with no size (minimised, a hidden pane) has nothing to draw.
      if (!dots.width || !dots.height) return;
      const now = performance.now();
      const k = strengthRef.current;
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height);
      ctx!.drawImage(dots, 0, 0);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

      const radius = 150 + 60 * k;
      if (lens.on > 0.01) {
        // A soft light under the lens.
        const [r, g, b] = gradientAt(lens.x / Math.max(1, w));
        const glow = ctx!.createRadialGradient(lens.x, lens.y, 0, lens.x, lens.y, radius * 2.4);
        glow.addColorStop(0, `rgba(${r | 0},${g | 0},${b | 0},${0.13 * k * lens.on})`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx!.fillStyle = glow;
        ctx!.fillRect(lens.x - radius * 2.4, lens.y - radius * 2.4, radius * 4.8, radius * 4.8);
      }

      ripples = ripples.filter((rp) => now - rp.at < 1100);
      const ringReach = ripples.map((rp) => ({ ...rp, r: (now - rp.at) * 0.75, life: 1 - (now - rp.at) / 1100 }));

      ctx!.lineCap = 'round';
      ctx!.lineJoin = 'round';
      // Only the cells the lens or a ring can reach are visited.
      const cells: [number, number][] = [];
      const visit = (cx: number, cy: number, reach: number) => {
        const x0 = Math.max(0, Math.floor((cx - reach) / CELL));
        const x1 = Math.min(Math.ceil(w / CELL), Math.ceil((cx + reach) / CELL));
        const y0 = Math.max(0, Math.floor((cy - reach) / CELL));
        const y1 = Math.min(Math.ceil(h / CELL), Math.ceil((cy + reach) / CELL));
        for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) cells.push([i, j]);
      };
      if (lens.on > 0.01) visit(lens.x, lens.y, radius);
      for (const rp of ringReach) visit(rp.x, rp.y, rp.r + 40);
      const seen = new Set<number>();

      for (const [i, j] of cells) {
        const key = j * 10000 + i;
        if (seen.has(key)) continue;
        seen.add(key);
        const x = i * CELL + CELL / 2;
        const y = j * CELL + CELL / 2;
        let t = 0;
        if (lens.on > 0.01) {
          const d = Math.hypot(x - lens.x, y - lens.y);
          t = Math.max(0, 1 - d / radius) * lens.on;
        }
        for (const rp of ringReach) {
          const d = Math.abs(Math.hypot(x - rp.x, y - rp.y) - rp.r);
          t = Math.max(t, Math.max(0, 1 - d / 38) * rp.life);
        }
        if (t <= 0.02) continue;
        const [r, g, b] = gradientAt(x / Math.max(1, w));
        const a = Math.min(1, (0.12 + t * 0.8) * (0.55 + 0.45 * k));
        if (t < 0.3) {
          ctx!.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
          ctx!.beginPath();
          ctx!.arc(x, y, 0.9 + t * 4, 0, Math.PI * 2);
          ctx!.fill();
        } else {
          ctx!.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${a})`;
          ctx!.lineWidth = 1.2 + t * 0.9;
          check(x, y, 2 + t * 4.2);
        }
      }
    }

    function tick() {
      frame = 0;
      const ease = still ? 1 : 0.2;
      lens.x += (target.x - lens.x) * ease;
      lens.y += (target.y - lens.y) * ease;
      lens.on += ((inside ? 1 : 0) - lens.on) * (still ? 1 : 0.12);
      draw();
      const moving = Math.abs(target.x - lens.x) > 0.3 || Math.abs(target.y - lens.y) > 0.3;
      const fading = Math.abs((inside ? 1 : 0) - lens.on) > 0.01;
      if (moving || fading || ripples.length) frame = requestAnimationFrame(tick);
    }
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    let glowFrame = 0;
    let px = 0;
    let py = 0;
    function glow() {
      glowFrame = 0;
      document.querySelectorAll<HTMLElement>(GLOW_SELECTOR).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > h + 200) return;
        el.style.setProperty('--sx', `${px - r.left}px`);
        el.style.setProperty('--sy', `${py - r.top}px`);
      });
    }

    function onMove(e: PointerEvent) {
      if (e.pointerType === 'touch') return;
      if (!inside) {
        // Arriving from outside: start the lens where the pointer is.
        lens.x = e.clientX;
        lens.y = e.clientY;
      }
      inside = true;
      target.x = e.clientX;
      target.y = e.clientY;
      px = e.clientX;
      py = e.clientY;
      if (!glowFrame) glowFrame = requestAnimationFrame(glow);
      wake();
    }
    function onLeave() {
      inside = false;
      wake();
    }
    function onDown(e: PointerEvent) {
      if (still) return;
      ripples.push({ x: e.clientX, y: e.clientY, at: performance.now() });
      wake();
    }
    function onScroll() {
      if (!glowFrame) glowFrame = requestAnimationFrame(glow);
    }

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('blur', onLeave);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(glowFrame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll, { capture: true });
      document.documentElement.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 z-0" />;
}
