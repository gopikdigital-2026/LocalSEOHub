import type { PublicationLang, PublicationProposalRole } from '../types';

export type ProposalPosition = 1 | 2 | 3;

export interface PublicationDraft {
  publicationId: string;
  businessId: string;
  sourceGenerationId: string;
  sourcePosition: ProposalPosition;
  sourceRole: PublicationProposalRole;
  sourceLang: PublicationLang;
  sourceBody: string;
  sourceCta: string;
  selectedAt: string;
  version: number;
}

export type ProposalSelectionOutcome = 'selected' | 'unchanged';

export interface ProposalSelectionResult {
  outcome: ProposalSelectionOutcome;
  version: number;
}

export type DraftErrorCode =
  | 'unauthenticated'
  | 'not_found'
  | 'publication_not_ready'
  | 'stale_generation'
  | 'invalid_position'
  | 'proposal_not_found'
  | 'busy'
  | 'unavailable'
  | 'unknown';

export class DraftError extends Error {
  constructor(public readonly code: DraftErrorCode) {
    super(code);
    this.name = 'DraftError';
  }
}
