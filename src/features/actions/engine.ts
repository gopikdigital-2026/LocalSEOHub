import type { Recommendation, ImpactLevel } from '../../domain/types';
import type { DataOrigin } from '../../domain/dataIntegrity';
import type { BusinessRecord } from '../business-memory/businessRecord';
import type { GoalId, TimelineEvent } from '../business-memory/types';
import { AVAILABLE_GOALS } from '../business-memory/engine';
import { ACTION_RULES, type EvaluationContext } from './rules';
import type {
  ActionCandidate,
  ActionCategory,
  ActionCopy,
  ActionCta,
  ActionPriority,
  ActionSourceType,
  BusinessAction,
  ScoredCandidate,
  SourceSnapshot,
} from './types';

const DAY_MS = 24 * 60 * 60 * 1000;
export const DISMISS_COOLDOWN_DAYS = 30;
export const TODAY_LIMIT = 3;

const IMPACT_POINTS: Record<ImpactLevel, number> = { high: 30, medium: 20, low: 10 };

export const SOURCE_POINTS: Record<ActionSourceType, number> = {
  VERIFIED_FINDING: 25,
  SOURCE_REQUIRED: 20,
  BUSINESS_PROFILE: 15,
  GOAL_BASED: 15,
  FOLLOW_UP: 10,
  GENERAL_BEST_PRACTICE: 5,
};

const GOAL_CATEGORIES: Record<GoalId, ActionCategory[]> = {
  more_calls: ['content', 'profile'],
  more_bookings: ['content', 'profile'],
  more_reviews: ['reputation'],
  better_reputation: ['reputation'],
  better_local_seo: ['visibility', 'profile'],
  more_web_visits: ['visibility', 'profile'],
  more_followers: ['content'],
};

const DUE_DAYS: Record<ActionPriority, number> = { HIGH: 2, MEDIUM: 5, LOW: 7 };

const isOpen = (a: BusinessAction) => a.status === 'PENDING' || a.status === 'IN_PROGRESS';

export function evaluateBusinessState(
  business: BusinessRecord,
  sources: SourceSnapshot[],
  history: BusinessAction[],
  now: Date = new Date(),
): ScoredCandidate[] {
  const ctx: EvaluationContext = { business, sources, history, now };
  const goals = [business.primary_goal, ...business.secondary_goals].filter((g): g is GoalId => Boolean(g));
  return ACTION_RULES.flatMap((rule) =>
    rule.evaluate(ctx).map((c) => scoreCandidate({ ...c, cooldownDays: rule.cooldownDays }, goals)),
  );
}

// Transparent additive score: impact + evidence strength + goal match + quick win.
export function scoreCandidate(
  c: ActionCandidate & { cooldownDays: number },
  goals: GoalId[],
): ScoredCandidate {
  let score = IMPACT_POINTS[c.impact] + SOURCE_POINTS[c.sourceType];
  const goalMatch = goals.some((g) =>
    GOAL_CATEGORIES[g]?.includes(c.category) ||
    AVAILABLE_GOALS.find((d) => d.id === g)?.relatedActions.includes(c.actionType),
  );
  if (goalMatch) score += 15;
  if (c.effortMinutes <= 10) score += 5;
  return { ...c, score, priority: priorityFor(score) };
}

export function priorityFor(score: number): ActionPriority {
  if (score >= 55) return 'HIGH';
  if (score >= 35) return 'MEDIUM';
  return 'LOW';
}

function daysSince(iso: string | null, now: Date): number {
  return iso ? (now.getTime() - new Date(iso).getTime()) / DAY_MS : Infinity;
}

export function dedupCandidates(
  candidates: ScoredCandidate[],
  existing: BusinessAction[],
  now: Date = new Date(),
): ScoredCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (seen.has(c.ruleId)) return false;
    seen.add(c.ruleId);
    const same = existing.filter((a) => a.ruleId === c.ruleId);
    if (same.some(isOpen)) return false;
    if (same.some((a) => a.status === 'COMPLETED' && daysSince(a.completedAt, now) < c.cooldownDays)) return false;
    if (same.some((a) => a.status === 'DISMISSED' && !a.metadata.auto_closed && daysSince(a.dismissedAt, now) < DISMISS_COOLDOWN_DAYS)) return false;
    return true;
  });
}

export function prioritize<T extends { score: number; ruleId: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => b.score - a.score || a.ruleId.localeCompare(b.ruleId));
}

export interface SyncPlan {
  toInsert: ScoredCandidate[];
  toResolve: { action: BusinessAction; status: 'COMPLETED' | 'DISMISSED' }[];
}

const SELF_RESOLVING: ActionSourceType[] = ['BUSINESS_PROFILE', 'SOURCE_REQUIRED', 'VERIFIED_FINDING'];

// Open actions whose trigger no longer holds are closed: data gaps that were filled count as done.
export function planSync(
  business: BusinessRecord,
  sources: SourceSnapshot[],
  existing: BusinessAction[],
  now: Date = new Date(),
): SyncPlan {
  const candidates = evaluateBusinessState(business, sources, existing, now);
  const firing = new Set(candidates.map((c) => c.ruleId));
  const toResolve = existing
    .filter((a) => isOpen(a) && !firing.has(a.ruleId))
    .map((action) => ({ action, status: SELF_RESOLVING.includes(action.sourceType) ? 'COMPLETED' as const : 'DISMISSED' as const }));
  return { toInsert: prioritize(dedupCandidates(candidates, existing, now)), toResolve };
}

export function dueDateFor(priority: ActionPriority, now: Date = new Date()): string {
  return new Date(now.getTime() + DUE_DAYS[priority] * DAY_MS).toISOString().slice(0, 10);
}

export function openActions(actions: BusinessAction[]): BusinessAction[] {
  return prioritize(actions.filter(isOpen));
}

export function selectTodayActions(actions: BusinessAction[], limit = TODAY_LIMIT): BusinessAction[] {
  const open = openActions(actions);
  const started = open.filter((a) => a.status === 'IN_PROGRESS');
  const ordered = [...started, ...open.filter((a) => a.status === 'PENDING')];
  const picked = ordered.slice(0, limit);
  // Today must always offer something doable without connecting a source.
  const doable = (a: BusinessAction) => a.sourceType !== 'SOURCE_REQUIRED';
  if (picked.length > 0 && !picked.some(doable)) {
    const swap = ordered.slice(limit).find(doable);
    if (swap) picked[picked.length - 1] = swap;
  }
  return picked;
}

// ─── Presentation helpers ───────────────────────────────────────────────────

export type ActionLang = 'es' | 'en';

export function localizeAction(action: BusinessAction, lang: ActionLang): ActionCopy {
  const copy = (action.metadata.copy as Record<string, ActionCopy> | undefined)?.[lang];
  if (copy) return copy;
  return { title: action.title, description: action.description, reason: action.reason, value: String(action.metadata.value ?? '') };
}

export function actionOrigin(sourceType: ActionSourceType): DataOrigin {
  switch (sourceType) {
    case 'VERIFIED_FINDING': return 'real';
    case 'BUSINESS_PROFILE':
    case 'GOAL_BASED':
    case 'FOLLOW_UP': return 'user_provided';
    case 'SOURCE_REQUIRED': return 'unavailable';
    case 'GENERAL_BEST_PRACTICE': return 'general';
  }
}

const CTA_LABELS: Record<ActionLang, Record<ActionCta, string>> = {
  es: { start: 'Empezar', prepare: 'Preparar', complete: 'Completar', connect: 'Conectar', review: 'Revisar' },
  en: { start: 'Start', prepare: 'Prepare', complete: 'Complete', connect: 'Connect', review: 'Review' },
};

export function ctaLabel(action: BusinessAction, lang: ActionLang): string {
  const cta = (action.metadata.cta as ActionCta | undefined) ?? 'start';
  return CTA_LABELS[lang][cta] ?? CTA_LABELS[lang].start;
}

export const PRIORITY_LABELS: Record<ActionLang, Record<ActionPriority, string>> = {
  es: { HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' },
  en: { HIGH: 'High', MEDIUM: 'Medium', LOW: 'Low' },
};

// Profile and source actions are done in the app; everything else opens an execution checklist.
export function actionTarget(action: BusinessAction): string {
  const to = action.metadata.cta_to;
  return typeof to === 'string' && to.startsWith('/') ? to : `/ejecutar/${action.id}`;
}

export function actionToRecommendation(action: BusinessAction, lang: ActionLang = 'es'): Recommendation {
  const copy = localizeAction(action, lang);
  const verified = action.sourceType === 'VERIFIED_FINDING';
  return {
    id: action.id,
    businessId: action.businessId,
    title: copy.title,
    summary: copy.description,
    explanation: copy.description,
    reason: copy.reason,
    source: action.sourceReference,
    sourceType: verified ? 'google_business' : action.sourceType === 'GENERAL_BEST_PRACTICE' ? 'internal' : 'manual',
    sourceUpdatedAt: null,
    confidence: verified ? 'verified' : 'estimated',
    impact: action.impact,
    estimatedTimeMinutes: action.effortMinutes,
    status: action.status === 'COMPLETED' ? 'completed' : action.status === 'DISMISSED' ? 'dismissed' : action.status === 'IN_PROGRESS' ? 'in_progress' : 'new',
    actionType: action.actionType,
    createdAt: action.createdAt,
    dataMode: verified ? 'real' : 'estimated',
  };
}

// ─── History & reporting ────────────────────────────────────────────────────

export function withActionHistory<S extends { timeline: TimelineEvent[] }>(state: S, actions: BusinessAction[]): S {
  const fromActions = actionsToTimeline(actions);
  const ids = new Set(fromActions.map((e) => e.id));
  const timeline = [...fromActions, ...state.timeline.filter((e) => !ids.has(e.id))]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return { ...state, timeline };
}

export function actionsToTimeline(actions: BusinessAction[]): TimelineEvent[] {
  return actions
    .filter((a) => a.status === 'COMPLETED' && a.completedAt)
    .map((a) => ({
      id: `action-${a.id}`,
      type: 'action_completed' as const,
      title: a.title,
      timestamp: a.completedAt as string,
      actionType: a.actionType,
      impact: a.impact,
      durationMinutes: a.effortMinutes,
    }));
}

export interface ActionReport {
  completedThisWeek: number;
  pending: number;
  completionRate: number | null;
  byCategory: { category: ActionCategory; completed: number; pending: number }[];
}

export function weekStart(now: Date = new Date()): Date {
  const d = new Date(now);
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function buildActionReport(actions: BusinessAction[], now: Date = new Date()): ActionReport {
  const start = weekStart(now).getTime();
  const completed = actions.filter((a) => a.status === 'COMPLETED' && a.completedAt);
  const completedThisWeek = completed.filter((a) => new Date(a.completedAt as string).getTime() >= start);
  const pending = actions.filter(isOpen);
  const totalDecided = completed.length + pending.length;
  const categories = Array.from(new Set([...completed, ...pending].map((a) => a.category)));
  return {
    completedThisWeek: completedThisWeek.length,
    pending: pending.length,
    completionRate: totalDecided > 0 ? Math.round((completed.length / totalDecided) * 100) : null,
    byCategory: categories.map((category) => ({
      category,
      completed: completed.filter((a) => a.category === category).length,
      pending: pending.filter((a) => a.category === category).length,
    })),
  };
}

export const CATEGORY_LABELS: Record<ActionLang, Record<ActionCategory, string>> = {
  es: { profile: 'Perfil', goals: 'Objetivos', content: 'Contenido', reputation: 'Reputación', visibility: 'Visibilidad', data: 'Datos', follow_up: 'Seguimiento' },
  en: { profile: 'Profile', goals: 'Goals', content: 'Content', reputation: 'Reputation', visibility: 'Visibility', data: 'Data', follow_up: 'Follow-up' },
};
