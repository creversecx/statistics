import { NextResponse } from 'next/server';
import { fail, isResponse, requireSuperAdmin } from '@/lib/auth';
import { rpc } from '@/lib/db';

export async function GET() {
  const me = await requireSuperAdmin();
  if (isResponse(me)) return me;
  try {
    return NextResponse.json({ users: await rpc('stat_user_list', {}) });
  } catch (e) {
    return fail(e);
  }
}
