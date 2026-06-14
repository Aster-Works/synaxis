import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, getApiContext } from '@/app/lib/api';
import { getActiveChurch } from '@/app/lib/auth';
import { runSheetsExport, GoogleAuthExpiredError } from '@/app/lib/google/server';

export const runtime = 'nodejs';

const exportSchema = z.object({ year: z.number().int().min(2000).max(2100) });

// POST: 選択年度を Google Sheets へ出力/更新する。owner/admin のみ。
// 戻り値は spreadsheetUrl と合計のみ（トークンは返さない）。
export async function POST(request: NextRequest) {
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const active = await getActiveChurch();
  if (!active || !['owner', 'admin'].includes(active.role)) {
    return apiError('権限がありません', 403);
  }

  const parsed = exportSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError('年度が不正です', 422);

  try {
    const r = await runSheetsExport(
      supabase,
      active.church_id,
      active.church.timezone,
      parsed.data.year,
    );
    if (!r.connected) return apiError('Google が未接続です', 404);
    return NextResponse.json({ spreadsheetUrl: r.spreadsheetUrl, totals: r.totals });
  } catch (e) {
    if (e instanceof GoogleAuthExpiredError) {
      return NextResponse.json({ error: 'reconnect' }, { status: 409 });
    }
    return apiError('出力に失敗しました', 500);
  }
}
