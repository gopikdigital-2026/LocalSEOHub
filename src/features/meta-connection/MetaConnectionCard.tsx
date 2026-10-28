import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertCircle, ExternalLink, Facebook, Instagram, Loader2, RefreshCw, Share2, Unlink, X } from 'lucide-react';
import { META_COPY, META_POLL_MS, instagramLabel, metaErrorMessage, metaView, type MetaConnectionRow } from './metaStatus';
import { cancelMetaConnection, disconnectMeta, loadMetaConnection, recoverMetaConnection, selectMetaPage, startMetaConnection } from './metaRepository';
import { MetaPageSelectModal } from './MetaPageSelectModal';
import { MetaSyncStatus } from './MetaSyncStatus';
import { PublishingAccessControl } from '../publishing-access/PublishingAccessControl';

const primaryBtn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-v2-lg text-v2-xs font-semibold bg-v2-primary-600 text-white hover:bg-v2-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const errorBtn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-v2-lg text-v2-xs font-semibold bg-v2-error-50 text-v2-error-600 hover:bg-v2-error-100 disabled:opacity-50 transition-colors';
const secondaryBtn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-v2-lg text-v2-xs font-semibold border border-v2-border text-v2-text-secondary hover:bg-v2-neutral-100 hover:text-v2-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

export function MetaConnectionCard({ businessId, lang }: { businessId: string; lang: 'es' | 'en' }) {
  const t = META_COPY[lang];
  const [row, setRow] = useState<MetaConnectionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const location = useLocation();
  const [picking, setPicking] = useState(() => (location.state as { metaPick?: unknown } | null)?.metaPick === true);
  const [publishingReturn] = useState(() => {
    const value = (location.state as { metaPublishing?: unknown } | null)?.metaPublishing;
    return typeof value === 'string' && /^[A-Za-z_]{3,40}$/.test(value) ? value : null;
  });

  const refresh = useCallback(async () => {
    try {
      setRow(await loadMetaConnection(businessId));
    } catch {
      setNotice(metaErrorMessage('UNKNOWN_ERROR', lang));
    } finally {
      setLoading(false);
    }
  }, [businessId, lang]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await loadMetaConnection(businessId).catch(() => null);
      if (cancelled) return;
      setRow(current);
      setLoading(false);
      if (current && current.status !== 'disconnected' && current.status !== 'error') {
        const recovered = await recoverMetaConnection();
        if (!cancelled && recovered.ok && recovered.status !== current.status) void refresh();
      }
    })();
    return () => { cancelled = true; };
  }, [businessId, refresh]);

  const view = metaView(row);
  const inProgress = row?.status === 'connecting' || row?.status === 'authorized';

  const recheck = useCallback(async () => {
    await recoverMetaConnection();
    await refresh();
  }, [refresh]);

  useEffect(() => {
    if (!inProgress) return;
    const timer = window.setInterval(() => void recheck(), META_POLL_MS);
    return () => window.clearInterval(timer);
  }, [inProgress, recheck]);

  useEffect(() => {
    const onReturn = (persisted: boolean) => {
      // Coming back from Meta via the browser's back button restores the page with the button still busy.
      if (persisted) setBusy(false);
      void (inProgress ? recheck() : refresh());
    };
    const onVisible = () => { if (document.visibilityState === 'visible') onReturn(false); };
    const onPageShow = (e: PageTransitionEvent) => onReturn(e.persisted);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [inProgress, recheck, refresh]);

  const handleCancel = async () => {
    setBusy(true);
    setNotice(null);
    const result = await cancelMetaConnection();
    if (!result.ok) setNotice(metaErrorMessage(result.code, lang));
    await refresh();
    setBusy(false);
  };

  const handleConnect = async () => {
    setBusy(true);
    setNotice(null);
    const result = await startMetaConnection();
    if (result.ok) {
      window.location.href = result.url;
      return;
    }
    setBusy(false);
    setNotice(result.code === 'META_APP_NOT_CONFIGURED' ? t.unavailable : metaErrorMessage(result.code, lang));
    void refresh();
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t.confirmDisconnect)) return;
    setBusy(true);
    setNotice(null);
    const result = await disconnectMeta();
    if (!result.ok) setNotice(metaErrorMessage(result.code, lang));
    await refresh();
    setBusy(false);
  };

  const handleSelect = async (pageId: string) => {
    const result = await selectMetaPage(pageId);
    if (!result.ok) setNotice(metaErrorMessage(result.code, lang));
    setPicking(false);
    await refresh();
  };

  const positive = view.kind === 'connected';
  const negative = view.kind === 'error';
  const badgeStyle = positive
    ? 'bg-v2-success-50 text-v2-success-700'
    : negative ? 'bg-v2-error-50 text-v2-error-600'
    : view.kind === 'reauth' || view.kind === 'page_selection' ? 'bg-v2-warning-50 text-v2-warning-700'
    : view.kind === 'connecting' ? 'bg-blue-50 text-blue-700'
    : 'bg-v2-neutral-100 text-v2-text-tertiary';
  const spinner = <Loader2 size={13} className="animate-spin" />;

  let body: React.ReactNode = null;
  let action: React.ReactNode = null;
  if (loading) {
    action = <span className="flex items-center gap-1.5 text-v2-xs text-v2-text-tertiary">{spinner}</span>;
  } else if (view.kind === 'connecting') {
    body = (
      <div className="mb-3">
        <p className="flex items-center gap-1.5 text-v2-xs font-medium text-blue-700">{spinner}{t.connecting}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-v2-text-secondary">{t.connectingHint}</p>
      </div>
    );
    action = <button onClick={() => void handleCancel()} disabled={busy} className={secondaryBtn}>{busy ? spinner : <X size={13} />}{t.cancelConnection}</button>;
  } else if (view.kind === 'page_selection') {
    body = <p className="text-v2-xs font-medium text-v2-warning-700 mb-3">{t.selectPage}</p>;
    action = <button onClick={() => setPicking(true)} disabled={busy} className={primaryBtn}><Facebook size={13} />{t.choose}</button>;
  } else if (view.kind === 'connected') {
    body = (
      <>
        <dl className="space-y-1.5 mb-3">
          <div className="flex items-center gap-2 text-v2-xs">
            <Facebook size={13} className="text-blue-600 shrink-0" />
            <dt className="text-v2-text-tertiary">{t.facebook}:</dt>
            <dd className="font-medium text-v2-text-primary truncate">{view.pageName}</dd>
          </div>
          <div className="flex items-center gap-2 text-v2-xs">
            <Instagram size={13} className={`shrink-0 ${view.instagram === 'connected' ? 'text-pink-600' : 'text-v2-text-tertiary'}`} />
            <dt className="text-v2-text-tertiary">{t.instagram}:</dt>
            <dd className={`truncate ${view.instagram === 'connected' ? 'font-medium text-v2-text-primary' : 'text-v2-text-secondary'}`}>
              {instagramLabel(view.instagram, view.instagramUsername, lang)}
            </dd>
          </div>
        </dl>
        <MetaSyncStatus businessId={businessId} lang={lang} onReauth={() => void refresh()} />
        <PublishingAccessControl lang={lang} returned={publishingReturn} />
      </>
    );
  } else if (view.kind === 'reauth') {
    body = <p className="text-v2-xs font-medium text-v2-warning-700 mb-3">{t.reauth}</p>;
    action = <button onClick={() => void handleConnect()} disabled={busy} className={primaryBtn}>{busy ? spinner : <RefreshCw size={13} />}{t.reconnect}</button>;
  } else if (view.kind === 'error') {
    body = (
      <div className="flex items-start gap-2 mb-3 p-2.5 rounded-v2-lg bg-v2-error-50">
        <AlertCircle size={13} className="mt-0.5 shrink-0 text-v2-error-500" />
        <div className="text-[11px] leading-relaxed text-v2-error-600">
          <p className="font-semibold">{t.failed}</p>
          <p>{metaErrorMessage(view.errorCode, lang)}</p>
        </div>
      </div>
    );
    action = <button onClick={() => void handleConnect()} disabled={busy} className={errorBtn}>{busy ? spinner : <RefreshCw size={13} />}{t.retryConnection}</button>;
  } else {
    const retrying = view.errorCode === 'OAUTH_DENIED' || view.errorCode === 'OAUTH_CANCELLED';
    if (retrying) body = <p className="text-[11px] text-v2-text-secondary mb-3">{metaErrorMessage(view.errorCode, lang)}</p>;
    action = retrying
      ? <button onClick={() => void handleConnect()} disabled={busy} className={primaryBtn}>{busy ? spinner : <RefreshCw size={13} />}{t.retryConnection}</button>
      : <button onClick={() => void handleConnect()} disabled={busy} className={primaryBtn}>{busy ? spinner : <ExternalLink size={13} />}{t.connect}</button>;
  }

  const canDisconnect = !loading && row !== null && view.kind !== 'disconnected' && view.kind !== 'connecting';

  return (
    <div className={`rounded-v2-xl border bg-white p-4 sm:p-5 transition-shadow hover:shadow-v2-sm ${
      positive ? 'border-v2-success-200' : negative ? 'border-v2-error-200' : 'border-v2-border'
    }`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-v2-lg flex items-center justify-center shrink-0 ${
          positive ? 'bg-v2-success-50 text-v2-success-600' : negative ? 'bg-v2-error-50 text-v2-error-500' : 'bg-v2-neutral-100 text-v2-text-tertiary'
        }`}>
          <Share2 size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-v2-sm font-semibold text-v2-text-primary truncate">{t.title}</h3>
          <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-v2-md mt-0.5 ${badgeStyle}`}>{t.badge[view.kind]}</span>
        </div>
      </div>

      <p className="text-v2-xs text-v2-text-tertiary mb-4 leading-relaxed">{t.description}</p>

      {body}

      {notice && (
        <div role="status" className="flex items-start gap-2 mb-3 p-2.5 rounded-v2-lg bg-v2-warning-50">
          <AlertCircle size={13} className="mt-0.5 shrink-0 text-v2-warning-600" />
          <p className="text-[11px] leading-relaxed text-v2-warning-700">{notice}</p>
        </div>
      )}

      <div className="flex items-center gap-2">
        {action}
        {canDisconnect && (
          <button
            onClick={() => void handleDisconnect()}
            disabled={busy}
            className="ml-auto p-1.5 rounded-v2-md text-v2-text-tertiary hover:text-v2-error-500 hover:bg-v2-error-50 transition-colors"
            title={t.disconnect}
            aria-label={t.disconnect}
          >
            <Unlink size={14} />
          </button>
        )}
      </div>

      {picking && view.kind === 'page_selection' && (
        <MetaPageSelectModal pages={view.pages} lang={lang} onConfirm={handleSelect} onClose={() => setPicking(false)} />
      )}
    </div>
  );
}
