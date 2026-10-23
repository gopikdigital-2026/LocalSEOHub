import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Loader2, Share2 } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { META_COPY, metaErrorMessage } from './metaStatus';
import { clearMetaBinding, completeMetaConnection } from './metaRepository';

const COMPLETION_PATTERN = /^[a-f0-9]{64}$/;

export function readCallbackParams(search: string, hash: string): { completion: string | null; error: string | null } {
  const error = new URLSearchParams(search).get('error');
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return {
    completion: token && COMPLETION_PATTERN.test(token) ? token : null,
    error: error && /^[A-Z_]{3,40}$/.test(error) ? error : error ? 'UNKNOWN_ERROR' : null,
  };
}

export default function MetaCallbackPage() {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const l = lang === 'en' ? 'en' : 'es';
  const t = META_COPY[l];
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const { completion, error } = readCallbackParams(window.location.search, window.location.hash);
    window.history.replaceState(null, '', window.location.pathname);

    if (error || !completion) {
      clearMetaBinding();
      setErrorCode(error ?? 'OAUTH_STATE_INVALID');
      return;
    }
    (async () => {
      const result = await completeMetaConnection(completion);
      if (result.ok) navigate('/fuentes', { replace: true, state: { metaPick: result.status === 'page_selection_required' } });
      else setErrorCode(result.code);
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-v2-bg-primary font-v2 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-v2-xl border border-v2-border bg-white p-6 sm:p-8 text-center shadow-v2-sm">
        <div className={`w-12 h-12 mx-auto rounded-v2-xl flex items-center justify-center mb-4 ${errorCode ? 'bg-v2-error-50 text-v2-error-500' : 'bg-blue-50 text-blue-600'}`}>
          {errorCode ? <AlertCircle size={22} /> : <Share2 size={22} />}
        </div>
        {errorCode ? (
          <>
            <h1 className="text-v2-lg font-semibold text-v2-text-primary">{errorCode === 'META_APP_NOT_CONFIGURED' ? t.unavailable : t.failed}</h1>
            {errorCode !== 'META_APP_NOT_CONFIGURED' && (
              <p className="text-v2-sm text-v2-text-secondary mt-2 leading-relaxed">{metaErrorMessage(errorCode, l)}</p>
            )}
            <button
              onClick={() => navigate('/fuentes', { replace: true })}
              className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-v2-lg text-v2-xs font-semibold bg-v2-primary-600 text-white hover:bg-v2-primary-700 transition-colors"
            >
              <ArrowLeft size={13} />
              {l === 'en' ? 'Back to sources' : 'Volver a fuentes'}
            </button>
          </>
        ) : (
          <>
            <h1 className="text-v2-lg font-semibold text-v2-text-primary">{t.connecting}</h1>
            <Loader2 size={20} className="mx-auto mt-4 animate-spin text-v2-text-tertiary" />
          </>
        )}
      </div>
    </div>
  );
}
