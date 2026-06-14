// ── ドメイン型とラベル（docs/PRODUCT_SPEC.md §8）─────────────────────────

export type Role = 'owner' | 'admin' | 'receptionist' | 'viewer';

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'オーナー',
  admin: '管理者',
  receptionist: '受付',
  viewer: '閲覧',
};

// 立場（child は含めない。child は年齢区分）
export type RelationshipStatus = 'member' | 'regular_attendee' | 'seeker' | 'guest';

export const RELATIONSHIP_LABELS: Record<RelationshipStatus, string> = {
  member: '会員',
  regular_attendee: '客員',
  seeker: '未信',
  guest: 'ビジター',
};

export const RELATIONSHIP_ORDER: RelationshipStatus[] = [
  'member',
  'regular_attendee',
  'seeker',
  'guest',
];

export const RELATIONSHIP_BADGE: Record<RelationshipStatus, string> = {
  member: 'bg-indigo-100 text-indigo-700 ring-indigo-200',
  regular_attendee: 'bg-sky-100 text-sky-700 ring-sky-200',
  seeker: 'bg-amber-100 text-amber-700 ring-amber-200',
  guest: 'bg-rose-100 text-rose-700 ring-rose-200',
};

// 年齢区分
export type AgeGroup = 'adult' | 'child' | 'unknown';

export const AGE_GROUP_LABELS: Record<AgeGroup, string> = {
  adult: '大人',
  child: '子ども',
  unknown: '不明',
};

// 礼拝種別
export type ServiceKind =
  | 'morning_worship'
  | 'evening_worship'
  | 'special_worship'
  | 'other';

export const SERVICE_KIND_LABELS: Record<ServiceKind, string> = {
  morning_worship: '朝礼拝',
  evening_worship: '夕拝',
  special_worship: '特別礼拝',
  other: 'その他',
};

export type ServiceStatus = 'scheduled' | 'open' | 'completed' | 'cancelled';

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  scheduled: '予定',
  open: '受付中',
  completed: '開催済み',
  cancelled: 'キャンセル',
};

export type AttendanceSource = 'reception' | 'admin' | 'import';

// ── 行の型（DB スキーマと対応。db:types で生成も可能）────────────────────

export interface Church {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  child_label: string;
  created_at: string;
  archived_at: string | null;
}

export interface Person {
  id: string;
  church_id: string;
  display_name: string;
  furigana: string | null;
  relationship_status: RelationshipStatus;
  age_group: AgeGroup;
  first_visit_on: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceEvent {
  id: string;
  church_id: string;
  kind: ServiceKind;
  name: string;
  starts_at: string;
  status: ServiceStatus;
  counts_toward_attendance_rate: boolean;
  lunch_enabled: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  church_id: string;
  service_event_id: string;
  person_id: string;
  lunch_quantity: number;
  checked_in_at: string;
  checked_in_by: string | null;
  source: AttendanceSource;
  created_at: string;
  updated_at: string;
}

// 受付画面で使う、人物＋当日の出席状態を結合した行
export interface ReceptionRow {
  person: Person;
  attendance: AttendanceRecord | null;
}

export type Period = '3m' | '6m' | 'all';

export const PERIOD_LABELS: Record<Period, string> = {
  '3m': '直近3ヶ月',
  '6m': '直近半年',
  all: '全期間',
};

// 出席の数え方。'unique'＝1日1人1回（同じ日の複数礼拝は重複させない）／'total'＝延べ。
export type CountMode = 'unique' | 'total';

export const COUNT_MODE_LABELS: Record<CountMode, string> = {
  unique: 'ユニーク',
  total: '延べ',
};

// ── 期間集計（Phase 3。aggregate.ts / people-stats.ts が生成）──────────────

export interface ReportFilter {
  period: Period;
  kinds: ServiceKind[] | 'all';
  ratedOnly: boolean;
  countMode: CountMode;
}

export interface PeriodEventReport {
  event: ServiceEvent;
  present: number;
  adults: number;
  children: number;
  unknownAge: number;
  lunch: number;
  byRelationship: Record<RelationshipStatus, number>;
}

export interface KindTotal {
  events: number;
  present: number;
  lunch: number;
}

export interface PeriodTotals {
  events: number;
  ratedEvents: number;
  present: number;
  adults: number;
  children: number;
  unknownAge: number;
  lunch: number;
  byRelationship: Record<RelationshipStatus, number>;
  byKind: Record<ServiceKind, KindTotal>;
  ratedPresent: number; // counts_toward_attendance_rate=true のイベント出席延べ
  avgAttendance: number; // ratedPresent / ratedEvents（小数1桁）
}

export interface TrendPoint {
  weekStart: string; // 教会ローカル週初め YYYY-MM-DD
  present: number;
  adults: number;
  children: number;
}

// 日別ユニーク集計のうち、その日の礼拝ごとの内訳（present は日内重複除外後）。
export interface PeriodDayServiceReport {
  eventId: string;
  name: string;
  kind: ServiceKind;
  startsAt: string;
  present: number; // その礼拝に帰属したユニーク出席（先頭=最初の礼拝、以降=新規）
}

// 1日（教会ローカル暦日）のユニーク出席。同じ日に複数礼拝へ出た人は1回だけ数える。
export interface PeriodDayReport {
  date: string; // 教会ローカル YYYY-MM-DD
  present: number; // その日のユニーク出席合計
  adults: number;
  children: number;
  unknownAge: number;
  byRelationship: Record<RelationshipStatus, number>;
  services: PeriodDayServiceReport[]; // 開始時刻昇順
}

export interface PeriodReport {
  filter: ReportFilter;
  eventReports: PeriodEventReport[]; // 新しい順。present は日内重複除外後（夕拝は朝の出席者を除く）
  dayReports: PeriodDayReport[]; // 日別ユニーク出席（新しい順）
  totals: PeriodTotals;
  trend: TrendPoint[]; // 週昇順
}

export interface PersonPresence {
  personId: string;
  displayName: string;
  furigana: string | null;
  relationship: RelationshipStatus;
  ageGroup: AgeGroup;
  count: number; // 期間内・フィルタ後の出席「日数」（同日に朝夕出ても1日は1）
  ratedCount: number; // 出席した rated「日数」（出席率の分子）
  rate: number; // 出席した rated 日数 / 期間内 rated 日数（0..1）。朝夕どちらに出ても1日は1
  firstOn: string | null; // 教会ローカル日付（first_visit_on 優先、無ければ min(checked_in_at)）
  lastOn: string | null; // max(checked_in_at) のローカル日付
  isNewGuest: boolean; // guest かつ 出席した日が1日だけ（同日に朝夕2回でも1日）
}
