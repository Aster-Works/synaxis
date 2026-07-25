import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllAttendance, periodStart } from '@/app/lib/reports';

type Row = { id: string; service_event_id: string };

// PostgREST を模したフェイク。serverMax は「サーバ側 max_rows」で、
// クライアントのページサイズ(1000)とは**わざと別の値**にする。
// ここが同値だと、max_rows を下げられたときの切り捨てをテストが見逃す。
function fakeSupabase(rows: Row[], serverMax: number) {
  const calls: { ids: string[]; gt: string | null; selected: string }[] = [];

  const makeQuery = (ids: string[], selected: string) => {
    let gt: string | null = null;
    const run = () => {
      calls.push({ ids, gt, selected });
      const matched = rows
        .filter((r) => ids.includes(r.service_event_id))
        .filter((r) => (gt === null ? true : r.id > gt))
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, serverMax);
      return Promise.resolve({ data: matched, error: null });
    };
    const q = {
      gt: (_c: string, v: string) => {
        gt = v;
        return q;
      },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        run().then(res, rej),
    };
    return q;
  };

  const client = {
    from: () => ({
      select: (selected: string) => ({
        eq: () => ({
          in: (_col: string, ids: string[]) => ({
            order: () => ({ limit: () => makeQuery(ids, selected) }),
          }),
        }),
      }),
    }),
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const rowsFor = (eventId: string, n: number, offset = 0): Row[] =>
  Array.from({ length: n }, (_, i) => ({
    // id は文字列比較で単調増加させる（keyset カーソルの検証のため）
    id: `evt-${eventId}-${String(i + offset).padStart(6, '0')}`,
    service_event_id: eventId,
  }));

describe('fetchAllAttendance（切り捨てなしの全件取得）', () => {
  it('サーバ上限がページサイズより小さくても全件返す（max_rows 非依存）', async () => {
    const rows = rowsFor('e1', 2204);
    const { client } = fakeSupabase(rows, 300); // max_rows=300 に絞られた状況
    const got = await fetchAllAttendance<Row>(client, 'c1', ['e1'], 'person_id');
    expect(got).toHaveLength(2204);
    expect(new Set(got.map((r) => r.id)).size).toBe(2204); // 重複なし
  });

  it('1000件ちょうど（境界）でも過不足なく返す', async () => {
    const { client } = fakeSupabase(rowsFor('e1', 1000), 1000);
    const got = await fetchAllAttendance<Row>(client, 'c1', ['e1'], 'person_id');
    expect(got).toHaveLength(1000);
  });

  it('礼拝IDを100件以下のチャンクに分割して in() に渡す（URL肥大対策）', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `e${i}`);
    const rows = ids.flatMap((e) => rowsFor(e, 1));
    const { client, calls } = fakeSupabase(rows, 1000);
    const got = await fetchAllAttendance<Row>(client, 'c1', ids, 'person_id');
    expect(got).toHaveLength(250);
    expect(Math.max(...calls.map((c) => c.ids.length))).toBeLessThanOrEqual(100);
  });

  it('keyset カーソル用に id を select へ補う', async () => {
    const { client, calls } = fakeSupabase(rowsFor('e1', 1), 1000);
    await fetchAllAttendance<Row>(client, 'c1', ['e1'], 'person_id, lunch_quantity');
    expect(calls[0].selected).toContain('id');
  });

  it('取得エラーは空配列にすり替えず例外を投げる', async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            in: () => ({
              order: () => ({
                limit: () => ({
                  gt: () => ({}),
                  then: (res: (v: unknown) => unknown) =>
                    Promise.resolve({ data: null, error: { message: 'boom' } }).then(res),
                }),
              }),
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;
    await expect(fetchAllAttendance(client, 'c1', ['e1'], 'id')).rejects.toThrow(
      '出席データの取得に失敗',
    );
  });
});

describe('periodStart（月末の繰り上がり防止）', () => {
  it('3ヶ月前が翌月へずれない（5/31 → 2/28）', () => {
    const orig = Date;
    // 2026-05-31 を「今日」とする
    globalThis.Date = class extends orig {
      constructor(...args: ConstructorParameters<typeof Date>) {
        // @ts-expect-error テスト用の固定時刻
        super(...(args.length ? args : [2026, 4, 31, 12, 0, 0]));
      }
    } as DateConstructor;
    try {
      const d = periodStart('3m');
      expect(d.getMonth()).toBe(1); // 2月（0始まり）
      expect(d.getDate()).toBe(28);
    } finally {
      globalThis.Date = orig;
    }
  });

  it("'all' はエポックを返す", () => {
    expect(periodStart('all').getTime()).toBe(0);
  });
});
