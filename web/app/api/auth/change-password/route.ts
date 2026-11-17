import { NextResponse } from 'next/server';
import { MIN_PASSWORD, getUser, isResponse, requireUser } from '@/lib/auth';
import { checkPassword, hashPassword } from '@/lib/password';
import { rpc } from '@/lib/db';

export async function POST(req: Request) {
  const me = await requireUser();
  if (isResponse(me)) return me;
  const { current, password } = await req.json().catch(() => ({}));
  if (!password || String(password).length < MIN_PASSWORD) {
    return NextResponse.json({ error: `새 비밀번호는 ${MIN_PASSWORD}자 이상으로 정해 주세요.` }, { status: 400 });
  }
  const row = await getUser(me.email);
  if (!row || !(await checkPassword(String(current ?? ''), row.password_hash))) {
    return NextResponse.json({ error: '현재 비밀번호가 맞지 않습니다.' }, { status: 400 });
  }
  await rpc('stat_user_update', { email: me.email, password_hash: await hashPassword(String(password)) });
  return NextResponse.json({ ok: true });
}
