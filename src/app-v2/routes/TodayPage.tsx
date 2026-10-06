import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createLocalRepository } from '../../features/business-memory/repository';
import { loadSources as loadConnectedSources } from '../../features/reality-engine/repositories';
import type { ConnectedSource } from '../../features/reality-engine/types';
import { getDailyActions } from '../../features/daily-briefing/engine';
import { demoRecommendations } from '../demo/demoData';
import type { ConnectionEntry, DashboardAction } from '../../features/dashboard/types';
import type { Recommendation } from '../../domain/types';

import DashboardHeader from '../../features/dashboard/DashboardHeader';
import BusinessHealthCard from '../../features/dashboard/BusinessHealthCard';
import TodaysMissions from '../../features/dashboard/TodaysMissions';
import AIInsights from '../../features/dashboard/AIInsights';
import CompetitorAlerts from '../../features/dashboard/CompetitorAlerts';
import GrowthTimeline from '../../features/dashboard/GrowthTimeline';
import type { GrowthMilestone } from '../../features/dashboard/GrowthTimeline';
import QuickActions from '../../features/dashboard/QuickActions';
import type { QuickAction } from '../../features/dashboard/QuickActions';
import BusinessSnapshot from '../../features/dashboard/BusinessSnapshot';
import type { SnapshotStat } from '../../features/dashboard/BusinessSnapshot';
import UpgradeCard from '../../features/dashboard/UpgradeCard';
import DashboardEmptyState from '../../features/dashboard/DashboardEmptyState';

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

function sourceToConnection(s: ConnectedSource): ConnectionEntry {
  return {
    id: s.source_type,
    label: s.source_type === 'google_business' ? 'Google Business' :
           s.source_type === 'website' ? 'Sitio Web' :
           s.source_type === 'reviews' ? 'Resenas' : s.source_type,
    status: s.status === 'connected' ? 'connected' : s.status === 'error' ? 'not_connected' : 'not_connected',
    lastSync: s.last_sync_at,
  };
}

function useDashboardData() {
  const memoryRepo = useMemo(() => createLocalRepository(), []);
  const [connectedSources, setConnectedSources] = useState<ConnectedSource[]>([]);

  useEffect(() => {
    loadConnectedSources().then(setConnectedSources).catch(() => {});
  }, []);

  const memory = memoryRepo.load();
  const profile = memory.profile;
  const hasProfile = Boolean(profile.name);

  const connections: ConnectionEntry[] = connectedSources.length > 0
    ? connectedSources.map(sourceToConnection)
    : [
        { id: 'google_business', label: 'Google Business', status: 'not_connected', lastSync: null },
        { id: 'website', label: 'Sitio Web', status: 'not_connected', lastSync: null },
      ];

  const recs = getDailyActions(demoRecommendations, 5);
  const actions = recs.map(recToAction);
  const completedActions = memory.timeline.filter((e) => e.type === 'action_completed').length;

  return { profile, hasProfile, connections, actions, completedActions };
}

function buildMilestones(connectedCount: number, completedActions: number): GrowthMilestone[] {
  return [
    { id: 'm-1', title: 'Perfil configurado', description: 'Datos basicos del negocio', completed: true, date: 'Completado' },
    { id: 'm-2', title: 'Primera fuente conectada', description: 'Google Business Profile o sitio web', completed: connectedCount > 0, date: connectedCount > 0 ? 'Completado' : undefined },
    { id: 'm-3', title: 'Primera recomendacion ejecutada', description: '', completed: completedActions > 0, date: completedActions > 0 ? 'Completado' : undefined },
    { id: 'm-4', title: '5 acciones completadas', description: '', completed: completedActions >= 5, date: completedActions >= 5 ? 'Completado' : undefined },
  ];
}

export default function TodayPage() {
  const navigate = useNavigate();
  const { profile, hasProfile, connections, actions, completedActions } = useDashboardData();

  if (!hasProfile) {
    return <DashboardEmptyState onSetup={() => navigate('/empezar')} />;
  }

  // No scoring model reads real data yet, so the score stays unavailable instead of a placeholder number.
  const healthScore: number | null = null;
  const connectedCount = connections.filter(c => c.status === 'connected').length;
  const healthTrend: 'up' | 'down' | 'stable' = 'stable';

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

  const milestones = buildMilestones(connectedCount, completedActions);
  const completedMilestones = milestones.filter(m => m.completed).length;
  const overallProgress = Math.round((completedMilestones / milestones.length) * 100);

  return (
    <div className="space-y-6 sm:space-y-8 pb-8 max-w-5xl">
      <DashboardHeader businessName={profile.name} />

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2">
          <AIInsights insights={[]} />
        </div>
        <div>
          <CompetitorAlerts alerts={[]} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2 space-y-5">
          <GrowthTimeline
            milestones={milestones}
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
