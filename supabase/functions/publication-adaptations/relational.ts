// Relational grounding: fact A (image) + fact B (business) never implies relationship(A, B).
import type { GroundingEnvelope } from "./context.ts";

export const words = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ]+/g, " ").trim().split(" ").filter(Boolean);

const stem = (w: string) => (w.length > 4 ? w.replace(/(es|s)$/, "") : w);

const STOP = new Set([
  "de", "del", "la", "el", "los", "las", "un", "una", "unos", "unas", "lo", "y", "e", "o", "en", "con", "para", "por", "a", "al", "su", "sus", "tu", "tus", "te", "os", "muy", "mas", "propio", "propia", "propios", "propias",
  "the", "an", "and", "or", "of", "in", "with", "for", "to", "at", "your", "you", "very", "own", "nuestro", "nuestra", "nuestros", "nuestras", "our",
]);

// The business itself and its declared offering may be referred to in the first person.
const SELF = new Set(["negocio", "empresa", "business", "company", "servicio", "service", "perfil", "profile", "cuenta", "account"].map(stem));

const POSSESSIVE = new Set(["nuestro", "nuestra", "nuestros", "nuestras", "our", "ours"]);
const ES_FIRST_PERSON = new Set(["ofrecemos", "vendemos", "tenemos", "servimos", "preparamos", "elaboramos", "creamos", "disenamos", "fabricamos", "hacemos", "traemos", "presentamos", "proponemos", "recomendamos", "cocinamos", "alquilamos"]);
const EN_FIRST_PERSON = new Set(["offer", "sell", "have", "serve", "make", "create", "design", "bring", "prepare", "recommend", "cook", "stock", "carry", "rent", "provide"]);

export interface RelationalScope { business: Set<string>; imageOnly: Set<string>; cities: string[] }

export function relationalScope(env: GroundingEnvelope): RelationalScope {
  const business = new Set(words([env.business.name, env.business.category, ...env.business.services].join(" ")).filter((w) => !STOP.has(w)).map(stem));
  const cityWords = new Set(words(env.business.city).map(stem));
  const imageText = [env.image.subject, ...env.image.observed, env.image.setting ?? "", ...env.uncertain].join(" ");
  const imageOnly = new Set(
    words(imageText).filter((w) => w.length >= 4 && !STOP.has(w)).map(stem).filter((w) => !business.has(w) && !cityWords.has(w)),
  );
  const cities = env.business.city.split(/[-,/()]/).map((c) => words(c).join(" ")).filter((c) => c.length >= 3);
  return { business, imageOnly, cities };
}

const declared = (w: string, scope: RelationalScope) => scope.business.has(stem(w)) || SELF.has(stem(w));

function nextContent(tokens: string[], from: number): string | null {
  for (let i = from; i < tokens.length && i < from + 4; i++) if (!STOP.has(tokens[i])) return tokens[i];
  return null;
}

function linksUndeclared(tokens: string[], scope: RelationalScope): { possessive: boolean; offering: boolean } {
  let possessive = false;
  let offering = false;
  tokens.forEach((t, i) => {
    if (POSSESSIVE.has(t)) {
      const head = nextContent(tokens, i + 1);
      if (head && !declared(head, scope)) possessive = true;
    }
    const verb = ES_FIRST_PERSON.has(t) || (t === "we" && EN_FIRST_PERSON.has(tokens[i + 1] ?? ""));
    if (verb) {
      const object = nextContent(tokens, t === "we" ? i + 2 : i + 1);
      if (object && !declared(object, scope)) offering = true;
    }
  });
  return { possessive, offering };
}

export function relationalIssues(text: string, env: GroundingEnvelope): string[] {
  const scope = relationalScope(env);
  const issues: string[] = [];
  const links = linksUndeclared(words(text), scope);
  if (links.possessive) issues.push("unsupported_possessive");
  if (links.offering) issues.push("unsupported_offering");
  for (const sentence of text.split(/[.!?¡¿;:\n]+/)) {
    const normalized = ` ${words(sentence).join(" ")} `;
    if (!scope.cities.some((c) => normalized.includes(` ${c} `))) continue;
    if (words(sentence).some((w) => scope.imageOnly.has(stem(w)))) {
      issues.push("location_composition");
      break;
    }
  }
  return issues;
}

export const RELATIONAL_GUIDE: Record<string, string> = {
  unsupported_possessive: "a possessive (our/nuestro/nuestra) attached to something that is not a declared business fact; the photo does not show what the business owns",
  unsupported_offering: "a first-person verb (we offer/sell/have, ofrecemos/vendemos/tenemos) linking the business to something that is not declared",
  location_composition: "an item seen in the photo placed at the business location; the photo does not show where it is",
  availability: "availability or sale of something; nothing says it is available or for sale",
  novelty: "novelty or new arrivals; nothing says anything is new",
  invented_behaviour: "a feeling, wish or habit of the business or its team; none is declared",
  unsupported_intent: "a purpose or design intent (designed for, ideal for); none is declared",
  unsupported_quality: "an atmosphere or quality claim (cozy, premium, exclusive); none is declared",
};
