-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ ローカル開発用シード（postgres として実行＝RLS バイパス）              ║
-- ║                                                                        ║
-- ║  - デモ教会「サンプル教会」と人物・本日の礼拝イベントを投入する。      ║
-- ║  - membership（誰がこの教会に属するか）は付けない。                    ║
-- ║    開発者は `npm run db:seed:dev`（scripts/seed-dev.ts）で自分の        ║
-- ║    dev ユーザーを owner として紐づけるか、アプリのオンボーディングで    ║
-- ║    自分の教会を新規作成する。                                          ║
-- ║  - 固定 UUID で冪等。`npm run db:reset` で再投入できる。                ║
-- ╚══════════════════════════════════════════════════════════════════════╝

insert into public.churches (id, name, slug, timezone, child_label)
values ('00000000-0000-0000-0000-0000000000c1', 'サンプル教会', 'sample', 'Asia/Tokyo', '子ども')
on conflict (id) do nothing;

insert into public.people (id, church_id, display_name, furigana, relationship_status, age_group, first_visit_on)
values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', '山田 太郎',   'やまだ たろう',   'member',           'adult', '2018-04-01'),
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c1', '山田 花子',   'やまだ はなこ',   'member',           'adult', '2018-04-01'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-0000000000c1', '佐藤 めぐみ', 'さとう めぐみ',   'regular_attendee', 'adult', '2021-09-12'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-0000000000c1', '鈴木 健',     'すずき けん',     'seeker',           'adult', '2025-11-02'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-0000000000c1', '山田 みこと', 'やまだ みこと',   'member',           'child', '2019-05-05'),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-0000000000c1', '高橋 あゆみ', 'たかはし あゆみ', 'guest',            'adult', null)
on conflict (id) do nothing;

-- 本日の朝礼拝（受付中・出席率の分母に含める・昼食あり）と夕拝
insert into public.service_events
  (id, church_id, kind, name, starts_at, status, counts_toward_attendance_rate, lunch_enabled)
values
  -- starts_at は UTC 保存。Asia/Tokyo(UTC+9) で朝礼拝 10:30 / 夕拝 18:00 になるよう調整。
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1', 'morning_worship', '主日朝礼拝',
   date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo' + interval '10 hours 30 minutes', 'open',  true,  true),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c1', 'evening_worship', '夕拝',
   date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo' + interval '18 hours',            'scheduled', true, false)
on conflict (id) do nothing;
