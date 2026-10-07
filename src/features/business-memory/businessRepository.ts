import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { BUSINESS_COLUMNS, type BusinessPatch, type BusinessRecord } from './businessRecord';
import { LEGACY_MEMORY_KEY, extractLegacyMemory, isValidBusinessId, planLegacyMerge } from './legacyMigration';

type Db = Pick<SupabaseClient, 'from'>;
type LegacyStorage = Pick<Storage, 'getItem'>;

function assertRecord(data: unknown): BusinessRecord {
  const rec = data as BusinessRecord | null;
  if (!rec || !isValidBusinessId(rec.id)) throw new Error('Respuesta de negocio no valida');
  return rec;
}

async function fetchOwnBusiness(db: Db, userId: string): Promise<BusinessRecord | null> {
  const { data, error } = await db.from('businesses').select(BUSINESS_COLUMNS).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? assertRecord(data) : null;
}

export async function resolveBusiness(userId: string, db: Db = supabase): Promise<BusinessRecord> {
  const existing = await fetchOwnBusiness(db, userId);
  if (existing) return existing;

  const { error } = await db
    .from('businesses')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);

  const created = await fetchOwnBusiness(db, userId);
  if (!created) throw new Error('No se pudo crear el negocio');
  return created;
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
