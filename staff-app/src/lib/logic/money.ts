// Money helpers. Amounts are integer euro cents everywhere (as in the
// database); these mirror the database's arithmetic so the app can show a
// total before saving it.
import type { IsoDate } from './dates';

export type Lang = 'es' | 'en';

/** The payment_method enum, in the order the app offers it. */
export const PAYMENT_METHODS = ['cash', 'card', 'bizum', 'transfer'] as const;

/** Postgres round(): halves go away from zero (Math.round sends -0.5 up). */
export function roundHalfAway(n: number): number {
  return Math.sign(n) * Math.round(Math.abs(n)) || 0;
}

export interface LineTotals {
  net: number;
  vat: number;
  total: number;
}

/**
 * Net, VAT and total of one charge, exactly like the generated columns of
 * `charges`: net = round(unit * (100 - discount) / 100), vat = round(net * rate / 100).
 */
export function lineTotals(unitCents: number, discountPct = 0, vatRate = 0): LineTotals {
  // Percentages have two decimals in the database; work in hundredths of a
  // percent so the halves stay exact (12.35 % in floating point is not).
  const keep = 10_000 - Math.round(discountPct * 100);
  const rate = Math.round(vatRate * 100);
  const net = roundHalfAway((unitCents * keep) / 10_000);
  const vat = roundHalfAway((net * rate) / 10_000);
  return { net, vat, total: net + vat };
}

const locales: Record<Lang, string> = { es: 'es-ES', en: 'en-GB' };

/** 3630 -> "36,30 €" / "€36.30". */
export function formatMoney(lang: Lang, cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '–';
  return new Intl.NumberFormat(locales[lang], { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** A percentage the way people write it: 21 -> "21 %", 12.5 -> "12,5 %" / "12.5 %". */
export function formatPct(lang: Lang, pct: number | string | null | undefined): string {
  const n = Number(pct);
  if (!Number.isFinite(n)) return '–';
  return new Intl.NumberFormat(locales[lang], { maximumFractionDigits: 2 }).format(n) + ' %';
}

/**
 * What staff type in an amount field -> cents. Accepts "30", "30,5", "30.50",
 * "€ 30", "-10" (when allowed); no thousands separators. Null when invalid.
 */
export function parseEuros(text: string, allowNegative = false): number | null {
  const s = text.replace(/[€\s]/g, '');
  const m = /^(-?)(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  if (m[1] && !allowNegative) return null;
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -cents : cents;
}

/** Cents -> the text an amount field starts with: 3000 -> "30,00" / "30.00". */
export function centsToInput(lang: Lang, cents: number): string {
  const s = (Math.abs(cents) / 100).toFixed(2);
  return (cents < 0 ? '-' : '') + (lang === 'es' ? s.replace('.', ',') : s);
}

/** A percentage typed by staff ("21", "12,5") -> number, or null. */
export function parsePct(text: string): number | null {
  const s = text.replace(/[%\s]/g, '').replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 100 ? n : null;
}

/**
 * The last day of a pack, like pack_expiry() in the database: the day before
 * the same date N months on (11 Jan + 6 -> 10 Jul), or the last day of that
 * month when it is too short for the date (31 Aug + 6 -> 28 Feb).
 */
export function packExpiry(start: IsoDate, months: number): IsoDate {
  const [y, m, d] = start.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const end = d > last
    ? Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), last)
    : Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), d) - 86_400_000;
  return new Date(end).toISOString().slice(0, 10);
}

/** The first day of the month an ISO date falls in, and that month's last day. */
export function monthRange(day: IsoDate): { from: IsoDate; to: IsoDate } {
  const [y, m] = day.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { from: `${y}-${mm}-01`, to: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}
