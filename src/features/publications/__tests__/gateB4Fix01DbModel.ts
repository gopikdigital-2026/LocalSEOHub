// Isolated in-memory model of publication_publish_attempts and its RPCs. `fixed: true` mirrors the prepared
// B.4 FIX01 migration; `fixed: false` mirrors the currently applied (pre-FIX01) functions, so each race can be
// replayed against both and the difference shown deterministically. Every write passes through `guard`,
// the model of the publish_attempts_guard trigger, exactly like a row UPDATE does in Postgres.
export type Stage = 'none' | 'container_requested' | 'container_created' | 'publish_requested';
export type Status = 'publishing' | 'succeeded' | 'failed' | 'unknown';
export type Channel = 'facebook' | 'instagram';

export interface Attempt {
  id: string; owner: string; channel: Channel; status: Status; stage: Stage; container: string | null;
  errorCode: string | null; retryable: boolean; verificationRequired: boolean; metaObjectId: string | null;
  verificationAttempts: number; lastVerifiedAt: string | null; startedAt: string;
}

const RANK: Record<Stage, number> = { none: 0, container_requested: 1, container_created: 2, publish_requested: 3 };
const FAIL_CODES = new Set([
  'REAUTH_REQUIRED', 'PERMISSION_REQUIRED', 'CHANNEL_NOT_CONNECTED', 'IMAGE_UNAVAILABLE',
  'IMAGE_UNSUPPORTED', 'META_RATE_LIMITED', 'META_TEMPORARY_ERROR', 'META_REJECTED', 'INTERNAL_ERROR',
]);

export class GuardError extends Error {}

export function guard(o: Attempt, n: Attempt, fixed: boolean): void {
  if (o.container !== null && n.container !== o.container) throw new GuardError('publish_attempt_container_immutable');
  if (RANK[n.stage] < RANK[o.stage]) throw new GuardError('publish_attempt_stage_backwards');
  if (fixed && o.stage === 'publish_requested' && n.status === 'failed') throw new GuardError('publish_attempt_outcome_unprovable');
  if (o.status === 'publishing' && n.status === 'publishing') {
    if (n.channel !== 'instagram' || RANK[n.stage] !== RANK[o.stage] + 1 || n.errorCode !== o.errorCode
      || n.retryable !== o.retryable || n.verificationRequired !== o.verificationRequired) {
      throw new GuardError('publish_attempt_invalid_transition');
    }
    return;
  }
  if (n.stage !== o.stage || n.container !== o.container) throw new GuardError('publish_attempt_stage_frozen');
  if (o.status === 'publishing' && n.status !== 'publishing') return;
  if (o.status === 'unknown' && n.status !== 'publishing') {
    if (n.verificationAttempts <= o.verificationAttempts || !n.lastVerifiedAt) throw new GuardError('publish_attempt_unknown_requires_verification');
    return;
  }
  throw new GuardError('publish_attempt_invalid_transition');
}

export function createDb(fixed: boolean) {
  const rows: Attempt[] = [];
  const state = { entitled: true, now: '2026-11-01T10:05:00Z' };
  let n = 0;
  const write = (row: Attempt, patch: Partial<Attempt>) => {
    const next = { ...row, ...patch };
    guard(row, next, fixed);
    Object.assign(row, next);
  };
  const latest = (channel: Channel) => [...rows].reverse().find((r) => r.channel === channel) ?? null;
  const own = (userId: string, id: string) => rows.find((r) => r.id === id && r.owner === userId) ?? null;

  return {
    rows,
    state,
    latest,
    write,
    begin(userId: string, channel: Channel): { result: string; id: string | null } {
      if (fixed && channel === 'instagram' && !state.entitled) return { result: 'PERMISSION_REQUIRED', id: null };
      const last = latest(channel);
      if (last?.status === 'publishing') return { result: 'PUBLISH_IN_PROGRESS', id: null };
      if (last?.status === 'unknown') return { result: 'PUBLISH_OUTCOME_UNKNOWN', id: null };
      if (last?.status === 'succeeded') return { result: 'ALREADY_PUBLISHED', id: null };
      const id = `66666666-6666-4666-8666-${String(++n).padStart(12, '0')}`;
      rows.push({
        id, owner: userId, channel, status: 'publishing', stage: 'none', container: null, errorCode: null, retryable: false,
        verificationRequired: false, metaObjectId: null, verificationAttempts: 0, lastVerifiedAt: null, startedAt: '2026-11-01T10:00:00Z',
      });
      return { result: 'OK', id };
    },
    advance(userId: string, id: string, stage: Stage, container: string | null): string {
      const row = own(userId, id);
      if (!row) return 'not_found';
      if (row.channel !== 'instagram') return 'invalid_channel';
      if (row.status !== 'publishing') return 'invalid_transition';
      if (stage === 'none' || RANK[stage] !== RANK[row.stage] + 1) return 'invalid_transition';
      if ((stage === 'container_created') !== (container !== null)) return 'invalid_payload';
      write(row, { stage, container: stage === 'container_created' ? container : row.container });
      return 'ok';
    },
    finish(userId: string, id: string, outcome: string, objectId: string | null, code: string | null): string {
      const row = own(userId, id);
      if (!row) return 'not_found';
      if (row.status !== 'publishing') return 'invalid_transition';
      if (fixed && outcome === 'failed' && row.stage === 'publish_requested') {
        write(row, { status: 'unknown', errorCode: 'PUBLISH_OUTCOME_UNKNOWN', retryable: false, verificationRequired: true });
        return 'ok_unknown';
      }
      if (outcome === 'succeeded') {
        if (!objectId) return 'invalid_payload';
        write(row, { status: 'succeeded', metaObjectId: objectId, errorCode: null, retryable: false, verificationRequired: false });
      } else if (outcome === 'failed') {
        if (!code || !FAIL_CODES.has(code)) return 'invalid_payload';
        write(row, { status: 'failed', errorCode: code, retryable: code === 'META_RATE_LIMITED' || code === 'META_TEMPORARY_ERROR', verificationRequired: false });
      } else if (outcome === 'unknown') {
        write(row, { status: 'unknown', errorCode: 'PUBLISH_OUTCOME_UNKNOWN', retryable: false, verificationRequired: true });
      } else return 'invalid_payload';
      return 'ok';
    },
    markStale(id: string, staleBefore: string): boolean {
      const row = rows.find((r) => r.id === id);
      if (!row || row.channel !== 'instagram' || row.status !== 'publishing' || !(row.startedAt < staleBefore)) return false;
      write(row, { status: 'unknown', errorCode: 'PUBLISH_OUTCOME_UNKNOWN', retryable: false, verificationRequired: true });
      return true;
    },
    recordVerification(userId: string, id: string, verdict: string, mediaId: string | null): string {
      const row = own(userId, id);
      if (!row) return 'not_found';
      if (row.status !== 'unknown') return 'invalid_transition';
      const seen = { verificationAttempts: row.verificationAttempts + 1, lastVerifiedAt: state.now };
      if (verdict === 'found') {
        if (!mediaId) return 'invalid_payload';
        write(row, { ...seen, status: 'succeeded', metaObjectId: mediaId, errorCode: null, retryable: false, verificationRequired: false });
      } else if (verdict === 'absent') {
        if (fixed && row.stage === 'publish_requested') return 'unsafe_absent';
        write(row, { ...seen, status: 'failed', errorCode: 'META_TEMPORARY_ERROR', retryable: true, verificationRequired: false });
      } else if (verdict === 'inconclusive') {
        write(row, seen);
      } else return 'invalid_payload';
      return 'ok';
    },
  };
}
export type Db = ReturnType<typeof createDb>;
