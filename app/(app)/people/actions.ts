'use server';

import { revalidatePath } from 'next/cache';
import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { upsertPersonSchema } from '@/app/lib/validation';
import { parsePeopleCsv, normName } from '@/app/lib/people-import';

export interface PersonFormState {
  error?: string;
  ok?: boolean;
}

export interface ImportResult {
  error?: string;
  created?: number;
  skipped?: number; // 既存（同名）でスキップ
  rowErrors?: string[];
}

// CSV（人物一覧エクスポート互換）を名簿へ取り込む。owner/admin のみ。
// 既存と同名の人物はスキップ（重複作成しない）。氏名のみ必須、立場/年齢区分/ふりがな/
// 初回出席は任意（未指定は 客員/大人 を既定）。
export async function importPeopleAction(csvText: string): Promise<ImportResult> {
  const active = await getActiveChurch();
  if (!active) return { error: '所属教会がありません' };
  if (!['owner', 'admin'].includes(active.role)) {
    return { error: '名簿を取り込む権限がありません' };
  }
  if (!csvText || csvText.length > 2_000_000) {
    return { error: 'CSVが空か、サイズが大きすぎます' };
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from('people')
    .select('display_name')
    .eq('church_id', active.church_id)
    .is('archived_at', null);
  const existingNames = new Set(
    (existing ?? []).map((p) => normName(p.display_name as string)),
  );

  const parsed = parsePeopleCsv(csvText, existingNames);
  if (parsed.headerError) return { error: parsed.headerError };

  let created = 0;
  // RLS 下で一括 insert（大量でも 500 件ずつに分割）。
  for (let i = 0; i < parsed.rows.length; i += 500) {
    const chunk = parsed.rows
      .slice(i, i + 500)
      .map((p) => ({ church_id: active.church_id, ...p }));
    const { error } = await supabase.from('people').insert(chunk);
    if (error) {
      return {
        error: '取り込みに失敗しました（権限またはCSV形式をご確認ください）',
        created,
      };
    }
    created += chunk.length;
  }

  revalidatePath('/people');
  revalidatePath('/check-in');
  return { created, skipped: parsed.skippedExisting, rowErrors: parsed.errors };
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
