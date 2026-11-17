import { NextResponse } from 'next/server';
import { fail, isResponse, requireUser } from '@/lib/auth';
import { rpc } from '@/lib/db';

type Ctx = { params: { id: string } };
type Ds = { id: string; uploaded_by: string | null };

async function owned(id: string, me: { email: string; role: string }) {
  const ds = await rpc<Ds | null>('stat_dataset_get', { id });
  if (!ds) return NextResponse.json({ error: '없는 데이터셋입니다.' }, { status: 404 });
  if (ds.uploaded_by !== me.email && me.role !== 'super_admin') {
    return NextResponse.json({ error: '올린 사람이나 슈퍼어드민만 바꿀 수 있습니다.' }, { status: 403 });
  }
  return ds;
}

export async function PATCH(req: Request, { params }: Ctx) {
  const me = await requireUser();
  if (isResponse(me)) return me;
  const ds = await owned(params.id, me);
  if (isResponse(ds)) return ds;
  const body = await req.json().catch(() => ({}));
  const p: Record<string, unknown> = { id: params.id };
  if (typeof body.name === 'string' && body.name.trim()) p.name = body.name.trim().slice(0, 200);
  if (typeof body.note === 'string') p.note = body.note.slice(0, 2000);
  try {
    return NextResponse.json(await rpc('stat_dataset_update', p));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await requireUser();
  if (isResponse(me)) return me;
  const ds = await owned(params.id, me);
  if (isResponse(ds)) return ds;
  try {
    return NextResponse.json(await rpc('stat_dataset_delete', { id: params.id }));
  } catch (e) {
    return fail(e);
  }
}
