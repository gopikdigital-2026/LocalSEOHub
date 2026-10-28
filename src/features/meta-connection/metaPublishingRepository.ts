import { supabase } from '../../lib/supabase';

const PUBLISHING_BINDING_KEY = 'lsh_meta_publishing_binding';
const HEX64 = /^[a-f0-9]{64}$/;

export type PublishingChannel = 'facebook' | 'instagram';

export interface PublishingCapabilities {
  facebook_publish_ready: boolean;
  instagram_publish_ready: boolean;
}

export type PublishingResult<T> = ({ ok: true } & T) | { ok: false; code: string };

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

const failure = (body: Record<string, unknown> | null) => ({
  ok: false as const,
  code: typeof body?.code === 'string' ? body.code : 'INTERNAL_ERROR',
});

function toCapabilities(body: Record<string, unknown> | null): PublishingResult<PublishingCapabilities> {
  if (body?.ok !== true || typeof body.facebook_publish_ready !== 'boolean' || typeof body.instagram_publish_ready !== 'boolean') {
    return failure(body);
  }
  return { ok: true, facebook_publish_ready: body.facebook_publish_ready, instagram_publish_ready: body.instagram_publish_ready };
}

export async function loadPublishingCapabilities(): Promise<PublishingResult<PublishingCapabilities>> {
  return toCapabilities(await invoke({ action: 'capabilities' }));
}

export async function startPublishingAccess(): Promise<PublishingResult<{ url: string }>> {
  const body = await invoke({ action: 'enable_publishing_start' });
  if (body?.ok !== true || typeof body.url !== 'string' || typeof body.binding !== 'string'
    || !body.url.startsWith('https://www.facebook.com/') || !HEX64.test(body.binding)) {
    return failure(body);
  }
  sessionStorage.setItem(PUBLISHING_BINDING_KEY, body.binding);
  return { ok: true, url: body.url };
}

export async function completePublishingAccess(completion: string): Promise<PublishingResult<PublishingCapabilities>> {
  const binding = sessionStorage.getItem(PUBLISHING_BINDING_KEY);
  sessionStorage.removeItem(PUBLISHING_BINDING_KEY);
  if (!binding) return { ok: false, code: 'SESSION_MISMATCH' };
  return toCapabilities(await invoke({ action: 'enable_publishing_complete', completion, binding }));
}

export function clearPublishingBinding(): void {
  sessionStorage.removeItem(PUBLISHING_BINDING_KEY);
}
