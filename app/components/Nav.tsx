'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarCheck,
  BarChart3,
  Users,
  CalendarDays,
  Settings,
  LogOut,
} from 'lucide-react';
import { ROLE_LABELS, type Role } from '@/app/lib/types';
import { formatDateInZone, formatTimeInZone } from '@/app/lib/datetime';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/check-in', label: '受付', icon: CalendarCheck, roles: ['owner', 'admin', 'receptionist'] },
  { href: '/people', label: '名簿', icon: Users, roles: ['owner', 'admin', 'receptionist', 'viewer'] },
  { href: '/events', label: '礼拝', icon: CalendarDays, roles: ['owner', 'admin', 'receptionist', 'viewer'] },
  { href: '/dashboard', label: '集計', icon: BarChart3, roles: ['owner', 'admin', 'receptionist', 'viewer'] },
  { href: '/settings', label: '設定', icon: Settings, roles: ['owner', 'admin'] },
];

export function Nav({
  churchName,
  role,
  timezone,
}: {
  churchName: string;
  role: Role;
  timezone: string;
}) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => item.roles.includes(role));

  // 受付一覧の sticky はこのヘッダーの真下に貼り付く。高さは画面幅（1段/2段）や
  // 端末の文字サイズ設定で変わるため、実測値を CSS 変数で配る（px 直書きだと
  // ずれて一覧の先頭がヘッダーに隠れる）。
  const headerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const apply = () =>
      document.documentElement.style.setProperty(
        '--nav-h',
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // タブは sm 以上でヘッダー1行に収める（受付一覧に使える高さを稼ぐ）。
  // スマホは横幅が足りないので従来どおり2段目に置き、横スクロールさせる。
  const tabs = (
    <div className="flex w-max gap-1">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-500 hover:bg-slate-100'
            }`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-3 py-1.5 sm:px-5">
        <div className="min-w-0 shrink">
          <p className="truncate text-sm font-semibold leading-tight text-slate-900">
            {churchName}
          </p>
          <p className="truncate text-[11px] leading-tight text-slate-400">
            Synaxis · {ROLE_LABELS[role]}
          </p>
        </div>

        {/* sm 以上：タブをヘッダー内に格納 */}
        <nav className="hidden min-w-0 flex-1 justify-center overflow-x-auto sm:flex">
          {tabs}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
          <Clock timezone={timezone} />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
              aria-label="ログアウト"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden lg:inline">ログアウト</span>
            </button>
          </form>
        </div>
      </div>

      {/* スマホのみ：タブを2段目に（1行に5つは入らないため） */}
      <nav className="mx-auto w-full max-w-6xl overflow-x-auto px-2 pb-1 sm:hidden">
        <div className="mx-auto w-max">{tabs}</div>
      </nav>
    </header>
  );
}

// 教会のタイムゾーンで「その日の日付と時間」を表示する時計。
// SSR では空（マウント後に値を入れる）＝ハイドレーション不整合を避ける。
function Clock({ timezone }: { timezone: string }) {
  const [now, setNow] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    const tick = () => {
      const iso = new Date().toISOString();
      setNow({
        date: formatDateInZone(iso, timezone),
        time: formatTimeInZone(iso, timezone),
      });
    };
    tick();
    // 分境界のずれを抑えるため 10 秒ごとに更新（表示は HH:MM）。
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, [timezone]);

  return (
    <div
      className="text-right leading-tight tabular-nums"
      aria-live="off"
      suppressHydrationWarning
    >
      {now ? (
        <>
          {/* 日付は場所を取るので広い画面でのみ。時刻は常時（受付で使う）。 */}
          <span className="hidden text-[11px] text-slate-400 lg:block">
            {now.date}
          </span>
          <span className="block text-sm font-semibold text-slate-700">
            {now.time}
          </span>
        </>
      ) : (
        // 値が入る前の高さ確保（レイアウトシフト防止）
        <span className="block h-[18px] w-10 lg:h-[30px] lg:w-14" aria-hidden />
      )}
    </div>
  );
}
