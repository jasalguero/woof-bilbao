// Current UI language. Saved per computer in localStorage and per staff
// member in `staff.language` (see session.svelte.ts).
import type { MessageKey } from './dict';
import { formatDate, translate, type Vars } from './format';
import type { Lang } from '../logic/prefill';

const STORAGE_KEY = 'woof.lang';

function stored(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

export const i18n = $state<{ lang: Lang }>({ lang: stored() });

export function setLang(lang: Lang) {
  i18n.lang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private mode or blocked storage: the choice still lives in staff.language.
  }
  document.documentElement.lang = lang;
}

/** Reactive in templates: reading i18n.lang subscribes the caller. */
export function t(key: MessageKey, vars?: Vars): string {
  return translate(i18n.lang, key, vars);
}

const locales: Record<Lang, string> = { es: 'es-ES', en: 'en-GB' };

/** 2026-12-01 -> "1 dic 2026" / "1 Dec 2026"; timestamps in Bilbao time. */
export function fmtDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  return formatDate(i18n.lang, iso, opts);
}

export function fmtDateTime(iso: string | null | undefined): string {
  return fmtDate(iso, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat(locales[i18n.lang], { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 15))
  );
}

export function fmtWeekdays(days: readonly number[]): string {
  return days.map((d) => t(`wd.${d}` as MessageKey)).join(', ');
}
