'use client';

import { useMemo, useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Plus,
  Minus,
  UserPlus,
  Search,
  RotateCcw,
  RefreshCw,
  CloudOff,
  X,
} from 'lucide-react';
import {
  type AttendanceRecord,
  type Person,
  type ReceptionRow,
  type ServiceEvent,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_BADGE,
  SERVICE_KIND_LABELS,
} from '@/app/lib/types';
import { summarizeReception } from '@/app/lib/aggregate';
import { formatDateInZone, formatTimeInZone } from '@/app/lib/datetime';
import { GuestModal } from './GuestModal';

type Filter = 'all' | 'present' | 'absent' | 'guest';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全員' },
  { key: 'present', label: '出席済み' },
  { key: 'absent', label: '未出席' },
  { key: 'guest', label: 'ゲスト' },
];

// ネットワーク失敗時に一度だけ再試行する fetch。
async function postJSON(url: string, method: string, body?: unknown) {
  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
  try {
    return await fetch(url, opts);
  } catch {
    return await fetch(url, opts);
  }
}

export function CheckInClient({
  event,
  events,
  initialRows,
  canEdit,
  timezone,
  childLabel,
}: {
  event: ServiceEvent;
  events: ServiceEvent[];
  initialRows: ReceptionRow[];
  canEdit: boolean;
  timezone: string;
  childLabel: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ReceptionRow[]>(initialRows);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [syncing, setSyncing] = useState<Set<string>>(new Set());
  const [errored, setErrored] = useState<Set<string>>(new Set());
  const [lastAction, setLastAction] = useState<{
    personId: string;
    prev: AttendanceRecord | null;
  } | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);
  const [, startTransition] = useTransition();

  const summary = useMemo(() => summarizeReception(rows), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(({ person, attendance }) => {
      if (filter === 'present' && !attendance) return false;
      if (filter === 'absent' && attendance) return false;
      if (filter === 'guest' && person.relationship_status !== 'guest') return false;
      if (!q) return true;
      return (
        person.display_name.toLowerCase().includes(q) ||
        (person.furigana ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter]);

  const mark = useCallback(
    (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string, on: boolean) => {
      set((prev) => {
        const next = new Set(prev);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
    },
    [],
  );

  const setAttendance = useCallback(
    (personId: string, attendance: AttendanceRecord | null) => {
      setRows((prev) =>
        prev.map((r) => (r.person.id === personId ? { ...r, attendance } : r)),
      );
    },
    [],
  );

  // 出席させ、昼食数を確定する（冪等 PUT）。楽観的更新＋失敗時ロールバック。
  const putAttendance = useCallback(
    async (person: Person, lunchQuantity: number, recordUndo = true) => {
      const current = rows.find((r) => r.person.id === person.id)?.attendance ?? null;
      if (recordUndo) setLastAction({ personId: person.id, prev: current });

      const optimistic: AttendanceRecord = {
        id: current?.id ?? `optimistic-${person.id}`,
        church_id: person.church_id,
        service_event_id: event.id,
        person_id: person.id,
        lunch_quantity: lunchQuantity,
        checked_in_at: current?.checked_in_at ?? new Date().toISOString(),
        checked_in_by: current?.checked_in_by ?? null,
        source: 'reception',
        created_at: current?.created_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setAttendance(person.id, optimistic);
      mark(setSyncing, person.id, true);
      mark(setErrored, person.id, false);

      const res = await postJSON(
        `/api/events/${event.id}/attendance/${person.id}`,
        'PUT',
        { lunchQuantity },
      );
      mark(setSyncing, person.id, false);

      if (res.ok) {
        const { attendance } = await res.json();
        setAttendance(person.id, attendance as AttendanceRecord);
      } else {
        setAttendance(person.id, current); // ロールバック
        mark(setErrored, person.id, true);
      }
    },
    [rows, event.id, setAttendance, mark],
  );

  const removeAttendance = useCallback(
    async (person: Person, recordUndo = true) => {
      const current = rows.find((r) => r.person.id === person.id)?.attendance ?? null;
      if (recordUndo) setLastAction({ personId: person.id, prev: current });

      setAttendance(person.id, null);
      mark(setSyncing, person.id, true);
      mark(setErrored, person.id, false);

      const res = await postJSON(
        `/api/events/${event.id}/attendance/${person.id}`,
        'DELETE',
      );
      mark(setSyncing, person.id, false);

      if (!res.ok) {
        setAttendance(person.id, current);
        mark(setErrored, person.id, true);
      }
    },
    [rows, event.id, setAttendance, mark],
  );

  const toggle = useCallback(
    (row: ReceptionRow) => {
      if (!canEdit) return;
      if (row.attendance) removeAttendance(row.person);
      else putAttendance(row.person, 0);
    },
    [canEdit, putAttendance, removeAttendance],
  );

  const changeLunch = useCallback(
    (row: ReceptionRow, delta: number) => {
      if (!canEdit || !row.attendance) return;
      const next = Math.max(0, Math.min(20, row.attendance.lunch_quantity + delta));
      putAttendance(row.person, next, false);
    },
    [canEdit, putAttendance],
  );

  const undo = useCallback(() => {
    if (!lastAction) return;
    const person = rows.find((r) => r.person.id === lastAction.personId)?.person;
    if (!person) return;
    if (lastAction.prev) {
      putAttendance(person, lastAction.prev.lunch_quantity, false);
    } else {
      removeAttendance(person, false);
    }
    setLastAction(null);
  }, [lastAction, rows, putAttendance, removeAttendance]);

  const refresh = useCallback(async () => {
    const res = await postJSON(`/api/events/${event.id}/reception`, 'GET');
    if (res.ok) {
      const { rows: fresh } = await res.json();
      setRows(fresh as ReceptionRow[]);
      setErrored(new Set());
    }
  }, [event.id]);

  const retryErrored = useCallback(() => {
    for (const id of errored) {
      const row = rows.find((r) => r.person.id === id);
      if (!row) continue;
      if (row.attendance) putAttendance(row.person, row.attendance.lunch_quantity, false);
      else removeAttendance(row.person, false);
    }
  }, [errored, rows, putAttendance, removeAttendance]);

  const onGuestAdded = useCallback(
    (person: Person, attendance: AttendanceRecord | null) => {
      setRows((prev) => {
        const next = [...prev, { person, attendance }];
        next.sort((a, b) =>
          (a.person.furigana ?? a.person.display_name).localeCompare(
            b.person.furigana ?? b.person.display_name,
            'ja',
          ),
        );
        return next;
      });
      setGuestOpen(false);
    },
    [],
  );

  return (
    <div className="space-y-3">
      {/* 固定ヘッダー: 礼拝情報＋リアルタイム合計＋同期状態 */}
      <div className="sticky top-[88px] z-20 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">
              {event.name}
            </p>
            <p className="text-xs text-slate-500">
              {formatDateInZone(event.starts_at, timezone)}{' '}
              {formatTimeInZone(event.starts_at, timezone)} ·{' '}
              {SERVICE_KIND_LABELS[event.kind]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {syncing.size > 0 && (
              <span className="flex items-center gap-1 text-xs text-amber-600">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                同期中 {syncing.size}
              </span>
            )}
            {errored.size > 0 && (
              <button
                onClick={retryErrored}
                className="flex items-center gap-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700"
              >
                <CloudOff className="h-3.5 w-3.5" />
                未同期 {errored.size}・再試行
              </button>
            )}
            <button
              onClick={() => startTransition(refresh)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              aria-label="最新の状態に更新"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          <Stat label="出席" value={summary.present} highlight />
          <Stat label="大人" value={summary.adults} />
          <Stat label={childLabel} value={summary.children} />
          <Stat label="昼食" value={summary.lunchTotal} />
        </div>
      </div>

      {/* 礼拝切り替え（本日複数あるとき） */}
      {events.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {events.map((e) => (
            <button
              key={e.id}
              onClick={() => router.push(`/check-in?event=${e.id}`)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                e.id === event.id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200'
              }`}
            >
              {e.name}（{formatTimeInZone(e.starts_at, timezone)}）
            </button>
          ))}
        </div>
      )}

      {/* 検索 */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前・フリガナで検索"
          className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
        />
      </div>

      {/* フィルター */}
      <div className="flex gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium ${
              filter === f.key
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-600 ring-1 ring-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 人物一覧 */}
      <ul className="space-y-2">
        {filtered.map((row) => (
          <PersonRow
            key={row.person.id}
            row={row}
            canEdit={canEdit}
            lunchEnabled={event.lunch_enabled}
            syncing={syncing.has(row.person.id)}
            errored={errored.has(row.person.id)}
            onToggle={() => toggle(row)}
            onLunch={(delta) => changeLunch(row, delta)}
          />
        ))}
        {filtered.length === 0 && (
          <li className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">
            該当する人がいません
          </li>
        )}
      </ul>

      {/* 取消バー */}
      {lastAction && (
        <div className="fixed inset-x-0 bottom-4 z-30 mx-auto flex w-[92%] max-w-md items-center justify-between rounded-xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">
          <span>直前の操作を取り消せます</span>
          <button
            onClick={undo}
            className="flex items-center gap-1 rounded-lg bg-white/15 px-3 py-1.5 font-medium"
          >
            <RotateCcw className="h-4 w-4" />
            取消
          </button>
        </div>
      )}

      {/* ゲスト追加 FAB */}
      {canEdit && (
        <button
          onClick={() => setGuestOpen(true)}
          className="fixed bottom-20 right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-indigo-600 px-5 text-sm font-semibold text-white shadow-lg active:scale-95 sm:bottom-6"
        >
          <UserPlus className="h-5 w-5" />
          ゲスト追加
        </button>
      )}

      {guestOpen && (
        <GuestModal
          eventId={event.id}
          lunchEnabled={event.lunch_enabled}
          childLabel={childLabel}
          onClose={() => setGuestOpen(false)}
          onAdded={onGuestAdded}
        />
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-1 py-1.5 ${
        highlight ? 'bg-indigo-50' : 'bg-slate-50'
      }`}
    >
      <p
        className={`text-xl font-bold tabular-nums ${
          highlight ? 'text-indigo-700' : 'text-slate-800'
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}

function PersonRow({
  row,
  canEdit,
  lunchEnabled,
  syncing,
  errored,
  onToggle,
  onLunch,
}: {
  row: ReceptionRow;
  canEdit: boolean;
  lunchEnabled: boolean;
  syncing: boolean;
  errored: boolean;
  onToggle: () => void;
  onLunch: (delta: number) => void;
}) {
  const { person, attendance } = row;
  const present = !!attendance;

  return (
    <li
      className={`flex items-center gap-2 rounded-xl border bg-white p-2.5 ${
        errored ? 'border-rose-300' : 'border-slate-200'
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-slate-900">
          {person.display_name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {person.furigana && (
            <span className="truncate text-[11px] text-slate-400">
              {person.furigana}
            </span>
          )}
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${RELATIONSHIP_BADGE[person.relationship_status]}`}
          >
            {RELATIONSHIP_LABELS[person.relationship_status]}
          </span>
          {errored && (
            <span className="text-[10px] font-medium text-rose-600">未同期</span>
          )}
        </div>
      </div>

      {/* 昼食ステッパー（出席かつ昼食ありの礼拝のみ） */}
      {present && lunchEnabled && canEdit && (
        <div className="flex items-center gap-1 rounded-lg bg-slate-50 p-0.5">
          <button
            onClick={() => onLunch(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 active:bg-slate-200 disabled:opacity-30"
            disabled={attendance!.lunch_quantity <= 0}
            aria-label="昼食を減らす"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-sm font-semibold tabular-nums">
            昼{attendance!.lunch_quantity}
          </span>
          <button
            onClick={() => onLunch(1)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 active:bg-slate-200"
            aria-label="昼食を増やす"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* 出席トグル（44px 以上・色だけに頼らずアイコン＋文言） */}
      <button
        onClick={onToggle}
        disabled={!canEdit}
        aria-pressed={present}
        className={`flex h-12 min-w-[88px] items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition active:scale-95 disabled:opacity-50 ${
          present
            ? 'bg-emerald-500 text-white'
            : 'bg-white text-slate-500 ring-2 ring-slate-200'
        }`}
      >
        {present ? (
          <>
            <Check className="h-5 w-5" />
            出席
          </>
        ) : (
          <>
            <X className="h-4 w-4 opacity-40" />
            未
          </>
        )}
        {syncing && <RefreshCw className="h-3.5 w-3.5 animate-spin opacity-70" />}
      </button>
    </li>
  );
}
