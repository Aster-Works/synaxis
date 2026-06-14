// タイムゾーン対応の日付ユーティリティ（依存ライブラリなし）。
// docs では Asia/Tokyo を前提とするが、教会ごとに timezone を持てる設計。

// 指定タイムゾーンにおける、与えた瞬間の UTC オフセット（ミリ秒）。
function tzOffsetMs(timeZone: string, date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  // 24:00 を 00:00 に正規化（一部環境で hour=24 になる）
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    hour,
    map.minute,
    map.second,
  );
  return asUtc - date.getTime();
}

export interface DayBounds {
  /** その教会のローカル「今日」0:00 に対応する UTC 瞬間 */
  startUtc: Date;
  /** 翌日0:00 に対応する UTC 瞬間 */
  endUtc: Date;
  /** ローカル日付 YYYY-MM-DD */
  localDate: string;
}

// 指定タイムゾーンの「today」の UTC 範囲を返す。
export function zonedDayBoundsUtc(timeZone: string, base: Date = new Date()): DayBounds {
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(base); // "YYYY-MM-DD"

  const midnightAsUtc = new Date(`${localDate}T00:00:00Z`);
  const offset = tzOffsetMs(timeZone, midnightAsUtc);
  const startUtc = new Date(midnightAsUtc.getTime() - offset);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc, localDate };
}

// 礼拝の開始時刻を「HH:MM」でタイムゾーン表示する。
export function formatTimeInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

// datetime-local の入力（"YYYY-MM-DDTHH:MM"、タイムゾーンのローカル時刻とみなす）を
// UTC の ISO 文字列へ変換する。
export function zonedDateTimeToUtcISO(local: string, timeZone: string): string {
  // まず UTC として解釈し、その瞬間における tz オフセットで補正する。
  const asUtc = new Date(`${local}:00Z`);
  const offset = tzOffsetMs(timeZone, asUtc);
  return new Date(asUtc.getTime() - offset).toISOString();
}

// 指定タイムゾーンでのローカル日付 YYYY-MM-DD。
export function zonedDateOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

// 教会ローカルでの「週初め」YYYY-MM-DD（weekStartsOn=0 で日曜起点）。
// 推移グラフの週バケットに使う。UTC ではなくローカル日付から算出する。
export function zonedWeekStart(iso: string, timeZone: string, weekStartsOn = 0): string {
  const d = zonedDateOf(iso, timeZone);
  const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
  const diff = (dow - weekStartsOn + 7) % 7;
  const ws = new Date(`${d}T00:00:00Z`);
  ws.setUTCDate(ws.getUTCDate() - diff);
  return ws.toISOString().slice(0, 10);
}

// 指定タイムゾーンの暦年 [year-01-01, (year+1)-01-01) を UTC ISO 範囲で返す。
// Google Sheets 出力の年度スコープに使う。
export function yearBoundsUtc(
  year: number,
  timeZone: string,
): { sinceISO: string; untilISO: string } {
  return {
    sinceISO: zonedDateTimeToUtcISO(`${year}-01-01T00:00`, timeZone),
    untilISO: zonedDateTimeToUtcISO(`${year + 1}-01-01T00:00`, timeZone),
  };
}

// UTC 時刻を教会ローカルの「年」に変換する。
export function zonedYearOf(iso: string, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric' }).format(new Date(iso)),
  );
}

// 礼拝の日付を「M月D日(曜)」で表示する。
export function formatDateInZone(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date(iso));
}
