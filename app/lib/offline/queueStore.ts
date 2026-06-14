import type { QueueSnapshot } from './queueModel';

// service_event 単位の永続ストア（同期）。
// localStorage を第一選択（小容量・同期で扱いやすい）。SSR/非対応は memory。
// 将来 IndexedDB へ差し替え可能なよう最小インターフェースに留める。
export interface QueueStore {
  load(eventId: string): QueueSnapshot | null;
  save(snap: QueueSnapshot): void;
  clear(eventId: string): void;
}

const KEY = (id: string) => `synaxis:reception-queue:${id}`;

function localStore(): QueueStore {
  return {
    load(id) {
      try {
        const v = localStorage.getItem(KEY(id));
        return v ? (JSON.parse(v) as QueueSnapshot) : null;
      } catch {
        return null;
      }
    },
    save(snap) {
      try {
        localStorage.setItem(KEY(snap.eventId), JSON.stringify(snap));
      } catch {
        // 容量超過等は握りつぶす（次回保存で回復）
      }
    },
    clear(id) {
      try {
        localStorage.removeItem(KEY(id));
      } catch {
        /* noop */
      }
    },
  };
}

function memStore(): QueueStore {
  const m = new Map<string, QueueSnapshot>();
  return {
    load: (id) => m.get(id) ?? null,
    save: (s) => void m.set(s.eventId, s),
    clear: (id) => void m.delete(id),
  };
}

export function createQueueStore(): QueueStore {
  if (typeof window === 'undefined') return memStore();
  try {
    if ('localStorage' in window) {
      // 動作確認（プライベートモード等で例外になることがある）
      const t = '__synaxis_probe__';
      window.localStorage.setItem(t, '1');
      window.localStorage.removeItem(t);
      return localStore();
    }
  } catch {
    /* fall through */
  }
  return memStore();
}
