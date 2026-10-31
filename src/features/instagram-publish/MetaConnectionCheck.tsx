import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle, Loader2, ShieldCheck, Check, X } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { checkMetaConnection, CHECK_NAMES, type CheckStatus, type ConnectionCheck, type Overall } from './connectionCheck';
import { CHECK, CHECK_TEXT, EXPIRY_TEXT, GENERIC_ERROR, STATUS_TEXT } from './copy';

const OVERALL_TONE: Record<Overall, string> = {
  PASS: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  FAIL: 'border-red-200 bg-red-50 text-red-800',
  INCONCLUSIVE: 'border-amber-200 bg-amber-50 text-amber-900',
};

const STATUS_TONE: Record<CheckStatus, string> = {
  pass: 'bg-emerald-100 text-emerald-800',
  fail: 'bg-red-100 text-red-800',
  inconclusive: 'bg-amber-100 text-amber-900',
  skipped: 'bg-slate-100 text-slate-700',
};

function Item({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="text-sm text-slate-800 break-all">{children}</dd></div>;
}

function Mark({ on }: { on: boolean | null }) {
  if (on === null) return <HelpCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden />;
  return on ? <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden /> : <X className="w-3.5 h-3.5 text-red-600" aria-hidden />;
}

// Manual, one request per click; no automatic retry and nothing is kept after leaving the publication.
export default function MetaConnectionCheck({ publicationId }: { publicationId: string }) {
  const { lang } = useI18n();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ConnectionCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const t = (k: keyof typeof CHECK) => CHECK[k][lang];

  useEffect(() => { setResult(null); setError(null); }, [publicationId]);

  const run = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const r = await checkMetaConnection(publicationId);
      if ('error' in r) setError(r.error);
      else setResult(r);
    } catch {
      setError(GENERIC_ERROR[lang]);
    } finally {
      setRunning(false);
    }
  };

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB') : '-');
  const summary = result ? (result.overall === 'PASS' ? t('passed') : result.overall === 'FAIL' ? t('failed') : t('incomplete')) : '';

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-sky-700" aria-hidden />
        <h3 className="font-semibold text-slate-900">{t('title')}</h3>
      </div>
      <p className="text-xs text-slate-600">{t('intro')}</p>
      <button type="button" onClick={() => void run()} disabled={running}
        className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-800 disabled:opacity-60">
        {running ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ShieldCheck className="w-4 h-4" aria-hidden />}
        {running ? t('running') : t('run')}
      </button>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden /><span className="font-mono text-xs">{error}</span>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <div role="status" className={`rounded-lg border px-3 py-2 text-sm ${OVERALL_TONE[result.overall]}`}>
            <span className="font-mono text-xs font-semibold">{result.overall}</span> <span>{summary}</span>
          </div>

          <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
            <Item label={t('checkedAt')}>{fmt(result.checkedAt)}</Item>
            <Item label={t('page')}><span className="font-mono text-xs">{result.pageId ?? '-'}</span></Item>
            <Item label={t('account')}>
              {result.username ? `@${result.username}` : '-'} <span className="font-mono text-xs text-slate-500">{result.accountId ?? ''}</span>
            </Item>
            <Item label={t('tokenValid')}>{result.tokenValid === 'unknown' ? t('unknown') : result.tokenValid ? 'true' : 'false'}</Item>
            <Item label={t('expiry')}>
              {EXPIRY_TEXT[result.expiry][lang]}{result.expiry === 'valid_until' || result.expiry === 'expired' ? ` ${fmt(result.expiresAt)}` : ''}
            </Item>
            <Item label={t('dataAccess')}>{fmt(result.dataAccessExpiresAt)}</Item>
            <Item label={t('eligibility')}>{STATUS_TEXT[result.eligibility][lang]}</Item>
            <Item label={t('limit')}>
              {result.quotaUsage !== null && result.quotaTotal !== null ? `${result.quotaUsage} / ${result.quotaTotal}` : t('unknown')}
            </Item>
          </dl>
          <p className="text-xs text-slate-600">{t('subtype')}</p>

          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {Object.entries(result.permissions).map(([p, on]) => (
              <li key={p} className="flex items-center gap-2 text-xs text-slate-700"><Mark on={on} /><span className="font-mono">{p}</span></li>
            ))}
          </ul>

          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {CHECK_NAMES.map((n) => (
              <li key={n} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm text-slate-800">{CHECK_TEXT[n][lang]}</span>
                <span className="flex items-center gap-2">
                  {result.checks[n].reason && <span className="font-mono text-xs text-slate-500">{result.checks[n].reason}</span>}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[result.checks[n].status]}`}>{STATUS_TEXT[result.checks[n].status][lang]}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">{t('notStored')}</p>
        </div>
      )}
    </div>
  );
}
