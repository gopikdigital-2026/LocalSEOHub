import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, ExternalLink, Facebook, Loader2, RefreshCw, Send, ShieldAlert, X } from 'lucide-react';
import { useBusiness } from '../business-memory/BusinessContext';
import { useI18n } from '../../lib/i18n';
import type { Publication } from '../publications/types';
import { usePublicationResume } from '../publication-resume/context';
import { getReviewDraft } from '../channel-review/repository';
import { getFacebookStatus, loadPrivateImage, publishToFacebook, type FacebookStatus } from './repository';
import { CODE_TEXT, FB, GENERIC_ERROR, INTERNAL_NOTICE, STATE_TEXT } from './copy';

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

export default function FacebookPublishHarness() {
  const { currentBusiness } = useBusiness();
  const { lang } = useI18n();
  const { publication, revision } = usePublicationResume();
  const pub = isReady(publication) && publication.businessId === currentBusiness?.id ? publication : null;
  const pubId = pub?.id ?? null;
  const imagePath = pub?.image.path ?? null;
  const [status, setStatus] = useState<FacebookStatus | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'error' | 'ok' } | null>(null);
  const inFlight = useRef(false);
  const t = (k: keyof typeof FB) => FB[k][lang];
  const codeText = (code: string | null) => (code && CODE_TEXT[code] ? CODE_TEXT[code][lang] : GENERIC_ERROR[lang]);

  const load = useCallback(async () => {
    if (!pubId) return;
    setLoading(true);
    setMessage(null);
    try {
      const draft = await getReviewDraft(pubId);
      if (!draft) { setStatus(null); setVersion(null); return; }
      setVersion(draft.version);
      const next = await getFacebookStatus(pubId, draft.version);
      if ('error' in next) { setStatus(null); setMessage({ text: codeText(next.error), tone: 'error' }); return; }
      setStatus(next);
    } catch {
      setStatus(null);
      setMessage({ text: GENERIC_ERROR[lang], tone: 'error' });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubId, lang]);

  useEffect(() => { setStatus(null); setConfirming(false); void load(); }, [load, revision]);

  useEffect(() => {
    if (!imagePath) return;
    let url: string | null = null;
    let live = true;
    setImageFailed(false);
    loadPrivateImage(imagePath).then((u) => {
      if (!live) { if (u) URL.revokeObjectURL(u); return; }
      url = u;
      setPreview(u);
      setImageFailed(!u);
    });
    return () => { live = false; if (url) URL.revokeObjectURL(url); setPreview(null); };
  }, [imagePath]);

  const retry = status?.state === 'FAILED';
  const blocked = !status || !status.armed || !status.canPublish || loading || version === null
    || status.state === 'SUCCEEDED' || status.state === 'UNKNOWN' || status.state === 'PUBLISHING';

  const publish = async () => {
    if (!pubId || version === null || inFlight.current) return;
    inFlight.current = true;
    setConfirming(false);
    setLoading(true);
    try {
      const result = await publishToFacebook(pubId, version, retry);
      setMessage(result.ok ? { text: STATE_TEXT.SUCCEEDED[lang], tone: 'ok' } : { text: codeText(result.code), tone: 'error' });
    } finally {
      inFlight.current = false;
      setLoading(false);
      void load();
    }
  };

  if (!pub) return null;

  return (
    <section className="bg-slate-100 font-v2 overflow-x-hidden" aria-label="facebook-publish">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-12">
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Facebook className="w-5 h-5 text-sky-700" aria-hidden />
            <h2 className="font-semibold text-slate-900">{t('title')}</h2>
          </div>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{INTERNAL_NOTICE}</p>
          <p className="text-xs text-slate-600">{t('intro')}</p>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            {t('load')}
          </button>

          {message && (
            <div role={message.tone === 'error' ? 'alert' : 'status'}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${message.tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              {message.tone === 'error' ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /> : <Check className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />}
              <span>{message.text}</span>
            </div>
          )}

          {status && (
            <>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-slate-500">{t('publication')}</dt><dd className="font-mono text-xs text-slate-800 break-all">{pub.id}</dd></div>
                <div><dt className="text-xs text-slate-500">{t('page')}</dt><dd className="text-slate-800">{status.pageName ?? '-'} <span className="font-mono text-xs text-slate-500">{status.pageId ?? ''}</span></dd></div>
                <div><dt className="text-xs text-slate-500">{t('version')}</dt><dd className="text-slate-800">{status.version ?? '-'}</dd></div>
                <div>
                  <dt className="text-xs text-slate-500">{t('state')}</dt>
                  <dd><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATE_TONE[status.state]}`}>{STATE_TEXT[status.state][lang]}</span></dd>
                </div>
                <div><dt className="text-xs text-slate-500">{t('preflight')}</dt><dd className="text-slate-800">{status.canPublish ? t('ready') : <span className="font-mono text-xs">{status.issue}</span>}</dd></div>
                {status.lastError && <div><dt className="text-xs text-slate-500">{t('lastError')}</dt><dd className="font-mono text-xs text-slate-800">{status.lastError}</dd></div>}
              </dl>

              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {Object.entries(status.permissions).map(([p, on]) => <Flag key={p} on={on} label={p} />)}
                <Flag on={status.createContent} label="CREATE_CONTENT" />
              </ul>

              <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
                <div>
                  <p className="mb-1 text-xs text-slate-500">{t('image')}</p>
                  {preview
                    ? <img src={preview} alt="" className="aspect-square w-full rounded-lg border border-slate-200 object-cover" />
                    : <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-500">{imageFailed ? t('imageMissing') : <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}</div>}
                </div>
                <div>
                  <p className="mb-1 text-xs text-slate-500">{t('caption')}</p>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-800">{status.caption ?? ''}</pre>
                </div>
              </div>

              {status.state === 'SUCCEEDED' && (
                <div className="space-y-1 text-sm">
                  {status.metaObjectId && <p className="text-slate-700">{t('objectId')}: <span className="font-mono text-xs">{status.metaObjectId}</span></p>}
                  {status.permalink && (
                    <a href={status.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline">
                      {t('permalink')} <ExternalLink className="w-3.5 h-3.5" aria-hidden />
                    </a>
                  )}
                </div>
              )}

              <p className={`flex items-center gap-2 text-xs ${status.armed ? 'text-red-700' : 'text-slate-600'}`}>
                <ShieldAlert className="w-4 h-4" aria-hidden />{status.armed ? t('armedOn') : t('armedOff')}
              </p>

              {!confirming ? (
                <button type="button" onClick={() => setConfirming(true)} disabled={blocked}
                  className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600">
                  <Send className="w-4 h-4" aria-hidden />{retry ? t('retry') : t('publish')}
                </button>
              ) : (
                <div role="alertdialog" aria-label={t('confirmTitle')} className="space-y-3 rounded-lg border border-red-300 bg-red-50 p-4">
                  <p className="font-semibold text-red-800">{t('confirmTitle')}</p>
                  <p className="text-sm text-red-800">{t('confirmBody')}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void publish()} disabled={blocked}
                      className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-800 disabled:opacity-50">{t('confirm')}</button>
                    <button type="button" onClick={() => setConfirming(false)}
                      className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800 transition-colors hover:bg-slate-50">{t('cancel')}</button>
                  </div>
                </div>
              )}
            </>
          )}
          {!status && !loading && !message && <p className="text-sm text-slate-600">{t('empty')}</p>}
        </div>
      </div>
    </section>
  );
}
