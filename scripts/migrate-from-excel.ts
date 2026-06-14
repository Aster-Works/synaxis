/**
 * 現行Excel（extract-excel.py が生成した中間JSON）→ Synaxis 新スキーマ移行。
 * docs/PRODUCT_SPEC.md §12.2
 *
 * 手順:
 *   1. python3 scripts/extract-excel.py            # 中間JSON生成（読み取り専用）
 *   2. dry-run（書き込まない・計画と件数照合のみ）:
 *        TARGET_CHURCH_ID=... npx tsx scripts/migrate-from-excel.ts
 *   3. 実行:
 *        TARGET_CHURCH_ID=... npx tsx scripts/migrate-from-excel.ts -- --apply
 *
 * 必要な環境変数: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY (.env.local),
 *   TARGET_CHURCH_ID（先に churches を作成）, CHURCH_TZ（既定 Asia/Tokyo）。
 *
 * 安全策: 既定 dry-run。--apply 時のみ書き込む。取り込み先に既に people があれば中止
 * （再実行ガード）。件数・合計照合を出力。元Excel/中間JSONは読み取りのみ・変更しない。
 * 人名の重複・表記揺れは自動統合せず候補として警告する（管理者が後で人物統合）。
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import ws from 'ws';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { normalizeName } from '../app/lib/dedupe';
import { zonedDateTimeToUtcISO } from '../app/lib/datetime';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).WebSocket ??= ws;
config({ path: '.env.local' });

const APPLY = process.argv.includes('--apply');
const TZ = process.env.CHURCH_TZ ?? 'Asia/Tokyo';
const TARGET = process.env.TARGET_CHURCH_ID!;
const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = process.argv.find((a) => a.endsWith('.json')) ??
  resolve(__dirname, '_artifacts', 'excel-extract.json');

// 特別礼拝の立場ラベル → relationship/age
const STATUS_MAP: Record<string, { relationship: string; ageGroup: string }> = {
  会員: { relationship: 'member', ageGroup: 'adult' },
  客員: { relationship: 'regular_attendee', ageGroup: 'adult' },
  未信: { relationship: 'seeker', ageGroup: 'adult' },
  子ども: { relationship: 'member', ageGroup: 'child' },
  ビジター: { relationship: 'guest', ageGroup: 'adult' },
};

interface RosterPerson {
  name: string;
  relationship: string;
  ageGroup: string;
  attendanceDates: string[];
}
interface Extract {
  source: string;
  weeklyDates: string[];
  rosters: { sheet: string; relationship: string; ageGroup: string; people: RosterPerson[] }[];
  special: { eventName: string; date: string; kind: string; attendees: { name: string; status: string }[] }[];
}

function requireEnv() {
  const missing = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'TARGET_CHURCH_ID'].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    console.error('環境変数が不足:', missing.join(', '));
    process.exit(1);
  }
}

async function main() {
  requireEnv();
  const data = JSON.parse(readFileSync(JSON_PATH, 'utf-8')) as Extract;

  const allRoster = data.rosters.flatMap((r) => r.people);
  const totalMarks = allRoster.reduce((s, p) => s + p.attendanceDates.length, 0);
  const totalSpecial = data.special.reduce((s, e) => s + e.attendees.length, 0);

  console.log(`モード: ${APPLY ? '★ APPLY（書き込み）' : 'dry-run（書き込まない）'}`);
  console.log(`JSON: ${JSON_PATH}（source=${data.source}）`);
  console.log(`取り込み先 church_id: ${TARGET} / tz: ${TZ}`);
  console.log(
    `roster人物=${allRoster.length} 週次礼拝=${data.weeklyDates.length} ○=${totalMarks} ` +
      `特別礼拝=${data.special.length} 特別出席=${totalSpecial}`,
  );

  // 同名（正規化一致）の候補警告（自動統合しない）
  const byNorm = new Map<string, string[]>();
  for (const p of allRoster) {
    const k = normalizeName(p.name);
    byNorm.set(k, [...(byNorm.get(k) ?? []), p.name]);
  }
  const dupCandidates = [...byNorm.values()].filter((v) => v.length > 1);
  if (dupCandidates.length) {
    console.log(`\n⚠ 同名候補（自動統合しない・移行後に人物統合で確認）:`);
    dupCandidates.forEach((v) => console.log(`   - ${v.join(' / ')}`));
  }
  const childReview = allRoster.filter((p) => p.ageGroup === 'child');
  console.log(`⚠ relationship 要レビュー（子ども ${childReview.length}名・暫定 member）`);

  if (!APPLY) {
    console.log('\n— dry-run のため DB へ接続・書き込みしません。--apply で実行します。');
    return;
  }

  const target = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: church } = await target
    .from('churches').select('id').eq('id', TARGET).maybeSingle();
  if (!church) {
    console.error('取り込み先 church が見つかりません。先に作成してください。');
    process.exit(1);
  }
  const { count: existing } = await target
    .from('people').select('id', { count: 'exact', head: true }).eq('church_id', TARGET);
  if ((existing ?? 0) > 0) {
    console.error(`取り込み先に既に ${existing} 名います。二重取り込み防止のため中止します。`);
    process.exit(1);
  }

  // 1) 週次礼拝イベント（主日朝礼拝・出席率対象）
  const weeklyRows = data.weeklyDates.map((d) => ({
    church_id: TARGET, kind: 'morning_worship', name: '主日朝礼拝',
    starts_at: zonedDateTimeToUtcISO(`${d}T10:30`, TZ), status: 'completed',
    counts_toward_attendance_rate: true, lunch_enabled: false,
  }));
  const { data: weeklyEvents, error: weErr } = await target
    .from('service_events').insert(weeklyRows).select('id, starts_at');
  if (weErr || !weeklyEvents) { console.error('週次礼拝の作成に失敗:', weErr?.message); process.exit(1); }
  const dateToEvent = new Map<string, string>();
  for (const e of weeklyEvents) {
    dateToEvent.set(zoned(e.starts_at), e.id);
  }

  // 2) 特別礼拝イベント（出席率対象外）
  const specialRows = data.special.map((e) => ({
    church_id: TARGET, kind: 'special_worship', name: e.eventName,
    starts_at: zonedDateTimeToUtcISO(`${e.date}T10:00`, TZ), status: 'completed',
    counts_toward_attendance_rate: false, lunch_enabled: false,
  }));
  const specEventByDate = new Map<string, string>();
  if (specialRows.length) {
    const { data: se, error: seErr } = await target
      .from('service_events').insert(specialRows).select('id, starts_at');
    if (seErr || !se) { console.error('特別礼拝の作成に失敗:', seErr?.message); process.exit(1); }
    for (const e of se) specEventByDate.set(zoned(e.starts_at), e.id);
  }

  // 3) roster 人物（1行=1人。同名でも別人として作る＝自動統合しない）。
  //    週次出席は「行ごとの person_id」を使う（名前マップに畳まない＝重複出席を防ぐ）。
  //    nameToId は特別礼拝の名寄せ用（同名は最初の出現を採用＝候補で別途レビュー）。
  const nameToId = new Map<string, string>();
  const rosterIds: { p: RosterPerson; id: string }[] = [];
  for (const p of allRoster) {
    const { data: row, error } = await target.from('people').insert({
      church_id: TARGET, display_name: p.name, furigana: null,
      relationship_status: p.relationship, age_group: p.ageGroup,
    }).select('id').single();
    if (error || !row) { console.error(`people 挿入失敗(${p.name}):`, error?.message); process.exit(1); }
    rosterIds.push({ p, id: row.id });
    if (!nameToId.has(normalizeName(p.name))) nameToId.set(normalizeName(p.name), row.id);
  }

  // 4) 週次出席（行ごとの person_id）。(event, person) の重複は除外（unique 制約）。
  const seen = new Set<string>();
  const attRows: { church_id: string; service_event_id: string; person_id: string; source: string }[] = [];
  for (const { p, id } of rosterIds) {
    for (const d of p.attendanceDates) {
      const eid = dateToEvent.get(d);
      if (!eid) continue;
      const key = `${eid}|${id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      attRows.push({ church_id: TARGET, service_event_id: eid, person_id: id, source: 'import' });
    }
  }
  await insertChunks(target, 'attendance_records', attRows);

  // 5) 特別礼拝出席（roster と名寄せ・無ければ新規作成）
  let specialUnmatched = 0;
  const specialAtt: typeof attRows = [];
  for (const e of data.special) {
    const eid = specEventByDate.get(e.date);
    if (!eid) continue;
    for (const a of e.attendees) {
      let pid = nameToId.get(normalizeName(a.name));
      if (!pid) {
        specialUnmatched += 1;
        const map = STATUS_MAP[a.status] ?? { relationship: 'guest', ageGroup: 'adult' };
        const { data: row } = await target.from('people').insert({
          church_id: TARGET, display_name: a.name, furigana: null,
          relationship_status: map.relationship, age_group: map.ageGroup,
        }).select('id').single();
        if (row) { pid = row.id; nameToId.set(normalizeName(a.name), row.id); }
      }
      if (pid) {
        const key = `${eid}|${pid}`;
        if (seen.has(key)) continue;
        seen.add(key);
        specialAtt.push({ church_id: TARGET, service_event_id: eid, person_id: pid, source: 'import' });
      }
    }
  }
  await insertChunks(target, 'attendance_records', specialAtt);

  // 照合
  const { count: newPeople } = await target
    .from('people').select('id', { count: 'exact', head: true }).eq('church_id', TARGET);
  const { count: newAtt } = await target
    .from('attendance_records').select('id', { count: 'exact', head: true }).eq('church_id', TARGET);
  const inserted = attRows.length + specialAtt.length;
  const rawTotal = totalMarks + totalSpecial;
  console.log('\n=== 件数照合 ===');
  console.log(`people:     roster ${allRoster.length} + 特別新規 ${specialUnmatched} = ${allRoster.length + specialUnmatched} → 新 ${newPeople}`);
  console.log(`attendance: 生データ ${rawTotal}（週次 ${totalMarks} + 特別 ${totalSpecial}）`);
  console.log(`            重複除外後 ${inserted}（除外 ${rawTotal - inserted}）→ 新 ${newAtt}`);
  console.log(`週次礼拝 ${weeklyEvents.length} / 特別礼拝 ${specialRows.length}`);
  if (newAtt !== inserted || newPeople !== allRoster.length + specialUnmatched) {
    console.error('✗ 件数が一致しません。確認してください。');
    process.exit(1);
  }
  console.log('\n✓ 移行完了。件数一致（重複除外あり）。');
}

function zoned(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

async function insertChunks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any, table: string, rows: unknown[], size = 500,
) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await client.from(table).insert(rows.slice(i, i + size));
    if (error) { console.error(`${table} 挿入失敗:`, error.message); process.exit(1); }
  }
}

main();
