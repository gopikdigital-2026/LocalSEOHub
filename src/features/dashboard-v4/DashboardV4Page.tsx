import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { createLocalRepository } from '../business-memory/repository';
import { createRealityRepository } from '../reality-engine/repositories';
import { getDailyActions } from '../daily-briefing/engine';
import { demoRecommendations } from '../../app-v2/demo/demoData';
import type { ConnectionEntry, DashboardAction, QuickStatItem } from './dashboardV4.types';
import type { Recommendation } from '../../domain/types';
import {
  trackDashboardBusinessEditClick,
  trackDashboardSyncClick,
  trackDashboardPrimaryActionClick,
} from './dashboardV4.analytics';

import BusinessHero from './BusinessHero';
import QuickStats from './QuickStats';
import TodayPriority from './TodayPriority';
import SecondaryActions from './SecondaryActions';
import GrowthScoreSummary from './GrowthScoreSummary';
import ExpectedImpact from './ExpectedImpact';
import RecentActivityTimeline from './RecentActivityTimeline';
import DailyAdvisor from './DailyAdvisor';
import AutomationSummary from './AutomationSummary';
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

function useDashboardV4Data() {
  const memoryRepo = useMemo(() => createLocalRepository(), []);
  const realityRepo = useMemo(() => createRealityRepository(), []);

  const memory = memoryRepo.load();
  const reality = realityRepo.load();

  const profile = memory.profile;
  const hasProfile = Boolean(profile.name);
  const timeline = memory.timeline;

  const sources = reality.sources;
  const lastGlobalSync = reality.lastGlobalSync;

  const connections: ConnectionEntry[] = [
    { id: 'google_business', label: 'Google Business', status: sources.find(s => s.id === 'google_business')?.connected ? 'connected' : sources.find(s => s.id === 'google_business')?.status === 'pending' ? 'pending' : 'not_connected', lastSync: sources.find(s => s.id === 'google_business')?.lastSync ?? null },
    { id: 'website', label: 'Sitio Web', status: sources.find(s => s.id === 'website')?.connected ? 'connected' : 'not_connected', lastSync: sources.find(s => s.id === 'website')?.lastSync ?? null },
    { id: 'facebook', label: 'Facebook', status: 'not_connected', lastSync: null },
    { id: 'instagram', label: 'Instagram', status: 'not_connected', lastSync: null },
  ];

  const recs = getDailyActions(demoRecommendations, 3);
  const actions = recs.map(recToAction);

  const quickStats: QuickStatItem[] = [
    { id: 'position', label: 'Posicion local', value: null, source: null, updatedAt: null, confidence: null },
    { id: 'reviews', label: 'Resenas', value: null, source: null, updatedAt: null, confidence: null },
    { id: 'rating', label: 'Rating', value: null, source: null, updatedAt: null, confidence: null },
    { id: 'posts', label: 'Publicaciones', value: null, source: null, updatedAt: null, confidence: null },
    { id: 'competitors', label: 'Competidores', value: null, source: null, updatedAt: null, confidence: null },
  ];

  return { profile, hasProfile, connections, lastGlobalSync, actions, quickStats, timeline };
}

export default function DashboardV4Page() {
  const navigate = useNavigate();
  const { profile, hasProfile, connections, lastGlobalSync, actions, quickStats, timeline } = useDashboardV4Data();

  if (!hasProfile) {
    return <DashboardEmptyState onSetup={() => navigate('/empezar')} />;
  }

  function handleEditBusiness() {
    trackDashboardBusinessEditClick(profile.id);
    navigate('/negocio');
  }

  function handleSync() {
    trackDashboardSyncClick(profile.id);
  }

  function handlePrepareAction(action: DashboardAction) {
    trackDashboardPrimaryActionClick(action.id, action.actionType);
    navigate(`/ejecutar/${action.id}`);
  }

  function handleViewHistory() {
    navigate('/negocio/memoria');
  }

  function handleGrowthDetails() {
    navigate('/informes');
  }

  function handleManageAutomations() {
    navigate('/fuentes');
  }

  const primaryAction = actions[0] ?? null;
  const secondaryActions = actions.slice(1);

  return (
    <div className="space-y-6 sm:space-y-8 pb-8 max-w-4xl">
      <BusinessHero
        name={profile.name}
        category={profile.category}
        city={profile.city}
        connections={connections}
        lastGlobalSync={lastGlobalSync}
        onEdit={handleEditBusiness}
        onSync={handleSync}
      />

      <QuickStats stats={quickStats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        {/* Main column */}
        <div className="lg:col-span-2 space-y-5">
          <TodayPriority action={primaryAction} onPrepare={handlePrepareAction} />
          <SecondaryActions actions={secondaryActions} onPrepare={handlePrepareAction} />
          <ExpectedImpact />
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <GrowthScoreSummary hasProfile={hasProfile} onDetails={handleGrowthDetails} />
          <DailyAdvisor action={primaryAction} onPrepare={handlePrepareAction} />
        </div>
      </div>

      {/* Bottom section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-6">
        <div className="lg:col-span-2">
          <RecentActivityTimeline events={timeline} onViewHistory={handleViewHistory} />
        </div>
        <div>
          <AutomationSummary onManage={handleManageAutomations} />
        </div>
      </div>
    </div>
  );
}
