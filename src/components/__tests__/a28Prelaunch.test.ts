import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const landing = src('src/components/LandingPage.tsx');
const i18n = src('src/lib/i18n.tsx');
const seoCopy = src('src/features/seo-generator/copy.ts');
const guard = src('src/app-v2/auth.tsx');
const gbpCallback = src('src/features/reality-engine/GBPCallbackPage.tsx');

const between = (s: string, start: string, end: string) => {
  const a = s.indexOf(start);
  return s.slice(a, s.indexOf(end, a + start.length));
};

describe('A2.8 · post-demo gate leads to signup', () => {
  const gate = between(landing, 'const handleEmail', 'return (');
  it('email and Google gate buttons open signup with the business name', () => {
    expect(gate.match(/onSignupClick\(businessName\)/g)?.length).toBe(2);
    expect(gate).not.toMatch(/onLoginClick\(/);
  });
  it('the tool trial section receives the signup handler', () => {
    expect(landing).toMatch(/<ToolTrialSection onLoginClick=\{onLoginClick\} onSignupClick=\{onSignupClick\} \/>/);
  });
  it('the opening message does not promise a report', () => {
    expect(i18n).not.toMatch(/Abriendo tu informe completo/);
    expect(i18n).not.toMatch(/Opening your full report/);
  });
});

describe('A2.8 · landing demos are presented as examples', () => {
  it.each([
    'Resultados Garantizados',
    'más de 10 años',
    'el mejor servicio',
    'pierdes el 68%',
    'reviews: 142',
    'Conseguir 10 reseñas con plantilla',
    'Estrategia de reseñas semana a semana',
    'Estrategia de reseñas personalizada',
  ])('demo no longer contains "%s"', (claim) => {
    expect(landing).not.toContain(claim);
  });
});

describe('A2.8 · landing copy matches what the product does', () => {
  it.each([
    'Mide si ChatGPT',
    'Muchos de nuestros usuarios son agencias',
    'Many of our users are digital marketing agencies',
    'Nunca recibirás el mismo texto',
    'You will never receive the same text',
    'Exporta a CSV para Shopify o Etsy con un solo botón',
    'Export to CSV for Shopify or Etsy with a single button',
    '¿Listo para recibir más llamadas?',
    'Ready to get more calls?',
    "lp_cta_badge: 'Tu competencia ya usa IA'",
  ])('i18n no longer contains "%s"', (claim) => {
    expect(i18n).not.toContain(claim);
  });
  it('FAQ states one business per account in both languages', () => {
    expect(i18n).toMatch(/lp_faq4_a: 'Cada cuenta de LocalSEOHub está pensada para un negocio\./);
    expect(i18n).toMatch(/lp_faq4_a: 'Each LocalSEOHub account is designed for one business\./);
  });
});

describe('A2.8 · SEO limit message does not state a wrong number', () => {
  it('no hardcoded 20 in the SEO limit copy', () => {
    expect(seoCopy).not.toMatch(/20 (generaciones|SEO generations)/);
    expect(seoCopy).toMatch(/límite mensual de generaciones SEO/);
    expect(seoCopy).toMatch(/this month's SEO generation limit/);
  });
});

describe('A2.8 · error screens', () => {
  it('session check error screen offers sign out as well as retry', () => {
    const screen = between(guard, 'const ERROR_SCREEN', ');\n\n');
    expect(screen).toContain('Reintentar');
    expect(screen).toContain('Cerrar sesión');
    expect(guard).toMatch(/supabase\.auth\.signOut\(\)/);
  });
  it('Google callback never renders the error query parameter', () => {
    expect(gbpCallback).not.toMatch(/showError\(errorParam|showError\(decodeURIComponent/);
    expect(gbpCallback).toMatch(/showError\(gbpErrorMessage\(errorParam\)\)/);
    expect(gbpCallback).not.toMatch(/showError\(result\.(error|message)/);
  });
});
