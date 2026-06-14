'use client';

import { useEffect, useState } from 'react';
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
  { href: '/dashboard', label: '集計', icon: BarChart3, roles: ['owner', 'admin', 'receptionist', 'viewer'] },
  { href: '/people', label: '人物', icon: Users, roles: ['owner', 'admin', 'receptionist', 'viewer'] },
  { href: '/events', label: '礼拝', icon: CalendarDays, roles: ['owner', 'admin', 'receptionist', 'viewer'] },
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

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {churchName}
          </p>
          <p className="text-[11px] text-slate-400">
            Synaxis · {ROLE_LABELS[role]}
          </p>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Clock timezone={timezone} />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100"
              aria-label="ログアウト"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">ログアウト</span>
            </button>
          </form>
        </div>
      </div>

      <nav className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-2 pb-1 sm:px-4">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-[64px] flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                active
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
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
          <span className="block text-[11px] text-slate-400">{now.date}</span>
          <span className="block text-sm font-semibold text-slate-700">
            {now.time}
          </span>
        </>
      ) : (
        // 値が入る前の高さ確保（レイアウトシフト防止）
        <span className="block h-[30px] w-14" aria-hidden />
      )}
    </div>
  );
}
