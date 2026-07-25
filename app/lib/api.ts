import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from './supabase/server';

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// Postgres/PostgREST のエラーを「恒久(4xx) / 一時(503)」へ写像する。
// 受付のオフラインキューは 403/404/422 を受けると希望状態を破棄し、5xx は再送する
// （useReceptionSync）。一時障害まで 403 で返すと出席が無言で失われるため、
// 既知の恒久エラーコードだけを 4xx にし、それ以外（接続断・タイムアウト等）は 503 を返す。
export function dbErrorStatus(error: { code?: string | null } | null | undefined): number {
  // PostgREST 自身のエラー（PGRST116=0行/ PGRST204=列が無い/ PGRST301=JWT失効 など）は
  // 再送しても直らない。503 に落とすとクライアントが 2.5 秒間隔で無限再送する。
  if (error?.code?.startsWith('PGRST')) return 422;

  switch (error?.code) {
    case '42501': // RLS / 権限不足
    case 'P0001': // トリガー raise（church_id 整合など）
      return 403;
    case '23503': // FK 違反（人物・礼拝が存在しない）
      return 404;
    case '22P02': // 不正な UUID などの構文エラー
    case '23514': // CHECK 違反（昼食 0.5 刻みなど）
    case '23505': // 一意制約違反
      return 422;
    default:
      return 503;
  }
}

// API のコンテキスト。user が null なら未認証。
export async function getApiContext(): Promise<{
  supabase: SupabaseClient;
  user: User | null;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}
