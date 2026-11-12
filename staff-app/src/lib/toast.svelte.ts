import { isTauri } from '@tauri-apps/api/core';
import { error as logError } from '@tauri-apps/plugin-log';
import { classifyError } from './logic/errors';
import { t, fmtDate } from './i18n/index.svelte';

export interface Toast {
  id: number;
  kind: 'ok' | 'error';
  text: string;
}

export const toasts = $state<Toast[]>([]);
let next = 1;

export function dismiss(id: number) {
  const i = toasts.findIndex((x) => x.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

function push(kind: Toast['kind'], text: string, ms: number) {
  const id = next++;
  toasts.push({ id, kind, text });
  setTimeout(() => dismiss(id), ms);
}

export function ok(text: string) {
  push('ok', text, 3500);
}

/** A friendly sentence for any error from supabase-js or the database. */
export function describeError(err: unknown): string {
  const e = classifyError(err);
  switch (e.kind) {
    case 'full_days':
      return t('error.fullDays', { days: e.days.map((d) => fmtDate(d)).join(', ') });
    case 'no_days':
      return t('error.noDays');
    case 'already_handled':
      return t('error.alreadyHandled');
    case 'duplicate':
      return t('error.duplicate');
    case 'forbidden':
      return t('error.forbidden');
    case 'network':
      return t('error.network');
    default:
      return t('error.generic', { message: e.message });
  }
}

export function fail(err: unknown) {
  console.error(err);
  if (isTauri()) {
    logError(err instanceof Error ? err.message : JSON.stringify(err)).catch(() => {});
  }
  push('error', describeError(err), 7000);
}
