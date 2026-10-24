import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { META_COPY } from '../../meta-connection/metaStatus';

const root = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

function split(file: string, es: string, en: string) {
  const src = read(file);
  const a = src.indexOf(`function ${es}(`);
  const b = src.indexOf(`function ${en}(`);
  expect(a).toBeGreaterThan(0);
  expect(b).toBeGreaterThan(a);
  return { es: flat(src.slice(a, b)), en: flat(src.slice(b)) };
}

const privacy = split('src/features/legal/PrivacyPolicyPage.tsx', 'PrivacyEs', 'PrivacyEn');
const deletion = split('src/features/legal/DataDeletionPage.tsx', 'DataDeletionEs', 'DataDeletionEn');
const terms = split('src/features/legal/TermsPage.tsx', 'TermsEs', 'TermsEn');

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('A3.5.5.1 · Privacy policy discloses the Meta business connection', () => {
  it('has exactly one dedicated Facebook/Instagram section per language', () => {
    for (const lang of [privacy.es, privacy.en]) expect(count(lang, /<section id="facebook-instagram">/g)).toBe(1);
  });
  it('discloses a managed Facebook Page and an Instagram professional account', () => {
    expect(privacy.es).toMatch(/página de Facebook que administres/);
    expect(privacy.es).toMatch(/cuenta profesional de Instagram/);
    expect(privacy.en).toMatch(/Facebook Page you manage/);
    expect(privacy.en).toMatch(/Instagram professional account/);
  });
  it('lists the data categories actually read', () => {
    for (const s of ['publicaciones recientes', 'número de reacciones', 'nombre de usuario', 'biografía', 'seguidores', 'estado de la conexión']) expect(privacy.es).toContain(s);
    for (const s of ['recent posts', 'number of reactions', 'username', 'biography', 'followers', 'status of the connection']) expect(privacy.en).toContain(s);
  });
  it('states the purpose and rules out functions that do not exist', () => {
    expect(privacy.es).toMatch(/Analizar la presencia en redes sociales/);
    expect(privacy.es).toMatch(/No publicamos, programamos ni eliminamos contenido/);
    expect(privacy.es).toMatch(/no la vendemos/);
    expect(privacy.en).toMatch(/Analysing your business's social media presence/);
    expect(privacy.en).toMatch(/We do not publish, schedule or delete content/);
    expect(privacy.en).toMatch(/we do not sell it/);
  });
  it('describes authorisation handling without implementation details', () => {
    expect(privacy.es).toMatch(/Se guarda cifrada/);
    expect(privacy.en).toMatch(/It is stored encrypted/);
    for (const lang of [privacy.es, privacy.en]) expect(lang).not.toMatch(/vault|appsecret|token_ref|user_token|META_APP|access_token/i);
  });
  it('explains disconnection and what it deletes', () => {
    expect(privacy.es).toMatch(/«Fuentes».*«Facebook e Instagram».*«Desconectar»/);
    expect(privacy.es).toMatch(/todas las publicaciones y datos de sincronización guardados/);
    expect(privacy.en).toMatch(/«Fuentes» \(Sources\).*«Facebook and Instagram».*«Disconnect»/);
    expect(privacy.en).toMatch(/all saved posts and sync data/);
  });
  it('keeps the Meta Pixel and the business connection clearly separate', () => {
    expect(privacy.es).toMatch(/Diferencia con el Meta Pixel/);
    expect(privacy.es).toMatch(/no se envía al Meta Pixel/);
    expect(privacy.en).toMatch(/Difference from the Meta Pixel/);
    expect(privacy.en).toMatch(/not sent to the Meta Pixel/);
  });
  it('states independence from Meta without overclaims', () => {
    expect(privacy.es).toMatch(/no está afiliado, patrocinado ni respaldado por Meta/);
    expect(privacy.en).toMatch(/not affiliated with, sponsored or endorsed by Meta/);
    for (const lang of [privacy.es, privacy.en]) expect(lang).not.toMatch(/100\s?%|Meta (certified|approved|partner)|GDPR compliant|totalmente seguro/i);
  });
  it('keeps the same sections in both languages', () => {
    const ids = (s: string) => [...s.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(privacy.en)).toEqual(ids(privacy.es));
    expect(count(privacy.en, /<h3>/g)).toBe(count(privacy.es, /<h3>/g));
    expect(count(privacy.en, /<li>/g)).toBe(count(privacy.es, /<li>/g));
  });
});

describe('A3.5.5.1 · Data deletion page explains Meta removal', () => {
  it('has a Facebook/Instagram section in both languages', () => {
    expect(deletion.es).toMatch(/<section id="facebook-instagram"> <h2>4\. Datos de Facebook e Instagram/);
    expect(deletion.en).toMatch(/<section id="facebook-instagram"> <h2>4\. Facebook and Instagram data/);
  });
  it('gives self-service steps that match the real card labels', () => {
    expect(deletion.es).toContain(`«${META_COPY.es.title}»`);
    expect(deletion.es).toContain(`«${META_COPY.es.disconnect}»`);
    expect(deletion.en).toContain(`«${META_COPY.en.title}»`);
    expect(deletion.en).toContain(`«${META_COPY.en.disconnect}»`);
    expect(deletion.es).toContain('Abre «Fuentes» en el menú');
    expect(deletion.en).toContain('Open «Fuentes» (Sources) in the menu');
  });
  it('describes the real effect of disconnecting and what stays', () => {
    expect(deletion.es).toMatch(/Borramos la autorización de acceso de Meta/);
    expect(deletion.es).toMatch(/Pedimos a Meta que retire los permisos/);
    expect(deletion.es).toMatch(/registro técnico mínimo/);
    expect(deletion.en).toMatch(/We delete the Meta access authorisation/);
    expect(deletion.en).toMatch(/We ask Meta to remove the permissions/);
    expect(deletion.en).toMatch(/minimal technical record/);
  });
  it('is honest that removing access in Facebook alone does not delete stored data', () => {
    expect(deletion.es).toMatch(/no se borran hasta que pulses «Desconectar»/);
    expect(deletion.en).toMatch(/is not deleted until you press «Disconnect»/);
  });
  it('offers the official contact for users who cannot sign in', () => {
    for (const lang of [deletion.es, deletion.en]) expect(count(lang, /<MailLink \/>/g)).toBeGreaterThanOrEqual(3);
    expect(read('src/features/legal/DataDeletionPage.tsx')).not.toMatch(/@[a-z]+\.[a-z]+/i);
  });
  it('promises no deadline and asks for no secrets in either language', () => {
    expect(deletion.es).not.toMatch(/\d+\s*(días|horas|semanas)|automátic/i);
    expect(deletion.en).not.toMatch(/\d+\s*(days|hours|weeks)|automatic/i);
    expect(deletion.en).toContain('We will never ask for your password');
  });
  it('keeps the same structure in both languages', () => {
    const ids = (s: string) => [...s.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids(deletion.en)).toEqual(ids(deletion.es));
    expect(count(deletion.en, /<li>/g)).toBe(count(deletion.es, /<li>/g));
    expect(count(deletion.en, /<h3>/g)).toBe(count(deletion.es, /<h3>/g));
  });
});

describe('A3.5.5.1 · Terms third-party integration clause', () => {
  it('adds the authority and availability clause in both languages', () => {
    expect(terms.es).toMatch(/que administres o que estés autorizado a gestionar/);
    expect(terms.es).toMatch(/dependen de la disponibilidad y de la autorización de cada plataforma/);
    expect(terms.en).toMatch(/that you manage or are authorised to manage/);
    expect(terms.en).toMatch(/depend on each platform's availability and authorisation/);
    for (let i = 1; i <= 8; i++) {
      expect(terms.es).toContain(`<h2>${i}. `);
      expect(terms.en).toContain(`<h2>${i}. `);
    }
  });
});

describe('A3.5.5.2 · Legal contact consistency', () => {
  it('all legal pages use the single LocalSEOHub legal contact', () => {
    expect(read('src/features/legal/LegalLinks.tsx')).toContain("LEGAL_CONTACT_EMAIL = 'admin@localseohub.io'");
    for (const file of ['PrivacyPolicyPage', 'DataDeletionPage', 'TermsPage']) {
      const src = read(`src/features/legal/${file}.tsx`);
      expect(src).toContain('<MailLink />');
      expect(src).not.toMatch(/gopik\.digital@gmail\.com/);
    }
    expect(terms.es).toContain('contáctanos en <MailLink />');
    expect(terms.en).toContain('contact us at <MailLink />');
  });
});

describe('A3.5.5.1 · Legal layout language switch', () => {
  it('lets visitors switch between Spanish and English', () => {
    const layout = read('src/features/legal/LegalLayout.tsx');
    expect(layout).toMatch(/setLang\(code\)/);
    expect(layout).toMatch(/\['es', 'en'\]/);
    expect(layout).toContain("back: 'Back to home'");
  });
});
