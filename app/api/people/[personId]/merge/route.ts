import { NextResponse, type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { mergePersonSchema } from '@/app/lib/validation';

type Params = { params: Promise<{ personId: string }> };

// POST: source(personId) を target へ統合する。出席履歴は target に引き継ぐ。
// authz・同一church検証・衝突解消・付け替え・論理削除は merge_person RPC が原子的に行う。
// 同じ統合要求を再送しても安全（RPC 内で source が archived 済みなら no-op）＝冪等。
export async function POST(request: NextRequest, { params }: Params) {
  const { personId: sourceId } = await params;
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const body = await request.json().catch(() => ({}));
  const parsed = mergePersonSchema.safeParse(body);
  if (!parsed.success) return apiError('入力が正しくありません', 422);
  if (parsed.data.targetId === sourceId) {
    return apiError('統合元と統合先が同じです', 422);
  }

  const { data, error } = await supabase.rpc('merge_person', {
    p_source: sourceId,
    p_target: parsed.data.targetId,
  });

  if (error) {
    // RPC の raise exception はメッセージで分岐（PostgREST は P0001）
    const msg = error.message ?? '';
    if (msg.includes('権限')) return apiError('統合する権限がありません', 403);
    if (msg.includes('見つかりません')) return apiError('対象の人物が見つかりません', 404);
    if (msg.includes('異なる教会')) return apiError('異なる教会の人物は統合できません', 403);
    if (msg.includes('アーカイブ')) return apiError('アーカイブ済みの人物は統合先にできません', 409);
    if (msg.includes('同一')) return apiError('統合元と統合先が同じです', 422);
    return apiError('統合に失敗しました', 400);
  }

  return NextResponse.json({ targetId: data });
}
