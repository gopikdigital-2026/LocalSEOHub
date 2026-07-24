import { useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Card, Badge, Button, SectionHeader, EmptyState, ProgressIndicator } from '../../components/ui';
import { DataStatusBadge, DataSourceInfo } from '../../components/data-status';
import { trackTodayView, trackRecommendationActionClick, trackOnboardingStart } from '../../services/analytics/v2Analytics';
import { demoDataSources, demoRecommendations, demoWeeklyGoal, demoTasks } from '../demo/demoData';
import type { Recommendation, DataSource, DataSourceStatus } from '../../domain/types';
import { Calendar, Target, Wifi, AlertCircle, Clock, ArrowRight, CheckCircle2, Circle, Loader2, Building2 } from 'lucide-react';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos dias';
  if (h < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function SourceStatusIcon({ status }: { status: DataSourceStatus }) {
  switch (status) {
    case 'connected':
      return <div className="w-2 h-2 rounded-full bg-v2-success-500" />;
    case 'pending':
      return <Loader2 size={12} className="text-v2-warning-500 animate-spin" />;
    case 'error':
      return <AlertCircle size={12} className="text-v2-error-500" />;
    default:
      return <div className="w-2 h-2 rounded-full bg-v2-neutral-300" />;
  }
}

function sourceStatusLabel(status: DataSourceStatus): string {
  switch (status) {
    case 'connected': return 'Conectada';
    case 'pending': return 'Pendiente';
    case 'error': return 'Error';
    default: return 'No conectada';
  }
}

function DataSourcesPanel({ sources }: { sources: DataSource[] }) {
  return (
    <Card padding="sm">
      <div className="flex items-center gap-2 mb-3 px-2 pt-1">
        <Wifi size={14} className="text-v2-neutral-400" />
        <span className="text-v2-xs font-semibold text-v2-text-secondary uppercase tracking-wide">Estado de fuentes</span>
      </div>
      <div className="divide-y divide-v2-border-light">
        {sources.map((src) => (
          <div key={src.id} className="flex items-center gap-3 px-2 py-3">
            <SourceStatusIcon status={src.status} />
            <div className="flex-1 min-w-0">
              <p className="text-v2-sm font-medium text-v2-text-primary">{src.name}</p>
              <p className="text-v2-xs text-v2-text-tertiary">{sourceStatusLabel(src.status)}</p>
            </div>
            {src.status === 'not_connected' && (
              <span className="text-v2-xs text-v2-text-tertiary">Fuente todavia no conectada</span>
            )}
            {src.lastUpdatedAt && (
              <span className="text-v2-xs text-v2-text-tertiary flex items-center gap-1">
                <Clock size={10} />
                {new Date(src.lastUpdatedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function WeeklyGoalCard() {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <SectionHeader
          title="Objetivo de esta semana"
          icon={<Target size={16} />}
        />
        <DataStatusBadge confidence="demo" />
      </div>
      <p className="text-v2-sm text-v2-text-secondary leading-relaxed">
        {demoWeeklyGoal.title}
      </p>
      <p className="text-v2-xs text-v2-text-tertiary mt-2">
        {demoWeeklyGoal.description}
      </p>
    </Card>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const impactColors = {
    high: 'border-l-v2-error-400',
    medium: 'border-l-v2-warning-400',
    low: 'border-l-v2-neutral-300',
  };

  const impactLabels = {
    high: 'Alto impacto',
    medium: 'Impacto medio',
    low: 'Impacto bajo',
  };

  const impactBadgeVariant = {
    high: 'error' as const,
    medium: 'warning' as const,
    low: 'neutral' as const,
  };

  return (
    <Card className={`border-l-4 ${impactColors[rec.impact]} hover:shadow-v2-md transition-shadow duration-200`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-v2-sm font-semibold text-v2-text-primary">{rec.title}</h3>
        <DataStatusBadge confidence={rec.confidence} />
      </div>

      <p className="text-v2-sm text-v2-text-secondary mb-3">{rec.summary}</p>

      {/* Why it matters */}
      <div className="bg-v2-neutral-50 rounded-v2-lg px-3 py-2.5 mb-3">
        <p className="text-v2-xs font-medium text-v2-text-secondary mb-1">Por que importa</p>
        <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{rec.reason}</p>
      </div>

      {/* Meta row */}
      <div className="flex items-center flex-wrap gap-2 mb-4">
        <Badge variant={impactBadgeVariant[rec.impact]} dot>{impactLabels[rec.impact]}</Badge>
        <span className="text-v2-xs text-v2-text-tertiary flex items-center gap-1">
          <Clock size={11} />
          ~{rec.estimatedTimeMinutes} min
        </span>
        <DataSourceInfo
          source={rec.source}
          sourceType={rec.sourceType}
          updatedAt={rec.sourceUpdatedAt}
          confidence={rec.confidence}
          explanation={rec.explanation}
        />
      </div>

      {/* CTA */}
      <Button
        size="sm"
        variant="secondary"
        icon={<ArrowRight size={14} />}
        onClick={() => trackRecommendationActionClick(rec.id, rec.dataMode)}
      >
        Empezar
      </Button>
    </Card>
  );
}

function WeeklySummary() {
  const tasks = demoTasks;
  const completed = tasks.filter((t) => t.status === 'completed').length;
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
  const pending = tasks.filter((t) => t.status === 'pending').length;

  return (
    <Card>
      <SectionHeader title="Resumen semanal" icon={<Calendar size={16} />} />
      <ProgressIndicator completed={completed} inProgress={inProgress} total={tasks.length} />
      <div className="flex items-center gap-4 mt-4">
        <div className="flex items-center gap-1.5 text-v2-xs">
          <CheckCircle2 size={12} className="text-v2-success-500" />
          <span className="text-v2-text-secondary">{completed} completadas</span>
        </div>
        <div className="flex items-center gap-1.5 text-v2-xs">
          <Loader2 size={12} className="text-v2-warning-500" />
          <span className="text-v2-text-secondary">{inProgress} en curso</span>
        </div>
        <div className="flex items-center gap-1.5 text-v2-xs">
          <Circle size={12} className="text-v2-neutral-300" />
          <span className="text-v2-text-secondary">{pending} pendientes</span>
        </div>
      </div>
    </Card>
  );
}

function NoBusinessState() {
  return (
    <EmptyState
      icon={<Building2 size={24} />}
      title="Configura tu negocio para recibir recomendaciones reales"
      description="Anade los datos basicos de tu negocio y conecta tus fuentes para que LocalSEOHub pueda preparar tu primer plan."
      action={
        <Button onClick={() => trackOnboardingStart()} icon={<ArrowRight size={14} />}>
          Configurar mi negocio
        </Button>
      }
    />
  );
}

export default function TodayPage() {
  const { session } = useAuth();
  const userName = session?.user?.user_metadata?.name || session?.user?.email?.split('@')[0] || 'Usuario';
  const hasBusiness = true; // TODO: check from real data

  useEffect(() => {
    trackTodayView();
  }, []);

  if (!hasBusiness) {
    return <NoBusinessState />;
  }

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h1 className="text-v2-2xl font-bold text-v2-text-primary">
          {getGreeting()}, {userName}
        </h1>
        <p className="text-v2-sm text-v2-text-secondary mt-1">
          Estas son las acciones prioritarias para tu negocio.
        </p>
      </div>

      {/* Data Sources */}
      <DataSourcesPanel sources={demoDataSources} />

      {/* Weekly Goal */}
      <WeeklyGoalCard />

      {/* Recommendations */}
      <div>
        <SectionHeader
          title="Proximas acciones"
          subtitle="Recomendaciones basadas en el estado actual"
          icon={<Target size={16} />}
        />
        <div className="space-y-4">
          {demoRecommendations.map((rec) => (
            <RecommendationCard key={rec.id} rec={rec} />
          ))}
        </div>
      </div>

      {/* Weekly Summary */}
      <WeeklySummary />
    </div>
  );
}
