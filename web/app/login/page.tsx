'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BrandMeta, LogoMark } from '@/components/ui/Brand';
import { StatDemo } from '@/components/ui/StatDemo';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? '로그인에 실패했습니다.');
    router.push('/dashboard');
    router.refresh();
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    const res = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return setError(data.error ?? '요청에 실패했습니다.');
    }
    setNotice('승인된 계정이라면 비밀번호 설정 링크를 메일로 보냈습니다. 30분 안에 열어 주세요.');
  }

  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-6 py-8 lg:px-12">
      <div className="pointer-events-none absolute -top-56 left-[30%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent-gradient opacity-[0.16] blur-[140px]" />

      <header className="relative mx-auto w-full max-w-6xl">
        <BrandMeta size="md" />
      </header>

      <div className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 py-12 lg:grid-cols-[1.15fr_0.85fr] lg:gap-16">
        <section>
          <div className="mb-6 flex items-center gap-3">
            <LogoMark size={40} animate />
            <span className="text-sm font-semibold text-white/80">크레버스 온라인 학습 통계</span>
          </div>
          <h1 className="scan-pass relative overflow-hidden pb-2 text-[clamp(44px,7.4vw,104px)] leading-[0.98]">
            <span className="block overflow-hidden pb-[0.06em]">
              <span className="word-rise wordmark spot-text">Learning</span>
            </span>
            <span className="block overflow-hidden pb-[0.06em]">
              <span className="word-rise wordmark spot-text" style={{ animationDelay: '140ms' }}>
                Stats
              </span>
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
            ERP·콘텐츠 학습 raw 데이터를 올리면 브랜드·학기·주차·직/가맹·학원·레벨별 수강률과 완료율을 원하는 방식으로 바로 잘라 봅니다.
          </p>
          <div className="mt-8 max-w-xl">
            <StatDemo />
          </div>
        </section>

        <section className="w-full lg:max-w-md lg:justify-self-end">
          {mode === 'login' ? (
            <form onSubmit={onSubmit} className="card space-y-5 !p-8">
              <div>
                <h2 className="text-2xl font-extrabold">로그인</h2>
                <p className="mt-1.5 text-sm text-white/70">회사 이메일과 본인 비밀번호로 로그인합니다.</p>
              </div>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-white/80">
                  이메일
                </label>
                <input
                  id="email"
                  className="field"
                  placeholder="you@creverse.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-white/80">
                  비밀번호
                </label>
                <input
                  id="password"
                  type="password"
                  className="field"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              {error && <p className="text-sm text-rose-300">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5 shadow-[0_0_40px_-8px_rgba(56,189,248,0.6)]">
                {loading ? '확인 중…' : '로그인'}
              </button>
            </form>
          ) : (
            <form onSubmit={onForgot} className="card space-y-5 !p-8">
              <div>
                <h2 className="text-2xl font-extrabold">비밀번호 찾기 · 처음 설정</h2>
                <p className="mt-1.5 text-sm text-white/70">가입 승인된 이메일로 비밀번호 설정 링크를 보내드립니다.</p>
              </div>
              <div>
                <label htmlFor="forgot" className="mb-1.5 block text-sm font-medium text-white/80">
                  이메일
                </label>
                <input
                  id="forgot"
                  className="field"
                  placeholder="you@creverse.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  autoFocus
                />
              </div>
              {error && <p className="text-sm text-rose-300">{error}</p>}
              {notice && <p className="text-sm text-accent-cyan">{notice}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full !py-3.5">
                {loading ? '보내는 중…' : '링크 받기'}
              </button>
            </form>
          )}

          <p className="mt-5 text-sm leading-relaxed text-white/65">
            {mode === 'login' ? (
              <>
                계정이 없나요?{' '}
                <Link href="/signup" className="font-medium text-white/85 underline underline-offset-4 hover:text-white">
                  가입 신청
                </Link>
                <span className="mx-2 text-white/30">·</span>
                <button
                  onClick={() => {
                    setMode('forgot');
                    setError(null);
                  }}
                  className="font-medium text-white/85 underline underline-offset-4 hover:text-white"
                >
                  비밀번호 찾기
                </button>
                <br />
                가입 신청은 슈퍼어드민이 승인하면 바로 쓸 수 있습니다.
              </>
            ) : (
              <button
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setNotice(null);
                }}
                className="font-medium text-white/85 underline underline-offset-4 hover:text-white"
              >
                로그인으로 돌아가기
              </button>
            )}
          </p>
        </section>
      </div>
    </main>
  );
}
