'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BrandMeta, LogoMark, Wordmark } from '@/components/ui/Brand';

export default function SignupPage() {
  const [form, setForm] = useState({ email: '', name: '', team: '', password: '', confirm: '' });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) return setError('비밀번호와 확인이 다릅니다.');
    setLoading(true);
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? '신청하지 못했습니다.');
    setDone(true);
  }

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-6 py-8 lg:px-12">
      <div className="pointer-events-none absolute -top-56 left-[50%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent-gradient opacity-[0.14] blur-[140px]" />
      <header className="relative mx-auto w-full max-w-6xl">
        <BrandMeta size="md" />
      </header>
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
        <Link href="/login" className="mb-6 flex items-center gap-2.5">
          <LogoMark size={34} />
          <Wordmark className="text-[26px]" />
        </Link>
        {done ? (
          <div className="card rise-in space-y-4 !p-8">
            <h1 className="text-2xl font-extrabold">가입 신청을 보냈습니다</h1>
            <p className="text-sm leading-relaxed text-white/75">
              슈퍼어드민이 승인하면 <span className="text-white">{form.email}</span>로 메일이 가고, 방금 정한 비밀번호로 로그인할 수 있습니다.
            </p>
            <Link href="/login" className="btn-primary w-full">
              로그인 화면으로
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="card space-y-4 !p-8">
            <div>
              <h1 className="text-2xl font-extrabold">가입 신청</h1>
              <p className="mt-1.5 text-sm text-white/70">회사 이메일로 신청하면 슈퍼어드민 승인 후 사용할 수 있습니다.</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/80" htmlFor="su-email">
                회사 이메일
              </label>
              <input id="su-email" className="field" placeholder="you@creverse.com" value={form.email} onChange={set('email')} autoComplete="email" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/80" htmlFor="su-name">
                  이름
                </label>
                <input id="su-name" className="field" value={form.name} onChange={set('name')} autoComplete="name" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-white/80" htmlFor="su-team">
                  소속 (선택)
                </label>
                <input id="su-team" className="field" placeholder="CX팀" value={form.team} onChange={set('team')} />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/80" htmlFor="su-pw">
                비밀번호 (8자 이상)
              </label>
              <input id="su-pw" type="password" className="field" value={form.password} onChange={set('password')} autoComplete="new-password" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-white/80" htmlFor="su-pw2">
                비밀번호 확인
              </label>
              <input id="su-pw2" type="password" className="field" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
            </div>
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5">
              {loading ? '보내는 중…' : '가입 신청'}
            </button>
            <p className="text-center text-sm text-white/65">
              이미 계정이 있나요?{' '}
              <Link href="/login" className="font-medium text-white/85 underline underline-offset-4 hover:text-white">
                로그인
              </Link>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
