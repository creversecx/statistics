import { TopNav } from '@/components/ui/TopNav';
import { pageUser } from '@/lib/page';
import { AdminConsole } from './AdminConsole';

export default async function AdminPage() {
  const me = await pageUser({ admin: true });
  return (
    <main>
      <TopNav role={me.role} email={me.email} name={me.name} />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="mb-2 text-3xl font-extrabold">관리</h1>
        <p className="mb-10 text-base text-white/70">슈퍼어드민 전용 · 가입 승인, 계정, 학원 정보</p>
        <AdminConsole me={me.email} />
      </div>
    </main>
  );
}
