'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { AttendanceRecord, Person, ReceptionRow } from '@/app/lib/types';
import {
  applyDesired,
  clearDesiredIfUnchanged,
  emptySnapshot,
  isEmptySnapshot,
  isTempId,
  mergeRows,
  newClientOpId,
  newTempPersonId,
  pendingCount as countPending,
  pendingIds as pendingIdSet,
  resolveGuest,
  type PendingDelete,
  type PendingGuest,
  type PendingPut,
  type QueueSnapshot,
} from '@/app/lib/offline/queueModel';
import { createQueueStore } from '@/app/lib/offline/queueStore';
import { subscribeAttendance } from '@/app/lib/realtime';

const POLL_MS = 10_000;
const RETRY_MS = 2_500;

// online 状態は useSyncExternalStore で購読する。SSR/ハイドレーション初回は
// true（サーバと一致）→ 以降は navigator.onLine。setState-in-effect を避ける。
function subscribeOnline(cb: () => void): () => void {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}
const getOnlineSnapshot = () => navigator.onLine;
const getOnlineServerSnapshot = () => true;

function setRowAttendance(
  rows: ReceptionRow[],
  personId: string,
  a: AttendanceRecord | null,
): ReceptionRow[] {
  return rows.map((r) => (r.person.id === personId ? { ...r, attendance: a } : r));
}

function upsertServerRow(
  rows: ReceptionRow[],
  person: Person,
  a: AttendanceRecord | null,
): ReceptionRow[] {
  return rows.some((r) => r.person.id === person.id)
    ? rows.map((r) => (r.person.id === person.id ? { person, attendance: a } : r))
    : [...rows, { person, attendance: a }];
}

export interface ReceptionSync {
  rows: ReceptionRow[];
  pendingCount: number;
  pendingIds: Set<string>;
  online: boolean;
  realtimeConnected: boolean;
  flushing: boolean;
  enqueuePut: (person: Person, lunchQuantity: number) => void;
  enqueueDelete: (person: Person) => void;
  enqueueGuest: (input: PendingGuest['input']) => Person;
  refetch: () => Promise<void>;
  flushNow: () => void;
}

// 受付の状態同期フック。サーバ確定値(serverRows) + 保留キュー(snap) を分離して保持し、
// 表示は mergeRows で合成（pending の person はサーバ値の上書きから保護）。
// Realtime / 再送成功 / 再取得 がいずれも serverRows を更新し、最終的に収束する。
export function useReceptionSync(
  eventId: string,
  churchId: string,
  initialRows: ReceptionRow[],
): ReceptionSync {
  const [serverRows, setServerRows] = useState<ReceptionRow[]>(initialRows);
  const [snap, setSnapState] = useState<QueueSnapshot>(() => emptySnapshot(eventId));
  const online = useSyncExternalStore(
    subscribeOnline,
    getOnlineSnapshot,
    getOnlineServerSnapshot,
  );
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [flushing, setFlushing] = useState(false);

  // useRef(createQueueStore()) は引数が毎レンダー評価され localStorage プローブが
  // 走るため、useState の遅延初期化（初回のみ実行）で1度だけ生成する。
  const [store] = useState(() => createQueueStore());
  const snapRef = useRef(snap);
  const serverRowsRef = useRef(serverRows);
  const inFlight = useRef<Set<string>>(new Set());
  const flushingRef = useRef(false);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    serverRowsRef.current = serverRows;
  }, [serverRows]);

  // snap 更新（ref 同期 + 永続化）
  const setSnap = useCallback(
    (updater: (s: QueueSnapshot) => QueueSnapshot) => {
      setSnapState((prev) => {
        const next = updater(prev);
        snapRef.current = next;
        store.save(next);
        return next;
      });
    },
    [store],
  );

  const rows = useMemo(() => mergeRows(serverRows, snap), [serverRows, snap]);
  const pendingCount = countPending(snap);
  const pendingIds = useMemo(() => pendingIdSet(snap), [snap]);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/reception`);
      if (res.ok) {
        const { rows: fresh } = await res.json();
        setServerRows(fresh as ReceptionRow[]);
      } else if (res.status === 401) {
        // セッション失効。古い表示のまま黙って動き続けず、ログインへ戻す
        // （再ログイン後、未送信キューは localStorage から復元されて再送される）。
        window.location.assign(
          `/login?redirect=${encodeURIComponent(
            window.location.pathname + window.location.search,
          )}`,
        );
      }
    } catch {
      /* オフライン等。ポーリング/再購読で再試行される */
    }
  }, [eventId]);

  const flushRef = useRef<() => Promise<void>>(async () => {});

  const scheduleFlush = useCallback((delay: number) => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      void flushRef.current();
    }, delay);
  }, []);

  // ── フラッシュ（ゲスト→出席の順。person 単位で直列、恒久エラーは破棄）──
  const flush = useCallback(async () => {
    if (flushingRef.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    flushingRef.current = true;
    setFlushing(true);
    try {
      // 1) ゲストを先に確定（実ID獲得 → 以後の put が実IDへ張り替わる）
      for (const g of Object.values(snapRef.current.guests)) {
        if (inFlight.current.has(g.tempPersonId)) continue;
        inFlight.current.add(g.tempPersonId);
        try {
          const res = await fetch(`/api/events/${eventId}/guests`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-client-op-id': g.clientOpId },
            body: JSON.stringify(g.input),
          });
          if (res.ok || res.status === 207) {
            const { person, attendance } = await res.json();
            setServerRows((rs) => upsertServerRow(rs, person as Person, attendance ?? null));
            setSnap((s) => resolveGuest(s, g.tempPersonId, person as Person));
          } else if (res.status === 422) {
            // 入力不正は再送しても直らない → ゲストを破棄
            setSnap((s) => {
              const guests = { ...s.guests };
              delete guests[g.tempPersonId];
              const optimisticPeople = { ...s.optimisticPeople };
              delete optimisticPeople[g.tempPersonId];
              const desired = { ...s.desired };
              delete desired[g.tempPersonId];
              return { ...s, guests, optimisticPeople, desired };
            });
          }
        } catch {
          /* 通信失敗 → 次回フラッシュで再送 */
        } finally {
          inFlight.current.delete(g.tempPersonId);
        }
      }

      // 2) 出席の希望状態（temp は未確定なのでスキップ、ゲスト確定後に送る）
      for (const op of Object.values(snapRef.current.desired)) {
        if (isTempId(op.personId)) continue;
        if (inFlight.current.has(op.personId)) continue;
        inFlight.current.add(op.personId);
        try {
          const res =
            op.kind === 'delete'
              ? await fetch(`/api/events/${eventId}/attendance/${op.personId}`, {
                  method: 'DELETE',
                  headers: { 'x-client-op-id': op.clientOpId },
                })
              : await fetch(`/api/events/${eventId}/attendance/${op.personId}`, {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    'x-client-op-id': op.clientOpId,
                  },
                  body: JSON.stringify({ lunchQuantity: op.lunchQuantity }),
                });
          if (res.ok) {
            if (op.kind === 'put') {
              const { attendance } = await res.json();
              setServerRows((rs) => setRowAttendance(rs, op.personId, attendance));
            } else {
              setServerRows((rs) => setRowAttendance(rs, op.personId, null));
            }
            setSnap((s) => clearDesiredIfUnchanged(s, op.personId, op.clientOpId));
          } else if (res.status === 422 || res.status === 404 || res.status === 403) {
            // 恒久エラー: 再送しても直らない → 破棄してサーバ確定値へ戻す
            setSnap((s) => clearDesiredIfUnchanged(s, op.personId, op.clientOpId));
          }
          // それ以外(5xx/429)は破棄せず次回再送
        } catch {
          /* 通信失敗 → 再送 */
        } finally {
          inFlight.current.delete(op.personId);
        }
      }
    } finally {
      flushingRef.current = false;
      setFlushing(false);
      if (
        countPending(snapRef.current) > 0 &&
        (typeof navigator === 'undefined' || navigator.onLine)
      ) {
        scheduleFlush(RETRY_MS);
      }
    }
  }, [eventId, setSnap, scheduleFlush]);

  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  const flushNow = useCallback(() => scheduleFlush(0), [scheduleFlush]);

  // ── enqueue ──
  const enqueuePut = useCallback(
    (person: Person, lunchQuantity: number) => {
      const op: PendingPut = {
        kind: 'put',
        personId: person.id,
        lunchQuantity,
        clientOpId: newClientOpId(),
        updatedAt: Date.now(),
      };
      setSnap((s) => applyDesired(s, op));
      scheduleFlush(0);
    },
    [setSnap, scheduleFlush],
  );

  const enqueueDelete = useCallback(
    (person: Person) => {
      const op: PendingDelete = {
        kind: 'delete',
        personId: person.id,
        clientOpId: newClientOpId(),
        updatedAt: Date.now(),
      };
      setSnap((s) => applyDesired(s, op));
      scheduleFlush(0);
    },
    [setSnap, scheduleFlush],
  );

  const enqueueGuest = useCallback(
    (input: PendingGuest['input']): Person => {
      const tempId = newTempPersonId();
      const nowIso = new Date().toISOString();
      const tempPerson: Person = {
        id: tempId,
        church_id: churchId,
        display_name: input.displayName,
        furigana: input.furigana ?? null,
        relationship_status: input.relationshipStatus,
        age_group: input.ageGroup,
        first_visit_on: null,
        archived_at: null,
        created_at: nowIso,
        updated_at: nowIso,
      };
      const clientOpId = newClientOpId();
      const guest: PendingGuest = {
        kind: 'guest',
        tempPersonId: tempId,
        clientOpId,
        input,
        updatedAt: Date.now(),
      };
      setSnap((s) => ({
        ...s,
        guests: { ...s.guests, [tempId]: guest },
        optimisticPeople: { ...s.optimisticPeople, [tempId]: tempPerson },
        desired: {
          ...s.desired,
          [tempId]: {
            kind: 'put',
            personId: tempId,
            lunchQuantity: input.lunchQuantity,
            clientOpId,
            updatedAt: Date.now(),
          },
        },
      }));
      scheduleFlush(0);
      return tempPerson;
    },
    [churchId, setSnap, scheduleFlush],
  );

  // ── 起動時: 永続キューを復元（現スナップが空のときだけ）→ 送信試行 ──
  useEffect(() => {
    const persisted = store.load(eventId);
    if (persisted && !isEmptySnapshot(persisted) && isEmptySnapshot(snapRef.current)) {
      setSnap(() => persisted);
      scheduleFlush(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // オンライン復帰時に保留分を再送
  useEffect(() => {
    if (online) scheduleFlush(0);
  }, [online, scheduleFlush]);

  // ── アンマウント時に保留タイマーを解放（礼拝切替/離脱後の再送・更新を防ぐ）──
  useEffect(() => {
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
    };
  }, []);

  // ── Realtime 購読 + ポーリング fallback + 可視性復帰で収束 ──
  useEffect(() => {
    const startPoll = () => {
      if (pollTimer.current) return;
      pollTimer.current = setInterval(() => void refetch(), POLL_MS);
    };
    const stopPoll = () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };

    const unsub = subscribeAttendance(
      eventId,
      (c) => {
        if (c.type === 'delete') {
          // person_id が来れば直接、なければ attendance.id で逆引き。
          // どちらでも特定できなければ取りこぼし防止に再取得して収束。
          if (c.personId) {
            setServerRows((rs) => setRowAttendance(rs, c.personId!, null));
          } else {
            const target = serverRowsRef.current.find((r) => r.attendance?.id === c.id);
            if (target) setServerRows((rs) => setRowAttendance(rs, target.person.id, null));
            else void refetch();
          }
        } else {
          const pid = c.record.person_id;
          const known = serverRowsRef.current.some((r) => r.person.id === pid);
          if (known) setServerRows((rs) => setRowAttendance(rs, pid, c.record));
          else void refetch(); // 他端末のゲスト等、未知の人物 → 軽量再取得
        }
      },
      (status) => {
        if (status === 'subscribed') {
          setRealtimeConnected(true);
          stopPoll();
          void refetch(); // 再接続時に一度収束
        } else {
          setRealtimeConnected(false);
          startPoll();
        }
      },
    );

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      unsub();
      stopPoll();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [eventId, refetch]);

  return {
    rows,
    pendingCount,
    pendingIds,
    online,
    realtimeConnected,
    flushing,
    enqueuePut,
    enqueueDelete,
    enqueueGuest,
    refetch,
    flushNow,
  };
}
