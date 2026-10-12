import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Link2Off, Lock, TimerOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useI18n, type TranslationKey } from '../../lib/i18n';
import { LogoIcon } from '../../components/Logo';
import {
  RESET_PASSWORD_PATH,
  endSessionsAfterReset,
  establishRecoverySession,
  updateRecoveredPassword,
  validateNewPassword,
  type InvalidReason,
  type RecoveryLink,
  type WeakReason,
} from './recovery';

interface ResetPasswordPageProps {
  initialLink: RecoveryLink | null;
  onLinkConsumed: () => void;
}

type Phase = { name: 'checking' } | { name: 'ready' } | { name: 'invalid'; reason: InvalidReason } | { name: 'done' };

const INVALID_COPY: Record<InvalidReason, { title: TranslationKey; desc: TranslationKey }> = {
  expired: { title: 'reset_expired_title', desc: 'reset_expired_desc' },
  invalid: { title: 'reset_invalid_title', desc: 'reset_invalid_desc' },
  missing: { title: 'reset_missing_title', desc: 'reset_missing_desc' },
};

const WEAK_COPY: Record<WeakReason, TranslationKey> = {
  length: 'reset_err_weak_length',
  characters: 'reset_err_weak_characters',
  pwned: 'reset_err_weak_pwned',
};

export default function ResetPasswordPage({ initialLink, onLinkConsumed }: ResetPasswordPageProps) {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [link] = useState(initialLink);
  const [phase, setPhase] = useState<Phase>({ name: 'checking' });
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<TranslationKey[]>([]);
  const started = useRef(false);
  const inFlight = useRef(false);

  useEffect(() => {
    // Guards against React StrictMode re-running the effect: recovery tokens are single-use.
    if (started.current) return;
    started.current = true;
    onLinkConsumed();
    establishRecoverySession(supabase.auth, link).then((check) => {
      // Strip tokens and error details only after the Supabase client has read the URL.
      window.history.replaceState(window.history.state, '', RESET_PASSWORD_PATH);
      setPhase(check.ok ? { name: 'ready' } : { name: 'invalid', reason: check.reason });
    });
  }, [link, onLinkConsumed]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    const problem = validateNewPassword(password, confirmation);
    if (problem) {
      setErrors([problem === 'too_short' ? 'reset_err_too_short' : problem === 'too_long' ? 'reset_err_too_long' : 'reset_err_mismatch']);
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setErrors([]);
    const outcome = await updateRecoveredPassword(supabase.auth, password);
    if (outcome.ok) {
      await endSessionsAfterReset(supabase.auth);
      setPassword('');
      setConfirmation('');
      setPhase({ name: 'done' });
    } else if (outcome.problem === 'session') {
      setPassword('');
      setConfirmation('');
      setPhase({ name: 'invalid', reason: 'expired' });
    } else if (outcome.problem === 'weak') {
      setErrors(['reset_err_weak', ...outcome.reasons.map((r) => WEAK_COPY[r])]);
    } else {
      setErrors([
        outcome.problem === 'same' ? 'reset_err_same' : outcome.problem === 'rate_limited' ? 'reset_err_rate_limited' : 'reset_err_generic',
      ]);
    }
    inFlight.current = false;
    setSaving(false);
  };

  const goLogin = () => navigate('/login', { replace: true });
  const requestNewLink = () => navigate('/login?recuperar=1', { replace: true });

  return (
    <div className="min-h-screen bg-v2-bg-primary font-v2 flex flex-col">
      <header className="w-full max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-v2-primary-300">
          <LogoIcon size={28} />
          <span className="font-bold text-v2-text-primary tracking-tight">LocalSEOHub</span>
        </a>
        <div className="flex items-center rounded-v2-lg border border-v2-border bg-white p-0.5 text-v2-xs font-semibold" role="group" aria-label="Idioma / Language">
          {(['es', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              aria-pressed={lang === l}
              className={`px-2.5 py-1 rounded-v2-md transition-colors ${lang === l ? 'bg-v2-primary-600 text-white' : 'text-v2-text-secondary hover:text-v2-text-primary'}`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 pb-16 pt-4 sm:pt-0">
        <div className="w-full max-w-md bg-white rounded-v2-2xl shadow-v2-xl border border-v2-border v2-scale-in">
          <div className="p-7 sm:p-8">
            {phase.name === 'checking' && (
              <div className="py-10 flex flex-col items-center text-center" role="status" aria-live="polite">
                <svg className="animate-spin w-6 h-6 text-v2-primary-600 mb-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <p className="text-v2-sm text-v2-text-secondary">{t('reset_checking')}</p>
              </div>
            )}

            {phase.name === 'invalid' && (
              <StatusPanel
                tone="warning"
                icon={phase.reason === 'expired' ? <TimerOff size={20} /> : <Link2Off size={20} />}
                title={t(INVALID_COPY[phase.reason].title)}
                description={t(INVALID_COPY[phase.reason].desc)}
              >
                <button type="button" onClick={requestNewLink} className="w-full v2-btn-primary py-3 text-v2-sm font-bold">
                  {t('reset_request_new')}
                </button>
              </StatusPanel>
            )}

            {phase.name === 'done' && (
              <StatusPanel
                tone="success"
                icon={<CheckCircle2 size={20} />}
                title={t('reset_done_title')}
                description={t('reset_done_desc')}
              >
                <button type="button" onClick={goLogin} autoFocus className="w-full v2-btn-primary py-3 text-v2-sm font-bold">
                  {t('reset_go_login')}
                </button>
              </StatusPanel>
            )}

            {phase.name === 'ready' && (
              <div className="v2-fade-in">
                <h1 id="reset-page-title" className="font-bold text-v2-text-primary text-v2-xl leading-tight tracking-tight">
                  {t('reset_page_title')}
                </h1>
                <p className="text-v2-text-secondary text-v2-sm mt-2 mb-6 leading-relaxed">{t('reset_page_desc')}</p>

                <form onSubmit={submit} noValidate className="space-y-4" aria-labelledby="reset-page-title">
                  <PasswordInput
                    id="reset-new-password"
                    label={t('reset_new_label')}
                    value={password}
                    onChange={(v) => { setPassword(v); if (errors.length) setErrors([]); }}
                    visible={showPassword}
                    onToggle={() => setShowPassword((v) => !v)}
                    toggleLabel={showPassword ? t('reset_hide_password') : t('reset_show_password')}
                    placeholder={t('reset_new_placeholder')}
                    invalid={errors.length > 0}
                    autoFocus
                  />
                  <PasswordInput
                    id="reset-confirm-password"
                    label={t('reset_confirm_label')}
                    value={confirmation}
                    onChange={(v) => { setConfirmation(v); if (errors.length) setErrors([]); }}
                    visible={showPassword}
                    invalid={errors.includes('reset_err_mismatch')}
                  />

                  {errors.length > 0 && (
                    <div id="reset-page-error" role="alert" className="flex items-start gap-2.5 bg-v2-error-50 border border-v2-error-200 rounded-v2-lg px-4 py-3">
                      <AlertCircle size={14} className="text-v2-error-500 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        {errors.map((key) => (
                          <p key={key} className="text-v2-error-600 text-v2-xs leading-relaxed">{t(key)}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  <button type="submit" disabled={saving} aria-busy={saving} className="w-full v2-btn-primary py-3 text-v2-sm font-bold">
                    {saving && (
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {saving ? t('reset_saving') : t('reset_save_btn')}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

interface PasswordInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  invalid: boolean;
  onToggle?: () => void;
  toggleLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
}

function PasswordInput({ id, label, value, onChange, visible, invalid, onToggle, toggleLabel, placeholder, autoFocus }: PasswordInputProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="v2-label">{label}</label>
      <div className="relative">
        <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-v2-text-tertiary pointer-events-none" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'reset-page-error' : undefined}
          className={`v2-input pl-10 ${onToggle ? 'pr-11' : ''} ${invalid ? 'v2-input-error' : ''}`}
        />
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={toggleLabel}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-v2-text-tertiary hover:text-v2-text-secondary transition-colors rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-v2-primary-300"
          >
            {visible ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

interface StatusPanelProps {
  tone: 'success' | 'warning';
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}

function StatusPanel({ tone, icon, title, description, children }: StatusPanelProps) {
  const toneClass = tone === 'success'
    ? 'bg-v2-success-50 border-v2-success-200 text-v2-success-600'
    : 'bg-v2-warning-50 border-v2-warning-200 text-v2-warning-600';
  return (
    <div className="v2-fade-in text-center" role="status" aria-live="polite">
      <div className={`w-12 h-12 mx-auto mb-4 rounded-v2-xl border flex items-center justify-center ${toneClass}`}>{icon}</div>
      <h1 className="font-bold text-v2-text-primary text-v2-xl leading-tight tracking-tight">{title}</h1>
      <p className="text-v2-text-secondary text-v2-sm mt-2 mb-6 leading-relaxed">{description}</p>
      {children}
    </div>
  );
}
