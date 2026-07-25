import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AttendanceRecord,
  Person,
  ReceptionRow,
  ServiceEvent,
} from './types';
import { zonedDayBoundsUtc } from './datetime';

// その教会の「今日」の礼拝イベント一覧（開始時刻順）。
export async function getTodayEvents(
  supabase: SupabaseClient,
  churchId: string,
  timezone: string,
): Promise<ServiceEvent[]> {
  const { startUtc, endUtc } = zonedDayBoundsUtc(timezone);
  const { data, error } = await supabase
    .from('service_events')
    .select('*')
    .eq('church_id', churchId)
    .neq('status', 'cancelled')
    .gte('starts_at', startUtc.toISOString())
    .lt('starts_at', endUtc.toISOString())
    .order('starts_at', { ascending: true });

  if (error || !data) return [];
  return data as ServiceEvent[];
}

// 受付で選べる礼拝。受付中(open)はいつでも、加えて前後の窓（既定±14日）の礼拝も含める。
// 「今日」だけに縛らないことで、事前に作成した礼拝も受付から到達できる。
// 開催済み(completed)・キャンセル(cancelled)は受付から外す＝予定(scheduled)と受付中(open)のみ。
// 開催済みにした礼拝は「礼拝」タブからのみ参照する。
export async function getReceptionEvents(
  supabase: SupabaseClient,
  churchId: string,
  windowDays = 14,
): Promise<ServiceEvent[]> {
  const now = Date.now();
  const since = new Date(now - windowDays * 86400000).toISOString();
  const until = new Date(now + windowDays * 86400000).toISOString();
  const { data, error } = await supabase
    .from('service_events')
    .select('*')
    .eq('church_id', churchId)
    .in('status', ['scheduled', 'open'])
    .or(`status.eq.open,and(starts_at.gte.${since},starts_at.lte.${until})`)
    .order('starts_at', { ascending: true });

  if (error || !data) return [];
  return data as ServiceEvent[];
}

// 現在時刻に最も近い礼拝。'open' を優先し、なければ最も近いもの。
export function pickCurrentEvent(
  events: ServiceEvent[],
  now: Date = new Date(),
): ServiceEvent | null {
  if (events.length === 0) return null;
  const open = events.find((e) => e.status === 'open');
  if (open) return open;

  let best = events[0];
  let bestDiff = Math.abs(new Date(best.starts_at).getTime() - now.getTime());
  for (const e of events) {
    const diff = Math.abs(new Date(e.starts_at).getTime() - now.getTime());
    if (diff < bestDiff) {
      best = e;
      bestDiff = diff;
    }
  }
  return best;
}

export async function getEventById(
  supabase: SupabaseClient,
  eventId: string,
): Promise<ServiceEvent | null> {
  const { data, error } = await supabase
    .from('service_events')
    .select('*')
    .eq('id', eventId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ServiceEvent;
}

// 受付行：教会の（アーカイブ外）人物すべてと、対象イベントの出席を結合する。
export async function getReceptionRows(
  supabase: SupabaseClient,
  churchId: string,
  eventId: string,
): Promise<ReceptionRow[]> {
  const [peopleRes, attRes] = await Promise.all([
    supabase
      .from('people')
      .select('*')
      .eq('church_id', churchId)
      .is('archived_at', null)
      .order('furigana', { ascending: true, nullsFirst: false }),
    supabase
      .from('attendance_records')
      .select('*')
      .eq('service_event_id', eventId),
  ]);

  // 取得失敗を空配列にすり替えない。すり替えると受付一覧が「人物ゼロ」や
  // 「全員未出席」に見え、複数端末の refetch がその誤りで画面を上書きしてしまう。
  if (peopleRes.error) {
    throw new Error(`人物データの取得に失敗しました: ${peopleRes.error.message}`);
  }
  if (attRes.error) {
    throw new Error(`出席データの取得に失敗しました: ${attRes.error.message}`);
  }
  const people = (peopleRes.data ?? []) as Person[];
  const attendance = (attRes.data ?? []) as AttendanceRecord[];
  const byPerson = new Map<string, AttendanceRecord>();
  for (const a of attendance) byPerson.set(a.person_id, a);

  return people.map((person) => ({
    person,
    attendance: byPerson.get(person.id) ?? null,
  }));
}
