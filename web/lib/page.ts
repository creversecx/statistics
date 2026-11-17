import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';

/** For server pages: the active user, or off to /login. */
export async function pageUser(opts: { admin?: boolean } = {}) {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (opts.admin && user.role !== 'super_admin') redirect('/dashboard');
  return user;
}
