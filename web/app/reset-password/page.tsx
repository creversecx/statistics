'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { BrandMeta, LogoMark, Wordmark } from '@/components/ui/Brand';

function ResetForm() {
  const params = useSearchParams();
  const email = params.get('email') ?? '';
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError('비밀번호와 확인이 다릅니다.');
    setLoading(true);
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, token, password }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) return setError(data.error ?? '바꾸지 못했습니다.');
    setDone(true);
  }

  if (done) {
    return (
      <div className="card rise-in space-y-4 !p-8">
        <h1 className="text-2xl font-extrabold">비밀번호를 정했습니다</h1>
        <p className="text-sm text-white/75">이제 새 비밀번호로 로그인하세요.</p>
        <Link href="/login" className="btn-primary w-full">
          로그인
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="card space-y-4 !p-8">
      <div>
        <h1 className="text-2xl font-extrabold">새 비밀번호</h1>
        <p className="mt-1.5 text-sm text-white/70">{email}</p>
      </div>
      <input type="password" className="field" placeholder="새 비밀번호 (8자 이상)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" autoFocus />
      <input type="password" className="field" placeholder="새 비밀번호 확인" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      {error && <p className="text-sm text-rose-300">{error}</p>}
      <button type="submit" disabled={loading || !token} className="btn-primary w-full !py-3.5">
        {loading ? '저장 중…' : '비밀번호 정하기'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden px-6 py-8 lg:px-12">
      <header className="relative mx-auto w-full max-w-6xl">
        <BrandMeta size="md" />
      </header>
      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-12">
        <Link href="/login" className="mb-6 flex items-center gap-2.5">
          <LogoMark size={34} />
          <Wordmark className="text-[26px]" />
        </Link>
        <Suspense>
          <ResetForm />
        </Suspense>
      </div>
    </main>
  );
}
