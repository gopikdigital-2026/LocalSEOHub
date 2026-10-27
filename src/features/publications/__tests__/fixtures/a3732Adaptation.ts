import { vi } from 'vitest';
import {
  adapt,
  type AdaptationDeps,
  type ClaimStatus,
  type CompleteResult,
  type DraftRow,
  type ModelResult,
  type ReserveStatus,
} from '../../../../../supabase/functions/publication-adaptations/handler.ts';
import type { SourceSnapshot } from '../../../../../supabase/functions/publication-adaptations/adaptation.ts';

export const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const PUB = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
export const BIZ = 'a0a0a0a0-a0a0-4a0a-8a0a-a0a0a0a0a0a0';
export const GEN = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
export const REQ = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';

export const BUSINESS = {
  name: 'Café Lumbre', category: 'Cafetería', city: 'Valencia', services: ['Desayunos', 'Repostería casera'],
  target_audience: 'vecinos del barrio', primary_goal: 'más visitas',
};

export const SOURCES: Record<string, SourceSnapshot> = {
  close: {
    role: 'close', lang: 'es',
    body: 'Hay tardes que piden algo dulce y una pausa tranquila. ¿Te apetece un café con calma y un trozo de repostería casera?',
    cta: 'Pásate a saludarnos',
  },
  direct: {
    role: 'direct', lang: 'es',
    body: 'Desayunos y repostería casera en Café Lumbre. Un buen comienzo para la mañana, con calma y en el barrio de siempre.',
    cta: 'Ven a desayunar',
  },
  professional: {
    role: 'professional', lang: 'es',
    body: 'Un desayuno sin prisas cambia el ritmo de toda la mañana. En Café Lumbre trabajamos los desayunos y la repostería casera para el barrio.',
    cta: 'Pregúntanos por la repostería',
  },
  en: {
    role: 'direct', lang: 'en',
    body: 'A slow breakfast changes the whole morning. At Café Lumbre the focus is on breakfasts and homemade pastries for the neighbourhood.',
    cta: 'Come by for breakfast',
  },
};

export const GOOD: Record<string, { facebook: string; instagram: string }> = {
  close: {
    facebook: 'Hay tardes que piden algo dulce y una pausa tranquila.\n\n¿Te apetece un café con calma y un trozo de repostería casera? Pásate a saludarnos.',
    instagram: '¿Una pausa dulce esta tarde? ☕\n\nUn café con calma y repostería casera te esperan. Pásate a saludarnos.\n\n#ReposteriaCasera #Cafe',
  },
  direct: {
    facebook: 'Desayunos y repostería casera en Café Lumbre.\n\nUn buen comienzo para la mañana, con calma y en el barrio de siempre. Ven a desayunar.',
    instagram: 'Empieza la mañana con calma.\n\nDesayunos y repostería casera en el barrio de siempre. Ven a desayunar.\n\n#Desayunos',
  },
  professional: {
    facebook: 'Un desayuno sin prisas cambia el ritmo de toda la mañana.\n\nEn Café Lumbre trabajamos los desayunos y la repostería casera para el barrio. Pregúntanos por la repostería.',
    instagram: 'El ritmo de la mañana empieza en el desayuno.\n\nDesayunos y repostería casera para el barrio, sin prisas. Pregúntanos por la repostería.',
  },
  en: {
    facebook: 'A slow breakfast changes the whole morning.\n\nAt Café Lumbre the focus is on breakfasts and homemade pastries for the neighbourhood. Come by for breakfast.',
    instagram: 'Mornings are better when you take it slow.\n\nBreakfasts and homemade pastries for the neighbourhood. Come by for breakfast.\n\n#Breakfasts #HomemadePastries',
  },
};

export const ok = (v: unknown): ModelResult => ({ ok: true, raw: JSON.stringify(v) });
export const answer = (t: { facebook: string; instagram: string }): ModelResult => ok({ facebook: { text: t.facebook }, instagram: { text: t.instagram } });

export interface Options {
  row?: Partial<DraftRow> | null;
  draft?: Partial<NonNullable<DraftRow['draft']>> | null;
  source?: SourceSnapshot;
  business?: Record<string, unknown> | null;
  claim?: ClaimStatus;
  reserve?: ReserveStatus;
  complete?: CompleteResult | null;
  models?: ModelResult[];
}

export function harness(o: Options = {}) {
  const source = o.source ?? SOURCES.close;
  const draft = o.draft === null ? null : {
    version: 2, sourceGenerationId: GEN, role: source.role, lang: source.lang, body: source.body, cta: source.cta, adaptationsUsed: 0, ...o.draft,
  };
  const row: DraftRow | null = o.row === null ? null : {
    publicationId: PUB, businessId: BIZ, status: 'proposals_ready', generationId: GEN, draft, ...o.row,
  };
  const models = [...(o.models ?? [answer(GOOD.close)])];
  const deps = {
    loadDraft: vi.fn(async () => row),
    loadBusiness: vi.fn(async () => (o.business === undefined ? BUSINESS : o.business)),
    claim: vi.fn(async () => o.claim ?? 'claimed'),
    release: vi.fn(async () => true),
    complete: vi.fn(async () => (o.complete === undefined ? { result: 'completed' as const, version: 3, adaptedAt: '2026-10-27T10:00:00Z', adaptationsUsed: 1 } : o.complete)),
    reserve: vi.fn(async () => o.reserve ?? 'reserved'),
    settle: vi.fn(async () => true),
    callModel: vi.fn(async () => models.shift() ?? { ok: false as const, billed: false, failure: 'server' as const }),
    log: vi.fn(),
  } satisfies AdaptationDeps;
  return deps;
}

export const body = (extra: Record<string, unknown> = {}) => JSON.stringify({ publication_id: PUB, expected_version: 2, request_id: REQ, ...extra });

export async function run(deps: AdaptationDeps, raw: string | null = body()) {
  const res = await adapt(USER, raw, deps);
  return { status: res.status, json: await res.json() };
}

