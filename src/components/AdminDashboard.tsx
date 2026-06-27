import React, { useEffect, useState, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  Users,
  TrendingUp,
  DollarSign,
  Activity,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Image,
  ScanSearch,
  AlertCircle,
  Loader2,
  Clock,
  Crown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

interface AdminUsage {
  total_seo_generations: number;
  total_images_optimized: number;
  total_leads_scanned: number;
  last_active: string | null;
}

interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  stripe_status: 'active' | 'trialing' | 'trial' | 'free';
  usage: AdminUsage;
}

interface AdminKPIs {
  totalUsers: number;
  activeSubscriptions: number;
  trialUsers: number;
  estimatedMRR: number;
  conversionRate: number;
}

type FilterKey = 'all' | 'active' | 'trial' | 'free';

const PAGE_SIZE = 15;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatCurrency(n: number) {
  return n.toLocaleString('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
}

function csvEscape(v: string) {
  return `"${String(v).replace(/"/g, '""')}"`;
}

function downloadCSV(rows: string[][], filename: string) {
  const content = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KPICard({
  label,
  value,
  sub,
  icon,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="relative rounded-2xl border border-slate-800/80 p-5 overflow-hidden group hover:border-white/10 transition-all duration-300 hover:-translate-y-0.5"
      style={{ background: 'rgba(10,13,24,0.7)', backdropFilter: 'blur(12px)' }}
    >
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${color} blur-3xl`} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{label}</span>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color.replace('bg-', 'bg-').replace('/5', '/10')}`}>
            {icon}
          </div>
        </div>
        <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: AdminUser['stripe_status'] }) {
  const map: Record<AdminUser['stripe_status'], { label: string; cls: string }> = {
    active:   { label: 'Pro Activo',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    trialing: { label: 'Trial Stripe', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    trial:    { label: 'Prueba 7d',   cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    free:     { label: 'Gratuito',    cls: 'bg-slate-700/60 text-slate-400 border-slate-600/40' },
  };
  const { label, cls } = map[status] ?? map.free;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminDashboard({ session }: { session: Session | null }) {
  const [kpis, setKpis] = useState<AdminKPIs | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = async () => {
    if (!session?.access_token) { setError('Sin sesión activa.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-stats`,
        { headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' } }
      );
      if (res.status === 403) { setError('Acceso denegado. Solo administradores.'); setLoading(false); return; }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setKpis(data.kpis);
      setUsers(data.users ?? []);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [session?.access_token]);

  // ── Filtered + searched list
  const filtered = useMemo(() => {
    let list = users;
    if (filter !== 'all') {
      if (filter === 'active') list = list.filter((u) => u.stripe_status === 'active');
      else if (filter === 'trial') list = list.filter((u) => u.stripe_status === 'trial' || u.stripe_status === 'trialing');
      else if (filter === 'free') list = list.filter((u) => u.stripe_status === 'free');
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((u) => u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q));
    }
    return list;
  }, [users, filter, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when filter/search changes
  useEffect(() => { setPage(1); }, [filter, search]);

  // ── CSV export: full list (no filter)
  const exportLeads = () => {
    const today = new Date().toISOString().slice(0, 10);
    const headers = ['ID', 'Email', 'Nombre', 'Fecha de Registro', 'Estado de Suscripción', 'Total de Usos'];
    const rows = users.map((u) => {
      const totalUsos =
        (u.usage?.total_seo_generations ?? 0) +
        (u.usage?.total_images_optimized ?? 0) +
        (u.usage?.total_leads_scanned ?? 0);
      return [
        u.id,
        u.email,
        u.full_name,
        formatDate(u.created_at),
        u.stripe_status,
        String(totalUsos),
      ];
    });
    downloadCSV([headers, ...rows], `localseohub_leads_${today}.csv`);
  };

  // ── Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={32} className="text-violet-400 animate-spin" />
          <p className="text-slate-400 text-sm">Cargando panel de administración…</p>
        </div>
      </div>
    );
  }

  // ── Error state
  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-2xl bg-slate-900 border border-red-500/20 p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={20} className="text-red-400" />
          </div>
          <h2 className="text-white font-bold text-lg mb-2">Acceso restringido</h2>
          <p className="text-slate-400 text-sm mb-6">{error}</p>
          <a href="/" className="inline-flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors">
            <ChevronLeft size={14} /> Volver a la app
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* ── Top bar */}
      <header className="sticky top-0 z-40 border-b border-white/5" style={{ background: 'rgba(7,8,15,0.88)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
              <ShieldCheck size={16} className="text-violet-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white tracking-tight">Panel Admin</h1>
              {lastRefresh && (
                <p className="text-[10px] text-slate-500 leading-none">
                  Actualizado {lastRefresh.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportLeads}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold transition-colors shadow-lg shadow-violet-500/20"
            >
              <Download size={13} />
              Exportar Leads (CSV)
            </button>
            <button
              onClick={fetchData}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-white transition-colors"
              title="Recargar datos"
            >
              <RefreshCw size={13} />
            </button>
            <a
              href="/"
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-slate-400 hover:text-white transition-colors"
              title="Volver a la app"
            >
              <ChevronLeft size={14} />
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* ── KPI Cards */}
        {kpis && (
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">
              Métricas de negocio
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPICard
                label="Usuarios Totales"
                value={kpis.totalUsers.toLocaleString('es-ES')}
                sub="registrados en la plataforma"
                icon={<Users size={16} className="text-violet-400" />}
                color="bg-violet-500/5"
              />
              <KPICard
                label="Suscripciones Activas"
                value={kpis.activeSubscriptions.toLocaleString('es-ES')}
                sub={`${kpis.trialUsers} en periodo de prueba`}
                icon={<Crown size={16} className="text-indigo-400" />}
                color="bg-indigo-500/5"
              />
              <KPICard
                label="MRR Estimado"
                value={formatCurrency(kpis.estimatedMRR)}
                sub="usuarios Pro × 9,99 €"
                icon={<DollarSign size={16} className="text-emerald-400" />}
                color="bg-emerald-500/5"
              />
              <KPICard
                label="Tasa de Conversión"
                value={`${kpis.conversionRate}%`}
                sub="registrados que pagan"
                icon={<TrendingUp size={16} className="text-blue-400" />}
                color="bg-blue-500/5"
              />
            </div>
          </section>
        )}

        {/* ── User Table */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Usuarios — {filtered.length.toLocaleString('es-ES')} resultados
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Search */}
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar email o nombre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-7 pr-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800/80 text-slate-200 text-xs placeholder-slate-600 focus:outline-none focus:border-violet-500/50 transition-colors w-48"
                />
              </div>
              {/* Filter buttons */}
              {(['all', 'active', 'trial', 'free'] as FilterKey[]).map((f) => {
                const labels: Record<FilterKey, string> = {
                  all: 'Todos', active: 'Suscritos', trial: 'Prueba', free: 'Gratuitos',
                };
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      filter === f
                        ? 'bg-violet-600 border-violet-500 text-white'
                        : 'bg-slate-900 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                    }`}
                  >
                    {labels[f]}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="rounded-2xl border border-slate-800/80 overflow-hidden"
            style={{ background: 'rgba(10,13,24,0.6)', backdropFilter: 'blur(12px)' }}
          >
            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-900/80">
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">
                      Usuario
                    </th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3 hidden md:table-cell">
                      Registro
                    </th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">
                      Estado
                    </th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-3 py-3 hidden lg:table-cell">
                      <span className="flex items-center justify-center gap-1">
                        <Sparkles size={10} /> SEO
                      </span>
                    </th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-3 py-3 hidden lg:table-cell">
                      <span className="flex items-center justify-center gap-1">
                        <Image size={10} /> Imágenes
                      </span>
                    </th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-3 py-3 hidden lg:table-cell">
                      <span className="flex items-center justify-center gap-1">
                        <ScanSearch size={10} /> Leads
                      </span>
                    </th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3 hidden xl:table-cell">
                      <span className="flex items-center gap-1">
                        <Clock size={10} /> Última act.
                      </span>
                    </th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {paginated.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center py-12 text-slate-500 text-sm">
                        No se encontraron usuarios con estos filtros.
                      </td>
                    </tr>
                  ) : (
                    paginated.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/30 transition-colors group">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0 text-[11px] font-bold text-violet-400">
                              {(u.full_name || u.email).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              {u.full_name && (
                                <p className="text-xs font-semibold text-slate-200 truncate max-w-[160px]">
                                  {u.full_name}
                                </p>
                              )}
                              <p className="text-xs text-slate-400 truncate max-w-[200px]">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <span className="text-xs text-slate-400">{formatDate(u.created_at)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={u.stripe_status} />
                        </td>
                        <td className="px-3 py-3 text-center hidden lg:table-cell">
                          <span className={`text-xs font-semibold ${u.usage.total_seo_generations > 0 ? 'text-violet-300' : 'text-slate-600'}`}>
                            {u.usage.total_seo_generations}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center hidden lg:table-cell">
                          <span className={`text-xs font-semibold ${u.usage.total_images_optimized > 0 ? 'text-indigo-300' : 'text-slate-600'}`}>
                            {u.usage.total_images_optimized}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center hidden lg:table-cell">
                          <span className={`text-xs font-semibold ${u.usage.total_leads_scanned > 0 ? 'text-blue-300' : 'text-slate-600'}`}>
                            {u.usage.total_leads_scanned}
                          </span>
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          <span className="text-xs text-slate-500">
                            {u.usage.last_active ? formatDate(u.usage.last_active) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <a
                            href={`mailto:${u.email}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-800 hover:bg-violet-600 border border-slate-700/60 hover:border-violet-500 text-slate-400 hover:text-white text-[11px] font-medium transition-all duration-200 opacity-0 group-hover:opacity-100"
                          >
                            Contactar
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/80 bg-slate-900/60">
                <p className="text-xs text-slate-500">
                  Página {page} de {totalPages} — {filtered.length} usuarios
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft size={13} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.min(Math.max(page - 2, 1) + i, totalPages);
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`w-7 h-7 rounded-lg text-xs font-semibold transition-colors ${
                          pageNum === page
                            ? 'bg-violet-600 text-white border border-violet-500'
                            : 'bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-800 border border-slate-700/60 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Footer */}
        <footer className="text-center py-4">
          <p className="text-[11px] text-slate-600">
            Panel de administración · Acceso restringido
          </p>
        </footer>
      </main>
    </div>
  );
}
