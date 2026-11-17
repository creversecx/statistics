import { NextResponse } from 'next/server';
import { fail, isResponse, requireSuperAdmin, requireUser } from '@/lib/auth';
import { rpc } from '@/lib/db';

const BRANDS = ['AP', 'CD', 'CD_Prime'];

/**
 * { op: 'weeks' }                         → 정산 대상 브랜드의 주차·시작일 목록
 * { op: 'counts', brand, semester, week } → 그 주의 프로그램 × 레벨별 수강생
 * { op: 'settings' }                      → 단가 등 설정
 * { op: 'save_settings', value }          → (슈퍼어드민) 설정 저장
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  try {
    if (body.op === 'save_settings') {
      const me = await requireSuperAdmin();
      if (isResponse(me)) return me;
      await rpc('stat_setting_set', { key: 'selvas', value: body.value ?? {}, updated_by: me.email });
      return NextResponse.json({ ok: true });
    }
    const me = await requireUser();
    if (isResponse(me)) return me;
    if (body.op === 'weeks') return NextResponse.json({ weeks: await rpc('stat_weeks', { brands: BRANDS }) });
    if (body.op === 'settings') return NextResponse.json({ value: (await rpc('stat_setting_get', { key: 'selvas' })) ?? {} });
    if (body.op === 'counts') {
      if (!BRANDS.includes(body.brand) || !body.semester || !Number.isInteger(body.week)) {
        return NextResponse.json({ error: '브랜드·학기·주차가 필요합니다.' }, { status: 400 });
      }
      return NextResponse.json(await rpc('stat_program_counts', { brand: body.brand, semester: String(body.semester), week: body.week }));
    }
    return NextResponse.json({ error: '알 수 없는 요청입니다.' }, { status: 400 });
  } catch (e) {
    return fail(e);
  }
}
