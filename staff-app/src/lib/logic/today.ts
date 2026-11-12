// The Today screen's rules, as pure functions: which dogs to show, whether
// each one is still to come, here or gone home, and the counters.
import { isoWeekday, type IsoDate } from './dates';

export type DayKind = 'open' | 'weekend' | 'closed';

/** Whether the daycare opens on `day`: Monday-Friday and not marked closed. */
export function dayKind(
  day: IsoDate,
  capacity: readonly { day: string | null; closed: boolean; reason: string | null }[]
): { kind: DayKind; reason: string | null } {
  if (isoWeekday(day) > 5) return { kind: 'weekend', reason: null };
  const row = capacity.find((c) => c.day === day && c.closed);
  return row ? { kind: 'closed', reason: row.reason } : { kind: 'open', reason: null };
}

export interface TodayDog {
  id: string;
  name: string;
  size: 's' | 'm' | 'l' | null;
  photo_path: string | null;
  medical_notes: string | null;
  vaccines_up_to_date: boolean;
  vaccines_checked_until: IsoDate | null;
  active: boolean;
  owner: { full_name: string; phone: string | null };
}

export interface AttendanceRow {
  id: string;
  dog_id: string;
  booking_id: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  note: string | null;
}

export type Presence = 'expected' | 'here' | 'gone';

export interface TodayEntry {
  dog: TodayDog;
  /** False for a walk-in: checked in without a confirmed booking today. */
  booked: boolean;
  presence: Presence;
  attendance: AttendanceRow | null;
}

export function presenceOf(a: Pick<AttendanceRow, 'checked_in_at' | 'checked_out_at'> | null): Presence {
  if (!a?.checked_in_at) return 'expected';
  return a.checked_out_at ? 'gone' : 'here';
}

/**
 * One entry per dog: every dog with a confirmed booking today, plus walk-ins
 * (dogs with an attendance row today but no booking). Sorted by name and
 * nothing else, so a card never jumps away from under a finger when tapped.
 */
export function buildToday(
  booked: readonly { dog: TodayDog }[],
  attendance: readonly (AttendanceRow & { dog: TodayDog })[]
): TodayEntry[] {
  const byDog = new Map<string, TodayEntry>();
  for (const b of booked) {
    if (!byDog.has(b.dog.id)) byDog.set(b.dog.id, { dog: b.dog, booked: true, presence: 'expected', attendance: null });
  }
  for (const a of attendance) {
    const { dog, ...row } = a;
    const entry = byDog.get(a.dog_id) ?? { dog, booked: false, presence: 'expected' as Presence, attendance: null };
    entry.attendance = row;
    entry.presence = presenceOf(row);
    byDog.set(a.dog_id, entry);
  }
  return [...byDog.values()].sort((x, y) => x.dog.name.localeCompare(y.dog.name, 'es') || x.dog.id.localeCompare(y.dog.id));
}

export interface TodayCounts {
  /** Dogs with a confirmed booking today. */
  expected: number;
  /** Booked dogs that haven't arrived yet. */
  toCome: number;
  here: number;
  gone: number;
  walkIns: number;
}

export function countToday(entries: readonly TodayEntry[]): TodayCounts {
  const c: TodayCounts = { expected: 0, toCome: 0, here: 0, gone: 0, walkIns: 0 };
  for (const e of entries) {
    if (e.booked) c.expected++;
    else c.walkIns++;
    if (e.presence === 'expected' && e.booked) c.toCome++;
    if (e.presence === 'here') c.here++;
    if (e.presence === 'gone') c.gone++;
  }
  return c;
}

/** Active dogs that are not on today's list, for the walk-in picker. */
export function walkInCandidates<D extends { id: string; name: string; active: boolean }>(
  dogs: readonly D[],
  entries: readonly TodayEntry[],
  query = ''
): D[] {
  const listed = new Set(entries.map((e) => e.dog.id));
  const q = fold(query.trim());
  return dogs
    .filter((d) => d.active && !listed.has(d.id) && (!q || fold(d.name).includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
