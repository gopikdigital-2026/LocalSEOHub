import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { PublicationError } from '../publications/types';
import { isEdited } from '../channel-review/model';
import type { DraftState } from './model';

type Db = Pick<SupabaseClient, 'from'>;

const COLUMNS = 'publication_id, source_generation_id, facebook_generated, instagram_generated, facebook_text, instagram_text, updated_at';

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

export function toDraftState(row: unknown): DraftState | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (!isText(r.publication_id) || !isText(r.source_generation_id) || !isText(r.updated_at)) return null;
  const adapted = isText(r.facebook_generated) && isText(r.instagram_generated) && isText(r.facebook_text) && isText(r.instagram_text);
  return {
    publicationId: r.publication_id,
    sourceGenerationId: r.source_generation_id,
    adapted,
    edited: adapted
      && (isEdited(r.facebook_text as string, r.facebook_generated as string) || isEdited(r.instagram_text as string, r.instagram_generated as string)),
    updatedAt: r.updated_at,
  };
}

// Row level security limits the rows to the signed-in owner; ids the owner cannot see simply return nothing.
export async function listDraftStates(publicationIds: string[], db: Db = supabase): Promise<DraftState[]> {
  if (!publicationIds.length) return [];
  const { data, error } = await db.from('publication_drafts').select(COLUMNS).in('publication_id', publicationIds);
  if (error || !Array.isArray(data)) throw new PublicationError('unavailable');
  return data.map(toDraftState).filter((d): d is DraftState => d !== null);
}
