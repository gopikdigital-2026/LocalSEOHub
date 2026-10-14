import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TOOLS } from '../catalog';

const ROOT = resolve(__dirname, '../../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const FN_DIR = join(ROOT, 'supabase/functions');

const app = src('src/App.tsx');
const shell = src('src/app-v2/layouts/AppShellV2.tsx');
const page = src('src/features/tools/ToolsPage.tsx');
const catalog = src('src/features/tools/catalog.ts');
const toolsSources = readdirSync(join(ROOT, 'src/features/tools'))
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => src(`src/features/tools/${f}`));

const RETIRED = [
  'analyze-competitor-url', 'audit-maps-profile', 'audit-reviews',
  'execute-tip-content', 'generate-business-audit', 'generate-content-plan',
  'generate-countermeasure', 'generate-gbp-description', 'generate-geo-audit',
  'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories',
  'simulate-campaign',
];

describe('A2.4.1 tools hub foundation', () => {
  it('1-2. /herramientas is mounted inside the AppGuard shell like the other product routes', () => {
    const guarded = app.match(/<Route element=\{<AppGuard><AppShellV2 \/><\/AppGuard>\}>([\s\S]*?)<\/Route>\n/);
    expect(guarded).not.toBeNull();
    const block = guarded![1];
    expect(block).toContain('<Route path="/herramientas" element={<ToolsPage />} />');
    for (const p of ['/hoy', '/plan', '/informes', '/negocio', '/fuentes', '/facturacion']) {
      expect(block).toContain(`path="${p}"`);
    }
    expect(app).toContain("lazy(() => import('./features/tools/ToolsPage'))");
    expect(app.match(/path="\/herramientas"/g)).toHaveLength(1);
  });

  it('3. sidebar lists Herramientas right after Plan, in the expected order', () => {
    const labels = [...shell.matchAll(/\{ id: '[^']+', label: '([^']+)'/g)].map((m) => m[1]);
    expect(labels).toEqual(['Hoy', 'Plan', 'Herramientas', 'Resumen', 'Mi negocio', 'Fuentes', 'Facturación']);
    expect(shell).toMatch(/path: '\/herramientas', icon: <Wrench/);
  });

  it('4. exactly the seven tools are catalogued in order with the approved copy', () => {
    expect(TOOLS.map((t) => t.copy.es.name)).toEqual([
      'Generador SEO', 'Maps Profile Scanner', 'AI Digital Twin', 'Competitor Radar',
      'GEO Audit', 'AI Business Advisor', 'Voice Simulator',
    ]);
    expect(TOOLS.map((t) => t.copy.es.indicator)).toEqual([
      'Utiliza los datos de tu negocio + IA',
      'Precisión según las fuentes disponibles',
      'Análisis basado en los datos disponibles',
      'No inventamos competidores',
      'Evaluación orientativa, no ranking real en IA',
      'Utiliza el contexto de tu negocio + IA',
      'Simulación generada con IA',
    ]);
    for (const t of TOOLS) {
      expect(t.copy.en.name).toBeTruthy();
      expect(t.copy.en.description).toBeTruthy();
      expect(t.copy.en.indicator).toBeTruthy();
    }
    expect(page).toContain('TOOLS.map');
    expect(page).toContain('data-testid="tool-card"');
  });

  it('5. no tool has an active CTA; every CTA is disabled and reads "En preparación"', () => {
    expect(TOOLS.every((t) => t.enabled === false)).toBe(true);
    expect(page).toContain("cta: 'En preparación'");
    expect(page).toMatch(/<button[\s\S]*?disabled[\s\S]*?\{l\.cta\}/);
    expect(page).not.toMatch(/onClick|navigate\(|<a\s|href=|Probar/);
  });

  it('internal recovery statuses are never rendered', () => {
    expect(page).not.toMatch(/recoveryStatus|legacyFunction/);
    for (const s of ['READY_FOR_SAFE_RECOVERY', 'PARTIAL', 'REQUIRES_REBUILD', 'BLOCKED', 'NO_IMPLEMENTATION_FOUND']) {
      expect(page).not.toContain(s);
    }
  });

  it.each(RETIRED)('6. retired %s still answers 410 and stays a bare stub', (fn) => {
    expect(readdirSync(join(FN_DIR, fn))).toEqual(['index.ts']);
    const fnSrc = readFileSync(join(FN_DIR, fn, 'index.ts'), 'utf8');
    expect(fnSrc).toContain('status: 410');
    expect(fnSrc).not.toMatch(/\bimport\b|fetch\(|Deno\.env|req\.json\(|createClient|requirePremium|openai/i);
  });

  it('7-8. tools code performs no AI, edge-function, database or external calls', () => {
    for (const s of toolsSources) {
      expect(s).not.toMatch(/supabase|functions\.invoke|invokeEdge|fetch\(|XMLHttpRequest|openai|gpt-|axios/i);
    }
  });

  it('9. no API keys or env secrets in the tools frontend', () => {
    for (const s of toolsSources) {
      expect(s).not.toMatch(/import\.meta\.env|process\.env|sk_(live|test)_|LocalSEO_(KEY|AI)|SERVICE_ROLE|Bearer /);
    }
    expect(catalog).not.toMatch(/https?:\/\//);
  });

  it('10. mobile bottom bar keeps its original five destinations; drawer and sidebar get all items', () => {
    expect(shell).toContain("const BOTTOM_BAR_IDS = ['hoy', 'plan', 'informes', 'negocio', 'fuentes'];");
    expect(shell).toContain('{BOTTOM_BAR_ITEMS.map((item) => (');
    expect(shell.match(/\{NAV_ITEMS\.map\(\(item\) => \(/g)).toHaveLength(2);
    expect(page).toContain('grid-cols-1 sm:grid-cols-2 xl:grid-cols-3');
  });

  it('11. existing routes and redirects are still declared', () => {
    for (const p of ['"/"', '"/signup"', '"/login"', '"/empezar"', '"/negocio/objetivos"', '"/negocio/memoria"',
      '"/oauth/google-business/callback"', '"/ejecutar/:recommendationId"', '"/registro"', '"/dashboard"', '"*"']) {
      expect(app).toContain(`path=${p}`);
    }
  });

  it('landing demo results are labelled as illustrative examples, not real or AI output', () => {
    const landing = src('src/components/LandingPage.tsx');
    expect(landing).not.toContain('Fallos críticos detectados');
    expect(landing).not.toContain('Señales detectadas');
    expect(landing).not.toContain('Consejo AI para');
    expect(landing).toContain('Ejemplo orientativo de consejo para');
  });
});
