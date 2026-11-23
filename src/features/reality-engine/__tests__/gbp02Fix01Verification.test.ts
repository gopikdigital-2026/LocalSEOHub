import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createHandler,
  parseLocationProfile,
  parseReviewsSummary,
  type SyncDeps,
} from '../../../../supabase/functions/gbp-sync/handler.ts';
import type { CredentialStore } from '../../../../supabase/functions/gbp-sync/gbpToken.ts';
import { evaluateBusinessState } from '../../actions/engine';
import type { BusinessRecord } from '../../business-memory/businessRecord';
import type { SourceSnapshot } from '../../actions/types';
import { sourceDisplayStatus } from '../sourceStatus';
import { SOURCE_REGISTRY } from '../registry';
import type { ConnectedSource } from '../types';

const NOW = new Date('2026-11-24T10:00:00Z');
const EARLIER = '2026-11-01T10:00:00.000Z';
const USER = 'user-1';
const OTHER_USER = 'user-2';
const BIZ = 'biz-1';
const OTHER_BIZ = 'biz-2';
const ACCESS = 'ya29.SECRET_ACCESS';
const SELECTION = { accountId: 'accounts/123', locationId: 'locations/456', locationName: 'Bar Pepe', businessId: BIZ };
const LOCATION = {
  name: 'locations/456',
  title: 'Bar Pepe',
  phoneNumbers: { primaryPhone: '600 000 000' },
  websiteUri: 'https://barpepe.es',
  categories: { primaryCategory: { displayName: 'Bar' } },
  storefrontAddress: { addressLines: ['Calle Mayor 1'], locality: 'Sevilla', postalCode: '41001' },
  regularHours: { periods: [{ openDay: 'MONDAY' }] },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const raw = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'application/json' } });

type Row = Record<string, unknown>;

/** Models the stored rows; upserts merge only the columns sent, like the real data API. */
function harness(opts: { location?: () => Response; reviews?: () => Response; previous?: { gbp?: Row; reviews?: Row } } = {}) {
  const gbp: Row = {
    id: 'src-1', status: 'connecting', metadata: { phase: 'select_location', authorized_at: EARLIER },
    verified_profile: null, verified_at: null, ...opts.previous?.gbp,
  };
  const reviewsRows = new Map<string, Row>();
  if (opts.previous?.reviews) reviewsRows.set(`${USER}|${BIZ}`, { ...opts.previous.reviews });
  const store: CredentialStore = {
    read: async () => ({ accessToken: ACCESS, refreshToken: '1//R', expiresAt: new Date(NOW.getTime() + 3_600_000).toISOString() }),
    write: async () => true,
  };
  const fetchFn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('businessinformation')) return opts.location ? opts.location() : json(LOCATION);
    if (url.includes('/reviews')) return opts.reviews ? opts.reviews() : json({ totalReviewCount: 12, averageRating: 4.5 });
    return json({}, 404);
  });
  const deps: SyncDeps = {
    getUserId: async (jwt) => (jwt === 'good' ? USER : jwt === 'other' ? OTHER_USER : null),
    getOwnBusinessId: async (u) => (u === USER ? BIZ : u === OTHER_USER ? OTHER_BIZ : null),
    loadSource: async (u, b) => (u === USER && b === BIZ ? { id: String(gbp.id), status: String(gbp.status), metadata: gbp.metadata as Row } : null),
    credentials: () => store,
    updateSource: async (u, id, patch) => {
      if (u !== USER || id !== gbp.id) return false;
      Object.assign(gbp, patch);
      return true;
    },
    upsertReviews: async (u, b, row) => {
      const key = `${u}|${b}`;
      reviewsRows.set(key, { ...reviewsRows.get(key), ...row });
      return true;
    },
    addEvent: async () => undefined,
    fetch: fetchFn as unknown as typeof fetch,
    env: (n) => ({ GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret', SITE_URL: 'https://localseohub.io' } as Record<string, string>)[n],
    now: () => NOW,
  };
  const call = async (body: unknown = SELECTION, jwt = 'good') => {
    const res = await createHandler(deps)(new Request('https://x/gbp-sync', {
      method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
    return { status: res.status, body: await res.json() };
  };
  return { gbp, reviewsRows, reviews: () => reviewsRows.get(`${USER}|${BIZ}`), fetchFn, call };
}

const silence = () => [vi.spyOn(console, 'error').mockImplementation(() => undefined), vi.spyOn(console, 'warn').mockImplementation(() => undefined)];
afterEach(() => vi.restoreAllMocks());

const entry = (id: string) => SOURCE_REGISTRY.find((e) => e.id === id)!;
const asSource = (type: string, row: Row | undefined): ConnectedSource | undefined => row && ({
  id: 'x', user_id: USER, business_id: BIZ, source_type: type, external_account_id: null, external_location_id: null,
  token_expires_at: null, last_sync_at: null, last_error: null, metadata: {}, verified_profile: null, verified_at: null,
  created_at: EARLIER, updated_at: EARLIER, ...row,
} as ConnectedSource);
const reviewsCard = (h: ReturnType<typeof harness>) => sourceDisplayStatus(entry('reviews'), asSource('reviews', h.reviews()), asSource('google_business', h.gbp));

describe('GBP-02-FIX01 F01: reviews are only verified when Google returns a valid count', () => {
  it('valid profile and valid reviews: connected with the real count and rating', async () => {
    const h = harness();
    const { body } = await h.call();
    expect(body).toMatchObject({ success: true, status: 'connected', reviewCount: 12, reviewsStatus: 'connected' });
    expect(h.gbp.verified_profile).toMatchObject({ name: 'Bar Pepe', totalReviews: 12, averageRating: 4.5 });
    expect(h.reviews()).toMatchObject({ status: 'connected', last_error: null, metadata: { linkedToGBP: true, reviewCount: 12 } });
    expect(reviewsCard(h)).toBe('verified');
  });

  it('valid profile with a confirmed zero count is the only way to store zero', async () => {
    const h = harness({ reviews: () => json({ totalReviewCount: 0 }) });
    const { body } = await h.call();
    expect(body).toMatchObject({ success: true, reviewCount: 0, reviewsStatus: 'connected' });
    expect(h.gbp.verified_profile).toMatchObject({ totalReviews: 0, averageRating: null });
    expect(h.reviews()).toMatchObject({ status: 'connected', metadata: { reviewCount: 0 } });
  });

  const failures: [string, () => Response, string, string][] = [
    ['503', () => json({ error: { code: 503 } }, 503), 'REVIEWS_FETCH_FAILED', 'error'],
    ['500', () => json({}, 500), 'REVIEWS_FETCH_FAILED', 'error'],
    ['403', () => json({ error: { code: 403 } }, 403), 'REVIEWS_PERMISSION_DENIED', 'permissions_required'],
    ['401', () => json({}, 401), 'REVIEWS_PERMISSION_DENIED', 'permissions_required'],
    ['429', () => json({ error: { code: 429 } }, 429), 'REVIEWS_QUOTA_UNAVAILABLE', 'error'],
    ['200 with invalid JSON', () => raw('{not json'), 'REVIEWS_INVALID_RESPONSE', 'error'],
    ['200 without a counter', () => json({ averageRating: 4.2, reviews: [] }), 'REVIEWS_INVALID_RESPONSE', 'error'],
    ['200 with a non-numeric counter', () => json({ totalReviewCount: 'muchas' }), 'REVIEWS_INVALID_RESPONSE', 'error'],
    ['200 with a negative counter', () => json({ totalReviewCount: -3 }), 'REVIEWS_INVALID_RESPONSE', 'error'],
    ['200 with an array body', () => json([1, 2]), 'REVIEWS_INVALID_RESPONSE', 'error'],
    ['network failure', () => { throw new TypeError('network'); }, 'REVIEWS_FETCH_FAILED', 'error'],
  ];

  for (const [label, reviews, code, rowStatus] of failures) {
    it(`reviews ${label}: profile still connects, reviews are not verified and never zero`, async () => {
      silence();
      const h = harness({ reviews });
      const { body } = await h.call();
      expect(body).toMatchObject({ success: true, status: 'connected', reviewCount: null, reviewsStatus: rowStatus });
      expect(h.gbp.status).toBe('connected');
      expect(h.gbp.verified_profile).toMatchObject({ name: 'Bar Pepe' });
      expect(h.gbp.verified_profile).not.toHaveProperty('totalReviews');
      expect(h.gbp.verified_profile).not.toHaveProperty('averageRating');
      expect(h.reviews()).toMatchObject({ status: rowStatus, last_error: code });
      expect(h.reviews()).not.toHaveProperty('metadata');
      expect(reviewsCard(h)).not.toBe('verified');
    });
  }

  it('parseReviewsSummary accepts only explicit non-negative integers', () => {
    expect(parseReviewsSummary({ totalReviewCount: 7, averageRating: 4.1 })).toEqual({ verified: true, count: 7, averageRating: 4.1 });
    expect(parseReviewsSummary({ totalReviewCount: '7' })).toMatchObject({ verified: true, count: 7 });
    expect(parseReviewsSummary({ totalReviewCount: 7, averageRating: 9 })).toMatchObject({ averageRating: null });
    expect(parseReviewsSummary({ totalReviewCount: 2.5 }).verified).toBe(false);
    expect(parseReviewsSummary({ totalReviewCount: null }).verified).toBe(false);
    expect(parseReviewsSummary(null).verified).toBe(false);
    expect(parseReviewsSummary(undefined).verified).toBe(false);
  });
});

describe('GBP-02-FIX01 F02: only a matching, well-formed Location is verified', () => {
  const invalid: [string, () => Response][] = [
    ['200 with invalid JSON', () => raw('<html>oops</html>')],
    ['200 with an empty body', () => raw('')],
    ['200 with null', () => json(null)],
    ['200 with an array', () => json([LOCATION])],
    ['200 without a resource name', () => json({ title: 'Bar Pepe' })],
    ['200 for a different location', () => json({ ...LOCATION, name: 'locations/999' })],
    ['200 for an error envelope', () => json({ error: { code: 400, message: 'bad' } })],
    ['200 with a non-string title', () => json({ ...LOCATION, title: { text: 'x' } })],
    ['200 with malformed phone numbers', () => json({ ...LOCATION, phoneNumbers: '600' })],
    ['200 with malformed hours', () => json({ ...LOCATION, regularHours: { periods: 'always' } })],
    ['200 with malformed address lines', () => json({ ...LOCATION, storefrontAddress: { addressLines: [1, 2] } })],
  ];

  for (const [label, location] of invalid) {
    it(`profile ${label}: rejected as LOCATION_INVALID_RESPONSE without verifying anything`, async () => {
      const spies = silence();
      const h = harness({ location });
      const { status, body } = await h.call();
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: false, code: 'LOCATION_INVALID_RESPONSE', status: 'error' });
      expect(typeof body.error).toBe('string');
      expect(h.gbp.status).toBe('error');
      expect(h.gbp.verified_at).toBeNull();
      expect(h.gbp.verified_profile).toBeNull();
      expect(h.reviews()).toBeUndefined();
      expect(h.fetchFn.mock.calls.some(([u]) => String(u).includes('/reviews'))).toBe(false);
      const logged = spies.flatMap((s) => s.mock.calls.flat()).map(String).join(' ');
      expect(logged).not.toContain(ACCESS);
      expect(logged).not.toContain('oops');
      expect(logged).not.toContain('Bar Pepe');
    });
  }

  it('valid profile with legitimately empty optional fields is accepted with nulls', async () => {
    const h = harness({ location: () => json({ name: 'locations/456', title: 'Bar Pepe', storefrontAddress: {}, regularHours: {}, phoneNumbers: {} }) });
    const { body } = await h.call();
    expect(body).toMatchObject({ success: true, status: 'connected' });
    expect(h.gbp.verified_profile).toEqual({
      name: 'Bar Pepe', category: null, address: null, phone: null, website: null, hours: null, totalReviews: 12, averageRating: 4.5,
    });
    expect(h.gbp.verified_at).toBe(NOW.toISOString());
  });

  it('parseLocationProfile accepts the canonical and the account-qualified resource name', () => {
    expect(parseLocationProfile(LOCATION, 'locations/456')).toMatchObject({ name: 'Bar Pepe', address: 'Calle Mayor 1, Sevilla, 41001' });
    expect(parseLocationProfile({ ...LOCATION, name: 'accounts/123/locations/456' }, 'locations/456')).not.toBeNull();
    expect(parseLocationProfile({ ...LOCATION, name: 'locations/4567' }, 'locations/456')).toBeNull();
    expect(parseLocationProfile({ name: 'locations/456' }, 'locations/456')).toMatchObject({ name: null });
  });
});

describe('GBP-02-FIX01: previously verified data, isolation and recommendations', () => {
  const previous = {
    gbp: {
      status: 'connected', verified_at: EARLIER, last_sync_at: EARLIER,
      verified_profile: { name: 'Bar Pepe', website: 'https://barpepe.es', totalReviews: 30, averageRating: 4.7 },
      metadata: { phase: 'connected', authorized_at: EARLIER },
    },
    reviews: { status: 'connected', last_sync_at: EARLIER, last_error: null, metadata: { linkedToGBP: true, reviewCount: 30 } },
  };

  it('an invalid profile keeps the previous verified profile, timestamp and review count', async () => {
    silence();
    const h = harness({ previous, location: () => raw('not json') });
    await h.call();
    expect(h.gbp.verified_profile).toEqual(previous.gbp.verified_profile);
    expect(h.gbp.verified_at).toBe(EARLIER);
    expect(h.reviews()).toEqual(previous.reviews);
  });

  it('a reviews failure keeps the previous stored review count and sync time', async () => {
    silence();
    const h = harness({ previous, reviews: () => json({}, 503) });
    await h.call();
    expect(h.reviews()).toMatchObject({ status: 'error', last_error: 'REVIEWS_FETCH_FAILED', last_sync_at: EARLIER, metadata: { linkedToGBP: true, reviewCount: 30 } });
  });

  it('a later valid sync clears the reviews error', async () => {
    silence();
    const h = harness({ previous: { ...previous, reviews: { ...previous.reviews, status: 'error', last_error: 'REVIEWS_FETCH_FAILED' } } });
    await h.call();
    expect(h.reviews()).toMatchObject({ status: 'connected', last_error: null, metadata: { reviewCount: 12 } });
  });

  it('isolation: another user or business never reads, fetches or writes this source', async () => {
    const h = harness();
    expect((await h.call({ ...SELECTION, businessId: OTHER_BIZ })).status).toBe(403);
    const other = await h.call({ ...SELECTION, businessId: OTHER_BIZ }, 'other');
    expect(other.body.success).toBe(false);
    expect((await h.call(SELECTION, 'bad')).status).toBe(401);
    expect(h.fetchFn).not.toHaveBeenCalled();
    expect(h.gbp.status).toBe('connecting');
    expect(h.reviewsRows.size).toBe(0);
  });

  it('isolation: the reviews row is written only for the caller and their own business', async () => {
    const h = harness({ reviews: () => json({}, 429) });
    silence();
    await h.call();
    expect([...h.reviewsRows.keys()]).toEqual([`${USER}|${BIZ}`]);
  });

  describe('recommendations', () => {
    const business = (): BusinessRecord => ({
      id: BIZ, user_id: USER, name: 'Bar Pepe', category: 'Bar', city: 'Sevilla',
      website: 'https://barpepe.es', phone: '600', schedule: 'L-V 9-18', target_audience: 'Vecinos', services: ['Tapas'],
      primary_goal: 'more_calls', secondary_goals: [],
      onboarding_completed: true, onboarding_completed_at: null, legacy_memory_migrated_at: null,
      created_at: EARLIER, updated_at: EARLIER,
    });
    const verifiedIds = (h: ReturnType<typeof harness>) => {
      const snapshot: SourceSnapshot = {
        sourceType: 'google_business', status: String(h.gbp.status),
        lastSyncAt: (h.gbp.verified_at as string | null) ?? null, metadata: (h.gbp.verified_profile as Row | null) ?? {},
      } as SourceSnapshot;
      return evaluateBusinessState(business(), [snapshot], [], NOW).filter((c) => c.sourceType === 'VERIFIED_FINDING').map((c) => c.ruleId);
    };

    it('a reviews failure never produces a false "get your first reviews" action', async () => {
      silence();
      for (const reviews of [() => json({}, 503), () => json({}, 403), () => json({}, 429), () => raw('x'), () => json({})]) {
        const h = harness({ reviews });
        await h.call();
        expect(verifiedIds(h)).not.toContain('gbp_get_first_reviews');
      }
    });

    it('only a confirmed zero produces the first-reviews action', async () => {
      const h = harness({ reviews: () => json({ totalReviewCount: 0 }) });
      await h.call();
      expect(verifiedIds(h)).toContain('gbp_get_first_reviews');
    });

    it('an invalid profile produces no GBP-derived findings at all', async () => {
      silence();
      const h = harness({ location: () => json({ ...LOCATION, name: 'locations/999', websiteUri: null }) });
      await h.call();
      expect(verifiedIds(h)).toEqual([]);
    });

    it('empty optional fields are reported as real gaps, never as missing reviews', async () => {
      const h = harness({ location: () => json({ name: 'locations/456', title: 'Bar Pepe' }) });
      await h.call();
      const ids = verifiedIds(h);
      expect(ids).toContain('gbp_add_website');
      expect(ids).not.toContain('gbp_get_first_reviews');
    });
  });
});
