import type { Publication } from '../publications/types';

export const PUB_PARAM = 'pub';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResumeStage = 'upload' | 'generate' | 'select' | 'adapt' | 'review';

export type PubParam = { kind: 'none' } | { kind: 'invalid' } | { kind: 'id'; id: string };

export interface DraftState {
  publicationId: string;
  sourceGenerationId: string;
  adapted: boolean;
  edited: boolean;
  updatedAt: string;
}

export interface ResumeCandidate {
  id: string;
  stage: ResumeStage;
  lastModified: string;
  edited: boolean;
}

export function parsePubParam(raw: string | null): PubParam {
  if (raw === null || raw === '') return { kind: 'none' };
  return UUID_RE.test(raw) ? { kind: 'id', id: raw.toLowerCase() } : { kind: 'invalid' };
}

// A draft counts only when it was selected from the proposal set that is current on the server.
export function currentDraft(pub: Publication, draft: DraftState | null): DraftState | null {
  if (!draft || pub.status !== 'proposals_ready' || draft.publicationId !== pub.id) return null;
  return draft.sourceGenerationId === pub.proposals.generationId ? draft : null;
}

export function deriveStage(pub: Publication, draft: DraftState | null): ResumeStage {
  if (pub.status === 'draft') return 'upload';
  if (pub.status === 'image_ready') return 'generate';
  const current = currentDraft(pub, draft);
  if (!current) return 'select';
  return current.adapted ? 'review' : 'adapt';
}

export function hasManualEdits(pub: Publication, draft: DraftState | null): boolean {
  const current = currentDraft(pub, draft);
  return !!current && current.adapted && current.edited;
}

const later = (a: string, b: string | undefined) => (b && b > a ? b : a);

// Lists every unfinished publication of the given business, newest activity first. Never picks one.
export function toResumeCandidates(pubs: Publication[], drafts: DraftState[], businessId: string): ResumeCandidate[] {
  const byId = new Map(drafts.map((d) => [d.publicationId, d]));
  return pubs
    .filter((p) => p.businessId === businessId)
    .map((p) => {
      const draft = byId.get(p.id) ?? null;
      return {
        id: p.id,
        stage: deriveStage(p, draft),
        lastModified: later(p.updatedAt, currentDraft(p, draft)?.updatedAt),
        edited: hasManualEdits(p, draft),
      };
    })
    .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}
