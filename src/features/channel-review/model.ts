import { CHANNEL_LIMITS, type Channel, type Readiness, type ReviewDraft, type TextIssue } from './types';

// Mirrors public.publication_channel_text_issue; the server re-checks every save.
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u200E\u200F\u202A-\u202E\u2066-\u2069]/;
const MARKUP_RE = /<[/!]?[A-Za-z]/;

export const normalizeText = (text: string): string => text.replace(/\r\n?/g, '\n');

// Code points, matching Postgres char_length (an emoji counts as one).
export const countChars = (text: string): number => Array.from(normalizeText(text)).length;

export function textIssue(text: string, channel: Channel): TextIssue | null {
  const value = normalizeText(text);
  if (value.trim() === '') return 'empty';
  if (countChars(value) > CHANNEL_LIMITS[channel]) return 'too_long';
  if (CONTROL_RE.test(value)) return 'control_chars';
  if (MARKUP_RE.test(value)) return 'markup';
  return null;
}

const same = (a: string, b: string) => normalizeText(a).trim() === normalizeText(b).trim();

export const isEdited = (final: string, generated: string): boolean => !same(final, generated);

export const isDirty = (local: string, saved: string): boolean => normalizeText(local) !== normalizeText(saved);

export function readiness(draft: ReviewDraft | null, currentGenerationId: string | null): Readiness {
  if (!draft || !currentGenerationId || draft.sourceGenerationId !== currentGenerationId) return 'not_ready';
  return textIssue(draft.facebookText, 'facebook') === null && textIssue(draft.instagramText, 'instagram') === null
    ? 'ready'
    : 'not_ready';
}
