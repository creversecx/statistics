'use client';

import { useState } from 'react';

export function MyPassword() {
  const [mine, setMine] = useState({ current: '', password: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mine.password !== mine.confirm) return setError('새 비밀번호와 확인이 다릅니다.');
    setSaving(true);
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current: mine.current, password: mine.password }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(data.error ?? '바꾸지 못했습니다.');
    setMine({ current: '', password: '', confirm: '' });
    setNotice('비밀번호를 바꿨습니다. 다음 로그인부터 새 비밀번호를 쓰세요.');
  }

  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-white/75">내 비밀번호 변경</h2>
      <form onSubmit={submit} className="card grid gap-3 !p-4 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input type="password" className="field !py-2" placeholder="현재 비밀번호" autoComplete="current-password" value={mine.current} onChange={(e) => setMine({ ...mine, current: e.target.value })} />
        <input type="password" className="field !py-2" placeholder="새 비밀번호 (8자 이상)" autoComplete="new-password" value={mine.password} onChange={(e) => setMine({ ...mine, password: e.target.value })} />
        <input type="password" className="field !py-2" placeholder="새 비밀번호 확인" autoComplete="new-password" value={mine.confirm} onChange={(e) => setMine({ ...mine, confirm: e.target.value })} />
        <button type="submit" disabled={saving || !mine.current || !mine.password} className="btn-secondary !px-4 !py-2 disabled:opacity-40">
          {saving ? '바꾸는 중…' : '변경'}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
      {notice && <p className="mt-2 text-sm text-accent-cyan">{notice}</p>}
    </section>
  );
}
