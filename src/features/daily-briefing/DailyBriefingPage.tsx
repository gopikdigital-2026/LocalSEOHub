import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { createLocalRepository } from '../business-memory/repository';
import { createRealityRepository } from '../reality-engine/repositories';
import { getDailyActions } from './engine';
import { demoRecommendations } from '../../app-v2/demo/demoData';
import {
  trackDashboardOpen,
  trackDashboardActionClick,
  trackDashboardBusinessEdit,
  trackDashboardGrowthDetails,
  trackDashboardWorkspaceOpen,
} from '../../services/analytics/v2Analytics';
import type { Recommendation } from '../../domain/types';
import type { BusinessProfile, TimelineEvent } from '../business-memory/types';
import type { SourceState } from '../reality-engine/types';
import {
  ArrowRight,
  Building2,
  Calendar,
  Clock,
  Edit3,
  ExternalLink,
  Globe,
  MapPin,
  MessageSquare,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';

// ─── Data Hook ──────────────────────────────────────────────────────────────

function useDashboardData() {
  const memoryRepo = useMemo(() => createLocalRepository(), []);
  const realityRepo = useMemo(() => createRealityRepository(), []);

  const memoryState = memoryRepo.load();
  const realityState = realityRepo.load();
  const profile = memoryState.profile;
  const timeline = memoryState.timeline;
  const sources = realityState.sources;
  const gbp = sources.find((s) => s.id === 'google_business');
  const hasProfile = Boolean(profile.name);
  const actions = getDailyActions(demoRecommendations, 3);

  return { profile, timeline, sources, gbp, hasProfile, actions };
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos dias';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function timeAgo(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Ahora mismo';
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Hace 1 dia';
  return `Hace ${days} dias`;
}

// ─── Hero Header ────────────────────────────────────────────────────────────

function HeroHeader({ profile, gbp, userName }: { profile: BusinessProfile; gbp: SourceState | undefined; userName: string }) {
  return (
    <div className="space-y-1">
      <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
        {getGreeting()}, {userName}.
      </h1>
      {profile.name ? (
        <p className="text-v2-sm sm:text-v2-base text-v2-text-secondary leading-relaxed">
          {profile.name} · {profile.category || 'Sin categoria'} · {profile.city || 'Sin ciudad'}
          {gbp?.connected && (
            <span className="inline-flex items-center gap-1 ml-2 text-v2-success-600">
              <Wifi size={12} /> Google conectado
            </span>
          )}
          {!gbp?.connected && (
            <span className="inline-flex items-center gap-1 ml-2 text-v2-neutral-400">
              <WifiOff size={12} /> Pendiente de conectar
            </span>
          )}
        </p>
      ) : (
        <p className="text-v2-sm text-v2-text-tertiary">
          Completa la informacion de tu empresa para recibir recomendaciones personalizadas.
        </p>
      )}
    </div>
  );
}

// ─── Quick Stats Row ────────────────────────────────────────────────────────

interface QuickStat {
  label: string;
  value: string | null;
  icon: React.ReactNode;
}

function QuickStatsRow({ gbpConnected }: { gbpConnected: boolean }) {
  const stats: QuickStat[] = [
    { label: 'Posicion local', value: null, icon: <MapPin size={15} /> },
    { label: 'Resenas', value: null, icon: <MessageSquare size={15} /> },
    { label: 'Rating', value: null, icon: <Star size={15} /> },
    { label: 'Publicaciones', value: null, icon: <Calendar size={15} /> },
    { label: 'Competidores', value: null, icon: <Target size={15} /> },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {stats.map((stat) => (
        <div key={stat.label} className="rounded-v2-xl border border-v2-border-light bg-white p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-v2-neutral-400">
            {stat.icon}
            <span className="text-v2-xs font-medium text-v2-text-tertiary">{stat.label}</span>
          </div>
          {stat.value ? (
            <span className="text-v2-lg font-bold text-v2-text-primary">{stat.value}</span>
          ) : (
            <span className="text-v2-xs text-v2-neutral-400">
              {gbpConnected ? '—' : 'Conectar fuente'}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Business Card ──────────────────────────────────────────────────────────

function BusinessCard({ profile, sources, onEdit }: { profile: BusinessProfile; sources: SourceState[]; onEdit: () => void }) {
  const connectedSources = sources.filter((s) => s.connected);
  const hasProfile = Boolean(profile.name);

  if (!hasProfile) {
    return (
      <div className="rounded-v2-xl border border-dashed border-v2-border-DEFAULT bg-white p-6 sm:p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-v2-neutral-100 flex items-center justify-center mx-auto mb-4">
          <Building2 size={20} className="text-v2-neutral-400" />
        </div>
        <h3 className="text-v2-base font-semibold text-v2-text-primary mb-1">Configura tu empresa</h3>
        <p className="text-v2-sm text-v2-text-secondary mb-5 max-w-sm mx-auto">
          Anade la informacion de tu negocio para recibir recomendaciones personalizadas.
        </p>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-v2-lg bg-v2-primary-600 hover:bg-v2-primary-700 text-white text-v2-sm font-medium transition-colors shadow-v2-sm focus-visible:ring-2 focus-visible:ring-v2-primary-500/40 focus-visible:ring-offset-2"
        >
          <Edit3 size={14} /> Completar empresa
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-v2-lg bg-v2-primary-50 flex items-center justify-center shrink-0">
            <Building2 size={20} className="text-v2-primary-600" />
          </div>
          <div className="min-w-0">
            <h3 className="text-v2-base font-semibold text-v2-text-primary truncate">{profile.name}</h3>
            <p className="text-v2-xs text-v2-text-secondary mt-0.5">
              {profile.category}{profile.city ? ` · ${profile.city}` : ''}
            </p>
          </div>
        </div>
        <button
          onClick={onEdit}
          className="p-2 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-400 hover:text-v2-text-primary transition-colors focus-visible:ring-2 focus-visible:ring-v2-primary-500/30"
          aria-label="Editar empresa"
        >
          <Edit3 size={15} />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-v2-xs text-v2-text-tertiary">
        {profile.website && (
          <span className="flex items-center gap-1.5"><Globe size={12} />{profile.website}</span>
        )}
        {connectedSources.length > 0 && (
          <span className="flex items-center gap-1.5"><Wifi size={12} />{connectedSources.length} fuente{connectedSources.length !== 1 ? 's' : ''} conectada{connectedSources.length !== 1 ? 's' : ''}</span>
        )}
        {connectedSources.length === 0 && (
          <span className="flex items-center gap-1.5 text-v2-warning-500"><WifiOff size={12} />Sin fuentes conectadas</span>
        )}
      </div>
    </div>
  );
}

// ─── Today Actions ──────────────────────────────────────────────────────────

function TodayActions({ actions, onPrepare }: { actions: Recommendation[]; onPrepare: (rec: Recommendation) => void }) {
  if (actions.length === 0) {
    return (
      <div className="rounded-v2-xl border border-dashed border-v2-border-DEFAULT bg-white p-6 text-center">
        <Sparkles size={20} className="text-v2-neutral-300 mx-auto mb-3" />
        <p className="text-v2-sm text-v2-text-secondary">Completa tu empresa para recibir acciones personalizadas.</p>
      </div>
    );
  }

  const impactColors = { high: 'text-v2-error-500', medium: 'text-v2-warning-500', low: 'text-v2-neutral-400' };
  const impactLabels = { high: 'Alto', medium: 'Medio', low: 'Bajo' };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-v2-base font-semibold text-v2-text-primary">Hoy debes hacer</h2>
        <span className="text-v2-xs text-v2-text-tertiary bg-v2-neutral-100 px-2.5 py-1 rounded-full font-medium">
          Datos de ejemplo
        </span>
      </div>
      <div className="space-y-2.5">
        {actions.map((rec, i) => (
          <div
            key={rec.id}
            className="group rounded-v2-xl border border-v2-border-light bg-white hover:border-v2-primary-200 transition-all duration-150 p-4 sm:p-5"
          >
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-v2-primary-50 flex items-center justify-center shrink-0 text-v2-primary-600 font-bold text-v2-sm">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-v2-sm font-semibold text-v2-text-primary leading-snug">{rec.title}</h3>
                <p className="text-v2-xs text-v2-text-secondary mt-1 line-clamp-2">{rec.reason}</p>
                <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-3">
                  <span className="flex items-center gap-1 text-v2-xs text-v2-text-tertiary">
                    <Clock size={11} /> {rec.estimatedTimeMinutes} min
                  </span>
                  <span className={`flex items-center gap-1 text-v2-xs font-medium ${impactColors[rec.impact]}`}>
                    <TrendingUp size={11} /> Impacto {impactLabels[rec.impact]}
                  </span>
                  <span className="text-v2-xs text-v2-text-tertiary">{rec.source}</span>
                </div>
              </div>
              <button
                onClick={() => onPrepare(rec)}
                className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-v2-lg bg-v2-primary-600 hover:bg-v2-primary-700 text-white text-v2-xs font-medium transition-colors shadow-v2-sm opacity-0 group-hover:opacity-100 focus:opacity-100 focus-visible:ring-2 focus-visible:ring-v2-primary-500/40"
              >
                Preparar <ArrowRight size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Expected Impact ────────────────────────────────────────────────────────

function ExpectedImpact() {
  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-v2-base font-semibold text-v2-text-primary">Impacto esperado</h2>
        <span className="text-v2-xs text-v2-text-tertiary bg-v2-neutral-100 px-2 py-0.5 rounded-full">Estimacion</span>
      </div>
      <p className="text-v2-sm text-v2-text-secondary mb-4">Si completas el plan de hoy:</p>
      <div className="space-y-2.5">
        {[
          { label: 'Mas visibilidad en busquedas locales', icon: <MapPin size={14} /> },
          { label: 'Mejor reputacion por responder resenas', icon: <Star size={14} /> },
          { label: 'Perfil mas activo ante Google', icon: <TrendingUp size={14} /> },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3 text-v2-sm text-v2-text-secondary">
            <span className="text-v2-success-500">{item.icon}</span>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Growth Score ───────────────────────────────────────────────────────────

function GrowthScore({ hasProfile, onDetails }: { hasProfile: boolean; onDetails: () => void }) {
  if (!hasProfile) {
    return (
      <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
        <h2 className="text-v2-base font-semibold text-v2-text-primary mb-2">Growth Score</h2>
        <p className="text-v2-sm text-v2-text-tertiary">Completa la informacion de tu empresa para calcular tu estado general.</p>
      </div>
    );
  }

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-v2-sm font-medium text-v2-text-secondary mb-1">Growth Score</h2>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-v2-text-primary tabular-nums">—</span>
            <span className="text-v2-xs text-v2-text-tertiary">/ 100</span>
          </div>
          <p className="text-v2-xs text-v2-text-tertiary mt-2">
            Conecta Google Business para calcular el score.
          </p>
        </div>
        <div className="w-14 h-14 rounded-full border-4 border-v2-neutral-200 flex items-center justify-center">
          <TrendingUp size={18} className="text-v2-neutral-300" />
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-v2-border-light">
        <p className="text-v2-xs text-v2-text-tertiary mb-2">Se calculara con:</p>
        <div className="flex flex-wrap gap-2">
          {['Perfil Google', 'Publicaciones', 'Resenas', 'SEO Local', 'Actividad'].map((factor) => (
            <span key={factor} className="text-v2-xs px-2 py-0.5 rounded-full bg-v2-neutral-100 text-v2-text-tertiary">{factor}</span>
          ))}
        </div>
      </div>

      <button
        onClick={onDetails}
        className="mt-4 text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700 transition-colors focus-visible:ring-2 focus-visible:ring-v2-primary-500/30 rounded"
      >
        Ver detalles
      </button>
    </div>
  );
}

// ─── AI Advisor Card ────────────────────────────────────────────────────────

function AiAdvisorCard({ topAction, onPrepare }: { topAction: Recommendation | null; onPrepare: (rec: Recommendation) => void }) {
  if (!topAction) return null;

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-gradient-to-br from-white to-v2-primary-50/30 p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles size={14} className="text-v2-primary-500" />
        <h2 className="text-v2-sm font-semibold text-v2-text-primary">Consejo del dia</h2>
      </div>
      <p className="text-v2-sm text-v2-text-secondary leading-relaxed mb-4">
        Con la informacion disponible, te recomendamos: <span className="font-medium text-v2-text-primary">{topAction.title.toLowerCase()}</span>. {topAction.explanation}
      </p>
      <button
        onClick={() => onPrepare(topAction)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-v2-lg bg-v2-primary-600 hover:bg-v2-primary-700 text-white text-v2-xs font-medium transition-colors shadow-v2-sm focus-visible:ring-2 focus-visible:ring-v2-primary-500/40 focus-visible:ring-offset-2"
      >
        <Zap size={12} /> Preparar accion
      </button>
    </div>
  );
}

// ─── Activity Timeline ──────────────────────────────────────────────────────

const DEMO_TIMELINE: TimelineEvent[] = [
  { id: 'demo-tl-1', timestamp: new Date(Date.now() - 20 * 60000).toISOString(), type: 'profile_updated', title: 'Perfil actualizado' },
  { id: 'demo-tl-2', timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), type: 'action_completed', title: 'Publicacion preparada', actionType: 'publish_post', impact: 'medium' },
  { id: 'demo-tl-3', timestamp: new Date(Date.now() - 6 * 3600000).toISOString(), type: 'action_completed', title: 'Resena respondida', actionType: 'respond_reviews', impact: 'high' },
  { id: 'demo-tl-4', timestamp: new Date(Date.now() - 24 * 3600000).toISOString(), type: 'goal_set', title: 'Objetivo actualizado' },
  { id: 'demo-tl-5', timestamp: new Date(Date.now() - 48 * 3600000).toISOString(), type: 'insight_generated', title: 'Nuevo insight generado' },
];

function ActivityTimeline({ timeline }: { timeline: TimelineEvent[] }) {
  const isDemo = timeline.length === 0;
  const items = isDemo ? DEMO_TIMELINE : timeline.slice(0, 5);

  const typeIcons: Record<string, React.ReactNode> = {
    action_completed: <Zap size={12} className="text-v2-success-500" />,
    goal_set: <Target size={12} className="text-v2-primary-500" />,
    profile_updated: <Edit3 size={12} className="text-v2-neutral-400" />,
    insight_generated: <Sparkles size={12} className="text-v2-warning-500" />,
  };

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-v2-base font-semibold text-v2-text-primary">Actividad reciente</h2>
        {isDemo && <span className="text-v2-xs text-v2-text-tertiary bg-v2-neutral-100 px-2 py-0.5 rounded-full">Ejemplo</span>}
      </div>
      <div className="space-y-0">
        {items.map((event, i) => (
          <div key={event.id} className="flex items-start gap-3 py-2.5 relative">
            {i < items.length - 1 && (
              <div className="absolute left-[9px] top-9 bottom-0 w-px bg-v2-neutral-100" />
            )}
            <div className="w-5 h-5 rounded-full bg-v2-neutral-50 border border-v2-border-light flex items-center justify-center shrink-0 relative z-10">
              {typeIcons[event.type] || <Zap size={10} className="text-v2-neutral-300" />}
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <span className="text-v2-sm text-v2-text-secondary truncate">{event.title}</span>
              <span className="text-v2-xs text-v2-text-tertiary whitespace-nowrap shrink-0">{timeAgo(event.timestamp)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Automations Card ───────────────────────────────────────────────────────

function AutomationsCard() {
  const navigate = useNavigate();

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-v2-sm font-semibold text-v2-text-primary">Automatizaciones</h2>
          <p className="text-v2-xs text-v2-text-tertiary mt-0.5">0 activas</p>
        </div>
        <button
          onClick={() => navigate('/app-v2/fuentes')}
          className="text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700 transition-colors flex items-center gap-1"
        >
          Gestionar <ExternalLink size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ─────────────────────────────────────────────────────────

export default function DailyBriefingPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const userName = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Usuario';

  const { profile, timeline, sources, gbp, hasProfile, actions } = useDashboardData();

  useEffect(() => {
    trackDashboardOpen(profile.id);
  }, [profile.id]);

  function handlePrepare(rec: Recommendation) {
    trackDashboardActionClick(rec.id, rec.actionType);
    trackDashboardWorkspaceOpen(rec.id);
    navigate(`/app-v2/ejecutar/${rec.id}`);
  }

  function handleEditBusiness() {
    trackDashboardBusinessEdit();
    navigate('/app-v2/negocio');
  }

  function handleGrowthDetails() {
    trackDashboardGrowthDetails();
    navigate('/app-v2/informes');
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-8 max-w-4xl">
      {/* Hero Header */}
      <HeroHeader profile={profile} gbp={gbp} userName={userName} />

      {/* Quick Stats */}
      <QuickStatsRow gbpConnected={gbp?.connected ?? false} />

      {/* Main 2-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        {/* Left column: Actions (2/3 width) */}
        <div className="lg:col-span-2 space-y-5">
          <TodayActions actions={actions} onPrepare={handlePrepare} />
          <ExpectedImpact />
        </div>

        {/* Right column: Sidebar cards (1/3 width) */}
        <div className="space-y-5">
          <BusinessCard profile={profile} sources={sources} onEdit={handleEditBusiness} />
          <GrowthScore hasProfile={hasProfile} onDetails={handleGrowthDetails} />
          <AiAdvisorCard topAction={actions[0] ?? null} onPrepare={handlePrepare} />
        </div>
      </div>

      {/* Bottom row: Timeline + Automations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2">
          <ActivityTimeline timeline={timeline} />
        </div>
        <div>
          <AutomationsCard />
        </div>
      </div>
    </div>
  );
}
