import { NextResponse, type NextRequest } from 'next/server';
import { apiError, getApiContext } from '@/app/lib/api';
import { getEventById } from '@/app/lib/reception';
import { createGuestSchema } from '@/app/lib/validation';
import type { Person } from '@/app/lib/types';

type Params = { params: Promise<{ eventId: string }> };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST: ゲストを作成し、同時にこの礼拝へ出席登録する（30秒以内の即時追加）。
// 冪等: x-client-op-id を消費し、再送（弱電波で応答未達→再POST）でも
// 人物を二重作成せず既存 person を返す（people の (church_id, client_op_id) 一意）。
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

  const headerOpId = request.headers.get('x-client-op-id');
  const clientOpId = headerOpId && UUID_RE.test(headerOpId) ? headerOpId : null;

  const baseRow = {
    church_id: event.church_id,
    display_name: parsed.data.displayName,
    furigana: parsed.data.furigana ?? null,
    relationship_status: parsed.data.relationshipStatus,
    age_group: parsed.data.ageGroup,
  };

  // 1) 人物を作成（冪等）。
  let person: Person | null = null;
  if (clientOpId) {
    // ON CONFLICT DO NOTHING（DO UPDATE は people_update=owner/admin で
    // receptionist が弾かれるため使わない）。競合時は既存を SELECT で取得。
    const { data: inserted, error: insErr } = await supabase
      .from('people')
      .upsert(
        { ...baseRow, client_op_id: clientOpId },
        { onConflict: 'church_id,client_op_id', ignoreDuplicates: true },
      )
      .select()
      .maybeSingle();
    if (insErr) return apiError('ゲストの追加に失敗しました', 403);
    if (inserted) {
      person = inserted as Person;
    } else {
      // 再送による競合 → 既存 person を返す（二重作成しない）
      const { data: existing } = await supabase
        .from('people')
        .select('*')
        .eq('church_id', event.church_id)
        .eq('client_op_id', clientOpId)
        .maybeSingle();
      person = (existing as Person) ?? null;
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from('people')
      .insert(baseRow)
      .select()
      .single();
    if (insErr || !inserted) return apiError('ゲストの追加に失敗しました', 403);
    person = inserted as Person;
  }

  if (!person) return apiError('ゲストの追加に失敗しました', 403);

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
    return NextResponse.json(
      { person, attendance: null, warning: '出席登録に失敗しました。一覧から再登録してください。' },
      { status: 207 },
    );
  }

  return NextResponse.json({ person, attendance }, { status: 201 });
}
