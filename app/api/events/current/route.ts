import { NextResponse } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { getActiveChurch } from '@/app/lib/auth';
import { getTodayEvents, pickCurrentEvent } from '@/app/lib/reception';

// GET: アクティブ教会の「本日の礼拝」と当日のイベント一覧を返す。
export async function GET() {
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const active = await getActiveChurch();
  if (!active) return apiError('所属教会がありません', 404);

  const events = await getTodayEvents(
    supabase,
    active.church_id,
    active.church.timezone,
  );
  const current = pickCurrentEvent(events);

  return NextResponse.json({ event: current, events });
}
