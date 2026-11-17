import { NextResponse } from 'next/server';
import { rpc } from '@/lib/db';
import { EMAIL_RE, MIN_PASSWORD, fail, signupDomainOk } from '@/lib/auth';
import { hashPassword } from '@/lib/password';
import { sendSignupNotice } from '@/lib/email';

/** Anyone with a company address can ask; a super admin approves before they can sign in. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim();
  const team = String(body.team ?? '').trim();
  const password = String(body.password ?? '');

  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: '이메일 형식이 올바르지 않습니다.' }, { status: 400 });
  if (!signupDomainOk(email)) {
    return NextResponse.json({ error: '회사 이메일(@creverse.com)로만 가입할 수 있습니다.' }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: '이름을 입력해 주세요.' }, { status: 400 });
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `비밀번호는 ${MIN_PASSWORD}자 이상으로 정해 주세요.` }, { status: 400 });
  }

  try {
    const res = await rpc<{ ok: boolean; status?: string }>('stat_user_signup', {
      email,
      name,
      team,
      password_hash: await hashPassword(password),
    });
    if (!res.ok) {
      const msg =
        res.status === 'pending'
          ? '이미 가입 신청한 이메일입니다. 승인을 기다려 주세요.'
          : '이미 가입된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용해 주세요.';
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    const admins = await rpc<string[]>('stat_super_admin_emails', {});
    await sendSignupNotice(admins ?? [], { email, name, team }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
