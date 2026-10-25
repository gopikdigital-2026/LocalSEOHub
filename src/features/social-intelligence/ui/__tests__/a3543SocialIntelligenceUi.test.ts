import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  analyseSocialData, buildSocialViewModel, isPublishableRecommendation, refreshOutcome, safeMetaPermalink,
  type AttentionCardView, type SocialViewModel,
} from '../viewModel';
import { SOCIAL_UI_COPY, joinList } from '../copy';
import type { SocialData } from '../repository';
import type { SocialRecommendation } from '../../findings/types';

const ROOT = resolve(__dirname, '../../../../../');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const UI_DIR = 'src/features/social-intelligence/ui';
const uiFiles = readdirSync(join(ROOT, UI_DIR)).filter((f) => /\.tsx?$/.test(f));
const ui = Object.fromEntries(uiFiles.map((f) => [f, read(`${UI_DIR}/${f}`)]));
const tsx = uiFiles.filter((f) => f.endsWith('.tsx')).map((f) => ui[f]).join('\n');

const NOW = '2026-05-10T12:00:00.000Z';
const SYNCED = '2026-05-10T10:00:00.000Z';
type Snapshot = SocialData['snapshot'];

const okSync = (platform: 'facebook' | 'instagram', over: Partial<Snapshot['syncStates'][number]> = {}) => ({
  platform, status: 'ok', error_code: null, item_count: 3, pages_fetched: 1, last_success_at: SYNCED, ...over,
});

const REAL_ITEMS: Snapshot['items'] = [
  { platform: 'facebook', external_id: 'f1', content_type: 'photo', text_content: 'Nuevo menú', published_at: '2026-05-02T09:00:00.000Z', reaction_count: null, comment_count: null },
  { platform: 'facebook', external_id: 'f2', content_type: 'photo', text_content: null, published_at: '2026-04-20T09:00:00.000Z', reaction_count: null, comment_count: null },
  { platform: 'facebook', external_id: 'f3', content_type: 'link', text_content: '   ', published_at: '2026-04-10T09:00:00.000Z', reaction_count: null, comment_count: null },
  { platform: 'instagram', external_id: 'i1', content_type: 'image', text_content: 'Hola', published_at: '2026-04-01T09:00:00.000Z', reaction_count: 0, comment_count: 0 },
];

function data(over: Partial<Snapshot> = {}, permalinks: SocialData['permalinks'] = {
  'facebook:f2': 'https://www.facebook.com/123/posts/2',
  'facebook:f3': 'javascript:alert(1)',
}): SocialData {
  return {
    snapshot: {
      connection: { status: 'connected', instagram_status: 'connected' },
      syncStates: [okSync('facebook'), okSync('instagram', { item_count: 1 })],
      items: REAL_ITEMS,
      ...over,
    },
    account: { pageName: 'Café Central', instagramUsername: 'cafecentral' },
    permalinks,
  };
}

function vm(d: SocialData, lang: 'es' | 'en' = 'es') {
  const model = buildSocialViewModel(d, analyseSocialData(d, NOW), lang);
  if (model.kind !== 'report') throw new Error('expected report');
  return model;
}

const allText = (m: SocialViewModel) => JSON.stringify(m);
const card = (m: Extract<SocialViewModel, { kind: 'report' }>, topic: string) => m.attention.find((c) => c.topic === topic);

describe('A3.5.4.3 Social Intelligence UI', () => {
  it('A. real-data shape: overview, attention in engine order, known and coverage sections', () => {
    const m = vm(data());
    const [fb, ig] = m.overview;
    expect(fb).toMatchObject({ platform: 'facebook', account: 'Café Central', status: { key: 'connected' } });
    expect(fb.activity?.label).toBe('Última publicación hace 8 días');
    expect(fb.postsAnalysed).toBe('3 publicaciones analizadas');
    expect(ig.account).toBe('@cafecentral');
    expect(ig.activity?.label).toBe('Sin publicaciones recientes');
    expect(m.attention.map((c) => c.topic)).toEqual(['LONG_INACTIVITY', 'TEXT_MISSING']);
    expect(m.known.map((k) => k.topic)).toEqual(['INTERMEDIATE_ACTIVITY', 'RECENCY_DIFFERENCE']);
    expect(m.coverage.history?.platforms).toBe('Facebook · Instagram');
    expect(m.coverage.notes).toEqual(['Las métricas de interacción de Facebook no están disponibles actualmente para este análisis.']);
  });

  it('B. activity wording follows the engine: recent, intermediate (days only), long, never "Inactivo"', () => {
    const recent = vm(data({ items: [{ ...REAL_ITEMS[0], published_at: '2026-05-08T09:00:00.000Z' }] }));
    expect(recent.overview[0].activity?.label).toBe('Actividad reciente');
    const m = vm(data());
    expect(m.overview[0].activity).toMatchObject({ label: 'Última publicación hace 8 días', detail: null });
    expect(m.overview[1].activity).toMatchObject({ label: 'Sin publicaciones recientes', detail: 'Última publicación hace 39 días' });
    for (const lang of ['es', 'en'] as const) {
      const m2 = vm(data(), lang);
      const labels = [...m2.overview.flatMap((p) => [p.status.label, p.activity?.label, p.activity?.detail]), ...m2.attention.map((c) => c.badge)];
      expect(labels.join(' ')).not.toMatch(/inactiv/i);
    }
    expect(JSON.stringify(SOCIAL_UI_COPY)).not.toMatch(/Inactiv/);
    expect(SOCIAL_UI_COPY.es.lastPost(1)).toBe('Última publicación hace 1 día');
  });

  it('C. NULL is never shown as 0, and Instagram 0/0 produces no performance diagnosis', () => {
    const m = vm(data());
    const text = allText(m);
    expect(text).not.toMatch(/\b0 (reacciones|comentarios|interacciones)|0\/0|0%|bajo rendimiento|baja interacción/i);
    expect(m.attention.some((c) => /ENGAGEMENT/.test(c.topic))).toBe(false);
    expect(m.coverage.notes.join(' ')).not.toMatch(/Instagram/);
    expect(text).not.toMatch(/reaction_count|comment_count|"null"|undefined|NaN/);
  });

  it('D. limited history is consolidated into one coverage entry with WAIT_FOR_MORE_HISTORY and no CTA', () => {
    const m = vm(data());
    expect(m.coverage.history).not.toBeNull();
    expect(m.coverage.history!.body).toMatch(/ritmo de publicación|formatos|interacción/);
    expect(m.coverage.history!.wait).toBeTruthy();
    expect(m.attention.some((c) => c.topic === 'LIMITED_HISTORY')).toBe(false);
    expect(joinList('es', ['a', 'b', 'c'])).toBe('a, b y c');
    expect(joinList('en', ['a', 'b'])).toBe('a and b');
  });

  it('E. stale data hides activity and counts, shows one refresh card with last good sync', () => {
    const stale = data({ syncStates: [okSync('facebook', { last_success_at: '2026-04-01T00:00:00.000Z' }), okSync('instagram', { last_success_at: '2026-04-01T00:00:00.000Z' })] });
    const m = vm(stale);
    for (const p of m.overview) expect(p).toMatchObject({ status: { key: 'stale' }, activity: null, postsAnalysed: null });
    expect(m.attention).toHaveLength(1);
    expect(m.attention[0]).toMatchObject({ topic: 'DATA_STALE', tone: 'technical', badge: 'Datos desactualizados', cta: { kind: 'refresh' } });
    expect(m.attention[0].notes[0]).toMatch(/^Última actualización correcta/);
    expect(m.known).toEqual([]);
  });

  it('F. every blocked reason maps to its approved badge and CTA', () => {
    const cases: [Partial<Snapshot>, string, string, AttentionCardView['cta']][] = [
      [{ connection: { status: 'reauth_required', instagram_status: 'connected' } }, 'ACCESS_REAUTH_REQUIRED', 'Requiere reconexión', { kind: 'sources', label: 'Ir a Fuentes' }],
      [{ syncStates: [okSync('facebook'), okSync('instagram', { status: 'permission_unavailable' })] }, 'ACCESS_PERMISSION_UNAVAILABLE', 'Acceso limitado', { kind: 'sources', label: 'Ir a Fuentes' }],
      [{ connection: { status: 'connected', instagram_status: 'not_associated' }, syncStates: [okSync('facebook'), okSync('instagram', { status: 'not_linked' })] }, 'ACCESS_NOT_LINKED', 'Sin vincular', { kind: 'sources', label: 'Ir a Fuentes' }],
      [{ syncStates: [okSync('facebook', { status: 'rate_limited' }), okSync('instagram')] }, 'ACCESS_RATE_LIMITED', 'Pausa temporal de Meta', null],
      [{ syncStates: [okSync('facebook', { status: 'api_error' }), okSync('instagram')] }, 'ACCESS_SYNC_ERROR', 'Error temporal', null],
      [{ syncStates: [], items: [] }, 'ACCESS_NEVER_SYNCED', 'Pendiente de sincronizar', { kind: 'refresh' }],
    ];
    for (const [over, topic, badge, cta] of cases) {
      const m = vm(data(over));
      const c = card(m, topic);
      expect(c, topic).toBeDefined();
      expect(c).toMatchObject({ tone: 'technical', badge, cta });
    }
    expect(buildSocialViewModel(data({ connection: null, syncStates: [], items: [] }), analyseSocialData(data({ connection: null, syncStates: [], items: [] }), NOW), 'es')).toEqual({ kind: 'empty' });
  });

  it('G. visual hierarchy: MEDIUM is prioritised, LOW is "to review", access is neutral; no red tones', () => {
    const m = vm(data());
    expect(card(m, 'LONG_INACTIVITY')).toMatchObject({ tone: 'priority', badge: 'Prioritario' });
    expect(card(m, 'TEXT_MISSING')).toMatchObject({ tone: 'review', badge: 'Para revisar' });
    expect(tsx).not.toMatch(/v2-error|red-\d|variant="error"|variant=\{'error'\}/);
    expect(ui['AttentionSection.tsx']).toContain('border-v2-warning-300');
    expect(ui['AttentionSection.tsx']).toContain('border-v2-primary-200');
  });

  it('H. UNSUPPORTED or forged recommendations are filtered and never rendered', () => {
    const d = data();
    const analysis = analyseSocialData(d, NOW);
    const forged = { ...analysis.findings.recommendations[0], recommendationKey: 'BOOST_POST', messageKey: 'BOOST_POST', safetyClass: 'UNSUPPORTED' } as unknown as SocialRecommendation;
    const relabelled = { ...analysis.findings.recommendations[1], safetyClass: 'UNSUPPORTED' } as unknown as SocialRecommendation;
    analysis.findings.recommendations.unshift(forged);
    expect(isPublishableRecommendation(forged)).toBe(false);
    expect(isPublishableRecommendation(relabelled)).toBe(false);
    expect(isPublishableRecommendation(analysis.findings.recommendations[2])).toBe(true);
    const m = buildSocialViewModel(d, analysis, 'es');
    expect(allText(m)).not.toMatch(/BOOST_POST/);
  });

  it('I. only real actions: /fuentes, /herramientas, /negocio, sync, expand and validated permalinks', () => {
    const links = [...tsx.matchAll(/to="([^"]+)"/g)].map((x) => x[1]);
    expect(new Set(links)).toEqual(new Set(['/herramientas', '/fuentes', '/negocio']));
    expect(tsx).not.toMatch(/navigate\(|window\.open|startMetaOAuth|functions\.invoke|supabase/);
    expect(ui['useSocialIntelligence.ts']).toContain('syncMetaContent()');
    expect(tsx).not.toMatch(/href=\{(?!p\.link\.href)/);
    expect(ui['AttentionSection.tsx']).toMatch(/target="_blank"\s+rel="noopener noreferrer"/);
  });

  it('J. "Ver publicaciones" lists exactly the affected posts, and hides the list when counts disagree', () => {
    const m = vm(data());
    const c = card(m, 'TEXT_MISSING')!;
    expect(c.cta).toEqual({ kind: 'viewPosts' });
    expect(c.posts!.map((p) => p.id)).toEqual(['facebook:f2', 'facebook:f3']);
    expect(c.posts![0]).toMatchObject({ type: 'Foto', link: { href: 'https://www.facebook.com/123/posts/2', label: 'Abrir en Facebook' } });
    expect(c.posts![1]).toMatchObject({ type: 'Enlace', link: null, noLink: 'Enlace no disponible' });

    const d = data();
    const analysis = analyseSocialData(d, NOW);
    const f = analysis.findings.findings.find((x) => x.topic === 'TEXT_MISSING')!;
    f.params = { ...f.params, postsWithoutText: 5 };
    const mismatched = buildSocialViewModel(d, analysis, 'es');
    if (mismatched.kind !== 'report') throw new Error('report');
    expect(card(mismatched, 'TEXT_MISSING')).toMatchObject({ posts: null, cta: null });
    expect(ui['AttentionSection.tsx']).toMatch(/aria-expanded=\{open\}/);
    expect(ui['AttentionSection.tsx']).toMatch(/aria-controls=\{listId\}/);
  });

  it('K. permalink allowlist: https and Meta hosts only', () => {
    for (const ok of ['https://facebook.com/x', 'https://www.facebook.com/x', 'https://m.facebook.com/x', 'https://instagram.com/p/1', 'https://www.instagram.com/p/1']) {
      expect(safeMetaPermalink(ok), ok).toBe(ok);
    }
    for (const bad of ['http://www.facebook.com/x', 'javascript:alert(1)', 'https://evil.com/facebook.com', 'https://facebook.com.evil.com/x',
      'https://user:pw@www.facebook.com/x', 'https://www.facebook.com:8443/x', 'data:text/html,x', '//www.facebook.com/x', '', null, undefined]) {
      expect(safeMetaPermalink(bad), String(bad)).toBeNull();
    }
  });

  it('L. responsive layout: single column on mobile, two-column overview, no tables', () => {
    expect(ui['PlatformOverview.tsx']).toContain('grid grid-cols-1 sm:grid-cols-2');
    expect(ui['SocialIntelligencePage.tsx']).toContain('grid grid-cols-1 lg:grid-cols-2');
    expect(tsx).not.toMatch(/<table/);
  });

  it('M. accessibility: one h1, h2 sections, h3 cards, decorative icons hidden, live status and reduced motion', () => {
    expect(tsx.match(/<h1/g)).toHaveLength(1);
    expect(tsx).toMatch(/<h2/);
    expect(tsx).toMatch(/<h3/);
    expect(tsx).toContain('role="status"');
    expect(tsx).toContain('aria-busy={refreshing}');
    expect(tsx).toContain('motion-reduce:animate-none');
    const icons = [...tsx.matchAll(/<([A-Z]\w+) size=\{\d+\}([^>]*)\/>/g)];
    for (const [tag, , attrs] of icons) {
      const inHiddenWrapper = /<(Unplug|Info|CloudOff) size=\{22\}/.test(tag);
      if (!inHiddenWrapper) expect(attrs, tag).toContain('aria-hidden="true"');
    }
  });

  it('N. ES/EN parity with no unresolved placeholders', () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(SOCIAL_UI_COPY.en)).toEqual(keys(SOCIAL_UI_COPY.es));
    expect(SOCIAL_UI_COPY.es.title).toBe('Inteligencia Social');
    expect(SOCIAL_UI_COPY.en.title).toBe('Social Intelligence');
    expect(SOCIAL_UI_COPY.es.back).toBe('Volver a Herramientas');
    expect(SOCIAL_UI_COPY.en.back).toBe('Back to Tools');
    for (const lang of ['es', 'en'] as const) {
      const text = allText(vm(data(), lang)) + JSON.stringify(SOCIAL_UI_COPY[lang]);
      expect(text).not.toMatch(/\{\w+\}/);
      expect(text).not.toMatch(/\b(ACTIVE|INFORMATIONAL|INSUFFICIENT_DATA|NOT_AVAILABLE|REVIEW_POSTS_WITHOUT_TEXT|CROSS_PLATFORM)\b(?!")/);
    }
    const en = vm(data(), 'en');
    expect(en.overview[1].activity?.label).toBe('No recent posts');
    expect(card(en, 'TEXT_MISSING')!.badge).toBe('To review');
  });

  it('O. forbidden v1 content: no scores, reach, impressions, followers, charts, tabs, AI or publishing', () => {
    const copyText = JSON.stringify(SOCIAL_UI_COPY) + allText(vm(data())) + allText(vm(data(), 'en'));
    expect(copyText).not.toMatch(/\breach\b|impressions|Social Score|\/100|impresiones|seguidores|followers|puntuaci[oó]n|\bscore\b/i);
    expect(copyText).not.toMatch(/\bIA\b|\bAI\b/);
    expect(tsx).not.toMatch(/recharts|<svg|<canvas|<Tabs|<select|publicar|publish|openai/i);
    const app = read('src/App.tsx');
    const guarded = app.match(/<Route element=\{<AppGuard><AppShellV2 \/><\/AppGuard>\}>([\s\S]*?)<\/Route>\n/)![1];
    expect(guarded).toContain('<Route path="/herramientas/social" element={<SocialIntelligencePage />} />');
    expect(app).toContain("lazy(() => import('./features/social-intelligence/ui/SocialIntelligencePage'))");
    for (const f of ['src/app-v2/layouts/AppShellV2.tsx']) expect(read(f)).not.toMatch(/social/i);
  });

  it('P. secret boundary, explicit columns, refresh mapping and frozen engines', () => {
    const repo = ui['repository.ts'];
    expect(repo).not.toMatch(/select\(\s*['"`]\*|user_token_ref|access_token|\btoken\b/);
    expect(repo.match(/\.eq\('business_id', businessId\)/g)!.length).toBeGreaterThanOrEqual(3);
    for (const f of uiFiles) expect(ui[f], f).not.toMatch(/service_role|SERVICE_ROLE|import\.meta\.env|user_token_ref/);

    expect(refreshOutcome('SYNC_COOLDOWN', null)).toBe('cooldown');
    expect(refreshOutcome('REAUTH_REQUIRED', null)).toBe('reauth');
    expect(refreshOutcome('UNKNOWN_ERROR', null)).toBe('error');
    expect(refreshOutcome(null, vm(data()))).toBe('success');
    expect(refreshOutcome(null, vm(data({ syncStates: [okSync('facebook', { status: 'rate_limited' }), okSync('instagram')] })))).toBe('rateLimited');
    expect(refreshOutcome(null, vm(data({ syncStates: [okSync('facebook'), okSync('instagram', { status: 'permission_unavailable' })] })))).toBe('permission');

    const FROZEN: Record<string, string> = {
      'src/features/social-intelligence/engine.ts': 'a088e2e9a6dd720f47ae70046abc8e73',
      'src/features/social-intelligence/policy.ts': '9a2b024cc333912d508d92d6a3aabdaf',
      'src/features/social-intelligence/signals.ts': '7d2a19a406dc1b86d3eb425967c37c5a',
      'src/features/social-intelligence/types.ts': 'b9e9509c2289ef8011bf8a98da86917b',
      'src/features/social-intelligence/__tests__/a3541SocialSignals.test.ts': 'c91ccc294a8ff24fdc0867c31b3acc13',
      'src/features/social-intelligence/findings/copy.ts': '5c2c0e33acf23897acdb04f463c1f339',
      'src/features/social-intelligence/findings/engine.ts': 'b923294cce5e86d0356a0a639fd261d9',
      'src/features/social-intelligence/findings/policy.ts': '8f40dfbe7480c1cb7d43876f7396a623',
      'src/features/social-intelligence/findings/rules.ts': '2dbf1084d04d7855f8fd476054a351ee',
      'src/features/social-intelligence/findings/types.ts': '06e724e679c4de177b2cf1ca00ccbaa6',
      'src/features/social-intelligence/findings/__tests__/a3542SocialFindings.test.ts': '04220f3442febdb5e2072ac13a335156', // A3.7.2 GUARD RE-PIN (test 39 also excludes the a372 proposals migration; Social sources unchanged)
      'src/features/meta-connection/metaRepository.ts': '521963d28bd06b212afd630dedf8bb4c',
    };
    for (const [f, h] of Object.entries(FROZEN)) {
      expect(createHash('md5').update(readFileSync(join(ROOT, f))).digest('hex'), f).toBe(h);
    }
  });
});
