import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../../lib/supabase';
import {
  PUBLICATION_LANGS,
  PUBLICATION_PROPOSAL_ROLES,
  type PublicationLang,
  type PublicationProposalRole,
} from '../types';
import {
  DraftError,
  type DraftErrorCode,
  type ProposalPosition,
  type ProposalSelectionResult,
  type PublicationDraft,
} from './types';

type Db = Pick<SupabaseClient, 'from' | 'rpc'>;

const SELECT_RPC = 'select_publication_proposal';
const DRAFT_COLUMNS = 'publication_id, business_id, source_generation_id, source_position, source_role, '
  + 'source_lang, source_body, source_cta, selected_at, version';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RPC_ERRORS: Record<string, DraftErrorCode> = {
  unauthenticated: 'unauthenticated',
  not_found: 'not_found',
  not_ready: 'publication_not_ready',
  stale_generation: 'stale_generation',
  invalid_position: 'invalid_position',
  proposal_not_found: 'proposal_not_found',
  busy: 'busy',
};

const AUTH_ERROR_CODES = new Set(['42501', 'PGRST301', 'PGRST302']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is ProposalPosition {
  return value === 1 || value === 2 || value === 3;
}

function isRole(value: unknown): value is PublicationProposalRole {
  return typeof value === 'string' && (PUBLICATION_PROPOSAL_ROLES as readonly string[]).includes(value);
}

function isLang(value: unknown): value is PublicationLang {
  return typeof value === 'string' && (PUBLICATION_LANGS as readonly string[]).includes(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function transportError(error: { code?: string } | null): DraftError {
  if (error?.code && AUTH_ERROR_CODES.has(error.code)) return new DraftError('unauthenticated');
  return new DraftError('unavailable');
}

export function toDraft(row: unknown): PublicationDraft | null {
  if (!isRecord(row)) return null;
  const {
    publication_id, business_id, source_generation_id, source_position, source_role,
    source_lang, source_body, source_cta, selected_at, version,
  } = row;
  if (!isText(publication_id) || !isText(business_id) || !isText(source_generation_id)) return null;
  if (!isPosition(source_position) || !isRole(source_role) || !isLang(source_lang)) return null;
  if (!isText(source_body) || !isText(source_cta) || !isText(selected_at)) return null;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
  return {
    publicationId: publication_id,
    businessId: business_id,
    sourceGenerationId: source_generation_id,
    sourcePosition: source_position,
    sourceRole: source_role,
    sourceLang: source_lang,
    sourceBody: source_body,
    sourceCta: source_cta,
    selectedAt: selected_at,
    version,
  };
}

export function mapSelectionResponse(data: unknown): ProposalSelectionResult {
  if (!isRecord(data) || typeof data.result !== 'string') throw new DraftError('unknown');
  const { result, version } = data;
  if (result === 'selected' || result === 'unchanged') {
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
      throw new DraftError('unknown');
    }
    return { outcome: result, version };
  }
  throw new DraftError(RPC_ERRORS[result] ?? 'unknown');
}

export async function getPublicationDraft(
  publicationId: string,
  db: Db = supabase,
): Promise<PublicationDraft | null> {
  if (!UUID_RE.test(publicationId)) throw new DraftError('not_found');
  const { data, error } = await db
    .from('publication_drafts')
    .select(DRAFT_COLUMNS)
    .eq('publication_id', publicationId)
    .maybeSingle()
    .then((res) => res, () => ({ data: null, error: { code: undefined } }));
  if (error) throw transportError(error);
  if (data === null) return null;
  const draft = toDraft(data);
  if (!draft) throw new DraftError('unknown');
  return draft;
}

export async function selectPublicationProposal(
  publicationId: string,
  position: number,
  expectedGenerationId: string,
  db: Db = supabase,
): Promise<ProposalSelectionResult> {
  if (!UUID_RE.test(publicationId)) throw new DraftError('not_found');
  if (!isPosition(position)) throw new DraftError('invalid_position');
  if (!UUID_RE.test(expectedGenerationId)) throw new DraftError('stale_generation');
  const { data, error } = await db.rpc(SELECT_RPC, {
    p_publication_id: publicationId,
    p_position: position,
    p_expected_generation_id: expectedGenerationId,
  }).then((res) => res, () => ({ data: null, error: { code: undefined } }));
  if (error) throw transportError(error);
  return mapSelectionResponse(data);
}
