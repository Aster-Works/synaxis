import { NextResponse, type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { upsertPersonSchema } from '@/app/lib/validation';

type Params = { params: Promise<{ personId: string }> };

// PATCH: 人物情報を編集する。RLS（people_update = owner/admin）で認可。
export async function PATCH(request: NextRequest, { params }: Params) {
  const { personId } = await params;
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const body = await request.json().catch(() => ({}));
  const parsed = upsertPersonSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? '入力が正しくありません', 422);
  }

  const { data, error } = await supabase
    .from('people')
    .update({
      display_name: parsed.data.displayName,
      furigana: parsed.data.furigana ?? null,
      relationship_status: parsed.data.relationshipStatus,
      age_group: parsed.data.ageGroup,
      first_visit_on: parsed.data.firstVisitOn ?? null,
    })
    .eq('id', personId)
    .select()
    .maybeSingle();

  if (error) return apiError('更新に失敗しました', 403);
  if (!data) return apiError('権限がないか、人物が見つかりません', 404);
  return NextResponse.json({ person: data });
}

// DELETE: 人物を削除する（出席履歴も連動して消える）。RLS（people_delete = owner/admin）。
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { personId } = await params;
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const { error, count } = await supabase
    .from('people')
    .delete({ count: 'exact' })
    .eq('id', personId);

  if (error) return apiError('削除に失敗しました', 403);
  if (!count) return apiError('権限がないか、人物が見つかりません', 404);
  return NextResponse.json({ ok: true });
}
