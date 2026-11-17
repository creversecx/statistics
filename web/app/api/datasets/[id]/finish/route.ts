import { NextResponse } from 'next/server';
import { fail, isResponse, requireUser } from '@/lib/auth';
import { rpc } from '@/lib/db';

type Ctx = { params: { id: string } };

/** GET: which existing datasets cover the same brand·semester·week·content. POST: publish it. */
export async function GET(_req: Request, { params }: Ctx) {
  const me = await requireUser();
  if (isResponse(me)) return me;
  try {
    return NextResponse.json({ overlap: await rpc('stat_dataset_overlap', { id: params.id }) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const me = await requireUser();
  if (isResponse(me)) return me;
  const ds = await rpc<{ uploaded_by: string } | null>('stat_dataset_get', { id: params.id });
  if (!ds || ds.uploaded_by !== me.email) return NextResponse.json({ error: '업로드 중인 데이터셋이 아닙니다.' }, { status: 400 });
  const { replace_overlap } = await req.json().catch(() => ({}));
  try {
    return NextResponse.json(await rpc('stat_dataset_finish', { id: params.id, replace_overlap: !!replace_overlap }));
  } catch (e) {
    return fail(e);
  }
}
