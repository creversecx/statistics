import { getIronSession, type SessionOptions } from 'iron-session';
import { cookies } from 'next/headers';

export type Session = {
  role: 'super_admin' | 'member';
  email: string;
  name: string;
};

export type SessionData = { user?: Session };

export const sessionOptions: SessionOptions = {
  cookieName: 'creverse_stats_session',
  // Production must set SESSION_SECRET (32+ chars); iron-session refuses to start without one.
  password: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'local-dev-only-session-secret-change-me-0123456789'),
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 14, // 2 weeks
  },
};

export async function getSession() {
  return getIronSession<SessionData>(cookies(), sessionOptions);
}
