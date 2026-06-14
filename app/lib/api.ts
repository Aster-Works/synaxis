import 'server-only';
import { NextResponse } from 'next/server';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from './supabase/server';

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
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
