import { freshnessOf } from './policy';
import { activityStateOf, crossPlatformSignals, observePlatform, platformSignals, type SignalDraft } from './signals';
import type {
  Freshness,
  PlatformAssessment,
  ReasonCode,
  SignalPlatform,
  SocialPlatform,
  SocialSignal,
  SocialSignalsReport,
  SocialSnapshot,
  SocialSyncStateInput,
} from './types';

export const SOCIAL_SIGNALS_ENGINE_VERSION = 'a3541-1';

const PLATFORMS: SocialPlatform[] = ['facebook', 'instagram'];

const SYNC_ERROR_REASON: Record<string, ReasonCode> = {
  reauth_required: 'REAUTH_REQUIRED',
  rate_limited: 'RATE_LIMITED',
  permission_unavailable: 'PERMISSION_UNAVAILABLE',
};

function blockedReason(platform: SocialPlatform, snapshot: SocialSnapshot, row: SocialSyncStateInput | undefined): ReasonCode | null {
  const conn = snapshot.connection;
  if (!conn) return 'NOT_CONNECTED';
  if (conn.status === 'reauth_required') return 'REAUTH_REQUIRED';
  if (conn.status !== 'connected') return 'NOT_CONNECTED';
  if (platform === 'instagram' && conn.instagram_status !== 'connected') return 'NOT_LINKED';
  if (!row || row.status === 'never') return 'NEVER_SYNCED';
  if (row.status === 'not_linked') return 'NOT_LINKED';
  if (row.status === 'ok' || row.status === 'empty') {
    return row.last_success_at && !Number.isNaN(Date.parse(row.last_success_at)) ? null : 'NEVER_SYNCED';
  }
  return SYNC_ERROR_REASON[row.status] ?? 'SYNC_ERROR';
}

function finalize(
  draft: SignalDraft,
  platform: SignalPlatform,
  freshness: Freshness,
  evaluatedAt: string,
  blocked: ReasonCode | null,
  baseEvidence: SocialSignal['evidence'],
): SocialSignal {
  if (blocked) {
    return {
      signalKey: draft.signalKey, platform, dimension: draft.dimension, status: 'NOT_AVAILABLE', lastKnownStatus: null,
      severity: null, reason: blocked, freshness, evidence: baseEvidence, evaluatedAt,
    };
  }
  const evidence = { ...baseEvidence, ...draft.evidence };
  if (freshness === 'STALE' && draft.dimension !== 'trend') {
    return {
      signalKey: draft.signalKey, platform, dimension: draft.dimension, status: 'STALE', lastKnownStatus: draft.status,
      severity: null, reason: 'STALE_DATA', freshness, evidence, evaluatedAt,
    };
  }
  return { ...draft, platform, lastKnownStatus: null, freshness, evidence, evaluatedAt };
}

const FRESHNESS_RANK: Record<Freshness, number> = { FRESH: 0, AGING: 1, STALE: 2, UNKNOWN: 3 };

export function evaluateSocialSignals(snapshot: SocialSnapshot, evaluatedAtInput: Date | string): SocialSignalsReport {
  const evaluatedAtMs = typeof evaluatedAtInput === 'string' ? Date.parse(evaluatedAtInput) : evaluatedAtInput.getTime();
  if (Number.isNaN(evaluatedAtMs)) throw new Error('INVALID_EVALUATED_AT');
  const evaluatedAt = new Date(evaluatedAtMs).toISOString();

  const signals: SocialSignal[] = [];
  const platforms = {} as Record<SocialPlatform, PlatformAssessment>;
  const observations = {} as Record<SocialPlatform, ReturnType<typeof observePlatform>>;
  const blocked = {} as Record<SocialPlatform, ReasonCode | null>;

  for (const platform of PLATFORMS) {
    const row = snapshot.syncStates.find((r) => r.platform === platform);
    const reason = blockedReason(platform, snapshot, row);
    const { freshness, hours } = reason ? { freshness: 'UNKNOWN' as Freshness, hours: null } : freshnessOf(row?.last_success_at ?? null, evaluatedAtMs);
    const obs = observePlatform(platform, reason ? [] : snapshot.items, row, evaluatedAtMs);
    const { drafts, sufficiency } = platformSignals(obs, evaluatedAtMs);
    const baseEvidence = {
      lastSuccessAt: row?.last_success_at ?? null,
      syncStatus: row?.status ?? null,
      errorCode: row?.error_code ?? null,
    };
    for (const d of drafts) signals.push(finalize(d, platform, freshness, evaluatedAt, reason, baseEvidence));

    observations[platform] = obs;
    blocked[platform] = reason;
    platforms[platform] = {
      platform,
      blockedReason: reason,
      syncStatus: row?.status ?? null,
      freshness,
      lastSuccessAt: row?.last_success_at ?? null,
      hoursSinceSuccess: hours,
      activityState: reason || freshness === 'STALE' ? 'not_evaluable' : activityStateOf(obs),
      sufficiency: reason
        ? { recency: 'INSUFFICIENT', frequency: 'INSUFFICIENT', content_completeness: 'INSUFFICIENT', content_type: 'INSUFFICIENT', engagement_availability: 'INSUFFICIENT' }
        : sufficiency,
    };
  }

  const crossBlocked = blocked.facebook ?? blocked.instagram;
  const crossFreshness = [platforms.facebook.freshness, platforms.instagram.freshness]
    .reduce((worst, f) => (FRESHNESS_RANK[f] > FRESHNESS_RANK[worst] ? f : worst), 'FRESH' as Freshness);
  const crossBase = { facebookReason: blocked.facebook, instagramReason: blocked.instagram };
  for (const d of crossPlatformSignals(observations.facebook, observations.instagram)) {
    signals.push(finalize(d, 'cross_platform', crossFreshness, evaluatedAt, crossBlocked, crossBase));
  }

  return { engineVersion: SOCIAL_SIGNALS_ENGINE_VERSION, evaluatedAt, platforms, signals };
}
