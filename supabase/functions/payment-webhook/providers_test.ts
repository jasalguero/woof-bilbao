// Run with: deno test supabase/functions/payment-webhook/
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { adapters, type ProviderEvent, toRecordArgs } from "./providers.ts";

const event: ProviderEvent = {
  provider: "stripe",
  externalId: "pi_123",
  ownerId: "10000000-0000-0000-0000-000000000001",
  amountCents: 3630,
  method: "card",
  status: "succeeded",
  chargeIds: ["20000000-0000-0000-0000-000000000001", "not-a-uuid"],
  metadata: { event: "evt_1" },
};

Deno.test("no provider is switched on yet", () => {
  assertEquals(Object.keys(adapters), []);
});

Deno.test("an event becomes record_provider_payment arguments", () => {
  assertEquals(toRecordArgs(event), {
    p_provider: "stripe",
    p_external_id: "pi_123",
    p_owner_id: "10000000-0000-0000-0000-000000000001",
    p_amount_cents: 3630,
    p_method: "card",
    p_status: "succeeded",
    p_paid_at: null,
    p_metadata: { event: "evt_1" },
    p_charge_ids: ["20000000-0000-0000-0000-000000000001"],
  });
});

Deno.test("invalid events are refused", () => {
  assertThrows(() => toRecordArgs({ ...event, provider: "manual" }));
  assertThrows(() => toRecordArgs({ ...event, provider: "Stripe!" }));
  assertThrows(() => toRecordArgs({ ...event, externalId: "" }));
  assertThrows(() => toRecordArgs({ ...event, ownerId: "x" }));
  assertThrows(() => toRecordArgs({ ...event, amountCents: 0 }));
  assertThrows(() => toRecordArgs({ ...event, amountCents: 1.5 }));
  assertThrows(() => toRecordArgs({ ...event, status: "paid" as never }));
});
