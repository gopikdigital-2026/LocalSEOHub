// Remote HTML is untrusted data: it is only pattern-matched into short capped strings, never executed or interpreted.

export interface SchemaAddress {
  street: string | null;
  locality: string | null;
  region: string | null;
  postalCode: string | null;
}

export interface PageSignals {
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  canonical: string | null;
  lang: string | null;
  viewport: boolean;
  brand: string | null;
  h1: string[];
  h2: string[];
  wordCount: number;
  phones: string[];
  socials: string[];
  ctas: string[];
  hasMap: boolean;
  schemaTypes: string[];
  schemaAddress: SchemaAddress | null;
  schemaServices: string[];
  localBusinessSchema: boolean;
  matches: { city: boolean | null; services: string[] };
}

export interface OwnTerms {
  city: string;
  services: string[];
}

export const EXTRACT_LIMITS = {
  TEXT_CHARS: 200_000,
  TAGS: 2_000,
  JSON_LD_BLOCKS: 10,
  JSON_LD_BYTES: 100_000,
  JSON_NODES: 500,
  JSON_DEPTH: 8,
  H1: 3,
  H2: 8,
  PHONES: 3,
  CTAS: 5,
  SCHEMA_TYPES: 10,
  SCHEMA_SERVICES: 10,
  TERMS: 12,
};

const SOCIAL_HOSTS: Array<[string, string]> = [
  ['facebook.com', 'Facebook'], ['instagram.com', 'Instagram'], ['linkedin.com', 'LinkedIn'], ['x.com', 'X'],
  ['twitter.com', 'X'], ['tiktok.com', 'TikTok'], ['youtube.com', 'YouTube'], ['youtu.be', 'YouTube'], ['pinterest.com', 'Pinterest'],
];

const CTA_WORDS = [
  /\breserv/, /\bpide\b/, /\bpedir\b/, /\bcita\b/, /\bcontact/, /\bllam/, /\bpresupuesto/, /\bcompr/, /\bsolicit/,
  /\bescribe/, /\bwhatsapp\b/, /\bagenda/, /\bbook\b/, /\bbooking\b/, /\bcall\b/, /\bquote\b/, /\bget started\b/, /\bbuy\b/,
  /\bshop now\b/, /\bsign up\b/, /\bapunt/, /\binscrib/,
];

const LOCAL_TYPES = new Set([
  'LocalBusiness', 'ProfessionalService', 'Store', 'Restaurant', 'FoodEstablishment', 'CafeOrCoffeeShop', 'BarOrPub',
  'HairSalon', 'BeautySalon', 'DaySpa', 'HealthAndBeautyBusiness', 'Dentist', 'MedicalBusiness', 'MedicalClinic',
  'Physician', 'AutoRepair', 'AutomotiveBusiness', 'HomeAndConstructionBusiness', 'Plumber', 'Electrician',
  'LegalService', 'Attorney', 'RealEstateAgent', 'LodgingBusiness', 'Hotel', 'SportsActivityLocation', 'ExerciseGym',
  'FinancialService', 'AccountingService', 'EducationalOrganization', 'VeterinaryCare', 'ChildCare', 'TravelAgency',
]);

const NAMED_ENTITY_TYPES = new Set(['Organization', 'Corporation', ...LOCAL_TYPES]);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8}|#39);/gi, (m, e: string) => {
    const lower = e.toLowerCase();
    if (lower in ENTITIES) return ENTITIES[lower];
    if (lower.startsWith('#')) {
      const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
      return code > 31 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
    }
    return m;
  });
}

function clean(s: string | null | undefined, max: number): string | null {
  if (typeof s !== 'string') return null;
  const out = decode(s.replace(/<[^<>]*>/g, ' ')).replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  return out ? out.slice(0, max) : null;
}

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-z_:][a-z0-9_:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(tag)) && n++ < 50) {
    const name = m[1].toLowerCase();
    if (!(name in out)) out[name] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

// Patterns never cross a '<' and closing tags are searched once from the current position, so hostile markup
// (thousands of unclosed tags) costs linear time instead of quadratic backtracking.
function tags(html: string, name: string): string[] {
  const re = new RegExp(`<${name}\\b[^<>]*>`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && out.length < EXTRACT_LIMITS.TAGS) out.push(m[0]);
  return out;
}

function closingTag(html: string, name: string, from: number): { start: number; end: number } | null {
  const re = new RegExp(`<\\/${name}\\s*>`, 'gi');
  re.lastIndex = from;
  const m = re.exec(html);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}

function elements(html: string, name: string, limit = EXTRACT_LIMITS.TAGS): Array<{ open: string; inner: string }> {
  const open = new RegExp(`<${name}\\b[^<>]*>`, 'gi');
  const out: Array<{ open: string; inner: string }> = [];
  let m: RegExpExecArray | null;
  while (out.length < limit && (m = open.exec(html))) {
    const close = closingTag(html, name, open.lastIndex);
    if (!close) break;
    out.push({ open: m[0], inner: html.slice(open.lastIndex, close.start) });
    open.lastIndex = close.end;
  }
  return out;
}

function stripHidden(html: string): string {
  const open = /<!--|<(script|style|noscript|template|svg|iframe)\b/gi;
  let out = '';
  let pos = 0;
  let m: RegExpExecArray | null;
  while ((m = open.exec(html))) {
    out += `${html.slice(pos, m.index)} `;
    if (m[0] === '<!--') {
      const end = html.indexOf('-->', open.lastIndex);
      if (end < 0) return out;
      pos = end + 3;
    } else {
      const close = closingTag(html, m[1], open.lastIndex);
      if (!close) return out;
      pos = close.end;
    }
    open.lastIndex = pos;
  }
  return out + html.slice(pos);
}

function uniq(list: Array<string | null>, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    if (!v) continue;
    const key = normalizeText(v);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function absolute(href: string, base: URL): URL | null {
  try {
    const u = new URL(decode(href.trim()), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function cleanPhone(raw: string): string | null {
  let s: string;
  try {
    s = decodeURIComponent(raw);
  } catch {
    s = raw;
  }
  s = s.replace(/[^+\d\s().-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 25);
  return s.replace(/\D/g, '').length >= 7 ? s : null;
}

interface SchemaFacts {
  types: string[];
  names: string[];
  phones: string[];
  address: SchemaAddress | null;
  services: string[];
}

function typesOf(node: Record<string, unknown>): string[] {
  const t = node['@type'];
  const list = Array.isArray(t) ? t : [t];
  return list.filter((x): x is string => typeof x === 'string')
    .map((x) => x.replace(/^https?:\/\/schema\.org\//i, '').trim())
    .filter((x) => /^[A-Za-z]{2,60}$/.test(x));
}

const str = (v: unknown, max: number) => (typeof v === 'string' ? clean(v, max) : null);

function readSchema(blocks: string[]): SchemaFacts {
  const facts: SchemaFacts = { types: [], names: [], phones: [], address: null, services: [] };
  let nodes = 0;
  const walk = (v: unknown, depth: number) => {
    if (depth > EXTRACT_LIMITS.JSON_DEPTH || nodes > EXTRACT_LIMITS.JSON_NODES || v === null || typeof v !== 'object') return;
    nodes++;
    if (Array.isArray(v)) {
      for (const x of v.slice(0, 100)) walk(x, depth + 1);
      return;
    }
    const node = v as Record<string, unknown>;
    const types = typesOf(node);
    facts.types.push(...types);
    if (types.some((t) => NAMED_ENTITY_TYPES.has(t))) {
      facts.names.push(str(node.name, 120) ?? '');
      facts.phones.push(typeof node.telephone === 'string' ? cleanPhone(node.telephone) ?? '' : '');
    }
    if (types.includes('Service')) facts.services.push(str(node.name, 80) ?? '');
    if (types.includes('PostalAddress') && !facts.address) {
      const a: SchemaAddress = {
        street: str(node.streetAddress, 160), locality: str(node.addressLocality, 80),
        region: str(node.addressRegion, 80), postalCode: str(node.postalCode, 20),
      };
      if (a.street || a.locality || a.region || a.postalCode) facts.address = a;
    }
    for (const [k, child] of Object.entries(node)) {
      if (k !== '@context') walk(child, depth + 1);
    }
  };
  for (const raw of blocks) {
    if (raw.length > EXTRACT_LIMITS.JSON_LD_BYTES) continue;
    try {
      walk(JSON.parse(raw.trim()), 0);
    } catch {
      // malformed JSON-LD is ignored, never guessed at
    }
  }
  return facts;
}

function containsTerm(haystack: string, term: string): boolean {
  const t = normalizeText(term).replace(/\s+/g, ' ').trim();
  if (t.length < 3) return false;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(haystack);
}

export function extractSignals(html: string, base: URL, own: OwnTerms): PageSignals {
  const ldBlocks = elements(html, 'script', 50)
    .filter((e) => /type\s*=\s*["']?application\/ld\+json/i.test(e.open))
    .slice(0, EXTRACT_LIMITS.JSON_LD_BLOCKS)
    .map((e) => e.inner);
  const schema = readSchema(ldBlocks);
  const itemtype = /itemtype\s*=\s*["']?https?:\/\/schema\.org\/([A-Za-z]{2,60})/gi;
  for (let m: RegExpExecArray | null, n = 0; (m = itemtype.exec(html)) && n < EXTRACT_LIMITS.TAGS; n++) schema.types.push(m[1]);

  const body = stripHidden(html);

  const metas = tags(html, 'meta').map(attrs);
  const meta = (key: 'name' | 'property', value: string) =>
    metas.find((m) => (m[key] ?? '').toLowerCase() === value)?.content ?? null;
  const links = tags(html, 'link').map(attrs);
  const canonicalHref = links.find((l) => (l.rel ?? '').toLowerCase().split(/\s+/).includes('canonical'))?.href;
  const canonical = canonicalHref ? absolute(canonicalHref, base) : null;
  const htmlTag = tags(html, 'html')[0];

  const anchors = elements(body, 'a').map((e) => ({ a: attrs(e.open), label: clean(e.inner, 60) }));
  const buttons = elements(body, 'button').map((e) => clean(e.inner, 60));
  const submits = tags(body, 'input').map(attrs).filter((a) => (a.type ?? '').toLowerCase() === 'submit').map((a) => clean(a.value, 60));

  const phones: Array<string | null> = [];
  const socials: string[] = [];
  const ctaLabels: Array<string | null> = [];
  let hasMap = /<iframe\b[^<>]*src\s*=\s*["']?https?:\/\/(www\.)?google\.[a-z.]+\/maps/i.test(html);
  const isCta = (label: string | null) => !!label && label.length >= 3 && CTA_WORDS.some((re) => re.test(normalizeText(label)));

  for (const { a, label } of anchors) {
    const href = (a.href ?? '').trim();
    if (/^tel:/i.test(href)) {
      phones.push(cleanPhone(href.slice(4)));
      if (label) ctaLabels.push(label);
      continue;
    }
    const url = absolute(href, base);
    if (!url) continue;
    const host = url.hostname.toLowerCase();
    const social = SOCIAL_HOSTS.find(([d]) => hostMatches(host, d));
    if (social) socials.push(social[1]);
    if (hostMatches(host, 'wa.me') || hostMatches(host, 'api.whatsapp.com')) ctaLabels.push(label ?? 'WhatsApp');
    else if (isCta(label)) ctaLabels.push(label);
    if ((/^(www\.)?google\.[a-z.]+$/.test(host) && url.pathname.startsWith('/maps')) || host === 'maps.app.goo.gl' || host === 'maps.google.com') hasMap = true;
  }
  for (const b of [...buttons, ...submits]) if (isCta(b)) ctaLabels.push(b);

  const visible = (clean(body, EXTRACT_LIMITS.TEXT_CHARS) ?? '');
  const haystack = normalizeText(visible);
  const wordCount = visible ? visible.split(' ').filter((w) => /\p{L}/u.test(w)).length : 0;
  const ownServices = own.services.slice(0, EXTRACT_LIMITS.TERMS);
  const schemaTypes = uniq(schema.types, EXTRACT_LIMITS.SCHEMA_TYPES);

  return {
    title: clean(elements(html, 'title', 1)[0]?.inner, 200),
    metaDescription: clean(meta('name', 'description'), 300),
    metaRobots: clean(meta('name', 'robots'), 100),
    canonical: canonical ? canonical.href.slice(0, 300) : null,
    lang: htmlTag ? clean(attrs(htmlTag).lang, 20) : null,
    viewport: meta('name', 'viewport') !== null,
    brand: clean(meta('property', 'og:site_name'), 120) ?? uniq(schema.names, 1)[0] ?? null,
    h1: uniq(elements(body, 'h1', 20).map((e) => clean(e.inner, 160)), EXTRACT_LIMITS.H1),
    h2: uniq(elements(body, 'h2', 50).map((e) => clean(e.inner, 160)), EXTRACT_LIMITS.H2),
    wordCount,
    phones: uniq([...phones, ...schema.phones], EXTRACT_LIMITS.PHONES),
    socials: uniq(socials, SOCIAL_HOSTS.length),
    ctas: uniq(ctaLabels, EXTRACT_LIMITS.CTAS),
    hasMap,
    schemaTypes,
    schemaAddress: schema.address,
    schemaServices: uniq(schema.services, EXTRACT_LIMITS.SCHEMA_SERVICES),
    localBusinessSchema: schemaTypes.some((t) => LOCAL_TYPES.has(t)),
    matches: {
      city: own.city.trim().length >= 3 ? containsTerm(haystack, own.city) : null,
      services: ownServices.filter((s) => containsTerm(haystack, s)),
    },
  };
}
