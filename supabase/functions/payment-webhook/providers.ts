// Online payments, prepared but switched off. Today every payment is
// recorded by hand in the staff app. When Stripe and/or Bizum (through
// Redsys) are added, each provider gets an adapter here and index.ts routes
// its webhook to it. Nothing in the database has to change:
//
//   * payments already has provider, external_id (unique per provider),
//     status ('pending' | 'succeeded' | 'failed' | 'cancelled') and metadata;
//   * record_provider_payment() (service role only) inserts or updates a
//     payment by (provider, external_id), so repeated webhooks are harmless,
//     and settles the charges it was for once it succeeds.
//
// An adapter verifies the request's signature with the provider's secret
// (a function secret, never in the repository), then turns the event into a
// ProviderEvent. Unknown or irrelevant events return null (answer 200, do
// nothing). See supabase/README.md, "Online payments (later)".

export type PaymentMethod = "cash" | "card" | "bizum" | "transfer";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "cancelled";

/** What a provider tells us, already verified and normalised. */
export interface ProviderEvent {
  provider: string; // 'stripe', 'redsys', ...
  externalId: string; // the provider's payment id (Stripe PaymentIntent, Redsys order)
  ownerId: string; // put in the checkout's metadata when it was created
  amountCents: number;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt?: string; // ISO timestamp
  chargeIds?: string[]; // the charges the checkout was for (from its metadata)
  metadata?: Record<string, unknown>; // event id, card brand, ... never secrets
}

export interface ProviderAdapter {
  name: string;
  /** Returns the event, null to ignore it, or throws on a bad signature. */
  parse(req: Request, rawBody: string): Promise<ProviderEvent | null>;
}

/** Adapters by URL path segment: /payment-webhook/<name>. Empty until a provider is added. */
export const adapters: Record<string, ProviderAdapter> = {};

const PROVIDER = /^[a-z0-9_]{1,30}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES: PaymentStatus[] = ["pending", "succeeded", "failed", "cancelled"];
const METHODS: PaymentMethod[] = ["cash", "card", "bizum", "transfer"];

/** Arguments for the record_provider_payment() RPC; throws on an invalid event. */
export function toRecordArgs(e: ProviderEvent): Record<string, unknown> {
  if (!PROVIDER.test(e.provider) || e.provider === "manual") throw new Error("bad provider");
  if (!e.externalId || e.externalId.length > 200) throw new Error("bad external id");
  if (!UUID.test(e.ownerId)) throw new Error("bad owner id");
  if (!Number.isInteger(e.amountCents) || e.amountCents <= 0) throw new Error("bad amount");
  if (!METHODS.includes(e.method) || !STATUSES.includes(e.status)) throw new Error("bad method or status");
  const charges = (e.chargeIds ?? []).filter((id) => UUID.test(id));
  return {
    p_provider: e.provider,
    p_external_id: e.externalId,
    p_owner_id: e.ownerId,
    p_amount_cents: e.amountCents,
    p_method: e.method,
    p_status: e.status,
    p_paid_at: e.paidAt ?? null,
    p_metadata: e.metadata ?? {},
    p_charge_ids: charges.length ? charges : null,
  };
}
