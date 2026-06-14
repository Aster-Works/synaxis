import { NextResponse, type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { getEventById } from '@/app/lib/reception';
import { createGuestSchema } from '@/app/lib/validation';

type Params = { params: Promise<{ eventId: string }> };

// POST: ゲストを作成し、同時にこの礼拝へ出席登録する（30秒以内の即時追加）。
export async function POST(request: NextRequest, { params }: Params) {
  const { eventId } = await params;
  const { supabase, user } = await getApiContext();
  if (!user) return apiError('認証が必要です', 401);

  const body = await request.json().catch(() => ({}));
  const parsed = createGuestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(parsed.error.issues[0]?.message ?? '入力が正しくありません', 422);
  }

  const event = await getEventById(supabase, eventId);
  if (!event) return apiError('礼拝が見つかりません', 404);

  // 1) 人物を作成（church_id はイベントの教会に固定）
  const { data: person, error: personError } = await supabase
    .from('people')
    .insert({
      church_id: event.church_id,
      display_name: parsed.data.displayName,
      furigana: parsed.data.furigana ?? null,
      relationship_status: parsed.data.relationshipStatus,
      age_group: parsed.data.ageGroup,
    })
    .select()
    .single();

  if (personError || !person) {
    return apiError('ゲストの追加に失敗しました', 403);
  }

  // 2) 出席登録（冪等 upsert）
  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance_records')
    .upsert(
      {
        service_event_id: eventId,
        person_id: person.id,
        church_id: event.church_id,
        lunch_quantity: parsed.data.lunchQuantity,
        checked_in_by: user.id,
        source: 'reception',
      },
      { onConflict: 'service_event_id,person_id' },
    )
    .select()
    .single();

  if (attendanceError) {
    // 人物は作成済み（一覧に出る）。出席のみ失敗を伝える。
    return NextResponse.json(
      { person, attendance: null, warning: '出席登録に失敗しました。一覧から再登録してください。' },
      { status: 207 },
    );
  }

  return NextResponse.json({ person, attendance }, { status: 201 });
}
