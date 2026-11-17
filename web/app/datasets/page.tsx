import { TopNav } from '@/components/ui/TopNav';
import { pageUser } from '@/lib/page';
import { DatasetsClient } from './DatasetsClient';

export default async function DatasetsPage() {
  const me = await pageUser();
  return (
    <main>
      <TopNav role={me.role} email={me.email} name={me.name} />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="mb-2 text-3xl font-extrabold leading-tight">데이터셋</h1>
        <p className="mb-10 text-base text-white/70">올라간 raw 데이터 묶음입니다. 잘못 올린 것은 지우고 다시 올리면 됩니다.</p>
        <DatasetsClient me={{ email: me.email, role: me.role }} />
      </div>
    </main>
  );
}
