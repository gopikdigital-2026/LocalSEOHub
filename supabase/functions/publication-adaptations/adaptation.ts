// Adaptation-specific rules layered on top of the byte-identical A3.7.2 validators (context/safety/relational/quality).
import { buildEnvelope, type BusinessFacts, type GroundingEnvelope, type Lang } from "./context.ts";
import { similarity } from "./quality.ts";
import { relationalIssues, words, RELATIONAL_GUIDE } from "./relational.ts";
import { CLAIM_RULES, isClaim, matchesLang, safetyIssues, type Role } from "./safety.ts";

export interface SourceSnapshot { role: Role; lang: Lang; body: string; cta: string }
export interface ChannelTexts { facebook: string; instagram: string }
export interface AdaptationContext { env: GroundingEnvelope; source: SourceSnapshot; sourceText: string }

export const FACEBOOK_MIN = 40;
export const FACEBOOK_MAX = 1500;
export const INSTAGRAM_MIN = 40;
export const INSTAGRAM_MAX = 1000;
export const MAX_HASHTAGS = 5;
export const MAX_PARAGRAPH = 600;
export const MAX_CHANNEL_SIMILARITY = 0.8;
export const EMOJI_LIMIT: Record<"facebook" | "instagram", Record<Role, number>> = {
  facebook: { direct: 1, close: 1, professional: 0 },
  instagram: { direct: 2, close: 2, professional: 1 },
};

const textSchema = { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } };
export const ADAPTATION_SCHEMA = {
  name: "channel_adaptation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["facebook", "instagram"],
    properties: { facebook: textSchema, instagram: textSchema },
  },
};

const tidy = (s: string) => s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function channelText(v: unknown, min: number, max: number): string | null {
  if (!isObj(v) || Object.keys(v).join() !== "text" || typeof v.text !== "string") return null;
  const t = tidy(v.text);
  return t.length >= min && t.length <= max ? t : null;
}

export function parseAdaptation(raw: string): ChannelTexts | null {
  let b: unknown;
  try {
    b = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(b) || Object.keys(b).sort().join() !== "facebook,instagram") return null;
  const facebook = channelText(b.facebook, FACEBOOK_MIN, FACEBOOK_MAX);
  const instagram = channelText(b.instagram, INSTAGRAM_MIN, INSTAGRAM_MAX);
  return facebook && instagram ? { facebook, instagram } : null;
}

// The photo is never resent: the envelope carries business facts only, filtered by the frozen A3.7.2 envelope builder.
export function adaptationContext(facts: BusinessFacts, source: SourceSnapshot): AdaptationContext {
  const env = buildEnvelope(source.lang, facts, {
    usable: true, insufficientReason: null, primarySubject: null, elements: [], setting: null,
    visibleText: [], peopleVisible: false, notObserved: [], unsafeToInfer: [], businessFit: "unknown",
  }, isClaim);
  return { env, source, sourceText: `${source.body}\n${source.cta}` };
}

const EMOJI = /\p{Extended_Pictographic}/gu;
const HASHTAG = /#([\p{L}\p{N}_]+)/gu;
const CTA_ACTIONS = /(?<![\p{L}\p{N}])(c[oó]mpra(lo|la|los|las)? (hoy|ya|ahora|online)|reserva (hoy|ya|ahora)|ll[aá]manos|escr[ií]benos|env[ií]anos|vis[ií]tanos|ven a (vernos|visitarnos)|p[aá]sate|haz clic|pincha|enlace en (la |nuestra )?bio|link (in|en) (the |our |la )?bio|call us|visit us|message us|dm us|send us|click|tap the link|book (now|today)|sign up|subscribe|reg[ií]strate|suscr[ií]bete|ap[uú]ntate)(?![\p{L}\p{N}])/giu;
const LEAK = /(?<![\p{L}\p{N}])(ignore|ignora|disregard|olvida|system prompt|prompt|instrucciones|instructions|as an ai|como (ia|modelo)|language model|modelo de lenguaje|json|schema)(?![\p{L}\p{N}])/iu;
const MARKUP = /[<>{}[\]`\\]/;
const CONVERSATIONAL: Record<Lang, RegExp> = { es: / (tu|tus|te|ti|contigo|usted|os|vosotros) /, en: / (you|your|yours) / };
const RELATIONAL_IDS = new Set(["unsupported_possessive", "unsupported_offering", "location_composition"]);
// Wording-level claims the approved source may already carry; every other claim type (and every number) must be a declared business fact.
const SOURCE_EXEMPT = new Set(["availability", "novelty", "invented_behaviour", "unsupported_intent", "unsupported_quality"]);

const stem = (w: string) => (w.length > 4 ? w.replace(/(es|s)$/, "") : w);
const phrase = (s: string) => ` ${words(s).join(" ")} `;
const hashtags = (t: string) => [...t.matchAll(HASHTAG)].map((m) => m[1]);
// Splits #CafeDeLaCasa / #cafe_de_la_casa into its words.
const hashtagWords = (tag: string) => words(tag.replace(/_/g, " ").replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2"));

function vocabulary(ctx: AdaptationContext): Set<string> {
  const b = ctx.env.business;
  return new Set(words([ctx.sourceText, b.name, b.category, ...b.services].join(" ")).map(stem));
}

function cityWords(ctx: AdaptationContext): string[] {
  return words(ctx.env.business.city).filter((w) => w.length >= 3);
}

export type Channel = "facebook" | "instagram";

export function channelSafety(channel: Channel, text: string, ctx: AdaptationContext): string[] {
  const { env, source, sourceText } = ctx;
  const sourceRelational = new Set(relationalIssues(sourceText, env));
  const issues = safetyIssues(text, env).filter((id) => {
    if (id === "hashtag" || id === "emoji_excess") return false;
    if (RELATIONAL_IDS.has(id)) return !sourceRelational.has(id);
    if (!SOURCE_EXEMPT.has(id)) return true;
    const rule = CLAIM_RULES.find((r) => r.id === id);
    return !rule || !rule.re.test(sourceText);
  });

  const tags = hashtags(text);
  if (channel === "facebook" && tags.length) issues.push("hashtag_facebook");
  if (channel === "instagram") {
    if (tags.length > MAX_HASHTAGS) issues.push("hashtag_excess");
    const vocab = vocabulary(ctx);
    const city = new Set(cityWords(ctx).map(stem));
    const sourceWords = new Set(words(sourceText).map(stem));
    for (const tag of tags) {
      const ws = hashtagWords(tag).map(stem);
      if (!ws.length || ws.some((w) => w.length >= 3 && !vocab.has(w))) issues.push("hashtag_ungrounded");
      if (ws.some((w) => city.has(w) && !sourceWords.has(w))) issues.push("hashtag_location");
    }
  }

  const emojis = (text.match(EMOJI) ?? []).length;
  if (emojis > EMOJI_LIMIT[channel][source.role]) issues.push("emoji_excess");

  const sourceCtas = new Set([...sourceText.matchAll(CTA_ACTIONS)].map((m) => phrase(m[0])));
  if ([...text.matchAll(CTA_ACTIONS)].some((m) => !sourceCtas.has(phrase(m[0])))) issues.push("cta_unsupported");

  const city = cityWords(ctx);
  const sourcePhrase = phrase(sourceText);
  const textPhrase = phrase(text.replace(HASHTAG, " "));
  if (city.length && textPhrase.includes(` ${city.join(" ")} `) && !sourcePhrase.includes(` ${city.join(" ")} `)) issues.push("location_added");

  if (LEAK.test(text)) issues.push("instruction_leak");
  if (MARKUP.test(text)) issues.push("markup");
  if (!matchesLang(text.replace(HASHTAG, " "), source.lang)) issues.push("language");
  return [...new Set(issues)];
}

export function channelQuality(texts: ChannelTexts, ctx: AdaptationContext): string[] {
  const issues: string[] = [];
  const fb = phrase(texts.facebook);
  const ig = phrase(texts.instagram.replace(HASHTAG, " "));
  if (fb === ig) issues.push("channels_identical");
  else if (similarity(texts.facebook, texts.instagram.replace(HASHTAG, " ")) > MAX_CHANNEL_SIMILARITY) issues.push("channels_too_similar");
  if (texts.facebook.split(/\n\s*\n/).some((p) => p.length > MAX_PARAGRAPH)) issues.push("paragraph_too_long:facebook");
  if (ctx.source.role === "close") {
    for (const ch of ["facebook", "instagram"] as const) {
      const t = texts[ch];
      if (!/[?¿]/.test(t) && !CONVERSATIONAL[ctx.source.lang].test(phrase(t))) issues.push(`role_drift:${ch}`);
    }
  }
  return issues;
}

export interface AdaptationReview { safety: string[]; quality: string[] }

export function reviewAdaptation(texts: ChannelTexts, ctx: AdaptationContext): AdaptationReview {
  const safety = (["facebook", "instagram"] as const).flatMap((ch) => channelSafety(ch, texts[ch], ctx).map((i) => `${i}:${ch}`));
  return { safety, quality: channelQuality(texts, ctx) };
}

export const ADAPTATION_GUIDE: Record<string, string> = {
  ...RELATIONAL_GUIDE,
  number: "a number that is not part of the declared business facts",
  hashtag_facebook: "a hashtag in the Facebook text; Facebook must have none",
  hashtag_excess: `more than ${MAX_HASHTAGS} hashtags on Instagram`,
  hashtag_ungrounded: "a hashtag built from words that are not in the source post or the declared business name, category or services",
  hashtag_location: "a location hashtag although the source post does not mention the location",
  emoji_excess: "too many emoji for this tone",
  cta_unsupported: "a call to action (buy, book, call, visit, link in bio...) that the source post does not contain",
  location_added: "the business location although the source post does not mention it",
  instruction_leak: "wording about instructions, prompts or the assistant itself",
  markup: "markup characters such as brackets, braces or backticks",
  language: "text that is not in the language of the source post",
  contact: "a link, email or @handle",
  purchase_cta: "a purchase call to action",
  booking_not_declared: "a booking or appointment mention; booking is not declared",
  channels_identical: "the Facebook and Instagram texts are identical",
  channels_too_similar: "the Facebook and Instagram texts are almost the same; each must be shaped for its channel",
  paragraph_too_long: "a Facebook paragraph that is too long; use short paragraphs",
  role_drift: "the close, conversational tone of the source was lost; address the reader directly or ask a question",
};

export function guideFor(issue: string): string {
  const id = issue.split(":")[0];
  if (ADAPTATION_GUIDE[id]) return ADAPTATION_GUIDE[id];
  return CLAIM_RULES.some((r) => r.id === id) ? `a ${id.replace(/_/g, " ")} claim; never state it unless it is a declared business fact` : id.replace(/_/g, " ");
}
