// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PUB = 'b140fc59-6458-47d7-b695-df8781610ea5';
const BIZ = 'e6014022-370f-4ec0-a340-c7c55f808247';
const GEN = '6d624a5b-44b2-4a82-b38b-35c99ae140c5';
const PAGE = '1393994523793266';
const OLD = 'En Gopik.Digital estamos aquí para ayudarte.';
const NEW = 'En LocalSEOHub.io estamos aquí para ayudarte a mejorar tu presencia online.';
const IG = 'Instagram generado';

interface Row {
  version: number; updated_at: string;
  facebook_generated: string; instagram_generated: string; facebook_text: string; instagram_text: string;
}

const server = vi.hoisted(() => ({
  row: null as unknown as Row,
  clock: 0,
  reads: 0,
  saves: [] as Record<string, unknown>[],
  invokes: [] as Record<string, unknown>[],
}));

vi.mock('../../../lib/supabase', () => {
  const full = () => ({ publication_id: PUB, source_generation_id: GEN, ...server.row });
  const supabase = {
    from: (table: string) => {
      if (table !== 'publication_drafts') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({ maybeSingle: () => { server.reads++; return Promise.resolve({ data: full(), error: null }); } }),
          in: () => Promise.resolve({ data: [full()], error: null }),
        }),
      };
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      server.saves.push({ name, ...args });
      if (args.p_expected_version !== server.row.version) return Promise.resolve({ data: { result: 'stale_draft' }, error: null });
      const r = server.row;
      const facebook = args.p_restore_facebook ? r.facebook_generated : (args.p_facebook as string | null) ?? r.facebook_text;
      const instagram = args.p_restore_instagram ? r.instagram_generated : (args.p_instagram as string | null) ?? r.instagram_text;
      server.clock++;
      server.row = { ...r, facebook_text: facebook, instagram_text: instagram, version: r.version + 1, updated_at: `2026-10-30T00:18:0${server.clock}.000000+00:00` };
      const { version, updated_at, facebook_generated, instagram_generated, facebook_text, instagram_text } = server.row;
      return Promise.resolve({ data: { result: 'saved', draft: { version, updated_at, facebook_generated, instagram_generated, facebook_text, instagram_text } }, error: null });
    },
    functions: {
      invoke: (_fn: string, { body }: { body: Record<string, unknown> }) => {
        server.invokes.push(body);
        if (body.action !== 'facebook_publish_status') return Promise.resolve({ data: { ok: false, code: 'REAL_PUBLISH_DISABLED' }, error: null });
        const current = body.expectedVersion === server.row.version;
        return Promise.resolve({
          data: {
            ok: true, armed: false,
            facebook: { state: 'NOT_REQUESTED', can_publish: current, issue: current ? null : 'VERSION_CONFLICT', last_attempt: null },
            page: { id: PAGE, name: 'Localseohub.io' },
            permissions: { pages_show_list: true, pages_read_engagement: true, pages_manage_posts: true },
            create_content: true,
            caption: server.row.facebook_text,
            version: server.row.version,
          },
          error: null,
        });
      },
    },
    storage: { from: () => ({ download: () => Promise.resolve({ data: null, error: { message: 'offline' } }) }) },
  };
  return { supabase };
});

vi.mock('../../business-memory/BusinessContext', () => {
  const value = { currentBusiness: { id: BIZ }, loading: false };
  return { useBusiness: () => value };
});

vi.mock('../../publications/repository', () => {
  const publication = {
    id: PUB, businessId: BIZ, status: 'proposals_ready', createdAt: '2026-10-30T00:12:00Z', updatedAt: '2026-10-30T00:13:08Z',
    image: { path: `u/${BIZ}/${PUB}/img.png`, mime: 'image/png', bytes: 2089456, width: 1086, height: 1448, uploadedAt: '2026-10-30T00:12:02Z' },
    generationsUsed: 1,
    proposals: { generationId: GEN, lang: 'es', generatedAt: '2026-10-30T00:13:08Z', generationsUsed: 1 },
  };
  return { getDraft: () => Promise.resolve(publication), listDrafts: () => Promise.resolve([publication]) };
});

const { default: PublicationResumeProvider } = await import('../../publication-resume/PublicationResumeProvider');
const { default: ChannelReviewPanel } = await import('../../channel-review/ChannelReviewPanel');
const { default: FacebookPublishHarness } = await import('../FacebookPublishHarness');
const { usePublicationResume } = await import('../../publication-resume/context');

function ExternalRefresh() {
  const { refresh } = usePublicationResume();
  return <button type="button" data-testid="external-refresh" onClick={() => void refresh()}>refresh</button>;
}

let root: Root;
let host: HTMLDivElement;
let confirmSpy: ReturnType<typeof vi.spyOn>;

const settle = async () => { for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const fbPanel = () => host.querySelector('section[aria-label="facebook-publish"]') as HTMLElement;
const fbVersion = () => {
  const dt = [...fbPanel().querySelectorAll('dt')].find((d) => d.textContent === 'Versión del borrador');
  return dt?.nextElementSibling?.textContent ?? null;
};
const fbCaption = () => fbPanel().querySelector('pre')?.textContent ?? null;
const editor = (c: 'facebook' | 'instagram') => host.querySelector(`#review-${c}`) as HTMLTextAreaElement;
const editorVersion = () => {
  const dt = [...host.querySelectorAll('section[aria-label="channel-review"] dt')].find((d) => d.textContent === 'Versión');
  return dt?.nextElementSibling?.textContent ?? null;
};
const button = (scope: string, label: string) =>
  [...host.querySelectorAll(`section[aria-label="${scope}"] button`)].find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

async function type(el: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const click = async (b: HTMLElement) => { await act(async () => { b.click(); }); await settle(); };
const statusCalls = () => server.invokes.filter((b) => b.action === 'facebook_publish_status');

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  server.row = { version: 2, updated_at: '2026-10-30T00:17:00.000000+00:00', facebook_generated: OLD, instagram_generated: IG, facebook_text: OLD, instagram_text: IG };
  server.clock = 0;
  server.reads = 0;
  server.saves = [];
  server.invokes = [];
  confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/review?pub=${PUB}`]}>
        <Routes>
          <Route element={<PublicationResumeProvider />}>
            <Route path="/review" element={<><ChannelReviewPanel /><FacebookPublishHarness /><ExternalRefresh /></>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
  });
  await settle();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  confirmSpy.mockRestore();
});

describe('A3.7.4.2 GATE B.2 FIX03: the Facebook publish panel follows every saved draft', () => {
  it('A. the harness starts on draft version 2 with the OLD caption', () => {
    expect(fbVersion()).toBe('2');
    expect(fbCaption()).toBe(OLD);
    expect(editorVersion()).toBe('2');
    expect(statusCalls().map((b) => b.expectedVersion)).toEqual([2]);
  });

  it('B-F. after the editor saves version 3, the harness shows version 3 and the NEW caption, never v2/OLD', async () => {
    await type(editor('facebook'), NEW);
    await click(button('channel-review', 'Guardar'));

    expect(server.saves).toHaveLength(1);
    expect(server.saves[0]).toMatchObject({ p_publication_id: PUB, p_expected_version: 2, p_facebook: NEW, p_instagram: null });
    expect(server.row.version).toBe(3);
    expect(fbVersion()).toBe('3');
    expect(fbCaption()).toBe(NEW);
    expect(fbPanel().textContent).not.toContain(OLD);
    expect(statusCalls().map((b) => b.expectedVersion)).toEqual([2, 3]);
    expect(editorVersion()).toBe('3');
    expect(editor('facebook').value).toBe(NEW);
  });

  it('one save is one logical refresh: no loop, no repeated requests, no second save, no version bump from refreshing', async () => {
    await type(editor('facebook'), NEW);
    await click(button('channel-review', 'Guardar'));
    const reads = server.reads;
    const invokes = server.invokes.length;
    await settle();
    await settle();
    expect(server.reads).toBe(reads);
    expect(server.invokes.length).toBe(invokes);
    expect(server.reads).toBe(3);
    expect(statusCalls()).toHaveLength(2);
    expect(server.saves).toHaveLength(1);
    expect(server.row.version).toBe(3);
  });

  it('the editor stays stable: it keeps its saved confirmation and asks nothing', async () => {
    await type(editor('facebook'), NEW);
    await click(button('channel-review', 'Guardar'));
    const review = host.querySelector('section[aria-label="channel-review"]')!.textContent!;
    expect(review).toContain('Borradores guardados');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('a restore that bumps the version also refreshes the harness, and keeps unsaved text in the other channel', async () => {
    await type(editor('facebook'), NEW);
    await click(button('channel-review', 'Guardar'));
    await type(editor('instagram'), 'IG sin guardar');
    const restoreFacebook = [...host.querySelectorAll('section[aria-label="channel-review"] button')]
      .filter((b) => b.textContent?.includes('Restaurar'))[0] as HTMLButtonElement;
    await click(restoreFacebook);

    expect(server.saves).toHaveLength(2);
    expect(server.saves[1]).toMatchObject({ p_expected_version: 3, p_restore_facebook: true, p_restore_instagram: false });
    expect(server.row.version).toBe(4);
    expect(fbVersion()).toBe('4');
    expect(fbCaption()).toBe(OLD);
    expect(statusCalls().map((b) => b.expectedVersion)).toEqual([2, 3, 4]);
    expect(editor('instagram').value).toBe('IG sin guardar');
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('a failed save triggers no refresh and leaves the harness unchanged', async () => {
    server.row = { ...server.row, version: 9 };
    await type(editor('facebook'), NEW);
    await click(button('channel-review', 'Guardar'));
    expect(server.row.version).toBe(9);
    expect(statusCalls()).toHaveLength(1);
    expect(fbVersion()).toBe('2');
  });

  it('a later shared refresh for another reason still reloads the editor (the own-save guard is consumed)', async () => {
    await type(editor('facebook'), NEW);
    await click(button('channel-review', 'Guardar'));
    server.row = { ...server.row, version: 5, facebook_text: 'Texto cambiado en otro paso', updated_at: '2026-10-30T00:19:00.000000+00:00' };
    await click(host.querySelector('[data-testid="external-refresh"]') as HTMLElement);
    expect(editorVersion()).toBe('5');
    expect(editor('facebook').value).toBe('Texto cambiado en otro paso');
    expect(fbVersion()).toBe('5');
  });

  it('nothing is published: no publish action, no attempt, no Meta write', async () => {
    await type(editor('facebook'), NEW);
    await click(button('channel-review', 'Guardar'));
    expect(server.invokes.every((b) => b.action === 'facebook_publish_status')).toBe(true);
    expect(server.saves.every((s) => s.name === 'save_publication_channel_drafts')).toBe(true);
    expect(button('facebook-publish', 'Publicar en Facebook').disabled).toBe(true);
    expect(fbPanel().textContent).toContain('Publicación real desactivada en el servidor');
  });
});
