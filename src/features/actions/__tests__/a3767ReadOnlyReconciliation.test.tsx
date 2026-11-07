// @vitest-environment jsdom
import { act as reactAct, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessRecord } from '../../business-memory/businessRecord';
import type { BusinessAction, SourceSnapshot } from '../types';

const BIZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ROOT = resolve(__dirname, '../../../..');

const env = vi.hoisted(() => ({
  business: null as unknown as BusinessRecord,
  hasPremium: false as boolean | null,
  saved: [] as BusinessAction[],
  sources: [] as Record<string, unknown>[],
  sourcesFail: false,
  loadActions: vi.fn(),
  syncActions: vi.fn(),
  transitionAction: vi.fn(),
}));

vi.mock('../../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../business-memory/BusinessContext', () => ({ useBusiness: () => ({ currentBusiness: env.business, userId: 'u' }) }));
vi.mock('../../billing/BillingContext', () => ({ useBilling: () => ({ hasPremium: env.hasPremium, error: null }) }));
vi.mock('../../../lib/i18n', () => ({ useI18n: () => ({ lang: 'es' }) }));
vi.mock('../../activation/repository', () => ({ loadMilestones: async () => ({}) }));
vi.mock('../../activation/service', () => ({ advanceActivation: async () => ({ milestones: {}, added: [] }) }));
vi.mock('../../../services/analytics/v2Analytics', () => ({
  trackRecommendationCompleted: vi.fn(), trackRecommendationDismissed: vi.fn(), trackRecommendationGenerated: vi.fn(), trackRecommendationStarted: vi.fn(),
}));
vi.mock('../../reality-engine/repositories', () => ({
  loadSources: async () => { if (env.sourcesFail) throw new Error('down'); return env.sources; },
}));
vi.mock('../repository', () => ({
  loadActions: env.loadActions,
  syncActions: env.syncActions,
  transitionAction: env.transitionAction,
}));

import ActionsProvider from '../ActionsProvider';
import { ActionsContext, type ActionsContextValue } from '../ActionsContext';
import { hideSatisfiedProfileActions } from '../readOnlyView';
import { evaluateBusinessState, planSync, selectTodayActions } from '../engine';
import { buildWeeklyPlan } from '../../weekly-plan/model';
import { WEEKLY_PAGE_COPY as PAGE_COPY } from '../../weekly-plan/pageCopy';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date();

function business(over: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: BIZ, user_id: 'u', name: 'N', category: 'C', city: 'X',
    website: '', phone: '', schedule: '', target_audience: '', services: [],
    primary_goal: 'more_reviews', secondary_goals: [],
    onboarding_completed: true, onboarding_completed_at: '2026-01-01T00:00:00Z', legacy_memory_migrated_at: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const FILLED = { phone: '+34 600 000 000', schedule: 'L-V 9-18', target_audience: 'Vecinos' };

// Saved open actions exactly as the rules generate them for an empty profile.
function savedFor(b: BusinessRecord, sources: SourceSnapshot[] = []): BusinessAction[] {
  return evaluateBusinessState(b, sources, [], NOW).map((c, i) => ({
    id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    businessId: b.id, userId: 'u', ruleId: c.ruleId, actionType: c.actionType, category: c.category,
    title: c.copy.es.title, description: c.copy.es.description, reason: c.copy.es.reason, sourceType: c.sourceType, sourceReference: c.sourceReference,
    priority: c.priority, score: c.score, impact: c.impact, effortMinutes: c.effortMinutes, status: 'PENDING', dueDate: null,
    metadata: { cta: c.cta, cta_to: c.ctaTo ?? null, cooldown_days: c.cooldownDays, value: c.copy.es.value, copy: c.copy, evidence: c.evidence ?? null }, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), startedAt: null, completedAt: null, dismissedAt: null,
  }));
}

const rules = (list: BusinessAction[]) => list.map((a) => a.ruleId);
const PROFILE_FILLED = ['add_business_phone', 'add_business_schedule', 'define_target_audience'];
const GBP_SOURCE_ROW = { source_type: 'google_business', status: 'connecting', verified_at: null, verified_profile: null, last_sync_at: null, metadata: {} };

describe('A3.7.6.7 read-only view filter (pure)', () => {
  const empty = business();
  const saved = savedFor(empty);
  const filled = business({ ...FILLED, updated_at: '2026-02-01T00:00:00Z' });

  it('saved data generates the profile gaps under test', () => {
    for (const r of [...PROFILE_FILLED, 'add_business_website', 'complete_business_services']) expect(rules(saved)).toContain(r);
  });
  it('1. saved phone hides the old phone recommendation', () => {
    expect(rules(hideSatisfiedProfileActions(business({ phone: FILLED.phone }), [], saved, NOW))).not.toContain('add_business_phone');
  });
  it('2. saved opening hours hide the old schedule recommendation', () => {
    expect(rules(hideSatisfiedProfileActions(business({ schedule: FILLED.schedule }), [], saved, NOW))).not.toContain('add_business_schedule');
  });
  it('3. saved target audience hides the old audience recommendation', () => {
    expect(rules(hideSatisfiedProfileActions(business({ target_audience: FILLED.target_audience }), [], saved, NOW))).not.toContain('define_target_audience');
  });
  it('4. missing services and website recommendations remain', () => {
    const out = rules(hideSatisfiedProfileActions(filled, [], saved, NOW));
    expect(out).toContain('add_business_website');
    expect(out).toContain('complete_business_services');
  });
  it('5. missing Google Business Profile recommendation remains', () => {
    const src: SourceSnapshot[] = [{ sourceType: 'google_business', status: 'connecting', lastSyncAt: null, metadata: {} }];
    const withGbp = savedFor(empty, src);
    const gbp = withGbp.filter((a) => a.sourceType === 'SOURCE_REQUIRED');
    expect(gbp.length).toBeGreaterThan(0);
    const out = hideSatisfiedProfileActions(filled, src, withGbp, NOW);
    for (const a of gbp) expect(out).toContainEqual(a);
  });
  it('5b. only BUSINESS_PROFILE items are hidden, even when sources would close others', () => {
    const src: SourceSnapshot[] = [{ sourceType: 'google_business', status: 'connecting', lastSyncAt: null, metadata: {} }];
    const withGbp = savedFor(empty, src);
    const out = hideSatisfiedProfileActions(filled, [], withGbp, NOW);
    for (const a of withGbp.filter((x) => x.sourceType !== 'BUSINESS_PROFILE')) expect(out).toContainEqual(a);
  });
  it('6. no duplicates and nothing new is added', () => {
    const out = hideSatisfiedProfileActions(filled, [], saved, NOW);
    expect(new Set(out.map((a) => a.id)).size).toBe(out.length);
    for (const a of out) expect(saved).toContainEqual(a);
  });
  it('8. completed and dismissed history is returned untouched', () => {
    const history: BusinessAction[] = [
      { ...saved[0], id: 'h1', status: 'COMPLETED', completedAt: NOW.toISOString(), metadata: { resolved_by: 'condition_met' } },
      { ...saved[1], id: 'h2', status: 'DISMISSED', dismissedAt: NOW.toISOString() },
    ];
    const frozen = JSON.stringify(history);
    const out = hideSatisfiedProfileActions(filled, [], history, NOW);
    expect(out).toEqual(history);
    expect(JSON.stringify(history)).toBe(frozen);
  });
  it('9. actions of another business are never returned', () => {
    const foreign = savedFor(business({ id: OTHER }));
    const out = hideSatisfiedProfileActions(business(), [], [...saved, ...foreign], NOW);
    expect(out.every((a) => a.businessId === BIZ)).toBe(true);
  });
  it('12. premium reconciliation still resolves the same items as COMPLETED', () => {
    const plan = planSync(filled, [], saved, NOW);
    const resolved = plan.toResolve.filter((r) => PROFILE_FILLED.includes(r.action.ruleId));
    expect(resolved.map((r) => r.status)).toEqual(['COMPLETED', 'COMPLETED', 'COMPLETED']);
    expect(plan.toInsert.filter((c) => PROFILE_FILLED.includes(c.ruleId))).toHaveLength(0);
  });
  it('14. Hoy and Tu Semana read the same filtered list', () => {
    const out = hideSatisfiedProfileActions(filled, [], saved, NOW);
    const week = buildWeeklyPlan({ businessId: BIZ, actions: out, lang: 'es', access: { hasPremium: false }, now: NOW });
    const weekRules = [...week.focus, ...week.later].map((i) => i.action.ruleId);
    expect(weekRules).toContain('add_business_website');
    for (const r of PROFILE_FILLED) expect(weekRules).not.toContain(r);
    for (const r of rules(selectTodayActions(out))) expect(PROFILE_FILLED).not.toContain(r);
  });
  it('15. in-memory filtering never counts hidden items as completed progress', () => {
    const before = buildWeeklyPlan({ businessId: BIZ, actions: saved, lang: 'es', access: { hasPremium: false }, now: NOW });
    const after = buildWeeklyPlan({ businessId: BIZ, actions: hideSatisfiedProfileActions(filled, [], saved, NOW), lang: 'es', access: { hasPremium: false }, now: NOW });
    expect(after.progress.done).toBe(before.progress.done);
    expect(after.resolvedThisWeek).toHaveLength(0);
    expect(after.progress.pending).toBe(before.progress.pending - PROFILE_FILLED.length);
  });
});

describe('A3.7.6.7 provider behaviour', () => {
  let host: HTMLDivElement;
  let root: Root;
  let ctx: ActionsContextValue;
  function Probe() { ctx = useContext(ActionsContext); return null; }
  const mount = async () => {
    await reactAct(async () => { root.render(<ActionsProvider><Probe /></ActionsProvider>); });
    await reactAct(async () => { await new Promise((r) => setTimeout(r, 0)); });
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    env.business = business({ ...FILLED, updated_at: '2026-02-01T00:00:00Z' });
    env.hasPremium = false;
    env.saved = savedFor(business());
    env.sources = [];
    env.sourcesFail = false;
    env.loadActions.mockReset().mockImplementation(async (id: string) => env.saved.filter((a) => a.businessId === id));
    env.syncActions.mockReset().mockImplementation(async () => ({ actions: [], inserted: [], resolved: [] }));
    env.transitionAction.mockReset();
  });
  afterEach(() => { reactAct(() => root.unmount()); host.remove(); });

  it('read-only: filled profile gaps are hidden and legitimate ones stay', async () => {
    await mount();
    const shown = rules(ctx.actions);
    for (const r of PROFILE_FILLED) expect(shown).not.toContain(r);
    expect(shown).toContain('add_business_website');
    expect(ctx.locked).toBe(true);
  });
  it('7. read-only: no write is attempted', async () => {
    await mount();
    await reactAct(async () => { await ctx.refresh(); });
    expect(env.syncActions).not.toHaveBeenCalled();
    expect(env.transitionAction).not.toHaveBeenCalled();
    await expect(ctx.complete(ctx.actions[0])).rejects.toThrow();
    expect(env.transitionAction).not.toHaveBeenCalled();
  });
  it('10. read-only: a later profile update re-filters', async () => {
    env.business = business();
    await mount();
    expect(rules(ctx.actions)).toContain('add_business_phone');
    env.business = business({ phone: FILLED.phone, updated_at: '2026-03-01T00:00:00Z' });
    await mount();
    expect(rules(ctx.actions)).not.toContain('add_business_phone');
    expect(rules(ctx.actions)).toContain('add_business_schedule');
  });
  it('11. read-only: reloading Tu Semana gives the same result', async () => {
    await mount();
    const first = rules(ctx.actions);
    await reactAct(async () => { await ctx.ensureFresh(); });
    await reactAct(async () => { await ctx.refresh(); });
    expect(rules(ctx.actions)).toEqual(first);
    expect(env.loadActions).toHaveBeenCalledTimes(3);
  });
  it('5c. read-only: a connecting GBP source keeps its recommendation', async () => {
    env.sources = [GBP_SOURCE_ROW];
    const src: SourceSnapshot[] = [{ sourceType: 'google_business', status: 'connecting', lastSyncAt: null, metadata: {} }];
    env.saved = savedFor(business(), src);
    await mount();
    const required = env.saved.filter((a) => a.sourceType === 'SOURCE_REQUIRED').map((a) => a.ruleId);
    expect(required.length).toBeGreaterThan(0);
    for (const r of required) expect(rules(ctx.actions)).toContain(r);
  });
  it('18. read-only: when sources fail to load nothing is hidden', async () => {
    env.sourcesFail = true;
    await mount();
    expect(rules(ctx.actions)).toEqual(rules(env.saved));
    expect(ctx.error).toBeNull();
  });
  it('13. premium: normal persistent reconciliation runs and is shown as returned', async () => {
    env.hasPremium = true;
    const persisted = env.saved.filter((a) => !PROFILE_FILLED.includes(a.ruleId));
    env.syncActions.mockResolvedValue({ actions: persisted, inserted: [], resolved: [] });
    await mount();
    expect(env.syncActions).toHaveBeenCalledTimes(1);
    expect(env.syncActions.mock.calls[0][0]).toBe(env.business);
    expect(env.loadActions).not.toHaveBeenCalled();
    expect(ctx.actions).toEqual(persisted);
  });
});

describe('A3.7.6.7 copy and protected surfaces', () => {
  it('16. missing-sources notice no longer names Facebook or Instagram', () => {
    expect(PAGE_COPY.es.missingSources).toBe('Algunas fuentes de datos todavía no están disponibles. Conéctalas para obtener recomendaciones más precisas.');
    expect(PAGE_COPY.en.missingSources).toBe('Some data sources are not yet available. Connect them for more precise recommendations.');
    for (const l of ['es', 'en'] as const) expect(PAGE_COPY[l].missingSources).not.toMatch(/Facebook|Instagram|Google/);
  });
  it('17. Meta connection and publishing files are unchanged', () => {
    const h = (p: string) => createHash('sha256').update(readFileSync(resolve(ROOT, p))).digest('hex').slice(0, 16);
    expect(h('src/features/meta-connection/MetaConnectionCard.tsx')).toBe('3729892653ebfdba');
    expect(h('src/features/meta-connection/metaStatus.ts')).toBe('50845c8d1b85d2be');
    expect(h('src/features/meta-connection/MetaPageSelectModal.tsx')).toBe('e4e5b66a372e97c8');
    expect(h('src/features/meta-connection/MetaCallbackPage.tsx')).toBe('5bfc455450d14345');
    expect(h('src/features/actions/engine.ts')).toBe('2fa3eb2913328eb1');
    expect(h('src/features/actions/rules.ts')).toBe('d32c4bb98a2819f7');
    expect(h('src/features/actions/repository.ts')).toBe('0aff1a5a1c9fa738');
  });
  it('read-only view helper has no database access', () => {
    const src = readFileSync(resolve(__dirname, '../readOnlyView.ts'), 'utf8');
    expect(src).not.toMatch(/supabase|repository|insert|update|delete/i);
  });
});
