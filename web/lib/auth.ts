import { NextResponse } from 'next/server';
import { getSession, type Session } from '@/lib/session';
import { rpc } from '@/lib/db';

export type UserRow = {
  email: string;
  name: string;
  team: string;
  password_hash: string | null;
  role: 'super_admin' | 'member';
  status: 'pending' | 'active' | 'rejected' | 'disabled';
  reset_token_hash: string | null;
  reset_token_expires: string | null;
};

export const getUser = (email: string) => rpc<UserRow | null>('stat_user_get', { email });

/**
 * The signed-in user, re-checked against the table on every call so a super
 * admin disabling someone takes effect at once, not when the cookie expires.
 */
export async function currentUser(): Promise<Session | null> {
  const session = await getSession();
  if (!session.user) return null;
  const row = await getUser(session.user.email);
  if (!row || row.status !== 'active') return null;
  return { email: row.email, name: row.name, role: row.role };
}

export async function requireUser(): Promise<Session | NextResponse> {
  const user = await currentUser();
  return user ?? NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
}

export async function requireSuperAdmin(): Promise<Session | NextResponse> {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  if (user.role !== 'super_admin') return NextResponse.json({ error: '슈퍼어드민만 할 수 있습니다.' }, { status: 403 });
  return user;
}

export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;

export function fail(e: unknown, status = 500) {
  const message = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error: message }, { status });
}

/** Sign-up is open to these mail domains only (comma-separated env; default creverse.com; * = any). */
export function signupDomainOk(email: string) {
  const domains = (process.env.SIGNUP_ALLOWED_DOMAINS ?? 'creverse.com')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0 || domains.includes('*')) return true;
  return domains.includes(email.split('@')[1]?.toLowerCase() ?? '');
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD = 8;
