import type { Publication } from '../publications/types';
import { toResumeCandidates, type DraftState, type PubParam, type ResumeCandidate } from './model';

export type ResumeState =
  | { status: 'loading' }
  | { status: 'none'; candidates: ResumeCandidate[] }
  | { status: 'ready'; publication: Publication; draft: DraftState | null }
  | { status: 'unavailable' }
  | { status: 'other_business' };

export interface ResumeApi {
  getDraft: (id: string) => Promise<Publication | null>;
  listDrafts: (businessId: string) => Promise<Publication[]>;
  listDraftStates: (ids: string[]) => Promise<DraftState[]>;
}

// The URL id is only a pointer: every lookup goes through the owner-scoped server reads, and a missing,
// foreign or malformed id all collapse into the same 'unavailable' answer.
export async function resolveResume(param: PubParam, businessId: string, api: ResumeApi): Promise<ResumeState> {
  try {
    if (param.kind === 'invalid') return { status: 'unavailable' };
    if (param.kind === 'none') {
      const pubs = await api.listDrafts(businessId);
      const drafts = await api.listDraftStates(pubs.map((p) => p.id));
      return { status: 'none', candidates: toResumeCandidates(pubs, drafts, businessId) };
    }
    const publication = await api.getDraft(param.id);
    if (!publication || publication.id !== param.id) return { status: 'unavailable' };
    if (publication.businessId !== businessId) return { status: 'other_business' };
    const [draft] = await api.listDraftStates([publication.id]);
    return { status: 'ready', publication, draft: draft?.publicationId === publication.id ? draft : null };
  } catch {
    return { status: 'unavailable' };
  }
}
