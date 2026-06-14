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
  it('出席回数と rated 出席率（rated 日数が分母）を算出', () => {
    const people = [person('a', 'member'), person('b', 'guest')];
    const attendance = [
      { person_id: 'a', checked_in_at: '2026-06-07T01:30:00Z', day: '2026-06-07', rated: true },
      { person_id: 'a', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true },
      { person_id: 'b', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true },
    ];
    const r = summarizePeoplePresence({ people, attendance, ratedDayCount: 2, timezone: TZ });
    const a = r.find((x) => x.personId === 'a')!;
    expect(a.count).toBe(2);
    expect(a.ratedCount).toBe(2); // 2 日出席
    expect(a.rate).toBe(1); // 2/2 日
    const b = r.find((x) => x.personId === 'b')!;
    expect(b.rate).toBe(0.5); // 1/2 日
  });

  it('同じ日に朝礼拝と夕拝へ出ても出席率は1日分（朝だけの人と同じ100%）', () => {
    // 1日（朝・夕）だけの記録。rated 日数=1。
    const people = [person('x', 'member'), person('y', 'member')];
    const attendance = [
      { person_id: 'x', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true }, // 朝
      { person_id: 'x', checked_in_at: '2026-06-14T09:00:00Z', day: '2026-06-14', rated: true }, // 夕
      { person_id: 'y', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true }, // 朝のみ
    ];
    const r = summarizePeoplePresence({ people, attendance, ratedDayCount: 1, timezone: TZ });
    const x = r.find((p) => p.personId === 'x')!;
    const y = r.find((p) => p.personId === 'y')!;
    expect(x.count).toBe(1); // 出席回数も日単位＝1日（同日に朝夕2回でも1）
    expect(x.ratedCount).toBe(1); // 出席した rated 日数は1
    expect(x.rate).toBe(1); // 出席率は100%（1日/1日）
    expect(y.count).toBe(1);
    expect(y.rate).toBe(1); // 朝だけの人も同じく100%
  });

  it("countMode='total' は礼拝（延べ）単位で出席率を出す（朝だけは50%に戻る）", () => {
    const people = [person('x', 'member'), person('y', 'member')];
    const attendance = [
      { person_id: 'x', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true }, // 朝
      { person_id: 'x', checked_in_at: '2026-06-14T09:00:00Z', day: '2026-06-14', rated: true }, // 夕
      { person_id: 'y', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true }, // 朝のみ
    ];
    const r = summarizePeoplePresence({
      people,
      attendance,
      ratedDayCount: 1,
      ratedEventCount: 2,
      countMode: 'total',
      timezone: TZ,
    });
    const x = r.find((p) => p.personId === 'x')!;
    const y = r.find((p) => p.personId === 'y')!;
    expect(x.count).toBe(2); // 延べ2礼拝
    expect(x.rate).toBe(1); // 2/2 礼拝
    expect(y.count).toBe(1);
    expect(y.rate).toBe(0.5); // 1/2 礼拝（延べでは朝だけは50%）
  });

  it('rated 日が0でも rate=0 で例外を出さない', () => {
    const people = [person('a', 'member')];
    const r = summarizePeoplePresence({
      people,
      attendance: [{ person_id: 'a', checked_in_at: '2026-06-07T01:30:00Z', day: '2026-06-07', rated: false }],
      ratedDayCount: 0,
      timezone: TZ,
    });
    expect(r[0].rate).toBe(0);
    expect(r[0].count).toBe(1);
  });

  it('firstOn は first_visit_on 優先、無ければ min(checked_in_at) のローカル日付', () => {
    const withFirst = person('a', 'member', '2020-01-05');
    const withoutFirst = person('b', 'member');
    const attendance = [
      { person_id: 'a', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true },
      { person_id: 'b', checked_in_at: '2026-06-07T01:30:00Z', day: '2026-06-07', rated: true }, // JST 6/7 10:30
      { person_id: 'b', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true },
    ];
    const r = summarizePeoplePresence({
      people: [withFirst, withoutFirst],
      attendance,
      ratedDayCount: 2,
      timezone: TZ,
    });
    expect(r.find((x) => x.personId === 'a')!.firstOn).toBe('2020-01-05'); // 上書き
    expect(r.find((x) => x.personId === 'b')!.firstOn).toBe('2026-06-07'); // 導出
    expect(r.find((x) => x.personId === 'b')!.lastOn).toBe('2026-06-14');
  });

  it('新来ゲスト判定: guest かつ 出席した日が1日のみ（同日に朝夕2回でも1日）', () => {
    const people = [person('g1', 'guest'), person('g2', 'guest'), person('g3', 'guest'), person('m', 'member')];
    const attendance = [
      { person_id: 'g1', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true }, // 1日（朝）
      { person_id: 'g2', checked_in_at: '2026-06-07T01:30:00Z', day: '2026-06-07', rated: true }, // 2日（再来）
      { person_id: 'g2', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true },
      { person_id: 'g3', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true }, // 同日 朝＋夕＝1日
      { person_id: 'g3', checked_in_at: '2026-06-14T09:00:00Z', day: '2026-06-14', rated: true },
      { person_id: 'm', checked_in_at: '2026-06-14T01:30:00Z', day: '2026-06-14', rated: true },
    ];
    const r = summarizePeoplePresence({ people, attendance, ratedDayCount: 2, timezone: TZ });
    expect(r.find((x) => x.personId === 'g1')!.isNewGuest).toBe(true);
    expect(r.find((x) => x.personId === 'g2')!.isNewGuest).toBe(false); // 別日に再来
    expect(r.find((x) => x.personId === 'g3')!.isNewGuest).toBe(true); // 同日2回でも1日→新来
    expect(r.find((x) => x.personId === 'm')!.isNewGuest).toBe(false); // member
  });
});
