// submit-booking: receives the public website's booking form and stores it as a
// `booking_requests` row for staff to review. Also queues emails in `messages`
// (a separate sender function delivers them once the email domain exists).
//
// Public endpoint: verify_jwt = false in config.toml, so the website needs no key.
// Secrets (set with `supabase secrets set`):
//   ALLOWED_ORIGINS       comma-separated origins allowed by CORS (default: *)
//   TURNSTILE_SECRET_KEY  Cloudflare Turnstile secret; when unset, the check is skipped
//                         unless REQUIRE_TURNSTILE is true
//   REQUIRE_TURNSTILE     "true" = refuse every submission while the secret is missing
//   STAFF_EMAIL           where new-request notifications go (optional)
//
// Abuse controls: a honeypot field (`hp_extra`), a minimum time on the page
// before submitting, throttling per email and per IP, and at most one owner
// confirmation email per address every 30 minutes.
import { cleanIp, validate } from "./validate.ts";

const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "*").split(",").map((s) => s.trim()).filter(Boolean);
const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
const requireTurnstile = Deno.env.get("REQUIRE_TURNSTILE") === "true";
const staffEmail = Deno.env.get("STAFF_EMAIL");

const MIN_FILL_MS = 3000; // faster than this is a bot
const MAX_PER_EMAIL_PER_HOUR = 3;
const MAX_PER_IP_PER_HOUR = 10;
const CONFIRMATION_EMAIL_GAP_MS = 30 * 60 * 1000;

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

// Counts rows matching PostgREST filters, e.g. { created_at: "gte.2026-..." }.
async function count(table: string, filters: Record<string, string>): Promise<number> {
  const qs = new URLSearchParams({ select: "id", ...filters });
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${qs}`, {
    method: "HEAD",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: "count=exact" },
  });
  const total = Number(res.headers.get("content-range")?.split("/")[1]);
  if (!res.ok || !Number.isFinite(total)) throw new Error(`count on ${table} failed: ${res.status}`);
  return total;
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
  if (!turnstileSecret) {
    if (requireTurnstile) console.error("REQUIRE_TURNSTILE is set but TURNSTILE_SECRET_KEY is missing");
    return !requireTurnstile;
  }
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

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return json(req, 400, { ok: false, error: "invalid_json" });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return json(req, 400, { ok: false, error: "invalid_json" });
  }
  const body = parsed as Record<string, unknown>;

  // Bots: real people never fill the hidden `hp_extra` field, and take more
  // than a few seconds to fill the form (the page sends `elapsed_ms`).
  // Pretend success so they don't adapt; nothing is stored.
  if (typeof body.hp_extra === "string" && body.hp_extra.trim() !== "") {
    return json(req, 201, { ok: true });
  }
  if (typeof body.elapsed_ms !== "number" || !(body.elapsed_ms >= MIN_FILL_MS)) {
    return json(req, 201, { ok: true });
  }

  const ip = cleanIp(req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]);
  if (!(await turnstileOk(body["cf-turnstile-response"], ip))) {
    return json(req, 403, { ok: false, error: "captcha" });
  }

  const result = validate(body, madridToday());
  if (!result.ok) return json(req, 422, { ok: false, error: "invalid", fields: result.errors });
  const r = result.value;

  const now = Date.now();
  const hourAgo = "gte." + new Date(now - 3600_000).toISOString();
  let recentConfirmation = 0;
  try {
    const [byEmail, byIp] = await Promise.all([
      count("booking_requests", { "payload->owner->>email": `eq.${r.owner.email}`, created_at: hourAgo }),
      ip ? count("booking_requests", { client_ip: `eq.${ip}`, created_at: hourAgo }) : Promise.resolve(0),
    ]);
    if (byEmail >= MAX_PER_EMAIL_PER_HOUR || byIp >= MAX_PER_IP_PER_HOUR) {
      return json(req, 429, { ok: false, error: "too_many_requests" });
    }
    recentConfirmation = await count("messages", {
      recipient: `eq.${r.owner.email}`,
      template: "eq.request_received",
      created_at: "gte." + new Date(now - CONFIRMATION_EMAIL_GAP_MS).toISOString(),
    });
  } catch (e) {
    console.error(e);
    return json(req, 500, { ok: false, error: "server" });
  }

  let row: { id: string };
  try {
    [row] = await insert<{ id: string }>("booking_requests", {
      payload: { ...r, submitted_at: new Date(now).toISOString() },
      client_ip: ip,
    });
  } catch (e) {
    console.error(e);
    return json(req, 500, { ok: false, error: "server" });
  }

  const summary = { owner: r.owner.name, dog: r.dog.name, from: r.dates.from, to: r.dates.to, weekdays: r.dates.weekdays };
  const messages: Record<string, unknown>[] = [];
  // One "we got your request" email per address per half hour is enough.
  if (recentConfirmation === 0) {
    messages.push({ request_id: row.id, recipient: r.owner.email, template: "request_received", language: r.lang, data: summary });
  }
  if (staffEmail) {
    messages.push({ request_id: row.id, recipient: staffEmail, template: "new_request", language: "es", data: summary });
  }
  if (messages.length) {
    try {
      await insert("messages", messages);
    } catch (e) {
      console.error(e); // the request itself is saved; staff still see it in the app
    }
  }

  return json(req, 201, { ok: true, id: row.id });
});
