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
    <header
      className="sticky top-0 z-40 border-b border-white/5"
      style={{ background: 'rgba(7,8,15,0.88)', backdropFilter: 'blur(20px) saturate(160%)' }}
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <LogoIcon size={32} />
          <span className="font-extrabold text-base tracking-tight text-white">
            LocalSEO<span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Hub</span>
          </span>
        </div>

        {/* Center nav — only shown to non-authenticated users */}
        {!user && (
          <nav className="hidden sm:flex items-center gap-1">
            <button
              onClick={onPricingClick}
              className="px-4 py-2 rounded-full text-sm font-semibold text-emerald-400 hover:text-emerald-300
                hover:bg-emerald-500/10 transition-all duration-200"
            >
              {t('nav_pricing')}
            </button>
          </nav>
        )}

        {/* Right side */}
        <div className="flex items-center gap-2.5">
          {/* Language toggle */}
          <div
            className="flex items-center gap-0.5 rounded-full p-0.5"
            style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid rgba(255,255,255,0.07)' }}
          >
            {(['es', 'en'] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                aria-label={l === 'es' ? 'Español' : 'English'}
                className={`flex items-center justify-center h-7 w-9 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${
                  lang === l
                    ? 'bg-slate-700 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2.5 pl-2 pr-3.5 py-1.5 rounded-full transition-all duration-200 text-sm text-slate-300 hover:text-white"
                style={{ background: 'rgba(30,41,59,0.55)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-slate-950 text-xs font-bold shadow-lg shadow-emerald-500/25">
                  {avatarLetter}
                </div>
                <span className="hidden sm:block max-w-[120px] truncate text-xs font-medium">{user.email}</span>
                <ChevronDown size={12} className={`text-slate-500 transition-transform duration-200 ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div
                    className="absolute right-0 mt-2.5 w-60 rounded-2xl z-20 overflow-hidden"
                    style={{
                      background: 'rgba(10,12,22,0.97)',
                      backdropFilter: 'blur(24px)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      boxShadow: '0 25px 50px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04)',
                    }}
                  >
                    <div className="px-4 py-3.5 border-b border-white/5">
                      <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">{t('nav_connected_as')}</p>
                      <p className="text-xs text-slate-200 font-medium truncate mt-1">{user.email}</p>
                      {isActive && (
                        <div className="flex items-center gap-1.5 mt-2">
                          {cancelAtPeriodEnd ? (
                            <><XCircle size={10} className="text-amber-400" /><span className="text-[11px] text-amber-400 font-semibold">{t('nav_sub_canceling')}</span></>
                          ) : (
                            <><CheckCircle size={10} className="text-emerald-400" /><span className="text-[11px] text-emerald-400 font-semibold">{t('nav_sub_active')}</span></>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="py-1.5">
                      {isAdmin && (
                        <a
                          href="/admin"
                          onClick={() => setMenuOpen(false)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-violet-400 hover:text-violet-300 hover:bg-white/5 transition-colors"
                        >
                          <ShieldCheck size={13} />
                          Panel de administración
                        </a>
                      )}
                      <button
                        onClick={() => { setMenuOpen(false); onPricingClick(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <User size={13} />
                        {t('nav_view_pricing')}
                      </button>
                      {isActive && !cancelAtPeriodEnd && onCancelSubscription && (
                        <button
                          onClick={() => { setMenuOpen(false); onCancelSubscription(); }}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-amber-400 hover:text-amber-300 hover:bg-white/5 transition-colors"
                        >
                          <XCircle size={13} />
                          {t('nav_cancel_sub')}
                        </button>
                      )}
                      <div className="mx-3 my-1.5 border-t border-white/5" />
                      <button
                        onClick={() => { setMenuOpen(false); onSignOut(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-white/5 transition-colors"
                      >
                        <LogOut size={13} />
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
                className="px-5 py-2 rounded-full text-sm font-bold transition-all duration-200
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-md shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0"
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
