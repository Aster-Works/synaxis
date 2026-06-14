import type { AttendanceMatrix } from '../reports';
import type { Person, RelationshipStatus } from '../types';
import { RELATIONSHIP_LABELS } from '../types';
import { zonedDateOf } from '../datetime';
import type { CsvCell } from '../csv';

// 添付エクセル（礼拝出席名簿）に近い構造の Google Sheets タブを組み立てる純関数。
// - まとめ：各主日（朝礼拝）の立場別人数・大人/小人/合計・朝/夕・月平均
// - 立場別タブ（会員/客員/未信/子ども/ビジター）：人物×主日の出席マトリクス（○）
// - 特別礼拝：special_worship の出席者一覧（#・名前・○・立場）
// 値（行/列）のみ。月見出しの結合セルや色などの装飾は対象外。

export interface RosterTab {
  title: string;
  rows: CsvCell[][];
}

export function buildRosterTabs(
  matrix: AttendanceMatrix,
  year: number,
  timezone: string,
): RosterTab[] {
  const { events, people, present } = matrix;
  const came = (personId: string, eventId: string) =>
    present.has(`${personId}|${eventId}`);
  const localYmd = (iso: string): [number, number, number] => {
    const [y, m, d] = zonedDateOf(iso, timezone).split('-').map(Number);
    return [y, m, d];
  };

  // 主日（朝礼拝）＝マトリクスの列。開始時刻昇順（getAttendanceMatrix が昇順）。
  const sundays = events.filter((e) => e.kind === 'morning_worship');

  // 月見出し行（各月の先頭列にだけ「N月」）と 日付行（日のみ）。
  const monthHeader: CsvCell[] = [];
  const dayRow: CsvCell[] = [];
  let prevMonth = -1;
  for (const e of sundays) {
    const [, m, d] = localYmd(e.starts_at);
    monthHeader.push(m !== prevMonth ? `${m}月` : '');
    dayRow.push(d);
    prevMonth = m;
  }

  // ── 立場別/子どもタブ（人物×主日の出席マトリクス）─────────────────────
  const isChild = (p: Person) => p.age_group === 'child';
  const matrixTab = (title: string, members: Person[]): RosterTab => {
    const rows: CsvCell[][] = [];
    rows.push([`${year}年 主日礼拝出席者名簿`]);
    rows.push(['', '', ...monthHeader]); // #・名前 列は空、以降が月見出し
    rows.push(['#', '名前', ...dayRow]);
    members.forEach((p, i) => {
      rows.push([
        i + 1,
        p.display_name,
        ...sundays.map((e) => (came(p.id, e.id) ? '○' : '')),
      ]);
    });
    if (members.length === 0) rows.push(['', '（該当者なし）']);
    return { title, rows };
  };

  const adultsOf = (status: RelationshipStatus) =>
    people.filter((p) => !isChild(p) && p.relationship_status === status);

  const categoryTabs: RosterTab[] = [
    matrixTab('会員', adultsOf('member')),
    matrixTab('客員', adultsOf('regular_attendee')),
    matrixTab('未信', adultsOf('seeker')),
    matrixTab('子ども', people.filter(isChild)),
    matrixTab('ビジター', adultsOf('guest')),
  ];

  // ── まとめタブ ─────────────────────────────────────────────────────────
  // 各主日の、立場別（大人）・子ども・合計・朝・夕。
  const countCol = (pred: (p: Person) => boolean): number[] =>
    sundays.map((e) => people.filter((p) => pred(p) && came(p.id, e.id)).length);

  const memberRow = countCol((p) => !isChild(p) && p.relationship_status === 'member');
  const regularRow = countCol((p) => !isChild(p) && p.relationship_status === 'regular_attendee');
  const seekerRow = countCol((p) => !isChild(p) && p.relationship_status === 'seeker');
  const guestRow = countCol((p) => !isChild(p) && p.relationship_status === 'guest');
  const childRow = countCol(isChild);
  const adultRow = sundays.map(
    (_, i) => memberRow[i] + regularRow[i] + seekerRow[i] + guestRow[i],
  );
  const totalRow = sundays.map((_, i) => adultRow[i] + childRow[i]);

  // 夕拝の各日付ごとの出席合計。
  const eveningByDate = new Map<string, number>();
  for (const e of events.filter((ev) => ev.kind === 'evening_worship')) {
    const date = zonedDateOf(e.starts_at, timezone);
    const cnt = people.filter((p) => came(p.id, e.id)).length;
    eveningByDate.set(date, (eveningByDate.get(date) ?? 0) + cnt);
  }
  const eveningRow = sundays.map((e) => {
    const date = zonedDateOf(e.starts_at, timezone);
    return eveningByDate.has(date) ? (eveningByDate.get(date) as number) : '';
  });

  const summaryRows: CsvCell[][] = [
    ['', ...monthHeader],
    ['日付', ...dayRow],
    ['会員', ...memberRow],
    ['客員', ...regularRow],
    ['未信', ...seekerRow],
    ['ビジター', ...guestRow],
    ['大人(小4以上)', ...adultRow],
    ['小人(小3以下)', ...childRow],
    ['合計', ...totalRow],
    ['朝', ...totalRow], // 朝礼拝の合計（Synaxis では合計＝朝）
    ['夕', ...eveningRow],
  ];

  // 月平均（大人/小人/合計）。
  const byMonth = new Map<number, { a: number; c: number; t: number; n: number }>();
  sundays.forEach((e, i) => {
    const m = localYmd(e.starts_at)[1];
    const o = byMonth.get(m) ?? { a: 0, c: 0, t: 0, n: 0 };
    o.a += adultRow[i];
    o.c += childRow[i];
    o.t += totalRow[i];
    o.n += 1;
    byMonth.set(m, o);
  });
  summaryRows.push([]);
  summaryRows.push(['【月平均】']);
  summaryRows.push(['月', '大人', '小人', '合計']);
  [...byMonth.entries()]
    .sort((x, y) => x[0] - y[0])
    .forEach(([m, o]) => {
      const avg = (v: number) => Math.round((v / o.n) * 10) / 10;
      summaryRows.push([`${m}月`, avg(o.a), avg(o.c), avg(o.t)]);
    });

  const summaryTab: RosterTab = { title: 'まとめ', rows: summaryRows };

  // ── 特別礼拝タブ（special_worship）─────────────────────────────────────
  const specialRows: CsvCell[][] = [];
  const specials = events.filter((e) => e.kind === 'special_worship');
  if (specials.length === 0) {
    specialRows.push(['特別礼拝の記録はありません']);
  } else {
    for (const e of specials) {
      const date = zonedDateOf(e.starts_at, timezone);
      const attendees = people.filter((p) => came(p.id, e.id));
      specialRows.push([`${e.name}　${date}`]);
      specialRows.push(['出席者数', attendees.length]);
      specialRows.push(['#', 'お名前', '礼拝', '立場']);
      attendees.forEach((p, i) =>
        specialRows.push([
          i + 1,
          p.display_name,
          '○',
          RELATIONSHIP_LABELS[p.relationship_status],
        ]),
      );
      specialRows.push([]); // ブロック間の空行
    }
  }
  const specialTab: RosterTab = { title: '特別礼拝', rows: specialRows };

  return [summaryTab, ...categoryTabs, specialTab];
}
