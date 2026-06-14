import type {
  PeriodReport,
  PersonPresence,
  Person,
  ServiceEvent,
} from './types';
import {
  AGE_GROUP_LABELS,
  RELATIONSHIP_LABELS,
  SERVICE_KIND_LABELS,
} from './types';
import { zonedDateOf } from './datetime';
import type { CsvCell } from './csv';

// CSV の行を組み立てる純関数群（docs §11.2）。サーバで取得したデータを受け、
// ダッシュボードと同じ集計（PeriodReport / PersonPresence）を元にするため合計が一致する。

// まとめ: 礼拝ごとの出席内訳 + 期間合計
export function buildSummaryRows(report: PeriodReport, timezone: string): CsvCell[][] {
  const header: CsvCell[] = [
    '日付', '礼拝名', '種別', '出席率対象', '総出席', '大人', '子ども', '不明',
    '昼食', '会員', '客員', '未信', 'ゲスト',
  ];
  const rows: CsvCell[][] = [header];
  for (const r of report.eventReports) {
    rows.push([
      zonedDateOf(r.event.starts_at, timezone),
      r.event.name,
      SERVICE_KIND_LABELS[r.event.kind],
      r.event.counts_toward_attendance_rate ? '○' : '',
      r.present,
      r.adults,
      r.children,
      r.unknownAge,
      r.lunch,
      r.byRelationship.member,
      r.byRelationship.regular_attendee,
      r.byRelationship.seeker,
      r.byRelationship.guest,
    ]);
  }
  const t = report.totals;
  rows.push([
    '合計', `${t.events}礼拝（対象${t.ratedEvents}）`, '', '',
    t.present, t.adults, t.children, t.unknownAge, t.lunch,
    t.byRelationship.member, t.byRelationship.regular_attendee,
    t.byRelationship.seeker, t.byRelationship.guest,
  ]);

  // 日別の出席。unique＝同じ日に複数礼拝へ出た人は1回だけ（最初の礼拝に計上）、
  // total＝延べ。礼拝内訳は unique のとき先頭=最初の礼拝・以降「+N＝新規」、total は実数。
  const unique = report.filter.countMode === 'unique';
  rows.push([]);
  rows.push([unique ? '【日別ユニーク出席】' : '【日別 延べ出席】']);
  rows.push([
    '日付', unique ? 'ユニーク出席' : '延べ出席', '大人', '子ども', '不明',
    '会員', '客員', '未信', 'ゲスト', '礼拝内訳',
  ]);
  for (const d of report.dayReports) {
    const breakdown = d.services
      .map((s, i) => `${s.name} ${unique && i > 0 ? '+' : ''}${s.present}`)
      .join(' / ');
    rows.push([
      d.date, d.present, d.adults, d.children, d.unknownAge,
      d.byRelationship.member, d.byRelationship.regular_attendee,
      d.byRelationship.seeker, d.byRelationship.guest, breakdown,
    ]);
  }
  return rows;
}

// 人物一覧: 全人物の属性 + 出席統計
export function buildPeopleRows(people: PersonPresence[]): CsvCell[][] {
  const header: CsvCell[] = [
    '氏名', 'フリガナ', '立場', '年齢区分', '出席回数', '出席率(%)', '初回出席', '最終出席',
  ];
  const rows: CsvCell[][] = [header];
  for (const p of people) {
    rows.push([
      p.displayName,
      p.furigana ?? '',
      RELATIONSHIP_LABELS[p.relationship],
      AGE_GROUP_LABELS[p.ageGroup],
      p.count,
      Math.round(p.rate * 100),
      p.firstOn ?? '',
      p.lastOn ?? '',
    ]);
  }
  return rows;
}

// ゲスト: 現在の立場が guest の人物のみ
export function buildGuestsRows(people: PersonPresence[]): CsvCell[][] {
  const header: CsvCell[] = ['氏名', 'フリガナ', '初回出席', '最終出席', '出席回数', '現在の立場'];
  const rows: CsvCell[][] = [header];
  for (const p of people.filter((x) => x.relationship === 'guest')) {
    rows.push([
      p.displayName,
      p.furigana ?? '',
      p.firstOn ?? '',
      p.lastOn ?? '',
      p.count,
      RELATIONSHIP_LABELS[p.relationship],
    ]);
  }
  return rows;
}

// 出席マトリクス: 行=人物, 列=礼拝, 値=○
export function buildMatrixRows(
  events: ServiceEvent[],
  people: Person[],
  present: Set<string>,
  timezone: string,
): CsvCell[][] {
  const header: CsvCell[] = [
    '氏名',
    'フリガナ',
    ...events.map((e) => `${zonedDateOf(e.starts_at, timezone)} ${e.name}`),
  ];
  const rows: CsvCell[][] = [header];
  for (const person of people) {
    rows.push([
      person.display_name,
      person.furigana ?? '',
      ...events.map((e) => (present.has(`${person.id}|${e.id}`) ? '○' : '')),
    ]);
  }
  return rows;
}
