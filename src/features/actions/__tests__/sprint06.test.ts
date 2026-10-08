import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateBusinessState, canMarkDone, actionOutcome, buildActionReport, actionsToTimeline, actionOrigin } from '../engine';
import { validateProfile, normalizeWebsite } from '../../business-memory/profileValidation';
import type { BusinessRecord } from '../../business-memory/businessRecord';
import type { BusinessAction, SourceSnapshot } from '../types';
import type { BusinessProfile } from '../../business-memory/types';

const root = resolve(__dirname, '../../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');
const NOW = new Date('2026-03-11T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const BIZ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function business(over: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: BIZ, user_id: 'u', name: 'Taller Ruiz', category: 'Taller', city: 'Sevilla',
    website: 'https://ruiz.es', phone: '600', schedule: 'L-V 9-18', target_audience: 'Conductores', services: ['Frenos'],
    primary_goal: 'more_reviews', secondary_goals: [],
    onboarding_completed: true, onboarding_completed_at: null, legacy_memory_migrated_at: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function action(over: Partial<BusinessAction> = {}): BusinessAction {
  return {
    id: 'a1', businessId: BIZ, userId: 'u', ruleId: 'r', actionType: 'other', category: 'content',
    title: 't', description: '', reason: '', sourceType: 'GENERAL_BEST_PRACTICE', sourceReference: '',
    priority: 'MEDIUM', score: 40, impact: 'medium', effortMinutes: 10, status: 'PENDING', dueDate: null,
    metadata: {}, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), startedAt: null, completedAt: null, dismissedAt: null,
    ...over,
  };
}

const analysis = (over: Record<string, unknown> = {}) => ({
  url: 'https://ruiz.es', statusCode: 200, https: true, title: 'Taller Ruiz Sevilla', metaDescription: 'Frenos en Sevilla', h1: 'Taller',
  hasRobotsTxt: true, hasSitemap: true, canonical: null, hasSchema: false, analyzedAt: NOW.toISOString(), errors: [], confidence: 'real', ...over,
});
const site = (a: Record<string, unknown>): SourceSnapshot => ({ sourceType: 'website', status: 'connected', lastSyncAt: NOW.toISOString(), metadata: { analysis: a } });
const ids = (b: BusinessRecord, sources: SourceSnapshot[] = []) => evaluateBusinessState(b, sources, [], NOW).map((c) => c.ruleId);

describe('Sprint 06 · recommendation engine', () => {
  it('a GBP connection error does not count as connected', () => {
    expect(ids(business(), [{ sourceType: 'google_business', status: 'error', lastSyncAt: null, metadata: {} }])).toContain('connect_google_business_profile');
    expect(ids(business(), [{ sourceType: 'google_business', status: 'syncing', lastSyncAt: null, metadata: {} }])).not.toContain('connect_google_business_profile');
  });

  it('content recommendations wait until the essentials are complete', () => {
    const incomplete = ids(business({ services: [] }));
    ['create_weekly_post', 'add_recent_photos', 'write_faq_answers'].forEach((id) => expect(incomplete).not.toContain(id));
    expect(ids(business())).toContain('create_weekly_post');
  });

  it('does not duplicate the weekly post when the goal already asks for a call-to-action post', () => {
    const list = ids(business({ primary_goal: 'more_calls' }));
    expect(list).toContain('publish_call_to_action_post');
    expect(list).not.toContain('create_weekly_post');
  });

  it('weekly post copy is specific to the service and city, with evidence', () => {
    const post = evaluateBusinessState(business(), [], [], NOW).find((c) => c.ruleId === 'create_weekly_post')!;
    expect(post.copy.es.title).toContain('Frenos');
    expect(post.evidence).toEqual(expect.objectContaining({ service: 'Frenos', city: 'Sevilla' }));
  });

  it('website analysis gaps become verified findings with evidence, and disappear once fixed', () => {
    const broken = evaluateBusinessState(business(), [site(analysis({ https: false, title: 'Inicio', metaDescription: null, h1: null }))], [], NOW);
    const found = broken.map((c) => c.ruleId);
    ['website_enable_https', 'website_title_city', 'website_add_meta_description', 'website_add_h1'].forEach((id) => expect(found).toContain(id));
    const https = broken.find((c) => c.ruleId === 'website_enable_https')!;
    expect(https.sourceType).toBe('VERIFIED_FINDING');
    expect(https.evidence).toEqual(expect.objectContaining({ url: 'https://ruiz.es' }));
    expect(actionOrigin(https.sourceType)).toBe('real');
    expect(ids(business(), [site(analysis())]).filter((id) => id.startsWith('website_'))).toEqual([]);
  });

  it('no website findings are produced without a real analysis', () => {
    expect(ids(business()).filter((id) => id.startsWith('website_'))).toEqual([]);
    expect(ids(business(), [{ sourceType: 'website', status: 'error', lastSyncAt: null, metadata: {} }]).filter((id) => id.startsWith('website_'))).toEqual([]);
  });

  it('FAQ recommendation closes once FAQs are declared in manual entry', () => {
    expect(ids(business())).toContain('write_faq_answers');
    const manual: SourceSnapshot = { sourceType: 'manual', status: 'connected', lastSyncAt: NOW.toISOString(), metadata: { faqs: '¿Abrís sábados? Sí.' } };
    expect(ids(business(), [manual])).not.toContain('write_faq_answers');
  });

  it('labels origins: declared data, best practice and missing sources', () => {
    expect(actionOrigin('BUSINESS_PROFILE')).toBe('user_provided');
    expect(actionOrigin('GENERAL_BEST_PRACTICE')).toBe('general');
    expect(actionOrigin('SOURCE_REQUIRED')).toBe('unavailable');
  });
});

describe('Sprint 06 · first value and outcomes', () => {
  it('data gaps cannot be self-attested; executable actions can', () => {
    expect(canMarkDone(action({ sourceType: 'BUSINESS_PROFILE' }))).toBe(false);
    expect(canMarkDone(action({ sourceType: 'VERIFIED_FINDING' }))).toBe(false);
    expect(canMarkDone(action({ sourceType: 'GOAL_BASED' }))).toBe(true);
  });

  it('distinguishes executed, data completed, dismissed and open', () => {
    expect(actionOutcome(action({ status: 'COMPLETED', completedAt: NOW.toISOString() }))).toBe('executed');
    expect(actionOutcome(action({ status: 'COMPLETED', sourceType: 'BUSINESS_PROFILE', metadata: { resolved_by: 'condition_met' } }))).toBe('data_completed');
    expect(actionOutcome(action({ status: 'DISMISSED' }))).toBe('dismissed');
    expect(actionOutcome(action())).toBe('open');
  });

  it('weekly report separates outcomes and never counts auto-closed rows as dismissed by the user', () => {
    const today = NOW.toISOString();
    const list = [
      action({ id: '1', status: 'COMPLETED', completedAt: today, effortMinutes: 15, category: 'content' }),
      action({ id: '2', status: 'COMPLETED', completedAt: today, sourceType: 'BUSINESS_PROFILE', category: 'profile', metadata: { resolved_by: 'condition_met' } }),
      action({ id: '3', status: 'DISMISSED', dismissedAt: today, metadata: { auto_closed: true } }),
      action({ id: '4', status: 'PENDING', effortMinutes: 20, category: 'reputation' }),
      action({ id: '5', status: 'COMPLETED', completedAt: new Date(NOW.getTime() - 20 * DAY).toISOString() }),
    ];
    const r = buildActionReport(list, NOW, 'more_reviews');
    expect(r.executedThisWeek).toBe(1);
    expect(r.dataCompletedThisWeek).toBe(1);
    expect(r.dismissedThisWeek).toBe(0);
    expect(r.pending).toBe(1);
    expect(r.executedMinutesThisWeek).toBe(15);
    expect(r.goalActivity?.goal).toBe('more_reviews');
    expect(r.nextAction?.id).toBe('4');
    expect(actionsToTimeline(list).length).toBe(2);
  });

  it('an empty history gives no progress figure instead of 0% or 100%', () => {
    expect(buildActionReport([], NOW).weeklyProgress).toBeNull();
  });

  it('the provider refuses to complete self-resolving actions and execution hides the button', () => {
    expect(src('src/features/actions/ActionsProvider.tsx')).toMatch(/resolves_with_data/);
    expect(src('src/features/execution/ExecutionPage.tsx')).toMatch(/canMarkDone\(action\)/);
  });
});

describe('Sprint 06 · profile validation', () => {
  const profile = (over: Partial<BusinessProfile> = {}): BusinessProfile => ({
    id: BIZ, name: 'Taller Ruiz', category: 'Taller', city: 'Sevilla', services: ['Frenos'], website: 'ruiz.es',
    phone: '+34 600 000 000', schedule: '', targetAudience: '', updatedAt: '', ...over,
  });

  it('accepts a valid profile and normalises the website', () => {
    expect(validateProfile(profile(), 'es')).toEqual({});
    expect(normalizeWebsite('ruiz.es')).toBe('https://ruiz.es');
    expect(normalizeWebsite(' http://ruiz.es ')).toBe('http://ruiz.es');
    expect(normalizeWebsite('')).toBe('');
  });

  it('rejects missing required fields, bad URLs, bad phones and oversize values', () => {
    const e = validateProfile(profile({ name: '', city: ' ', website: 'javascript:alert(1)', phone: 'abc', schedule: 'x'.repeat(501) }), 'en');
    expect(Object.keys(e).sort()).toEqual(['city', 'name', 'phone', 'schedule', 'website']);
    expect(validateProfile(profile({ website: 'https://user:pass@ruiz.es' }), 'es').website).toBeTruthy();
    expect(validateProfile(profile({ services: Array.from({ length: 31 }, (_, i) => `s${i}`) }), 'es').services).toBeTruthy();
  });
});

describe('Sprint 06 · weekly summary honesty', () => {
  const weekly = src('src/features/business-memory/WeeklySummaryPage.tsx');
  it('shows unmeasured metrics as «No medido» and no invented figures', () => {
    expect(weekly).toMatch(/No medido/);
    expect(weekly).toMatch(/external-results/);
    expect(weekly).not.toMatch(/DEMO_SUMMARY|impactAchieved/);
  });
  it('labels time as an estimate', () => {
    expect(weekly).toMatch(/[Ee]stimad/);
  });
});
