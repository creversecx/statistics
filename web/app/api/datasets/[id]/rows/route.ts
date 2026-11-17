import { NextResponse } from 'next/server';
import { fail, isResponse, requireUser } from '@/lib/auth';
import { rpc } from '@/lib/db';

type Ctx = { params: { id: string } };

/** One chunk of normalized rows (the browser sends ≤ 3000 at a time to stay under the 4.5MB body limit). */
export async function POST(req: Request, { params }: Ctx) {
  const me = await requireUser();
  if (isResponse(me)) return me;
  const ds = await rpc<{ uploaded_by: string; status: string } | null>('stat_dataset_get', { id: params.id });
  if (!ds || ds.uploaded_by !== me.email || ds.status !== 'loading') {
    return NextResponse.json({ error: '업로드 중인 데이터셋이 아닙니다.' }, { status: 400 });
  }
  const { rows } = await req.json().catch(() => ({}));
  if (!Array.isArray(rows) || rows.length > 5000) return NextResponse.json({ error: '행 묶음이 올바르지 않습니다.' }, { status: 400 });
  try {
    return NextResponse.json(await rpc('stat_dataset_rows', { id: params.id, rows }));
  } catch (e) {
    return fail(e);
  }
}
