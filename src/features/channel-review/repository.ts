import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { textIssue } from './model';
import { SAVE_RPC, ReviewError, type ChannelChange, type ReviewDraft, type ReviewErrorCode, type TextIssue } from './types';

type Db = Pick<SupabaseClient, 'from' | 'rpc'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNS = 'publication_id, version, source_generation_id, facebook_generated, instagram_generated, facebook_text, instagram_text, updated_at';
const SERVER_CODES: readonly ReviewErrorCode[] = [
  'unauthenticated', 'not_found', 'forbidden', 'not_ready', 'busy', 'stale_draft',
  'invalid_facebook_text', 'invalid_instagram_text', 'invalid_payload', 'payload_too_large',
];
const ISSUES: readonly TextIssue[] = ['empty', 'too_long', 'control_chars', 'markup'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isVersion = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;

export function toReviewDraft(row: unknown): ReviewDraft | null {
  if (!isRecord(row)) return null;
  const {
    publication_id, version, source_generation_id, facebook_generated, instagram_generated, facebook_text, instagram_text, updated_at,
  } = row;
  if (!isText(publication_id) || !isVersion(version) || !isText(source_generation_id) || !isText(updated_at)) return null;
  if (!isText(facebook_generated) || !isText(instagram_generated) || !isText(facebook_text) || !isText(instagram_text)) return null;
  return {
    publicationId: publication_id,
    version,
    sourceGenerationId: source_generation_id,
    facebookGenerated: facebook_generated,
    instagramGenerated: instagram_generated,
    facebookText: facebook_text,
    instagramText: instagram_text,
    updatedAt: updated_at,
  };
}

// Returns null when there is no draft yet or it has not been adapted.
export async function getReviewDraft(publicationId: string, db: Db = supabase): Promise<ReviewDraft | null> {
  if (!UUID_RE.test(publicationId)) throw new ReviewError('not_found');
  const { data, error } = await db.from('publication_drafts').select(COLUMNS)
    .eq('publication_id', publicationId).maybeSingle()
    .then((res) => res, () => ({ data: null, error: { code: undefined } }));
  if (error) throw new ReviewError('internal_error');
  if (data === null) return null;
  if (isRecord(data) && (data.facebook_generated === null || data.instagram_generated === null)) return null;
  const draft = toReviewDraft(data);
  if (!draft) throw new ReviewError('internal_error');
  return draft;
}

function channelArgs(change: ChannelChange, channel: 'facebook' | 'instagram'): { text: string | null; restore: boolean } {
  if (change.kind === 'restore') return { text: null, restore: true };
  if (change.kind === 'keep') return { text: null, restore: false };
  const issue = textIssue(change.text, channel);
  if (issue) throw new ReviewError(channel === 'facebook' ? 'invalid_facebook_text' : 'invalid_instagram_text', issue);
  return { text: change.text, restore: false };
}

export function toSaveResult(data: unknown, publicationId: string, sourceGenerationId: string): ReviewDraft {
  if (!isRecord(data)) throw new ReviewError('internal_error');
  if (data.result !== 'saved' && data.result !== 'unchanged') {
    const code = SERVER_CODES.find((c) => c === data.result);
    const reason = ISSUES.find((i) => i === data.reason) ?? null;
    throw new ReviewError(code ?? 'internal_error', reason);
  }
  const draft = isRecord(data.draft)
    ? toReviewDraft({ ...data.draft, publication_id: publicationId, source_generation_id: sourceGenerationId })
    : null;
  if (!draft) throw new ReviewError('internal_error');
  return draft;
}

// The browser sends only the publication id, the expected version and the channel texts;
// ownership, business and generated originals are resolved and protected by the server.
export async function saveChannelDrafts(
  draft: Pick<ReviewDraft, 'publicationId' | 'version' | 'sourceGenerationId'>,
  facebook: ChannelChange,
  instagram: ChannelChange,
  db: Db = supabase,
): Promise<ReviewDraft> {
  if (!UUID_RE.test(draft.publicationId)) throw new ReviewError('not_found');
  if (!isVersion(draft.version)) throw new ReviewError('stale_draft');
  const fb = channelArgs(facebook, 'facebook');
  const ig = channelArgs(instagram, 'instagram');
  if (fb.text === null && ig.text === null && !fb.restore && !ig.restore) throw new ReviewError('invalid_payload');
  const { data, error } = await db.rpc(SAVE_RPC, {
    p_publication_id: draft.publicationId,
    p_expected_version: draft.version,
    p_facebook: fb.text,
    p_instagram: ig.text,
    p_restore_facebook: fb.restore,
    p_restore_instagram: ig.restore,
  }).then((res) => res, () => ({ data: null, error: { code: undefined } }));
  if (error) throw new ReviewError((error as { code?: string }).code === '42501' ? 'unauthenticated' : 'internal_error');
  return toSaveResult(data, draft.publicationId, draft.sourceGenerationId);
}
