import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { PUBLICATION_LANGS, PUBLICATION_PROPOSAL_ROLES, type PublicationLang, type PublicationProposalRole } from '../publications/types';
import {
  ADAPTATION_FUNCTION,
  AdaptationError,
  type AdaptationErrorCode,
  type AdaptationResult,
  type ChannelDraft,
  type LimitScope,
} from './types';

type Db = Pick<SupabaseClient, 'from' | 'functions'>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHANNEL_COLUMNS = 'publication_id, version, source_generation_id, source_position, source_role, source_lang, source_body, source_cta, '
  + 'facebook_text, instagram_text, adapted_at, adaptations_used';

const SERVER_CODES: readonly AdaptationErrorCode[] = [
  'unauthenticated', 'not_found', 'publication_not_ready', 'no_selected_proposal', 'stale_selection', 'busy',
  'limit_reached', 'ai_unavailable', 'invalid_ai_output', 'unsafe_output', 'conflict', 'unavailable', 'unknown',
];
const GATE_CODES: Record<string, AdaptationErrorCode> = {
  unauthorized: 'unauthenticated',
  premium_required: 'premium_required',
  rate_limited: 'rate_limited',
};
const SCOPES: readonly LimitScope[] = ['publication', 'monthly', 'global'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isVersion = (v: unknown): v is number => isCount(v) && v >= 1;
const isLang = (v: unknown): v is PublicationLang => typeof v === 'string' && (PUBLICATION_LANGS as readonly string[]).includes(v);
const isRole = (v: unknown): v is PublicationProposalRole =>
  typeof v === 'string' && (PUBLICATION_PROPOSAL_ROLES as readonly string[]).includes(v);
const optionalText = (v: unknown): v is string | null => v === null || isText(v);

export function toChannelDraft(row: unknown): ChannelDraft | null {
  if (!isRecord(row)) return null;
  const {
    publication_id, version, source_generation_id, source_position, source_role, source_lang, source_body, source_cta,
    facebook_text, instagram_text, adapted_at, adaptations_used,
  } = row;
  if (!isText(publication_id) || !isText(source_generation_id) || !isVersion(version) || !isCount(adaptations_used)) return null;
  if (source_position !== 1 && source_position !== 2 && source_position !== 3) return null;
  if (!isRole(source_role) || !isLang(source_lang) || !isText(source_body) || !isText(source_cta)) return null;
  if (!optionalText(facebook_text) || !optionalText(instagram_text) || !optionalText(adapted_at)) return null;
  return {
    publicationId: publication_id,
    version,
    sourceGenerationId: source_generation_id,
    sourcePosition: source_position,
    sourceRole: source_role,
    sourceLang: source_lang,
    sourceBody: source_body,
    sourceCta: source_cta,
    facebookText: facebook_text,
    instagramText: instagram_text,
    adaptedAt: adapted_at,
    adaptationsUsed: adaptations_used,
  };
}

export async function getChannelDraft(publicationId: string, db: Db = supabase): Promise<ChannelDraft | null> {
  if (!UUID_RE.test(publicationId)) throw new AdaptationError('not_found');
  const { data, error } = await db.from('publication_drafts').select(CHANNEL_COLUMNS)
    .eq('publication_id', publicationId).maybeSingle()
    .then((res) => res, () => ({ data: null, error: { code: undefined } }));
  if (error) throw new AdaptationError('unavailable');
  if (data === null) return null;
  const draft = toChannelDraft(data);
  if (!draft) throw new AdaptationError('unknown');
  return draft;
}

export function toAdaptationResult(data: unknown): AdaptationResult {
  if (!isRecord(data) || data.ok !== true) throw new AdaptationError('unknown');
  const { draft, facebook, instagram } = data;
  if (!isRecord(draft) || !isRecord(facebook) || !isRecord(instagram)) throw new AdaptationError('unknown');
  const { publicationId, version, adaptedAt, adaptationsUsed, adaptationsLimit, lang, role } = draft;
  if (!isText(publicationId) || !isVersion(version) || !isText(adaptedAt) || !isCount(adaptationsUsed)
    || !isVersion(adaptationsLimit) || !isLang(lang) || !isRole(role) || !isText(facebook.text) || !isText(instagram.text)) {
    throw new AdaptationError('unknown');
  }
  return {
    publicationId, version, adaptedAt, adaptationsUsed, adaptationsLimit, lang, role,
    facebook: facebook.text, instagram: instagram.text,
  };
}

async function toServerError(error: unknown): Promise<AdaptationError> {
  const ctx = (error as { context?: unknown })?.context;
  if (!(ctx instanceof Response)) return new AdaptationError('unavailable');
  try {
    const body: unknown = await ctx.clone().json();
    if (!isRecord(body)) return new AdaptationError('unavailable');
    const scope = SCOPES.find((s) => s === body.scope) ?? null;
    const code = SERVER_CODES.find((c) => c === body.code);
    if (code) return new AdaptationError(code, code === 'limit_reached' ? scope : null);
    if (typeof body.error === 'string' && Object.prototype.hasOwnProperty.call(GATE_CODES, body.error)) {
      return new AdaptationError(GATE_CODES[body.error]);
    }
  } catch {
    return new AdaptationError('unavailable');
  }
  return new AdaptationError('unavailable');
}

// The server loads every text itself; the browser sends only identifiers and the expected version.
export async function adaptPublication(
  publicationId: string,
  expectedVersion: number,
  requestId: string = crypto.randomUUID(),
  db: Db = supabase,
): Promise<AdaptationResult> {
  if (!UUID_RE.test(publicationId) || !UUID_RE.test(requestId)) throw new AdaptationError('not_found');
  if (!isVersion(expectedVersion)) throw new AdaptationError('stale_selection');
  const { data, error } = await db.functions.invoke(ADAPTATION_FUNCTION, {
    body: { publication_id: publicationId, expected_version: expectedVersion, request_id: requestId },
  }).then((res) => res, (e: unknown) => ({ data: null, error: e }));
  if (error) throw await toServerError(error);
  return toAdaptationResult(data);
}
