import type { RealtimeChannel } from '@supabase/supabase-js';
import { createSupabaseBrowserClient } from './supabase/client';
import type { AttendanceRecord } from './types';

// attendance_records の Postgres Changes 購読（同一 service_event）。
// RLS（attendance_select = private.is_member(church_id)）を尊重するため、
// 同一教会メンバーにのみ配信される＝教会間越境は構造的に不可能。
// Postgres Changes の RLS フィルタにはユーザー JWT が必要なので、購読前に
// 明示的に realtime.setAuth(token) する（初期ロードの INITIAL_SESSION でも確実に）。

export type AttendanceChange =
  | { type: 'upsert'; record: AttendanceRecord }
  | { type: 'delete'; id: string; personId?: string };

export type RealtimeStatus = 'subscribed' | 'disconnected';

export function subscribeAttendance(
  serviceEventId: string,
  onChange: (c: AttendanceChange) => void,
  onStatus: (s: RealtimeStatus) => void,
): () => void {
  const supabase = createSupabaseBrowserClient();
  let channel: RealtimeChannel | null = null;
  let cancelled = false;

  (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (cancelled) return;
    if (session?.access_token) {
      supabase.realtime.setAuth(session.access_token);
    }

    channel = supabase
      .channel(`attendance:${serviceEventId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'attendance_records',
          filter: `service_event_id=eq.${serviceEventId}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            // REPLICA IDENTITY FULL なので old に person_id も含まれる。
            const old = payload.old as { id?: string; person_id?: string };
            if (old?.id) onChange({ type: 'delete', id: old.id, personId: old.person_id });
          } else {
            onChange({ type: 'upsert', record: payload.new as AttendanceRecord });
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onStatus('subscribed');
        else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          onStatus('disconnected');
        }
      });
  })();

  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
