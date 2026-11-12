// Run with: deno test supabase/functions/submit-booking/
import { assertEquals } from "jsr:@std/assert@1";
import { cleanIp, validate } from "./validate.ts";

const TODAY = "2026-11-11";
const good = {
  name: " Ane Etxeberria ", email: "Ane@Example.com", phone: "+34 600 000 000",
  dogname: "Txuri", breed: "", age: "3 años", size: "m", sex: "f",
  neutered: "on", vacc: "on", med: "", pref: "Le gusta correr",
  from: "2026-11-16", to: "2026-11-20", weekdays: [5, 1, 3, 3, 7],
  notes: "", consent: "on", lang: "en",
};

Deno.test("accepts a complete form and normalises it", () => {
  const r = validate(good, TODAY);
  if (!r.ok) throw new Error(r.errors.join());
  assertEquals(r.value.owner, { name: "Ane Etxeberria", email: "ane@example.com", phone: "+34 600 000 000" });
  assertEquals(r.value.dog.breed, null);
  assertEquals(r.value.dog.neutered, true);
  assertEquals(r.value.dates.weekdays, [1, 3, 5]);
  assertEquals(r.value.lang, "en");
});

Deno.test("reports every missing required field", () => {
  const r = validate({}, TODAY);
  assertEquals(r.ok, false);
  if (r.ok) return;
  assertEquals(r.errors.sort(), [
    "age", "consent", "dogname", "email", "from", "name", "phone", "size", "to", "vacc", "weekdays",
  ]);
});

Deno.test("rejects dates in the past, reversed, impossible or too far ahead", () => {
  const errs = (from: string, to: string) => {
    const r = validate({ ...good, from, to }, TODAY);
    return r.ok ? [] : r.errors;
  };
  assertEquals(errs("2026-11-10", "2026-11-12"), ["from"]);
  assertEquals(errs("2026-11-20", "2026-11-16"), ["to"]);
  assertEquals(errs("2026-02-30", "2026-03-02"), ["from"]);
  assertEquals(errs("2028-01-01", "2028-01-02"), ["from"]);
  assertEquals(errs("2026-11-11", "2026-11-11"), []);
});

Deno.test("rejects weekend-only and bad enum values", () => {
  const r = validate({ ...good, weekdays: [6, 7], size: "xl", sex: "x" }, TODAY);
  assertEquals(r.ok ? [] : r.errors, ["size", "sex", "weekdays"]);
});

Deno.test("rejects a date range with none of the chosen weekdays", () => {
  // 2026-11-21/22 is a weekend; 2026-11-17 is a Tuesday.
  const errs = (from: string, to: string, weekdays: number[]) => {
    const r = validate({ ...good, from, to, weekdays }, TODAY);
    return r.ok ? [] : r.errors;
  };
  assertEquals(errs("2026-11-21", "2026-11-22", [1, 2, 3, 4, 5]), ["weekdays"]);
  assertEquals(errs("2026-11-17", "2026-11-17", [1, 3]), ["weekdays"]);
  assertEquals(errs("2026-11-17", "2026-11-17", [2]), []);
  assertEquals(errs("2026-11-21", "2026-11-23", [1]), []);
});

Deno.test("checks raw values strictly instead of trimming or truncating them", () => {
  const errs = (patch: Record<string, unknown>) => {
    const r = validate({ ...good, ...patch }, TODAY);
    return r.ok ? [] : r.errors;
  };
  assertEquals(errs({ size: "mx" }), ["size"]);
  assertEquals(errs({ size: " m" }), ["size"]);
  assertEquals(errs({ size: "M" }), ["size"]);
  assertEquals(errs({ sex: "female" }), ["sex"]);
  assertEquals(errs({ sex: "" }), []);
  assertEquals(errs({ sex: null }), []);
  assertEquals(errs({ from: "2026-11-16xyz" }), ["from"]);
  assertEquals(errs({ from: " 2026-11-16" }), ["from"]);
  assertEquals(errs({ to: "2026-11-200" }), ["to"]);
  assertEquals(errs({ email: "a".repeat(190) + "@example.com" }), ["email"]);
  assertEquals(errs({ email: " ane@example.com " }), []);
});

Deno.test("treats non-object input as empty", () => {
  for (const input of [null, [], 5, "x"]) {
    const r = validate(input, TODAY);
    assertEquals(r.ok, false);
  }
});

Deno.test("cleanIp keeps only well-formed addresses", () => {
  assertEquals(cleanIp(" 203.0.113.7 "), "203.0.113.7");
  assertEquals(cleanIp("2001:db8::1"), "2001:db8::1");
  assertEquals(cleanIp("256.1.1.1"), null);
  assertEquals(cleanIp("1.2.3"), null);
  assertEquals(cleanIp(":::::"), null);
  assertEquals(cleanIp("unknown"), null);
  assertEquals(cleanIp(null), null);
});
