'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2 } from 'lucide-react';
import {
  SERVICE_KIND_LABELS,
  SERVICE_STATUS_LABELS,
  type ServiceEvent,
  type ServiceKind,
  type ServiceStatus,
} from '@/app/lib/types';
import { zonedDateOf, formatTimeInZone } from '@/app/lib/datetime';

export function EventEditModal({
  event,
  timezone,
  onClose,
}: {
  event: ServiceEvent;
  timezone: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<ServiceKind>(event.kind);
  const [name, setName] = useState(event.name);
  const [startsAtLocal, setStartsAtLocal] = useState(
    `${zonedDateOf(event.starts_at, timezone)}T${formatTimeInZone(event.starts_at, timezone)}`,
  );
  const [status, setStatus] = useState<ServiceStatus>(event.status);
  const [counts, setCounts] = useState(event.counts_toward_attendance_rate);
  const [lunch, setLunch] = useState(event.lunch_enabled);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !startsAtLocal) {
      setError('名称と日時を入力してください');
      return;
    }
    setPending(true);
    setError('');
    const res = await fetch(`/api/events/${event.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind,
        name: name.trim(),
        startsAtLocal,
        status,
        countsTowardAttendanceRate: counts,
        lunchEnabled: lunch,
      }),
    });
    setPending(false);
    if (res.ok) {
      router.refresh();
      onClose();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? '更新に失敗しました');
    }
  }

  async function remove() {
    setPending(true);
    setError('');
    const res = await fetch(`/api/events/${event.id}`, { method: 'DELETE' });
    setPending(false);
    if (res.ok) {
      router.refresh();
      onClose();
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error ?? '削除に失敗しました');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">礼拝を編集</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="閉じる">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">種別</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ServiceKind)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {Object.entries(SERVICE_KIND_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">名称</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">開始日時</label>
              <input
                type="datetime-local"
                value={startsAtLocal}
                onChange={(e) => setStartsAtLocal(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">状態</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ServiceStatus)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {Object.entries(SERVICE_STATUS_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={counts} onChange={(e) => setCounts(e.target.checked)} />
              出席率の分母に含める
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={lunch} onChange={(e) => setLunch(e.target.checked)} />
              昼食あり
            </label>
          </div>

          {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? '保存中…' : '保存する'}
          </button>
        </form>

        <div className="mt-4 border-t border-slate-100 pt-3">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-rose-600"
            >
              <Trash2 className="h-3.5 w-3.5" />
              この礼拝を削除
            </button>
          ) : (
            <div className="rounded-lg bg-rose-50 p-3">
              <p className="mb-2 text-xs text-rose-700">
                削除すると、この礼拝の出席記録もすべて消えます。
                記録を残したい場合は、状態を「キャンセル」にしてください。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-white py-2 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
                >
                  やめる
                </button>
                <button
                  onClick={remove}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-rose-600 py-2 text-xs font-bold text-white disabled:opacity-60"
                >
                  {pending ? '削除中…' : '削除する'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
