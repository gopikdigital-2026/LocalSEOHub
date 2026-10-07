import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const tracked: { name: string; props: Record<string, unknown> }[] = [];
vi.mock('../../../lib/analytics', () => ({ track: (name: string, props: Record<string, unknown>) => tracked.push({ name, props }) }));

import { ACTION_RULES } from '../rules';
import {
  evaluateBusinessState, dedupCandidates, planSync, prioritize, priorityFor, selectTodayActions,
  actionOrigin, localizeAction, ctaLabel, actionTarget, actionToRecommendation, withActionHistory,
} from '../engine';
import { toInsertRow, fromRow } from '../repository';
import {
  trackRecommendationGenerated, trackRecommendationViewed, trackRecommendationStarted,
  trackRecommendationCompleted, trackRecommendationDismissed,
} from '../../../services/analytics/v2Analytics';
import type { BusinessRecord } from '../../business-memory/businessRecord';
import type { BusinessAction, SourceSnapshot } from '../types';

const root = resolve(__dirname, '../../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');
const NOW = new Date('2026-03-11T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const BIZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function business(over: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: BIZ, user_id: 'u', name: 'Taller Ruiz', category: 'Taller', city: 'Sevilla',
    website: 'https://ruiz.es', phone: '600', schedule: 'L-V 9-18', target_audience: 'Conductores', services: ['Frenos'],
    primary_goal: 'more_calls', secondary_goals: [],
    onboarding_completed: true, onboarding_completed_at: null, legacy_memory_migrated_at: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const gbpSynced = (metadata: Record<string, unknown>): SourceSnapshot => ({ sourceType: 'google_business', status: 'connected', lastSyncAt: '2026-03-10T00:00:00Z', metadata });

function persisted(ruleId: string, over: Partial<BusinessAction> = {}): BusinessAction {
  return {
    id: `id-${ruleId}`, businessId: BIZ, userId: 'u', ruleId, actionType: 'other', category: 'content',
    title: ruleId, description: '', reason: '', sourceType: 'GENERAL_BEST_PRACTICE', sourceReference: '',
    priority: 'MEDIUM', score: 40, impact: 'medium', effortMinutes: 10, status: 'PENDING', dueDate: null,
    metadata: {}, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), startedAt: null, completedAt: null, dismissedAt: null,
    ...over,
  };
}

const ids = (list: { ruleId: string }[]) => list.map((c) => c.ruleId);

describe('rule catalogue', () => {
  it('has between 8 and 15 deterministic rules covering every category', () => {
    expect(ACTION_RULES.length).toBeGreaterThanOrEqual(8);
    expect(ACTION_RULES.length).toBeLessThanOrEqual(15);
    const all = evaluateBusinessState(
      business({ phone: '', website: '', schedule: '', services: [], target_audience: '', category: '', primary_goal: null }),
      [{ sourceType: 'website', status: 'error', lastSyncAt: null, metadata: {} }],
      [persisted('create_weekly_post', { status: 'COMPLETED', completedAt: new Date(NOW.getTime() - 3 * DAY).toISOString() })],
      NOW,
    );
    const categories = new Set(all.map((c) => c.category));
    ['profile', 'goals', 'content', 'visibility', 'data', 'follow_up'].forEach((c) => expect(categories).toContain(c));
    const reputation = evaluateBusinessState(business({ primary_goal: 'more_reviews' }), [], [], NOW);
    expect(reputation.some((c) => c.category === 'reputation')).toBe(true);
  });

  it('is deterministic: same input gives the same ordered output', () => {
    const a = prioritize(evaluateBusinessState(business({ phone: '' }), [], [], NOW));
    const b = prioritize(evaluateBusinessState(business({ phone: '' }), [], [], NOW));
    expect(ids(a)).toEqual(ids(b));
  });

  it('engine contains no randomness or language model calls', () => {
    const code = src('src/features/actions/rules.ts') + src('src/features/actions/engine.ts');
    expect(code).not.toMatch(/Math\.random|openai|anthropic|gemini|fetch\(|invoke\(/i);
  });
});

describe('no fake diagnostics without GBP', () => {
  const candidates = evaluateBusinessState(business(), [], [], NOW);

  it('asks to connect Google Business Profile as SOURCE_REQUIRED', () => {
    const c = candidates.find((x) => x.ruleId === 'connect_google_business_profile')!;
    expect(c.sourceType).toBe('SOURCE_REQUIRED');
    expect(c.copy.es.title).toBe('Conecta tu Perfil de Empresa de Google');
    expect(c.cta).toBe('connect');
  });

  it('never produces VERIFIED_FINDING or GBP-derived actions', () => {
    expect(candidates.some((c) => c.sourceType === 'VERIFIED_FINDING')).toBe(false);
    expect(candidates.some((c) => c.ruleId.startsWith('gbp_'))).toBe(false);
  });

  it('does not treat a connected-but-never-synced GBP as verified data', () => {
    const list = evaluateBusinessState(business(), [{ sourceType: 'google_business', status: 'connected', lastSyncAt: null, metadata: { website: null } }], [], NOW);
    expect(list.some((c) => c.sourceType === 'VERIFIED_FINDING')).toBe(false);
  });

  it('copy never invents rankings, ratings, traffic or review counts', () => {
    const forbidden = /\d+\s*(%|posici|reseñas nuevas|visitas|estrellas)|ranking|competidor/i;
    candidates.forEach((c) => [c.copy.es.title, c.copy.es.reason, c.copy.es.value].forEach((t) => expect(t).not.toMatch(forbidden)));
  });
});

describe('origins', () => {
  it('general best practice is never classified as a verified finding', () => {
    const general = evaluateBusinessState(business(), [], [], NOW).filter((c) => c.ruleId === 'create_weekly_post' || c.ruleId === 'add_recent_photos');
    expect(general.every((c) => c.sourceType === 'GENERAL_BEST_PRACTICE')).toBe(true);
    expect(actionOrigin('GENERAL_BEST_PRACTICE')).toBe('general');
    const rec = actionToRecommendation(persisted('create_weekly_post'));
    expect(rec.confidence).not.toBe('verified');
    expect(rec.dataMode).not.toBe('real');
  });

  it('verified findings only come from synced GBP fields that are actually missing', () => {
    const list = evaluateBusinessState(business(), [gbpSynced({ website: null, phone: '600', hours: [{}], totalReviews: 0 })], [], NOW);
    expect(ids(list.filter((c) => c.sourceType === 'VERIFIED_FINDING')).sort()).toEqual(['gbp_add_website', 'gbp_get_first_reviews']);
    expect(actionOrigin('VERIFIED_FINDING')).toBe('real');
  });

  it('profile gaps are BUSINESS_PROFILE and goal actions are GOAL_BASED', () => {
    const list = evaluateBusinessState(business({ phone: '' }), [], [], NOW);
    expect(list.find((c) => c.ruleId === 'add_business_phone')!.sourceType).toBe('BUSINESS_PROFILE');
    expect(list.find((c) => c.ruleId === 'publish_call_to_action_post')!.sourceType).toBe('GOAL_BASED');
  });

  it('follow-ups only appear after a real completed action', () => {
    expect(ids(evaluateBusinessState(business(), [], [], NOW))).not.toContain('follow_up_check_post');
    const history = [persisted('create_weekly_post', { status: 'COMPLETED', completedAt: new Date(NOW.getTime() - 3 * DAY).toISOString() })];
    const f = evaluateBusinessState(business(), [], history, NOW).find((c) => c.ruleId === 'follow_up_check_post')!;
    expect(f.sourceType).toBe('FOLLOW_UP');
  });
});

describe('priority and scoring', () => {
  it('maps internal score to Alta/Media/Baja transparently', () => {
    expect(priorityFor(70)).toBe('HIGH');
    expect(priorityFor(40)).toBe('MEDIUM');
    expect(priorityFor(20)).toBe('LOW');
  });

  it('goal-aligned actions outrank unrelated ones of the same impact', () => {
    const list = evaluateBusinessState(business({ primary_goal: 'more_reviews' }), [], [], NOW);
    const review = list.find((c) => c.ruleId === 'request_customer_reviews')!;
    const photos = list.find((c) => c.ruleId === 'add_recent_photos')!;
    expect(review.score).toBeGreaterThan(photos.score);
    expect(review.priority).toBe('HIGH');
  });

  it('/hoy shows at most 3 actions, in-progress first', () => {
    const list = [
      persisted('a', { score: 90 }), persisted('b', { score: 80 }), persisted('c', { score: 70 }),
      persisted('d', { score: 10, status: 'IN_PROGRESS' }), persisted('e', { status: 'COMPLETED' }),
    ];
    const top = selectTodayActions(list);
    expect(ids(top)).toEqual(['d', 'a', 'b']);
  });
});

describe('dedup and cooldown', () => {
  const candidates = evaluateBusinessState(business(), [], [], NOW);

  it('skips rules that already have a PENDING or IN_PROGRESS action', () => {
    const out = dedupCandidates(candidates, [persisted('create_weekly_post'), persisted('add_recent_photos', { status: 'IN_PROGRESS' })], NOW);
    expect(ids(out)).not.toContain('create_weekly_post');
    expect(ids(out)).not.toContain('add_recent_photos');
  });

  it('respects the cooldown after completion and recreates after it expires', () => {
    const recent = persisted('create_weekly_post', { status: 'COMPLETED', completedAt: new Date(NOW.getTime() - 2 * DAY).toISOString() });
    expect(ids(dedupCandidates(candidates, [recent], NOW))).not.toContain('create_weekly_post');
    const old = persisted('create_weekly_post', { status: 'COMPLETED', completedAt: new Date(NOW.getTime() - 8 * DAY).toISOString() });
    expect(ids(dedupCandidates(candidates, [old], NOW))).toContain('create_weekly_post');
  });

  it('does not recreate a user-dismissed action immediately', () => {
    const dismissed = persisted('add_recent_photos', { status: 'DISMISSED', dismissedAt: new Date(NOW.getTime() - 5 * DAY).toISOString() });
    expect(ids(dedupCandidates(candidates, [dismissed], NOW))).not.toContain('add_recent_photos');
  });

  it('closes open actions whose trigger disappeared (e.g. GBP now connected)', () => {
    const open = persisted('connect_google_business_profile', { sourceType: 'SOURCE_REQUIRED' });
    const plan = planSync(business(), [gbpSynced({})], [open], NOW);
    expect(plan.toResolve).toEqual([{ action: open, status: 'COMPLETED' }]);
  });
});

describe('presentation and persistence mapping', () => {
  it('stores Spanish copy and keeps English available', () => {
    const c = evaluateBusinessState(business(), [], [], NOW).find((x) => x.ruleId === 'connect_google_business_profile')!;
    const row = toInsertRow(BIZ, c, NOW);
    expect(row.title).toBe('Conecta tu Perfil de Empresa de Google');
    expect(row.status).toBe('PENDING');
    expect(row.business_id).toBe(BIZ);
    const action = fromRow({ ...row, id: 'x', user_id: 'u', created_at: '', updated_at: '', started_at: null, completed_at: null, dismissed_at: null } as never);
    expect(localizeAction(action, 'en').title).toBe('Connect your Google Business Profile');
    expect(ctaLabel(action, 'es')).toBe('Conectar');
    expect(ctaLabel(action, 'en')).toBe('Connect');
    expect(actionTarget(action)).toBe('/fuentes');
  });

  it('actions without an in-app destination open the execution workspace', () => {
    expect(actionTarget(persisted('create_weekly_post'))).toBe('/ejecutar/id-create_weekly_post');
  });

  it('merges completed actions into the history timeline without duplicates', () => {
    const done = persisted('create_weekly_post', { status: 'COMPLETED', completedAt: NOW.toISOString() });
    const merged = withActionHistory({ timeline: [] }, [done, persisted('add_recent_photos')]);
    expect(merged.timeline).toHaveLength(1);
    expect(withActionHistory(merged, [done]).timeline).toHaveLength(1);
  });
});

describe('analytics', () => {
  it('emits the five recommendation events with rule metadata and no PII', () => {
    tracked.length = 0;
    const a = persisted('create_weekly_post', { title: 'Panadería Sol', reason: 'secret', userId: 'user-x' });
    trackRecommendationGenerated(a);
    trackRecommendationViewed(a);
    trackRecommendationStarted(a);
    trackRecommendationCompleted(a);
    trackRecommendationDismissed(a);
    expect(tracked.map((t) => t.name)).toEqual([
      'recommendation_generated', 'recommendation_viewed', 'recommendation_started', 'recommendation_completed', 'recommendation_dismissed',
    ]);
    tracked.forEach((t) => {
      expect(t.props).toMatchObject({ rule_id: 'create_weekly_post', category: 'content', priority: 'MEDIUM', source_type: 'GENERAL_BEST_PRACTICE' });
      expect(JSON.stringify(t.props)).not.toMatch(/Panadería|secret|user-x/);
    });
  });
});

describe('wiring', () => {
  it('/hoy and /plan use the persisted action model instead of demo or hardcoded lists', () => {
    const today = src('src/app-v2/routes/TodayPage.tsx');
    const plan = src('src/app-v2/routes/PlanPage.tsx');
    expect(today).not.toMatch(/demoRecommendations/);
    expect(today).toMatch(/useActions\(\)/);
    expect(plan).not.toMatch(/pendingByGoal/);
    expect(plan).toMatch(/useActions\(\)/);
  });

  it('pages never generate actions directly; generation runs only in the provider on triggers', () => {
    ['src/app-v2/routes/TodayPage.tsx', 'src/app-v2/routes/PlanPage.tsx', 'src/features/execution/ExecutionPage.tsx']
      .forEach((p) => expect(src(p)).not.toMatch(/syncActions|evaluateBusinessState/));
    const provider = src('src/features/actions/ActionsProvider.tsx');
    expect(provider).toMatch(/fingerprint/);
    expect(provider).toMatch(/onboarding_completed/);
  });

  it('execution persists completion through the action model', () => {
    const exec = src('src/features/execution/ExecutionPage.tsx');
    expect(exec).not.toMatch(/demoRecommendations/);
    expect(exec).toMatch(/onCompleted: \(\) => \{ complete\(action\)/);
    expect(src('src/features/execution/workspaces.tsx')).toMatch(/onCompleted\?\.\(\)/);
  });
});
