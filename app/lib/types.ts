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
