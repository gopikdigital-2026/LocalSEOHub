import type { BusinessRecord } from '../business-memory/businessRecord';

export type ReplyLang = 'es' | 'en';
export type ReplyCategory = 'location' | 'services' | 'hours' | 'booking' | 'contact';
export type BookingMethod = 'phone' | 'website' | 'in_person' | 'walk_in';
export type ReplyOrigin = 'template' | 'edited';

export const REPLY_CATEGORIES: ReplyCategory[] = ['location', 'services', 'hours', 'booking', 'contact'];
export const BOOKING_METHODS: BookingMethod[] = ['phone', 'website', 'in_person', 'walk_in'];
export const MAX_REPLY_CHARS = 1000;
export const MAX_ADDRESS_CHARS = 200;
export const MAX_SERVICES_IN_REPLY = 8;

export interface SavedReply {
  id: string;
  business_id: string;
  category: ReplyCategory;
  lang: ReplyLang;
  content: string;
  origin: ReplyOrigin;
  source_fingerprint: string;
  version: number;
  updated_at: string;
}

export interface ReplyDetails {
  business_id: string;
  address: string | null;
  booking_method: BookingMethod | null;
  version: number;
}

export interface ReplyFacts {
  name: string;
  city: string;
  address: string;
  services: string[];
  schedule: string;
  phone: string;
  website: string;
  bookingMethod: BookingMethod | null;
}

export type MissingFact = 'name' | 'address' | 'services' | 'schedule' | 'contact' | 'booking' | 'phone' | 'website';

export type Suggestion =
  | { status: 'ready'; text: string; fingerprint: string }
  | { status: 'missing'; missing: MissingFact[] };

export type ReplyView =
  | { kind: 'saved'; reply: SavedReply; stale: boolean; suggestion: Suggestion }
  | { kind: 'suggested'; text: string; fingerprint: string }
  | { kind: 'missing'; missing: MissingFact[] };

const isControl = (c: number) => c < 32 || c === 127;

export const cleanFact = (value: unknown, max: number) =>
  typeof value === 'string'
    ? Array.from(value, (ch) => (isControl(ch.charCodeAt(0)) ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim().slice(0, max)
    : '';

export const isBookingMethod = (v: unknown): v is BookingMethod =>
  typeof v === 'string' && (BOOKING_METHODS as string[]).includes(v);

type BusinessFacts = Pick<BusinessRecord, 'name' | 'city' | 'services' | 'schedule' | 'phone' | 'website'>;

export function factsFrom(business: BusinessFacts | null, details: Pick<ReplyDetails, 'address' | 'booking_method'> | null): ReplyFacts {
  const seen = new Set<string>();
  const services: string[] = [];
  for (const raw of Array.isArray(business?.services) ? business.services : []) {
    const s = cleanFact(raw, 80);
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    services.push(s);
    if (services.length === MAX_SERVICES_IN_REPLY) break;
  }
  return {
    name: cleanFact(business?.name, 120),
    city: cleanFact(business?.city, 120),
    address: cleanFact(details?.address, MAX_ADDRESS_CHARS),
    services,
    schedule: cleanFact(business?.schedule, 500).replace(/[.;,\s]+$/, ''),
    phone: cleanFact(business?.phone, 50),
    website: cleanFact(business?.website, 300),
    bookingMethod: isBookingMethod(details?.booking_method) ? details.booking_method : null,
  };
}

function fingerprint(parts: string[]): string {
  let h = 0x811c9dc5;
  for (const ch of JSON.stringify(['v1', ...parts])) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function listOf(items: string[], lang: ReplyLang): string {
  if (items.length <= 1) return items.join('');
  const last = items[items.length - 1];
  return `${items.slice(0, -1).join(', ')} ${lang === 'es' ? 'y' : 'and'} ${last}`;
}

function cityPart(f: ReplyFacts): string {
  if (!f.city || f.address.toLowerCase().includes(f.city.toLowerCase())) return '';
  return `, ${f.city}`;
}

const ready = (text: string, parts: string[]): Suggestion => ({ status: 'ready', text: text.slice(0, MAX_REPLY_CHARS), fingerprint: fingerprint(parts) });
const missing = (...m: MissingFact[]): Suggestion => ({ status: 'missing', missing: m });

function location(f: ReplyFacts, lang: ReplyLang): Suggestion {
  const gaps: MissingFact[] = [];
  if (!f.name) gaps.push('name');
  if (!f.address) gaps.push('address');
  if (gaps.length) return missing(...gaps);
  const where = `${f.address}${cityPart(f)}`;
  const text = lang === 'es'
    ? `¡Hola! Nos encontrarás en ${where}. Te esperamos en ${f.name}.`
    : `Hi! You'll find us at ${where}. We look forward to seeing you at ${f.name}.`;
  return ready(text, ['location', f.name, f.address, f.city]);
}

function services(f: ReplyFacts, lang: ReplyLang): Suggestion {
  const gaps: MissingFact[] = [];
  if (!f.name) gaps.push('name');
  if (!f.services.length) gaps.push('services');
  if (gaps.length) return missing(...gaps);
  const list = listOf(f.services, lang);
  const text = lang === 'es'
    ? `¡Hola! En ${f.name} ofrecemos ${list}. Si quieres más información sobre alguno, escríbenos y te contamos.`
    : `Hi! At ${f.name} we offer ${list}. If you'd like more details about any of them, just let us know.`;
  return ready(text, ['services', f.name, ...f.services]);
}

function hours(f: ReplyFacts, lang: ReplyLang): Suggestion {
  const gaps: MissingFact[] = [];
  if (!f.name) gaps.push('name');
  if (!f.schedule) gaps.push('schedule');
  if (gaps.length) return missing(...gaps);
  const text = lang === 'es'
    ? `¡Hola! Nuestro horario en ${f.name} es: ${f.schedule}.`
    : `Hi! Our opening hours at ${f.name} are: ${f.schedule}.`;
  return ready(text, ['hours', f.name, f.schedule]);
}

function booking(f: ReplyFacts, lang: ReplyLang): Suggestion {
  if (!f.name) return missing('name');
  const es = lang === 'es';
  switch (f.bookingMethod) {
    case null:
      return missing('booking');
    case 'phone':
      if (!f.phone) return missing('phone');
      return ready(es
        ? `¡Hola! Para pedir cita en ${f.name}, llámanos al ${f.phone} y lo organizamos contigo.`
        : `Hi! To book an appointment at ${f.name}, please call us on ${f.phone} and we'll arrange it with you.`,
      ['booking', f.name, 'phone', f.phone]);
    case 'website':
      if (!f.website) return missing('website');
      return ready(es
        ? `¡Hola! Puedes pedir cita en ${f.name} a través de nuestra web: ${f.website}`
        : `Hi! You can request an appointment at ${f.name} through our website: ${f.website}`,
      ['booking', f.name, 'website', f.website]);
    case 'in_person': {
      const at = f.address ? ` (${f.address})` : '';
      return ready(es
        ? `¡Hola! Para pedir cita, pásate por ${f.name}${at} y lo organizamos contigo.`
        : `Hi! To book an appointment, just drop by ${f.name}${at} and we'll arrange it with you.`,
      ['booking', f.name, 'in_person', f.address]);
    }
    case 'walk_in': {
      const when = f.schedule ? (es ? ` en nuestro horario (${f.schedule})` : ` during our opening hours (${f.schedule})`) : '';
      return ready(es
        ? `¡Hola! En ${f.name} no hace falta pedir cita: puedes venir directamente${when}.`
        : `Hi! There's no need to book at ${f.name}: you can come straight in${when}.`,
      ['booking', f.name, 'walk_in', f.schedule]);
    }
  }
}

function contact(f: ReplyFacts, lang: ReplyLang): Suggestion {
  const gaps: MissingFact[] = [];
  if (!f.name) gaps.push('name');
  if (!f.phone && !f.website) gaps.push('contact');
  if (gaps.length) return missing(...gaps);
  const es = lang === 'es';
  let text: string;
  if (f.phone && f.website) {
    text = es
      ? `¡Hola! Puedes contactar con ${f.name} llamando al ${f.phone} o a través de nuestra web: ${f.website}`
      : `Hi! You can reach ${f.name} by calling ${f.phone} or through our website: ${f.website}`;
  } else if (f.phone) {
    text = es ? `¡Hola! Puedes contactar con ${f.name} llamando al ${f.phone}.` : `Hi! You can reach ${f.name} by calling ${f.phone}.`;
  } else {
    text = es
      ? `¡Hola! Puedes contactar con ${f.name} a través de nuestra web: ${f.website}`
      : `Hi! You can reach ${f.name} through our website: ${f.website}`;
  }
  return ready(text, ['contact', f.name, f.phone, f.website]);
}

const BUILDERS: Record<ReplyCategory, (f: ReplyFacts, lang: ReplyLang) => Suggestion> = {
  location, services, hours, booking, contact,
};

export const suggestReply = (category: ReplyCategory, facts: ReplyFacts, lang: ReplyLang): Suggestion =>
  BUILDERS[category](facts, lang);

export function replyView(category: ReplyCategory, facts: ReplyFacts, lang: ReplyLang, saved: SavedReply | null): ReplyView {
  const suggestion = suggestReply(category, facts, lang);
  if (saved) {
    const stale = suggestion.status === 'missing' || suggestion.fingerprint !== saved.source_fingerprint;
    return { kind: 'saved', reply: saved, stale, suggestion };
  }
  return suggestion.status === 'ready'
    ? { kind: 'suggested', text: suggestion.text, fingerprint: suggestion.fingerprint }
    : { kind: 'missing', missing: suggestion.missing };
}

export const originFor = (text: string, suggestion: Suggestion): ReplyOrigin =>
  suggestion.status === 'ready' && text.trim() === suggestion.text ? 'template' : 'edited';

export type ReplyProblem = 'empty' | 'too_long' | 'invalid_chars';

export function validateReply(text: string): ReplyProblem | null {
  if (!text.trim()) return 'empty';
  if (text.length > MAX_REPLY_CHARS) return 'too_long';
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (isControl(c) && c !== 9 && c !== 10 && c !== 13) return 'invalid_chars';
  }
  return null;
}

export type AddressProblem = 'too_long' | null;

export const validateAddress = (text: string): AddressProblem =>
  cleanFact(text, MAX_ADDRESS_CHARS + 1).length > MAX_ADDRESS_CHARS ? 'too_long' : null;

// Missing facts the owner fixes inside the card; everything else lives in the business profile.
export const fixedInCard = (m: MissingFact) => m === 'address' || m === 'booking';
