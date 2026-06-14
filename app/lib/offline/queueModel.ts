import type { AttendanceRecord, Person, ReceptionRow } from '@/app/lib/types';

// ╔══════════════════════════════════════════════════════════════════════╗
// ║ 受付の「保留中の希望状態」キュー（純粋ロジック）                       ║
// ║                                                                        ║
// ║ 設計: 履歴ではなく person ごとの desired state（出席＋昼食 or 未出席）  ║
// ║       を 1 件に畳む latest-wins。冪等 API（PUT=最終状態 / DELETE）と    ║
// ║       1:1 対応するため、再送・順序入替に強い。                         ║
// ║ ゲストは person 生成を伴うので temp ID で別管理し、送信成功で実IDへ。   ║
// ╚══════════════════════════════════════════════════════════════════════╝

export interface PendingPut {
  kind: 'put';
  personId: string; // temp:... の場合あり（ゲスト未確定）
  lunchQuantity: number;
  clientOpId: string;
  updatedAt: number;
}

export interface PendingDelete {
  kind: 'delete';
  personId: string;
  clientOpId: string;
  updatedAt: number;
}

export interface PendingGuest {
  kind: 'guest';
  tempPersonId: string; // 'temp:<uuid>'
  clientOpId: string;
  input: {
    displayName: string;
    furigana?: string;
    ageGroup: Person['age_group'];
    relationshipStatus: Person['relationship_status'];
    lunchQuantity: number;
  };
  updatedAt: number;
}

export type PendingOp = PendingPut | PendingDelete | PendingGuest;

// service_event 単位の永続スナップショット
export interface QueueSnapshot {
  eventId: string;
  desired: Record<string, PendingPut | PendingDelete>; // person/tempId -> 最新希望（1人1件）
  guests: Record<string, PendingGuest>; // tempId -> ゲスト作成
  optimisticPeople: Record<string, Person>; // tempId -> 楽観表示用 person（リロード復元用）
}

export function newClientOpId(): string {
  const c = (globalThis as {
    crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array };
  }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // フォールバックでも UUID v4 形を保つ（サーバの冪等キー列は uuid 型のため）。
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0'));
  return `${h[0]}${h[1]}${h[2]}${h[3]}-${h[4]}${h[5]}-${h[6]}${h[7]}-${h[8]}${h[9]}-${h[10]}${h[11]}${h[12]}${h[13]}${h[14]}${h[15]}`;
}

export function newTempPersonId(): string {
  return `temp:${newClientOpId()}`;
}

export function isTempId(id: string): boolean {
  return id.startsWith('temp:');
}

export function emptySnapshot(eventId: string): QueueSnapshot {
  return { eventId, desired: {}, guests: {}, optimisticPeople: {} };
}

export function isEmptySnapshot(s: QueueSnapshot): boolean {
  return (
    Object.keys(s.desired).length === 0 &&
    Object.keys(s.guests).length === 0 &&
    Object.keys(s.optimisticPeople).length === 0
  );
}

// 保留中（未確定）の person/tempId 集合
export function pendingIds(s: QueueSnapshot): Set<string> {
  return new Set([...Object.keys(s.desired), ...Object.keys(s.guests)]);
}

export function pendingCount(s: QueueSnapshot): number {
  // ゲストは desired にも put として載るため、二重に数えない（desired を正とする）。
  const guestOnly = Object.keys(s.guests).filter((id) => !(id in s.desired));
  return Object.keys(s.desired).length + guestOnly.length;
}

// latest-wins で 1 件に畳む（同一 personId の古い希望は捨てる）
export function applyDesired(
  s: QueueSnapshot,
  op: PendingPut | PendingDelete,
): QueueSnapshot {
  const prev = s.desired[op.personId];
  if (prev && prev.updatedAt > op.updatedAt) return s;
  return { ...s, desired: { ...s.desired, [op.personId]: op } };
}

// 送信成功した op を取り除く（personId と clientOpId 両方一致でのみ消す
// ＝送信中に積まれた新しい希望は残す＝取りこぼし防止）
export function clearDesiredIfUnchanged(
  s: QueueSnapshot,
  personId: string,
  clientOpId: string,
): QueueSnapshot {
  const cur = s.desired[personId];
  if (!cur || cur.clientOpId !== clientOpId) return s;
  const next = { ...s.desired };
  delete next[personId];
  return { ...s, desired: next };
}

// ゲスト確定: temp→実ID。desired/optimisticPeople のキーも張り替える。
export function resolveGuest(
  s: QueueSnapshot,
  tempId: string,
  realPerson: Person,
): QueueSnapshot {
  const guests = { ...s.guests };
  delete guests[tempId];
  const optimisticPeople = { ...s.optimisticPeople };
  delete optimisticPeople[tempId];

  const desired = { ...s.desired };
  if (desired[tempId]) {
    const moved = { ...desired[tempId], personId: realPerson.id };
    delete desired[tempId];
    // 既に実ID側に新しい希望があればそちらを優先
    const existing = desired[realPerson.id];
    if (!existing || existing.updatedAt <= moved.updatedAt) {
      desired[realPerson.id] = moved;
    }
  }
  return { ...s, guests, optimisticPeople, desired };
}

export function optimisticAttendance(
  person: Person,
  lunch: number,
  current: AttendanceRecord | null,
): AttendanceRecord {
  const nowIso = new Date().toISOString();
  return {
    id: current?.id ?? `optimistic-${person.id}`,
    church_id: person.church_id,
    service_event_id: '', // 表示には使わない
    person_id: person.id,
    lunch_quantity: lunch,
    checked_in_at: current?.checked_in_at ?? nowIso,
    checked_in_by: current?.checked_in_by ?? null,
    source: 'reception',
    created_at: current?.created_at ?? nowIso,
    updated_at: nowIso,
  };
}

function sortRows(rows: ReceptionRow[]): ReceptionRow[] {
  return [...rows].sort((a, b) =>
    (a.person.furigana ?? a.person.display_name).localeCompare(
      b.person.furigana ?? b.person.display_name,
      'ja',
    ),
  );
}

// サーバ確定 rows（refresh / Realtime で更新される）とローカル希望状態の合成。
// 未送信/送信中の person はローカル希望を優先（サーバ値の上書きから保護）。
export function mergeRows(
  serverRows: ReceptionRow[],
  s: QueueSnapshot,
): ReceptionRow[] {
  const out: ReceptionRow[] = serverRows.map((r) => {
    const d = s.desired[r.person.id];
    if (!d) return r; // pending 無し → サーバ値で確定
    if (d.kind === 'delete') return { ...r, attendance: null };
    return {
      ...r,
      attendance: optimisticAttendance(r.person, d.lunchQuantity, r.attendance),
    };
  });

  // サーバにまだ無い temp ゲストを足す
  for (const [tempId, person] of Object.entries(s.optimisticPeople)) {
    if (out.some((r) => r.person.id === tempId)) continue;
    const d = s.desired[tempId];
    out.push({
      person,
      attendance:
        d && d.kind === 'put'
          ? optimisticAttendance(person, d.lunchQuantity, null)
          : null,
    });
  }

  return sortRows(out);
}
