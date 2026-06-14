import { redirect } from 'next/navigation';
import { getCurrentUser, getActiveChurch } from '@/app/lib/auth';
import { Nav } from '@/app/components/Nav';

// 認証済みアプリのシェル。未認証 → ログイン、所属教会なし → オンボーディング。
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const active = await getActiveChurch();
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
