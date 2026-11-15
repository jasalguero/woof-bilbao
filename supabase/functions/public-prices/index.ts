// public-prices: the day and pack prices for the public website, read from
// the same price lists the staff app uses (Settings → Prices), so the site
// is always in sync with what staff charge. The website stays static: its
// script fetches this once per page load and fills in the prices.
//
// Public endpoint: verify_jwt = false in config.toml, GET only, no input.
// It reads through public_prices() with the service role; the website never
// talks to tables. Responses are cacheable for 5 minutes.
// Secrets (optional): ALLOWED_ORIGINS, shared with submit-booking (default *).
import { toPublicPrices } from "./prices.ts";

const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: unknown, cache = false): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(req),
      "Content-Type": "application/json",
      "Cache-Control": cache ? "public, max-age=300" : "no-store",
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "GET") return json(req, 405, { ok: false, error: "method_not_allowed" });
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/public_prices`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new Error(`public_prices failed: ${res.status} ${await res.text()}`);
    return json(req, 200, toPublicPrices(await res.json()), true);
  } catch (e) {
    console.error(e);
    return json(req, 500, { ok: false, error: "server" });
  }
});
