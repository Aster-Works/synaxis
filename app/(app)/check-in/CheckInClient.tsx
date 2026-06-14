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
  Wifi,
  X,
  CheckCircle2,
} from 'lucide-react';
import {
  type AttendanceRecord,
  type ReceptionRow,
  type ServiceEvent,
  RELATIONSHIP_LABELS,
  RELATIONSHIP_BADGE,
  SERVICE_KIND_LABELS,
} from '@/app/lib/types';
import { summarizeReception } from '@/app/lib/aggregate';
import { formatDateInZone, formatTimeInZone } from '@/app/lib/datetime';
import { useReceptionSync } from './useReceptionSync';
import { GuestModal } from './GuestModal';
import { completeEventAction } from '../events/actions';

type Filter = 'all' | 'present' | 'absent' | 'guest';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全員' },
  { key: 'present', label: '出席済み' },
  { key: 'absent', label: '未出席' },
  { key: 'guest', label: 'ゲスト' },
];

export function CheckInClient({
  event,
  events,
  initialRows,
  canEdit,
  canComplete,
  churchId,
  timezone,
  childLabel,
}: {
  event: ServiceEvent;
  events: ServiceEvent[];
  initialRows: ReceptionRow[];
  canEdit: boolean;
  canComplete: boolean;
  churchId: string;
  timezone: string;
  childLabel: string;
}) {
  const router = useRouter();
  const sync = useReceptionSync(event.id, churchId, initialRows);
  const { rows, pendingIds } = sync;

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [lastAction, setLastAction] = useState<{
    personId: string;
    prev: AttendanceRecord | null;
  } | null>(null);
  const [guestOpen, setGuestOpen] = useState(false);

  // 「開催済みにする」操作。誤操作防止に二段階（確認）。
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [isCompleting, startCompleting] = useTransition();

  const complete = useCallback(() => {
    setCompleteError(null);
    startCompleting(async () => {
      const res = await completeEventAction(event.id);
      if (res.error) {
        setCompleteError(res.error);
        setConfirmComplete(false);
        return;
      }
      setConfirmComplete(false);
      // サーバーを再取得：開催済みの礼拝は受付一覧から外れ、別の礼拝か空状態に切り替わる。
      router.refresh();
    });
  }, [event.id, router]);

  const summary = useMemo(() => summarizeReception(rows), [rows]);
  const people = useMemo(() => rows.map((r) => r.person), [rows]);

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

  const toggle = useCallback(
    (row: ReceptionRow) => {
      if (!canEdit) return;
      setLastAction({ personId: row.person.id, prev: row.attendance });
      if (row.attendance) sync.enqueueDelete(row.person);
      else sync.enqueuePut(row.person, 0);
    },
    [canEdit, sync],
  );

  const changeLunch = useCallback(
    (row: ReceptionRow, delta: number) => {
      if (!canEdit || !row.attendance) return;
      // 0.5 刻みに丸めてから 0〜20 にクランプ（浮動小数の累積誤差を防ぐ）。
      const raw = row.attendance.lunch_quantity + delta;
      const next = Math.max(0, Math.min(20, Math.round(raw * 2) / 2));
      setLastAction({ personId: row.person.id, prev: row.attendance });
      sync.enqueuePut(row.person, next);
    },
    [canEdit, sync],
  );

  const undo = useCallback(() => {
    if (!lastAction) return;
    const person = rows.find((r) => r.person.id === lastAction.personId)?.person;
    if (!person) return;
    if (lastAction.prev) sync.enqueuePut(person, lastAction.prev.lunch_quantity);
    else sync.enqueueDelete(person);
    setLastAction(null);
  }, [lastAction, rows, sync]);

  return (
    <div className="space-y-3">
      {/* イベント情報・検索・フィルターまでを固定し、人物一覧だけスクロールさせる。
          Nav(高さ108px・sticky)の直下に貼り付ける。 */}
      <div className="sticky top-[108px] z-20 -mx-3 space-y-3 bg-slate-100 px-3 pb-2 sm:-mx-5 sm:px-5">
      {/* 礼拝情報＋リアルタイム合計＋同期状態 */}
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{event.name}</p>
            <p className="text-xs text-slate-500">
              {formatDateInZone(event.starts_at, timezone)}{' '}
              {formatTimeInZone(event.starts_at, timezone)} ·{' '}
              {SERVICE_KIND_LABELS[event.kind]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SyncStatus
              online={sync.online}
              realtime={sync.realtimeConnected}
              flushing={sync.flushing}
              pending={sync.pendingCount}
              onRetry={sync.flushNow}
            />
            <button
              onClick={() => void sync.refetch()}
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

        {/* 開催済みにする（owner/admin のみ）。開催済みにすると受付一覧から外れ、
            「礼拝」タブからのみ参照できる。誤操作防止に確認を挟む。 */}
        {canComplete && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            {completeError && (
              <p className="mb-2 text-xs text-rose-600" role="alert">
                {completeError}
              </p>
            )}
            {confirmComplete ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-xs text-slate-500">
                  この礼拝を開催済みにします。受付一覧から外れ、「礼拝」タブから確認できます。
                </span>
                <button
                  onClick={complete}
                  disabled={isCompleting}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white active:scale-95 disabled:opacity-50"
                >
                  {isCompleting ? '変更中…' : '開催済みにする'}
                </button>
                <button
                  onClick={() => setConfirmComplete(false)}
                  disabled={isCompleting}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                >
                  やめる
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setCompleteError(null);
                  setConfirmComplete(true);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                この礼拝を開催済みにする
              </button>
            )}
          </div>
        )}
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
              {e.name}（{formatDateInZone(e.starts_at, timezone)}{' '}
              {formatTimeInZone(e.starts_at, timezone)}）
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
          placeholder="名前・ふりがなで検索"
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
      </div>
      {/* ── 固定ブロックここまで。以下の人物一覧だけがスクロールする ── */}

      {/* 人物一覧 */}
      <ul className="space-y-2">
        {filtered.map((row) => (
          <PersonRow
            key={row.person.id}
            row={row}
            canEdit={canEdit}
            lunchEnabled={event.lunch_enabled}
            pending={pendingIds.has(row.person.id)}
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
          lunchEnabled={event.lunch_enabled}
          childLabel={childLabel}
          people={people}
          onClose={() => setGuestOpen(false)}
          onAddGuest={(input) => {
            sync.enqueueGuest(input);
            setGuestOpen(false);
          }}
          onAttendExisting={(person, lunch) => {
            // 既に出席済みの人物を候補から選んだ場合、取消で既存出席を消さない
            // よう、現在の出席状態を prev として保持する。
            const cur = rows.find((r) => r.person.id === person.id)?.attendance ?? null;
            setLastAction({ personId: person.id, prev: cur });
            sync.enqueuePut(person, lunch);
            setGuestOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SyncStatus({
  online,
  realtime,
  flushing,
  pending,
  onRetry,
}: {
  online: boolean;
  realtime: boolean;
  flushing: boolean;
  pending: number;
  onRetry: () => void;
}) {
  if (!online) {
    return (
      <span className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
        <CloudOff className="h-3.5 w-3.5" />
        オフライン{pending > 0 ? `・未同期 ${pending}` : ''}
      </span>
    );
  }
  if (pending > 0) {
    return (
      <button
        onClick={onRetry}
        className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${flushing ? 'animate-spin' : ''}`} />
        未同期 {pending}・再送
      </button>
    );
  }
  return (
    <span
      className="flex items-center gap-1 text-xs text-slate-400"
      title={realtime ? 'リアルタイム同期中' : '同期済み'}
    >
      <Wifi className={`h-3.5 w-3.5 ${realtime ? 'text-emerald-500' : ''}`} />
      <span className="hidden sm:inline">{realtime ? '同期中' : '同期済み'}</span>
    </span>
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
    <div className={`rounded-xl px-1 py-1.5 ${highlight ? 'bg-indigo-50' : 'bg-slate-50'}`}>
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
  pending,
  onToggle,
  onLunch,
}: {
  row: ReceptionRow;
  canEdit: boolean;
  lunchEnabled: boolean;
  pending: boolean;
  onToggle: () => void;
  onLunch: (delta: number) => void;
}) {
  const { person, attendance } = row;
  const present = !!attendance;

  return (
    <li className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-medium text-slate-900">
          {person.display_name}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          {person.furigana && (
            <span className="truncate text-[11px] text-slate-400">{person.furigana}</span>
          )}
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ${RELATIONSHIP_BADGE[person.relationship_status]}`}
          >
            {RELATIONSHIP_LABELS[person.relationship_status]}
          </span>
          {pending && (
            <span className="flex items-center gap-0.5 text-[10px] font-medium text-amber-600">
              <RefreshCw className="h-3 w-3 animate-spin" />
              未同期
            </span>
          )}
        </div>
      </div>

      {/* 昼食ステッパー（出席かつ昼食ありの礼拝のみ） */}
      {present && lunchEnabled && canEdit && (
        <div className="flex items-center gap-1 rounded-lg bg-slate-50 p-0.5">
          <button
            onClick={() => onLunch(-0.5)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 active:bg-slate-200 disabled:opacity-30"
            disabled={attendance!.lunch_quantity <= 0}
            aria-label="昼食を0.5減らす"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center text-sm font-semibold tabular-nums">
            昼{attendance!.lunch_quantity}
          </span>
          <button
            onClick={() => onLunch(0.5)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 active:bg-slate-200"
            aria-label="昼食を0.5増やす"
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
          present ? 'bg-emerald-500 text-white' : 'bg-white text-slate-500 ring-2 ring-slate-200'
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
      </button>
    </li>
  );
}
