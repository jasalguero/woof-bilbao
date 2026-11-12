// Small, dependency-free formatting helpers for the email templates: dates
// and weekdays in human Spanish and English, and HTML escaping. Written out
// by hand (no Intl) so the output is the same on every runtime.

export type Lang = "es" | "en";

const MONTHS: Record<Lang, string[]> = {
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
};

// ISO weekdays: index 1 = Monday ... 7 = Sunday.
const DAYS: Record<Lang, string[]> = {
  es: ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
  en: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses YYYY-MM-DD (a timestamp's date part is accepted too). */
export function parseDate(value: unknown): { y: number; m: number; d: number; dow: number } | null {
  if (typeof value !== "string") return null;
  const match = DATE.exec(value.slice(0, 10));
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  const js = t.getUTCDay(); // 0 = Sunday
  return { y, m, d, dow: js === 0 ? 7 : js };
}

/** "lunes 1 de diciembre de 2026" / "Monday 1 December 2026". */
export function longDate(lang: Lang, value: unknown, withYear = true): string {
  const p = parseDate(value);
  if (!p) return typeof value === "string" ? value : "";
  const day = DAYS[lang][p.dow];
  const month = MONTHS[lang][p.m - 1];
  if (lang === "es") return `${day} ${p.d} de ${month}${withYear ? ` de ${p.y}` : ""}`;
  return `${day} ${p.d} ${month}${withYear ? ` ${p.y}` : ""}`;
}

/**
 * A date range in words. The year is only said once when both ends share it.
 *   es: "del lunes 1 de diciembre al viernes 19 de diciembre de 2026"
 *   en: "from Monday 1 December to Friday 19 December 2026"
 * A single day: "el martes 1 de diciembre de 2026" / "on Tuesday 1 December 2026".
 */
export function dateRange(lang: Lang, from: unknown, to: unknown): string {
  const a = parseDate(from);
  const b = parseDate(to);
  if (a && (!b || (a.y === b.y && a.m === b.m && a.d === b.d))) {
    return lang === "es" ? `el ${longDate(lang, from)}` : `on ${longDate(lang, from)}`;
  }
  if (!a || !b) return [from, to].filter((x) => typeof x === "string").join(" – ");
  const sameYear = a.y === b.y;
  return lang === "es"
    ? `del ${longDate(lang, from, !sameYear)} al ${longDate(lang, to)}`
    : `from ${longDate(lang, from, !sameYear)} to ${longDate(lang, to)}`;
}

function joinList(lang: Lang, items: string[]): string {
  if (items.length <= 1) return items.join("");
  const and = lang === "es" ? " y " : " and ";
  return items.slice(0, -1).join(", ") + and + items[items.length - 1];
}

/**
 * Weekdays in words: [1,2,3,4,5] -> "de lunes a viernes" / "Monday to Friday";
 * [1,3,5] -> "los lunes, miércoles y viernes" / "Mondays, Wednesdays and Fridays".
 */
export function weekdaysText(lang: Lang, value: unknown): string {
  const days = Array.isArray(value)
    ? [...new Set(value.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b)
    : [];
  if (days.length === 0) return "";
  if (days.join() === "1,2,3,4,5") return lang === "es" ? "de lunes a viernes" : "Monday to Friday";
  if (lang === "es") {
    // Spanish weekday names ending in -s don't change in the plural.
    const plural = days.map((d) => (d >= 6 ? DAYS.es[d] + "s" : DAYS.es[d]));
    return "los " + joinList(lang, plural);
  }
  return joinList(lang, days.map((d) => DAYS.en[d] + "s"));
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

/** A trimmed, single-line string from message data, or the fallback. */
export function text(value: unknown, fallback = "", max = 200): string {
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const s = String(value).replace(/\s+/g, " ").trim().slice(0, max);
  return s || fallback;
}
