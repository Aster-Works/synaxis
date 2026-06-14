import { type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { getActiveChurch } from '@/app/lib/auth';
import {
  getPeriodReport,
  getPeopleStats,
  getAttendanceMatrix,
  parseReportFilter,
} from '@/app/lib/reports';
import { toCsv } from '@/app/lib/csv';
import {
  buildSummaryRows,
  buildPeopleRows,
  buildGuestsRows,
  buildMatrixRows,
} from '@/app/lib/export-csv';
import type { CsvCell } from '@/app/lib/csv';

const TYPES = ['summary', 'matrix', 'guests', 'people'] as const;
type ExportType = (typeof TYPES)[number];

// GET /api/reports/export?type=summary|matrix|guests|people&period=&kinds=&ratedOnly=
// 読み取り専用・RLS 下。集計はダッシュボードと同じ純関数を共有し合計が一致する。
export async function GET(request: NextRequest) {
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const active = await getActiveChurch();
  if (!active) return apiError('所属教会がありません', 404);

  const sp = request.nextUrl.searchParams;
  const type = (TYPES as readonly string[]).includes(sp.get('type') ?? '')
    ? (sp.get('type') as ExportType)
    : 'summary';
  const filter = parseReportFilter({
    period: sp.get('period'),
    kinds: sp.get('kinds'),
    ratedOnly: sp.get('ratedOnly'),
  });
  const tz = active.church.timezone;

  let rows: CsvCell[][];
  if (type === 'summary') {
    const report = await getPeriodReport(supabase, active.church_id, tz, filter);
    rows = buildSummaryRows(report, tz);
  } else if (type === 'matrix') {
    const m = await getAttendanceMatrix(supabase, active.church_id, filter);
    rows = buildMatrixRows(m.events, m.people, m.present, tz);
  } else {
    const { people } = await getPeopleStats(supabase, active.church_id, tz, filter.period);
    rows = type === 'guests' ? buildGuestsRows(people) : buildPeopleRows(people);
  }

  const csv = toCsv(rows);
  const filename = `synaxis-${active.church.slug}-${type}-${filter.period}.csv`;

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
