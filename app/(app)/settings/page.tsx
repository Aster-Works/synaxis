import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { ROLE_LABELS, type Role } from '@/app/lib/types';
import { zonedYearOf } from '@/app/lib/datetime';
import { GoogleIntegrationCard } from './GoogleIntegrationCard';

interface MemberRow {
  user_id: string;
  role: Role;
  display_name: string | null;
}

export default async function SettingsPage() {
  const active = await getActiveChurch();
  if (!active) return null;
  if (!['owner', 'admin'].includes(active.role)) redirect('/check-in');

  const supabase = await createSupabaseServerClient();
  // church_memberships→profiles は直接 FK が無く PostgREST 埋め込みが効かないため、
  // メンバーと profiles を別々に取得して JS で結合する（profiles の RLS は
  // 教会を共有する相手の表示名を許可している）。
  const { data: mData } = await supabase
    .from('church_memberships')
    .select('user_id, role')
    .eq('church_id', active.church_id);
  const memberRows = (mData ?? []) as { user_id: string; role: Role }[];
  const userIds = memberRows.map((m) => m.user_id);
  const { data: profs } = userIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.display_name]));
  const members: MemberRow[] = memberRows.map((m) => ({
    user_id: m.user_id,
    role: m.role,
    display_name: nameById.get(m.user_id) ?? null,
  }));

  // Google 連携の状態（メール・接続日時のみ。トークンは取得しない）。
  const { data: gStatus } = await supabase.rpc('get_google_integration_status', {
    p_church: active.church_id,
  });
  const googleRow = (gStatus ?? [])[0] as { google_account_email: string | null } | undefined;
  const currentYear = zonedYearOf(new Date().toISOString(), active.church.timezone);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-slate-900">設定</h1>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">教会</h2>
        <dl className="space-y-2 text-sm">
          <Row label="教会名" value={active.church.name} />
          <Row label="識別子" value={active.church.slug} />
          <Row label="タイムゾーン" value={active.church.timezone} />
          <Row label="子ども区分の表示名" value={active.church.child_label} />
        </dl>
      </section>

      <Suspense fallback={null}>
        <GoogleIntegrationCard
          connected={!!googleRow}
          email={googleRow?.google_account_email ?? null}
          currentYear={currentYear}
        />
      </Suspense>

      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-500">
          メンバー（{members.length}名）
        </h2>
        <ul className="space-y-2">
          {members.map((m) => (
            <li
              key={m.user_id}
              className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm"
            >
              <span className="text-slate-800">
                {m.display_name ?? '（表示名未設定）'}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                {ROLE_LABELS[m.role]}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          ユーザー招待・ロール変更・課金は後続 Phase で実装します（owner のみ）。
        </p>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}
