import type { PublicationLang, PublicationProposalRole } from '../publications/types';

export const ADAPTATIONS_PER_PUBLICATION = 3;
export const ADAPTATION_FUNCTION = 'publication-adaptations';

export interface ChannelDraft {
  publicationId: string;
  version: number;
  sourceGenerationId: string;
  sourcePosition: 1 | 2 | 3;
  sourceRole: PublicationProposalRole;
  sourceLang: PublicationLang;
  sourceBody: string;
  sourceCta: string;
  facebookText: string | null;
  instagramText: string | null;
  adaptedAt: string | null;
  adaptationsUsed: number;
}

export interface AdaptationResult {
  publicationId: string;
  version: number;
  adaptedAt: string;
  adaptationsUsed: number;
  adaptationsLimit: number;
  lang: PublicationLang;
  role: PublicationProposalRole;
  facebook: string;
  instagram: string;
}

export type AdaptationErrorCode =
  | 'unauthenticated'
  | 'premium_required'
  | 'rate_limited'
  | 'not_found'
  | 'publication_not_ready'
  | 'no_selected_proposal'
  | 'stale_selection'
  | 'busy'
  | 'limit_reached'
  | 'ai_unavailable'
  | 'invalid_ai_output'
  | 'unsafe_output'
  | 'conflict'
  | 'unavailable'
  | 'unknown';

export type LimitScope = 'publication' | 'monthly' | 'global';

export class AdaptationError extends Error {
  constructor(public readonly code: AdaptationErrorCode, public readonly scope: LimitScope | null = null) {
    super(code);
    this.name = 'AdaptationError';
  }
}
