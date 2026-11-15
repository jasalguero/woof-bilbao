// Run with: deno test supabase/functions/public-prices/
import { assertEquals } from "jsr:@std/assert@1";
import { toPublicPrices } from "./prices.ts";

const row = {
  valid_from: "2026-11-15", day_price_cents: 3000, pack_price_cents: 27000, pack_days: 10,
  pack_valid_months: 6, vat_rate: 21.0, second_dog_discount_pct: 0,
};

Deno.test("passes a well-formed price list through", () => {
  assertEquals(toPublicPrices({ currency: "EUR", current: row, next: null }), { currency: "EUR", current: row, next: null });
});

Deno.test("accepts numeric strings (Postgres numerics) and a missing discount", () => {
  const { second_dog_discount_pct: _, ...noDiscount } = row;
  const out = toPublicPrices({ current: { ...noDiscount, vat_rate: "21.00" }, next: { ...row, valid_from: "2027-01-01" } });
  assertEquals(out.current?.vat_rate, 21);
  assertEquals(out.current?.second_dog_discount_pct, 0);
  assertEquals(out.next?.valid_from, "2027-01-01");
});

Deno.test("anything malformed becomes null instead of a wrong price", () => {
  assertEquals(toPublicPrices(null), { currency: "EUR", current: null, next: null });
  assertEquals(toPublicPrices({ current: { ...row, day_price_cents: "abc" } }).current, null);
  assertEquals(toPublicPrices({ current: { ...row, valid_from: "soon" } }).current, null);
  assertEquals(toPublicPrices([row]).current, null);
});
