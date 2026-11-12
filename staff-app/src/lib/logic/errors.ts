// Recognises the database's own errors so the UI can explain them.
import type { IsoDate } from './dates';

export interface DbErrorLike {
  message?: string;
  code?: string;
  hint?: string | null;
  details?: string | null;
}

export type KnownError =
  | { kind: 'full_days'; days: IsoDate[] }
  | { kind: 'no_days' }
  | { kind: 'already_handled' }
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
  if (e.code === '23505') return { kind: 'duplicate' };
  if (e.code === '42501') return { kind: 'forbidden' };
  if (/failed to fetch|networkerror|load failed/i.test(message)) return { kind: 'network' };
  return { kind: 'other', message: message || 'Unknown error' };
}
