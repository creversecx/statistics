import { NextResponse } from 'next/server';
import { fail, isResponse, requireSuperAdmin, requireUser } from '@/lib/auth';
import { rpc } from '@/lib/db';

export async function GET() {
  const me = await requireUser();
  if (isResponse(me)) return me;
  try {
    return NextResponse.json({ branches: await rpc('stat_branch_list', {}) });
  } catch (e) {
    return fail(e);
  }
}

/**
 * Super admin only.
 * { op: 'upsert', brand, name, branch_type, alpha, aliases, note }
 * { op: 'delete', brand, name }
 * { op: 'apply' } — re-apply names, 직/가맹 and 알파 to all uploaded rows
 */
export async function POST(req: Request) {
  const me = await requireSuperAdmin();
  if (isResponse(me)) return me;
  const body = await req.json().catch(() => ({}));
  try {
    if (body.op === 'apply') return NextResponse.json(await rpc('stat_branch_apply', {}));
    if (!body.brand || !body.name) return NextResponse.json({ error: '브랜드와 학원 이름이 필요합니다.' }, { status: 400 });
    if (body.op === 'delete') return NextResponse.json(await rpc('stat_branch_delete', { brand: body.brand, name: body.name }));
    return NextResponse.json(
      await rpc('stat_branch_upsert', {
        brand: String(body.brand),
        name: String(body.name).trim(),
        branch_type: body.branch_type ?? null,
        alpha: body.alpha ?? null,
        aliases: Array.isArray(body.aliases) ? body.aliases.map((a: unknown) => String(a).trim()).filter(Boolean) : [],
        note: String(body.note ?? ''),
      })
    );
  } catch (e) {
    return fail(e);
  }
}
