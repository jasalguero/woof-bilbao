// Turns the database's public_prices() JSON into what the website reads.
// Kept separate from index.ts so it can be unit tested without a database.
//
// Response shape (all amounts in euro cents, net of VAT):
//   { currency: "EUR",
//     current: { valid_from, day_price_cents, pack_price_cents, pack_days,
//                pack_valid_months, vat_rate, second_dog_discount_pct } | null,
//     next:    same shape | null }      (a price change already scheduled)

export interface PriceList {
  valid_from: string;
  day_price_cents: number;
  pack_price_cents: number;
  pack_days: number;
  pack_valid_months: number;
  vat_rate: number;
  second_dog_discount_pct: number;
}

export interface PublicPrices {
  currency: "EUR";
  current: PriceList | null;
  next: PriceList | null;
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function priceList(v: unknown): PriceList | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const out = {
    valid_from: typeof o.valid_from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.valid_from) ? o.valid_from : null,
    day_price_cents: num(o.day_price_cents),
    pack_price_cents: num(o.pack_price_cents),
    pack_days: num(o.pack_days),
    pack_valid_months: num(o.pack_valid_months),
    vat_rate: num(o.vat_rate),
    second_dog_discount_pct: num(o.second_dog_discount_pct) ?? 0,
  };
  for (const value of Object.values(out)) if (value === null) return null;
  return out as PriceList;
}

/** Validates and normalises public_prices(); anything malformed becomes null. */
export function toPublicPrices(raw: unknown): PublicPrices {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return { currency: "EUR", current: priceList(o.current), next: priceList(o.next) };
}
