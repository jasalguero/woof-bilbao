// send-messages: delivers queued `messages` rows with channel 'email'
// through Resend's HTTP API. pg_cron calls it every 5 minutes through
// pg_net (see the daily_operations migration); it can also be called by hand.
//
// verify_jwt = false in config.toml: the caller is the database, not a
// logged-in user. Instead every call must carry the shared secret:
//   Authorization: Bearer <SEND_MESSAGES_SECRET>
//
// Secrets (set with `supabase secrets set`):
//   SEND_MESSAGES_SECRET  shared secret callers pass as a bearer token (required)
//   RESEND_API_KEY        Resend API key
//   EMAIL_FROM            sender, e.g. "Woof Bilbao <hola@example.com>" (a verified Resend domain)
//   EMAIL_REPLY_TO        optional Reply-To address
//   RESEND_API_URL        optional API base, default https://api.resend.com (tests point it at a mock)
//
// Until RESEND_API_KEY and EMAIL_FROM are set, the function logs that and
// returns without touching any row, so messages simply stay queued.
//
// Each run claims up to BATCH rows atomically (claim_messages: FOR UPDATE
// SKIP LOCKED), so overlapping runs never send the same row. Each row ends
// 'sent', back to 'queued' for a retry (5xx, 429, network; at most 3
// attempts) or 'failed' with the error (complete_message).
import { bearerMatches, deliverBatch, type Outcome, type QueuedMessage, resendSender } from "./deliver.ts";

const BATCH = 25;
const GAP_MS = 600; // stays under Resend's default limit of 2 requests per second

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const secret = Deno.env.get("SEND_MESSAGES_SECRET") ?? "";
  if (!secret) {
    console.error("SEND_MESSAGES_SECRET is not set; refusing to run");
    return json(503, { ok: false, error: "not_configured" });
  }
  if (!bearerMatches(req.headers.get("authorization"), secret)) {
    return json(401, { ok: false, error: "unauthorized" });
  }

  const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const from = Deno.env.get("EMAIL_FROM") ?? "";
  if (!apiKey || !from) {
    console.warn("RESEND_API_KEY or EMAIL_FROM is not set: emails stay queued until they are");
    return json(200, { ok: true, skipped: "email_not_configured" });
  }

  const apiUrl = Deno.env.get("RESEND_API_URL") || "https://api.resend.com";
  try {
    const summary = await deliverBatch(
      {
        claim: (limit) => rpc<QueuedMessage[]>("claim_messages", { p_channel: "email", p_limit: limit }),
        complete: async (id: string, o: Outcome) => {
          await rpc("complete_message", {
            p_id: id,
            p_outcome: o.outcome,
            p_error: o.outcome === "sent" ? null : o.error,
            p_provider_id: o.outcome === "sent" ? o.providerId ?? null : null,
          });
        },
        send: resendSender(apiUrl, apiKey),
        pause: (ms) => new Promise((r) => setTimeout(r, ms)),
      },
      { from, replyTo: Deno.env.get("EMAIL_REPLY_TO") || undefined, limit: BATCH, gapMs: GAP_MS },
    );
    if (summary.claimed) console.log("send-messages", summary);
    return json(200, { ok: true, ...summary });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, error: "server" });
  }
});
