import { dictionaries, type MessageKey } from './dict';
import type { Lang } from '../logic/prefill';
import { TIME_ZONE } from '../logic/dates';

export type Vars = Record<string, string | number>;

/** Replaces {name} placeholders; unknown placeholders are left as they are. */
export function interpolate(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  return interpolate(dictionaries[lang][key] ?? dictionaries.es[key] ?? key, vars);
}

const locales: Record<Lang, string> = { es: 'es-ES', en: 'en-GB' };

/**
 * Formats a date (YYYY-MM-DD, shown as that calendar day) or a timestamp
 * (shown in Bilbao time, whatever the computer's time zone).
 */
export function formatDate(
  lang: Lang,
  iso: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
): string {
  if (!iso) return '–';
  const dateOnly = iso.length === 10;
  const d = new Date(dateOnly ? iso + 'T12:00:00Z' : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locales[lang], { ...opts, timeZone: dateOnly ? 'UTC' : TIME_ZONE }).format(d);
}

export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}
