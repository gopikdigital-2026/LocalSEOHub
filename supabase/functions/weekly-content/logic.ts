// Pure logic for the weekly content draft. No Deno or network access so it can be unit-tested.

export type Lang = 'es' | 'en';

export const MAX_GENERATIONS = 3;
export const MAX_ATTEMPTS = 6;
export const MAX_CONTENT_CHARS = 2200;
export const MIN_POST_CHARS = 80;
export const MAX_POST_CHARS = 900;
export const MAX_HASHTAGS = 4;
export const MODEL = 'gpt-4o-mini';
export const MAX_OUTPUT_TOKENS = 350;
export const MAX_PROVIDER_CALLS = 2;
export const PROVIDER_TIMEOUT_MS = 20000;

const FIELD_LIMIT = 160;
const MAX_SERVICES = 8;

export interface BusinessFacts {
  name: string;
  category: string;
  city: string;
  services: string[];
  target_audience: string;
}

export type Topic = 'service_spotlight' | 'practical_tip' | 'local_presence' | 'audience_need' | 'common_question';

export const TOPICS: Topic[] = ['service_spotlight', 'practical_tip', 'local_presence', 'audience_need', 'common_question'];

const stripControl = (s: string) =>
  Array.from(s, (ch) => { const c = ch.charCodeAt(0); return c < 32 || c === 127 ? ' ' : ch; }).join('');

const clean = (v: unknown, max = FIELD_LIMIT) =>
  typeof v === 'string' ? stripControl(v).replace(/\s+/g, ' ').trim().slice(0, max) : '';

export function sanitizeFacts(row: Record<string, unknown>): BusinessFacts {
  const services = Array.isArray(row.services) ? row.services.map((s) => clean(s, 80)).filter(Boolean).slice(0, MAX_SERVICES) : [];
  return {
    name: clean(row.name, 120),
    category: clean(row.category),
    city: clean(row.city, 120),
    services,
    target_audience: clean(row.target_audience, 200),
  };
}

export type MissingField = 'name' | 'category' | 'city' | 'services';

export function missingEssentials(f: BusinessFacts): MissingField[] {
  const missing: MissingField[] = [];
  if (!f.name) missing.push('name');
  if (!f.category) missing.push('category');
  if (!f.city) missing.push('city');
  if (f.services.length === 0) missing.push('services');
  return missing;
}

export function isMondayKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = new Date(`${key}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === key && d.getUTCDay() === 1;
}

// The browser sends its local Monday. Accept it only while that week is current somewhere on Earth (UTC-12..UTC+14).
export function isCurrentWeek(key: string, now: Date): boolean {
  if (!isMondayKey(key)) return false;
  const start = Date.parse(`${key}T00:00:00Z`);
  const hour = 3600_000;
  return now.getTime() >= start - 14 * hour && now.getTime() < start + 7 * 24 * hour + 12 * hour;
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function availableTopics(f: BusinessFacts): Topic[] {
  return TOPICS.filter((t) => t !== 'audience_need' || Boolean(f.target_audience));
}

export function chooseTopic(f: BusinessFacts, seed: string, usedThisWeek: string[], recent: string[]): Topic {
  const pool = availableTopics(f);
  const fresh = pool.filter((t) => !usedThisWeek.includes(t) && !recent.includes(t));
  const notThisWeek = pool.filter((t) => !usedThisWeek.includes(t));
  const candidates = fresh.length ? fresh : notThisWeek.length ? notThisWeek : pool;
  return candidates[hash(seed) % candidates.length];
}

export function chooseService(f: BusinessFacts, seed: string): string {
  return f.services[hash(`svc:${seed}`) % f.services.length];
}

const TOPIC_BRIEF: Record<Topic, Record<Lang, string>> = {
  service_spotlight: {
    es: 'Explica de forma sencilla en qué consiste el servicio destacado y para quién es útil.',
    en: 'Explain simply what the highlighted service is and who it is useful for.',
  },
  practical_tip: {
    es: 'Comparte un consejo práctico y general relacionado con la actividad del negocio, útil aunque el lector no sea cliente.',
    en: 'Share a practical, general tip related to the business activity, useful even if the reader is not a customer.',
  },
  local_presence: {
    es: 'Recuerda a la gente de la zona que el negocio está en su ciudad y qué puede hacer por ellos.',
    en: 'Remind people in the area that the business is in their city and what it can do for them.',
  },
  audience_need: {
    es: 'Habla de una necesidad habitual del público al que se dirige el negocio y cómo encaja el servicio destacado.',
    en: 'Talk about a common need of the business audience and how the highlighted service fits it.',
  },
  common_question: {
    es: 'Responde a una pregunta habitual que la gente se hace sobre este tipo de servicio, con información general y prudente.',
    en: 'Answer a common question people ask about this kind of service, with general and careful information.',
  },
};

const SYSTEM: Record<Lang, string> = {
  es: `Redactas publicaciones breves para redes sociales de pequeños negocios locales.
Reglas obligatorias:
- Usa SOLO los datos del negocio que se te dan. No añadas servicios, productos, precios, promociones, descuentos, regalos, horarios, teléfonos, direcciones, premios, certificaciones, años de experiencia, opiniones o testimonios de clientes, cifras ni resultados.
- No prometas resultados ni uses superlativos absolutos ("el mejor", "número 1", "garantizado").
- Tono cercano y natural, frases cortas, sin lenguaje SEO artificial ni listas de palabras clave.
- Entre 300 y 650 caracteres. Como máximo 2 emojis.
- Termina con una llamada a la acción suave (por ejemplo, invitar a escribir o a preguntar), sin urgencia artificial.
- Entre 0 y 3 hashtags relevantes, solo si aportan valor.
Devuelve SOLO este JSON: {"text": "<publicación sin hashtags>", "hashtags": ["#ejemplo"]}`,
  en: `You write short social media posts for small local businesses.
Mandatory rules:
- Use ONLY the business facts you are given. Do not add services, products, prices, promotions, discounts, gifts, opening hours, phone numbers, addresses, awards, certifications, years of experience, customer reviews or testimonials, figures or results.
- Do not promise results or use absolute superlatives ("the best", "number 1", "guaranteed").
- Warm, natural tone, short sentences, no artificial SEO language or keyword lists.
- Between 300 and 650 characters. At most 2 emojis.
- End with a soft call to action (for example, inviting people to message or ask), without artificial urgency.
- Between 0 and 3 relevant hashtags, only if they add value.
Return ONLY this JSON: {"text": "<post without hashtags>", "hashtags": ["#example"]}`,
};

export function buildMessages(f: BusinessFacts, topic: Topic, service: string, lang: Lang) {
  const L = lang === 'en'
    ? { name: 'Business name', activity: 'Activity', city: 'City/area', services: 'Declared services', audience: 'Audience', focus: 'Highlighted service', brief: 'Angle for this week' }
    : { name: 'Nombre comercial', activity: 'Actividad', city: 'Ciudad/zona', services: 'Servicios declarados', audience: 'Público', focus: 'Servicio destacado', brief: 'Enfoque de esta semana' };
  const lines = [
    `${L.name}: ${f.name}`,
    `${L.activity}: ${f.category}`,
    `${L.city}: ${f.city}`,
    `${L.services}: ${f.services.join('; ')}`,
    f.target_audience ? `${L.audience}: ${f.target_audience}` : '',
    `${L.focus}: ${service}`,
    `${L.brief}: ${TOPIC_BRIEF[topic][lang]}`,
  ].filter(Boolean);
  return [
    { role: 'system' as const, content: SYSTEM[lang] },
    { role: 'user' as const, content: lines.join('\n') },
  ];
}

// Claims the model must not make on its own. Checked against facts so a declared service like "Cursos gratuitos" still passes.
const FORBIDDEN: RegExp[] = [
  /\d+\s?(€|eur|euros?|\$|usd|dólares|dollars)/i,
  /(€|\$)\s?\d/,
  /\d+\s?%/,
  /\b\d{1,2}[:.h]\d{2}\b/,
  /\+?\d[\d\s-]{7,}\d/,
  /\b(descuentos?|rebajas?|promoci[oó]n(es)?|oferta(s)?|gratis|gratuit[oa]s?|regalo|2x1|cup[oó]n)\b/i,
  /\b(discounts?|promotions?|promo|offers?|free|sale|coupons?|giveaway)\b/i,
  /\b(premiad[oa]s?|premios?|galardonad[oa]s?|certificad[oa]s?|certificaci[oó]n|homologad[oa]s?|awards?|award-winning|certified)\b/i,
  /\b(\d+\s+(años|years)\s+(de\s+experiencia|of\s+experience))\b/i,
  /\bn[uú]mero\s?1\b|\bnumber\s?(one|1)\b|\bgarantizad[oa]s?\b|\bguaranteed\b/i,
  /\b(rese[nñ]as?|opiniones|testimonios?|valoraciones|estrellas|reviews?|testimonials?|stars|rated)\b/i,
  /\b(horarios?|abrimos|cerramos|opening hours|we open)\b/i,
];

export function violations(text: string, facts: BusinessFacts): number[] {
  const declared = [facts.name, facts.category, ...facts.services, facts.target_audience].join(' ');
  return FORBIDDEN.map((re, i) => (re.test(text) && !re.test(declared) ? i : -1)).filter((i) => i >= 0);
}

export type ParseResult = { ok: true; content: string } | { ok: false; reason: 'malformed' | 'length' | 'claims' };

export function parseModelOutput(raw: string, facts: BusinessFacts): ParseResult {
  let body: unknown;
  try {
    body = JSON.parse(raw.replace(/```json\s*|```/g, '').trim());
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const b = body as { text?: unknown; hashtags?: unknown };
  if (typeof b?.text !== 'string') return { ok: false, reason: 'malformed' };
  const text = b.text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length < MIN_POST_CHARS || text.length > MAX_POST_CHARS) return { ok: false, reason: 'length' };
  const tags = Array.isArray(b.hashtags)
    ? [...new Set(b.hashtags.filter((h): h is string => typeof h === 'string')
        .map((h) => `#${h.replace(/^#+/, '').replace(/[^\p{L}\p{N}_]/gu, '')}`)
        .filter((h) => h.length > 2 && h.length <= 40))].slice(0, MAX_HASHTAGS)
    : [];
  const content = tags.length ? `${text}\n\n${tags.join(' ')}` : text;
  if (violations(content, facts).length) return { ok: false, reason: 'claims' };
  return { ok: true, content: content.slice(0, MAX_CONTENT_CHARS) };
}
