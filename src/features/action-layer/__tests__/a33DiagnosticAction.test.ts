import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { geoActions, mapsActions, twinActions, type ActionItem, type ActionKey } from '../model';
import { CANONICAL_TARGETS, PRIMARY_CTA, PROFILE_ANCHORS, primaryAction } from '../primary';
import type { PriorityId } from '../../maps-scanner/engine';
import type { TwinGapId } from '../../digital-twin/engine';
import type { GeoPriorityId } from '../../geo-audit/engine';
import { COPY as TWIN_COPY } from '../../digital-twin/copy';

const root = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(root, p))).digest('hex');

const MAPS_IDS: PriorityId[] = ['complete_profile', 'add_category', 'add_city', 'add_phone', 'fix_gbp', 'connect_gbp', 'add_schedule', 'add_services', 'add_website', 'align_phone', 'align_website', 'reviews', 'keep_fresh'];
const TWIN_IDS: TwinGapId[] = ['complete_identity', 'add_activity', 'add_city', 'add_services', 'add_audience', 'add_goal', 'add_phone', 'add_hours', 'add_website', 'fix_gbp', 'connect_gbp', 'sync_gbp', 'keep_updated'];
const GEO_IDS: GeoPriorityId[] = ['complete_identity', 'add_activity', 'add_city', 'add_services', 'add_website', 'fix_gbp', 'connect_gbp', 'align_sources', 'add_audience', 'add_phone', 'add_hours', 'gbp_category', 'keep_fresh'];

// build() caps at MAX_ACTIONS, so items are produced one priority at a time to cover every id.
function all<T extends string>(fn: (p: Array<{ id: T; cta: string }>) => ActionItem[], ids: T[]): ActionItem[] {
  return ids.flatMap((id) => fn([{ id, cta: '/negocio' }]));
}
const maps = all(mapsActions, MAPS_IDS);
const twin = all(twinActions, TWIN_IDS);
const geo = all(geoActions, GEO_IDS);
const byKey = (items: ActionItem[], key: ActionKey) => items.find((i) => i.key === key)!;
const fallback = { to: '/negocio', label: 'Completar datos' };

const ROUTES = [...read('src/App.tsx').matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
const AI_WORDS = /\b(IA|AI|Generar|Generate|Mejorar|Improve|Continuar|Continue|Ver más|See more|Resolver|Resolve)\b/i;

describe('A3.3 · canonical primary actions', () => {
  it('1. Maps shows specific actions for known gaps', () => {
    expect(primaryAction('es', byKey(maps, 'phone'), fallback)).toEqual({ to: '/negocio#profile-phone', label: 'Añadir teléfono' });
    expect(primaryAction('es', byKey(maps, 'hours'), fallback)).toEqual({ to: '/negocio#profile-schedule', label: 'Completar horario' });
    expect(primaryAction('es', byKey(maps, 'services'), fallback)).toEqual({ to: '/negocio#profile-service-input', label: 'Completar servicios' });
    expect(primaryAction('es', byKey(maps, 'website'), fallback)).toEqual({ to: '/negocio#profile-website', label: 'Añadir sitio web' });
    expect(primaryAction('es', byKey(maps, 'gbp_connect'), fallback)).toEqual({ to: '/fuentes', label: 'Revisar fuentes' });
  });

  it('2. Twin shows specific actions for known gaps', () => {
    expect(primaryAction('es', byKey(twin, 'services'), fallback).label).toBe('Completar servicios');
    expect(primaryAction('es', byKey(twin, 'audience'), fallback)).toEqual({ to: '/negocio#profile-targetAudience', label: 'Definir público objetivo' });
    expect(primaryAction('es', byKey(twin, 'phone'), fallback).label).toBe('Añadir teléfono');
    expect(primaryAction('es', byKey(twin, 'hours'), fallback).label).toBe('Completar horario');
    expect(primaryAction('es', byKey(twin, 'website'), fallback).label).toBe('Añadir sitio web');
    expect(primaryAction('es', byKey(twin, 'goal'), fallback).to).toBe('/negocio/objetivos');
  });

  it('3. GEO shows specific actions for known gaps', () => {
    expect(primaryAction('es', byKey(geo, 'services'), fallback).label).toBe('Completar servicios');
    expect(primaryAction('es', byKey(geo, 'website'), fallback).label).toBe('Añadir sitio web');
    expect(primaryAction('es', byKey(geo, 'gbp_connect'), fallback)).toEqual({ to: '/fuentes', label: 'Revisar fuentes' });
    expect(primaryAction('es', byKey(geo, 'audience'), fallback).label).toBe('Definir público objetivo');
    expect(primaryAction('es', byKey(geo, 'phone'), fallback).label).toBe('Añadir teléfono');
  });

  it('4. the same ActionKey resolves to the same destination in every tool', () => {
    const tools = [maps, twin, geo];
    for (const key of Object.keys(CANONICAL_TARGETS) as ActionKey[]) {
      const targets = new Set(tools.flatMap((items) => items.filter((i) => i.key === key)).map((i) => primaryAction('es', i, fallback).to));
      expect(targets.size, key).toBeLessThanOrEqual(1);
    }
    for (const key of ['services', 'phone', 'website', 'hours'] as ActionKey[]) {
      expect(primaryAction('es', byKey(maps, key), fallback)).toEqual(primaryAction('es', byKey(twin, key), fallback));
      expect(primaryAction('es', byKey(maps, key), fallback)).toEqual(primaryAction('es', byKey(geo, key), fallback));
    }
  });

  it('5. every canonical target points to an existing route and a real profile field', () => {
    const profileSrc = read('src/features/business-memory/BusinessProfilePage.tsx');
    for (const target of Object.values(CANONICAL_TARGETS)) {
      const [path, anchor] = target!.split('#');
      expect(ROUTES, target).toContain(path);
      if (anchor) expect(Object.values(PROFILE_ANCHORS)).toContain(anchor);
    }
    for (const [key, id] of Object.entries(PROFILE_ANCHORS)) {
      if (key === 'services') expect(profileSrc).toContain(`id="${id}"`);
      else expect(profileSrc, id).toContain(`field="${id.replace('profile-', '')}"`);
    }
    expect(profileSrc).toContain('const id = `profile-${field}`');
  });

  it('6. no AI or vague CTA labels; the AI help stays a secondary, existing tool link', () => {
    for (const lang of ['es', 'en'] as const) for (const label of Object.values(PRIMARY_CTA[lang])) expect(label).not.toMatch(AI_WORDS);
    expect(byKey(maps, 'services').supporting).toEqual({ tool: 'seo', route: '/herramientas/seo' });
    expect(byKey(twin, 'audience').supporting).toEqual({ tool: 'advisor', route: '/herramientas/advisor' });
    expect(byKey(maps, 'phone').supporting).toBeNull();
    for (const page of ['maps-scanner/MapsScannerPage.tsx', 'geo-audit/GeoAuditPage.tsx', 'digital-twin/DigitalTwinPage.tsx']) {
      const src = read(`src/features/${page}`);
      expect(src).toContain('data-testid="diagnostic-primary-cta"');
      expect(src).toContain('primaryAction(');
      expect(src).not.toMatch(/Generar (análisis|recomendaciones|contenido)/);
    }
  });

  it('7. Google not connected / broken / not synced leads to Sources', () => {
    for (const key of ['gbp_connect', 'gbp_fix', 'gbp_sync', 'gbp_category', 'align_sources'] as ActionKey[]) expect(CANONICAL_TARGETS[key]).toBe('/fuentes');
  });

  it('keys without a canonical fix keep the tool’s own link and label', () => {
    const own = { to: '/herramientas/advisor', label: 'Pedir ideas al asesor' };
    expect(primaryAction('es', byKey(maps, 'reviews'), own)).toEqual(own);
    expect(primaryAction('es', undefined, own)).toEqual(own);
  });

  it('Twin states its purpose next to the existing intro', () => {
    expect(TWIN_COPY.es.subtitle).toBe('Así entiende LocalSEOHub tu negocio.');
    expect(TWIN_COPY.es.purpose).toBe('Cuanto mejor conoce LocalSEOHub tu negocio, más personalizadas pueden ser tus recomendaciones y contenidos.');
    expect(read('src/features/digital-twin/DigitalTwinPage.tsx')).toContain('{t.purpose}');
  });

  it('profile deep-link only accepts known anchors', () => {
    const src = read('src/features/business-memory/BusinessProfilePage.tsx');
    expect(src).toContain('Object.values(PROFILE_ANCHORS) as string[]).includes(anchor)');
  });
});

describe('A3.3 · preservation', () => {
  const FROZEN: Record<string, string> = {
    'src/features/maps-scanner/engine.ts': '1c18dfe0ee2ede9001e5aafe5ff19e4316d5b6600a818f26988b11d3333d380f',
    'src/features/geo-audit/engine.ts': '410253d10b015657bc0e6c2872b31473e3dcce5054bdc29189fd211e2507fe46',
    'src/features/digital-twin/engine.ts': '5ee583c39f7335c42faff29411be0c13c21c66ef08680fc0478445957fbf1cbd',
    'src/app-v2/routes/TodayPage.tsx': '78cdf392ae270d805046632ecb5e0b4872134d8a6ff5f24bd91b0f0a9e8129da', // AUTHORIZED A3.5.4.4.1 TODAYPAGE INTEGRATION RE-PIN
    'src/app-v2/routes/PlanPage.tsx': '109a1a58060ac4b2ef412b62ce3699e751452e904f88d3b4285bdab1e0da8dc0', // AUTHORIZED A3.5.4.4.1 PLANPAGE INTEGRATION RE-PIN
    'src/features/today-intelligence/model.ts': 'bac214444294e6b4dd43a139ec8a318dd8180c299ec55d8c0222d5bf6f6148e4',
    'src/features/roadmap/model.ts': '288b2ae4cda6571d01dcafd680f7c4c4451a9e82372be22cd3b338dba1d68cb5',
  };
  it('8-13. scoring engines (Maps, GEO, Twin %) and Today/Plan are byte-identical', () => {
    for (const [file, hash] of Object.entries(FROZEN)) expect(sha(file), file).toBe(hash);
  });
  it('8. NOT CHECKED states stay rendered by the engines and pages', () => {
    expect(read('src/features/maps-scanner/copy.ts')).toMatch(/No comprobado/i);
    expect(read('src/features/geo-audit/copy.ts')).toMatch(/No comprobado/i);
  });
  it('16. no new migrations (A3.4.2 added the a342 ledger; A3.4.2.2 the GBP server-owned guard; A3.5.1 the Meta connection foundation; A3.7.1 the publications data/storage foundation)', () => {
    expect(readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))).toHaveLength(55); // A3.7.2 adds the publication proposals engine migration; A3.7.3.1 publication drafts; A3.7.3.2 adaptation engine; A3.7.3.3 channel review editing (initial apply + corrected re-apply)
  });
  it('no routes added or removed (A3.4.2 added only /herramientas/resenas; A3.5.1A the 3 public legal routes; A3.5.1 /oauth/meta/callback; A3.5.4.3 /herramientas/social)', () => {
    expect(ROUTES).toHaveLength(33); // A3.7.2.1A HARNESS RE-PIN: temporary hidden /internal/publications-validation
    expect(ROUTES).toContain('/oauth/meta/callback');
    expect(ROUTES).toContain('/herramientas/resenas');
  });
});
