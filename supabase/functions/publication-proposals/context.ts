// Server-side context assembly: what the model may know, classified by trust.

export type Lang = "es" | "en";
export type TrustClass = "SAFE_FACT" | "SAFE_WITH_CONDITION" | "CONTEXT_ONLY" | "DO_NOT_USE";

export const CONTEXT_POLICY: Record<string, { trust: TrustClass; used: boolean; reason: string }> = {
  name: { trust: "SAFE_FACT", used: true, reason: "Declared by the owner at onboarding." },
  category: { trust: "SAFE_FACT", used: true, reason: "Declared by the owner at onboarding." },
  city: { trust: "SAFE_FACT", used: true, reason: "Declared by the owner at onboarding." },
  services: { trust: "SAFE_FACT", used: true, reason: "Declared list; never extended or priced." },
  target_audience: { trust: "CONTEXT_ONLY", used: true, reason: "Shapes tone only; never stated as a fact." },
  primary_goal: { trust: "CONTEXT_ONLY", used: true, reason: "Shapes emphasis only; never stated as a fact." },
  website: { trust: "SAFE_WITH_CONDITION", used: false, reason: "Channel-dependent (links are not clickable on Instagram); deferred to channel adaptation." },
  phone: { trust: "SAFE_WITH_CONDITION", used: false, reason: "Requires explicit owner opt-in per post; not available in A3.7.2." },
  secondary_goals: { trust: "DO_NOT_USE", used: false, reason: "Low signal; risk of over-promising." },
  schedule: { trust: "DO_NOT_USE", used: false, reason: "Free text that may be stale; opening hours are never stated." },
  gbp_verified_profile: { trust: "DO_NOT_USE", used: false, reason: "No freshness guarantee in this flow; includes ratings/review counts which are never used." },
  reviews_ratings: { trust: "DO_NOT_USE", used: false, reason: "Social proof claims are never generated." },
  business_memory: { trust: "DO_NOT_USE", used: false, reason: "Excluded by A3.7.2 scope." },
  meta_content: { trust: "DO_NOT_USE", used: false, reason: "Meta data is never authoritative; no Meta calls in this flow." },
  image_visible_text: { trust: "CONTEXT_ONLY", used: true, reason: "OCR is non-authoritative; filtered, quoted as data, never a source of prices, dates or offers." },
};

// Only the columns the policy marks as used are ever selected.
export const BUSINESS_COLUMNS = "name, category, city, services, target_audience, primary_goal";

export interface BusinessFacts {
  name: string;
  category: string;
  city: string;
  services: string[];
  audience: string;
  goal: string;
}

export function cleanText(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const s = v.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  return s.length > max ? "" : s;
}

export function buildFacts(row: Record<string, unknown> | null): BusinessFacts | null {
  if (!row) return null;
  const name = cleanText(row.name, 120);
  if (!name) return null;
  const services = Array.isArray(row.services)
    ? [...new Set(row.services.map((s) => cleanText(s, 80)).filter(Boolean))].slice(0, 12)
    : [];
  return {
    name,
    category: cleanText(row.category, 80),
    city: cleanText(row.city, 80),
    services,
    audience: cleanText(row.target_audience, 160),
    goal: cleanText(row.primary_goal, 80),
  };
}

export type Certainty = "observed" | "uncertain";
export interface VisualItem { label: string; certainty: Certainty }
// "Not understandable" only: an understandable photo of a different business is a consistency verdict, never a reason here.
export type InsufficientReason = "blank_or_dark" | "blurry" | "no_clear_subject" | "unsafe_content" | "other";
export type BusinessFit = "consistent" | "plausibly_related" | "unknown" | "material_mismatch";
const FITS: readonly BusinessFit[] = ["consistent", "plausibly_related", "unknown", "material_mismatch"];

export interface VisualUnderstanding {
  usable: boolean;
  insufficientReason: InsufficientReason | null;
  primarySubject: VisualItem | null;
  elements: VisualItem[];
  setting: VisualItem | null;
  visibleText: { text: string; legible: boolean }[];
  peopleVisible: boolean;
  notObserved: string[];
  unsafeToInfer: string[];
  businessFit: BusinessFit;
}

const REASONS: readonly InsufficientReason[] = ["blank_or_dark", "blurry", "no_clear_subject", "unsafe_content", "other"];
const VISUAL_KEYS = ["usable", "insufficient_reason", "primary_subject", "elements", "setting", "visible_text", "people_visible", "not_observed", "unsafe_to_infer", "business_fit"];

const item = { type: ["object", "null"], additionalProperties: false, required: ["label", "certainty"], properties: { label: { type: "string" }, certainty: { type: "string", enum: ["observed", "uncertain"] } } };

export const VISUAL_SCHEMA = {
  name: "visual_understanding",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: VISUAL_KEYS,
    properties: {
      usable: { type: "boolean" },
      insufficient_reason: { type: ["string", "null"], enum: [...REASONS, null] },
      primary_subject: item,
      elements: { type: "array", items: { ...item, type: "object" } },
      setting: item,
      visible_text: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "legible"], properties: { text: { type: "string" }, legible: { type: "boolean" } } } },
      people_visible: { type: "boolean" },
      not_observed: { type: "array", items: { type: "string" } },
      unsafe_to_infer: { type: "array", items: { type: "string" } },
      business_fit: { type: "string", enum: [...FITS] },
    },
  },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function parseItem(v: unknown): VisualItem | null | "invalid" {
  if (v === null) return null;
  if (!isObj(v) || (v.certainty !== "observed" && v.certainty !== "uncertain")) return "invalid";
  const label = cleanText(v.label, 80);
  return label ? { label, certainty: v.certainty } : null;
}

const strings = (v: unknown, n: number) => (v as unknown[]).map((s) => cleanText(s, 80)).filter(Boolean).slice(0, n);

export function parseVisual(raw: string): VisualUnderstanding | null {
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(b) || Object.keys(b).some((k) => !VISUAL_KEYS.includes(k)) || VISUAL_KEYS.some((k) => !(k in b))) return null;
  if (typeof b.usable !== "boolean" || typeof b.people_visible !== "boolean") return null;
  if (b.insufficient_reason !== null && !REASONS.includes(b.insufficient_reason as InsufficientReason)) return null;
  if (!FITS.includes(b.business_fit as BusinessFit)) return null;
  if (![b.elements, b.visible_text, b.not_observed, b.unsafe_to_infer].every(Array.isArray)) return null;
  const primary = parseItem(b.primary_subject);
  const setting = parseItem(b.setting);
  if (primary === "invalid" || setting === "invalid") return null;
  const elements: VisualItem[] = [];
  for (const e of (b.elements as unknown[]).slice(0, 8)) {
    const p = parseItem(e);
    if (p === "invalid") return null;
    if (p) elements.push(p);
  }
  const visibleText: { text: string; legible: boolean }[] = [];
  for (const t of (b.visible_text as unknown[]).slice(0, 5)) {
    if (!isObj(t) || typeof t.legible !== "boolean") return null;
    const text = cleanText(t.text, 120);
    if (text) visibleText.push({ text, legible: t.legible });
  }
  return {
    usable: b.usable,
    insufficientReason: b.insufficient_reason as InsufficientReason | null,
    primarySubject: primary,
    elements,
    setting,
    visibleText,
    peopleVisible: b.people_visible,
    notObserved: strings(b.not_observed, 8),
    unsafeToInfer: strings(b.unsafe_to_infer, 8),
    businessFit: b.business_fit as BusinessFit,
  };
}

// Where a vision answer that failed to parse went wrong; a bad business_fit is a consistency failure, not an image one.
export function visualFailure(raw: string): { stage: "vision_parse" | "business_consistency"; reason: string } {
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    return { stage: "vision_parse", reason: "invalid_json" };
  }
  // Only a vision answer that is otherwise valid counts as a consistency failure.
  if (isObj(b) && !FITS.includes(b.business_fit as BusinessFit) && parseVisual(JSON.stringify({ ...b, business_fit: "unknown" }))) {
    return { stage: "business_consistency", reason: "invalid_business_fit" };
  }
  return { stage: "vision_parse", reason: "invalid_shape" };
}

const VISUAL_DEFECTS: readonly InsufficientReason[] = ["blank_or_dark", "blurry", "unsafe_content"];
const seen = (i: VisualItem | null) => (i?.certainty === "observed" ? i : null);

// A named visual defect is trusted. A generic "unusable" is overridden by clearly observed content, because doubt about
// how the photo relates to the business is a consistency question and must never read as "not understandable".
export function insufficiency(v: VisualUnderstanding): InsufficientReason | null {
  if (v.insufficientReason && VISUAL_DEFECTS.includes(v.insufficientReason)) return v.insufficientReason;
  const anchor = seen(v.primarySubject) ?? seen(v.setting);
  if (anchor && (v.usable || v.elements.some((e) => e.certainty === "observed"))) return null;
  return v.usable ? "no_clear_subject" : v.insufficientReason ?? "other";
}

export type Consistency = "CONSISTENT" | "PLAUSIBLY_RELATED" | "UNKNOWN" | "MATERIAL_MISMATCH";

const VAGUE_CATEGORY = /^(otros?|other|general|varios|various|negocio|business|empresa|company|local|tienda|shop|store|servicios?|services?)$/i;

// A mismatch needs something concrete to mismatch against; sparse context is UNKNOWN, never a mismatch.
export function hasActivityContext(facts: BusinessFacts): boolean {
  return (!!facts.category && !VAGUE_CATEGORY.test(facts.category.trim())) || facts.services.length > 0;
}

const VERDICT: Record<BusinessFit, Consistency> = {
  consistent: "CONSISTENT", plausibly_related: "PLAUSIBLY_RELATED", unknown: "UNKNOWN", material_mismatch: "MATERIAL_MISMATCH",
};

export function consistencyVerdict(facts: BusinessFacts, v: VisualUnderstanding): Consistency {
  const verdict = VERDICT[v.businessFit];
  return verdict === "MATERIAL_MISMATCH" && !hasActivityContext(facts) ? "UNKNOWN" : verdict;
}

export interface MismatchNotice { imageSummary: string; businessSummary: string; message: string }

export function mismatchNotice(lang: Lang, env: GroundingEnvelope): MismatchNotice {
  const imageSummary = env.image.setting ?? env.image.subject;
  const { name, category } = env.business;
  const businessSummary = category ? `${name} (${category})` : name;
  const message = lang === "es"
    ? `${imageSummary ? `La imagen parece mostrar «${imageSummary}», pero no coincide` : "La imagen no coincide"} claramente con la actividad que conocemos de ${name}. Comprueba que has seleccionado la fotografía correcta.`
    : `${imageSummary ? `The image appears to show “${imageSummary}”, but it does not clearly match` : "The image does not clearly match"} what we know about ${name}'s activity. Please check that you selected the right photo.`;
  return { imageSummary, businessSummary, message };
}

export const INSUFFICIENT_MESSAGE: Record<Lang, string> = {
  es: "No hemos podido entender bien esta foto. Prueba con una imagen más nítida, bien iluminada y en la que se vea claramente tu producto, servicio o local.",
  en: "We couldn't clearly understand this photo. Try a sharper, well-lit image that clearly shows your product, service or premises.",
};

const INJECTION = /\b(ignore|ignora|disregard|olvida|instruc|system|sistema|prompt|assistant|asistente|jailbreak|developer|override)\w*/i;
const MARKUP = /[<>{}[\]`\\]|https?:|www\.|@|#/i;

// Where every envelope fact comes from. USER_EXPLICIT_FACT and VERIFIED_EXTERNAL_FACT have no source in this flow yet.
export type Provenance = "IMAGE_OBSERVED" | "BUSINESS_FACT" | "USER_EXPLICIT_FACT" | "VERIFIED_EXTERNAL_FACT" | "UNCERTAIN" | "DO_NOT_USE";

export const RELATION_TYPES = ["owns", "operates", "offers", "provides", "sells", "located_at", "created", "available", "new_product", "recommends"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];
export interface Relation { type: RelationType | "is_a"; subject: string; object: string; provenance: Provenance }

export type ImageUse = "direct_subject" | "contextual_support" | "thematic_inspiration";

// How the writer may lean on the photo; never a licence to relate photo items to the business.
const IMAGE_USE: Record<Consistency, ImageUse> = {
  CONSISTENT: "direct_subject",
  PLAUSIBLY_RELATED: "thematic_inspiration",
  UNKNOWN: "contextual_support",
  MATERIAL_MISMATCH: "contextual_support",
};

export interface GroundingEnvelope {
  lang: Lang;
  consistency: Consistency;
  image_use: ImageUse;
  image: { subject: string; observed: string[]; setting: string | null; people_visible: boolean; visible_text: string[] };
  business: { name: string; category: string; city: string; services: string[] };
  tone_context: { audience: string; goal: string };
  cta: { booking_declared: boolean };
  uncertain: string[];
  relationships: { supported: Relation[]; unsupported: Relation[] };
  withheld: number;
}

// Supported relations come only from BUSINESS_FACT; image facts never establish any relation to the business.
function relationships(b: GroundingEnvelope["business"]): GroundingEnvelope["relationships"] {
  const supported: Relation[] = [];
  if (b.category) supported.push({ type: "is_a", subject: b.name, object: b.category, provenance: "BUSINESS_FACT" });
  if (b.city) supported.push({ type: "located_at", subject: b.name, object: b.city, provenance: "BUSINESS_FACT" });
  for (const s of b.services) supported.push({ type: "offers", subject: b.name, object: s, provenance: "BUSINESS_FACT" });
  const unsupported = RELATION_TYPES.map((type): Relation => ({ type, subject: b.name, object: "anything shown in the image", provenance: "DO_NOT_USE" }));
  return { supported, unsupported };
}

export function buildEnvelope(
  lang: Lang,
  facts: BusinessFacts,
  v: VisualUnderstanding,
  isClaim: (text: string) => boolean,
): GroundingEnvelope {
  let withheld = 0;
  const safeLabel = (s: string) => !/\d/.test(s) && !INJECTION.test(s) && !MARKUP.test(s) && !isClaim(s);
  const observed: string[] = [];
  const uncertain: string[] = [];
  for (const e of v.elements) {
    if (!safeLabel(e.label)) withheld++;
    else (e.certainty === "observed" ? observed : uncertain).push(e.label);
  }
  const visible: string[] = [];
  for (const t of v.visibleText) {
    if (t.legible && t.text.length <= 40 && visible.length < 3 && safeLabel(t.text)) visible.push(t.text);
    else withheld++;
  }
  const primary = v.primarySubject && safeLabel(v.primarySubject.label) ? v.primarySubject : null;
  if (v.primarySubject && !primary) withheld++;
  if (primary && primary.certainty !== "observed") uncertain.push(primary.label);
  const setting = v.setting && v.setting.certainty === "observed" && safeLabel(v.setting.label) ? v.setting.label : null;
  const subject = primary?.certainty === "observed" ? primary.label : setting ?? observed.shift() ?? "";
  const services = facts.services.filter((sv) => !INJECTION.test(sv) && !MARKUP.test(sv));
  withheld += facts.services.length - services.length;
  const declared = [facts.category, ...services].join(" ");
  const business = { name: facts.name, category: facts.category, city: facts.city, services };
  const consistency = consistencyVerdict(facts, v);
  return {
    lang,
    consistency,
    image_use: IMAGE_USE[consistency],
    image: { subject, observed, setting, people_visible: v.peopleVisible, visible_text: visible },
    business,
    tone_context: { audience: INJECTION.test(facts.audience) ? "" : facts.audience, goal: INJECTION.test(facts.goal) ? "" : facts.goal },
    cta: { booking_declared: /\b(reserva|cita|book|booking|appointment)/i.test(declared) },
    uncertain: [...uncertain, ...v.unsafeToInfer.filter(safeLabel)].slice(0, 10),
    relationships: relationships(business),
    withheld,
  };
}

// Every token a proposal may legitimately contain digits or names from.
export function declaredText(env: GroundingEnvelope): string {
  return [env.business.name, env.business.category, env.business.city, ...env.business.services, env.image.subject, ...env.image.observed, ...env.image.visible_text, env.image.setting ?? ""].join(" ");
}
