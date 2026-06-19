import 'server-only';
import { google } from 'googleapis';
import type { SupabaseClient } from '@supabase/supabase-js';
import { oauthClient } from './oauth';
import { buildSheetValues } from './sheets-report';
import type { PeriodTotals } from '../types';

// トークン復号と Sheets 書込の中核。平文 refresh_token はこのモジュール内に
// 一過性で存在するだけで、戻り値・JSON レスポンス・クライアントには出さない。

export class GoogleAuthExpiredError extends Error {}

// Google API 呼び出しの失敗を、診断情報（HTTPステータス・reason・message）付きで
// 上位（API ルート）へ伝える。reason 例: SERVICE_DISABLED（API 未有効化）、
// ACCESS_TOKEN_SCOPE_INSUFFICIENT（スコープ不足）。トークン等の機微情報は含めない。
export interface GoogleErrorInfo {
  httpStatus?: number;
  reason?: string;
  message?: string;
}
export class GoogleExportError extends Error {
  detail: GoogleErrorInfo;
  constructor(detail: GoogleErrorInfo) {
    super(detail.message ?? 'Google 出力に失敗しました');
    this.detail = detail;
  }
}

// gaxios / googleapis のエラーから診断情報を取り出す。
// - OAuth トークンエンドポイント形式: response.data.error は文字列（invalid_grant 等）
// - Google API(v4) 形式: response.data.error はオブジェクト { code,message,status,errors[],details[] }
function parseGoogleError(e: unknown): GoogleErrorInfo {
  const err = e as {
    code?: number | string;
    status?: number;
    message?: string;
    response?: {
      status?: number;
      data?: { error?: unknown; error_description?: string };
    };
  };
  const httpStatus =
    err?.response?.status ??
    (typeof err?.code === 'number' ? err.code : undefined) ??
    err?.status;
  const dataErr = err?.response?.data?.error;
  if (typeof dataErr === 'string') {
    return {
      httpStatus,
      reason: dataErr,
      message: err.response?.data?.error_description ?? dataErr,
    };
  }
  if (dataErr && typeof dataErr === 'object') {
    const o = dataErr as {
      message?: string;
      status?: string;
      errors?: { reason?: string }[];
      details?: { reason?: string }[];
    };
    const reason =
      o.errors?.find((x) => x.reason)?.reason ??
      o.details?.find((x) => x.reason)?.reason ??
      o.status;
    return { httpStatus, reason, message: o.message };
  }
  return { httpStatus, message: err?.message };
}

function encKey(): string {
  const k = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!k) throw new Error('GOOGLE_TOKEN_ENC_KEY が未設定です');
  return k;
}

// ユーザー文脈（publishable + Cookie）の supabase で復号 RPC を呼ぶ。service_role 不使用。
async function authedClientFor(supabase: SupabaseClient, churchId: string) {
  const { data: refreshToken, error } = await supabase.rpc('read_google_refresh_token', {
    p_church: churchId,
    p_enc_key: encKey(),
  });
  if (error) throw error;
  if (!refreshToken) return null; // 未接続
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken as string }); // 平文はこのスコープ内のみ
  return client;
}

export interface ExportResult {
  connected: boolean;
  spreadsheetUrl?: string;
  totals?: PeriodTotals;
}

export async function runSheetsExport(
  supabase: SupabaseClient,
  churchId: string,
  timezone: string,
  year: number,
): Promise<ExportResult> {
  try {
    const auth = await authedClientFor(supabase, churchId);
    if (!auth) return { connected: false };

    const values = await buildSheetValues(supabase, churchId, timezone, year);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sheets = google.sheets({ version: 'v4', auth: auth as any });

    const { data: existingId } = await supabase.rpc('get_google_spreadsheet_id', {
      p_church: churchId,
      p_year: year,
    });
    let sid = existingId as string | null;

    if (!sid) {
      const created = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: `礼拝出席 ${year}年 (Synaxis)` },
          sheets: values.tabs.map((t) => ({ properties: { title: t.title } })),
        },
      });
      sid = created.data.spreadsheetId ?? null;
      if (!sid) throw new Error('spreadsheet 作成に失敗しました');
      await supabase.rpc('set_google_spreadsheet_id', {
        p_church: churchId,
        p_year: year,
        p_spreadsheet_id: sid,
      });
    } else {
      // 既存ファイルに無いタブを追加（タブ構成の変更に追従。旧タブは残置）。
      const meta = await sheets.spreadsheets.get({
        spreadsheetId: sid,
        fields: 'sheets.properties.title',
      });
      const existing = new Set(
        (meta.data.sheets ?? []).map((s) => s.properties?.title),
      );
      const toAdd = values.tabs.filter((t) => !existing.has(t.title));
      if (toAdd.length > 0) {
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: sid,
          requestBody: {
            requests: toAdd.map((t) => ({
              addSheet: { properties: { title: t.title } },
            })),
          },
        });
      }
    }
    // 各タブを全置換（同一年度は既存ファイルを更新。減った行が残らないよう clear）
    for (const tab of values.tabs) {
      await sheets.spreadsheets.values.clear({ spreadsheetId: sid, range: `'${tab.title}'` });
      await sheets.spreadsheets.values.update({
        spreadsheetId: sid,
        range: `'${tab.title}'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: tab.rows as (string | number | null)[][] },
      });
    }

    return {
      connected: true,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${sid}/edit`,
      totals: values.totals,
    };
  } catch (e: unknown) {
    const info = parseGoogleError(e);
    // 真因をサーバログに残す（本番デバッグ用。トークン等の機微情報は含めない）。
    console.error('[google-sheets] 出力失敗', { churchId, year, ...info });
    // refresh_token 失効（接続解除/取消）→ 再接続誘導
    if (info.reason === 'invalid_grant') throw new GoogleAuthExpiredError();
    throw new GoogleExportError(info);
  }
}

// 接続解除時のベストエフォート revoke（失敗は無視）。
export async function revokeRefreshToken(supabase: SupabaseClient, churchId: string) {
  try {
    const { data: rt } = await supabase.rpc('read_google_refresh_token', {
      p_church: churchId,
      p_enc_key: encKey(),
    });
    if (rt) await oauthClient().revokeToken(rt as string);
  } catch {
    /* 失効済み等は無視。DB 側の削除は呼び出し元が確実に行う */
  }
}
