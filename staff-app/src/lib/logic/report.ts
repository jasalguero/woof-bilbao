// The monthly payments report as table rows (shown on screen and exported
// as CSV). Labels come from the caller so this stays free of i18n state.
import { csvAmount, toCsv } from './csv';
import type { Lang } from './money';

export interface IncomeLike {
  method: string;
  payments: number;
  received_cents: number;
  refunds: number;
  refunded_cents: number;
  net_cents: number;
}

export interface OwingLike {
  full_name: string;
  email: string;
  phone: string | null;
  balance_cents: number;
  unpaid_days: number;
  oldest_unpaid_day: string | null;
}

export function incomeTotals(rows: readonly IncomeLike[]): IncomeLike {
  return rows.reduce(
    (t, r) => ({
      method: 'total',
      payments: t.payments + r.payments,
      received_cents: t.received_cents + r.received_cents,
      refunds: t.refunds + r.refunds,
      refunded_cents: t.refunded_cents + r.refunded_cents,
      net_cents: t.net_cents + r.net_cents
    }),
    { method: 'total', payments: 0, received_cents: 0, refunds: 0, refunded_cents: 0, net_cents: 0 }
  );
}

export function incomeCsv(
  lang: Lang,
  month: string,
  rows: readonly IncomeLike[],
  label: { month: string; method: string; payments: string; received: string; refunds: string; refunded: string; net: string; total: string },
  methodName: (m: string) => string
): string {
  const line = (r: IncomeLike, name: string) => [
    month, name, r.payments, csvAmount(lang, r.received_cents), r.refunds, csvAmount(lang, r.refunded_cents), csvAmount(lang, r.net_cents)
  ];
  return toCsv(lang, [
    [label.month, label.method, label.payments, label.received, label.refunds, label.refunded, label.net],
    ...rows.map((r) => line(r, methodName(r.method))),
    line(incomeTotals(rows), label.total)
  ]);
}

export function owingCsv(
  lang: Lang,
  month: string,
  rows: readonly OwingLike[],
  label: { month: string; owner: string; email: string; phone: string; balance: string; unpaidDays: string; since: string }
): string {
  return toCsv(lang, [
    [label.month, label.owner, label.email, label.phone, label.balance, label.unpaidDays, label.since],
    ...rows.map((r) => [month, r.full_name, r.email, r.phone, csvAmount(lang, r.balance_cents), r.unpaid_days, r.oldest_unpaid_day])
  ]);
}
