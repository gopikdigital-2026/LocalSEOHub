import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import type { BusinessRecord } from '../business-memory/businessRecord';
import { isValidBusinessId } from '../business-memory/legacyMigration';
import { dueDateFor, planSync } from './engine';
import type { BusinessAction, ScoredCandidate, SourceSnapshot } from './types';

type Db = Pick<SupabaseClient, 'from'>;

const ACTION_COLUMNS =
  'id, business_id, user_id, rule_id, action_type, category, title, description, reason, source_type, source_reference, priority, score, impact, effort_minutes, status, due_date, metadata, created_at, updated_at, started_at, completed_at, dismissed_at';

interface ActionRow {
  id: string;
  business_id: string;
  user_id: string;
  rule_id: string;
  action_type: BusinessAction['actionType'];
  category: BusinessAction['category'];
  title: string;
  description: string;
  reason: string;
  source_type: BusinessAction['sourceType'];
  source_reference: string;
  priority: BusinessAction['priority'];
  score: number;
  impact: BusinessAction['impact'];
  effort_minutes: number;
  status: BusinessAction['status'];
  due_date: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  dismissed_at: string | null;
}

export function fromRow(r: ActionRow): BusinessAction {
  return {
    id: r.id,
    businessId: r.business_id,
    userId: r.user_id,
    ruleId: r.rule_id,
    actionType: r.action_type,
    category: r.category,
    title: r.title,
    description: r.description,
    reason: r.reason,
    sourceType: r.source_type,
    sourceReference: r.source_reference,
    priority: r.priority,
    score: r.score,
    impact: r.impact,
    effortMinutes: r.effort_minutes,
    status: r.status,
    dueDate: r.due_date,
    metadata: r.metadata ?? {},
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    dismissedAt: r.dismissed_at,
  };
}

export function toInsertRow(businessId: string, c: ScoredCandidate, now: Date = new Date()) {
  return {
    business_id: businessId,
    rule_id: c.ruleId,
    action_type: c.actionType,
    category: c.category,
    title: c.copy.es.title,
    description: c.copy.es.description,
    reason: c.copy.es.reason,
    source_type: c.sourceType,
    source_reference: c.sourceReference,
    priority: c.priority,
    score: c.score,
    impact: c.impact,
    effort_minutes: c.effortMinutes,
    status: 'PENDING',
    due_date: dueDateFor(c.priority, now),
    metadata: { cta: c.cta, cta_to: c.ctaTo ?? null, cooldown_days: c.cooldownDays, value: c.copy.es.value, copy: c.copy },
  };
}

function assertBusinessId(businessId: string) {
  if (!isValidBusinessId(businessId)) throw new Error('Identificador de negocio no valido');
}

export async function loadActions(businessId: string, db: Db = supabase): Promise<BusinessAction[]> {
  assertBusinessId(businessId);
  const { data, error } = await db
    .from('business_actions')
    .select(ACTION_COLUMNS)
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  return ((data ?? []) as ActionRow[]).map(fromRow);
}

export async function getAction(actionId: string, db: Db = supabase): Promise<BusinessAction | null> {
  const { data, error } = await db.from('business_actions').select(ACTION_COLUMNS).eq('id', actionId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as ActionRow) : null;
}

export interface SyncResult {
  actions: BusinessAction[];
  inserted: BusinessAction[];
}

export async function syncActions(
  business: BusinessRecord,
  sources: SourceSnapshot[],
  db: Db = supabase,
  now: Date = new Date(),
): Promise<SyncResult> {
  assertBusinessId(business.id);
  const existing = await loadActions(business.id, db);
  const plan = planSync(business, sources, existing, now);
  const stamp = now.toISOString();

  for (const { action, status } of plan.toResolve) {
    const patch = status === 'COMPLETED'
      ? { status, completed_at: stamp, updated_at: stamp, metadata: { ...action.metadata, resolved_by: 'condition_met' } }
      : { status, dismissed_at: stamp, updated_at: stamp, metadata: { ...action.metadata, auto_closed: 'no_longer_applies' } };
    const { error } = await db.from('business_actions').update(patch).eq('id', action.id).in('status', ['PENDING', 'IN_PROGRESS']);
    if (error) throw new Error(error.message);
  }

  let inserted: BusinessAction[] = [];
  if (plan.toInsert.length > 0) {
    const { data, error } = await db
      .from('business_actions')
      .insert(plan.toInsert.map((c) => toInsertRow(business.id, c, now)))
      .select(ACTION_COLUMNS);
    // 23505: another tab inserted the same open rule first; the reload below picks it up.
    if (error && error.code !== '23505') throw new Error(error.message);
    inserted = ((data ?? []) as ActionRow[]).map(fromRow);
  }

  const changed = plan.toResolve.length > 0 || plan.toInsert.length > 0;
  return { actions: changed ? await loadActions(business.id, db) : existing, inserted };
}

type Transition = 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED';

export async function transitionAction(actionId: string, to: Transition, db: Db = supabase): Promise<BusinessAction> {
  const stamp = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: stamp };
  if (to === 'IN_PROGRESS') patch.started_at = stamp;
  if (to === 'COMPLETED') patch.completed_at = stamp;
  if (to === 'DISMISSED') patch.dismissed_at = stamp;
  const from = to === 'IN_PROGRESS' ? ['PENDING'] : ['PENDING', 'IN_PROGRESS'];
  const { data, error } = await db
    .from('business_actions')
    .update(patch)
    .eq('id', actionId)
    .in('status', from)
    .select(ACTION_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    const current = await getAction(actionId, db);
    if (!current) throw new Error('Acción no encontrada');
    return current;
  }
  return fromRow(data as ActionRow);
}
