import { describe, it, expect } from 'vitest';
import {
  emptySnapshot,
  applyDesired,
  clearDesiredIfUnchanged,
  resolveGuest,
  mergeRows,
  pendingCount,
  isTempId,
  newTempPersonId,
  type PendingPut,
  type PendingDelete,
  type QueueSnapshot,
} from '@/app/lib/offline/queueModel';
import type { Person, ReceptionRow } from '@/app/lib/types';

function person(id: string): Person {
  return {
    id,
    church_id: 'c1',
    display_name: id,
    furigana: id,
    relationship_status: 'member',
    age_group: 'adult',
    first_visit_on: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}
function put(personId: string, lunch: number, op: string, at: number): PendingPut {
  return { kind: 'put', personId, lunchQuantity: lunch, clientOpId: op, updatedAt: at };
}
function del(personId: string, op: string, at: number): PendingDelete {
  return { kind: 'delete', personId, clientOpId: op, updatedAt: at };
}

describe('applyDesired (latest-wins)', () => {
  it('同一 personId は 1 件に畳む', () => {
    let s = emptySnapshot('e1');
    s = applyDesired(s, put('a', 0, 'op1', 100));
    s = applyDesired(s, put('a', 2, 'op2', 200));
    expect(Object.keys(s.desired)).toEqual(['a']);
    expect((s.desired['a'] as PendingPut).lunchQuantity).toBe(2);
  });

  it('古い updatedAt は捨てる', () => {
    let s = emptySnapshot('e1');
    s = applyDesired(s, put('a', 5, 'new', 200));
    s = applyDesired(s, put('a', 1, 'old', 100));
    expect((s.desired['a'] as PendingPut).lunchQuantity).toBe(5);
  });

  it('put→delete→put で最後の put が残る', () => {
    let s = emptySnapshot('e1');
    s = applyDesired(s, put('a', 1, 'o1', 100));
    s = applyDesired(s, del('a', 'o2', 200));
    s = applyDesired(s, put('a', 3, 'o3', 300));
    expect(s.desired['a'].kind).toBe('put');
    expect((s.desired['a'] as PendingPut).lunchQuantity).toBe(3);
  });
});

describe('clearDesiredIfUnchanged', () => {
  it('送信時 clientOpId と一致する時のみ削除', () => {
    let s = emptySnapshot('e1');
    s = applyDesired(s, put('a', 1, 'op1', 100));
    s = clearDesiredIfUnchanged(s, 'a', 'op1');
    expect(s.desired['a']).toBeUndefined();
  });

  it('送信後に積まれた新 op は残す（取りこぼし防止）', () => {
    let s = emptySnapshot('e1');
    s = applyDesired(s, put('a', 1, 'op1', 100));
    s = applyDesired(s, put('a', 9, 'op2', 200)); // 送信中に上書き
    s = clearDesiredIfUnchanged(s, 'a', 'op1'); // op1 の成功通知
    expect(s.desired['a']).toBeDefined();
    expect((s.desired['a'] as PendingPut).lunchQuantity).toBe(9);
  });
});

describe('resolveGuest', () => {
  it('temp→実ID で desired/optimisticPeople/guests を張り替える', () => {
    const tempId = 'temp:xyz';
    let s: QueueSnapshot = emptySnapshot('e1');
    s = {
      ...s,
      guests: {
        [tempId]: {
          kind: 'guest',
          tempPersonId: tempId,
          clientOpId: 'g1',
          input: { displayName: 'X', ageGroup: 'adult', relationshipStatus: 'guest', lunchQuantity: 1 },
          updatedAt: 100,
        },
      },
      optimisticPeople: { [tempId]: person(tempId) },
      desired: { [tempId]: put(tempId, 1, 'g1', 100) },
    };
    const real = person('real-1');
    s = resolveGuest(s, tempId, real);
    expect(s.guests[tempId]).toBeUndefined();
    expect(s.optimisticPeople[tempId]).toBeUndefined();
    expect(s.desired[tempId]).toBeUndefined();
    expect(s.desired['real-1']).toBeDefined();
    expect((s.desired['real-1'] as PendingPut).personId).toBe('real-1');
  });
});

describe('mergeRows', () => {
  const serverRows: ReceptionRow[] = [
    { person: person('a'), attendance: null },
    {
      person: person('b'),
      attendance: {
        id: 'att-b',
        church_id: 'c1',
        service_event_id: 'e1',
        person_id: 'b',
        lunch_quantity: 0,
        checked_in_at: '2026-01-01T01:00:00Z',
        checked_in_by: null,
        source: 'reception',
        created_at: '2026-01-01T01:00:00Z',
        updated_at: '2026-01-01T01:00:00Z',
      },
    },
  ];

  it('pending のある person はローカル希望を優先表示', () => {
    let s = emptySnapshot('e1');
    s = applyDesired(s, put('a', 2, 'op1', 100)); // a を出席+昼食2 にしたい
    const rows = mergeRows(serverRows, s);
    const a = rows.find((r) => r.person.id === 'a')!;
    expect(a.attendance).not.toBeNull();
    expect(a.attendance!.lunch_quantity).toBe(2);
  });

  it('delete 希望は未出席表示', () => {
    let s = emptySnapshot('e1');
    s = applyDesired(s, del('b', 'op1', 100));
    const rows = mergeRows(serverRows, s);
    expect(rows.find((r) => r.person.id === 'b')!.attendance).toBeNull();
  });

  it('pending の無い person はサーバ値', () => {
    const s = emptySnapshot('e1');
    const rows = mergeRows(serverRows, s);
    expect(rows.find((r) => r.person.id === 'b')!.attendance!.id).toBe('att-b');
  });

  it('temp ゲストはサーバに無くても一覧に出る', () => {
    const tempId = newTempPersonId();
    let s = emptySnapshot('e1');
    s = {
      ...s,
      optimisticPeople: { [tempId]: person(tempId) },
      desired: { [tempId]: put(tempId, 1, 'g1', 100) },
    };
    const rows = mergeRows(serverRows, s);
    const g = rows.find((r) => r.person.id === tempId);
    expect(g).toBeDefined();
    expect(g!.attendance!.lunch_quantity).toBe(1);
    expect(isTempId(g!.person.id)).toBe(true);
  });
});

describe('pendingCount', () => {
  it('ゲストの put を二重に数えない', () => {
    const tempId = 'temp:1';
    let s = emptySnapshot('e1');
    s = {
      ...s,
      guests: {
        [tempId]: {
          kind: 'guest',
          tempPersonId: tempId,
          clientOpId: 'g1',
          input: { displayName: 'X', ageGroup: 'adult', relationshipStatus: 'guest', lunchQuantity: 0 },
          updatedAt: 1,
        },
      },
      desired: { [tempId]: put(tempId, 0, 'g1', 1) },
    };
    expect(pendingCount(s)).toBe(1);
  });
});
