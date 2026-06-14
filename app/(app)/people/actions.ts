'use server';

import { revalidatePath } from 'next/cache';
import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { upsertPersonSchema } from '@/app/lib/validation';

export interface PersonFormState {
  error?: string;
  ok?: boolean;
}

// 人物を事前登録する（会員等を受付前に登録）。owner/admin/receptionist。
export async function createPersonAction(
  _prev: PersonFormState,
  formData: FormData,
): Promise<PersonFormState> {
  const active = await getActiveChurch();
  if (!active) return { error: '所属教会がありません' };
  if (!['owner', 'admin', 'receptionist'].includes(active.role)) {
    return { error: '人物を追加する権限がありません' };
  }

  const parsed = upsertPersonSchema.safeParse({
    displayName: formData.get('displayName'),
    furigana: (formData.get('furigana') as string) || undefined,
    relationshipStatus: formData.get('relationshipStatus'),
    ageGroup: formData.get('ageGroup'),
    firstVisitOn: (formData.get('firstVisitOn') as string) || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力が正しくありません' };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('people').insert({
    church_id: active.church_id,
    display_name: parsed.data.displayName,
    furigana: parsed.data.furigana ?? null,
    relationship_status: parsed.data.relationshipStatus,
    age_group: parsed.data.ageGroup,
    first_visit_on: parsed.data.firstVisitOn ?? null,
  });
  if (error) return { error: '人物の追加に失敗しました' };

  revalidatePath('/people');
  revalidatePath('/check-in');
  return { ok: true };
}
