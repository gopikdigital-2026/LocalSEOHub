import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import {
  PUBLICATION_IMAGE_MAX_BYTES,
  PUBLICATION_UPLOAD_MIMES,
  PublicationError,
  type Publication,
  type PublicationErrorCode,
  type PublicationImageMime,
} from './types';

type Db = Pick<SupabaseClient, 'from' | 'functions'>;

const FUNCTION = 'publication-media';
const COLUMNS = 'id, business_id, status, image_path, image_mime, image_bytes, image_width, image_height, image_uploaded_at, created_at, updated_at';

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
};

const isMime = (v: unknown): v is PublicationImageMime =>
  typeof v === 'string' && (PUBLICATION_UPLOAD_MIMES as readonly string[]).includes(v);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function toPublication(row: unknown): Publication | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.business_id !== 'string'
    || typeof r.created_at !== 'string' || typeof r.updated_at !== 'string') return null;
  const base = { id: r.id, businessId: r.business_id, createdAt: r.created_at, updatedAt: r.updated_at };
  if (r.status === 'draft' && r.image_path === null) return { ...base, status: 'draft', image: null };
  if (r.status === 'image_ready' && typeof r.image_path === 'string' && isMime(r.image_mime)
    && isNum(r.image_bytes) && isNum(r.image_width) && isNum(r.image_height) && typeof r.image_uploaded_at === 'string') {
    return {
      ...base,
      status: 'image_ready',
      image: {
        path: r.image_path, mime: r.image_mime, bytes: r.image_bytes,
        width: r.image_width, height: r.image_height, uploadedAt: r.image_uploaded_at,
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
