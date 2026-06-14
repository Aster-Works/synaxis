import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from './supabase/server';
import type { Church, Role } from './types';

export const ACTIVE_CHURCH_COOKIE = 'synaxis_church';

export interface Membership {
  church_id: string;
  role: Role;
  church: Church;
}

// 認証済みユーザー（Supabase Auth サーバーで検証済み）。未認証なら null。
// cache() で同一リクエスト内の重複呼び出しをまとめる。
export const getCurrentUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// 現在ユーザーが所属する教会とロールの一覧。RLS により自分の所属のみ返る。
export const getMemberships = cache(async (): Promise<Membership[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('church_memberships')
    .select('church_id, role, church:churches(*)')
    .order('created_at', { ascending: true });

  if (error || !data) return [];

  return data
    .filter((row) => row.church)
    .map((row) => ({
      church_id: row.church_id as string,
      role: row.role as Role,
      church: row.church as unknown as Church,
    }));
});

// アクティブな教会（Cookie 優先、なければ最初の所属）。所属が無ければ null。
export const getActiveChurch = cache(async (): Promise<Membership | null> => {
  const memberships = await getMemberships();
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const preferredId = cookieStore.get(ACTIVE_CHURCH_COOKIE)?.value;
  if (preferredId) {
    const match = memberships.find((m) => m.church_id === preferredId);
    if (match) return match;
  }
  return memberships[0];
});

// 指定ロールを満たすか（owner は常に最上位として許可に含める運用は呼び出し側で指定）
export function hasRole(membership: Membership | null, roles: Role[]): boolean {
  return !!membership && roles.includes(membership.role);
}
