import { NextResponse, type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { getEventById } from '@/app/lib/reception';
import { putAttendanceSchema } from '@/app/lib/validation';

type Params = { params: Promise<{ eventId: string; personId: string }> };

// PUT: 「この人物をこの礼拝に出席させ、昼食数を N にする」望む最終状態を設定する。
// (service_event_id, person_id) で upsert するため、同じ要求を再送しても安全（冪等）。
export async function PUT(request: NextRequest, { params }: Params) {
  const { eventId, personId } = await params;
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const body = await request.json().catch(() => ({}));
  const parsed = putAttendanceSchema.safeParse(body);
  if (!parsed.success) return apiError('入力が正しくありません', 422);

  // RLS により自教会のイベントのみ可視。ここで church_id を確定する。
  const event = await getEventById(supabase, eventId);
  if (!event) return apiError('礼拝が見つかりません', 404);

  const { data, error } = await supabase
    .from('attendance_records')
    .upsert(
      {
        service_event_id: eventId,
        person_id: personId,
        church_id: event.church_id,
        lunch_quantity: parsed.data.lunchQuantity,
        checked_in_by: user.id,
        source: 'reception',
      },
      { onConflict: 'service_event_id,person_id' },
    )
    .select()
    .single();

  if (error) {
    // RLS 拒否・church_id 整合トリガー違反・存在しない人物など。
    return apiError('保存に失敗しました', 403);
  }
  return NextResponse.json({ attendance: data });
}

// DELETE: 出席を取り消す（未出席にする）。存在しなくても成功扱い＝冪等。
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { eventId, personId } = await params;
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const { error } = await supabase
    .from('attendance_records')
    .delete()
    .eq('service_event_id', eventId)
    .eq('person_id', personId);

  if (error) return apiError('取り消しに失敗しました', 403);
  return NextResponse.json({ ok: true });
}
