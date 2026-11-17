import { APP_UPDATED, APP_VERSION } from '@/lib/version';

export const SERVICE_NAME = 'Learning Stats';

/** The mark: rising bars and a trend line in a frame, in the accent gradient (Content Checker's frame). */
export function LogoMark({ size = 28, animate = false }: { size?: number; animate?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="ls-mark" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#38bdf8" />
          <stop offset="0.6" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="url(#ls-mark)" opacity="0.16" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="none" stroke="url(#ls-mark)" strokeWidth="1.6" />
      <rect x="8.5" y="17" width="3.2" height="7" rx="1.2" fill="#fff" opacity="0.55" />
      <rect x="14.4" y="13.5" width="3.2" height="10.5" rx="1.2" fill="#fff" opacity="0.75" />
      <rect x="20.3" y="10" width="3.2" height="14" rx="1.2" fill="#fff" />
      <path
        d="M8 13.5l5.5-3.6 4.5 2.2 6.4-5"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? 'mark-draw' : undefined}
      />
    </svg>
  );
}

/** "Learning Stats" set in the display face; lights up under the pointer. */
export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`wordmark spot-text ${className}`}>{SERVICE_NAME}</span>;
}

/** Creverse, the team that publishes it, and the build. */
export function BrandMeta({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span className="flex flex-wrap items-center gap-2.5">
      <span className="inline-flex items-center rounded-md bg-white px-2 py-1">
        <img src="/creverse-logo.png" alt="Creverse" className={size === 'md' ? 'h-5 w-auto' : 'h-4 w-auto'} />
      </span>
      <span className="rounded-full border border-accent-cyan/40 bg-accent-cyan/10 px-2.5 py-0.5 text-xs font-semibold text-accent-cyan">
        CX Team Published
      </span>
      <span className="text-xs font-medium text-white/65">
        v{APP_VERSION} <span className="text-white/50">{APP_UPDATED}</span>
      </span>
    </span>
  );
}
