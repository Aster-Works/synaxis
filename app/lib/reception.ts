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

// 現在時刻に最も近い「本日の礼拝」。'open' を優先し、なければ最も近いもの。
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

  const people = (peopleRes.data ?? []) as Person[];
  const attendance = (attRes.data ?? []) as AttendanceRecord[];
  const byPerson = new Map<string, AttendanceRecord>();
  for (const a of attendance) byPerson.set(a.person_id, a);

  return people.map((person) => ({
    person,
    attendance: byPerson.get(person.id) ?? null,
  }));
}
