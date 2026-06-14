import { NextResponse, type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { getActiveChurch } from '@/app/lib/auth';
import { getPeriodReport, parseReportFilter } from '@/app/lib/reports';

// GET /api/reports/attendance?period=3m|6m|all&kinds=morning_worship,evening_worship&ratedOnly=0|1
// 期間集計。集計は getPeriodReport→summarizePeriod（純関数）に委譲し、
// 画面・CSV・Sheets と合計を一致させる。読み取り専用・RLS 下・church_id 明示。
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

  const report = await getPeriodReport(
    supabase,
    active.church_id,
    active.church.timezone,
    filter,
  );

  return NextResponse.json({
    period: filter.period,
    filter: report.filter,
    eventReports: report.eventReports,
    totals: report.totals,
    byRelationship: report.totals.byRelationship,
    byKind: report.totals.byKind,
    trend: report.trend,
  });
}
