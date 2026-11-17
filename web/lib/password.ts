import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { rpc } from '@/lib/db';
import { getUser } from '@/lib/auth';
import { sendPasswordResetEmail } from '@/lib/email';

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function generatePassword(length = 12) {
  return Array.from(randomBytes(length), (b) => CHARSET[b % CHARSET.length]).join('');
}

export const hashPassword = (plain: string) => bcrypt.hash(plain, 10);
export const checkPassword = (plain: string, hash: string | null) =>
  hash ? bcrypt.compare(plain, hash) : Promise.resolve(false);

const RESET_TTL_MS = 30 * 60 * 1000;

/**
 * Emails a one-time link. Quietly does nothing for unknown or inactive
 * accounts so the form can't be used to find out who is registered. This is
 * also how the two seeded super admins set their first password.
 */
export async function requestPasswordReset(email: string) {
  const user = await getUser(email);
  if (!user || user.status !== 'active') return;
  const token = generatePassword(32);
  const expires = new Date(Date.now() + RESET_TTL_MS);
  await rpc('stat_user_update', {
    email: user.email,
    reset_token_hash: await hashPassword(token),
    reset_token_expires: expires.toISOString(),
  });
  await sendPasswordResetEmail(user.email, token, expires);
}

export async function resetPasswordWithToken(email: string, token: string, password: string) {
  const user = await getUser(email);
  const bad = '재설정 링크가 유효하지 않습니다. 다시 요청해 주세요.';
  if (!user?.reset_token_hash || !user.reset_token_expires) throw new Error(bad);
  if (new Date(user.reset_token_expires).getTime() < Date.now()) throw new Error('재설정 링크가 만료되었습니다. 다시 요청해 주세요.');
  if (!(await bcrypt.compare(token, user.reset_token_hash))) throw new Error(bad);
  await rpc('stat_user_update', {
    email: user.email,
    password_hash: await hashPassword(password),
    reset_token_hash: null,
    reset_token_expires: null,
  });
}
