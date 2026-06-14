import type { AgeGroup, Person, PersonPresence, RelationshipStatus } from './types';
import { zonedDateOf } from './datetime';

// 人物別の出席統計（純関数）。ダッシュボードのテーブルと CSV「ゲスト/人物一覧」が共有する。
// 「初回出席日」は first_visit_on を優先し、無ければ出席履歴の min(checked_in_at) を
// 教会ローカル日付化して導出する（first_visit_on は現状ほぼ null のため）。

export interface PeopleStatsInput {
  people: Person[]; // archived 除外済み
  // 期間内・フィルタ後の出席（イベントの rated 判定つき）
  attendance: {
    person_id: string;
    checked_in_at: string;
    rated: boolean;
  }[];
  ratedEventCount: number; // 期間内 rated イベント総数（出席率の分母）
  timezone: string;
}

export function summarizePeoplePresence(input: PeopleStatsInput): PersonPresence[] {
  const { people, attendance, ratedEventCount, timezone } = input;

  interface Acc {
    count: number;
    ratedCount: number;
    minAt: string | null;
    maxAt: string | null;
  }
  const byPerson = new Map<string, Acc>();

  for (const a of attendance) {
    const acc =
      byPerson.get(a.person_id) ?? { count: 0, ratedCount: 0, minAt: null, maxAt: null };
    acc.count += 1;
    if (a.rated) acc.ratedCount += 1;
    if (acc.minAt === null || a.checked_in_at < acc.minAt) acc.minAt = a.checked_in_at;
    if (acc.maxAt === null || a.checked_in_at > acc.maxAt) acc.maxAt = a.checked_in_at;
    byPerson.set(a.person_id, acc);
  }

  const out: PersonPresence[] = people.map((p) => {
    const acc = byPerson.get(p.id);
    const count = acc?.count ?? 0;
    const ratedCount = acc?.ratedCount ?? 0;
    const firstOn = p.first_visit_on
      ? p.first_visit_on
      : acc?.minAt
        ? zonedDateOf(acc.minAt, timezone)
        : null;
    const lastOn = acc?.maxAt ? zonedDateOf(acc.maxAt, timezone) : null;
    return {
      personId: p.id,
      displayName: p.display_name,
      furigana: p.furigana,
      relationship: p.relationship_status as RelationshipStatus,
      ageGroup: p.age_group as AgeGroup,
      count,
      ratedCount,
      rate: ratedEventCount > 0 ? Math.round((ratedCount / ratedEventCount) * 1000) / 1000 : 0,
      firstOn,
      lastOn,
      isNewGuest: p.relationship_status === 'guest' && count === 1,
    };
  });

  return out;
}
