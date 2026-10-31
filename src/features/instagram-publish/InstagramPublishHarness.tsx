import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, Instagram, Loader2, Lock, RefreshCw, X } from 'lucide-react';
import { useBusiness } from '../business-memory/BusinessContext';
import { useI18n } from '../../lib/i18n';
import type { Publication } from '../publications/types';
import { usePublicationResume } from '../publication-resume/context';
import { getReviewDraft } from '../channel-review/repository';
import { getInstagramStatus, requestInstagramPublish, type InstagramStatus } from './repository';
import { CROP_TEXT, GENERIC_ERROR, IG, INTERNAL_NOTICE, STAGE_TEXT, STATE_TEXT } from './copy';
import MetaConnectionCheck from './MetaConnectionCheck';

type Ready = Extract<Publication, { status: 'proposals_ready' }>;
const isReady = (p: Publication | null): p is Ready => p?.status === 'proposals_ready';

const STATE_TONE = {
  NOT_REQUESTED: 'bg-slate-100 text-slate-700',
  PUBLISHING: 'bg-sky-100 text-sky-800',
  SUCCEEDED: 'bg-emerald-100 text-emerald-800',
  FAILED: 'bg-red-100 text-red-800',
  UNKNOWN: 'bg-amber-100 text-amber-900',
} as const;

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-xs text-slate-700">
      {on ? <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden /> : <X className="w-3.5 h-3.5 text-red-600" aria-hidden />}
      <span className="font-mono">{label}</span>
    </li>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="text-sm text-slate-800">{children}</dd></div>;
}

const canTrigger = (s: InstagramStatus, version: number) =>
  s.armed && s.triggerEnabled && s.canPublish && s.state === 'NOT_REQUESTED' && s.version === version;

export default function InstagramPublishHarness() {
  const { currentBusiness } = useBusiness();
  const { lang } = useI18n();
  const { publication, revision } = usePublicationResume();
  const pub = isReady(publication) && publication.businessId === currentBusiness?.id ? publication : null;
  const pubId = pub?.id ?? null;
  const [status, setStatus] = useState<InstagramStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const t = (k: keyof typeof IG) => IG[k][lang];

  const fetchStatus = useCallback(async (): Promise<{ status: InstagramStatus; version: number } | { error: string } | null> => {
    if (!pubId) return null;
    const draft = await getReviewDraft(pubId);
    if (!draft) return null;
    const next = await getInstagramStatus(pubId, draft.version);
    return 'error' in next ? next : { status: next, version: draft.version };
  }, [pubId]);

  const load = useCallback(async () => {
    if (!pubId) return;
    setLoading(true);
    setError(null);
    setConfirming(false);
    try {
      const next = await fetchStatus();
      if (!next) { setStatus(null); setDraftVersion(null); return; }
      if ('error' in next) { setStatus(null); setDraftVersion(null); setError(next.error); return; }
      setStatus(next.status);
      setDraftVersion(next.version);
    } catch {
      setStatus(null);
      setDraftVersion(null);
      setError(GENERIC_ERROR[lang]);
    } finally {
      setLoading(false);
    }
  }, [pubId, lang, fetchStatus]);

  useEffect(() => { setStatus(null); setResult(null); void load(); }, [load, revision]);

  // Re-reads server status immediately before sending; the server re-validates everything again.
  const send = async () => {
    if (!pubId || sending) return;
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const fresh = await fetchStatus();
      if (!fresh || 'error' in fresh || !canTrigger(fresh.status, fresh.version)) {
        setError(fresh && 'error' in fresh ? fresh.error : t('notAuthorized'));
        return;
      }
      const r = await requestInstagramPublish(pubId, fresh.version);
      setResult(r.ok ? t('published') : r.code ?? 'INTERNAL_ERROR');
    } catch {
      setError(GENERIC_ERROR[lang]);
    } finally {
      setSending(false);
      setConfirming(false);
      void load();
    }
  };

  if (!pub) return null;
  const d = status?.derivative;
  const enabled = !!status && draftVersion !== null && canTrigger(status, draftVersion) && !loading && !sending;

  return (
    <section className="bg-slate-100 font-v2 overflow-x-hidden" aria-label="instagram-validation">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-12">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Instagram className="w-5 h-5 text-rose-700" aria-hidden />
            <h2 className="font-semibold text-slate-900">{t('title')}</h2>
          </div>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{INTERNAL_NOTICE}</p>
          <p className="text-xs text-slate-600">{t('intro')}</p>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            {t('load')}
          </button>

          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /><span className="font-mono text-xs">{error}</span>
            </div>
          )}

          {status && d && (
            <>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                <Item label={t('publication')}><span className="font-mono text-xs break-all">{pub.id}</span></Item>
                <Item label={t('account')}>@{status.username ?? '-'} <span className="font-mono text-xs text-slate-500">{status.accountId ?? ''}</span></Item>
                <Item label={t('version')}>{status.version ?? '-'}</Item>
                <Item label={t('preflight')}>{status.canPublish ? t('ready') : <span className="font-mono text-xs">{status.issue}</span>}</Item>
                <Item label={t('state')}>
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[status.state]}`}>{STATE_TEXT[status.state][lang]}</span>
                </Item>
                <Item label={t('stage')}>{status.externalStage ? STAGE_TEXT[status.externalStage][lang] : '-'}</Item>
                <Item label={t('container')}>{status.containerStored ? t('yes') : t('no')}</Item>
                {status.lastError && <Item label={t('lastError')}><span className="font-mono text-xs">{status.lastError}</span></Item>}
                <Item label={t('source')}>{d.sourceFormat ?? '-'} {d.sourceWidth && d.sourceHeight ? `${d.sourceWidth}×${d.sourceHeight}` : ''}</Item>
                <Item label={t('derivative')}>
                  {d.ready
                    ? <>{t('derivativeReady')}: JPEG {d.outputWidth}×{d.outputHeight}{d.crop && CROP_TEXT[d.crop] ? `, ${CROP_TEXT[d.crop][lang]}` : ''}</>
                    : <>{t('derivativeNo')} <span className="font-mono text-xs">{d.reason ?? ''}</span></>}
                </Item>
              </dl>
              <p className="text-xs text-slate-600">{t('subtype')}</p>

              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {Object.entries(status.permissions).map(([p, on]) => <Flag key={p} on={on} label={p} />)}
              </ul>

              <div>
                <p className="mb-1 text-xs text-slate-500">{t('caption')}</p>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-800">{status.caption ?? ''}</pre>
              </div>

              {!enabled && (
                <button type="button" disabled aria-disabled="true"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-slate-300 px-4 py-2 text-sm font-medium text-slate-700">
                  <Lock className="w-4 h-4" aria-hidden />{sending ? t('sending') : t('disabled')}
                  {status.triggerReason && <span className="font-mono text-xs">({status.triggerReason})</span>}
                </button>
              )}
              {enabled && !confirming && (
                <button type="button" onClick={() => setConfirming(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-800">
                  <Instagram className="w-4 h-4" aria-hidden />{t('trigger')}
                </button>
              )}
              {enabled && confirming && (
                <div className="space-y-2 rounded-lg border border-rose-200 bg-rose-50 p-3">
                  <p className="text-sm text-rose-900">{t('confirm')}</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void send()} disabled={sending}
                      className="rounded-lg bg-rose-700 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-rose-800 disabled:opacity-50">{t('confirmYes')}</button>
                    <button type="button" onClick={() => setConfirming(false)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 transition-colors hover:bg-white">{t('cancel')}</button>
                  </div>
                </div>
              )}
              {result && <p className="text-sm text-slate-800"><span className="font-mono text-xs">{result}</span></p>}
            </>
          )}
          {!status && !loading && !error && <p className="text-sm text-slate-600">{t('empty')}</p>}
        </div>
        <MetaConnectionCheck publicationId={pub.id} />
      </div>
    </section>
  );
}
