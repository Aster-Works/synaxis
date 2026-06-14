import type {
  AgeGroup,
  CountMode,
  Person,
  PersonPresence,
  RelationshipStatus,
} from './types';
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
  ratedDayCount: number; // 期間内の rated「日数」（unique の出席率分母）
  ratedEventCount?: number; // 期間内の rated「礼拝数」（total の出席率分母）
  // 'unique'（既定）＝日単位（同日に朝夕出ても1日）／'total'＝礼拝単位（延べ）。
  countMode?: CountMode;
  timezone: string;
}

// 出席回数・出席率の数え方を countMode で切り替える。
//   'unique'：日単位。同じ日に朝礼拝と夕拝の両方へ出ても「その日に出席＝1日分」。
//             → 1日（朝夕）だけの記録なら、両方出た人も朝だけの人も同じ 100%。
//   'total' ：礼拝（サービス）単位の延べ。朝夕出れば 2、分母は rated 礼拝数。
export function summarizePeoplePresence(input: PeopleStatsInput): PersonPresence[] {
  const { people, attendance, ratedDayCount, timezone } = input;
  const countMode: CountMode = input.countMode ?? 'unique';
  const ratedEventCount = input.ratedEventCount ?? 0;

  interface Acc {
    services: number; // 出席した礼拝数（延べ）
    ratedServices: number; // 出席した rated 礼拝数（延べ）
    ratedDays: Set<string>; // 出席した rated 日
    allDays: Set<string>; // 出席した全日
    minAt: string | null;
    maxAt: string | null;
  }
  const byPerson = new Map<string, Acc>();

  for (const a of attendance) {
    const acc =
      byPerson.get(a.person_id) ??
      {
        services: 0,
        ratedServices: 0,
        ratedDays: new Set<string>(),
        allDays: new Set<string>(),
        minAt: null,
        maxAt: null,
      };
    acc.services += 1;
    acc.allDays.add(a.day);
    if (a.rated) {
      acc.ratedServices += 1;
      acc.ratedDays.add(a.day);
    }
    if (acc.minAt === null || a.checked_in_at < acc.minAt) acc.minAt = a.checked_in_at;
    if (acc.maxAt === null || a.checked_in_at > acc.maxAt) acc.maxAt = a.checked_in_at;
    byPerson.set(a.person_id, acc);
  }

  const unique = countMode === 'unique';
  const denom = unique ? ratedDayCount : ratedEventCount;

  const out: PersonPresence[] = people.map((p) => {
    const acc = byPerson.get(p.id);
    const daysAttended = acc?.allDays.size ?? 0;
    const servicesAttended = acc?.services ?? 0;
    const ratedDaysAttended = acc?.ratedDays.size ?? 0;
    const ratedServicesAttended = acc?.ratedServices ?? 0;
    // unique は「日」、total は「礼拝（延べ）」で数える。
    const count = unique ? daysAttended : servicesAttended;
    const ratedCount = unique ? ratedDaysAttended : ratedServicesAttended;
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
      rate: denom > 0 ? Math.round((ratedCount / denom) * 1000) / 1000 : 0,
      firstOn,
      lastOn,
      // 新来ゲスト＝guest かつ出席が1回のみ（unique は1日、total は1礼拝）
      isNewGuest: p.relationship_status === 'guest' && count === 1,
    };
  });

  return out;
}
