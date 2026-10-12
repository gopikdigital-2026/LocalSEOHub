import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolvePersonalName, dayPartFor } from '../personalName';

const src = (p: string) => readFileSync(resolve(__dirname, '../../../../', p), 'utf8');

const googleMetadata = {
  name: 'ManuelJ.Pérez',
  full_name: 'ManuelJ.Pérez',
  email: 'mjpmontes1969@gmail.com',
  avatar_url: 'https://example.com/a.png',
};

describe('resolvePersonalName', () => {
  it('personal name + registered business: shows the person, never the business', () => {
    expect(resolvePersonalName({
      profileFullName: null,
      userMetadata: googleMetadata,
      email: 'mjpmontes1969@gmail.com',
      businessNames: ['Gopik.Digital'],
    })).toBe('ManuelJ.Pérez');
  });

  it('personal name without business', () => {
    expect(resolvePersonalName({
      profileFullName: 'Laura Gómez',
      userMetadata: {},
      email: 'laura@x.com',
      businessNames: [undefined],
    })).toBe('Laura Gómez');
  });

  it('profile name takes priority over auth metadata', () => {
    expect(resolvePersonalName({
      profileFullName: '  Manuel  Pérez ',
      userMetadata: googleMetadata,
    })).toBe('Manuel Pérez');
  });

  it('metadata full_name takes priority over name', () => {
    expect(resolvePersonalName({ userMetadata: { full_name: 'Ana Ruiz', name: 'ana' } })).toBe('Ana Ruiz');
  });

  it('user without personal name (email+password signup): null, never derived from email', () => {
    expect(resolvePersonalName({
      profileFullName: null,
      userMetadata: { email_verified: true },
      email: 'pepe.lopez@gmail.com',
      businessNames: ['Bar Pepe'],
    })).toBeNull();
  });

  it('rejects emails, email local-parts, empty values and non-strings', () => {
    const email = 'pepe.lopez@gmail.com';
    expect(resolvePersonalName({ profileFullName: email, email })).toBeNull();
    expect(resolvePersonalName({ userMetadata: { name: 'pepe.lopez' }, email })).toBeNull();
    expect(resolvePersonalName({ profileFullName: '   ', userMetadata: { name: 42 } })).toBeNull();
    expect(resolvePersonalName({ userMetadata: { name: 'otro@correo.com' } })).toBeNull();
  });

  it('rejects a name equal to the business name (case/space insensitive) and falls through', () => {
    expect(resolvePersonalName({
      profileFullName: 'gopik.digital ',
      userMetadata: { name: 'Manuel' },
      businessNames: ['Gopik.Digital'],
    })).toBe('Manuel');
    expect(resolvePersonalName({
      userMetadata: { name: 'Gopik.Digital' },
      businessNames: ['Gopik.Digital'],
    })).toBeNull();
  });
});

describe('dayPartFor', () => {
  it('maps hours to greeting periods', () => {
    expect(dayPartFor(3)).toBe('evening');
    expect(dayPartFor(7)).toBe('morning');
    expect(dayPartFor(12)).toBe('morning');
    expect(dayPartFor(13)).toBe('afternoon');
    expect(dayPartFor(19)).toBe('afternoon');
    expect(dayPartFor(20)).toBe('evening');
  });
});

describe('ES/EN copy', () => {
  it('has neutral fallbacks and greetings in both languages', () => {
    const i18n = src('src/lib/i18n.tsx');
    expect(i18n).toContain("identity_welcome: 'te damos la bienvenida', identity_account_fallback: 'Mi cuenta'");
    expect(i18n).toContain("identity_welcome: 'welcome', identity_account_fallback: 'My account'");
    expect(i18n).toContain("mc_greeting_morning: 'Buenos días'");
    expect(i18n).toContain("mc_greeting_afternoon: 'Good afternoon'");
  });
});

describe('wiring: greeting and menu share one source', () => {
  const header = src('src/features/dashboard/DashboardHeader.tsx');
  const shell = src('src/app-v2/layouts/AppShellV2.tsx');
  const identity = src('src/features/user-identity/UserIdentity.tsx');
  const today = src('src/app-v2/routes/TodayPage.tsx');
  const hook = src('src/features/user-identity/usePersonalName.ts');

  it('dashboard greeting uses the shared hook and no business name', () => {
    expect(header).toMatch(/usePersonalName\(\)/);
    expect(header).not.toMatch(/businessName/);
    expect(header).not.toMatch(/'Buenas tardes'|'Buenos dias'/);
    expect(header).toMatch(/lang === 'en' \? 'en-US' : 'es-ES'/);
    expect(today).toMatch(/<DashboardHeader \/>/);
  });

  it('sidebar and mobile menu use the same hook, with no email-prefix fallback', () => {
    expect(identity).toMatch(/usePersonalName\(\)/);
    expect(shell.match(/<UserIdentity/g)?.length).toBe(2);
    expect(shell).not.toMatch(/split\('@'\)/);
    expect(shell).not.toMatch(/user_metadata/);
  });

  it('hook only reads the own profile and never writes', () => {
    expect(hook).toMatch(/\.from\('profiles'\)\s*\.select\('full_name'\)\s*\.eq\('id', userId\)\s*\.maybeSingle\(\)/);
    expect(hook).not.toMatch(/\.(update|upsert|insert|delete)\(/);
  });
});
