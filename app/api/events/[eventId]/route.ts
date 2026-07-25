import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { apiError, dbErrorStatus, getApiContext } from '@/app/lib/api';
import { getActiveChurch } from '@/app/lib/auth';
import { zonedDateTimeToUtcISO } from '@/app/lib/datetime';
import { serviceKindSchema, serviceStatusSchema } from '@/app/lib/validation';

type Params = { params: Promise<{ eventId: string }> };

const updateEventSchema = z.object({
  kind: serviceKindSchema,
  name: z.string().trim().min(1).max(100),
  startsAtLocal: z.string().min(1), // "YYYY-MM-DDTHH:MM"（教会ローカル）
  status: serviceStatusSchema,
  countsTowardAttendanceRate: z.boolean(),
  lunchEnabled: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

// PATCH: 礼拝予定を編集する。RLS（events_update = owner/admin）。
export async function PATCH(request: NextRequest, { params }: Params) {
  const { eventId } = await params;
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);
  const active = await getActiveChurch();
  if (!active) return apiError('所属教会がありません', 404);

  const body = await request.json().catch(() => ({}));
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? '入力が正しくありません', 422);
  }

  const { data, error } = await supabase
    .from('service_events')
    .update({
      kind: parsed.data.kind,
      name: parsed.data.name,
      starts_at: zonedDateTimeToUtcISO(parsed.data.startsAtLocal, active.church.timezone),
      status: parsed.data.status,
      counts_toward_attendance_rate: parsed.data.countsTowardAttendanceRate,
      lunch_enabled: parsed.data.lunchEnabled,
      note: parsed.data.note ?? null,
    })
    .eq('id', eventId)
    // アクティブ教会に限定（RLS に加えた多重防御）。starts_at をアクティブ教会の
    // timezone で変換しているため、他教会のイベントを対象にさせない意味もある。
    .eq('church_id', active.church_id)
    .select()
    .maybeSingle();

  if (error) return apiError('更新に失敗しました', dbErrorStatus(error));
  if (!data) return apiError('権限がないか、礼拝が見つかりません', 404);
  return NextResponse.json({ event: data });
}

// DELETE: 礼拝を削除する（その礼拝の出席も連動して消える）。RLS（events_delete = owner/admin）。
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { eventId } = await params;
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);
  const active = await getActiveChurch();
  if (!active) return apiError('所属教会がありません', 404);

  const { error, count } = await supabase
    .from('service_events')
    .delete({ count: 'exact' })
    .eq('id', eventId)
    .eq('church_id', active.church_id);

  if (error) return apiError('削除に失敗しました', dbErrorStatus(error));
  if (!count) return apiError('権限がないか、礼拝が見つかりません', 404);
  return NextResponse.json({ ok: true });
}
