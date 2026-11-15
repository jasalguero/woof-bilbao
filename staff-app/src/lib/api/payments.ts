import { supabase } from '../supabase';
import type {
  Absence, Charge, OwnerBalance, PackBalance, Payment, PaymentMethod, PriceList
} from '../types';
import type { Json } from '../database.types.ts';
import { addDays, todayIso } from '../logic/dates';
import { must } from './util';

export { PAYMENT_METHODS } from '../logic/money';

export type ChargeWithDog = Charge & { dog: { id: string; name: string } | null; pack: { days_total: number } | null };
export type PaymentWithStaff = Payment & { staff: { full_name: string } | null };

// ---------------------------------------------------------------------------
// One owner's account
// ---------------------------------------------------------------------------

/**
 * Charges any booked or attended days not charged yet (normally done every
 * evening), so today's day can be paid on the spot. Idempotent.
 */
export async function chargeOwnerDays(ownerId: string): Promise<number> {
  const today = todayIso();
  return must(await supabase.rpc('charge_days', { p_from: addDays(today, -62), p_to: today, p_owner_id: ownerId }));
}

export async function getBalance(ownerId: string): Promise<OwnerBalance | null> {
  return must(await supabase.from('owner_balances').select('*').eq('owner_id', ownerId).maybeSingle()) ?? null;
}

/** Balances of the given owners that owe something (for the Today screen). */
export async function listOwing(ownerIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(ownerIds)];
  if (ids.length === 0) return new Map();
  const rows = must(await supabase.from('owner_balances').select('owner_id, balance_cents').in('owner_id', ids).gt('balance_cents', 0));
  return new Map(rows.map((r) => [r.owner_id!, r.balance_cents!]));
}

export async function listCharges(ownerId: string, limit = 300): Promise<ChargeWithDog[]> {
  return must(
    await supabase
      .from('charges')
      .select('*, dog:dogs(id, name), pack:packs(days_total)')
      .eq('owner_id', ownerId)
      .order('day', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)
  ) as ChargeWithDog[];
}

export async function listPayments(ownerId: string): Promise<PaymentWithStaff[]> {
  return must(
    await supabase
      .from('payments')
      .select('*, staff:staff!payments_recorded_by_fkey(full_name)')
      .eq('owner_id', ownerId)
      .order('paid_at', { ascending: false })
      .limit(300)
  ) as unknown as PaymentWithStaff[];
}

export async function listPacks(ownerId: string): Promise<PackBalance[]> {
  return must(await supabase.from('pack_balances').select('*').eq('owner_id', ownerId).order('starts_on', { ascending: false }));
}

export interface PriceOverride {
  id: string;
  unit_price_cents?: number;
  discount_pct?: number;
}

/** record_payment RPC: any staff member. Overrides reprice selected day charges. */
export async function recordPayment(args: {
  ownerId: string;
  amountCents: number;
  method: PaymentMethod;
  chargeIds?: string[];
  overrides?: PriceOverride[];
  paidAt?: string;
  note?: string;
}): Promise<Payment> {
  return must(
    await supabase.rpc('record_payment', {
      p_owner_id: args.ownerId,
      p_amount_cents: args.amountCents,
      p_method: args.method,
      p_charge_ids: args.chargeIds?.length ? args.chargeIds : undefined,
      p_overrides: args.overrides?.length ? (args.overrides as unknown as Json) : undefined,
      p_paid_at: args.paidAt || undefined,
      p_note: args.note || undefined
    })
  );
}

/** sell_pack RPC: any staff member; every value left out comes from today's prices. */
export async function sellPack(args: {
  ownerId: string;
  method: PaymentMethod;
  priceCents?: number;
  days?: number;
  expiresOn?: string;
  vatRate?: number;
  amountCents?: number;
  note?: string;
}): Promise<void> {
  must(
    await supabase.rpc('sell_pack', {
      p_owner_id: args.ownerId,
      p_method: args.method,
      p_price_cents: args.priceCents,
      p_days: args.days,
      p_expires_on: args.expiresOn,
      p_vat_rate: args.vatRate,
      p_amount_cents: args.amountCents,
      p_note: args.note || undefined
    })
  );
}

export async function sendBalanceReminder(ownerId: string): Promise<void> {
  must(await supabase.rpc('queue_balance_reminder', { p_owner_id: ownerId }));
}

// ---------------------------------------------------------------------------
// Admin only (row-level security refuses everyone else)
// ---------------------------------------------------------------------------

export async function recordRefund(args: {
  ownerId: string;
  amountCents: number;
  method: PaymentMethod;
  refundOf?: string | null;
  note?: string;
}): Promise<void> {
  must(
    await supabase.from('payments').insert({
      owner_id: args.ownerId,
      kind: 'refund',
      method: args.method,
      amount_cents: args.amountCents,
      refund_of: args.refundOf ?? null,
      note: args.note || null
    })
  );
}

/** A manual correction on the account: positive = owes more, negative = credit. VAT 0. */
export async function addCorrection(ownerId: string, amountCents: number, description: string): Promise<void> {
  must(
    await supabase.from('charges').insert({
      owner_id: ownerId,
      kind: 'adjustment',
      day: todayIso(),
      unit_price_cents: amountCents,
      vat_rate: 0,
      description: description || null
    })
  );
}

export async function voidCharge(id: string, reason: string): Promise<void> {
  const rows = must(
    await supabase
      .from('charges')
      .update({ voided_at: new Date().toISOString(), void_reason: reason || 'admin' })
      .eq('id', id)
      .select('id')
  );
  if (rows.length === 0) throw { code: '42501', message: 'not allowed' };
}

export async function updatePayment(
  id: string,
  patch: { amount_cents?: number; method?: PaymentMethod; note?: string | null; paid_at?: string }
): Promise<void> {
  const rows = must(await supabase.from('payments').update(patch).eq('id', id).select('id'));
  if (rows.length === 0) throw { code: '42501', message: 'not allowed' };
}

export async function deletePayment(id: string): Promise<void> {
  const rows = must(await supabase.from('payments').delete().eq('id', id).select('id'));
  if (rows.length === 0) throw { code: '42501', message: 'not allowed' };
}

// ---------------------------------------------------------------------------
// Prices
// ---------------------------------------------------------------------------

export async function listPriceLists(): Promise<PriceList[]> {
  return must(await supabase.from('price_lists').select('*').order('valid_from', { ascending: false }));
}

/** The price list in force on a day (default today), or null before billing starts. */
export async function pricesOn(day = todayIso()): Promise<PriceList | null> {
  const row = must(await supabase.rpc('prices_on', { p_day: day })) as PriceList | null;
  return row && row.id !== null ? row : null;
}

export type NewPriceList = Omit<PriceList, 'id' | 'created_at' | 'created_by'>;

/** Admins: new prices from a date (replacing a list already set for that date). */
export async function savePriceList(p: NewPriceList): Promise<void> {
  must(await supabase.from('price_lists').upsert(p, { onConflict: 'valid_from' }));
}

export async function deletePriceList(id: number): Promise<void> {
  const rows = must(await supabase.from('price_lists').delete().eq('id', id).select('id'));
  if (rows.length === 0) throw { code: '42501', message: 'not allowed' };
}

// ---------------------------------------------------------------------------
// Monthly report (admins)
// ---------------------------------------------------------------------------

export interface IncomeRow {
  method: PaymentMethod;
  payments: number;
  received_cents: number;
  refunds: number;
  refunded_cents: number;
  net_cents: number;
}
export interface ChargeSummaryRow {
  kind: 'day' | 'pack' | 'adjustment';
  items: number;
  net_cents: number;
  vat_cents: number;
  total_cents: number;
  pack_days: number;
}
export interface OwingRow {
  owner_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  balance_cents: number;
  unpaid_days: number;
  oldest_unpaid_day: string | null;
}
export interface MonthlyReport {
  month: string;
  from: string;
  to: string;
  income: IncomeRow[];
  charges: ChargeSummaryRow[];
  owing: OwingRow[];
}

export async function monthlyReport(month: string): Promise<MonthlyReport> {
  return must(await supabase.rpc('monthly_report', { p_month: month })) as unknown as MonthlyReport;
}

// ---------------------------------------------------------------------------
// Absences (a booked dog that won't come; with 24 h notice it is not charged)
// ---------------------------------------------------------------------------

export async function listDogAbsences(dogId: string): Promise<Absence[]> {
  return must(await supabase.from('absences').select('*').eq('dog_id', dogId).order('day', { ascending: false }).limit(100));
}

export async function listAbsencesOn(day: string): Promise<Absence[]> {
  return must(await supabase.from('absences').select('*').eq('day', day));
}

export async function addAbsence(dogId: string, day: string, notifiedAt: string, note: string | null): Promise<void> {
  must(await supabase.from('absences').insert({ dog_id: dogId, day, notified_at: notifiedAt, note }));
}

export async function removeAbsence(id: string): Promise<void> {
  must(await supabase.from('absences').delete().eq('id', id));
}
