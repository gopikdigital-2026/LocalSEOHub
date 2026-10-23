import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const sha = (p: string) => createHash('sha256').update(readFileSync(join(ROOT, p))).digest('hex');
const landing = src('src/components/LandingPage.tsx');
const i18n = src('src/lib/i18n.tsx');

describe('A2.8.1 closure · approved hero and CTA', () => {
  it('hero title and subtitle are the approved copy', () => {
    expect(i18n).toContain("hero_value_title_before: 'Descubre qué puede mejorar hoy ',");
    expect(i18n).toContain("hero_value_title_highlight: 'tu negocio',");
    expect(i18n).toContain("hero_value_subtitle: 'LocalSEOHub analiza tu presencia digital, tus competidores y la información de tu negocio para decirte qué mejorar y qué hacer a continuación.',");
    expect(landing).toContain("{t('hero_value_title_before')}");
    expect(landing).toContain("{t('hero_value_subtitle')}");
  });

  it('primary CTA remains', () => {
    expect(landing.match(/Configurar mi negocio gratis/g)?.length).toBeGreaterThanOrEqual(1);
  });

  it('no customer logo strip, counter or case study was introduced', () => {
    expect(landing).not.toMatch(/case stud|caso de éxito|casos de éxito|clientes satisfechos|negocios confían|customerLogos|logos de clientes/i);
  });
});

describe('A2.8.1 closure · auth and billing untouched', () => {
  const LOCKED: Record<string, string> = {
    'src/components/LoginModal.tsx': '06e4e58169a5cee7d7557437ac1e736541075b1aa3f6083e7706a0e46fb9dac6',
    'src/features/email-verification/signup.ts': 'ec949d3e2a8df4a8060636eaf270c5a8ffd645c3b53a85ff8a61915e82e936d9',
    'src/features/email-verification/verification.ts': 'abd8851ea58ba24bd90fc7c67288d59ba296774c51ba89f220b2b92091326df1',
    'src/features/email-verification/VerifyEmailPanel.tsx': 'ca59976bdadb98db53ccf971a2ab7a2b850da8a06aba3f8a1133837c059489fb',
    'src/features/password-reset/recovery.ts': 'ec64fb6e49740a783e3a45e010e6dba6fe9f937941f0f78febe7b66368d3ad5d',
    'src/features/password-reset/ResetPasswordPage.tsx': 'efd59b68ff9122eba513d7cd46cee6b86401376a4c4af4ad42c6ad87503389fa',
    'src/features/password-reset/ForgotPasswordForm.tsx': 'e79ffb58b257eda60bc11638db76468e46f6f4bf18bb577828950ded6e5586cf',
    'src/app-v2/auth.tsx': 'f29ce77711b1f1b336660e86f973622dcf94c33111213d64c44cd6f93eeaa88d',
    'src/app-v2/returnTo.ts': '04fa9767cf923c5681157ea6cff91fa932ae243dcb4d14417fa6c8ee580d3029',
    'src/hooks/useAuth.ts': '83f4bb09ff2f0d6e946acbaaf40c6cc3e7ad2ede428a7104cab879432bdd4a79',
    'supabase/functions/signup-instant/index.ts': 'c0190a574b4ea40a2da0aaff4ed17352c16334cddd433ab7907d506739d2e78b',
    'supabase/functions/stripe-billing/handler.ts': 'ee146827c8807dc73bfa815ab0eaed0e7e152ff102aacab6009e5ba0d1964889',
    'supabase/functions/stripe-billing/logic.ts': '5c4aacd4b7434e69d50fdffdc55bd942b3bf510a1ef4b07ae6d035e2541b227d',
    'supabase/functions/stripe-billing/index.ts': 'dafb108ae7988ed0a2fcd00ea1ad7f50aa31415829a0c32c3341dad41001c2ed',
    'supabase/functions/stripe-webhook/handler.ts': '942cfbf83aef8524d35d692c49210f357cf86ac5b171bf177c1dbfc5ccdbd1ee',
    'supabase/functions/stripe-webhook/logic.ts': 'fbf86fce0e91b8cbee1591f070de1cd2eb8590f0376b42a8bf78e3b362a4c508',
    'supabase/functions/stripe-webhook/index.ts': '484c39f7e3fa4b5a60a32bb0af1a40d37d5a8ac6ad86d396376c5b1ed74f2ffb',
    'src/features/billing/model.ts': 'c069500da049bd7c0fbec016b76c7681952e06f8569a0d829c8733492aa90344',
    'src/features/billing/repository.ts': 'c243e48afb4e95d7daa62bfc261f21da50c0a50910984b19fb68056ec1cf5a78',
    'src/features/billing/BillingProvider.tsx': '6fb95d54d9f8d55b10a9427e0408fe9ed5e17a052ed138cd3e6bf17c5954030e',
  };

  it.each(Object.entries(LOCKED))('%s is byte-identical to the F-03 validated state', (p, hash) => {
    expect(sha(p)).toBe(hash);
  });
});
