'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/app/lib/supabase/server';
import { createChurchSchema } from '@/app/lib/validation';
import { ACTIVE_CHURCH_COOKIE } from '@/app/lib/auth';

export interface OnboardingState {
  error?: string;
}

export async function createChurchAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = createChurchSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '入力が正しくありません' };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // 原子的に教会＋owner所属を作成する security definer RPC。
  const { data: churchId, error } = await supabase.rpc('create_church', {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });

  if (error) {
    if (error.code === '23505') {
      return { error: 'その slug は既に使われています。別の値にしてください。' };
    }
    return { error: '教会の作成に失敗しました。時間をおいて再度お試しください。' };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_CHURCH_COOKIE, churchId as string, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });

  redirect('/check-in');
}
