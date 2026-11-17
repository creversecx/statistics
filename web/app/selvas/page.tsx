import { TopNav } from '@/components/ui/TopNav';
import { pageUser } from '@/lib/page';
import { SelvasClient } from './SelvasClient';

export default async function SelvasPage() {
  const me = await pageUser();
  return (
    <main>
      <TopNav role={me.role} email={me.email} name={me.name} />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="mb-2 text-3xl font-extrabold leading-tight">셀바스 정산</h1>
        <p className="mb-8 text-base text-white/70">음성인식 라이선스 청구 인원을 브랜드별 규칙으로 계산하고, 견적 요청 메일 문구를 만듭니다.</p>
        <SelvasClient isAdmin={me.role === 'super_admin'} />
      </div>
    </main>
  );
}
