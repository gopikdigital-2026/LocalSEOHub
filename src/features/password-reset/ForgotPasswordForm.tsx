import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { RESEND_COOLDOWN_SECONDS, isValidEmail, requestPasswordReset } from './recovery';

interface ForgotPasswordFormProps {
  initialEmail?: string;
  onBack: () => void;
}

type ErrorKey = 'reset_err_email_invalid' | 'reset_err_rate_limited' | 'reset_err_generic';

export default function ForgotPasswordForm({ initialEmail = '', onBack }: ForgotPasswordFormProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || cooldown > 0) return;
    if (!isValidEmail(email)) {
      setError('reset_err_email_invalid');
      return;
    }
    inFlight.current = true;
    setSending(true);
    setError(null);
    const outcome = await requestPasswordReset(supabase.auth, email, window.location.origin);
    inFlight.current = false;
    setSending(false);
    if (outcome === 'sent') {
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else if (outcome === 'invalid_email') {
      setError('reset_err_email_invalid');
    } else if (outcome === 'rate_limited') {
      setError('reset_err_rate_limited');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } else {
      setError('reset_err_generic');
    }
  };

  const busy = sending || cooldown > 0;

  return (
    <div className="v2-fade-in">
      <div className="mb-6">
        <h2 id="reset-request-title" className="font-bold text-v2-text-primary text-v2-lg leading-tight tracking-tight">
          {sent ? t('reset_sent_title') : t('reset_request_title')}
        </h2>
        {!sent && (
          <p className="text-v2-text-secondary text-v2-sm mt-2 leading-relaxed">{t('reset_request_desc')}</p>
        )}
      </div>

      {sent ? (
        <div role="status" aria-live="polite" className="rounded-v2-xl border border-v2-success-200 bg-v2-success-50 p-4 mb-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-v2-lg bg-v2-success-100 flex items-center justify-center shrink-0">
              <MailCheck size={15} className="text-v2-success-600" />
            </div>
            <div>
              <p className="text-v2-success-700 text-v2-sm leading-relaxed">{t('reset_sent_generic')}</p>
              <p className="text-v2-success-600 text-v2-xs leading-relaxed mt-2">{t('reset_sent_hint')}</p>
            </div>
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="space-y-4" aria-labelledby="reset-request-title">
        {!sent && (
          <div className="space-y-1.5">
            <label htmlFor="reset-email" className="v2-label">{t('reset_email_label')}</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-v2-text-tertiary pointer-events-none" />
              <input
                id="reset-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                placeholder={t('reset_email_placeholder')}
                aria-invalid={error === 'reset_err_email_invalid'}
                aria-describedby={error ? 'reset-request-error' : undefined}
                className={`v2-input pl-10 ${error === 'reset_err_email_invalid' ? 'v2-input-error' : ''}`}
              />
            </div>
          </div>
        )}

        {error && (
          <div id="reset-request-error" role="alert" className="flex items-start gap-2.5 bg-v2-error-50 border border-v2-error-200 rounded-v2-lg px-4 py-3">
            <AlertCircle size={14} className="text-v2-error-500 mt-0.5 shrink-0" />
            <p className="text-v2-error-600 text-v2-xs leading-relaxed">{t(error)}</p>
          </div>
        )}

        <button type="submit" disabled={busy} aria-busy={sending} className="w-full v2-btn-primary py-3 text-v2-sm font-bold">
          {sending && (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {sending ? t('reset_sending') : sent ? t('reset_resend_btn') : t('reset_send_btn')}
        </button>

        {cooldown > 0 && (
          <p className="text-center text-v2-xs text-v2-text-tertiary" aria-live="polite">
            {t('reset_resend_in').replace('{s}', String(cooldown))}
          </p>
        )}
      </form>

      <button
        type="button"
        onClick={onBack}
        className="mt-5 mx-auto flex items-center gap-1.5 text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700 transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-v2-primary-300"
      >
        <ArrowLeft size={13} />
        {t('reset_back_to_login')}
      </button>
    </div>
  );
}
