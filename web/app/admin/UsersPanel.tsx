'use client';

import { useEffect, useState } from 'react';

type User = {
  email: string;
  name: string;
  team: string;
  role: 'super_admin' | 'member';
  status: 'pending' | 'active' | 'rejected' | 'disabled';
  created_at: string;
  approved_at: string | null;
  approved_by: string | null;
  last_login_at: string | null;
  has_password: boolean;
};

const STATUS: Record<User['status'], { label: string; cls: string }> = {
  pending: { label: '승인 대기', cls: 'bg-accent-pink/15 text-accent-pink' },
  active: { label: '사용 중', cls: 'bg-accent-cyan/15 text-accent-cyan' },
  rejected: { label: '거절됨', cls: 'bg-white/10 text-white/60' },
  disabled: { label: '중지됨', cls: 'bg-white/10 text-white/60' },
};

const when = (s: string | null) => (s ? new Date(s).toLocaleDateString('ko-KR') : '–');

export function UsersPanel({ me, onPending }: { me: string; onPending: (n: number) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch('/api/admin/users').then((x) => x.json()).catch(() => ({}));
    const list: User[] = r.users ?? [];
    setUsers(list);
    onPending(list.filter((u) => u.status === 'pending').length);
  }
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(u: User, action: string, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    setNotice(null);
    setBusy(u.email + action);
    const res = await fetch(`/api/admin/users/${encodeURIComponent(u.email)}`, {
      method: action === 'delete' ? 'DELETE' : 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: action === 'delete' ? undefined : JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) return setError(data.error ?? '처리하지 못했습니다.');
    if (action === 'reset_password' && data.password) {
      setNotice(`${u.email}의 임시 비밀번호: ${data.password} (이 화면에만 한 번 표시됩니다 — 본인에게 전달하고, 로그인 후 바꾸게 해 주세요)`);
    }
    if (action === 'approve') setNotice(`${u.name || u.email}님을 승인했습니다. 승인 메일을 보냈습니다.`);
    refresh();
  }

  const pending = users.filter((u) => u.status === 'pending');
  const others = users.filter((u) => u.status !== 'pending');

  return (
    <div className="space-y-10">
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {notice && <p className="rounded-lg border border-accent-cyan/30 bg-accent-cyan/5 px-4 py-3 text-sm text-accent-cyan">{notice}</p>}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/75">가입 승인 대기 {pending.length > 0 && <span className="text-accent-pink">{pending.length}</span>}</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-white/60">기다리는 신청이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {pending.map((u) => (
              <li key={u.email} className="card flex flex-wrap items-center justify-between gap-3 !p-4">
                <div>
                  <p className="font-semibold">
                    {u.name} <span className="font-normal text-white/60">{u.team}</span>
                  </p>
                  <p className="text-xs text-white/60">
                    {u.email} · 신청 {when(u.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button disabled={!!busy} onClick={() => act(u, 'approve')} className="btn-primary !px-4 !py-2">
                    승인
                  </button>
                  <button disabled={!!busy} onClick={() => act(u, 'reject', `${u.email}의 가입 신청을 거절할까요?`)} className="btn-secondary !px-4 !py-2">
                    거절
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-white/75">전체 계정</h2>
        <div className="card !p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-white/55">
                <th className="px-4 py-2.5 text-left font-medium">계정</th>
                <th className="px-3 py-2.5 text-left font-medium">권한</th>
                <th className="px-3 py-2.5 text-left font-medium">상태</th>
                <th className="px-3 py-2.5 text-left font-medium">최근 로그인</th>
                <th className="px-3 py-2.5 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {others.map((u) => {
                const self = u.email === me;
                return (
                  <tr key={u.email} className="border-t border-line">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">
                        {u.name || '(이름 없음)'} {self && <span className="text-xs text-white/50">(나)</span>}
                      </p>
                      <p className="text-xs text-white/55">
                        {u.email}
                        {u.team ? ` · ${u.team}` : ''}
                        {!u.has_password && ' · 비밀번호 미설정'}
                      </p>
                    </td>
                    <td className="px-3 py-2.5">
                      {u.role === 'super_admin' ? <span className="text-accent-violet">슈퍼어드민</span> : <span className="text-white/75">일반</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[u.status].cls}`}>{STATUS[u.status].label}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-white/60">{when(u.last_login_at)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap justify-end gap-3 text-xs">
                        {!self && u.status === 'active' && (
                          <button onClick={() => act(u, u.role === 'super_admin' ? 'make_member' : 'make_admin', u.role === 'super_admin' ? `${u.email}을 일반 계정으로 바꿀까요?` : `${u.email}에게 슈퍼어드민 권한을 줄까요?`)} className="text-white/70 hover:text-white">
                            {u.role === 'super_admin' ? '일반으로' : '슈퍼어드민으로'}
                          </button>
                        )}
                        {u.status === 'active' && (
                          <button onClick={() => act(u, 'reset_password', `${u.email}의 비밀번호를 임시 비밀번호로 바꿀까요?`)} className="text-white/70 hover:text-white">
                            비밀번호 초기화
                          </button>
                        )}
                        {!self && u.status === 'active' && (
                          <button onClick={() => act(u, 'disable', `${u.email}의 사용을 중지할까요?`)} className="text-white/70 hover:text-white">
                            사용 중지
                          </button>
                        )}
                        {!self && (u.status === 'disabled' || u.status === 'rejected') && (
                          <button onClick={() => act(u, u.status === 'rejected' ? 'approve' : 'enable')} className="text-accent-cyan hover:text-white">
                            {u.status === 'rejected' ? '승인' : '다시 사용'}
                          </button>
                        )}
                        {!self && (
                          <button onClick={() => act(u, 'delete', `${u.email} 계정을 지울까요? 되돌릴 수 없습니다.`)} className="text-rose-400 hover:text-rose-300">
                            삭제
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-white/55">
          가입은 회사 이메일로 누구나 신청할 수 있고, 슈퍼어드민이 승인해야 로그인됩니다. 비밀번호를 잊은 사람은 로그인 화면의 “비밀번호 찾기”로 직접 바꿀 수 있습니다.
        </p>
      </section>
    </div>
  );
}
