import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createLocalRepository } from '../business-memory/repository';
import { createRealityRepository } from '../reality-engine/repositories';
import { getDailyActions } from '../daily-briefing/engine';
import { demoRecommendations } from '../../app-v2/demo/demoData';
import type { ConnectionEntry, DashboardAction } from './types';
import type { Recommendation } from '../../domain/types';

import DashboardHeader from './DashboardHeader';
import BusinessHealthCard from './BusinessHealthCard';
import TodaysMissions from './TodaysMissions';
import AIInsights from './AIInsights';
import type { AIInsight } from './AIInsights';
import CompetitorAlerts from './CompetitorAlerts';
import type { CompetitorAlert } from './CompetitorAlerts';
import GrowthTimeline from './GrowthTimeline';
import type { GrowthMilestone } from './GrowthTimeline';
import QuickActions from './QuickActions';
import type { QuickAction } from './QuickActions';
import BusinessSnapshot from './BusinessSnapshot';
import type { SnapshotStat } from './BusinessSnapshot';
import UpgradeCard from './UpgradeCard';
import DashboardEmptyState from './DashboardEmptyState';

function mapCtaLabel(actionType: string): string {
  switch (actionType) {
    case 'respond_reviews': return 'Preparar respuestas';
    case 'publish_post': return 'Preparar publicacion';
    case 'update_description': return 'Revisar descripcion';
    case 'add_photos': return 'Preparar fotos';
    case 'create_content': return 'Preparar contenido';
    default: return 'Preparar accion';
  }
}

function recToAction(rec: Recommendation): DashboardAction {
  return {
    id: rec.id,
    title: rec.title,
    explanation: rec.explanation,
    reason: rec.reason,
    impact: rec.impact,
    estimatedMinutes: rec.estimatedTimeMinutes,
    source: rec.source,
    confidence: rec.confidence,
    dataMode: rec.dataMode,
    actionType: rec.actionType,
    ctaLabel: mapCtaLabel(rec.actionType),
  };
}

function useDashboardData() {
  const memoryRepo = useMemo(() => createLocalRepository(), []);
  const realityRepo = useMemo(() => createRealityRepository(), []);

  const memory = memoryRepo.load();
  const reality = realityRepo.load();

  const profile = memory.profile;
  const hasProfile = Boolean(profile.name);

  const sources = reality.sources;
  const lastGlobalSync = reality.lastGlobalSync;

  const connections: ConnectionEntry[] = [
    { id: 'google_business', label: 'Google Business', status: sources.find(s => s.id === 'google_business')?.connected ? 'connected' : sources.find(s => s.id === 'google_business')?.status === 'pending' ? 'pending' : 'not_connected', lastSync: sources.find(s => s.id === 'google_business')?.lastSync ?? null },
    { id: 'website', label: 'Sitio Web', status: sources.find(s => s.id === 'website')?.connected ? 'connected' : 'not_connected', lastSync: sources.find(s => s.id === 'website')?.lastSync ?? null },
    { id: 'facebook', label: 'Facebook', status: 'not_connected', lastSync: null },
    { id: 'instagram', label: 'Instagram', status: 'not_connected', lastSync: null },
  ];

  const recs = getDailyActions(demoRecommendations, 5);
  const actions = recs.map(recToAction);

  return { profile, hasProfile, connections, lastGlobalSync, actions };
}

// Demo data for components that don't have real data yet
const demoInsights: AIInsight[] = [
  { id: 'ins-1', title: 'Tu competidor principal ha publicado 3 posts esta semana', description: 'Mantener una frecuencia de publicacion similar te ayudara a no perder visibilidad.', category: 'warning' },
  { id: 'ins-2', title: 'Oportunidad: horario extendido los sabados', description: 'Negocios similares en tu zona que abren los sabados reciben un 23% mas de visitas.', category: 'opportunity' },
  { id: 'ins-3', title: 'Responder resenas mejora tu posicionamiento', description: 'Los negocios que responden el 100% de sus resenas suben de media 2 posiciones.', category: 'tip' },
];

const demoAlerts: CompetitorAlert[] = [
  { id: 'alert-1', competitorName: 'Competidor A', event: 'Ha actualizado su descripcion con nuevas palabras clave', severity: 'medium', timestamp: new Date(Date.now() - 7200000).toISOString() },
  { id: 'alert-2', competitorName: 'Competidor B', event: 'Ha recibido 4 resenas nuevas de 5 estrellas', severity: 'high', timestamp: new Date(Date.now() - 86400000).toISOString() },
];

const demoMilestones: GrowthMilestone[] = [
  { id: 'm-1', title: 'Perfil configurado', description: 'Datos basicos del negocio', completed: true, date: 'Completado' },
  { id: 'm-2', title: 'Primera fuente conectada', description: 'Google Business Profile', completed: true, date: 'Completado' },
  { id: 'm-3', title: 'Primera recomendacion ejecutada', description: '', completed: false },
  { id: 'm-4', title: 'Todas las resenas respondidas', description: '', completed: false },
  { id: 'm-5', title: '5 publicaciones en 30 dias', description: '', completed: false },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { profile, hasProfile, connections, actions } = useDashboardData();

  if (!hasProfile) {
    return <DashboardEmptyState onSetup={() => navigate('/empezar')} />;
  }

  const healthScore = 42;
  const connectedCount = connections.filter(c => c.status === 'connected').length;
  const healthTrend: 'up' | 'down' | 'stable' = connectedCount > 0 ? 'up' : 'stable';

  const quickActions: QuickAction[] = [
    { id: 'qa-edit', label: 'Editar negocio', icon: 'edit', onClick: () => navigate('/negocio') },
    { id: 'qa-sync', label: 'Sincronizar', icon: 'sync', onClick: () => navigate('/fuentes') },
    { id: 'qa-report', label: 'Ver informes', icon: 'report', onClick: () => navigate('/informes') },
    { id: 'qa-settings', label: 'Ajustes', icon: 'settings', onClick: () => navigate('/fuentes') },
    { id: 'qa-add', label: 'Anadir fuente', icon: 'add', onClick: () => navigate('/fuentes') },
  ];

  const snapshotStats: SnapshotStat[] = [
    { id: 's-rating', label: 'Valoracion', value: null, icon: 'rating' },
    { id: 's-reviews', label: 'Resenas', value: null, icon: 'reviews' },
    { id: 's-photos', label: 'Fotos', value: null, icon: 'photos' },
    { id: 's-location', label: 'Ciudad', value: profile.city || '--', icon: 'location' },
  ];

  const completedMilestones = demoMilestones.filter(m => m.completed).length;
  const overallProgress = Math.round((completedMilestones / demoMilestones.length) * 100);

  return (
    <div className="space-y-6 sm:space-y-8 pb-8 max-w-5xl">
      <DashboardHeader businessName={profile.name} />

      {/* Top section: Health + Missions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2">
          <TodaysMissions actions={actions} onExecute={(action) => navigate(`/ejecutar/${action.id}`)} />
        </div>
        <div>
          <BusinessHealthCard
            score={healthScore}
            trend={healthTrend}
            connections={connections}
            pendingActions={actions.length}
          />
        </div>
      </div>

      {/* Middle section: AI + Competitors + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2">
          <AIInsights insights={demoInsights} />
        </div>
        <div>
          <CompetitorAlerts alerts={demoAlerts} />
        </div>
      </div>

      {/* Bottom section: Growth + Snapshot + Upgrade */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2 space-y-5">
          <GrowthTimeline
            milestones={demoMilestones}
            overallProgress={overallProgress}
            onViewDetails={() => navigate('/informes')}
          />
          <QuickActions actions={quickActions} />
        </div>
        <div className="space-y-5">
          <BusinessSnapshot
            businessName={profile.name}
            category={profile.category}
            city={profile.city}
            stats={snapshotStats}
          />
          <UpgradeCard currentPlan="free" onUpgrade={() => {}} />
        </div>
      </div>
    </div>
  );
}
