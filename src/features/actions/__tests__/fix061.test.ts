import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateBusinessState, dedupCandidates } from '../engine';
import { sourceDisplayStatus, isActive } from '../../reality-engine/sourceStatus';
import { SOURCE_REGISTRY, getSourceEntry } from '../../reality-engine/registry';
import { isValidWebsite } from '../../business-memory/profileValidation';
import type { BusinessRecord } from '../../business-memory/businessRecord';
import type { SourceSnapshot } from '../types';
import type { ConnectedSource, SourceStatus, SourceType } from '../../reality-engine/types';

const root = resolve(__dirname, '../../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');
const NOW = new Date('2026-03-11T10:00:00Z');

function business(over: Partial<BusinessRecord> = {}): BusinessRecord {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: 'u', name: 'Taller Ruiz', category: 'Taller', city: 'Sevilla',
    website: 'https://ruiz.es', phone: '600', schedule: 'L-V 9-18', target_audience: 'Conductores', services: ['Frenos'],
    primary_goal: 'more_reviews', secondary_goals: [],
    onboarding_completed: true, onboarding_completed_at: null, legacy_memory_migrated_at: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

const analysis = { url: 'https://ruiz.es', statusCode: 200, https: true, title: 'Taller Ruiz Sevilla', metaDescription: 'Frenos', h1: 'Taller', hasRobotsTxt: true, hasSitemap: true, canonical: null, hasSchema: false, analyzedAt: NOW.toISOString(), errors: [], confidence: 'real' };
const snap = (sourceType: SourceType, status: SourceStatus, metadata: Record<string, unknown> = {}): SourceSnapshot =>
  ({ sourceType, status, lastSyncAt: status === 'connected' ? NOW.toISOString() : null, metadata });
const ids = (b: BusinessRecord, sources: SourceSnapshot[] = []) => dedupCandidates(evaluateBusinessState(b, sources, [], NOW), [], NOW).map((c) => c.ruleId);
const WEB_RULES = ['add_business_website', 'connect_website_source', 'fix_source_connection:website'];
const webIds = (list: string[]) => list.filter((id) => WEB_RULES.includes(id));

describe('FIX 06.1 · website recommendations never overlap', () => {
  it('A. no website declared → only «add your website»', () => {
    expect(webIds(ids(business({ website: '' })))).toEqual(['add_business_website']);
    expect(webIds(ids(business({ website: '   ' })))).toEqual(['add_business_website']);
  });

  it('B. website declared but not analysed → only «analyse your website»', () => {
    expect(webIds(ids(business()))).toEqual(['connect_website_source']);
  });

  it('C. website analysed → neither, only verified findings when there are gaps', () => {
    expect(webIds(ids(business(), [snap('website', 'connected', { analysis })]))).toEqual([]);
  });

  it('D. website analysis in error → a specific «analyse again», no duplicate connect action', () => {
    const list = ids(business(), [snap('website', 'error')]);
    expect(webIds(list)).toEqual(['fix_source_connection:website']);
    const fix = evaluateBusinessState(business(), [snap('website', 'error')], [], NOW).find((c) => c.ruleId === 'fix_source_connection:website')!;
    expect(fix.copy.es.title).toBe('Vuelve a analizar tu web');
    expect(fix.copy.en.title).toBe('Analyse your website again');
  });

  it('every website rule id appears at most once per evaluation', () => {
    for (const b of [business({ website: '' }), business()]) {
      for (const s of [[], [snap('website', 'error')], [snap('website', 'connected', { analysis })]]) {
        const list = ids(b, s);
        expect(new Set(list).size).toBe(list.length);
      }
    }
  });
});

describe('FIX 06.1 · Google and reviews', () => {
  it('without GBP the business still gets useful, non-GBP recommendations', () => {
    const list = ids(business());
    expect(list).toContain('connect_google_business_profile');
    expect(list.filter((id) => id !== 'connect_google_business_profile').length).toBeGreaterThan(0);
  });

  it('GBP or reviews in error do not create a second «check the connection» action', () => {
    const list = ids(business(), [snap('google_business', 'error'), snap('reviews', 'error')]);
    expect(list).toContain('connect_google_business_profile');
    expect(list).not.toContain('fix_source_connection:google_business');
    expect(list).not.toContain('fix_source_connection:reviews');
  });
});

describe('FIX 06.1 · source states shown in /fuentes', () => {
  const row = (source_type: SourceType, status: SourceStatus, metadata: Record<string, unknown> = {}): ConnectedSource => ({
    id: source_type, user_id: 'u', business_id: 'b', source_type, status, external_account_id: null, external_location_id: null,
    token_expires_at: null, last_sync_at: null, last_error: null, metadata, created_at: '', updated_at: '',
  });
  const entry = (id: SourceType) => getSourceEntry(id)!;

  it('reviews depend on Google and are never independently connectable', () => {
    expect(entry('reviews').dependsOn).toBe('google_business');
    expect(sourceDisplayStatus(entry('reviews'), undefined, undefined)).toBe('pending');
    expect(sourceDisplayStatus(entry('reviews'), row('reviews', 'connected'), undefined)).toBe('pending');
    expect(sourceDisplayStatus(entry('reviews'), row('reviews', 'connected'), row('google_business', 'error'))).toBe('unavailable');
    expect(sourceDisplayStatus(entry('reviews'), undefined, row('google_business', 'connected'))).toBe('pending');
    expect(sourceDisplayStatus(entry('reviews'), row('reviews', 'connected'), row('google_business', 'connected'))).toBe('verified');
  });

  it('distinguishes verified, analysed, declared, pending, error and not available', () => {
    expect(sourceDisplayStatus(entry('google_business'), row('google_business', 'connected'), undefined)).toBe('verified');
    expect(sourceDisplayStatus(entry('google_business'), row('google_business', 'error'), undefined)).toBe('error');
    expect(sourceDisplayStatus(entry('google_business'), undefined, undefined)).toBe('pending');
    expect(sourceDisplayStatus(entry('website'), row('website', 'connected'), undefined)).toBe('analyzed');
    expect(sourceDisplayStatus(entry('website'), row('website', 'syncing'), undefined)).toBe('in_progress');
    expect(sourceDisplayStatus(entry('manual'), row('manual', 'connected'), undefined)).toBe('declared');
    expect(sourceDisplayStatus(entry('search_console'), undefined, undefined)).toBe('coming_soon');
    expect(isActive('declared')).toBe(true);
    expect(isActive('unavailable')).toBe(false);
    expect(isActive('error')).toBe(false);
  });

  it('every source has Spanish and English copy', () => {
    SOURCE_REGISTRY.forEach((e) => {
      expect(e.nameEn.trim()).not.toBe('');
      expect(e.descriptionEn.trim()).not.toBe('');
    });
  });

  it('the reviews card offers no connect button and manual data is labelled as declared', () => {
    const card = src('src/features/reality-engine/SourceCard.tsx');
    expect(card).toMatch(/else if \(dependent\)/);
    expect(card).toMatch(/dependsPending/);
    expect(src('src/features/reality-engine/registry.ts')).toMatch(/no los verificamos/);
  });

  it('a connected website can be analysed again so fixed findings can close', () => {
    expect(src('src/features/reality-engine/SourceCard.tsx')).toMatch(/Volver a analizar/);
  });
});

describe('FIX 06.1 · website analysis input and sync ordering', () => {
  it('validates website addresses the same way as the profile form', () => {
    expect(isValidWebsite('https://ruiz.es')).toBe(true);
    expect(isValidWebsite('https://localhost')).toBe(false);
    expect(isValidWebsite('javascript:alert(1)')).toBe(false);
    expect(isValidWebsite('https://a:b@ruiz.es')).toBe(false);
    expect(src('src/features/reality-engine/SourceManager.tsx')).toMatch(/isValidWebsite\(normalizedUrl\)/);
  });

  it('a save during a running sync is not lost: the next sync waits and re-reads the data', () => {
    expect(src('src/features/actions/ActionsProvider.tsx')).toMatch(/while \(inFlight\.current\) await inFlight\.current/);
  });
});
