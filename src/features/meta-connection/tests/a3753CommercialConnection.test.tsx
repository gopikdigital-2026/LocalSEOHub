// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MetaConnectionRow } from '../metaStatus';

const repo = vi.hoisted(() => ({
  row: null as MetaConnectionRow | null,
  access: 'denied' as 'allowed' | 'denied',
  disconnect: vi.fn(async () => ({ ok: true })),
  select: vi.fn(async () => ({ ok: true })),
  start: vi.fn(async () => ({ ok: true })),
}));

vi.mock('../metaRepository', () => ({
  loadMetaConnection: vi.fn(async () => repo.row),
  recoverMetaConnection: vi.fn(async () => ({ ok: true })),
  cancelMetaConnection: vi.fn(async () => ({ ok: true })),
  startMetaConnection: repo.start,
  selectMetaPage: repo.select,
  disconnectMeta: repo.disconnect,
}));
vi.mock('../../internal-access/repository', () => ({ checkInternalAccess: vi.fn(async () => repo.access) }));
vi.mock('../MetaSyncStatus', () => ({ MetaSyncStatus: () => null }));
vi.mock('../../publishing-access/PublishingAccessControl', () => ({ PublishingAccessControl: () => <div data-testid="publishing">PUBLISHING STEP</div> }));

import { MetaConnectionCard } from '../MetaConnectionCard';
import { MetaPageSelectModal } from '../MetaPageSelectModal';
import { META_COPY, instagramTone, metaErrorMessage, metaView } from '../metaStatus';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base: MetaConnectionRow = {
  status: 'disconnected', page_id: null, page_name: null, instagram_status: null, instagram_username: null,
  available_pages: [], last_error: null, attempt_started_at: null, connected_at: null,
};
const connected = (ig: MetaConnectionRow['instagram_status'], username: string | null = null): MetaConnectionRow => ({
  ...base, status: 'connected', page_id: '111', page_name: 'Panadería Sol', instagram_status: ig, instagram_username: username, connected_at: '2026-01-01T00:00:00Z',
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function render(node: React.ReactNode) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<MemoryRouter>{node}</MemoryRouter>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return host;
}

beforeEach(() => { repo.row = null; repo.access = 'denied'; });
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null; host = null;
  vi.clearAllMocks();
});

describe('A3.7.5.3 customer Meta connection card', () => {
  for (const lang of ['es', 'en'] as const) {
    it(`explains the requested permissions before connecting (${lang})`, async () => {
      const el = await render(<MetaConnectionCard businessId="biz-1" lang={lang} />);
      const t = META_COPY[lang];
      expect(el.textContent).toContain(t.connect);
      expect(el.textContent).toContain(t.permissionsTitle);
      for (const p of t.permissions) expect(el.querySelector('details')?.textContent).toContain(p);
      expect(el.textContent).toContain(t.permissionsNote);
      expect(el.textContent).toContain(t.requirements);
    });
  }

  it('the four permission lines match the four requested scopes', () => {
    const scopes = read('supabase/functions/meta-oauth-start/handler.ts').match(/META_SCOPES\s*=\s*\[([^\]]*)\]/)?.[1] ?? '';
    expect(scopes.split(',').filter((s) => s.trim()).length).toBe(META_COPY.es.permissions.length);
    expect(META_COPY.en.permissions.length).toBe(META_COPY.es.permissions.length);
    expect(scopes).not.toMatch(/pages_manage_posts|instagram_content_publish/);
  });

  it('shows Facebook and Instagram status separately when IG is connected', async () => {
    repo.row = connected('connected', 'panaderia_sol');
    const el = await render(<MetaConnectionCard businessId="biz-1" lang="es" />);
    const rows = el.querySelectorAll('dl > div');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Panadería Sol');
    expect(rows[0].textContent).toContain(META_COPY.es.statusActive);
    expect(rows[1].textContent).toContain('@panaderia_sol');
    expect(rows[1].textContent).toContain(META_COPY.es.statusActive);
  });

  it('a Facebook Page without Instagram is still connected, with IG marked unavailable', async () => {
    repo.row = connected('not_associated');
    const el = await render(<MetaConnectionCard businessId="biz-1" lang="en" />);
    const rows = el.querySelectorAll('dl > div');
    expect(rows[0].textContent).toContain(META_COPY.en.statusActive);
    expect(rows[1].textContent).toContain(META_COPY.en.noProfessional);
    expect(rows[1].textContent).toContain(META_COPY.en.statusUnavailable);
    expect(el.textContent).toContain(META_COPY.en.badge.connected);
  });

  it('classifies every Instagram outcome', () => {
    expect(instagramTone('connected')).toBe('active');
    expect(instagramTone('not_associated')).toBe('unavailable');
    expect(instagramTone('unsupported')).toBe('unavailable');
    expect(instagramTone('permission_unavailable')).toBe('attention');
    expect(instagramTone('api_error')).toBe('attention');
  });

  it('ordinary customers never see the publishing permission step', async () => {
    repo.row = connected('connected', 'panaderia_sol');
    const el = await render(<MetaConnectionCard businessId="biz-1" lang="es" />);
    expect(el.textContent).not.toContain('PUBLISHING STEP');
  });

  it('only verified operators see the publishing permission step', async () => {
    repo.row = connected('connected', 'panaderia_sol');
    repo.access = 'allowed';
    const el = await render(<MetaConnectionCard businessId="biz-1" lang="es" />);
    expect(el.textContent).toContain('PUBLISHING STEP');
  });

  it('an expired session asks to reconnect and explains permissions again', async () => {
    repo.row = { ...base, status: 'reauth_required', page_id: '111', page_name: 'Panadería Sol' };
    const el = await render(<MetaConnectionCard businessId="biz-1" lang="en" />);
    expect(el.textContent).toContain(META_COPY.en.reauth);
    expect(el.textContent).toContain(META_COPY.en.reconnect);
    expect(el.textContent).toContain(META_COPY.en.permissionsTitle);
  });

  it('multiple Pages require choosing one', async () => {
    repo.row = { ...base, status: 'page_selection_required', available_pages: [{ id: '1', name: 'A' }, { id: '2', name: 'B' }] };
    const el = await render(<MetaConnectionCard businessId="biz-1" lang="es" />);
    expect(el.textContent).toContain(META_COPY.es.selectPage);
    expect(el.textContent).toContain(META_COPY.es.choose);
  });

  it('no eligible Pages yields a clear error and a retry', () => {
    expect(metaView({ ...base, status: 'page_selection_required', available_pages: [] })).toEqual({ kind: 'error', errorCode: 'NO_AUTHORIZED_PAGES' });
    expect(metaErrorMessage('NO_AUTHORIZED_PAGES', 'es')).not.toBe(metaErrorMessage('UNKNOWN_ERROR', 'es'));
    expect(metaErrorMessage('NO_AUTHORIZED_PAGES', 'en')).not.toBe(metaErrorMessage('NO_AUTHORIZED_PAGES', 'es'));
  });

  it('disconnect asks for confirmation and does nothing when declined', async () => {
    repo.row = connected('connected', 'panaderia_sol');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const el = await render(<MetaConnectionCard businessId="biz-1" lang="es" />);
    const btn = el.querySelector<HTMLButtonElement>(`button[aria-label="${META_COPY.es.disconnect}"]`)!;
    await act(async () => { btn.click(); });
    expect(confirm).toHaveBeenCalledWith(META_COPY.es.confirmDisconnect);
    expect(repo.disconnect).not.toHaveBeenCalled();
  });

  it('disconnect proceeds when confirmed', async () => {
    repo.row = connected('connected', 'panaderia_sol');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const el = await render(<MetaConnectionCard businessId="biz-1" lang="en" />);
    const btn = el.querySelector<HTMLButtonElement>(`button[aria-label="${META_COPY.en.disconnect}"]`)!;
    await act(async () => { btn.click(); });
    expect(repo.disconnect).toHaveBeenCalledTimes(1);
  });

  it('the card wraps its buttons for narrow screens and exposes a busy state', () => {
    const card = read('src/features/meta-connection/MetaConnectionCard.tsx');
    expect(card).toContain('flex flex-wrap items-center gap-2');
    expect(card).toContain('aria-busy={loading || busy}');
  });
});

describe('A3.7.5.3 Page selection dialog', () => {
  const pages = [{ id: '1', name: 'Uno' }, { id: '2', name: 'Dos' }];

  it('moves focus into the dialog and closes on Escape', async () => {
    const onClose = vi.fn();
    const el = await render(<MetaPageSelectModal pages={pages} lang="es" onConfirm={vi.fn(async () => {})} onClose={onClose} />);
    expect(el.querySelector('[role="dialog"]')?.contains(document.activeElement)).toBe(true);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('A3.7.5.3 customer copy and navigation', () => {
  it('every customer copy key exists in both languages', () => {
    expect(Object.keys(META_COPY.en).sort()).toEqual(Object.keys(META_COPY.es).sort());
  });

  it('customer copy carries no internal or technical terminology', () => {
    const text = JSON.stringify(META_COPY);
    expect(text).not.toMatch(/internal|interno|operator|operador|scope|OAuth|token|graph|pages_|instagram_basic|business_management|validation|staging/i);
  });

  it('the callback back button uses the shared ES/EN copy', () => {
    const page = read('src/features/meta-connection/MetaCallbackPage.tsx');
    expect(page).toContain('META_COPY[l].backToSources');
    expect(page).not.toContain("'Back to sources'");
  });

  it('the customer connection flow never links to internal routes', () => {
    for (const f of ['MetaConnectionCard.tsx', 'MetaPageSelectModal.tsx', 'MetaCallbackPage.tsx', 'metaStatus.ts']) {
      expect(read(`src/features/meta-connection/${f}`)).not.toMatch(/\/internal\//);
    }
  });

  it('the Meta card lives on the customer sources page, outside the internal guard', () => {
    const app = read('src/App.tsx');
    const customer = app.slice(app.indexOf('<Route element={<AppGuard><AppShellV2 /></AppGuard>}>'), app.indexOf('<InternalGuard>'));
    expect(customer).toContain('path="/fuentes"');
    expect(read('src/features/reality-engine/SourceManager.tsx')).toContain('<MetaConnectionCard businessId={businessId} lang={lang} />');
  });
});
