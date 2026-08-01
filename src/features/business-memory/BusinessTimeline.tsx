import { useMemo, useEffect } from 'react';
import type { TimelineEvent, BusinessInsight, BusinessPreference } from './types';
import { createLocalRepository } from './repository';
import { generateInsights, inferPreferences } from './engine';
import { trackTimelineView } from '../../services/analytics/v2Analytics';
import {
  Check,
  Target,
  Settings,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Info,
  Brain,
  FlaskConical,
} from 'lucide-react';

function DemoBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-v2-xs font-medium rounded-full border bg-v2-neutral-100 text-v2-neutral-600 border-v2-neutral-200">
      <FlaskConical size={11} /> Datos de ejemplo
    </span>
  );
}

const repo = createLocalRepository();

// ─── Demo Timeline Data ─────────────────────────────────────────────────────

const DEMO_TIMELINE: TimelineEvent[] = [
  { id: 'demo-evt-1', timestamp: '2026-07-28T09:30:00Z', type: 'action_completed', title: 'Respondiste 8 resenas', actionType: 'respond_reviews', impact: 'high', durationMinutes: 12 },
  { id: 'demo-evt-2', timestamp: '2026-07-29T10:15:00Z', type: 'action_completed', title: 'Publicaste una actualizacion', actionType: 'publish_post', impact: 'medium', durationMinutes: 8 },
  { id: 'demo-evt-3', timestamp: '2026-07-30T11:00:00Z', type: 'action_completed', title: 'Anadiste 3 fotografias', actionType: 'add_photos', impact: 'low', durationMinutes: 5 },
  { id: 'demo-evt-4', timestamp: '2026-07-31T14:20:00Z', type: 'profile_updated', title: 'Actualizaste los servicios' },
  { id: 'demo-evt-5', timestamp: '2026-07-31T08:00:00Z', type: 'goal_set', title: 'Objetivo definido: Mas resenas' },
];

const DEMO_INSIGHTS: BusinessInsight[] = [
  { id: 'demo-insight-1', text: 'Esta semana has completado 4 acciones. Es un buen ritmo para mantener tu perfil activo.', type: 'positive', generatedAt: '2026-07-31T08:00:00Z', basedOn: 'Acciones completadas esta semana' },
  { id: 'demo-insight-2', text: 'Llevas 3 dias sin publicar contenido. Una publicacion semanal mantiene tu perfil visible.', type: 'warning', generatedAt: '2026-07-31T08:00:00Z', basedOn: 'Dias desde la ultima publicacion' },
  { id: 'demo-insight-3', text: 'Has respondido resenas 2 veces esta semana. Mantener esta frecuencia mejora tu reputacion.', type: 'positive', generatedAt: '2026-07-31T08:00:00Z', basedOn: 'Acciones de tipo resena' },
];

const DEMO_PREFERENCES: BusinessPreference[] = [
  { id: 'demo-pref-1', label: 'Completa tareas por la manana', inferredFrom: '6 acciones en horario de manana', confidence: 'high' },
  { id: 'demo-pref-2', label: 'Prefiere tareas rapidas (menos de 15 min)', inferredFrom: '80% de acciones son cortas', confidence: 'medium' },
  { id: 'demo-pref-3', label: 'Suele trabajar los lunes', inferredFrom: '4 acciones completadas ese dia', confidence: 'medium' },
];

// ─── Timeline Component ─────────────────────────────────────────────────────

function groupByDay(events: TimelineEvent[]): Record<string, TimelineEvent[]> {
  const groups: Record<string, TimelineEvent[]> = {};
  events.forEach((e) => {
    const day = new Date(e.timestamp).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!groups[day]) groups[day] = [];
    groups[day].push(e);
  });
  return groups;
}

function EventIcon({ type }: { type: TimelineEvent['type'] }) {
  switch (type) {
    case 'action_completed': return <Check size={13} className="text-v2-success-500" />;
    case 'goal_set': return <Target size={13} className="text-v2-primary-500" />;
    case 'profile_updated': return <Settings size={13} className="text-v2-secondary-500" />;
    case 'insight_generated': return <Lightbulb size={13} className="text-v2-warning-500" />;
  }
}

export function BusinessTimeline() {
  const state = repo.load();
  const isDemo = state.timeline.length === 0;
  const timeline = isDemo ? DEMO_TIMELINE : state.timeline;
  const grouped = groupByDay(timeline);

  useEffect(() => { trackTimelineView(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-v2-lg font-bold text-v2-text-primary">Cronologia</h2>
          <p className="text-v2-xs text-v2-text-tertiary mt-1">Historial de acciones de tu negocio</p>
        </div>
        {isDemo && <DemoBadge />}
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([day, events]) => (
          <div key={day}>
            <p className="text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider mb-3 capitalize">{day}</p>
            <div className="space-y-2">
              {events.map((event) => (
                <div key={event.id} className="flex items-start gap-3 p-3 rounded-v2-lg border border-v2-border-light bg-white">
                  <div className="w-7 h-7 rounded-full bg-v2-neutral-50 border border-v2-border-light flex items-center justify-center shrink-0 mt-0.5">
                    <EventIcon type={event.type} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-v2-sm text-v2-text-primary">{event.title}</p>
                    {event.durationMinutes && (
                      <p className="text-v2-xs text-v2-text-tertiary mt-0.5">{event.durationMinutes} min</p>
                    )}
                  </div>
                  {event.impact && (
                    <span className={`text-v2-xs font-medium shrink-0 ${event.impact === 'high' ? 'text-v2-error-500' : event.impact === 'medium' ? 'text-v2-warning-500' : 'text-v2-neutral-400'}`}>
                      {event.impact === 'high' ? 'Alto' : event.impact === 'medium' ? 'Medio' : 'Bajo'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Insights Component ─────────────────────────────────────────────────────

function InsightIcon({ type }: { type: BusinessInsight['type'] }) {
  switch (type) {
    case 'positive': return <TrendingUp size={14} className="text-v2-success-500" />;
    case 'warning': return <AlertTriangle size={14} className="text-v2-warning-500" />;
    case 'neutral': return <Info size={14} className="text-v2-secondary-500" />;
  }
}

export function BusinessInsights() {
  const state = repo.load();
  const liveInsights = useMemo(() => generateInsights(state), [state]);
  const isDemo = liveInsights.length === 0;
  const insights = isDemo ? DEMO_INSIGHTS : liveInsights;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lightbulb size={16} className="text-v2-warning-500" />
          <h2 className="text-v2-base font-semibold text-v2-text-primary">Insights</h2>
        </div>
        {isDemo && <DemoBadge />}
      </div>

      <div className="space-y-2">
        {insights.map((insight) => (
          <div key={insight.id} className={`rounded-v2-xl border p-4 ${
            insight.type === 'positive' ? 'border-v2-success-200 bg-v2-success-50/30' :
            insight.type === 'warning' ? 'border-v2-warning-200 bg-v2-warning-50/30' :
            'border-v2-border-light bg-white'
          }`}>
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0"><InsightIcon type={insight.type} /></div>
              <div className="flex-1">
                <p className="text-v2-sm text-v2-text-primary leading-relaxed">{insight.text}</p>
                <p className="text-v2-xs text-v2-text-tertiary mt-1">Basado en: {insight.basedOn}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Preferences Component ──────────────────────────────────────────────────

export function BusinessPreferencesView() {
  const state = repo.load();
  const livePrefs = useMemo(() => inferPreferences(state), [state]);
  const isDemo = livePrefs.length === 0;
  const preferences = isDemo ? DEMO_PREFERENCES : livePrefs;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-v2-primary-500" />
          <h2 className="text-v2-base font-semibold text-v2-text-primary">Preferencias detectadas</h2>
        </div>
        {isDemo && <DemoBadge />}
      </div>
      <p className="text-v2-xs text-v2-text-tertiary">Se actualizan automaticamente segun tu uso de la aplicacion.</p>

      <div className="space-y-2">
        {preferences.map((pref) => (
          <div key={pref.id} className="rounded-v2-xl border border-v2-border-light bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-v2-sm font-medium text-v2-text-primary">{pref.label}</p>
              <span className={`text-v2-xs font-medium ${pref.confidence === 'high' ? 'text-v2-success-500' : 'text-v2-warning-500'}`}>
                {pref.confidence === 'high' ? 'Alta' : 'Media'} confianza
              </span>
            </div>
            <p className="text-v2-xs text-v2-text-tertiary mt-1">{pref.inferredFrom}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
