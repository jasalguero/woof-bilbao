// submit-booking: receives the public website's booking form and stores it as a
// `booking_requests` row for staff to review. Also queues emails in `messages`
// (a separate sender function delivers them once the email domain exists).
//
// Public endpoint: verify_jwt = false in config.toml, so the website needs no key.
// Secrets (set with `supabase secrets set`):
//   ALLOWED_ORIGINS       comma-separated origins allowed by CORS (default: *)
//   TURNSTILE_SECRET_KEY  Cloudflare Turnstile secret; when unset, the check is skipped
//   STAFF_EMAIL           where new-request notifications go (optional)
import { validate } from "./validate.ts";

const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
const staffEmail = Deno.env.get("STAFF_EMAIL");

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Inserts rows through the Data API with the service role (bypasses RLS).
// Plain fetch keeps the function dependency-free.
async function insert<T>(table: string, rows: unknown): Promise<T[]> {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`insert into ${table} failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = allowed.includes("*") ? "*" : allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

function madridToday(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

async function turnstileOk(token: unknown, ip: string | null): Promise<boolean> {
  if (!turnstileSecret) return true;
  if (typeof token !== "string" || !token) return false;
  const form = new FormData();
  form.append("secret", turnstileSecret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const out = await res.json();
    return out.success === true;
  } catch (e) {
    console.error("turnstile check failed", e);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { ok: false, error: "invalid_json" });
  }

  // Honeypot: real people never fill the hidden "website" field. Pretend success.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return json(req, 201, { ok: true });
  }

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await turnstileOk(body["cf-turnstile-response"], ip))) {
    return json(req, 403, { ok: false, error: "captcha" });
  }

  const result = validate(body, madridToday());
  if (!result.ok) return json(req, 422, { ok: false, error: "invalid", fields: result.errors });
  const r = result.value;

  let row: { id: string };
  try {
    [row] = await insert<{ id: string }>("booking_requests", {
      payload: { ...r, submitted_at: new Date().toISOString() },
    });
  } catch (e) {
    console.error(e);
    return json(req, 500, { ok: false, error: "server" });
  }

  const summary = { owner: r.owner.name, dog: r.dog.name, from: r.dates.from, to: r.dates.to, weekdays: r.dates.weekdays };
  const messages = [
    { request_id: row.id, recipient: r.owner.email, template: "request_received", language: r.lang, data: summary },
  ];
  if (staffEmail) {
    messages.push({ request_id: row.id, recipient: staffEmail, template: "new_request", language: "es", data: summary });
  }
  try {
    await insert("messages", messages);
  } catch (e) {
    console.error(e); // the request itself is saved; staff still see it in the app
  }

  return json(req, 201, { ok: true, id: row.id });
});
