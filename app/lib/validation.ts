import { z } from 'zod';

// ── 入力検証スキーマ（API / Server Action 共通）──────────────────────────

export const relationshipStatusSchema = z.enum([
  'member',
  'regular_attendee',
  'seeker',
  'guest',
]);

export const ageGroupSchema = z.enum(['adult', 'child', 'unknown']);

export const serviceKindSchema = z.enum([
  'morning_worship',
  'evening_worship',
  'special_worship',
  'other',
]);

export const serviceStatusSchema = z.enum([
  'scheduled',
  'open',
  'completed',
  'cancelled',
]);

// PUT /api/events/:eventId/attendance/:personId
// 「望む最終状態」を設定する冪等入力。出席させたうえで昼食数を確定する。
export const putAttendanceSchema = z.object({
  lunchQuantity: z.number().int().min(0).max(20).default(0),
});

// POST /api/events/:eventId/guests
export const createGuestSchema = z.object({
  displayName: z.string().trim().min(1, '名前を入力してください').max(100),
  furigana: z.string().trim().max(100).optional(),
  ageGroup: ageGroupSchema.default('unknown'),
  relationshipStatus: relationshipStatusSchema.default('guest'),
  lunchQuantity: z.number().int().min(0).max(20).default(0),
});

// POST /api/events （礼拝イベント作成）
export const createEventSchema = z.object({
  kind: serviceKindSchema,
  name: z.string().trim().min(1).max(100),
  startsAt: z.string().datetime({ offset: true }),
  countsTowardAttendanceRate: z.boolean().default(false),
  lunchEnabled: z.boolean().default(false),
  note: z.string().trim().max(500).optional(),
});

// 教会オンボーディング
export const createChurchSchema = z.object({
  name: z.string().trim().min(1, '教会名を入力してください').max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, '英小文字・数字・ハイフンのみ使用できます'),
});

// 人物の新規作成・編集
export const upsertPersonSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
  furigana: z.string().trim().max(100).optional(),
  relationshipStatus: relationshipStatusSchema,
  ageGroup: ageGroupSchema,
  firstVisitOn: z.string().date().optional(),
});

export type PutAttendanceInput = z.infer<typeof putAttendanceSchema>;
export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateChurchInput = z.infer<typeof createChurchSchema>;
export type UpsertPersonInput = z.infer<typeof upsertPersonSchema>;
