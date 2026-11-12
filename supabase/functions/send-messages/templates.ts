// Email templates, in Spanish and English, for every message the database
// and the Edge Functions queue in `messages`. Each one turns `messages.data`
// into a subject, a plain-text body and a simple HTML body. Everything that
// comes from data is escaped in the HTML.
//
// Data shapes (what the queuing code puts in messages.data):
//   request_received, new_request, request_declined:
//     { owner, dog, from, to, weekdays }
//   request_accepted:
//     { owner, dog, from, to, weekdays, booking_status: 'confirmed' | 'pending' }
//   vaccine_reminder:
//     { owner, dog, next_day, checked_until, reason: 'not_confirmed' | 'expired' | 'expiring' }
import { dateRange, escapeHtml, type Lang, longDate, text, weekdaysText } from "./format.ts";

export type { Lang };

export interface Rendered {
  subject: string;
  text: string;
  html: string;
}

/** A body is a greeting plus paragraphs; layout and sign-off are shared. */
interface Body {
  subject: string;
  greeting: string;
  paragraphs: string[];
}

type Data = Record<string, unknown>;
type Template = Record<Lang, (d: Data) => Body>;

export const SIGNATURE = "Woof Bilbao";

const greet = {
  es: (d: Data) => (text(d.owner) ? `¡Hola, ${firstName(d.owner)}!` : "¡Hola!"),
  en: (d: Data) => (text(d.owner) ? `Hi ${firstName(d.owner)},` : "Hi there,"),
};

function firstName(v: unknown): string {
  return text(v).split(" ")[0];
}

function dogName(lang: Lang, d: Data): string {
  return text(d.dog, lang === "es" ? "tu perro" : "your dog", 80);
}

/** "del lunes 1 al viernes 5 de diciembre de 2026 (de lunes a viernes)". */
function when(lang: Lang, d: Data): string {
  const range = dateRange(lang, d.from, d.to);
  const days = weekdaysText(lang, d.weekdays);
  const single = text(d.from) !== "" && text(d.from) === text(d.to);
  return days && !single ? `${range} (${days})` : range;
}

export const templates: Record<string, Template> = {
  request_received: {
    es: (d) => ({
      subject: `Hemos recibido tu solicitud para ${dogName("es", d)}`,
      greeting: greet.es(d),
      paragraphs: [
        `¡Gracias por escribirnos! Nos ha llegado tu solicitud para ${dogName("es", d)} ${when("es", d)}.`,
        "La revisamos con calma y te respondemos pronto, normalmente en un día laborable. Ten en cuenta que todavía no es una reserva confirmada.",
        "Si quieres contarnos algo más, responde a este email.",
      ],
    }),
    en: (d) => ({
      subject: `We've got your request for ${dogName("en", d)}`,
      greeting: greet.en(d),
      paragraphs: [
        `Thanks for getting in touch! We've received your request for ${dogName("en", d)} ${when("en", d)}.`,
        "We'll look at it carefully and get back to you soon, usually within one working day. Please note it isn't a confirmed booking yet.",
        "If there's anything else you'd like to tell us, just reply to this email.",
      ],
    }),
  },

  new_request: {
    es: (d) => ({
      subject: `Nueva solicitud: ${dogName("es", d)} (${text(d.owner, "sin nombre")})`,
      greeting: "¡Hola, equipo!",
      paragraphs: [
        `Ha llegado una solicitud nueva desde la web: ${dogName("es", d)}, de ${text(d.owner, "alguien sin nombre")}, ${when("es", d)}.`,
        "La tenéis en la app del equipo, en Solicitudes.",
      ],
    }),
    en: (d) => ({
      subject: `New request: ${dogName("en", d)} (${text(d.owner, "no name")})`,
      greeting: "Hi team,",
      paragraphs: [
        `A new request has come in from the website: ${dogName("en", d)}, from ${text(d.owner, "someone with no name")}, ${when("en", d)}.`,
        "You'll find it in the staff app, under Requests.",
      ],
    }),
  },

  request_accepted: {
    es: (d) =>
      d.booking_status === "pending"
        ? {
          subject: `Hemos aceptado tu solicitud para ${dogName("es", d)}`,
          greeting: greet.es(d),
          paragraphs: [
            `Hemos aceptado tu solicitud para ${dogName("es", d)} ${when("es", d)}.`,
            "Aún nos falta confirmar algún detalle; te escribimos en cuanto la reserva esté confirmada.",
          ],
        }
        : {
          subject: `¡Reserva confirmada para ${dogName("es", d)}!`,
          greeting: greet.es(d),
          paragraphs: [
            `¡Buenas noticias! Tenemos plaza para ${dogName("es", d)} ${when("es", d)}. La reserva está confirmada.`,
            `Tenemos muchas ganas de conocer a ${dogName("es", d)}. Si cambia algo, responde a este email.`,
          ],
        },
    en: (d) =>
      d.booking_status === "pending"
        ? {
          subject: `We've accepted your request for ${dogName("en", d)}`,
          greeting: greet.en(d),
          paragraphs: [
            `We've accepted your request for ${dogName("en", d)} ${when("en", d)}.`,
            "There's still a detail or two to confirm; we'll write again as soon as the booking is confirmed.",
          ],
        }
        : {
          subject: `Booking confirmed for ${dogName("en", d)}!`,
          greeting: greet.en(d),
          paragraphs: [
            `Good news! We have room for ${dogName("en", d)} ${when("en", d)}. The booking is confirmed.`,
            `We can't wait to meet ${dogName("en", d)}. If anything changes, just reply to this email.`,
          ],
        },
  },

  request_declined: {
    es: (d) => ({
      subject: `Sobre tu solicitud para ${dogName("es", d)}`,
      greeting: greet.es(d),
      paragraphs: [
        `Muchas gracias por pensar en nosotros. Lo sentimos de verdad, pero no tenemos plaza para ${dogName("es", d)} ${when("es", d)}.`,
        "Si te vienen bien otras fechas, responde a este email o envíanos una nueva solicitud y lo miramos encantados.",
      ],
    }),
    en: (d) => ({
      subject: `About your request for ${dogName("en", d)}`,
      greeting: greet.en(d),
      paragraphs: [
        `Thank you for thinking of us. We're really sorry, but we don't have room for ${dogName("en", d)} ${when("en", d)}.`,
        "If other dates work for you, reply to this email or send us a new request and we'll happily take a look.",
      ],
    }),
  },

  vaccine_reminder: {
    es: (d) => {
      const dog = dogName("es", d);
      const until = longDate("es", d.checked_until);
      const first = d.reason === "expired" && until
        ? `Según nuestras notas, las vacunas de ${dog} estaban revisadas hasta el ${until}.`
        : d.reason === "expiring" && until
        ? `Según nuestras notas, las vacunas de ${dog} vencen el ${until}.`
        : `Todavía no tenemos confirmado que ${dog} tenga las vacunas al día.`;
      const next = longDate("es", d.next_day);
      return {
        subject: `Recordatorio de vacunas de ${dog}`,
        greeting: greet.es(d),
        paragraphs: [
          first,
          next
            ? `¿Nos traes la cartilla en su próxima visita, el ${next}, o nos mandas una foto respondiendo a este email?`
            : "¿Nos traes la cartilla en su próxima visita, o nos mandas una foto respondiendo a este email?",
          "Es solo un recordatorio: la reserva sigue igual. ¡Gracias por cuidar de todos!",
        ],
      };
    },
    en: (d) => {
      const dog = dogName("en", d);
      const until = longDate("en", d.checked_until);
      const first = d.reason === "expired" && until
        ? `Our notes say ${dog}'s vaccines were checked until ${until}.`
        : d.reason === "expiring" && until
        ? `Our notes say ${dog}'s vaccines run out on ${until}.`
        : `We haven't yet had confirmation that ${dog}'s vaccines are up to date.`;
      const next = longDate("en", d.next_day);
      return {
        subject: `Vaccine reminder for ${dog}`,
        greeting: greet.en(d),
        paragraphs: [
          first,
          next
            ? `Could you bring the vaccination booklet on the next visit, on ${next}, or reply to this email with a photo of it?`
            : "Could you bring the vaccination booklet on the next visit, or reply to this email with a photo of it?",
          "It's just a reminder: the booking stays as it is. Thanks for helping us keep everyone healthy!",
        ],
      };
    },
  },
};

export const TEMPLATE_NAMES = Object.keys(templates);
export const LANGS: Lang[] = ["es", "en"];

export class TemplateError extends Error {}

const closing: Record<Lang, string> = { es: "Un abrazo,", en: "Warm wishes," };

/** Renders a queued message. Throws TemplateError for an unknown template. */
export function render(template: string, lang: string, data: unknown): Rendered {
  const t = templates[template];
  if (!t) throw new TemplateError(`unknown template: ${template}`);
  const l: Lang = lang === "en" ? "en" : "es";
  const d: Data = data && typeof data === "object" && !Array.isArray(data) ? data as Data : {};
  const body = t[l](d);

  const text = [body.greeting, ...body.paragraphs, `${closing[l]}\n${SIGNATURE}`].join("\n\n") + "\n";
  const p = (s: string) => `<p style="margin:0 0 14px">${escapeHtml(s)}</p>`;
  const html = `<!doctype html>
<html lang="${l}"><head><meta charset="utf-8"><title>${escapeHtml(body.subject)}</title></head>
<body style="margin:0;padding:24px;background:#fff4d6;color:#1d1b3a;font:16px/1.5 Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;background:#fffaf0;border:2px solid #1d1b3a;border-radius:14px;padding:24px">
${p(body.greeting)}
${body.paragraphs.map(p).join("\n")}
<p style="margin:0">${escapeHtml(closing[l])}<br><strong>${escapeHtml(SIGNATURE)}</strong></p>
</div>
</body></html>
`;
  return { subject: body.subject, text, html };
}
