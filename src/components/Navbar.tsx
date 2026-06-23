import { useState } from 'react';
import { Zap, LogOut, ChevronDown, User } from 'lucide-react';
import type { User as SupaUser } from '@supabase/supabase-js';

interface NavbarProps {
  user: SupaUser | null;
  onLoginClick: () => void;
  onPricingClick: () => void;
  onSignOut: () => void;
}

export default function Navbar({ user, onLoginClick, onPricingClick, onSignOut }: NavbarProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const avatarLetter = user?.email?.[0]?.toUpperCase() ?? 'U';

  return (
    <header className="border-b border-slate-800/80 bg-slate-950/95 backdrop-blur-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Zap size={15} className="text-slate-950" fill="currentColor" />
          </div>
          <span className="font-bold text-base tracking-tight text-white">
            LocalSEO<span className="text-emerald-400">Hub</span>
          </span>
        </div>

        {/* Center nav */}
        <nav className="hidden sm:flex items-center gap-1">
          <button
            onClick={onPricingClick}
            className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800/60 transition-all duration-200 font-medium"
          >
            Precios
          </button>
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
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
                  <div className="absolute right-0 mt-2 w-52 rounded-xl bg-slate-900 border border-slate-700/60 shadow-2xl shadow-black/50 z-20 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800">
                      <p className="text-xs text-slate-500">Conectado como</p>
                      <p className="text-xs text-slate-300 font-medium truncate mt-0.5">{user.email}</p>
                    </div>
                    <div className="py-1">
                      <button
                        onClick={() => { setMenuOpen(false); onPricingClick(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                      >
                        <User size={14} />
                        Ver Precios
                      </button>
                      <button
                        onClick={() => { setMenuOpen(false); onSignOut(); }}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-slate-800 transition-colors"
                      >
                        <LogOut size={14} />
                        Cerrar sesión
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
                className="sm:hidden px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
              >
                Precios
              </button>
              <button
                onClick={onLoginClick}
                className="px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/35 hover:-translate-y-0.5 active:translate-y-0"
              >
                Iniciar Sesión
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
