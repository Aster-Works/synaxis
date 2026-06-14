import type { AgeGroup, Person, PersonPresence, RelationshipStatus } from './types';
import { zonedDateOf } from './datetime';

// 人物別の出席統計（純関数）。ダッシュボードのテーブルと CSV「ゲスト/人物一覧」が共有する。
// 「初回出席日」は first_visit_on を優先し、無ければ出席履歴の min(checked_in_at) を
// 教会ローカル日付化して導出する（first_visit_on は現状ほぼ null のため）。

export interface PeopleStatsInput {
  people: Person[]; // archived 除外済み
  // 期間内・フィルタ後の出席（礼拝の教会ローカル日付と rated 判定つき）
  attendance: {
    person_id: string;
    checked_in_at: string;
    day: string; // 礼拝の教会ローカル日付 YYYY-MM-DD（出席率は「日」単位で数える）
    rated: boolean;
  }[];
  ratedDayCount: number; // 期間内の rated「日数」（出席率の分母。礼拝数ではない）
  timezone: string;
}

// 出席率は「礼拝（朝・夕）」単位ではなく「日」単位で数える。
// 同じ日に朝礼拝と夕拝の両方へ出ても、朝だけ出た人と同じく「その日に出席＝1日分」。
// → 1日（朝夕）だけの記録なら、両方出た人も朝だけの人も同じ 100%。
export function summarizePeoplePresence(input: PeopleStatsInput): PersonPresence[] {
  const { people, attendance, ratedDayCount, timezone } = input;

  interface Acc {
    ratedDays: Set<string>; // 出席した rated 日（出席率の分子）
    allDays: Set<string>; // 出席した全日（出席回数・新来ゲスト判定に使用）
    minAt: string | null;
    maxAt: string | null;
  }
  const byPerson = new Map<string, Acc>();

  for (const a of attendance) {
    const acc =
      byPerson.get(a.person_id) ??
      { ratedDays: new Set<string>(), allDays: new Set<string>(), minAt: null, maxAt: null };
    acc.allDays.add(a.day);
    if (a.rated) acc.ratedDays.add(a.day);
    if (acc.minAt === null || a.checked_in_at < acc.minAt) acc.minAt = a.checked_in_at;
    if (acc.maxAt === null || a.checked_in_at > acc.maxAt) acc.maxAt = a.checked_in_at;
    byPerson.set(a.person_id, acc);
  }

  const out: PersonPresence[] = people.map((p) => {
    const acc = byPerson.get(p.id);
    const daysAttended = acc?.allDays.size ?? 0;
    const count = daysAttended; // 出席回数は「出席した日数」（同日に朝夕出ても1日は1）
    const ratedDaysAttended = acc?.ratedDays.size ?? 0;
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
      ratedCount: ratedDaysAttended, // 出席率の分子＝出席した rated 日数
      // 出席率＝出席した rated 日数 / 期間内 rated 日数（朝夕どちらに出ても1日は1）
      rate:
        ratedDayCount > 0
          ? Math.round((ratedDaysAttended / ratedDayCount) * 1000) / 1000
          : 0,
      firstOn,
      lastOn,
      // 新来ゲスト＝guest かつ「出席した日」が1日だけ（同日に朝夕2回でも1日）
      isNewGuest: p.relationship_status === 'guest' && daysAttended === 1,
    };
  });

  return out;
}
