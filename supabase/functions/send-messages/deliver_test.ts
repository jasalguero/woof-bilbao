// Run with: deno test supabase/functions/send-messages/
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { bearerMatches, classifyStatus, deliverBatch, type Email, type Outcome, type QueuedMessage, resendSender } from "./deliver.ts";

function msg(id: string, extra: Partial<QueuedMessage> = {}): QueuedMessage {
  return { id, recipient: `${id}@example.com`, template: "request_received", language: "es", data: { dog: "Txuri" }, attempts: 1, ...extra };
}

Deno.test("deliverBatch sends each claimed row and records the outcome", async () => {
  const sent: Email[] = [];
  const done: [string, Outcome][] = [];
  const pauses: number[] = [];
  const replies: Outcome[] = [
    { outcome: "sent", providerId: "re_1" },
    { outcome: "retry", error: "503 down" },
    { outcome: "failed", error: "422 bad" },
  ];
  const summary = await deliverBatch(
    {
      claim: (limit) => Promise.resolve(limit === 25 ? [msg("a"), msg("b"), msg("c"), msg("d", { template: "nope" }), msg("e", { recipient: "not-an-email" })] : []),
      complete: (id, o) => (done.push([id, o]), Promise.resolve()),
      send: (e) => (sent.push(e), Promise.resolve(replies.shift()!)),
      pause: (ms) => (pauses.push(ms), Promise.resolve()),
    },
    { from: "Woof Bilbao <hola@example.com>", replyTo: "hola@example.com", limit: 25, gapMs: 600 },
  );
  assertEquals(summary, { claimed: 5, sent: 1, retry: 1, failed: 3 });
  assertEquals(sent.map((e) => e.to), ["a@example.com", "b@example.com", "c@example.com"]);
  assertEquals(sent[0].idempotencyKey, "woof-message-a");
  assertEquals(sent[0].from, "Woof Bilbao <hola@example.com>");
  assertEquals(sent[0].replyTo, "hola@example.com");
  assertEquals(pauses, [600, 600]);
  assertEquals(done.map(([id, o]) => [id, o.outcome]), [["a", "sent"], ["b", "retry"], ["c", "failed"], ["d", "failed"], ["e", "failed"]]);
  assertStringIncludes((done[3][1] as { error: string }).error, "unknown template");
});

Deno.test("deliverBatch keeps going when recording an outcome fails", async () => {
  const logged: unknown[] = [];
  const summary = await deliverBatch(
    {
      claim: () => Promise.resolve([msg("a"), msg("b")]),
      complete: (id) => (id === "a" ? Promise.reject(new Error("db down")) : Promise.resolve()),
      send: () => Promise.resolve({ outcome: "sent" }),
      pause: () => Promise.resolve(),
      log: (...a) => logged.push(a),
    },
    { from: "x@example.com", limit: 10, gapMs: 0 },
  );
  assertEquals(summary.sent, 2);
  assertEquals(logged.length, 1);
});

Deno.test("classifyStatus: retry on 408/429/5xx, fail on other 4xx", () => {
  assertEquals([200, 202, 400, 401, 403, 408, 422, 429, 500, 503].map(classifyStatus), [
    "sent", "sent", "failed", "failed", "failed", "retry", "failed", "retry", "retry", "retry",
  ]);
});

Deno.test("resendSender posts the email and reads the result", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (status: number, body: string) => ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(body, { status }));
  }) as unknown as typeof fetch;
  const email: Email = { from: "F <f@x.com>", to: "t@x.com", replyTo: "r@x.com", subject: "S", text: "T", html: "<p>H</p>", idempotencyKey: "k1" };

  assertEquals(await resendSender("http://mock/", "key", fake(200, '{"id":"re_9"}'))(email), { outcome: "sent", providerId: "re_9" });
  assertEquals(calls[0].url, "http://mock/emails");
  const headers = calls[0].init.headers as Record<string, string>;
  assertEquals(headers.Authorization, "Bearer key");
  assertEquals(headers["Idempotency-Key"], "k1");
  assertEquals(JSON.parse(calls[0].init.body as string), { from: "F <f@x.com>", to: ["t@x.com"], subject: "S", text: "T", html: "<p>H</p>", reply_to: "r@x.com" });

  assertEquals(await resendSender("http://mock", "key", fake(500, '{"message":"boom"}'))(email), { outcome: "retry", error: "500 boom" });
  assertEquals(await resendSender("http://mock", "key", fake(422, '{"message":"Invalid `to` field"}'))(email), { outcome: "failed", error: "422 Invalid `to` field" });
  const broken = (() => Promise.reject(new TypeError("connection refused"))) as unknown as typeof fetch;
  assertEquals(await resendSender("http://mock", "key", broken)(email), { outcome: "retry", error: "network: connection refused" });
});

Deno.test("bearerMatches only accepts the exact secret", () => {
  assertEquals(bearerMatches("Bearer s3cret", "s3cret"), true);
  assertEquals(bearerMatches("bearer  s3cret ", "s3cret"), true);
  assertEquals(bearerMatches("Bearer s3cre", "s3cret"), false);
  assertEquals(bearerMatches("Bearer s3cretX", "s3cret"), false);
  assertEquals(bearerMatches("s3cret", "s3cret"), false);
  assertEquals(bearerMatches(null, "s3cret"), false);
  assertEquals(bearerMatches("Bearer ", ""), false);
});
