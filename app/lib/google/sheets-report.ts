import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPeriodReport, getPeopleStats, getAttendanceMatrix } from '../reports';
import {
  buildSummaryRows,
  buildMatrixRows,
  buildGuestsRows,
  buildPeopleRows,
} from '../export-csv';
import { yearBoundsUtc } from '../datetime';
import type { CsvCell } from '../csv';
import type { PeriodTotals } from '../types';

// Google Sheets 出力の値（4タブ）。CSV と同じビルダー・同じ集計を共有するため、
// 画面・CSV・Sheets の主要合計が一致する（ROADMAP Phase3 完了条件）。
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
  // 年度出力は既定の「ユニーク（1日1人1回）」で集計する。
  const filter = {
    period: 'all' as const,
    kinds: [],
    ratedOnly: false,
    countMode: 'unique' as const,
  };

  const report = await getPeriodReport(supabase, churchId, timezone, filter, bounds);
  const { people } = await getPeopleStats(supabase, churchId, timezone, filter, bounds);
  const matrix = await getAttendanceMatrix(supabase, churchId, filter, bounds);

  return {
    tabs: [
      { title: 'まとめ', rows: buildSummaryRows(report, timezone) },
      {
        title: '出席マトリクス',
        rows: buildMatrixRows(matrix.events, matrix.people, matrix.present, timezone),
      },
      { title: 'ゲスト', rows: buildGuestsRows(people) },
      { title: '人物一覧', rows: buildPeopleRows(people) },
    ],
    totals: report.totals,
  };
}
