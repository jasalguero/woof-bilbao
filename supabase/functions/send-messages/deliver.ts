// The sending loop, kept free of I/O so it can be unit tested: the caller
// passes in how to claim rows, record outcomes and send one email.
import { render, TemplateError } from "./templates.ts";

export interface QueuedMessage {
  id: string;
  recipient: string;
  template: string;
  language: string;
  data: unknown;
  attempts: number;
}

export type Outcome =
  | { outcome: "sent"; providerId?: string }
  | { outcome: "retry" | "failed"; error: string };

export interface Email {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  /** Same key for every attempt at one message, so the provider never sends it twice. */
  idempotencyKey: string;
}

export interface Deps {
  claim(limit: number): Promise<QueuedMessage[]>;
  complete(id: string, outcome: Outcome): Promise<void>;
  send(email: Email): Promise<Outcome>;
  pause(ms: number): Promise<void>;
  log?(...args: unknown[]): void;
}

export interface Options {
  from: string;
  replyTo?: string;
  /** Rows claimed per run. */
  limit: number;
  /** Pause between sends (Resend allows a few requests per second). */
  gapMs: number;
}

export interface Summary {
  claimed: number;
  sent: number;
  retry: number;
  failed: number;
}

// One plain address: no display names, lists or header tricks.
const ADDRESS = `[^\\s@,;<>"]+`;
const EMAIL = new RegExp(`^${ADDRESS}@${ADDRESS}\\.${ADDRESS}$`);

export function isPlainEmail(value: unknown): boolean {
  return typeof value === "string" && EMAIL.test(value.trim());
}

export async function deliverBatch(deps: Deps, opts: Options): Promise<Summary> {
  const log = deps.log ?? console.error;
  const rows = await deps.claim(opts.limit);
  const summary: Summary = { claimed: rows.length, sent: 0, retry: 0, failed: 0 };

  for (let i = 0; i < rows.length; i++) {
    const m = rows[i];
    let result: Outcome;
    if (!isPlainEmail(m.recipient)) {
      result = { outcome: "failed", error: "recipient is not an email address" };
    } else {
      try {
        const r = render(m.template, m.language, m.data);
        if (i > 0) await deps.pause(opts.gapMs);
        result = await deps.send({
          from: opts.from,
          to: m.recipient.trim(),
          replyTo: opts.replyTo,
          subject: r.subject,
          text: r.text,
          html: r.html,
          idempotencyKey: `woof-message-${m.id}`,
        });
      } catch (e) {
        result = e instanceof TemplateError
          ? { outcome: "failed", error: e.message }
          : { outcome: "retry", error: `unexpected: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
    summary[result.outcome === "sent" ? "sent" : result.outcome]++;
    try {
      await deps.complete(m.id, result);
    } catch (e) {
      // The row stays 'sending' and is claimed again after 15 minutes; the
      // idempotency key stops the provider from sending it twice.
      log(`could not record the outcome of message ${m.id}`, e);
    }
  }
  return summary;
}

/** Retry on rate limits, server errors and timeouts; other errors are final. */
export function classifyStatus(status: number): "sent" | "retry" | "failed" {
  if (status >= 200 && status < 300) return "sent";
  if (status === 408 || status === 429 || status >= 500) return "retry";
  return "failed";
}

/** Sends through Resend's HTTP API (POST {apiUrl}/emails). */
export function resendSender(apiUrl: string, apiKey: string, fetchImpl: typeof fetch = fetch) {
  return async (email: Email): Promise<Outcome> => {
    let res: Response;
    try {
      res = await fetchImpl(`${apiUrl.replace(/\/+$/, "")}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": email.idempotencyKey,
        },
        body: JSON.stringify({
          from: email.from,
          to: [email.to],
          subject: email.subject,
          text: email.text,
          html: email.html,
          ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (e) {
      return { outcome: "retry", error: `network: ${e instanceof Error ? e.message : String(e)}` };
    }
    const body = await res.text();
    const kind = classifyStatus(res.status);
    if (kind === "sent") {
      let id: string | undefined;
      try {
        id = JSON.parse(body)?.id;
      } catch {
        // A 2xx without JSON still means it was accepted.
      }
      return { outcome: "sent", providerId: typeof id === "string" ? id : undefined };
    }
    let message = body;
    try {
      message = JSON.parse(body)?.message ?? body;
    } catch {
      // Not JSON: keep the raw text.
    }
    return { outcome: kind, error: `${res.status} ${String(message).slice(0, 500)}`.trim() };
  };
}

/** Constant-time comparison of the bearer token with the shared secret. */
export function bearerMatches(header: string | null, secret: string): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(header?.trim() ?? "");
  if (!match || !secret) return false;
  const a = new TextEncoder().encode(match[1].trim());
  const b = new TextEncoder().encode(secret);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
