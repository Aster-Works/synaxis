'use server';

import { revalidatePath } from 'next/cache';
import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { createEventSchema } from '@/app/lib/validation';
import { zonedDateTimeToUtcISO } from '@/app/lib/datetime';

export interface EventFormState {
  error?: string;
  ok?: boolean;
}

export async function createEventAction(
  _prev: EventFormState,
  formData: FormData,
): Promise<EventFormState> {
  const active = await getActiveChurch();
  if (!active) return { error: '所属教会がありません' };
  if (!['owner', 'admin'].includes(active.role)) {
    return { error: '礼拝を作成する権限がありません' };
  }

  const localDateTime = String(formData.get('startsAtLocal') ?? '');
  if (!localDateTime) return { error: '日時を入力してください' };

  const parsed = createEventSchema.safeParse({
    kind: formData.get('kind'),
    name: formData.get('name'),
    startsAt: zonedDateTimeToUtcISO(localDateTime, active.church.timezone),
    countsTowardAttendanceRate: formData.get('countsToward') === 'on',
    lunchEnabled: formData.get('lunchEnabled') === 'on',
    note: (formData.get('note') as string) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力が正しくありません' };
  }

  const status = formData.get('open') === 'on' ? 'open' : 'scheduled';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('service_events').insert({
    church_id: active.church_id,
    kind: parsed.data.kind,
    name: parsed.data.name,
    starts_at: parsed.data.startsAt,
    status,
    counts_toward_attendance_rate: parsed.data.countsTowardAttendanceRate,
    lunch_enabled: parsed.data.lunchEnabled,
    note: parsed.data.note ?? null,
  });

  if (error) return { error: '礼拝の作成に失敗しました' };

  revalidatePath('/events');
  revalidatePath('/check-in');
  return { ok: true };
}
