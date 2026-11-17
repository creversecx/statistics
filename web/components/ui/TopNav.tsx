'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BrandMeta, LogoMark, Wordmark } from '@/components/ui/Brand';

const LINKS = [
  { href: '/dashboard', label: '분석' },
  { href: '/selvas', label: '셀바스 정산' },
  { href: '/upload', label: '데이터 올리기' },
  { href: '/datasets', label: '데이터셋' },
];

export function TopNav({ role, email, name }: { role: 'super_admin' | 'member'; email: string; name: string }) {
  const router = useRouter();
  const pathname = usePathname();

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  const links = role === 'super_admin' ? [...LINKS, { href: '/admin', label: '관리' }] : LINKS;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-base-950/70 backdrop-blur-xl">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3.5 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/dashboard" className="flex items-center gap-2.5" aria-label="Learning Stats 홈">
            <LogoMark size={30} />
            <Wordmark className="text-[22px]" />
          </Link>
          <span className="hidden h-5 w-px bg-white/15 sm:block" aria-hidden />
          <BrandMeta />
        </div>
        <nav className="flex flex-wrap items-center gap-1 rounded-full border border-line bg-white/[0.02] p-1 text-sm">
          {links.map((l) => {
            const on = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={on ? 'page' : undefined}
                className={`rounded-full px-4 py-1.5 transition ${on ? 'bg-white font-semibold text-base-950' : 'text-white/75 hover:bg-white/5 hover:text-white'}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white/70" title={email}>
            {name || email}
          </span>
          <button onClick={logout} className="text-white/70 hover:text-white">
            로그아웃
          </button>
        </div>
      </div>
    </header>
  );
}
