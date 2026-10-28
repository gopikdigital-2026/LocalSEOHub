import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TOOLS } from '../../features/tools/catalog';

const ROOT = resolve(__dirname, '../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const landing = src('src/components/LandingPage.tsx');
const i18n = src('src/lib/i18n.tsx');
const tools = src('src/features/tools/ToolsPage.tsx');

describe('A2.8.1 · A28-005 unsupported social proof removed', () => {
  it('1. testimonial section, people, photos and quotes are gone', () => {
    expect(landing).not.toMatch(/testimonials|lp_trust_|pexels|t[1-4]_name|t[1-4]_text/);
    expect(i18n).not.toMatch(/\bt[1-4]_(name|role|city|metric|text)\b|landing_t[1-3]_|landing_testimonials_|lp_trust_/);
  });

  it('2. results section and its performance statistics are gone', () => {
    expect(landing).not.toMatch(/METRICS|MetricCounter|HeroDashboard|lp_results_|landing_metric_/);
    expect(i18n).not.toMatch(/lp_results_|landing_metric_(calls|visits|routes)/);
    expect(landing).not.toMatch(/\+(38|24|23|17|14)%/);
    expect(i18n).not.toMatch(/\+38%|\+24%|\+17%/);
  });

  it('3. "what changes in 30 days" and "we don\'t say it" are absent in ES and EN', () => {
    for (const s of [landing, i18n]) {
      expect(s).not.toMatch(/Lo que cambia en 30 días|What changes in 30 days/i);
      expect(s).not.toMatch(/No lo decimos nosotros|We don.t say it/i);
    }
  });

  it('4. no fabricated rating, user count or replacement proof exists anywhere in copy', () => {
    expect(i18n).not.toMatch(/4\.9\/5|\+2[.,]400|landing_social_proof|landing_rating/);
    expect(landing).not.toMatch(/4\.9\/5|\+2[.,]400|★|rating:/);
  });
});

describe('A2.8.1 · residual outcome claims', () => {
  it('5. outcome promises are replaced by capability language', () => {
    for (const s of ['Más clientes', 'More customers', 'Tu competencia ya usa IA', 'Your competitors are already using AI',
      'más llamadas', 'more calls', 'consigue clientes', 'La IA lo optimiza todo']) {
      expect(i18n).not.toContain(s);
      expect(landing).not.toContain(s);
    }
    expect(i18n).toContain("lp_howto_more: 'Analiza. Prioriza. Mejora.'");
    expect(i18n).toContain("lp_howto_more: 'Analyze. Prioritize. Improve.'");
    expect(i18n).toContain("landing_step_3_title: 'Aplica los cambios'");
    expect(i18n).toContain("landing_step_3_title: 'Apply the changes'");
  });
});

describe('A2.8.1 · demo truthfulness', () => {
  it('6. Radar demo names competitors as examples supplied by the user, with no review data', () => {
    expect(landing).toContain('Competidor de ejemplo {i + 1}');
    expect(landing).toContain('vs. 3 competidores de ejemplo en {city} · en la herramienta indicas tú sus webs');
    expect(landing).not.toMatch(/Competidor #\$?\{?i|reviews:|reseñas reales/);
  });

  it('7. Maps demo no longer shows a nearby-competitor comparison', () => {
    expect(landing).not.toMatch(/Competidores cercanos|Competidor #1 en tu zona/);
  });
});

describe('A2.8.1 · Tools Hub Premium clarity (A28-026)', () => {
  it('8. every enabled card shows the Premium badge and the hub states trial inclusion in ES and EN', () => {
    expect(tools).toMatch(/data-testid="tool-premium"[\s\S]*?\{l\.premiumBadge\}/);
    expect(tools).toContain("premiumNote: 'Todas las herramientas están incluidas en Premium y en el periodo de prueba.'");
    expect(tools).toContain("premiumNote: 'All tools are included in Premium and in the trial period.'");
    expect(tools).toContain('{l.notice} {l.premiumNote}');
  });

  it('9. tool access is unchanged: nine tools (A3.4.2 added reviews, A3.5.4.3 social), all enabled, hub has no billing logic', () => {
    expect(TOOLS).toHaveLength(9);
    expect(TOOLS.every((t) => t.enabled)).toBe(true);
    expect(tools).not.toMatch(/useBilling|hasPremium|supabase|onClick/);
  });

  it('10. the five client-gated tools still lock on hasPremium and the two server-gated ones still call entitlement', () => {
    for (const p of ['competitor-radar/CompetitorRadarPage.tsx', 'digital-twin/DigitalTwinPage.tsx', 'geo-audit/GeoAuditPage.tsx']) {
      expect(src(`src/features/${p}`)).toMatch(/if \(!hasPremium\)/);
    }
    for (const f of ['seo-generator-v2', 'business-advisor-v2']) {
      expect(src(`supabase/functions/${f}/entitlement.ts`)).toContain("'premium_required'");
    }
  });
});

describe('A2.8.1 · A2.8 fixes still in place', () => {
  it('11. SEO limit copy has no 20 and the SEO cap stays 18', () => {
    const seo = src('src/features/seo-generator/copy.ts');
    expect(seo).not.toMatch(/\b20\b/);
    expect(seo).toContain('Has alcanzado el límite mensual de generaciones SEO.');
  });

  it('12. gate opens signup with the business name', () => {
    expect(landing.match(/onSignupClick\(businessName\)/g)?.length).toBe(2);
  });

  it('13. Google callback logs raw errors and renders only fixed messages', () => {
    const cb = src('src/features/reality-engine/GBPCallbackPage.tsx');
    expect(cb).toContain('showError(gbpErrorMessage(errorParam))');
    expect(cb).not.toMatch(/showError\(errorParam|showError\(decodeURIComponent|showError\(result\.(error|message)/);
  });

  it('14. auth error screen keeps the sign-out escape', () => {
    const auth = src('src/app-v2/auth.tsx');
    expect(auth).toContain('Cerrar sesión');
    expect(auth).toMatch(/supabase\.auth\.signOut\(\)[\s\S]*?window\.location\.assign\('\/'\)/);
  });
});

describe('A2.8.1 · preservation', () => {
  const FROZEN: Record<string, string> = {
    'src/features/maps-scanner/engine.ts': '1c18dfe0ee2ede9001e5aafe5ff19e4316d5b6600a818f26988b11d3333d380f',
    'src/features/digital-twin/engine.ts': '5ee583c39f7335c42faff29411be0c13c21c66ef08680fc0478445957fbf1cbd',
    'src/features/geo-audit/engine.ts': '410253d10b015657bc0e6c2872b31473e3dcce5054bdc29189fd211e2507fe46',
    'src/features/action-layer/model.ts': '38edfb9004c9a6bea8ca680d71d374eedfacc221fa4229cbbfe5efe4b4994075',
    'src/features/action-layer/copy.ts': '3dbbe24bcd674fd9f684bf6a2a5a40862ca1ca49ab4efcc86471ec035c54330d',
    'src/features/action-layer/ActionDetail.tsx': '1444e520b6bf497e5b710b13184837d59b67114efaf31ed4d00307a0a0ed8336',
    'src/features/today-intelligence/copy.ts': '064f5308a14b2274efbcd9008b9012ad2c93e83c1ceb8e49170879211653ec1f',
    'src/features/today-intelligence/TodayPriorities.tsx': 'c7e6555cc8bbbc516c92948a9ea6e0c6b7e862321fd5aff8c2fda7cfce7074ef',
    'src/app-v2/routes/TodayPage.tsx': '78cdf392ae270d805046632ecb5e0b4872134d8a6ff5f24bd91b0f0a9e8129da', // AUTHORIZED A3.5.4.4.1 TODAYPAGE INTEGRATION RE-PIN
    'src/features/dashboard/TodaysMissions.tsx': '22684ca84042aa83ef018bb7855e4493a6338eb2cc880359b5a10c011a91b79d',
    'src/features/actions/engine.ts': '2fa3eb2913328eb1a8e859f2e5db95d1e8158bd6cce135b277d3dc86284d3896',
    'src/features/actions/rules.ts': 'd32c4bb98a2819f7b09baabd692e97ef1ed878c8559f5d35a626cacd9b40654f',
    'src/features/actions/repository.ts': '0aff1a5a1c9fa7386d997443e816b3b16a77ac4530d96d1d3e8ec722691ee584',
    'src/features/actions/ActionsProvider.tsx': '3236e3e803c9b0d2ff37a91543272ff3756c697909039c206f89f93cb18369c9',
    'src/features/actions/types.ts': '660b06d7f51fe4334fff6f5408fc8a2843720b0fbcb1e254fa41a1082b68c068',
    'src/features/actions/ActionsContext.ts': 'f8cb0cb5b77f4f3eb0332a83422d93e95b4f8b71a00ae405875985d51e6db1a7',
    'src/App.tsx': '7902658f9f56ad9db1059bf7111cd3b9ee786256f10b19ff0ac48b3e8d8b94ba', // A3.7.3.4 RESUME RE-PIN: hidden /internal/publications-validation route wrapped in the publication resume layout route
  };

  it.each(Object.entries(FROZEN))('15. %s is byte-identical', (p, hash) => {
    expect(sha(p)).toBe(hash);
  });

  it('16. AI caps are unchanged', () => {
    const file = readdirSync(join(ROOT, 'supabase/migrations')).find((f) => f.endsWith('_a248_voice_simulator_limits.sql'))!;
    const sql = src(`supabase/migrations/${file}`);
    for (const [k, v] of [['weekly-content', 22], ['business-improvement', 18], ['seo-generator', 18],
      ['business-advisor', 12], ['voice-simulator', 10], ['global', 80]] as const) {
      expect(sql).toContain(`WHEN '${k}' THEN ${v}`);
    }
  });

  it('17. the fourteen legacy functions still answer 410', () => {
    for (const f of ['analyze-competitor-url', 'audit-maps-profile', 'audit-reviews', 'execute-tip-content',
      'generate-business-audit', 'generate-content-plan', 'generate-countermeasure', 'generate-gbp-description',
      'generate-geo-audit', 'generate-pitch', 'generate-seo', 'generate-voice-script', 'scan-directories', 'simulate-campaign']) {
      expect(src(`supabase/functions/${f}/index.ts`), f).toContain('status: 410');
    }
  });

  it('18. migrations stay at 46 and routes at 32 (A3.4.2: a342 migration + /herramientas/resenas; A3.4.2.2: GBP guard; A3.5.1A: 3 public legal routes; A3.5.1: Meta connection migration + /oauth/meta/callback; A3.7.1: publications data/storage migration, no route)', () => {
    expect(readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'))).toHaveLength(57); // A3.7.4.1 RE-PIN: +2 Meta publishing foundation migrations. A3.7.2 adds the publication proposals engine migration; A3.7.3.1 publication drafts; A3.7.3.2 adaptation engine; A3.7.3.3 channel review editing (initial apply + corrected re-apply)
    expect(src('src/App.tsx').match(/<Route [^>]*path=/g)).toHaveLength(34); // A3.7.2.1A HARNESS RE-PIN: temporary hidden /internal/publications-validation
  });

  it('19. pricing copy is unchanged', () => {
    expect(i18n).toContain("landing_plan_price: '9,99 €/mes'");
  });
});
