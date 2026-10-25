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

export type Publication =
  | (PublicationBase & { status: 'draft'; image: null })
  | (PublicationBase & { status: 'image_ready'; image: PublicationImage });

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
  | 'unavailable';

export class PublicationError extends Error {
  constructor(public readonly code: PublicationErrorCode) {
    super(code);
    this.name = 'PublicationError';
  }
}
