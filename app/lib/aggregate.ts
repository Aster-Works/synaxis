import type { ReceptionRow, RelationshipStatus } from './types';

// 受付画面のリアルタイム合計。出席（attendance != null）のみを数える。
// 純関数なので単体テストで検証する（docs/PRODUCT_SPEC.md §14.1 集計ロジック）。
export interface ReceptionSummary {
  present: number;
  adults: number;
  children: number;
  unknownAge: number;
  lunchTotal: number;
  guests: number;
  byRelationship: Record<RelationshipStatus, number>;
}

export function summarizeReception(rows: ReceptionRow[]): ReceptionSummary {
  const summary: ReceptionSummary = {
    present: 0,
    adults: 0,
    children: 0,
    unknownAge: 0,
    lunchTotal: 0,
    guests: 0,
    byRelationship: {
      member: 0,
      regular_attendee: 0,
      seeker: 0,
      guest: 0,
    },
  };

  for (const { person, attendance } of rows) {
    if (!attendance) continue;

    summary.present += 1;
    summary.lunchTotal += attendance.lunch_quantity ?? 0;

    if (person.age_group === 'adult') summary.adults += 1;
    else if (person.age_group === 'child') summary.children += 1;
    else summary.unknownAge += 1;

    summary.byRelationship[person.relationship_status] += 1;
  }

  summary.guests = summary.byRelationship.guest;
  return summary;
}
