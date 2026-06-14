/**
 * 旧プロトタイプ（church-attendance）の Supabase データを Synaxis の新スキーマへ移行する。
 * docs/PRODUCT_SPEC.md §12.1
 *
 * 既定は **dry-run**（書き込まない）。実行は `-- --apply` を付ける。
 *
 *   # 計画と件数照合だけ表示（安全）
 *   SOURCE_SUPABASE_URL=... SOURCE_SUPABASE_KEY=... TARGET_CHURCH_ID=... \
 *     npx tsx scripts/migrate-from-prototype.ts
 *
 *   # 実際に書き込む
 *   SOURCE_SUPABASE_URL=... SOURCE_SUPABASE_KEY=... TARGET_CHURCH_ID=... \
 *     npx tsx scripts/migrate-from-prototype.ts -- --apply
 *
 * 必要な環境変数:
 *   SOURCE_SUPABASE_URL / SOURCE_SUPABASE_KEY … 旧プロジェクト（読み取り）
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY … Synaxis（.env.local。書き込み＝管理鍵）
 *   TARGET_CHURCH_ID … 取り込み先の churches.id（先に作成しておく）
 *   CHURCH_TZ … 既定 'Asia/Tokyo'
 *
 * 安全策:
 *   - 既定 dry-run。--apply 指定時のみ書き込む。
 *   - 取り込み先教会に既に people があれば中止（二重取り込み防止＝再実行安全）。
 *   - 件数照合（people=members、attendance=旧attendance）を必ず出力。
 *   - 元データ（旧 DB）は読み取りのみ。変更しない。
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import ws from 'ws';
import { zonedDateTimeToUtcISO } from '../app/lib/datetime';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket ??= ws;
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const TZ = process.env.CHURCH_TZ ?? 'Asia/Tokyo';
const TARGET_CHURCH_ID = process.env.TARGET_CHURCH_ID!;
const SERVICE_TIME: Record<string, string> = { morning: '10:30', evening: '18:00' };

type OldCategory = 'member' | 'regular_visitor' | 'seeker' | 'child' | 'visitor';
const CATEGORY_MAP: Record<
  OldCategory,
  { relationship_status: string; age_group: string }
> = {
  member: { relationship_status: 'member', age_group: 'adult' },
  regular_visitor: { relationship_status: 'regular_attendee', age_group: 'adult' },
  seeker: { relationship_status: 'seeker', age_group: 'adult' },
  // child は年齢区分のみ確定。立場は移行時レビュー対象（暫定 member）。
  child: { relationship_status: 'member', age_group: 'child' },
  visitor: { relationship_status: 'guest', age_group: 'adult' },
};

function requireEnv() {
  const missing = [
    'SOURCE_SUPABASE_URL',
    'SOURCE_SUPABASE_KEY',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'TARGET_CHURCH_ID',
  ].filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('環境変数が不足:', missing.join(', '));
    process.exit(1);
  }
}

async function main() {
  requireEnv();
  console.log(`モード: ${APPLY ? '★ APPLY（書き込み）' : 'dry-run（書き込まない）'}`);
  console.log(`取り込み先 church_id: ${TARGET_CHURCH_ID} / tz: ${TZ}\n`);

  const source = createClient(
    process.env.SOURCE_SUPABASE_URL!,
    process.env.SOURCE_SUPABASE_KEY!,
    { auth: { persistSession: false } },
  );
  const target = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

  // 取り込み先教会の存在確認
  const { data: church, error: chErr } = await target
    .from('churches')
    .select('id, name')
    .eq('id', TARGET_CHURCH_ID)
    .maybeSingle();
  if (chErr || !church) {
    console.error('取り込み先 church が見つかりません。先に作成してください。');
    process.exit(1);
  }

  // 再実行ガード: 既に people があれば中止
  const { count: existing } = await target
    .from('people')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', TARGET_CHURCH_ID);
  if ((existing ?? 0) > 0) {
    console.error(
      `取り込み先に既に ${existing} 名います。二重取り込みを防ぐため中止します。`,
    );
    process.exit(1);
  }

  // ── 旧データ読み取り ───────────────────────────────────────────────
  const { data: members, error: mErr } = await source
    .from('members')
    .select('*');
  const { data: oldAttendance, error: aErr } = await source
    .from('attendance_records')
    .select('*');
  if (mErr || aErr || !members || !oldAttendance) {
    console.error('旧データの読み取りに失敗:', mErr?.message ?? aErr?.message);
    process.exit(1);
  }
  console.log(`旧 members: ${members.length} 件 / 旧 attendance: ${oldAttendance.length} 件`);

  // ── people 構築 ────────────────────────────────────────────────────
  const peopleRows = members.map((m) => {
    const map = CATEGORY_MAP[m.category as OldCategory] ?? {
      relationship_status: 'guest',
      age_group: 'unknown',
    };
    return {
      _oldId: m.id as string,
      church_id: TARGET_CHURCH_ID,
      display_name: m.name as string,
      furigana: (m.furigana as string | null) ?? null,
      relationship_status: map.relationship_status,
      age_group: map.age_group,
    };
  });

  // ── service_events 構築（distinct date+service_type）──────────────
  const eventKey = (d: string, t: string) => `${d}|${t}`;
  const eventMeta = new Map<string, { date: string; type: string; lunch: boolean }>();
  for (const a of oldAttendance) {
    const k = eventKey(a.date, a.service_type);
    const cur = eventMeta.get(k) ?? { date: a.date, type: a.service_type, lunch: false };
    if (a.has_lunch) cur.lunch = true;
    eventMeta.set(k, cur);
  }
  console.log(`生成する service_events: ${eventMeta.size} 件`);

  // child の立場レビュー候補を表示
  const childReview = peopleRows.filter((p) => p.age_group === 'child');
  if (childReview.length) {
    console.log(
      `\n⚠ relationship_status 要レビュー（child ${childReview.length} 名、暫定 member）:`,
    );
    childReview.forEach((p) => console.log(`   - ${p.display_name}`));
  }

  if (!APPLY) {
    console.log('\n— dry-run のため書き込みは行いませんでした。--apply で実行します。');
    return;
  }

  // ── 書き込み: people（1件ずつ id マップを作る）──────────────────────
  const oldToNewPerson = new Map<string, string>();
  for (const p of peopleRows) {
    const { _oldId, ...row } = p;
    const { data, error } = await target.from('people').insert(row).select('id').single();
    if (error || !data) {
      console.error(`people 挿入失敗 (${row.display_name}):`, error?.message);
      process.exit(1);
    }
    oldToNewPerson.set(_oldId, data.id as string);
  }

  // ── 書き込み: service_events ────────────────────────────────────────
  const keyToEventId = new Map<string, string>();
  for (const [k, meta] of eventMeta) {
    const kind = meta.type === 'morning' ? 'morning_worship' : 'evening_worship';
    const name = meta.type === 'morning' ? '主日朝礼拝' : '夕拝';
    const startsAt = zonedDateTimeToUtcISO(`${meta.date}T${SERVICE_TIME[meta.type]}`, TZ);
    const { data, error } = await target
      .from('service_events')
      .insert({
        church_id: TARGET_CHURCH_ID,
        kind,
        name,
        starts_at: startsAt,
        status: 'completed',
        counts_toward_attendance_rate: meta.type === 'morning',
        lunch_enabled: meta.lunch,
      })
      .select('id')
      .single();
    if (error || !data) {
      console.error(`service_event 挿入失敗 (${k}):`, error?.message);
      process.exit(1);
    }
    keyToEventId.set(k, data.id as string);
  }

  // ── 書き込み: attendance_records（チャンク bulk）────────────────────
  const attRows = oldAttendance.map((a) => ({
    church_id: TARGET_CHURCH_ID,
    service_event_id: keyToEventId.get(eventKey(a.date, a.service_type))!,
    person_id: oldToNewPerson.get(a.member_id)!,
    lunch_quantity: a.has_lunch ? 1 : 0,
    source: 'import' as const,
  }));
  const CHUNK = 500;
  let inserted = 0;
  for (let i = 0; i < attRows.length; i += CHUNK) {
    const chunk = attRows.slice(i, i + CHUNK);
    const { error } = await target.from('attendance_records').insert(chunk);
    if (error) {
      console.error('attendance 挿入失敗:', error.message);
      process.exit(1);
    }
    inserted += chunk.length;
  }

  // ── 件数照合 ────────────────────────────────────────────────────────
  const { count: newPeople } = await target
    .from('people')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', TARGET_CHURCH_ID);
  const { count: newAtt } = await target
    .from('attendance_records')
    .select('id', { count: 'exact', head: true })
    .eq('church_id', TARGET_CHURCH_ID);

  console.log('\n=== 件数照合 ===');
  console.log(`people:     旧 ${members.length}  → 新 ${newPeople}  ${members.length === newPeople ? '✓' : '✗ 不一致'}`);
  console.log(`attendance: 旧 ${oldAttendance.length}  → 新 ${newAtt}  ${oldAttendance.length === newAtt ? '✓' : '✗ 不一致'}`);
  console.log(`events 生成: ${eventMeta.size}`);
  if (members.length !== newPeople || oldAttendance.length !== inserted) {
    console.error('\n✗ 件数が一致しません。確認してください。');
    process.exit(1);
  }
  console.log('\n✓ 移行完了。件数一致。');
}

main();
