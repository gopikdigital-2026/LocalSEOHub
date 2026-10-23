import { supabase } from '../../../lib/supabase';
import type { InstagramStatus, MetaConnectionStatus } from '../../meta-connection/metaStatus';
import type { SocialPlatform, SocialSnapshot } from '../types';

const CONNECTION_COLUMNS = 'status, instagram_status, page_name, instagram_username';
const SYNC_COLUMNS = 'platform, status, error_code, item_count, pages_fetched, last_success_at';
const ITEM_COLUMNS = 'platform, external_id, content_type, text_content, published_at, reaction_count, comment_count, permalink';
// Two platforms x the 100-item sync window.
const ITEM_LIMIT = 200;
const READ_TIMEOUT_MS = 15000;

export interface SocialAccountInfo {
  pageName: string | null;
  instagramUsername: string | null;
}

export interface SocialData {
  snapshot: SocialSnapshot;
  account: SocialAccountInfo;
  permalinks: Record<string, string | null>;
}

export const postRef = (platform: SocialPlatform | string, externalId: string) => `${platform}:${externalId}`;

export class SocialReadError extends Error {
  constructor() {
    super('SOCIAL_READ_FAILED');
  }
}

function withTimeout<T>(promise: PromiseLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SocialReadError()), READ_TIMEOUT_MS);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      () => { clearTimeout(timer); reject(new SocialReadError()); },
    );
  });
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function loadSocialData(businessId: string): Promise<SocialData> {
  const [conn, sync, items] = await withTimeout(Promise.all([
    supabase.from('meta_connections').select(CONNECTION_COLUMNS).eq('business_id', businessId).maybeSingle(),
    supabase.from('meta_sync_state').select(SYNC_COLUMNS).eq('business_id', businessId),
    supabase.from('meta_content_items').select(ITEM_COLUMNS).eq('business_id', businessId)
      .order('published_at', { ascending: false, nullsFirst: false })
      .order('external_id', { ascending: true })
      .limit(ITEM_LIMIT),
  ]));
  if (conn.error || sync.error || items.error) throw new SocialReadError();
  if (!Array.isArray(sync.data) || !Array.isArray(items.data)) throw new SocialReadError();

  const c = conn.data as Record<string, unknown> | null;
  const permalinks: Record<string, string | null> = {};
  const snapshotItems: SocialSnapshot['items'] = [];
  for (const raw of items.data as Record<string, unknown>[]) {
    const platform = raw.platform;
    const externalId = str(raw.external_id);
    if ((platform !== 'facebook' && platform !== 'instagram') || !externalId) continue;
    permalinks[postRef(platform, externalId)] = str(raw.permalink);
    snapshotItems.push({
      platform,
      external_id: externalId,
      content_type: str(raw.content_type) ?? 'other',
      text_content: str(raw.text_content),
      published_at: str(raw.published_at),
      reaction_count: num(raw.reaction_count),
      comment_count: num(raw.comment_count),
    });
  }

  return {
    snapshot: {
      connection: c && typeof c.status === 'string'
        ? { status: c.status as MetaConnectionStatus, instagram_status: str(c.instagram_status) as InstagramStatus | null }
        : null,
      syncStates: (sync.data as Record<string, unknown>[])
        .filter((s) => s.platform === 'facebook' || s.platform === 'instagram')
        .map((s) => ({
          platform: s.platform as SocialPlatform,
          status: str(s.status) ?? 'never',
          error_code: str(s.error_code),
          item_count: num(s.item_count),
          pages_fetched: num(s.pages_fetched),
          last_success_at: str(s.last_success_at),
        })),
      items: snapshotItems,
    },
    account: {
      pageName: c ? str(c.page_name) : null,
      instagramUsername: c ? str(c.instagram_username) : null,
    },
    permalinks,
  };
}
