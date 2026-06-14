import { redirect } from 'next/navigation';

// ルートは受付画面へ誘導する。未認証なら保護ルート側でログインへ送られる。
export default function HomePage() {
  redirect('/check-in');
}
