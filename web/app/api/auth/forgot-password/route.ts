import { NextResponse } from 'next/server';
import { requestPasswordReset } from '@/lib/password';

export async function POST(req: Request) {
  const { email } = await req.json().catch(() => ({}));
  if (!email) return NextResponse.json({ error: '이메일을 입력해 주세요.' }, { status: 400 });
  try {
    await requestPasswordReset(String(email).trim());
  } catch (e) {
    console.error('[forgot-password]', e);
  }
  // Same answer either way, so the form doesn't reveal who has an account.
  return NextResponse.json({ ok: true });
}
