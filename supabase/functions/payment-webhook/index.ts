// payment-webhook: where online payment providers (Stripe, Redsys/Bizum) will
// post their events, at /functions/v1/payment-webhook/<provider>. It is NOT
// deployed or enabled yet (config.toml: enabled = false) and no provider is
// configured, so it answers 404 for every provider. Adding one means writing
// its adapter in providers.ts (signature check + event mapping), setting its
// secret with `supabase secrets set`, enabling and deploying this function,
// and pointing the provider's dashboard at the URL. The database side
// (payments table, record_provider_payment) is already in place.
import { adapters, toRecordArgs } from "./providers.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
  const name = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  const adapter = adapters[name];
  if (!adapter) return new Response("unknown provider", { status: 404 });

  const raw = await req.text();
  let event;
  try {
    event = await adapter.parse(req, raw);
  } catch (e) {
    console.error(`${name}: rejected webhook`, e);
    return new Response("bad signature", { status: 400 });
  }
  if (!event) return new Response("ignored", { status: 200 });

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/record_provider_payment`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(toRecordArgs(event)),
  });
  if (!res.ok) {
    console.error(`${name}: record_provider_payment failed`, res.status, await res.text());
    return new Response("retry later", { status: 500 }); // providers retry on 5xx
  }
  return new Response("ok", { status: 200 });
});
