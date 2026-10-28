import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const invoke = vi.fn();
vi.mock('../../../lib/supabase', () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } } }));

import { createActivation, publishingAccessView, type ActivationState } from '../model';
import { PUBLISHING_ACCESS_COPY, publishingAccessError } from '../copy';
import { startPublishingAccess } from '../../meta-connection/metaPublishingRepository';

const ROOT = join(__dirname, '../../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const CONTROL = read('src/features/publishing-access/PublishingAccessControl.tsx');
const MODEL = read('src/features/publishing-access/model.ts');
const CARD = read('src/features/meta-connection/MetaConnectionCard.tsx');
const UI = [CONTROL, MODEL, read('src/features/publishing-access/copy.ts')].join('\n');
const META_URL = 'https://www.facebook.com/v25.0/dialog/oauth?client_id=1&state=abc';
const BINDING = 'a'.repeat(64);

const ready = { ok: true as const, facebook_publish_ready: true, instagram_publish_ready: false };
const missing = { ok: true as const, facebook_publish_ready: false, instagram_publish_ready: false };

function harness(start: () => Promise<{ ok: true; url: string } | { ok: false; code: string }>) {
  const navigate = vi.fn();
  const states: ActivationState[] = [];
  const activation = createActivation({ start, navigate, onChange: (s) => states.push(s) });
  return { activation, navigate, states };
}

describe('A3.7.4.2 B.1 FIX01 · visibility', () => {
  it('connected + publishing missing shows the activation action', () => {
    expect(publishingAccessView(true, missing)).toBe('needs_activation');
    expect(CONTROL).toMatch(/view === 'needs_activation' && \([\s\S]*?activation\.activate\(\)[\s\S]*?t\.activate/);
  });
  it('connected + publishing ready does not ask for activation', () => {
    expect(publishingAccessView(true, ready)).toBe('ready');
    expect(CONTROL.match(/t\.activate\b/g)).toHaveLength(1);
  });
  it('disconnected hides the action, and the card only mounts it on the connected view', () => {
    expect(publishingAccessView(false, missing)).toBe('hidden');
    expect(publishingAccessView(false, ready)).toBe('hidden');
    expect(CARD).toMatch(/view\.kind === 'connected'\) \{[\s\S]*?<PublishingAccessControl lang=\{lang\} returned=\{publishingReturn\} \/>[\s\S]*?\} else if \(view\.kind === 'reauth'\)/);
    expect(CARD.match(/<PublishingAccessControl/g)).toHaveLength(1);
  });
  it('a capability load error never claims publishing is enabled', () => {
    expect(publishingAccessView(true, { ok: false, code: 'INTERNAL_ERROR' })).toBe('unavailable');
    expect(publishingAccessView(true, null)).toBe('checking');
    expect(CONTROL).toMatch(/view === 'unavailable' && \([\s\S]*?t\.unavailable[\s\S]*?load\(\)/);
    expect(CONTROL).toMatch(/view === 'ready' && \(/);
  });
  it('a returned "enabled" is only shown as success when the server reports readiness', () => {
    expect(CONTROL).toMatch(/returned === 'enabled'\s*\? \(view === 'ready' \? t\.returnedEnabled : view === 'needs_activation' \? t\.returnedIncomplete : null\)/);
  });
  it('the existing connection actions are preserved', () => {
    for (const k of ['t.connect', 't.reconnect', 't.choose', 't.disconnect', 't.cancelConnection', 't.retryConnection']) expect(CARD).toContain(k);
  });
});

describe('A3.7.4.2 B.1 FIX01 · action', () => {
  it('one explicit click makes one call and navigates to the returned URL', async () => {
    const start = vi.fn().mockResolvedValue({ ok: true, url: META_URL });
    const h = harness(start);
    await h.activation.activate();
    expect(start).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledWith(META_URL);
    expect(h.states).toEqual([{ busy: true, error: null }]);
  });
  it('a double click while loading makes one call', async () => {
    let resolve!: (v: { ok: true; url: string }) => void;
    const start = vi.fn(() => new Promise<{ ok: true; url: string }>((r) => { resolve = r; }));
    const h = harness(start);
    const first = h.activation.activate();
    await h.activation.activate();
    await h.activation.activate();
    resolve({ ok: true, url: META_URL });
    await first;
    expect(start).toHaveBeenCalledTimes(1);
    expect(h.navigate).toHaveBeenCalledTimes(1);
  });
  it('failure does not navigate, restores the button and exposes a safe code', async () => {
    const start = vi.fn().mockResolvedValue({ ok: false, code: 'CHANNEL_NOT_CONNECTED' });
    const h = harness(start);
    await h.activation.activate();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.states[h.states.length - 1]).toEqual({ busy: false, error: 'CHANNEL_NOT_CONNECTED' });
    await h.activation.activate();
    expect(start).toHaveBeenCalledTimes(2);
  });
  it('a thrown request is normalised and does not navigate', async () => {
    const h = harness(vi.fn().mockRejectedValue(new Error('network')));
    await h.activation.activate();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(h.states[h.states.length - 1]).toEqual({ busy: false, error: 'INTERNAL_ERROR' });
  });
  it('error messages are user-safe and unknown codes fall back', () => {
    for (const lang of ['es', 'en'] as const) {
      expect(publishingAccessError('NOT_A_CODE', lang)).toBe(publishingAccessError('UNKNOWN_ERROR', lang));
      expect(publishingAccessError('PUBLISHING_CONSENT_DECLINED', lang)).not.toBe(publishingAccessError('UNKNOWN_ERROR', lang));
      expect(publishingAccessError('<script>', lang)).not.toContain('<');
    }
  });
  it('a back-navigation restore re-enables the button', async () => {
    const h = harness(vi.fn().mockResolvedValue({ ok: true, url: META_URL }));
    await h.activation.activate();
    h.activation.reset();
    await h.activation.activate();
    expect(h.navigate).toHaveBeenCalledTimes(2);
    expect(CONTROL).toContain('if (e.persisted) activation.reset()');
  });
});

describe('A3.7.4.2 B.1 FIX01 · reuses the existing server-authoritative flow', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    invoke.mockReset();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('the control calls only startPublishingAccess / loadPublishingCapabilities', () => {
    expect(CONTROL).toContain('start: startPublishingAccess');
    expect(CONTROL).toContain('loadPublishingCapabilities()');
    expect(CONTROL).toContain('navigate: (url) => window.location.assign(url)');
    expect(UI).not.toMatch(/functions\.invoke|enable_publishing_start|dialog\/oauth|scope|pages_manage_posts|graph\.facebook/i);
  });
  it('startPublishingAccess returns the validated Meta URL and keeps the binding in sessionStorage only', async () => {
    invoke.mockResolvedValue({ data: { ok: true, url: META_URL, binding: BINDING }, error: null });
    expect(await startPublishingAccess()).toEqual({ ok: true, url: META_URL });
    expect(invoke).toHaveBeenCalledWith('meta-publishing', { body: { action: 'enable_publishing_start' } });
    expect(store.get('lsh_meta_publishing_binding')).toBe(BINDING);
  });
  it('a non-Meta URL is rejected before it can reach navigation', async () => {
    invoke.mockResolvedValue({ data: { ok: true, url: 'https://evil.example/oauth', binding: BINDING }, error: null });
    const result = await startPublishingAccess();
    expect(result.ok).toBe(false);
    const h = harness(async () => result);
    await h.activation.activate();
    expect(h.navigate).not.toHaveBeenCalled();
    expect(store.size).toBe(0);
  });
});

describe('A3.7.4.2 B.1 FIX01 · security and honesty', () => {
  it('handles no tokens, secrets, proofs or codes', () => {
    expect(UI + CARD).not.toMatch(/access_token|page_token|pageToken|META_APP_SECRET|appsecret_proof|appSecret|authorization code|\bcode=/i);
    expect(UI).not.toMatch(/console\.|localStorage/);
  });
  it('copy describes a permission, never a post action, and promises nothing is posted', () => {
    for (const lang of ['es', 'en'] as const) {
      const c = PUBLISHING_ACCESS_COPY[lang];
      expect(c.activate).not.toMatch(/^(Publicar|Publish now|Post|Create post)$/i);
      expect(c.explain).toMatch(/No se publicará nada|Nothing will be posted/);
    }
    expect(PUBLISHING_ACCESS_COPY.es.activate).toBe('Activar publicaciones');
    expect(PUBLISHING_ACCESS_COPY.en.activate).toBe('Enable publishing');
  });
  it('never disconnects or reconnects the read connection', () => {
    expect(UI).not.toMatch(/disconnectMeta|startMetaConnection|cancelMetaConnection|metaRepository/);
  });
  it('does not touch the real-publish gate or the publish action', () => {
    expect(UI).not.toMatch(/META_FACEBOOK_REAL_PUBLISH|facebook_publish\b|facebook-publish/);
  });
});
