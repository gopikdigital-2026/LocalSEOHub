import { useState } from 'react';
import { X, Mail, Lock, Zap, Eye, EyeOff, AlertCircle, ExternalLink, Copy, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { trackCompleteRegistration } from '../lib/pixel';
import { track } from '../lib/analytics';

interface LoginModalProps {
  onClose: () => void;
  initialMode?: Mode;
  initialError?: string;
}

type Mode = 'login' | 'signup';

function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || '';
  return /Instagram|FBAN|FBAV|FB_IAB|FB4A|FBIOS|Twitter|Snapchat|LinkedIn|TikTok|BytedanceWebview/i.test(ua);
}

function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent);
}

export default function LoginModal({ onClose, initialMode = 'login', initialError = '' }: LoginModalProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
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
      // fallback for older browsers
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
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (authError) {
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
        track('login_success', { method: 'email' });
        onClose();
      }
    } else {
      const { data, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) {
        setError(translateError(authError.message));
      } else if (data.session) {
        trackCompleteRegistration();
        track('register_success', { method: 'email' });
        onClose();
      } else {
        // Email confirmation enabled — try auto-login so the user isn't stranded
        const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
        if (!loginErr) {
          trackCompleteRegistration();
          track('register_success', { method: 'email' });
          onClose();
        } else {
          setSuccess('¡Cuenta creada! Revisa tu bandeja de entrada (y la carpeta de spam) para confirmar el email, luego inicia sesión.');
        }
      }
    }

    setLoading(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-[#05060b]/85 backdrop-blur-md" />

      <div
        className="relative w-full max-w-md rounded-2xl overflow-hidden"
        style={{
          background: 'rgba(12,24,38,0.88)',
          backdropFilter: 'blur(28px) saturate(160%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 40px 80px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.09)',
        }}
      >
        <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-teal-400 to-blue-500" />

        <div className="p-7">
          {/* Header */}
          <div className="flex items-start justify-between mb-7">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-500/30">
                <Zap size={18} className="text-slate-950" fill="currentColor" />
              </div>
              <div>
                <h2 className="font-extrabold text-white text-lg leading-tight tracking-tight">
                  {mode === 'login' ? 'Bienvenido de nuevo' : 'Crear cuenta gratis'}
                </h2>
                <p className="text-slate-500 text-xs mt-0.5">
                  {mode === 'login' ? 'Accede a tu panel de LocalSEOHub' : '7 días gratis · sin tarjeta hasta decidir'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 transition-colors p-1 rounded-lg hover:bg-slate-800"
            >
              <X size={18} />
            </button>
          </div>

          {/* In-app browser warning */}
          {inApp ? (
            <div className="mb-5 rounded-xl border border-amber-500/25 bg-amber-500/8 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                  <ExternalLink size={15} className="text-amber-400" />
                </div>
                <div>
                  <p className="text-amber-300 text-xs font-bold mb-1">Abre en tu navegador para usar Google</p>
                  <p className="text-amber-200/60 text-[11px] leading-relaxed">
                    {isAndroid()
                      ? 'Toca los tres puntos (⋮) arriba y selecciona "Abrir en Chrome" o tu navegador.'
                      : 'Toca el icono de compartir y selecciona "Abrir en Safari" para continuar con Google.'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCopyLink}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg border border-amber-500/25 bg-amber-500/10 text-amber-300 text-xs font-semibold hover:bg-amber-500/20 transition-colors"
              >
                {linkCopied ? <Check size={13} /> : <Copy size={13} />}
                {linkCopied ? '¡Enlace copiado!' : 'Copiar enlace para abrir en otro navegador'}
              </button>
            </div>
          ) : (
            /* Google OAuth button — only shown outside in-app browsers */
            <>
              <button
                type="button"
                onClick={handleGoogleAuth}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl text-sm font-semibold
                  bg-white/5 border border-white/10 text-slate-200
                  hover:bg-white/10 hover:border-white/20 hover:text-white
                  transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                  active:scale-[0.99] mb-5"
              >
                {googleLoading ? (
                  <svg className="animate-spin w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <GoogleIcon />
                )}
                {googleLoading ? 'Redirigiendo...' : 'Continuar con Google'}
              </button>

              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-slate-800/80" />
                <span className="text-xs text-slate-600 font-medium">o con email</span>
                <div className="flex-1 h-px bg-slate-800/80" />
              </div>
            </>
          )}

          {/* Email form */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Email</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="tu@email.com"
                  className="w-full bg-slate-950/70 border border-slate-800/80 rounded-xl pl-10 pr-4 py-3.5 text-sm
                    text-slate-100 placeholder-slate-600 outline-none transition-all duration-200
                    focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Contraseña</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full bg-slate-950/70 border border-slate-800/80 rounded-xl pl-10 pr-11 py-3.5 text-sm
                    text-slate-100 placeholder-slate-600 outline-none transition-all duration-200
                    focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
                <p className="text-red-400 text-xs leading-relaxed">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
                <p className="text-emerald-400 text-xs">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full py-4 rounded-xl font-bold text-sm tracking-wide transition-all duration-300
                bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                text-slate-950 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40
                disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center gap-2"
            >
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : null}
              {mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta Gratis'}
            </button>
          </form>

          <p className="text-center text-xs text-slate-500 mt-5">
            {mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}{' '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); clearMessages(); }}
              className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              {mode === 'login' ? 'Regístrate gratis' : 'Inicia sesión'}
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
  if (msg.includes('Invalid login credentials')) return 'Email o contraseña incorrectos.';
  if (msg.includes('Email not confirmed')) return 'Confirma tu email antes de iniciar sesión.';
  if (msg.includes('User already registered')) return 'Este email ya está registrado. Inicia sesión.';
  if (msg.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  if (msg.includes('provider')) return 'Google no está disponible ahora. Regístrate con email.';
  return msg;
}
