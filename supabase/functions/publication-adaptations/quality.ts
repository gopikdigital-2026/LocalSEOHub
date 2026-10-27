// Copy quality: a set can be factually safe and still not worth publishing. Kept apart from fact safety.
import type { GroundingEnvelope } from "./context.ts";
import { words } from "./relational.ts";
import type { Proposal } from "./safety.ts";

const phrase = (s: string) => ` ${words(s).join(" ")} `;
const firstSentence = (s: string) => s.split(/(?<=[.!?¿¡:])\s/)[0] ?? s;

const NARRATION = new RegExp(
  "^ (en (la|esta) (imagen|foto|fotografia)|(la|esta) (imagen|foto|fotografia) (muestra|refleja|ensena|recoge)|podemos (ver|observar)|se (aprecia|ve|observa)|vemos"
  + "|in (the|this) (image|photo|photograph|picture)|(the|this) (image|photo|photograph|picture) (shows|features|captures)|we can see|here we see|you can see) ",
);

// Opening a post by describing the photo is acceptable once; as the default it reads like a caption, not a post.
export const MAX_NARRATED = 1;
export const MAX_ITEMS_PER_POST = 2;
export const SHARED_ITEMS = 2;
export const MAX_SIMILARITY = 0.5;
export const MAX_OPENING_SIMILARITY = 0.5;
export const MAX_CTA_SIMILARITY = 0.6;
export const SHARED_MESSAGE_WORDS = 4;

export const isNarrated = (body: string) => NARRATION.test(phrase(firstSentence(body)));

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
};

export const similarity = (a: string, b: string) => jaccard(words(a).filter((w) => w.length >= 4), words(b).filter((w) => w.length >= 4));

const GENERIC_CTA = / (mas informacion|more information|more info|saber mas|know more|learn more) /;
const CONVERSATIONAL = { es: / (tu|tus|te|ti|contigo|usted) /, en: / (you|your|yours) / };

function imageLabels(env: GroundingEnvelope): string[] {
  return [env.image.subject, ...env.image.observed].map(phrase).filter((l) => l.trim());
}

export function qualityIssues(ps: Proposal[], env: GroundingEnvelope): string[] {
  const issues: string[] = [];
  const bodies = ps.map((p) => phrase(p.body));

  if (ps.filter((p) => isNarrated(p.body)).length > MAX_NARRATED) issues.push("image_narration");

  const labels = imageLabels(env);
  const mentioned = bodies.map((b) => labels.filter((l) => b.includes(l)));
  mentioned.forEach((m, i) => m.length > MAX_ITEMS_PER_POST && issues.push(`object_enumeration:${ps[i].position}`));
  if (labels.filter((l) => mentioned.every((m) => m.includes(l))).length >= SHARED_ITEMS) issues.push("repeated_objects");

  const name = phrase(env.business.name);
  if (name.trim() && bodies.every((b) => b.includes(name))) issues.push("name_repetition");
  const city = phrase(env.business.city);
  if (city.trim() && bodies.every((b) => b.includes(city))) issues.push("location_repetition");

  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      const pair = `${ps[i].position}-${ps[j].position}`;
      const [a, b] = [ps[i], ps[j]];
      if (words(a.body).slice(0, 3).join(" ") === words(b.body).slice(0, 3).join(" ")) issues.push(`same_opening:${pair}`);
      else if (jaccard(words(firstSentence(a.body)), words(firstSentence(b.body))) > MAX_OPENING_SIMILARITY) issues.push(`similar_opening:${pair}`);
      if (words(a.cta).join(" ") === words(b.cta).join(" ")) issues.push(`same_cta:${pair}`);
      else if (jaccard(words(a.cta), words(b.cta)) > MAX_CTA_SIMILARITY) issues.push(`similar_cta:${pair}`);
      if (similarity(a.body, b.body) > MAX_SIMILARITY) issues.push(`too_similar:${pair}`);
    }
  }
  if (ps.filter((p) => GENERIC_CTA.test(phrase(p.cta))).length > 1) issues.push("generic_cta");

  // Words every proposal leans on, beyond the business's own name, category, city and services.
  const own = new Set(words([env.business.name, env.business.category, env.business.city, ...env.business.services].join(" ")));
  const content = bodies.map((b) => new Set(words(b).filter((w) => w.length >= 5 && !own.has(w))));
  if ([...content[0]].filter((w) => content.every((c) => c.has(w))).length >= SHARED_MESSAGE_WORDS) issues.push("same_message");

  const close = ps.find((p) => p.role === "close");
  if (close && !/[?¿]/.test(`${close.body} ${close.cta}`) && !CONVERSATIONAL[env.lang].test(phrase(`${close.body} ${close.cta}`))) {
    issues.push(`close_not_conversational:${close.position}`);
  }
  return issues;
}
