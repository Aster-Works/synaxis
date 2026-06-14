import { redirect } from 'next/navigation';
import { getActiveChurch } from '@/app/lib/auth';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { ROLE_LABELS, type Role } from '@/app/lib/types';

interface MemberRow {
  user_id: string;
  role: Role;
  profile: { display_name: string | null } | null;
}

export default async function SettingsPage() {
  const active = await getActiveChurch();
  if (!active) return null;
  if (!['owner', 'admin'].includes(active.role)) redirect('/check-in');

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from('church_memberships')
    .select('user_id, role, profile:profiles(display_name)')
    .eq('church_id', active.church_id);
  const members = (data ?? []) as unknown as MemberRow[];

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
                {m.profile?.display_name ?? '（表示名未設定）'}
              </span>
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                {ROLE_LABELS[m.role]}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-400">
          ユーザー招待・ロール変更・Google 連携・課金は後続 Phase
          で実装します（owner のみ）。
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
