import { dictionaries, type MessageKey } from './dict';
import type { Lang } from '../logic/prefill';

export type Vars = Record<string, string | number>;

/** Replaces {name} placeholders; unknown placeholders are left as they are. */
export function interpolate(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function translate(lang: Lang, key: MessageKey, vars?: Vars): string {
  return interpolate(dictionaries[lang][key] ?? dictionaries.es[key] ?? key, vars);
}

export function placeholders(template: string): string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}
