import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useI18n } from '../../lib/i18n';
import { RESEND_COOLDOWN_SECONDS } from '../password-reset/recovery';
import { requestVerificationResend, type VerificationLinkProblem } from './verification';

interface VerifyEmailPanelProps {
  reason: 'signup' | 'login' | 'link';
  initialEmail?: string;
  linkProblem?: VerificationLinkProblem | null;
  onBack: () => void;
}

type ErrorKey = 'reset_err_email_invalid' | 'reset_err_rate_limited' | 'reset_err_generic';

export default function VerifyEmailPanel({ reason, initialEmail = '', linkProblem = null, onBack }: VerifyEmailPanelProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<ErrorKey | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inFlight = useRef(false);
  const emailKnown = initialEmail.trim().length > 0;

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || cooldown > 0) return;
    inFlight.current = true;
    setSending(true);
    setError(null);
    const outcome = await requestVerificationResend(supabase.auth, email, window.location.origin);
    inFlight.current = false;
    setSending(false);
    if (outcome === 'sent') {
      setResent(true);
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

  const title = reason === 'link'
    ? t(linkProblem === 'expired' ? 'verify_link_expired_title' : 'verify_link_invalid_title')
    : t('verify_title');
  const desc = reason === 'link' ? t('verify_link_desc') : reason === 'login' ? t('verify_login_desc') : t('verify_signup_desc');

  return (
    <div className="v2-fade-in">
      <div className="mb-5 flex items-start gap-3">
        <div className={`w-10 h-10 rounded-v2-xl flex items-center justify-center shrink-0 border ${reason === 'link' ? 'bg-v2-warning-50 border-v2-warning-200' : 'bg-v2-primary-50 border-v2-primary-200'}`}>
          {reason === 'link'
            ? <AlertCircle size={18} className="text-v2-warning-600" />
            : <MailCheck size={18} className="text-v2-primary-600" />}
        </div>
        <div>
          <h2 id="verify-title" className="font-bold text-v2-text-primary text-v2-lg leading-tight tracking-tight">{title}</h2>
          <p className="text-v2-text-secondary text-v2-sm mt-2 leading-relaxed">{desc}</p>
        </div>
      </div>

      {emailKnown && (
        <p className="mb-4 rounded-v2-lg border border-v2-border bg-v2-neutral-50 px-4 py-2.5 text-v2-xs text-v2-text-secondary break-all">
          {t('verify_sent_to')} <span className="font-semibold text-v2-text-primary">{initialEmail.trim()}</span>
        </p>
      )}

      {resent && (
        <div role="status" aria-live="polite" className="mb-4 rounded-v2-lg border border-v2-success-200 bg-v2-success-50 px-4 py-3">
          <p className="text-v2-success-700 text-v2-xs leading-relaxed">{t('verify_resent')}</p>
        </div>
      )}

      <form onSubmit={resend} noValidate className="space-y-4" aria-labelledby="verify-title">
        {!emailKnown && (
          <div className="space-y-1.5">
            <label htmlFor="verify-email" className="v2-label">{t('reset_email_label')}</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-v2-text-tertiary pointer-events-none" />
              <input
                id="verify-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                placeholder={t('reset_email_placeholder')}
                aria-invalid={error === 'reset_err_email_invalid'}
                className={`v2-input pl-10 ${error === 'reset_err_email_invalid' ? 'v2-input-error' : ''}`}
              />
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2.5 bg-v2-error-50 border border-v2-error-200 rounded-v2-lg px-4 py-3">
            <AlertCircle size={14} className="text-v2-error-500 mt-0.5 shrink-0" />
            <p className="text-v2-error-600 text-v2-xs leading-relaxed">{t(error)}</p>
          </div>
        )}

        <button type="submit" disabled={sending || cooldown > 0} aria-busy={sending} className="w-full v2-btn-primary py-3 text-v2-sm font-bold">
          {sending ? t('reset_sending') : t('verify_resend_btn')}
        </button>

        {cooldown > 0 && (
          <p className="text-center text-v2-xs text-v2-text-tertiary" aria-live="polite">
            {t('reset_resend_in').replace('{s}', String(cooldown))}
          </p>
        )}
        <p className="text-center text-[11px] text-v2-text-tertiary leading-relaxed">{t('verify_hint')}</p>
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
