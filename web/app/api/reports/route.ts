import { NextResponse } from 'next/server';
import { fail, isResponse, requireUser } from '@/lib/auth';
import { rpc } from '@/lib/db';

export async function GET() {
  const me = await requireUser();
  if (isResponse(me)) return me;
  try {
    return NextResponse.json({ reports: await rpc('stat_report_list', {}) });
  } catch (e) {
    return fail(e);
  }
}

/** Save a pivot setup for everyone: { id?, name, description, config } */
export async function POST(req: Request) {
  const me = await requireUser();
  if (isResponse(me)) return me;
  const body = await req.json().catch(() => ({}));
  if (!body.name || typeof body.config !== 'object') return NextResponse.json({ error: '이름을 정해 주세요.' }, { status: 400 });
  try {
    if (body.id) {
      const prev = await rpc<{ created_by: string } | null>('stat_report_get', { id: body.id });
      if (prev && prev.created_by !== me.email && me.role !== 'super_admin') {
        return NextResponse.json({ error: '만든 사람이나 슈퍼어드민만 덮어쓸 수 있습니다.' }, { status: 403 });
      }
    }
    return NextResponse.json(
      await rpc('stat_report_save', {
        id: body.id ?? null,
        name: String(body.name).slice(0, 120),
        description: String(body.description ?? '').slice(0, 500),
        config: body.config,
        created_by: me.email,
      })
    );
  } catch (e) {
    return fail(e);
  }
}
