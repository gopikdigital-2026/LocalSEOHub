import { supabase } from '../../lib/supabase';

export type AttemptState = 'NOT_REQUESTED' | 'PUBLISHING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
const STATES: AttemptState[] = ['NOT_REQUESTED', 'PUBLISHING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'];
const PERMISSIONS = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'] as const;
const PERMALINK = /^https:\/\/(www\.|m\.)?facebook\.com\/[A-Za-z0-9._/-]*$/;

export interface FacebookStatus {
  armed: boolean;
  state: AttemptState;
  canPublish: boolean;
  issue: string | null;
  lastError: string | null;
  retryable: boolean;
  metaObjectId: string | null;
  permalink: string | null;
  pageId: string | null;
  pageName: string | null;
  permissions: Record<(typeof PERMISSIONS)[number], boolean>;
  createContent: boolean;
  caption: string | null;
  version: number | null;
}

export interface PublishResult {
  ok: boolean;
  code: string | null;
  state: AttemptState;
  permalink: string | null;
  metaObjectId: string | null;
}

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const stateOf = (v: unknown): AttemptState => (STATES.includes(v as AttemptState) ? (v as AttemptState) : 'NOT_REQUESTED');
const safeLink = (v: unknown) => (typeof v === 'string' && v.length <= 512 && PERMALINK.test(v) ? v : null);

async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.functions.invoke('meta-publishing', { body });
    if (error) {
      const ctx = (error as { context?: { json?: () => Promise<unknown> } }).context;
      const parsed = typeof ctx?.json === 'function' ? await ctx.json().catch(() => null) : null;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    }
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function getFacebookStatus(publicationId: string, expectedVersion: number): Promise<FacebookStatus | { error: string }> {
  const body = await invoke({ action: 'facebook_publish_status', publicationId, expectedVersion });
  const fb = body?.facebook as Record<string, unknown> | undefined;
  if (body?.ok !== true || !fb || typeof fb !== 'object') return { error: str(body?.code) ?? 'INTERNAL_ERROR' };
  const last = (fb.last_attempt ?? null) as Record<string, unknown> | null;
  const page = (body.page ?? {}) as Record<string, unknown>;
  const perms = (body.permissions ?? {}) as Record<string, unknown>;
  return {
    armed: body.armed === true,
    state: stateOf(fb.state),
    canPublish: fb.can_publish === true,
    issue: str(fb.issue),
    lastError: str(last?.error_code),
    retryable: last?.retryable === true,
    metaObjectId: str(last?.meta_object_id),
    permalink: safeLink(last?.permalink),
    pageId: str(page.id),
    pageName: str(page.name),
    permissions: Object.fromEntries(PERMISSIONS.map((p) => [p, perms[p] === true])) as FacebookStatus['permissions'],
    createContent: body.create_content === true,
    caption: str(body.caption),
    version: typeof body.version === 'number' ? body.version : null,
  };
}

export async function publishToFacebook(publicationId: string, expectedVersion: number, retry: boolean): Promise<PublishResult> {
  const body = await invoke({ action: 'facebook_publish', publicationId, expectedVersion, ...(retry ? { retry: true } : {}) });
  return {
    ok: body?.ok === true,
    code: body?.ok === true ? null : str(body?.code) ?? 'INTERNAL_ERROR',
    state: stateOf(body?.state),
    permalink: safeLink(body?.permalink),
    metaObjectId: str(body?.meta_object_id),
  };
}

export async function loadPrivateImage(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('publication-images').download(path);
  if (error || !data) return null;
  return URL.createObjectURL(data);
}
