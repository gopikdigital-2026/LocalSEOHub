import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  Calendar,
  ClipboardList,
  FileText,
  Star,
  Eye,
  BarChart2,
  Menu,
  X,
  Building2,
  LogOut,
  ChevronDown,

} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { trackNavigationClick } from '../../services/analytics/v2Analytics';

interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'hoy', label: 'Hoy', path: '/app-v2/hoy', icon: <Calendar size={18} /> },
  { id: 'plan', label: 'Plan', path: '/app-v2/plan', icon: <ClipboardList size={18} /> },
  { id: 'contenido', label: 'Contenido', path: '/app-v2/contenido', icon: <FileText size={18} /> },
  { id: 'reputacion', label: 'Reputacion', path: '/app-v2/reputacion', icon: <Star size={18} /> },
  { id: 'visibilidad', label: 'Visibilidad', path: '/app-v2/visibilidad', icon: <Eye size={18} /> },
  { id: 'informes', label: 'Resumen', path: '/app-v2/informes', icon: <BarChart2 size={18} /> },
  { id: 'negocio', label: 'Mi negocio', path: '/app-v2/negocio', icon: <Building2 size={18} /> },
];

function SidebarNav() {
  const { session, signOut } = useAuth();
  const userEmail = session?.user?.email ?? '';
  const userName = session?.user?.user_metadata?.name || userEmail.split('@')[0] || 'Usuario';

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white border-r border-v2-border-light z-30">
      {/* Logo */}
      <div className="h-16 flex items-center px-6 border-b border-v2-border-light">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-v2-lg bg-v2-primary-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">L</span>
          </div>
          <div>
            <span className="text-v2-sm font-bold text-v2-text-primary">LocalSEOHub</span>
            <span className="ml-1.5 text-v2-xs font-medium text-v2-primary-600 bg-v2-primary-50 px-1.5 py-0.5 rounded-full">2.0</span>
          </div>
        </div>
      </div>

      {/* Business selector */}
      <div className="px-4 py-4 border-b border-v2-border-light">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-v2-lg bg-v2-neutral-50 border border-v2-border-light hover:border-v2-border-DEFAULT transition-colors">
          <div className="w-8 h-8 rounded-v2-md bg-v2-secondary-100 flex items-center justify-center">
            <Building2 size={14} className="text-v2-secondary-600" />
          </div>
          <div className="flex-1 text-left min-w-0">
            <p className="text-v2-sm font-medium text-v2-text-primary truncate">Mi Negocio</p>
            <p className="text-v2-xs text-v2-text-tertiary">Sin configurar</p>
          </div>
          <ChevronDown size={14} className="text-v2-neutral-400 shrink-0" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.id}
            to={item.path}
            onClick={() => trackNavigationClick(item.id)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-v2-lg text-v2-sm font-medium transition-all duration-150
              ${isActive
                ? 'bg-v2-primary-50 text-v2-primary-700 border border-v2-primary-200'
                : 'text-v2-text-secondary hover:bg-v2-neutral-50 hover:text-v2-text-primary border border-transparent'}`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* User section */}
      <div className="px-4 py-4 border-t border-v2-border-light">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-v2-primary-100 flex items-center justify-center">
            <span className="text-v2-sm font-semibold text-v2-primary-700">{userName[0]?.toUpperCase()}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-v2-sm font-medium text-v2-text-primary truncate">{userName}</p>
            <p className="text-v2-xs text-v2-text-tertiary truncate">{userEmail}</p>
          </div>
          <button
            onClick={() => signOut()}
            className="p-2 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-400 hover:text-v2-error-500 transition-colors"
            title="Cerrar sesion"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function MobileHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { session, signOut } = useAuth();
  const userName = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Usuario';

  return (
    <>
      <header className="lg:hidden fixed top-0 inset-x-0 h-14 bg-white border-b border-v2-border-light flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-v2-md bg-v2-primary-600 flex items-center justify-center">
            <span className="text-white font-bold text-xs">L</span>
          </div>
          <span className="text-v2-sm font-bold text-v2-text-primary">LocalSEOHub</span>
        </div>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-500"
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </header>

      {/* Mobile menu drawer */}
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-v2-neutral-900/30 backdrop-blur-sm lg:hidden" onClick={() => setMenuOpen(false)} />
          <div className="fixed top-14 right-0 bottom-0 z-50 w-72 bg-white border-l border-v2-border-light p-4 space-y-4 overflow-y-auto lg:hidden">
            <div className="flex items-center gap-3 pb-4 border-b border-v2-border-light">
              <div className="w-9 h-9 rounded-full bg-v2-primary-100 flex items-center justify-center">
                <span className="text-v2-sm font-semibold text-v2-primary-700">{userName[0]?.toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-v2-sm font-medium text-v2-text-primary truncate">{userName}</p>
              </div>
            </div>
            <nav className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.id}
                  to={item.path}
                  onClick={() => { trackNavigationClick(item.id); setMenuOpen(false); }}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-v2-lg text-v2-sm font-medium transition-all
                    ${isActive ? 'bg-v2-primary-50 text-v2-primary-700' : 'text-v2-text-secondary hover:bg-v2-neutral-50'}`
                  }
                >
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="pt-4 border-t border-v2-border-light">
              <button
                onClick={() => signOut()}
                className="flex items-center gap-3 px-3 py-2.5 rounded-v2-lg text-v2-sm font-medium text-v2-error-500 hover:bg-v2-error-50 w-full transition-colors"
              >
                <LogOut size={18} />
                Cerrar sesion
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function MobileBottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-v2-border-light flex items-center justify-around h-16 z-30 safe-area-pb">
      {NAV_ITEMS.slice(0, 5).map((item) => (
        <NavLink
          key={item.id}
          to={item.path}
          onClick={() => trackNavigationClick(item.id)}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-v2-md transition-colors min-w-[56px]
            ${isActive ? 'text-v2-primary-600' : 'text-v2-neutral-400'}`
          }
        >
          {item.icon}
          <span className="text-[10px] font-medium">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

export default function AppShellV2() {
  return (
    <div className="min-h-screen bg-v2-bg-primary font-v2">
      <SidebarNav />
      <MobileHeader />

      {/* Main content */}
      <main className="lg:pl-64 pt-14 lg:pt-0 pb-20 lg:pb-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <Outlet />
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
