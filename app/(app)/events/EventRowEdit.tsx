'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { ServiceEvent } from '@/app/lib/types';
import { EventEditModal } from './EventEditModal';

// 礼拝一覧の各行に置く編集ボタン＋モーダル（owner/admin のみ描画）。
export function EventRowEdit({
  event,
  timezone,
}: {
  event: ServiceEvent;
  timezone: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label={`${event.name} を編集`}
        title="この礼拝を編集・削除"
      >
        <Pencil className="h-4 w-4" />
      </button>
      {open && (
        <EventEditModal event={event} timezone={timezone} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
