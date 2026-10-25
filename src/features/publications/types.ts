export const PUBLICATION_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const PUBLICATION_IMAGE_MIN_SIDE = 320;
export const PUBLICATION_IMAGE_MAX_SIDE = 8192;
export const PUBLICATION_IMAGE_MAX_PIXELS = 40_000_000;
export const PUBLICATION_DRAFT_LIMIT = 20;
export const PUBLICATION_UPLOAD_MIMES = ['image/jpeg', 'image/png'] as const;

export type PublicationImageMime = (typeof PUBLICATION_UPLOAD_MIMES)[number];

export interface PublicationImage {
  path: string;
  mime: PublicationImageMime;
  bytes: number;
  width: number;
  height: number;
  uploadedAt: string;
}

interface PublicationBase {
  id: string;
  businessId: string;
  createdAt: string;
  updatedAt: string;
}

export const PUBLICATION_GENERATIONS_LIMIT = 4;
export const PUBLICATION_PROPOSAL_ROLES = ['direct', 'close', 'professional'] as const;
export const PUBLICATION_LANGS = ['es', 'en'] as const;

export type PublicationProposalRole = (typeof PUBLICATION_PROPOSAL_ROLES)[number];
export type PublicationLang = (typeof PUBLICATION_LANGS)[number];

export interface PublicationProposalSet {
  generationId: string;
  lang: PublicationLang;
  generatedAt: string;
  generationsUsed: number;
}

export interface PublicationProposal {
  id: string;
  generationId: string;
  position: 1 | 2 | 3;
  role: PublicationProposalRole;
  lang: PublicationLang;
  body: string;
  cta: string;
}

export type Publication =
  | (PublicationBase & { status: 'draft'; image: null; generationsUsed: number; proposals: null })
  | (PublicationBase & { status: 'image_ready'; image: PublicationImage; generationsUsed: number; proposals: null })
  | (PublicationBase & { status: 'proposals_ready'; image: PublicationImage; generationsUsed: number; proposals: PublicationProposalSet });

export type PublicationStatus = Publication['status'];

export type PublicationErrorCode =
  | 'unauthenticated'
  | 'not_found'
  | 'draft_limit'
  | 'business_not_owned'
  | 'invalid_request'
  | 'file_empty'
  | 'file_too_large'
  | 'unsupported_media_type'
  | 'image_unreadable'
  | 'image_dimensions_out_of_range'
  | 'image_already_attached'
  | 'no_image_to_replace'
  | 'conflict'
  | 'image_required'
  | 'image_not_normalized'
  | 'business_context_missing'
  | 'generation_in_progress'
  | 'regeneration_limit'
  | 'image_changed'
  | 'duplicate_request'
  | 'ai_limit'
  | 'image_not_understandable'
  | 'business_image_mismatch'
  | 'generation_failed'
  | 'premium_required'
  | 'rate_limited'
  | 'provider_timeout'
  | 'unavailable';

export interface PublicationGrounding {
  observed: string[];
  uncertain: string[];
}

export interface PublicationMismatch {
  imageSummary: string;
  businessSummary: string;
  message: string;
}

export class PublicationError extends Error {
  constructor(public readonly code: PublicationErrorCode, public readonly mismatch?: PublicationMismatch) {
    super(code);
    this.name = 'PublicationError';
  }
}
