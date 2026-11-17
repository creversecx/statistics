import { NextResponse } from 'next/server';
import { fail, isResponse, requireUser } from '@/lib/auth';
import { rpc } from '@/lib/db';

export async function GET() {
  const me = await requireUser();
  if (isResponse(me)) return me;
  try {
    await rpc('stat_dataset_cleanup', {});
    return NextResponse.json({ datasets: await rpc('stat_dataset_list', {}) });
  } catch (e) {
    return fail(e);
  }
}

/** Starts an upload: { name, brand, metric, source_file, source_sheets, mapping, note } → { id } */
export async function POST(req: Request) {
  const me = await requireUser();
  if (isResponse(me)) return me;
  const body = await req.json().catch(() => ({}));
  if (!body.name || !body.brand || !['enroll', 'complete'].includes(body.metric)) {
    return NextResponse.json({ error: '이름, 브랜드, 지표를 정해 주세요.' }, { status: 400 });
  }
  try {
    const res = await rpc<{ id: string }>('stat_dataset_create', {
      name: String(body.name).slice(0, 200),
      brand: String(body.brand),
      metric: body.metric,
      source_file: String(body.source_file ?? ''),
      source_sheets: Array.isArray(body.source_sheets) ? body.source_sheets.map(String) : [],
      mapping: body.mapping ?? {},
      note: String(body.note ?? ''),
      cut: typeof body.cut === 'string' ? body.cut.trim().slice(0, 40) : '',
      uploaded_by: me.email,
    });
    return NextResponse.json(res);
  } catch (e) {
    return fail(e);
  }
}
