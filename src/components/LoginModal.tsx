import { useState } from 'react';
import { X, Mail, Lock, Eye, EyeOff, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { trackCompleteRegistration } from '../lib/pixel';
import { track } from '../lib/analytics';

interface LoginModalProps {
  onClose: () => void;
  initialMode?: Mode;
  initialError?: string;
  initialEmail?: string;
}

type Mode = 'login' | 'signup';

function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || '';
  return /Instagram|FBAN|FBAV|FB_IAB|FB4A|FBIOS|Twitter|Snapchat|LinkedIn|TikTok|BytedanceWebview/i.test(ua);
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

export default function LoginModal({ onClose, initialMode = 'login', initialError = '', initialEmail = '' }: LoginModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [success, setSuccess] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  const inApp = isInAppBrowser();
  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = window.location.href;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2500);
    }
  };

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    clearMessages();

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(fallbackTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    const onVisible = () => { if (!document.hidden) { cleanup(); setGoogleLoading(false); } };
    document.addEventListener('visibilitychange', onVisible);
    const fallbackTimer = setTimeout(() => { cleanup(); setGoogleLoading(false); }, 15000);

    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (authError) {
      cleanup();
      setError(translateError(authError.message));
      setGoogleLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    clearMessages();

    if (mode === 'login') {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        setError(translateError(authError.message));
      } else {
        onClose();
      }
    } else {
      track('register_attempt', { method: 'email' });
      const res = await supabase.functions.invoke('signup-instant', { body: { email, password } });
      if (res.error) {
        track('register_failed', { method: 'email', error: res.error.message });
        setError(translateError(res.error.message));
        setLoading(false);
        return;
      }
      const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
      if (!loginErr) {
        trackCompleteRegistration();
        onClose();
      } else {
        track('register_partial_failure', { step: 'auto_login', error: loginErr.message });
        setError(translateError(loginErr.message));
      }
    }

    setLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-v2-neutral-900/50 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-v2-2xl shadow-v2-xl border border-v2-border v2-scale-in overflow-hidden">
        <div className="p-7 sm:p-8">
          {/* Header */}
          <div className="flex items-start justify-between mb-7">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-v2-xl bg-v2-primary-50 border border-v2-primary-200 flex items-center justify-center">
                <span className="text-lg font-bold text-v2-primary-600">L</span>
              </div>
              <div>
                <h2 className="font-bold text-v2-text-primary text-v2-lg leading-tight tracking-tight">
                  {mode === 'login' ? 'Bienvenido de nuevo' : 'Crear cuenta gratis'}
                </h2>
                <p className="text-v2-text-tertiary text-v2-xs mt-0.5">
                  {mode === 'login' ? 'Accede a tu panel de LocalSEOHub' : '7 dias gratis · sin tarjeta hasta decidir'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="v2-btn-icon"
            >
              <X size={18} />
            </button>
          </div>

          {/* In-app browser warning */}
          {inApp ? (
            <div className="mb-5 rounded-v2-xl border border-v2-warning-200 bg-v2-warning-50 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-v2-lg bg-v2-warning-100 flex items-center justify-center shrink-0">
                  <ExternalLink size={15} className="text-v2-warning-600" />
                </div>
                <div>
                  <p className="text-v2-warning-700 text-v2-xs font-bold mb-1">Abre en tu navegador para usar Google</p>
                  <p className="text-v2-warning-600 text-[11px] leading-relaxed">
                    {isAndroid()
                      ? 'Toca los tres puntos arriba y selecciona "Abrir en Chrome" o tu navegador.'
                      : 'Toca el icono de compartir y selecciona "Abrir en Safari" para continuar con Google.'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-v2-lg border border-v2-warning-200 bg-white text-v2-warning-700 text-v2-xs font-semibold hover:bg-v2-warning-50 transition-colors"
              >
                {linkCopied ? <Check size={13} /> : <Copy size={13} />}
                {linkCopied ? 'Enlace copiado!' : 'Copiar enlace para abrir en otro navegador'}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-3 rounded-v2-lg text-v2-sm font-semibold
                  bg-white border border-v2-border hover:bg-v2-neutral-50 hover:border-v2-border-dark
                  text-v2-text-primary shadow-v2-xs
                  transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                  active:scale-[0.99] mb-5"
              >
                {googleLoading ? (
                  <svg className="animate-spin w-4 h-4 text-v2-text-tertiary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <GoogleIcon />
                )}
                {googleLoading ? 'Redirigiendo...' : 'Continuar con Google'}
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-v2-border" />
                <span className="text-v2-xs text-v2-text-tertiary font-medium">o con email</span>
                <div className="flex-1 h-px bg-v2-border" />
              </div>
            </>
          )}

          {/* Email form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-1.5">
              <label className="v2-label">Email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-v2-text-tertiary pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="tu@email.com"
                  className="v2-input pl-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="v2-label">Contrasena</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-v2-text-tertiary pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Minimo 6 caracteres"
                  className="v2-input pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-v2-text-tertiary hover:text-v2-text-secondary transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-v2-error-50 border border-v2-error-200 rounded-v2-lg px-4 py-3">
                <AlertCircle size={14} className="text-v2-error-500 mt-0.5 shrink-0" />
                <p className="text-v2-error-600 text-v2-xs leading-relaxed">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-v2-success-50 border border-v2-success-200 rounded-v2-lg px-4 py-3">
                <p className="text-v2-success-700 text-v2-xs">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full v2-btn-primary py-3 text-v2-sm font-bold"
            >
              {loading && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {mode === 'login' ? 'Iniciar Sesion' : 'Crear Cuenta Gratis'}
            </button>
          </form>

          <p className="text-center text-v2-xs text-v2-text-tertiary mt-5">
            {mode === 'login' ? 'No tienes cuenta?' : 'Ya tienes cuenta?'}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); clearMessages(); }}
              className="text-v2-primary-600 hover:text-v2-primary-700 font-medium transition-colors"
            >
              {mode === 'login' ? 'Registrate gratis' : 'Inicia sesion'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Email o contrasena incorrectos.';
  if (msg.includes('Email not confirmed')) return 'Confirma tu email antes de iniciar sesion.';
  if (msg.includes('User already registered')) return 'Este email ya esta registrado. Inicia sesion.';
  if (msg.includes('Password should be')) return 'La contrasena debe tener al menos 6 caracteres.';
  if (msg.includes('provider')) return 'Google no esta disponible ahora. Registrate con email.';
  return msg;
}
