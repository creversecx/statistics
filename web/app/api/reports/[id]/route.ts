import { NextResponse } from 'next/server';
import { fail, isResponse, requireUser } from '@/lib/auth';
import { rpc } from '@/lib/db';

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const me = await requireUser();
  if (isResponse(me)) return me;
  try {
    const prev = await rpc<{ created_by: string } | null>('stat_report_get', { id: params.id });
    if (!prev) return NextResponse.json({ error: '없는 보고서입니다.' }, { status: 404 });
    if (prev.created_by !== me.email && me.role !== 'super_admin') {
      return NextResponse.json({ error: '만든 사람이나 슈퍼어드민만 지울 수 있습니다.' }, { status: 403 });
    }
    return NextResponse.json(await rpc('stat_report_delete', { id: params.id }));
  } catch (e) {
    return fail(e);
  }
}
