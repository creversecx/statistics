import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { getUser } from '@/lib/auth';
import { checkPassword } from '@/lib/password';
import { rpc } from '@/lib/db';

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) return NextResponse.json({ error: '이메일과 비밀번호를 입력해 주세요.' }, { status: 400 });

  const user = await getUser(String(email).trim());
  if (!user) return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  if (!user.password_hash) {
    return NextResponse.json(
      { error: '아직 비밀번호가 없는 계정입니다. 아래 "비밀번호 찾기"로 메일을 받아 비밀번호를 정해 주세요.' },
      { status: 401 }
    );
  }
  if (!(await checkPassword(String(password), user.password_hash))) {
    return NextResponse.json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 });
  }
  if (user.status === 'pending') return NextResponse.json({ error: '가입 승인을 기다리는 중입니다. 슈퍼어드민이 승인하면 로그인할 수 있습니다.' }, { status: 403 });
  if (user.status === 'rejected') return NextResponse.json({ error: '가입이 승인되지 않았습니다. 슈퍼어드민에게 문의해 주세요.' }, { status: 403 });
  if (user.status === 'disabled') return NextResponse.json({ error: '사용이 중지된 계정입니다. 슈퍼어드민에게 문의해 주세요.' }, { status: 403 });

  const session = await getSession();
  session.user = { email: user.email, name: user.name, role: user.role };
  await session.save();
  await rpc('stat_user_update', { email: user.email, touch_login: true });
  return NextResponse.json({ ok: true, role: user.role });
}
