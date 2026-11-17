import { NextResponse } from 'next/server';
import { fail, getUser, isResponse, requireSuperAdmin } from '@/lib/auth';
import { rpc } from '@/lib/db';
import { generatePassword, hashPassword } from '@/lib/password';
import { sendApprovedNotice } from '@/lib/email';

type Ctx = { params: { email: string } };

/**
 * { action: 'approve' | 'reject' | 'disable' | 'enable' | 'make_admin' | 'make_member' | 'reset_password', password? }
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const me = await requireSuperAdmin();
  if (isResponse(me)) return me;
  const email = decodeURIComponent(params.email).toLowerCase();
  const { action, password } = await req.json().catch(() => ({}));
  const target = await getUser(email);
  if (!target) return NextResponse.json({ error: '없는 계정입니다.' }, { status: 404 });

  const self = email === me.email;
  if (self && ['disable', 'reject', 'make_member'].includes(action)) {
    return NextResponse.json({ error: '자기 자신의 권한은 바꿀 수 없습니다.' }, { status: 400 });
  }

  try {
    switch (action) {
      case 'approve':
        await rpc('stat_user_update', { email, status: 'active', approved_by: me.email });
        await sendApprovedNotice(email).catch(() => {});
        break;
      case 'reject':
        await rpc('stat_user_update', { email, status: 'rejected' });
        break;
      case 'disable':
        await rpc('stat_user_update', { email, status: 'disabled' });
        break;
      case 'enable':
        await rpc('stat_user_update', { email, status: 'active' });
        break;
      case 'make_admin':
        await rpc('stat_user_update', { email, role: 'super_admin' });
        break;
      case 'make_member':
        await rpc('stat_user_update', { email, role: 'member' });
        break;
      case 'reset_password': {
        const plain = password ? String(password) : generatePassword();
        if (plain.length < 8) return NextResponse.json({ error: '비밀번호는 8자 이상으로 정해 주세요.' }, { status: 400 });
        await rpc('stat_user_update', { email, password_hash: await hashPassword(plain) });
        return NextResponse.json({ ok: true, password: password ? null : plain });
      }
      default:
        return NextResponse.json({ error: '알 수 없는 요청입니다.' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const me = await requireSuperAdmin();
  if (isResponse(me)) return me;
  const email = decodeURIComponent(params.email).toLowerCase();
  if (email === me.email) return NextResponse.json({ error: '자기 자신은 지울 수 없습니다.' }, { status: 400 });
  try {
    await rpc('stat_user_delete', { email });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
