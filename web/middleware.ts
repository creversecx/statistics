import { NextResponse, type NextRequest } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type Session } from '@/lib/session';

/** Signed-out visitors go to /login. Pages re-check status against the DB; this is the fast first gate. */
export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const session = await getIronSession<{ user?: Session }>(req, res, sessionOptions);
  const { pathname } = req.nextUrl;
  if (!session.user) return NextResponse.redirect(new URL('/login', req.url));
  if (pathname.startsWith('/admin') && session.user.role !== 'super_admin') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }
  return res;
}

export const config = {
  matcher: ['/dashboard/:path*', '/selvas/:path*', '/upload/:path*', '/datasets/:path*', '/admin/:path*'],
};
