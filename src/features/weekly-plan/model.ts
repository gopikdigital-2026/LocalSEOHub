import {
  actionOrigin, actionOutcome, buildActionReport, canMarkDone, localizeAction, openActions, selectTodayActions,
  weekStart, type ActionLang, type ActionReport,
} from '../actions/engine';
import type { ActionPriority, ActionSourceType, BusinessAction } from '../actions/types';
import type { DataOrigin } from '../../domain/dataIntegrity';
import type { GoalId } from '../business-memory/types';
import { weekKey } from '../weekly-content/model';
import { WEEKLY_PLAN_COPY } from './copy';

export const WEEK_FOCUS_MAX = 5;
const MAX_EFFORT_MINUTES = 600;

export type WeeklyItemState = 'pending' | 'in_progress' | 'executed' | 'data_completed' | 'dismissed' | 'outdated';

export interface WeeklyPlanItem {
  action: BusinessAction;
  state: WeeklyItemState;
  title: string;
  description: string;
  why: string;
  priority: ActionPriority;
  sourceType: ActionSourceType;
  origin: DataOrigin;
  sourceLabel: string;
  /** Rule-defined estimate, never a measurement; null when the stored value is outside the allowed range. */
  effort: { minutes: number; isEstimate: true } | null;
  canMarkDone: boolean;
  canDismiss: boolean;
}

export interface WeeklyPlanAccess {
  hasPremium: boolean | null;
}

export interface WeeklyPlan {
  week: { key: string; from: Date; to: Date };
  focus: WeeklyPlanItem[];
  later: WeeklyPlanItem[];
  executedThisWeek: WeeklyPlanItem[];
  resolvedThisWeek: WeeklyPlanItem[];
  dismissedThisWeek: WeeklyPlanItem[];
  outdatedThisWeek: WeeklyPlanItem[];
  progress: {
    done: number;
    pending: number;
    percent: number | null;
    /** Open actions that appeared this week; lets the page explain why the percentage moved down. */
    addedThisWeek: number;
  };
  readOnly: boolean;
}

export interface BuildWeeklyPlanInput {
  businessId: string;
  actions: readonly BusinessAction[];
  lang: ActionLang;
  access: WeeklyPlanAccess;
  goal?: GoalId | null;
  now?: Date;
}

export function weekBounds(now: Date): { key: string; from: Date; to: Date } {
  const from = weekStart(now);
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { key: weekKey(now), from, to };
}

const isOpen = (a: BusinessAction) => a.status === 'PENDING' || a.status === 'IN_PROGRESS';

function stateOf(action: BusinessAction): WeeklyItemState {
  const outcome = actionOutcome(action);
  if (outcome === 'open') return action.status === 'IN_PROGRESS' ? 'in_progress' : 'pending';
  if (outcome === 'dismissed') return action.metadata.auto_closed ? 'outdated' : 'dismissed';
  return outcome;
}

// Keeps only this business's rows, one row per id, and one open row per rule (the DB index guarantees this; the view must not depend on it).
export function scopeActions(businessId: string, actions: readonly BusinessAction[]): BusinessAction[] {
  const byId = new Map<string, BusinessAction>();
  for (const a of actions) {
    if (a.businessId !== businessId) continue;
    const seen = byId.get(a.id);
    if (!seen || a.updatedAt > seen.updatedAt) byId.set(a.id, a);
  }
  const unique = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const openRules = new Set<string>();
  const ranked = new Set(openActions(unique).filter((a) => {
    if (openRules.has(a.ruleId)) return false;
    openRules.add(a.ruleId);
    return true;
  }));
  return unique.filter((a) => !isOpen(a) || ranked.has(a));
}

export function selectWeeklyFocus(actions: BusinessAction[]): { focus: BusinessAction[]; later: BusinessAction[] } {
  const today = selectTodayActions(actions);
  const picked = new Set(today.map((a) => a.id));
  const rest = openActions(actions).filter((a) => !picked.has(a.id));
  const focus = [...today, ...rest].slice(0, WEEK_FOCUS_MAX);
  const inFocus = new Set(focus.map((a) => a.id));
  const later = rest.filter((a) => !inFocus.has(a.id));
  return { focus, later };
}

function toItem(action: BusinessAction, lang: ActionLang, canAct: boolean): WeeklyPlanItem {
  const copy = localizeAction(action, lang);
  const text = WEEKLY_PLAN_COPY[lang];
  const open = isOpen(action);
  const effortOk = Number.isInteger(action.effortMinutes) && action.effortMinutes >= 1 && action.effortMinutes <= MAX_EFFORT_MINUTES;
  return {
    action,
    state: stateOf(action),
    title: copy.title,
    description: copy.description,
    why: copy.reason.trim() || text.sourceWhy[action.sourceType],
    priority: action.priority,
    sourceType: action.sourceType,
    origin: actionOrigin(action.sourceType),
    sourceLabel: text.sourceLabels[action.sourceType],
    effort: effortOk ? { minutes: action.effortMinutes, isEstimate: true } : null,
    canMarkDone: canAct && open && canMarkDone(action),
    canDismiss: canAct && open,
  };
}

export function buildWeeklyPlan({ businessId, actions, lang, access, goal = null, now = new Date() }: BuildWeeklyPlanInput): WeeklyPlan {
  const week = weekBounds(now);
  const scoped = scopeActions(businessId, actions);
  const canAct = access.hasPremium === true;
  const item = (a: BusinessAction) => toItem(a, lang, canAct);
  const inWeek = (at: string | null) => at !== null && new Date(at) >= week.from && new Date(at) < week.to;
  const closedInWeek = (state: WeeklyItemState, at: (a: BusinessAction) => string | null) =>
    scoped.filter((a) => stateOf(a) === state && inWeek(at(a))).sort(byLatest(at)).map(item);

  const { focus, later } = selectWeeklyFocus(scoped);
  const report: ActionReport = buildActionReport(scoped, now, goal);
  return {
    week,
    focus: focus.map(item),
    later: later.map(item),
    executedThisWeek: closedInWeek('executed', (a) => a.completedAt),
    resolvedThisWeek: closedInWeek('data_completed', (a) => a.completedAt),
    dismissedThisWeek: closedInWeek('dismissed', (a) => a.dismissedAt),
    outdatedThisWeek: closedInWeek('outdated', (a) => a.dismissedAt),
    progress: {
      done: report.executedThisWeek + report.dataCompletedThisWeek,
      pending: report.pending,
      percent: report.weeklyProgress,
      addedThisWeek: scoped.filter((a) => isOpen(a) && inWeek(a.createdAt)).length,
    },
    readOnly: !canAct,
  };
}

function byLatest(at: (a: BusinessAction) => string | null) {
  return (a: BusinessAction, b: BusinessAction) => (at(b) ?? '').localeCompare(at(a) ?? '') || a.id.localeCompare(b.id);
}
