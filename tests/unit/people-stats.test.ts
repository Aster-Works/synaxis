import { describe, it, expect } from 'vitest';
import { summarizePeoplePresence } from '@/app/lib/people-stats';
import type { Person } from '@/app/lib/types';

function person(
  id: string,
  rel: Person['relationship_status'],
  firstVisit: string | null = null,
): Person {
  return {
    id,
    church_id: 'c1',
    display_name: id,
    furigana: null,
    relationship_status: rel,
    age_group: 'adult',
    first_visit_on: firstVisit,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

const TZ = 'Asia/Tokyo';

describe('summarizePeoplePresence', () => {
  it('出席回数と rated 出席率（rated分母）を算出', () => {
    const people = [person('a', 'member'), person('b', 'guest')];
    const attendance = [
      { person_id: 'a', checked_in_at: '2026-06-07T01:30:00Z', rated: true },
      { person_id: 'a', checked_in_at: '2026-06-14T01:30:00Z', rated: true },
      { person_id: 'b', checked_in_at: '2026-06-14T01:30:00Z', rated: true },
    ];
    const r = summarizePeoplePresence({ people, attendance, ratedEventCount: 2, timezone: TZ });
    const a = r.find((x) => x.personId === 'a')!;
    expect(a.count).toBe(2);
    expect(a.ratedCount).toBe(2);
    expect(a.rate).toBe(1); // 2/2
    const b = r.find((x) => x.personId === 'b')!;
    expect(b.rate).toBe(0.5); // 1/2
  });

  it('rated イベント0件でも rate=0 で例外を出さない', () => {
    const people = [person('a', 'member')];
    const r = summarizePeoplePresence({
      people,
      attendance: [{ person_id: 'a', checked_in_at: '2026-06-07T01:30:00Z', rated: false }],
      ratedEventCount: 0,
      timezone: TZ,
    });
    expect(r[0].rate).toBe(0);
    expect(r[0].count).toBe(1);
  });

  it('firstOn は first_visit_on 優先、無ければ min(checked_in_at) のローカル日付', () => {
    const withFirst = person('a', 'member', '2020-01-05');
    const withoutFirst = person('b', 'member');
    const attendance = [
      { person_id: 'a', checked_in_at: '2026-06-14T01:30:00Z', rated: true },
      { person_id: 'b', checked_in_at: '2026-06-07T01:30:00Z', rated: true }, // JST 6/7 10:30
      { person_id: 'b', checked_in_at: '2026-06-14T01:30:00Z', rated: true },
    ];
    const r = summarizePeoplePresence({
      people: [withFirst, withoutFirst],
      attendance,
      ratedEventCount: 2,
      timezone: TZ,
    });
    expect(r.find((x) => x.personId === 'a')!.firstOn).toBe('2020-01-05'); // 上書き
    expect(r.find((x) => x.personId === 'b')!.firstOn).toBe('2026-06-07'); // 導出
    expect(r.find((x) => x.personId === 'b')!.lastOn).toBe('2026-06-14');
  });

  it('新来ゲスト判定: guest かつ 期間内出席1回のみ', () => {
    const people = [person('g1', 'guest'), person('g2', 'guest'), person('m', 'member')];
    const attendance = [
      { person_id: 'g1', checked_in_at: '2026-06-14T01:30:00Z', rated: true },
      { person_id: 'g2', checked_in_at: '2026-06-07T01:30:00Z', rated: true },
      { person_id: 'g2', checked_in_at: '2026-06-14T01:30:00Z', rated: true },
      { person_id: 'm', checked_in_at: '2026-06-14T01:30:00Z', rated: true },
    ];
    const r = summarizePeoplePresence({ people, attendance, ratedEventCount: 2, timezone: TZ });
    expect(r.find((x) => x.personId === 'g1')!.isNewGuest).toBe(true);
    expect(r.find((x) => x.personId === 'g2')!.isNewGuest).toBe(false); // 再来
    expect(r.find((x) => x.personId === 'm')!.isNewGuest).toBe(false); // member
  });
});
