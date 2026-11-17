import { TopNav } from '@/components/ui/TopNav';
import { pageUser } from '@/lib/page';
import { UploadClient } from './UploadClient';

export default async function UploadPage() {
  const me = await pageUser();
  return (
    <main>
      <TopNav role={me.role} email={me.email} name={me.name} />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <h1 className="mb-2 text-3xl font-extrabold leading-tight">raw 데이터를 올리세요</h1>
        <p className="mb-10 text-base text-white/70">열을 자동으로 알아보고, 합계 행과 병합 셀을 정리해 수강률·완료율 데이터로 바꿉니다.</p>
        <UploadClient />
      </div>
    </main>
  );
}
