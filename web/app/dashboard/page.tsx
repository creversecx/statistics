import { TopNav } from '@/components/ui/TopNav';
import { pageUser } from '@/lib/page';
import { Analyzer } from './Analyzer';

export default async function DashboardPage() {
  const me = await pageUser();
  return (
    <main>
      <TopNav role={me.role} email={me.email} name={me.name} />
      <div className="mx-auto max-w-[1440px] px-6 py-10 lg:px-8">
        <Analyzer me={{ email: me.email, role: me.role }} />
      </div>
    </main>
  );
}
