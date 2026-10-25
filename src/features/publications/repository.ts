import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  PUBLICATION_IMAGE_MAX_BYTES,
  PUBLICATION_UPLOAD_MIMES,
  PublicationError,
  PUBLICATION_LANGS,
  PUBLICATION_PROPOSAL_ROLES,
  type Publication,
  type PublicationErrorCode,
  type PublicationImage,
  type PublicationImageMime,
  type PublicationLang,
  type PublicationProposal,
} from './types';

type Db = Pick<SupabaseClient, 'from' | 'functions'>;

const FUNCTION = 'publication-media';
const PROPOSALS_FUNCTION = 'publication-proposals';
const COLUMNS = 'id, business_id, status, image_path, image_mime, image_bytes, image_width, image_height, image_uploaded_at, '
  + 'proposal_generation_id, proposals_lang, proposals_generated_at, proposal_generations_used, created_at, updated_at';
const PROPOSAL_COLUMNS = 'id, generation_id, position, role, lang, body, cta';

const SERVER_CODES: Record<string, PublicationErrorCode> = {
  UNAUTHENTICATED: 'unauthenticated',
  NOT_FOUND: 'not_found',
  INVALID_REQUEST: 'invalid_request',
  FILE_EMPTY: 'file_empty',
  FILE_TOO_LARGE: 'file_too_large',
  UNSUPPORTED_MEDIA_TYPE: 'unsupported_media_type',
  IMAGE_UNREADABLE: 'image_unreadable',
  IMAGE_DIMENSIONS_OUT_OF_RANGE: 'image_dimensions_out_of_range',
  IMAGE_ALREADY_ATTACHED: 'image_already_attached',
  NO_IMAGE_TO_REPLACE: 'no_image_to_replace',
  CONFLICT: 'conflict',
  IMAGE_REQUIRED: 'image_required',
  IMAGE_NOT_NORMALIZED: 'image_not_normalized',
  BUSINESS_CONTEXT_MISSING: 'business_context_missing',
  GENERATION_IN_PROGRESS: 'generation_in_progress',
  REGENERATION_LIMIT_REACHED: 'regeneration_limit',
  IMAGE_CHANGED: 'image_changed',
  DUPLICATE_REQUEST: 'duplicate_request',
  AI_LIMIT_REACHED: 'ai_limit',
  AI_GLOBAL_LIMIT_REACHED: 'ai_limit',
  IMAGE_NOT_UNDERSTANDABLE: 'image_not_understandable',
  GENERATION_UNSAFE: 'generation_failed',
  PROPOSALS_NOT_DISTINCT: 'generation_failed',
  INVALID_MODEL_OUTPUT: 'generation_failed',
};

const isMime = (v: unknown): v is PublicationImageMime =>
  typeof v === 'string' && (PUBLICATION_UPLOAD_MIMES as readonly string[]).includes(v);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isLang = (v: unknown): v is PublicationLang =>
  typeof v === 'string' && (PUBLICATION_LANGS as readonly string[]).includes(v);

function toImage(r: Record<string, unknown>): PublicationImage | null {
  if (typeof r.image_path !== 'string' || !isMime(r.image_mime) || !isNum(r.image_bytes) || !isNum(r.image_width)
    || !isNum(r.image_height) || typeof r.image_uploaded_at !== 'string') return null;
  return {
    path: r.image_path, mime: r.image_mime, bytes: r.image_bytes,
    width: r.image_width, height: r.image_height, uploadedAt: r.image_uploaded_at,
  };
}

export function toPublication(row: unknown): Publication | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.business_id !== 'string'
    || typeof r.created_at !== 'string' || typeof r.updated_at !== 'string') return null;
  if (!isNum(r.proposal_generations_used)) return null;
  const base = {
    id: r.id, businessId: r.business_id, createdAt: r.created_at, updatedAt: r.updated_at,
    generationsUsed: r.proposal_generations_used,
  };
  if (r.status === 'draft' && r.image_path === null) return { ...base, status: 'draft', image: null, proposals: null };
  const image = toImage(r);
  if (!image) return null;
  if (r.status === 'image_ready') return { ...base, status: 'image_ready', image, proposals: null };
  if (r.status === 'proposals_ready' && typeof r.proposal_generation_id === 'string' && isLang(r.proposals_lang)
    && typeof r.proposals_generated_at === 'string') {
    return {
      ...base,
      status: 'proposals_ready',
      image,
      proposals: {
        generationId: r.proposal_generation_id, lang: r.proposals_lang,
        generatedAt: r.proposals_generated_at, generationsUsed: r.proposal_generations_used,
      },
    };
  }
  return null;
}

function insertErrorCode(error: { code?: string; message?: string }): PublicationErrorCode {
  const message = error.message ?? '';
  if (message.includes('publication_draft_limit')) return 'draft_limit';
  if (error.code === '42501' || message.includes('publication_business_not_owned')) return 'business_not_owned';
  return 'unavailable';
}

export async function createDraft(businessId: string, db: Db = supabase): Promise<Publication> {
  const { data, error } = await db.from('publications').insert({ business_id: businessId }).select(COLUMNS).maybeSingle();
  if (error) throw new PublicationError(insertErrorCode(error));
  const pub = toPublication(data);
  if (!pub) throw new PublicationError('unavailable');
  return pub;
}

export async function getDraft(id: string, db: Db = supabase): Promise<Publication | null> {
  const { data, error } = await db.from('publications').select(COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new PublicationError('unavailable');
  return data ? toPublication(data) : null;
}

export async function listDrafts(businessId: string, db: Db = supabase): Promise<Publication[]> {
  const { data, error } = await db.from('publications').select(COLUMNS)
    .eq('business_id', businessId).order('created_at', { ascending: false });
  if (error || !Array.isArray(data)) throw new PublicationError('unavailable');
  return data.map(toPublication).filter((p): p is Publication => p !== null);
}

async function serverErrorCode(error: unknown): Promise<PublicationErrorCode> {
  const ctx = (error as { context?: unknown })?.context;
  if (ctx instanceof Response) {
    try {
      const body = await ctx.clone().json();
      if (typeof body?.code === 'string' && Object.prototype.hasOwnProperty.call(SERVER_CODES, body.code)) return SERVER_CODES[body.code];
    } catch {
      return 'unavailable';
    }
  }
  return 'unavailable';
}

// Fast feedback only; the server re-validates bytes, type and dimensions.
function precheck(file: Blob): PublicationImageMime {
  if (file.size === 0) throw new PublicationError('file_empty');
  if (file.size > PUBLICATION_IMAGE_MAX_BYTES) throw new PublicationError('file_too_large');
  if (!isMime(file.type)) throw new PublicationError('unsupported_media_type');
  return file.type;
}

async function invoke(action: 'attach' | 'replace' | 'delete', id: string, db: Db, file?: Blob) {
  const name = `${FUNCTION}?action=${action}&publication_id=${encodeURIComponent(id)}`;
  const { data, error } = await db.functions.invoke(name, file
    ? { method: 'POST', body: file, headers: { 'Content-Type': precheck(file) } }
    : { method: 'POST' });
  if (error) throw new PublicationError(await serverErrorCode(error));
  if ((data as { ok?: unknown } | null)?.ok !== true) throw new PublicationError('unavailable');
}

async function uploadAndReload(action: 'attach' | 'replace', id: string, file: Blob, db: Db): Promise<Publication> {
  await invoke(action, id, db, file);
  const pub = await getDraft(id, db);
  if (!pub || pub.status !== 'image_ready') throw new PublicationError('unavailable');
  return pub;
}

export function attachImage(id: string, file: Blob, db: Db = supabase): Promise<Publication> {
  return uploadAndReload('attach', id, file, db);
}

export function replaceImage(id: string, file: Blob, db: Db = supabase): Promise<Publication> {
  return uploadAndReload('replace', id, file, db);
}

export async function deleteDraft(id: string, db: Db = supabase): Promise<void> {
  await invoke('delete', id, db);
}

export function toProposal(row: unknown): PublicationProposal | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.generation_id !== 'string' || typeof r.body !== 'string'
    || typeof r.cta !== 'string' || !isLang(r.lang)) return null;
  if (r.position !== 1 && r.position !== 2 && r.position !== 3) return null;
  if (r.role !== PUBLICATION_PROPOSAL_ROLES[r.position - 1]) return null;
  return {
    id: r.id, generationId: r.generation_id, position: r.position, role: r.role as PublicationProposal['role'],
    lang: r.lang, body: r.body, cta: r.cta,
  };
}

// Returns the stored set only when it is complete and belongs to a single generation.
export async function getProposals(publicationId: string, db: Db = supabase): Promise<PublicationProposal[]> {
  const { data, error } = await db.from('publication_proposals').select(PROPOSAL_COLUMNS)
    .eq('publication_id', publicationId).order('position', { ascending: true });
  if (error || !Array.isArray(data)) throw new PublicationError('unavailable');
  const proposals = data.map(toProposal);
  if (!proposals.length) return [];
  if (proposals.length !== 3 || proposals.some((p) => !p || p.generationId !== proposals[0]?.generationId)) {
    throw new PublicationError('unavailable');
  }
  return proposals as PublicationProposal[];
}

export async function generateProposals(
  publicationId: string,
  lang: PublicationLang,
  requestId: string = crypto.randomUUID(),
  db: Db = supabase,
): Promise<{ publication: Publication; proposals: PublicationProposal[] }> {
  const { data, error } = await db.functions.invoke(PROPOSALS_FUNCTION, {
    method: 'POST',
    body: { publication_id: publicationId, request_id: requestId, lang },
  });
  if (error) throw new PublicationError(await serverErrorCode(error));
  if ((data as { ok?: unknown } | null)?.ok !== true) throw new PublicationError('unavailable');
  const publication = await getDraft(publicationId, db);
  if (!publication || publication.status !== 'proposals_ready') throw new PublicationError('unavailable');
  const proposals = await getProposals(publicationId, db);
  if (proposals.length !== 3 || proposals[0].generationId !== publication.proposals.generationId) {
    throw new PublicationError('unavailable');
  }
  return { publication, proposals };
}
