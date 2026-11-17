import { NextResponse } from 'next/server';
import { fail, isResponse, requireUser } from '@/lib/auth';
import { rpc } from '@/lib/db';
import { isDim } from '@/lib/dims';

/**
 * { op: 'pivot', metric, rows, cols, filters, week_from, week_to } → { cells }
 * { op: 'dims', metric } → { values: { dim: [..] } }
 */
export async function POST(req: Request) {
  const me = await requireUser();
  if (isResponse(me)) return me;
  const body = await req.json().catch(() => ({}));
  const metric = body.metric === 'complete' ? 'complete' : 'enroll';
  const cut = typeof body.cut === 'string' ? body.cut.slice(0, 60) : '';
  try {
    if (body.op === 'dims') {
      return NextResponse.json({ values: await rpc('stat_dim_values', { metric, cut }) });
    }
    const filters: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(body.filters ?? {})) {
      if (isDim(k) && Array.isArray(v) && v.length) filters[k] = v.map(String);
    }
    const p = {
      metric,
      cut,
      rows: isDim(body.rows) ? body.rows : null,
      cols: isDim(body.cols) ? body.cols : null,
      filters,
      week_from: Number.isInteger(body.week_from) ? body.week_from : null,
      week_to: Number.isInteger(body.week_to) ? body.week_to : null,
    };
    return NextResponse.json({ cells: await rpc('stat_pivot', p) });
  } catch (e) {
    return fail(e);
  }
}
