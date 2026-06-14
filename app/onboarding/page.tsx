import { redirect } from 'next/navigation';
import { getCurrentUser, getMemberships } from '@/app/lib/auth';
import { OnboardingForm } from './OnboardingForm';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // 既に教会へ所属していれば受付へ。
  const memberships = await getMemberships();
  if (memberships.length > 0) redirect('/check-in');

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          教会を作成
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          まず、あなたの教会を登録します。あなたはこの教会のオーナーになります。
        </p>
      </div>
      <OnboardingForm />
    </div>
  );
}
