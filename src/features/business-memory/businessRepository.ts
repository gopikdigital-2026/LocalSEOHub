import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { BUSINESS_COLUMNS, type BusinessPatch, type BusinessRecord } from './businessRecord';
import { LEGACY_MEMORY_KEY, extractLegacyMemory, isValidBusinessId, planLegacyMerge } from './legacyMigration';
import {
  ActiveBusinessError, OWNED_BUSINESS_LOOKUP_LIMIT, resolveActiveBusiness,
} from '../../../supabase/functions/activeBusiness';

type Db = Pick<SupabaseClient, 'from'>;
type LegacyStorage = Pick<Storage, 'getItem'>;

function assertRecord(data: unknown): BusinessRecord {
  const rec = data as BusinessRecord | null;
  if (!rec || !isValidBusinessId(rec.id)) throw new Error('Respuesta de negocio no valida');
  return rec;
}

async function fetchOwnBusinesses(db: Db, userId: string): Promise<BusinessRecord[]> {
  const { data, error } = await db
    .from('businesses')
    .select(BUSINESS_COLUMNS)
    .eq('user_id', userId)
    .limit(OWNED_BUSINESS_LOOKUP_LIMIT);
  if (error) throw new Error(error.message);
  if (!Array.isArray(data)) throw new Error('Respuesta de negocio no valida');
  return data.map(assertRecord);
}

// Database policies scope the lookup to the signed-in owner; the GBP services re-check ownership server-side.
// Throws ActiveBusinessError('selection_required') when several businesses exist and none was named.
export async function resolveBusiness(
  userId: string,
  db: Db = supabase,
  requestedBusinessId: string | null = null,
): Promise<BusinessRecord> {
  const owned = await fetchOwnBusinesses(db, userId);
  if (owned.length === 0 && requestedBusinessId === null) {
    const { error } = await db
      .from('businesses')
      .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    owned.push(...(await fetchOwnBusinesses(db, userId)));
    if (owned.length === 0) throw new Error('No se pudo crear el negocio');
  }

  const active = resolveActiveBusiness(owned.map((b) => b.id), requestedBusinessId);
  if (active.kind === 'selection_required') throw new ActiveBusinessError('selection_required');
  const business = active.kind === 'resolved' ? owned.find((b) => b.id === active.businessId) : undefined;
  if (!business) throw new Error('No se encontro el negocio');
  return business;
}

export async function updateBusinessRecord(
  businessId: string,
  patch: BusinessPatch | Record<string, unknown>,
  db: Db = supabase,
): Promise<BusinessRecord> {
  if (!isValidBusinessId(businessId)) throw new Error('Identificador de negocio no valido');
  const { data, error } = await db
    .from('businesses')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', businessId)
    .select(BUSINESS_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('No se encontro el negocio');
  return assertRecord(data);
}

// One-time import of user-typed fields from the pre-Supabase browser store; never overwrites stored values.
export async function importLegacyMemory(
  business: BusinessRecord,
  storage: LegacyStorage | null,
  db: Db = supabase,
): Promise<BusinessRecord> {
  if (business.legacy_memory_migrated_at) return business;
  let raw: string | null = null;
  try {
    raw = storage?.getItem(LEGACY_MEMORY_KEY) ?? null;
  } catch {
    raw = null;
  }
  const patch = planLegacyMerge(business, extractLegacyMemory(raw));
  if (patch === null) return business;
  return updateBusinessRecord(business.id, { ...patch, legacy_memory_migrated_at: new Date().toISOString() }, db);
}
