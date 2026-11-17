'use client';

import { useEffect, useState } from 'react';
import { UsersPanel } from './UsersPanel';
import { BranchesPanel } from './BranchesPanel';
import { MyPassword } from './MyPassword';

const TABS = [
  { id: 'users', label: '계정' },
  { id: 'branches', label: '학원 정보' },
  { id: 'me', label: '내 비밀번호' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function AdminConsole({ me }: { me: string }) {
  const [tab, setTab] = useState<TabId>('users');
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const fromHash = window.location.hash.slice(1) as TabId;
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash);
  }, []);
  function open(id: TabId) {
    setTab(id);
    history.replaceState(null, '', `#${id}`);
  }

  return (
    <div>
      <nav className="mb-8 flex flex-wrap gap-1 rounded-full border border-line bg-white/[0.02] p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => open(t.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition ${
              tab === t.id ? 'bg-white font-semibold text-base-950' : 'text-white/75 hover:bg-white/5 hover:text-white'
            }`}
          >
            {t.label}
            {t.id === 'users' && pending > 0 && (
              <span className="rounded-full bg-accent-pink px-1.5 text-[11px] font-bold leading-[18px] text-base-950">{pending}</span>
            )}
          </button>
        ))}
      </nav>
      <div className="rise-in" key={tab}>
        {tab === 'users' && <UsersPanel me={me} onPending={setPending} />}
        {tab === 'branches' && <BranchesPanel />}
        {tab === 'me' && (
          <div className="max-w-2xl">
            <MyPassword />
          </div>
        )}
      </div>
    </div>
  );
}
