// Deterministic checks applied to every model answer before anything is stored.
import { declaredText, type GroundingEnvelope, type Lang } from "./context.ts";

export const ROLES = ["direct", "close", "professional"] as const;
export type Role = (typeof ROLES)[number];
export interface Proposal { position: 1 | 2 | 3; role: Role; body: string; cta: string }

export const BODY_MIN = 60;
export const BODY_MAX = 600;
export const CTA_MIN = 3;
export const CTA_MAX = 80;
export const MAX_EMOJIS = 1;

export const PROPOSALS_SCHEMA = {
  name: "three_proposals",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["proposals"],
    properties: {
      proposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["role", "body", "cta"],
          properties: { role: { type: "string", enum: [...ROLES] }, body: { type: "string" }, cta: { type: "string" } },
        },
      },
    },
  },
};

const tidy = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

export function parseProposals(raw: string): Proposal[] | null {
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).join() !== "proposals") return null;
  const list = (b as { proposals: unknown }).proposals;
  if (!Array.isArray(list) || list.length !== 3) return null;
  const out: Proposal[] = [];
  for (let i = 0; i < 3; i++) {
    const p = list[i] as Record<string, unknown>;
    if (!p || typeof p !== "object" || Object.keys(p).sort().join() !== "body,cta,role") return null;
    if (p.role !== ROLES[i] || typeof p.body !== "string" || typeof p.cta !== "string") return null;
    const body = tidy(p.body);
    const cta = tidy(p.cta);
    if (body.length < BODY_MIN || body.length > BODY_MAX || cta.length < CTA_MIN || cta.length > CTA_MAX || cta.includes("\n")) return null;
    out.push({ position: (i + 1) as 1 | 2 | 3, role: ROLES[i], body, cta });
  }
  return out;
}

export const CLAIM_RULES: { id: string; re: RegExp }[] = [
  { id: "price", re: /\d+\s?(€|eur|euros?|\$|usd|dólares|dollars)|(€|\$)\s?\d|\b(precios?|prices?|cuesta|costs?|barat[oa]s?|cheap)\b/i },
  { id: "percentage", re: /\d+\s?%/ },
  { id: "time", re: /\b\d{1,2}[:.h]\d{2}\b/ },
  { id: "phone", re: /\+?\d[\d\s-]{7,}\d/ },
  { id: "offer", re: /\b(descuentos?|rebajas?|promoci[oó]n(es)?|oferta(s)?|gratis|gratuit[oa]s?|regalo|2x1|cup[oó]n)\b|\b(discounts?|promotions?|promo|offers?|(?<!feel )free|sale|coupons?|giveaway)\b/i },
  { id: "award", re: /\b(premiad[oa]s?|premios?|galardonad[oa]s?|certificad[oa]s?|certificaci[oó]n|homologad[oa]s?|awards?|award-winning|certified)\b/i },
  { id: "experience_years", re: /\b(\d+\s+(años|years)|desde\s+(19|20)\d\d|since\s+(19|20)\d\d)\b/i },
  { id: "superlative", re: /\bn[uú]mero\s?1\b|\bnumber\s?(one|1)\b|\bgarantizad[oa]s?\b|\bguaranteed\b|\b(el|la|los|las)\s+mejor(es)?\b|\bthe\s+best\b|\b[uú]nic[oa]s?\s+en\b|\bthe\s+only\b/i },
  { id: "social_proof", re: /\b(rese[nñ]as?|opiniones|testimonios?|valoraciones|estrellas|reviews?|testimonials?|stars|rated)\b|\b(nuestros clientes (dicen|aman|adoran)|our (customers|clients) (say|love))\b/i },
  { id: "schedule", re: /\b(horarios?|abrimos|cerramos|abierto (hoy|todos)|opening hours|we open|open (today|daily|every))\b/i },
  { id: "urgency", re: /\b(solo hoy|hoy mismo|[uú]ltimas (unidades|plazas)|plazas limitadas|por tiempo limitado|today only|limited time|last chance|while (stocks|supplies) last|hurry)\b/i },
  { id: "availability", re: /\b(en stock|disponible (hoy|ahora|ya)|available (now|today)|in stock)\b/i },
  { id: "delivery", re: /\b(env[ií]os?|a domicilio|delivery|we deliver|shipping)\b/i },
  { id: "launch", re: /\b(inauguraci[oó]n|nueva apertura|reci[eé]n abiert[oa]|grand opening|new opening|just opened)\b/i },
  { id: "health", re: /\b(curar?|cura|adelgaza|cures?|heals?|clinically|cl[ií]nicamente|m[eé]dicamente)\b/i },
];

const ALWAYS: { id: string; re: RegExp }[] = [
  { id: "hashtag", re: /#[\p{L}\p{N}_]/u },
  { id: "contact", re: /https?:\/\/|www\.|\b[\w.+-]+@[\w-]+\.\w+|(^|\s)@[\w.]+/i },
  { id: "purchase_cta", re: /\b(compra(lo|la|los|las)? (ya|ahora|online)|pide ya|haz tu pedido|buy now|order now|shop now)\b/i },
];

const BOOKING = /\b(reserva(r|s)?|pide (tu )?cita|cita previa|book(ing)?|appointments?)\b/i;
const EMOJI = /\p{Extended_Pictographic}/gu;

export function isClaim(text: string): boolean {
  return /\d/.test(text) || CLAIM_RULES.some((r) => r.re.test(text)) || ALWAYS.some((r) => r.re.test(text));
}

export function safetyIssues(text: string, env: GroundingEnvelope): string[] {
  const declared = declaredText(env);
  const issues = CLAIM_RULES.filter((r) => r.re.test(text) && !r.re.test(declared)).map((r) => r.id);
  for (const r of ALWAYS) if (r.re.test(text)) issues.push(r.id);
  if (!env.cta.booking_declared && BOOKING.test(text)) issues.push("booking_not_declared");
  const allowedDigits = new Set(declared.match(/\d+/g) ?? []);
  if ((text.match(/\d+/g) ?? []).some((d) => !allowedDigits.has(d))) issues.push("number");
  if ((text.match(EMOJI) ?? []).length > MAX_EMOJIS) issues.push("emoji_excess");
  return [...new Set(issues)];
}

const MARKERS: Record<Lang, RegExp> = {
  es: /\b(el|la|los|las|de|del|que|y|en|con|para|por|tu|tus|nuestro|nuestra|nuestros|es|un|una|te|al)\b/gi,
  en: /\b(the|and|of|to|with|for|your|our|is|in|this|that|you|we|at|it)\b/gi,
};

export function matchesLang(text: string, lang: Lang): boolean {
  const own = (text.match(MARKERS[lang]) ?? []).length;
  const other = (text.match(MARKERS[lang === "es" ? "en" : "es"]) ?? []).length;
  return own >= 3 && own > other;
}

const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ]+/g, " ").trim().split(" ").filter(Boolean);

export function similarity(a: string, b: string): number {
  const A = new Set(words(a).filter((w) => w.length >= 4));
  const B = new Set(words(b).filter((w) => w.length >= 4));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export const MAX_SIMILARITY = 0.5;

export function differentiationIssues(ps: Proposal[]): string[] {
  const issues: string[] = [];
  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const pair = `${ps[i].position}-${ps[j].position}`;
      if (words(ps[i].body).slice(0, 3).join(" ") === words(ps[j].body).slice(0, 3).join(" ")) issues.push(`same_opening:${pair}`);
      if (words(ps[i].cta).join(" ") === words(ps[j].cta).join(" ")) issues.push(`same_cta:${pair}`);
      if (similarity(ps[i].body, ps[j].body) > MAX_SIMILARITY) issues.push(`too_similar:${pair}`);
    }
  }
  return issues;
}

export interface SetReview { safety: string[]; differentiation: string[] }

export function reviewSet(ps: Proposal[], env: GroundingEnvelope): SetReview {
  const safety: string[] = [];
  for (const p of ps) {
    const text = `${p.body}\n${p.cta}`;
    for (const issue of safetyIssues(text, env)) safety.push(`${issue}:${p.position}`);
    if (!matchesLang(text, env.lang)) safety.push(`language:${p.position}`);
  }
  return { safety, differentiation: differentiationIssues(ps) };
}
