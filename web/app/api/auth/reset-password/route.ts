import { NextResponse } from 'next/server';
import { resetPasswordWithToken } from '@/lib/password';
import { MIN_PASSWORD } from '@/lib/auth';

export async function POST(req: Request) {
  const { email, token, password } = await req.json().catch(() => ({}));
  if (!email || !token) return NextResponse.json({ error: '재설정 링크가 올바르지 않습니다.' }, { status: 400 });
  if (!password || String(password).length < MIN_PASSWORD) {
    return NextResponse.json({ error: `비밀번호는 ${MIN_PASSWORD}자 이상으로 정해 주세요.` }, { status: 400 });
  }
  try {
    await resetPasswordWithToken(String(email), String(token), String(password));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '실패했습니다.' }, { status: 400 });
  }
}
