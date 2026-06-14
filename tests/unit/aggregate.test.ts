import { describe, it, expect } from 'vitest';
import { summarizeReception } from '@/app/lib/aggregate';
import type {
  AttendanceRecord,
  Person,
  ReceptionRow,
  RelationshipStatus,
  AgeGroup,
} from '@/app/lib/types';

function person(
  id: string,
  relationship_status: RelationshipStatus,
  age_group: AgeGroup,
): Person {
  return {
    id,
    church_id: 'c1',
    display_name: id,
    furigana: null,
    relationship_status,
    age_group,
    first_visit_on: null,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function attendance(personId: string, lunch: number): AttendanceRecord {
  return {
    id: `att-${personId}`,
    church_id: 'c1',
    service_event_id: 'e1',
    person_id: personId,
    lunch_quantity: lunch,
    checked_in_at: '2026-01-01T01:00:00Z',
    checked_in_by: null,
    source: 'reception',
    created_at: '2026-01-01T01:00:00Z',
    updated_at: '2026-01-01T01:00:00Z',
  };
}

describe('summarizeReception', () => {
  it('出席記録のある人だけを数える（分母は出席）', () => {
    const rows: ReceptionRow[] = [
      { person: person('a', 'member', 'adult'), attendance: attendance('a', 1) },
      { person: person('b', 'member', 'child'), attendance: attendance('b', 0) },
      { person: person('c', 'guest', 'adult'), attendance: null }, // 未出席
    ];
    const s = summarizeReception(rows);
    expect(s.present).toBe(2);
    expect(s.adults).toBe(1);
    expect(s.children).toBe(1);
    expect(s.lunchTotal).toBe(1);
  });

  it('立場別と年齢区分を独立して集計する', () => {
    const rows: ReceptionRow[] = [
      { person: person('a', 'member', 'adult'), attendance: attendance('a', 2) },
      { person: person('b', 'regular_attendee', 'adult'), attendance: attendance('b', 1) },
      { person: person('c', 'seeker', 'unknown'), attendance: attendance('c', 0) },
      { person: person('d', 'guest', 'child'), attendance: attendance('d', 1) },
      { person: person('e', 'guest', 'adult'), attendance: null },
    ];
    const s = summarizeReception(rows);
    expect(s.present).toBe(4);
    expect(s.adults).toBe(2);
    expect(s.children).toBe(1);
    expect(s.unknownAge).toBe(1);
    expect(s.lunchTotal).toBe(4);
    expect(s.byRelationship.member).toBe(1);
    expect(s.byRelationship.regular_attendee).toBe(1);
    expect(s.byRelationship.seeker).toBe(1);
    expect(s.byRelationship.guest).toBe(1);
    expect(s.guests).toBe(1);
  });

  it('昼食「少なめ」(0.5) を含めて合算する', () => {
    const rows: ReceptionRow[] = [
      { person: person('a', 'member', 'adult'), attendance: attendance('a', 0.5) },
      { person: person('b', 'member', 'adult'), attendance: attendance('b', 1) },
      { person: person('c', 'guest', 'child'), attendance: attendance('c', 1.5) },
    ];
    const s = summarizeReception(rows);
    expect(s.present).toBe(3);
    expect(s.lunchTotal).toBe(3);
  });

  it('全員未出席なら 0', () => {
    const rows: ReceptionRow[] = [
      { person: person('a', 'member', 'adult'), attendance: null },
    ];
    const s = summarizeReception(rows);
    expect(s.present).toBe(0);
    expect(s.lunchTotal).toBe(0);
    expect(s.guests).toBe(0);
  });
});
