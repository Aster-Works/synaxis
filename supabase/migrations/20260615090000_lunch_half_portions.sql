-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ 0010 lunch_half_portions                                                ║
-- ║ 昼食数を「少なめ」(0.5) も選べるよう 0.5 刻みに対応する。              ║
-- ║                                                                        ║
-- ║ 方針                                                                   ║
-- ║  - attendance_records.lunch_quantity を smallint → numeric(4,1) へ。   ║
-- ║    smallint の整数値は numeric にそのまま収まるため無損失・追加型。     ║
-- ║  - 0.5 刻み(half-step)を DB でも保証する CHECK を追加（Zod と二重化）。 ║
-- ║  - 既存の「>= 0」CHECK は型変更後もそのまま残る。                       ║
-- ║ ロールバック:                                                          ║
-- ║   alter table public.attendance_records                                ║
-- ║     drop constraint if exists attendance_records_lunch_half_step;       ║
-- ║   alter table public.attendance_records                                ║
-- ║     alter column lunch_quantity type smallint                          ║
-- ║     using round(lunch_quantity)::smallint;  -- 0.5 は四捨五入で失われる ║
-- ╚══════════════════════════════════════════════════════════════════════╝

alter table public.attendance_records
  alter column lunch_quantity type numeric(4, 1)
  using lunch_quantity::numeric(4, 1);

-- 0.5 刻み（0, 0.5, 1, 1.5, …）以外を弾く。乗算で整数判定。
alter table public.attendance_records
  drop constraint if exists attendance_records_lunch_half_step;
alter table public.attendance_records
  add constraint attendance_records_lunch_half_step
  check ((lunch_quantity * 2) = trunc(lunch_quantity * 2));
