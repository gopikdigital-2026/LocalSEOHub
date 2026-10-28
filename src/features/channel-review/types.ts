export const CHANNEL_LIMITS = { facebook: 5000, instagram: 2200 } as const;
export const SAVE_RPC = 'save_publication_channel_drafts';

export type Channel = keyof typeof CHANNEL_LIMITS;
export type TextIssue = 'empty' | 'too_long' | 'control_chars' | 'markup';
export type Readiness = 'not_ready' | 'ready';

export interface ReviewDraft {
  publicationId: string;
  version: number;
  sourceGenerationId: string;
  facebookGenerated: string;
  instagramGenerated: string;
  facebookText: string;
  instagramText: string;
  updatedAt: string;
}

export type ChannelChange = { kind: 'keep' } | { kind: 'text'; text: string } | { kind: 'restore' };

export type ReviewErrorCode =
  | 'unauthenticated'
  | 'not_found'
  | 'forbidden'
  | 'not_ready'
  | 'busy'
  | 'stale_draft'
  | 'invalid_facebook_text'
  | 'invalid_instagram_text'
  | 'invalid_payload'
  | 'payload_too_large'
  | 'internal_error';

export class ReviewError extends Error {
  constructor(public readonly code: ReviewErrorCode, public readonly reason: TextIssue | null = null) {
    super(code);
    this.name = 'ReviewError';
  }
}
