import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPeriodReport, getAttendanceMatrix } from '../reports';
import { buildRosterTabs } from './roster';
import { yearBoundsUtc } from '../datetime';
import type { CsvCell } from '../csv';
import type { PeriodTotals } from '../types';

// Google Sheets 出力の値。添付エクセル（礼拝出席名簿）に近い構造：
//   まとめ / 会員 / 客員 / 未信 / 子ども / ビジター / 特別礼拝
// totals は API 応答（出力後の確認表示）用に同じ集計から算出。
export interface SheetTab {
  title: string;
  rows: CsvCell[][];
}
export interface SheetValues {
  tabs: SheetTab[];
  totals: PeriodTotals;
}

export async function buildSheetValues(
  supabase: SupabaseClient,
  churchId: string,
  timezone: string,
  year: number,
): Promise<SheetValues> {
  const bounds = yearBoundsUtc(year, timezone);
  // 年度出力は既定の「ユニーク（1日1人1回）」で集計する（totals 用）。
  const filter = {
    period: 'all' as const,
    kinds: [],
    ratedOnly: false,
    countMode: 'unique' as const,
  };

  const [report, matrix] = await Promise.all([
    getPeriodReport(supabase, churchId, timezone, filter, bounds),
    getAttendanceMatrix(supabase, churchId, filter, bounds),
  ]);

  return {
    tabs: buildRosterTabs(matrix, year, timezone),
    totals: report.totals,
  };
}
