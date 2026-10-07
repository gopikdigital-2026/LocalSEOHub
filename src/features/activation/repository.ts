import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { isValidBusinessId } from '../business-memory/legacyMigration';
import { parseMilestones, type Milestone, type Milestones } from './milestones';

type Db = Pick<SupabaseClient, 'from'>;

export async function loadMilestones(userId: string, businessId: string, db: Db = supabase): Promise<Milestones> {
  if (!isValidBusinessId(businessId)) throw new Error('Negocio no válido');
  const { data, error } = await db
    .from('first_value_progress')
    .select('milestones')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseMilestones(data?.milestones);
}

/**
 * Merges newly reached milestones into the user's progress row, keeping the earliest timestamps.
 * Returns the persisted map and the milestones that were actually new.
 */
export async function recordMilestones(
  userId: string,
  businessId: string,
  reached: Milestones,
  db: Db = supabase,
): Promise<{ milestones: Milestones; added: Milestone[] }> {
  if (!isValidBusinessId(businessId)) throw new Error('Negocio no válido');
  const { data: row, error: readError } = await db
    .from('first_value_progress')
    .select('id, milestones')
    .eq('user_id', userId)
    .eq('business_id', businessId)
    .maybeSingle();
  if (readError) throw new Error(readError.message);

  const stored = (row?.milestones && typeof row.milestones === 'object' ? row.milestones : {}) as Record<string, unknown>;
  const current = parseMilestones(stored);
  const added = (Object.keys(reached) as Milestone[]).filter((m) => !current[m] && reached[m]);
  if (added.length === 0) return { milestones: current, added };

  const merged = { ...stored, ...Object.fromEntries(added.map((m) => [m, reached[m]])) };

  if (row?.id) {
    const { error } = await db.from('first_value_progress').update({ milestones: merged, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) throw new Error(error.message);
  } else {
    const now = new Date().toISOString();
    const { error } = await db.from('first_value_progress').insert({
      user_id: userId,
      business_id: businessId,
      current_step: 'done',
      completed: true,
      completed_at: reached.onboarding_completed ?? now,
      started_at: now,
      milestones: merged,
    });
    if (error) throw new Error(error.message);
  }
  return { milestones: parseMilestones(merged), added };
}
