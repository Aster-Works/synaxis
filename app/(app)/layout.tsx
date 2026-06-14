import { redirect } from 'next/navigation';
import { getCurrentUser, getActiveChurch } from '@/app/lib/auth';
import { Nav } from '@/app/components/Nav';

// 認証済みアプリのシェル。未認証 → ログイン、所属教会なし → オンボーディング。
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 認証ユーザーと所属教会は互いに独立に取得できる（所属クエリは RLS で絞られる）。
  // 直列にせず並列で取り、ナビ毎の往復を1段に減らす。
  const [user, active] = await Promise.all([
    getCurrentUser(),
    getActiveChurch(),
  ]);
  if (!user) redirect('/login');
  if (!active) redirect('/onboarding');

  return (
    <div className="min-h-dvh">
      <Nav
        churchName={active.church.name}
        role={active.role}
        timezone={active.church.timezone}
      />
      <main className="mx-auto w-full max-w-5xl px-3 pb-24 pt-4 sm:px-5">
        {children}
      </main>
    </div>
  );
}
