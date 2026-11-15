// Run with: deno test supabase/functions/send-messages/
import { assert, assertEquals, assertMatch, assertStringIncludes, assertThrows } from "jsr:@std/assert@1";
import { dateRange, escapeHtml, longDate, money, namesList, weekdaysText } from "./format.ts";
import { LANGS, render, SIGNATURE, TEMPLATE_NAMES, TemplateError } from "./templates.ts";

// Every template the database or the Edge Functions queue today. Adding a
// new one to the queueing code without a template makes this test fail.
const QUEUED = ["request_received", "new_request", "request_accepted", "request_declined", "vaccine_reminder", "balance_reminder"];

const SAMPLE: Record<string, Record<string, unknown>> = {
  request_received: { owner: "Ane Etxeberria", dog: "Txuri", from: "2026-12-01", to: "2026-12-19", weekdays: [2, 4] },
  new_request: { owner: "Ane Etxeberria", dog: "Txuri", from: "2026-12-01", to: "2026-12-19", weekdays: [2, 4] },
  request_accepted: { owner: "Ane Etxeberria", dog: "Txuri", from: "2026-12-01", to: "2026-12-19", weekdays: [1, 2, 3, 4, 5], booking_status: "confirmed" },
  request_declined: { owner: "Ane Etxeberria", dog: "Txuri", from: "2026-12-01", to: "2026-12-01", weekdays: [2] },
  vaccine_reminder: { owner: "Ane Etxeberria", dog: "Txuri", next_day: "2026-11-16", checked_until: "2026-11-20", reason: "expiring" },
  balance_reminder: { owner: "Ane Etxeberria", dogs: ["Txuri", "Beltza"], balance_cents: 7260, unpaid_days: 2, since: "2026-11-16" },
};

Deno.test("every queued template exists in Spanish and English", () => {
  assertEquals([...TEMPLATE_NAMES].sort(), [...QUEUED].sort());
  for (const name of QUEUED) {
    for (const lang of LANGS) {
      const r = render(name, lang, SAMPLE[name]);
      assert(r.subject.length > 5, `${name}/${lang} subject`);
      assertStringIncludes(r.subject, "Txuri", `${name}/${lang} subject names the dog`);
      assertStringIncludes(r.text, "Txuri", `${name}/${lang} text names the dog`);
      assertStringIncludes(r.html, "Txuri", `${name}/${lang} html names the dog`);
      assertStringIncludes(r.text, SIGNATURE, `${name}/${lang} text signs off`);
      assertStringIncludes(r.html, SIGNATURE, `${name}/${lang} html signs off`);
      assertStringIncludes(r.html, `<html lang="${lang}">`);
    }
  }
});

Deno.test("Spanish and English bodies differ (no untranslated copies)", () => {
  for (const name of QUEUED) {
    const es = render(name, "es", SAMPLE[name]);
    const en = render(name, "en", SAMPLE[name]);
    assert(es.subject !== en.subject, name);
    assert(es.text !== en.text, name);
  }
});

Deno.test("no pricing anywhere except the balance reminder", () => {
  for (const name of QUEUED.filter((n) => n !== "balance_reminder")) {
    for (const lang of LANGS) {
      const r = render(name, lang, SAMPLE[name]);
      assert(!/€|eur|precio|price|tarifa/i.test(r.text), `${name}/${lang}`);
    }
  }
});

Deno.test("request_received says the dates and weekdays in words", () => {
  const es = render("request_received", "es", SAMPLE.request_received);
  assertEquals(es.subject, "Hemos recibido tu solicitud para Txuri");
  assertStringIncludes(es.text, "¡Hola, Ane!");
  assertStringIncludes(es.text, "del martes 1 de diciembre al sábado 19 de diciembre de 2026 (los martes y jueves)");
  const en = render("request_received", "en", SAMPLE.request_received);
  assertStringIncludes(en.text, "Hi Ane,");
  assertStringIncludes(en.text, "from Tuesday 1 December to Saturday 19 December 2026 (Tuesdays and Thursdays)");
  assertMatch(en.text, /Warm wishes,\nWoof Bilbao\n$/);
});

Deno.test("request_accepted reflects whether the booking is confirmed", () => {
  const confirmed = render("request_accepted", "es", SAMPLE.request_accepted);
  assertEquals(confirmed.subject, "¡Reserva confirmada para Txuri!");
  assertStringIncludes(confirmed.text, "(de lunes a viernes)");
  const pending = render("request_accepted", "en", { ...SAMPLE.request_accepted, booking_status: "pending" });
  assertEquals(pending.subject, "We've accepted your request for Txuri");
  assertStringIncludes(pending.text, "as soon as the booking is confirmed");
});

Deno.test("a single day is said once, without the weekday list", () => {
  const r = render("request_declined", "en", SAMPLE.request_declined);
  assertStringIncludes(r.text, "for Txuri on Tuesday 1 December 2026.");
  const es = render("request_declined", "es", SAMPLE.request_declined);
  assertStringIncludes(es.text, "para Txuri el martes 1 de diciembre de 2026.");
});

Deno.test("vaccine_reminder explains why, softly", () => {
  const exp = render("vaccine_reminder", "es", SAMPLE.vaccine_reminder);
  assertEquals(exp.subject, "Recordatorio de vacunas de Txuri");
  assertStringIncludes(exp.text, "vencen el viernes 20 de noviembre de 2026");
  assertStringIncludes(exp.text, "el lunes 16 de noviembre de 2026");
  assertStringIncludes(exp.text, "la reserva sigue igual");
  const past = render("vaccine_reminder", "en", { ...SAMPLE.vaccine_reminder, reason: "expired", checked_until: "2026-10-01" });
  assertStringIncludes(past.text, "checked until Thursday 1 October 2026");
  const unconfirmed = render("vaccine_reminder", "en", { owner: "Mark", dog: "Pepper", next_day: "2026-11-16", reason: "not_confirmed" });
  assertStringIncludes(unconfirmed.text, "We haven't yet had confirmation that Pepper's vaccines are up to date.");
  assertStringIncludes(unconfirmed.text, "the booking stays as it is");
});

Deno.test("balance_reminder says the amount, days and dogs, softly", () => {
  const es = render("balance_reminder", "es", SAMPLE.balance_reminder);
  assertEquals(es.subject, "Recordatorio de pago de Woof Bilbao (Txuri y Beltza)");
  assertStringIncludes(es.text, "saldo pendiente de 72,60 € (2 días de guardería, desde el lunes 16 de noviembre de 2026)");
  assertStringIncludes(es.text, "todo sigue igual para Txuri y Beltza");
  const en = render("balance_reminder", "en", { ...SAMPLE.balance_reminder, unpaid_days: 1, balance_cents: 123456 });
  assertEquals(en.subject, "Payment reminder from Woof Bilbao (Txuri and Beltza)");
  assertStringIncludes(en.text, "outstanding balance of €1,234.56 (1 day of daycare, since Monday 16 November 2026)");
  const bare = render("balance_reminder", "en", { balance_cents: 500 });
  assertEquals(bare.subject, "Payment reminder from Woof Bilbao");
  assertStringIncludes(bare.text, "balance of €5.00.");
});

Deno.test("money and name lists", () => {
  assertEquals(money("es", 3630), "36,30 €");
  assertEquals(money("es", 123456), "1234,56 €");
  assertEquals(money("es", 12345678), "123.456,78 €");
  assertEquals(money("en", 12345678), "€123,456.78");
  assertEquals(money("en", -500), "-€5.00");
  assertEquals(money("es", "nope"), "");
  assertEquals(namesList("es", ["A", "B", "C"]), "A, B y C");
  assertEquals(namesList("en", "x"), "");
});

Deno.test("HTML escapes everything that comes from data", () => {
  const evil = { owner: "<b>Eve</b> & co", dog: `"><script>alert(1)</script>`, dogs: [`"><script>alert(1)</script>`], from: "2026-12-01", to: "2026-12-02", weekdays: [2, 3] };
  for (const name of QUEUED) {
    for (const lang of LANGS) {
      const r = render(name, lang, evil);
      assert(!r.html.includes("<script>"), `${name}/${lang}`);
      assert(!r.html.includes("<b>Eve"), `${name}/${lang}`);
      assertStringIncludes(r.html, "&lt;script&gt;");
    }
  }
  assertEquals(escapeHtml(`<a href="x">'&'</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
});

Deno.test("missing or odd data still renders something sensible", () => {
  const es = render("request_received", "es", {});
  assertStringIncludes(es.subject, "tu perro");
  assertStringIncludes(es.text, "¡Hola!");
  const en = render("request_accepted", "fr", null); // unknown language falls back to Spanish
  assertStringIncludes(en.subject, "tu perro");
  const odd = render("new_request", "en", { dog: "Rex\n\nBcc: x@y.z", owner: 42 });
  assert(!odd.subject.includes("\n"), "subjects are single-line");
});

Deno.test("an unknown template is an error", () => {
  assertThrows(() => render("nope", "es", {}), TemplateError);
});

Deno.test("date and weekday helpers", () => {
  assertEquals(longDate("es", "2026-12-01"), "martes 1 de diciembre de 2026");
  assertEquals(longDate("en", "2026-12-01"), "Tuesday 1 December 2026");
  assertEquals(longDate("en", "2026-02-30"), "2026-02-30");
  assertEquals(dateRange("es", "2026-12-28", "2027-01-08"), "del lunes 28 de diciembre de 2026 al viernes 8 de enero de 2027");
  assertEquals(dateRange("en", "2026-12-28", "2027-01-08"), "from Monday 28 December 2026 to Friday 8 January 2027");
  assertEquals(weekdaysText("es", [5, 1, 3]), "los lunes, miércoles y viernes");
  assertEquals(weekdaysText("en", [1]), "Mondays");
  assertEquals(weekdaysText("en", [1, 2, 3, 4, 5]), "Monday to Friday");
  assertEquals(weekdaysText("es", "nope"), "");
});
