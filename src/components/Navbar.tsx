import { useState } from 'react';
import { LogOut, ChevronDown, User, XCircle, CheckCircle, ShieldCheck } from 'lucide-react';
import type { User as SupaUser } from '@supabase/supabase-js';
import { useI18n, type Lang } from '../lib/i18n';
import { LogoIcon } from './Logo';

interface NavbarProps {
  user: SupaUser | null;
  onLoginClick: () => void;
  onPricingClick: () => void;
  onSignOut: () => void;
  isActive?: boolean;
  isAdmin?: boolean;
  cancelAtPeriodEnd?: boolean;
  onCancelSubscription?: () => void;
}

export default function Navbar({ user, onLoginClick, onPricingClick, onSignOut, isActive, isAdmin, cancelAtPeriodEnd, onCancelSubscription }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { lang, setLang, t } = useI18n();

  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <LogoIcon size={34} />
          <span className="font-bold text-base tracking-tight text-white">
            LocalSEO<span className="text-emerald-400">Hub</span>
          </span>
        </div>

        {/* Center nav — only shown to non-authenticated users */}
        {!user && (
          <nav className="hidden sm:flex items-center gap-1">
            <button
              onClick={onPricingClick}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-emerald-400 hover:text-emerald-300
                hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/20
                transition-all duration-200"
            >
              {t('nav_pricing')}
            </button>
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-3">
          {/* Language toggle */}
          <div className="flex items-center gap-0.5 bg-slate-800/70 border border-slate-700/60 rounded-xl p-0.5">
            {(['es', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-label={l === 'es' ? 'Español' : 'English'}
                className={`flex items-center justify-center h-7 w-9 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 ${
                  lang === l
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {l === 'es' ? 'ES' : 'EN'}
              </button>
            ))}
          </div>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-800/70 border border-slate-700/60
                  hover:border-slate-600 hover:bg-slate-800 transition-all duration-200 text-sm text-slate-300"
              >
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-slate-950 text-xs font-bold">
                  {avatarLetter}
                </div>
                <span className="hidden sm:block max-w-[120px] truncate text-xs">{user.email}</span>
                <ChevronDown size={13} className={`text-slate-500 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 rounded-xl bg-slate-900 border border-slate-700/60 shadow-2xl shadow-black/50 z-20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800">
                      <p className="text-xs text-slate-500">{t('nav_connected_as')}</p>
                      <p className="text-xs text-slate-300 font-medium truncate mt-0.5">{user.email}</p>
                      {isActive && (
                        <div className="flex items-center gap-1.5 mt-2">
                          {cancelAtPeriodEnd ? (
                            <>
                              <XCircle size={11} className="text-amber-400" />
                              <span className="text-xs text-amber-400 font-medium">{t('nav_sub_canceling')}</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle size={11} className="text-emerald-400" />
                              <span className="text-xs text-emerald-400 font-medium">{t('nav_sub_active')}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="py-1">
                      {isAdmin && (
                        <a
                          href="/admin"
                          onClick={() => setMenuOpen(false)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-violet-400 hover:text-violet-300 hover:bg-slate-800 transition-colors"
                        >
                          <ShieldCheck size={14} />
                          Panel de administración
                        </a>
                      )}
                      <button
                        onClick={() => { setMenuOpen(false); onPricingClick(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      >
                        <User size={14} />
                        {t('nav_view_pricing')}
                      </button>
                      {isActive && !cancelAtPeriodEnd && onCancelSubscription && (
                        <button
                          onClick={() => { setMenuOpen(false); onCancelSubscription(); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-amber-400 hover:text-amber-300 hover:bg-slate-800 transition-colors"
                        >
                          <XCircle size={14} />
                          {t('nav_cancel_sub')}
                        </button>
                      )}
                      <button
                        onClick={() => { setMenuOpen(false); onSignOut(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-slate-800 transition-colors"
                      >
                        <LogOut size={14} />
                        {t('nav_sign_out')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <button
                onClick={onPricingClick}
                className="sm:hidden px-3 py-1.5 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {t('nav_pricing')}
              </button>
              <button
                onClick={onLoginClick}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/35 hover:-translate-y-0.5 active:translate-y-0"
              >
                {t('nav_login')}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
