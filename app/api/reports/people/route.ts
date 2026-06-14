import { NextResponse, type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { getActiveChurch } from '@/app/lib/auth';
import { getPeopleStats } from '@/app/lib/reports';
import type { Period } from '@/app/lib/types';

// GET /api/reports/people?period=3m|6m|all
// 人物別の出席統計（回数・出席率・初回/最終出席日・新来ゲスト）。
export async function GET(request: NextRequest) {
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const active = await getActiveChurch();
  if (!active) return apiError('所属教会がありません', 404);

  const period = (['3m', '6m', 'all'] as const).includes(
    request.nextUrl.searchParams.get('period') as Period,
  )
    ? (request.nextUrl.searchParams.get('period') as Period)
    : '3m';

  const { ratedEventCount, people } = await getPeopleStats(
    supabase,
    active.church_id,
    active.church.timezone,
    period,
  );

  return NextResponse.json({ period, ratedEventCount, people });
}
