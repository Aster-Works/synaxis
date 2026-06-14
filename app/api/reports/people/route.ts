import { NextResponse, type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { getActiveChurch } from '@/app/lib/auth';
import { getPeopleStats, parseReportFilter } from '@/app/lib/reports';

// GET /api/reports/people?period=3m|6m|all&kinds=...&ratedOnly=0|1
// 人物別の出席統計（回数・出席率・初回/最終出席日・新来ゲスト）。
// まとめ集計と母集団を合わせるため kinds/ratedOnly も適用する。
export async function GET(request: NextRequest) {
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const active = await getActiveChurch();
  if (!active) return apiError('所属教会がありません', 404);

  const sp = request.nextUrl.searchParams;
  const filter = parseReportFilter({
    period: sp.get('period'),
    kinds: sp.get('kinds'),
    ratedOnly: sp.get('ratedOnly'),
    count: sp.get('count'),
  });

  const { ratedEventCount, people } = await getPeopleStats(
    supabase,
    active.church_id,
    active.church.timezone,
    filter,
  );

  return NextResponse.json({ period: filter.period, ratedEventCount, people });
}
