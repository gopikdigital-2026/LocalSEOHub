import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  Eye,
  MousePointerClick,
  Zap,
  BarChart3,
  CalendarDays,
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

interface AdminFunnel {
  unique_sessions: number;
  page_views: number;
  widget_scans: number;
  scan_results: number;
  gates_shown: number;
  register_clicks: number;
  registrations: number;
  logins: number;
  tool_opens: number;
  tool_generates: number;
  by_tool: Record<string, number> | null;
  daily: { fecha: string; events: number; sessions: number }[] | null;
}

type FilterKey = 'all' | 'active' | 'trial' | 'free';
type FunnelRange = 'today' | '7d' | '30d' | 'custom';

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

function computeRange(range: FunnelRange, customFrom: string, customTo: string): { since: string | null; until: string | null } {
  const now = new Date();
  if (range === 'today') {
    const s = new Date(now);
    s.setHours(0, 0, 0, 0);
    return { since: s.toISOString(), until: now.toISOString() };
  }
  if (range === '7d') {
    const s = new Date(now);
    s.setDate(s.getDate() - 7);
    return { since: s.toISOString(), until: now.toISOString() };
  }
  if (range === '30d') {
    const s = new Date(now);
    s.setDate(s.getDate() - 30);
    return { since: s.toISOString(), until: now.toISOString() };
  }
  // custom
  const since = customFrom ? new Date(customFrom + 'T00:00:00').toISOString() : null;
  const until = customTo ? new Date(customTo + 'T23:59:59').toISOString() : now.toISOString();
  return { since, until };
}

// ─── Funnel Date Bar ──────────────────────────────────────────────────────────

function FunnelDateBar({
  range, customFrom, customTo, loading,
  onRange, onCustomFrom, onCustomTo,
}: {
  range: FunnelRange;
  customFrom: string;
  customTo: string;
  loading: boolean;
  onRange: (r: FunnelRange) => void;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
}) {
  const presets: { key: FunnelRange; label: string }[] = [
    { key: 'today', label: 'Hoy' },
    { key: '7d',    label: '7 días' },
    { key: '30d',   label: '30 días' },
    { key: 'custom', label: 'Personalizado' },
  ];

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-4">
      <div className="flex items-center gap-1.5">
        <CalendarDays size={13} className="text-slate-500 shrink-0" />
        <span className="text-xs text-slate-500 font-medium">Período:</span>
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        {presets.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onRange(key)}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
              range === key
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-slate-900 border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
        {loading && <Loader2 size={12} className="text-slate-500 animate-spin ml-1" />}
      </div>

      {range === 'custom' && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">Desde</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFrom(e.target.value)}
              className="px-2 py-1 rounded-lg bg-slate-950/60 border border-slate-800/80 text-slate-200 text-xs focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500">hasta</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomTo(e.target.value)}
              className="px-2 py-1 rounded-lg bg-slate-950/60 border border-slate-800/80 text-slate-200 text-xs focus:outline-none focus:border-violet-500/50 transition-colors"
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Funnel Panel ─────────────────────────────────────────────────────────────

function FunnelStep({
  label, value, prev, icon, color,
}: { label: string; value: number; prev?: number; icon: React.ReactNode; color: string }) {
  const pct = prev && prev > 0 ? Math.round((value / prev) * 100) : null;
  return (
    <div className="flex items-center gap-3">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-slate-400 font-medium truncate">{label}</span>
          <div className="flex items-center gap-2 shrink-0">
            {pct !== null && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${pct >= 50 ? 'bg-emerald-500/15 text-emerald-400' : pct >= 20 ? 'bg-amber-500/15 text-amber-400' : 'bg-red-500/15 text-red-400'}`}>
                {pct}%
              </span>
            )}
            <span className="text-sm font-bold text-white tabular-nums">{value.toLocaleString('es-ES')}</span>
          </div>
        </div>
        <div className="h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${color.split(' ')[0].replace('/10', '')}`}
            style={{ width: prev && prev > 0 ? `${Math.min(100, (value / prev) * 100)}%` : '100%' }}
          />
        </div>
      </div>
    </div>
  );
}

function FunnelPanel({ funnel, funnelLoading, range, customFrom, customTo, onRange, onCustomFrom, onCustomTo }: {
  funnel: AdminFunnel;
  funnelLoading: boolean;
  range: FunnelRange;
  customFrom: string;
  customTo: string;
  onRange: (r: FunnelRange) => void;
  onCustomFrom: (v: string) => void;
  onCustomTo: (v: string) => void;
}) {
  const steps: { label: string; value: number; prev?: number; icon: React.ReactNode; color: string }[] = [
    { label: 'Sesiones únicas',       value: funnel.unique_sessions,  prev: undefined,                 icon: <Eye size={15} className="text-slate-300" />,              color: 'bg-slate-500/10 text-slate-300' },
    { label: 'Vistas de landing',     value: funnel.page_views,       prev: funnel.unique_sessions,    icon: <BarChart3 size={15} className="text-blue-400" />,          color: 'bg-blue-500/10 text-blue-400' },
    { label: 'Análisis iniciados',    value: funnel.widget_scans,     prev: funnel.page_views,         icon: <ScanSearch size={15} className="text-cyan-400" />,         color: 'bg-cyan-500/10 text-cyan-400' },
    { label: 'Resultados vistos',     value: funnel.scan_results,     prev: funnel.widget_scans,       icon: <Activity size={15} className="text-teal-400" />,           color: 'bg-teal-500/10 text-teal-400' },
    { label: 'Gate mostrado',         value: funnel.gates_shown,      prev: funnel.scan_results,       icon: <Clock size={15} className="text-amber-400" />,             color: 'bg-amber-500/10 text-amber-400' },
    { label: 'Clic en Registrarse',   value: funnel.register_clicks,  prev: funnel.gates_shown,        icon: <MousePointerClick size={15} className="text-orange-400" />, color: 'bg-orange-500/10 text-orange-400' },
    { label: 'Registros completados', value: funnel.registrations,    prev: funnel.register_clicks,    icon: <Users size={15} className="text-emerald-400" />,           color: 'bg-emerald-500/10 text-emerald-400' },
    { label: 'Herramienta abierta',   value: funnel.tool_opens,       prev: funnel.registrations,      icon: <Sparkles size={15} className="text-violet-400" />,         color: 'bg-violet-500/10 text-violet-400' },
    { label: 'Generación ejecutada',  value: funnel.tool_generates,   prev: funnel.tool_opens,         icon: <Zap size={15} className="text-pink-400" />,               color: 'bg-pink-500/10 text-pink-400' },
  ];

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Embudo de conversión
        </h2>
      </div>

      <FunnelDateBar
        range={range}
        customFrom={customFrom}
        customTo={customTo}
        loading={funnelLoading}
        onRange={onRange}
        onCustomFrom={onCustomFrom}
        onCustomTo={onCustomTo}
      />

      <div className={`grid grid-cols-1 lg:grid-cols-3 gap-4 transition-opacity duration-200 ${funnelLoading ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
        <div className="lg:col-span-2 rounded-2xl border border-slate-800/80 p-5 space-y-4"
          style={{ background: 'rgba(10,13,24,0.7)', backdropFilter: 'blur(12px)' }}>
          {steps.map((s) => (
            <FunnelStep key={s.label} {...s} />
          ))}
        </div>

        <div className="rounded-2xl border border-slate-800/80 p-5"
          style={{ background: 'rgba(10,13,24,0.7)', backdropFilter: 'blur(12px)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-4">Generaciones por herramienta</p>
          {funnel.by_tool && Object.keys(funnel.by_tool).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(funnel.by_tool)
                .sort(([, a], [, b]) => Number(b) - Number(a))
                .map(([tool, cnt]) => {
                  const max = Math.max(...Object.values(funnel.by_tool ?? {}).map(Number));
                  const pct = max > 0 ? Math.round((Number(cnt) / max) * 100) : 0;
                  const name = tool.replace('generate-', '').replace(/-/g, ' ');
                  return (
                    <div key={tool}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-400 capitalize">{name}</span>
                        <span className="text-xs font-bold text-white tabular-nums">{String(cnt)}</span>
                      </div>
                      <div className="h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-700"
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <Zap size={20} className="text-slate-700 mb-2" />
              <p className="text-slate-600 text-xs">Sin generaciones en este período</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function KPICard({
  label, value, sub, icon, color,
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
  const [funnel, setFunnel] = useState<AdminFunnel | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [page, setPage] = useState(1);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Funnel date range state
  const [funnelRange, setFunnelRange] = useState<FunnelRange>('7d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-stats`;

  const fetchFunnel = useCallback(async (range: FunnelRange, from: string, to: string) => {
    if (!session?.access_token) return;
    setFunnelLoading(true);
    const { since, until } = computeRange(range, from, to);
    try {
      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnelOnly: true, since, until }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setFunnel(data.funnel ?? null);
    } catch { /* ignore */ }
    finally { setFunnelLoading(false); }
  }, [session?.access_token, edgeUrl]);

  const fetchData = useCallback(async () => {
    if (!session?.access_token) { setError('Sin sesión activa.'); setLoading(false); return; }
    setLoading(true);
    setError('');
    const { since, until } = computeRange(funnelRange, customFrom, customTo);
    try {
      const res = await fetch(edgeUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ since, until }),
      });
      if (res.status === 403) { setError('Acceso denegado. Solo administradores.'); setLoading(false); return; }
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setKpis(data.kpis);
      setFunnel(data.funnel ?? null);
      setUsers(data.users ?? []);
      setLastRefresh(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al cargar datos.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, edgeUrl, funnelRange, customFrom, customTo]);

  useEffect(() => { fetchData(); }, [session?.access_token]);

  const handleRangeChange = (newRange: FunnelRange) => {
    setFunnelRange(newRange);
    if (newRange !== 'custom') {
      fetchFunnel(newRange, customFrom, customTo);
    }
  };

  const handleCustomFrom = (v: string) => {
    setCustomFrom(v);
    if (customTo) fetchFunnel('custom', v, customTo);
  };

  const handleCustomTo = (v: string) => {
    setCustomTo(v);
    fetchFunnel('custom', customFrom, v);
  };

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

  useEffect(() => { setPage(1); }, [filter, search]);

  const exportLeads = () => {
    const today = new Date().toISOString().slice(0, 10);
    const headers = ['ID', 'Email', 'Nombre', 'Fecha de Registro', 'Estado de Suscripción', 'Total de Usos'];
    const rows = users.map((u) => {
      const totalUsos =
        (u.usage?.total_seo_generations ?? 0) +
        (u.usage?.total_images_optimized ?? 0) +
        (u.usage?.total_leads_scanned ?? 0);
      return [u.id, u.email, u.full_name, formatDate(u.created_at), u.stripe_status, String(totalUsos)];
    });
    downloadCSV([headers, ...rows], `localseohub_leads_${today}.csv`);
  };

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

        {/* ── Funnel */}
        {funnel && (
          <FunnelPanel
            funnel={funnel}
            funnelLoading={funnelLoading}
            range={funnelRange}
            customFrom={customFrom}
            customTo={customTo}
            onRange={handleRangeChange}
            onCustomFrom={handleCustomFrom}
            onCustomTo={handleCustomTo}
          />
        )}

        {/* ── User Table */}
        <section>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Usuarios — {filtered.length.toLocaleString('es-ES')} resultados
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-900/80">
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Usuario</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3 hidden md:table-cell">Registro</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Estado</th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-3 py-3 hidden lg:table-cell">
                      <span className="flex items-center justify-center gap-1"><Sparkles size={10} /> SEO</span>
                    </th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-3 py-3 hidden lg:table-cell">
                      <span className="flex items-center justify-center gap-1"><Image size={10} /> Imágenes</span>
                    </th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-3 py-3 hidden lg:table-cell">
                      <span className="flex items-center justify-center gap-1"><ScanSearch size={10} /> Leads</span>
                    </th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3 hidden xl:table-cell">
                      <span className="flex items-center gap-1"><Clock size={10} /> Última act.</span>
                    </th>
                    <th className="text-center text-[10px] font-semibold uppercase tracking-widest text-slate-500 px-4 py-3">Acción</th>
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
                                <p className="text-xs font-semibold text-slate-200 truncate max-w-[160px]">{u.full_name}</p>
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

        <footer className="text-center py-4">
          <p className="text-[11px] text-slate-600">
            Panel de administración · Acceso restringido
          </p>
        </footer>
      </main>
    </div>
  );
}
