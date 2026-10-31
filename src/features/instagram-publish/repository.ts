import { supabase } from '../../lib/supabase';

export type AttemptState = 'NOT_REQUESTED' | 'PUBLISHING' | 'SUCCEEDED' | 'FAILED' | 'UNKNOWN';
const STATES: AttemptState[] = ['NOT_REQUESTED', 'PUBLISHING', 'SUCCEEDED', 'FAILED', 'UNKNOWN'];
const PERMISSIONS = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement'] as const;
const STAGES = ['none', 'container_requested', 'container_created', 'publish_requested'] as const;
export type ExternalStage = (typeof STAGES)[number];

export interface DerivativeReadiness {
  ready: boolean;
  reason: string | null;
  sourceFormat: string | null;
  sourceWidth: number | null;
  sourceHeight: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  crop: string | null;
}

export interface InstagramStatus {
  armed: boolean;
  triggerEnabled: boolean;
  triggerReason: string | null;
  state: AttemptState;
  canPublish: boolean;
  issue: string | null;
  lastError: string | null;
  accountId: string | null;
  username: string | null;
  permissions: Record<(typeof PERMISSIONS)[number], boolean>;
  caption: string | null;
  version: number | null;
  derivative: DerivativeReadiness;
  externalStage: ExternalStage | null;
  containerStored: boolean;
}

const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const stateOf = (v: unknown): AttemptState => (STATES.includes(v as AttemptState) ? (v as AttemptState) : 'NOT_REQUESTED');
const stageOf = (v: unknown): ExternalStage | null => (STAGES.includes(v as ExternalStage) ? (v as ExternalStage) : null);

async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await supabase.functions.invoke('instagram-publishing', { body });
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

export async function getInstagramStatus(publicationId: string, expectedVersion: number): Promise<InstagramStatus | { error: string }> {
  const body = await invoke({ action: 'instagram_publish_status', publicationId, expectedVersion });
  const ig = body?.instagram as Record<string, unknown> | undefined;
  if (body?.ok !== true || !ig || typeof ig !== 'object') return { error: str(body?.code) ?? 'INTERNAL_ERROR' };
  const last = (ig.last_attempt ?? null) as Record<string, unknown> | null;
  const account = (body.account ?? {}) as Record<string, unknown>;
  const perms = (body.permissions ?? {}) as Record<string, unknown>;
  const d = (body.derivative ?? {}) as Record<string, unknown>;
  const attempt = (body.attempt ?? null) as Record<string, unknown> | null;
  const trigger = (body.trigger ?? {}) as Record<string, unknown>;
  return {
    armed: body.armed === true,
    triggerEnabled: trigger.enabled === true,
    triggerReason: str(trigger.reason),
    state: stateOf(ig.state),
    canPublish: ig.can_publish === true,
    issue: str(ig.issue),
    lastError: str(last?.error_code),
    accountId: str(account.id),
    username: str(account.username),
    permissions: Object.fromEntries(PERMISSIONS.map((p) => [p, perms[p] === true])) as InstagramStatus['permissions'],
    caption: str(body.caption),
    version: num(body.version),
    derivative: {
      ready: d.ready === true,
      reason: str(d.reason),
      sourceFormat: str(d.source_format),
      sourceWidth: num(d.source_width),
      sourceHeight: num(d.source_height),
      outputWidth: num(d.output_width),
      outputHeight: num(d.output_height),
      crop: str(d.crop),
    },
    externalStage: stageOf(attempt?.external_stage),
    containerStored: attempt?.container_stored === true,
  };
}

export interface PublishResult {
  ok: boolean;
  code: string | null;
  state: AttemptState;
  permalink: string | null;
}

// The server re-checks arming, allowlist, ownership and draft version; this call grants nothing by itself.
export async function requestInstagramPublish(publicationId: string, expectedVersion: number): Promise<PublishResult> {
  const body = await invoke({ action: 'instagram_publish', publicationId, expectedVersion });
  return {
    ok: body?.ok === true,
    code: str(body?.code),
    state: stateOf(body?.state),
    permalink: str(body?.permalink),
  };
}
