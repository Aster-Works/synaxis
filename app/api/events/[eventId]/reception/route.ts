import { NextResponse, type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { getEventById, getReceptionRows } from '@/app/lib/reception';
import { summarizeReception } from '@/app/lib/aggregate';

type Params = { params: Promise<{ eventId: string }> };

// GET: 受付の最新状態（人物＋出席行＋合計）。複数端末の再取得・収束に使う。
export async function GET(_request: NextRequest, { params }: Params) {
  const { eventId } = await params;
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const event = await getEventById(supabase, eventId);
  if (!event) return apiError('礼拝が見つかりません', 404);

  try {
    const rows = await getReceptionRows(supabase, event.church_id, eventId);
    const summary = summarizeReception(rows);
    return NextResponse.json({ event, rows, summary });
  } catch {
    // 一時障害。クライアント（useReceptionSync）は手元の最新表示を保って再試行する。
    return apiError('受付データの取得に失敗しました', 503);
  }
}
