import { describe, it, expect } from 'vitest';
import {
  zonedDayBoundsUtc,
  zonedDateTimeToUtcISO,
  formatTimeInZone,
} from '@/app/lib/datetime';

describe('zonedDayBoundsUtc (Asia/Tokyo, UTC+9)', () => {
  it('JST の「今日」0:00 は UTC では前日15:00', () => {
    // 2026-06-14 12:00 JST 時点
    const base = new Date('2026-06-14T03:00:00Z'); // = 2026-06-14 12:00 JST
    const { startUtc, endUtc, localDate } = zonedDayBoundsUtc('Asia/Tokyo', base);
    expect(localDate).toBe('2026-06-14');
    expect(startUtc.toISOString()).toBe('2026-06-13T15:00:00.000Z');
    expect(endUtc.toISOString()).toBe('2026-06-14T15:00:00.000Z');
  });

  it('JST 深夜（UTCでは前日昼）でも同じローカル日になる', () => {
    const base = new Date('2026-06-13T16:00:00Z'); // = 2026-06-14 01:00 JST
    const { localDate } = zonedDayBoundsUtc('Asia/Tokyo', base);
    expect(localDate).toBe('2026-06-14');
  });
});

describe('zonedDateTimeToUtcISO', () => {
  it('JST のローカル日時を UTC へ変換する', () => {
    expect(zonedDateTimeToUtcISO('2026-06-14T10:30', 'Asia/Tokyo')).toBe(
      '2026-06-14T01:30:00.000Z',
    );
  });
});

describe('formatTimeInZone', () => {
  it('UTC の時刻を JST の HH:MM で表示する', () => {
    expect(formatTimeInZone('2026-06-14T01:30:00.000Z', 'Asia/Tokyo')).toBe(
      '10:30',
    );
  });
});
