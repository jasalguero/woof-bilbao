// Recognises the database's own errors so the UI can explain them.
import type { IsoDate } from './dates';

export interface DbErrorLike {
  message?: string;
  code?: string;
  hint?: string | null;
  details?: string | null;
}

/** Hints raised by check_in / check_out / undo_check_in / undo_check_out. */
export const ATTENDANCE_HINTS = ['closed_day', 'not_booked', 'inactive_dog', 'not_checked_in', 'already_checked_out'] as const;
export type AttendanceProblem = (typeof ATTENDANCE_HINTS)[number];

export type KnownError =
  | { kind: 'full_days'; days: IsoDate[] }
  | { kind: 'no_days' }
  | { kind: 'already_handled' }
  | { kind: 'attendance'; reason: AttendanceProblem }
  | { kind: 'over_capacity'; count: number; max: number }
  | { kind: 'duplicate' }
  | { kind: 'forbidden' }
  | { kind: 'network' }
  | { kind: 'other'; message: string };

export function classifyError(err: unknown): KnownError {
  const e = (err && typeof err === 'object' ? err : { message: String(err) }) as DbErrorLike;
  const message = e.message ?? '';
  if (e.hint === 'full_days' || message.startsWith('no room on:')) {
    const days = message.replace(/^.*no room on:\s*/, '').match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    return { kind: 'full_days', days };
  }
  if (e.hint === 'no_days' || message.includes('has no bookable days')) return { kind: 'no_days' };
  if (e.hint === 'already_handled') return { kind: 'already_handled' };
  if (e.hint === 'over_capacity' || message.startsWith('no room today:')) {
    const m = /(\d+)\s*\/\s*(\d+)/.exec(message);
    return { kind: 'over_capacity', count: m ? +m[1] : 0, max: m ? +m[2] : 0 };
  }
  if ((ATTENDANCE_HINTS as readonly string[]).includes(e.hint ?? '')) {
    return { kind: 'attendance', reason: e.hint as AttendanceProblem };
  }
  if (e.code === '23505') return { kind: 'duplicate' };
  if (e.code === '42501') return { kind: 'forbidden' };
  if (/failed to fetch|networkerror|load failed/i.test(message)) return { kind: 'network' };
  return { kind: 'other', message: message || 'Unknown error' };
}
