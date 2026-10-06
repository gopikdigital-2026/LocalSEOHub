import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { recommendationOrigin, isFinding, ORIGIN_LABELS } from '../dataIntegrity';
import { demoRecommendations } from '../../app-v2/demo/demoData';
import { isRealLocationName, LOCATIONS_UNAVAILABLE_MSG } from '../../features/reality-engine/gbpStatus';

const root = resolve(__dirname, '../../..');
const src = (p: string) => readFileSync(resolve(root, p), 'utf8');

describe('no random or name-derived metrics presented as real', () => {
  const landing = src('src/components/LandingPage.tsx');

  it('landing page does not use Math.random for any score', () => {
    expect(landing).not.toMatch(/Math\.random/);
  });

  it('hero example result is not derived from a hash of the business name', () => {
    const fn = landing.slice(landing.indexOf('function buildResult'), landing.indexOf('const CLR'));
    expect(fn).not.toMatch(/charCodeAt/);
    expect(fn).not.toMatch(/name\.(toLowerCase|length)/);
  });

  it('landing example results are labelled as a demo', () => {
    expect(landing).toMatch(/<DemoNotice \/>/);
    expect(landing).toMatch(/Ejemplo de diagnóstico/);
    expect(landing).not.toMatch(/puntuación detectada/);
    expect(landing).not.toMatch(/factores analizados/);
  });

  it('today page has no hardcoded health score or invented competitor alerts', () => {
    const today = src('src/app-v2/routes/TodayPage.tsx');
    expect(today).not.toMatch(/healthScore\s*=\s*\d+/);
    expect(today).not.toMatch(/Competidor [AB]/);
    expect(today).not.toMatch(/demoMilestones|demoInsights|demoAlerts/);
  });
});

describe('Google Business Profile never invents a location', () => {
  const page = src('src/features/reality-engine/GBPCallbackPage.tsx');

  it('callback page has no synthetic /locations/default fallback', () => {
    expect(page).not.toMatch(/locations\/default/);
    expect(page).toMatch(/LOCATIONS_UNAVAILABLE_MSG/);
  });

  it('only accepts location identifiers returned by Google', () => {
    expect(isRealLocationName('locations/123456')).toBe(true);
    expect(isRealLocationName('accounts/1/locations/987')).toBe(true);
    expect(isRealLocationName('accounts/1/locations/default')).toBe(false);
    expect(isRealLocationName('')).toBe(false);
    expect(isRealLocationName('Mi negocio')).toBe(false);
  });

  it('uses the honest unavailable message', () => {
    expect(LOCATIONS_UNAVAILABLE_MSG).toMatch(/^No hemos podido obtener las ubicaciones de Google Business Profile\./);
  });
});

describe('workspaces show an empty state by default and isolate demo data', () => {
  const ws = src('src/features/execution/workspaces.tsx');

  it('demo mode starts disabled', () => {
    expect(ws).toMatch(/const \[showDemo, setShowDemo\] = useState\(false\)/);
  });

  it('reviews workspace explains missing data and offers an explicit example', () => {
    expect(ws).toMatch(/Todavía no tenemos tus reseñas/);
    expect(ws).toMatch(/onShowExample=\{openDemo\}/);
  });

  it('profile workspace asks for real data instead of asserting problems', () => {
    expect(ws).toMatch(/Necesitamos datos de tu Perfil de Empresa para analizar este apartado\./);
    expect(ws).toMatch(/<OriginLabel origin="general" \/>/);
  });

  it('post workspace has a first-post empty state', () => {
    expect(ws).toMatch(/Genera tu primera publicación/);
  });

  it('every demo branch shows the demo-mode banner and cannot complete the real action', () => {
    const demoBranches = ws.split('<DemoModeBanner').length - 1;
    expect(demoBranches).toBe(4);
    const demoLayouts = ws.match(/<WorkspaceLayout[^>]*>\s*<div className="space-y-[45]">\s*<DemoModeBanner/g) ?? [];
    expect(demoLayouts).toHaveLength(4);
    demoLayouts.forEach((l) => expect(l).not.toMatch(/onComplete=/));
  });
});

describe('reports and business memory do not fall back to demo metrics', () => {
  it('weekly summary shows an empty state when there is no real activity', () => {
    const page = src('src/features/business-memory/WeeklySummaryPage.tsx');
    expect(page).toMatch(/Tu primer informe todavía no está disponible\./);
    expect(page).toMatch(/Completa acciones en LocalSEOHub y aquí verás tu progreso semanal\./);
    expect(page).toMatch(/Ver informe de ejemplo/);
    expect(page).not.toMatch(/isDemo \? DEMO_SUMMARY : liveSummary;\s*\n\s*useEffect/);
    expect(page).toMatch(/useState\(false\)/);
  });

  it('timeline, insights and preferences contain no demo fallbacks', () => {
    const timeline = src('src/features/business-memory/BusinessTimeline.tsx');
    expect(timeline).not.toMatch(/DEMO_TIMELINE|DEMO_INSIGHTS|DEMO_PREFERENCES/);
  });
});

describe('general recommendations are never labelled as findings', () => {
  it('every demo recommendation is classified as general', () => {
    demoRecommendations.forEach((rec) => {
      expect(recommendationOrigin(rec)).toBe('general');
      expect(isFinding(rec)).toBe(false);
    });
  });

  it('demo recommendations do not claim detected facts about the business', () => {
    const forbidden = /\b(tienes|tu perfil lleva|la descripcion actual|no se han subido|no se ha actualizado)\b/i;
    demoRecommendations.forEach((rec) => {
      [rec.title, rec.summary, rec.reason].forEach((text) => expect(text).not.toMatch(forbidden));
      expect(rec.source).toBe('Recomendacion general');
    });
  });

  it('origin labels match the agreed wording', () => {
    expect(ORIGIN_LABELS.real).toBe('Basado en tus datos');
    expect(ORIGIN_LABELS.user_provided).toBe('Basado en la información de tu negocio');
    expect(ORIGIN_LABELS.general).toBe('Recomendación general');
    expect(ORIGIN_LABELS.estimated).toBe('Estimación');
  });

  it('real and user-provided data are classified correctly', () => {
    expect(recommendationOrigin({ dataMode: 'real', confidence: 'verified', sourceType: 'google_business' })).toBe('real');
    expect(recommendationOrigin({ dataMode: 'real', confidence: 'verified', sourceType: 'manual' })).toBe('user_provided');
    expect(recommendationOrigin({ dataMode: 'estimated', confidence: 'estimated', sourceType: 'website' })).toBe('estimated');
  });
});

describe('i18n ES/EN parity', () => {
  const file = src('src/lib/i18n.tsx');
  const esStart = file.indexOf('\n  es: {');
  const enStart = file.indexOf('\n  en: {');
  const end = file.indexOf('export type TranslationKey');
  const keys = (block: string) => new Set(Array.from(block.matchAll(/^\s{4}([a-zA-Z0-9_]+):/gm), (m) => m[1]));
  const es = keys(file.slice(esStart, enStart));
  const en = keys(file.slice(enStart, end));

  it('has the same keys in both languages', () => {
    expect(es.size).toBeGreaterThan(100);
    expect([...es].filter((k) => !en.has(k))).toEqual([]);
    expect([...en].filter((k) => !es.has(k))).toEqual([]);
  });

  it('includes the demo notice keys in both languages', () => {
    ['demo_notice_title', 'demo_notice_body', 'trial_free_label'].forEach((k) => {
      expect(es.has(k)).toBe(true);
      expect(en.has(k)).toBe(true);
    });
  });
});
