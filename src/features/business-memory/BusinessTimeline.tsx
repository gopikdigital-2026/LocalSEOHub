import { useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import type { TimelineEvent, BusinessInsight } from './types';
import { createLocalRepository } from './repository';
import { generateInsights, inferPreferences } from './engine';
import { trackTimelineView, trackEmptyStateViewed } from '../../services/analytics/v2Analytics';
import {
  Check,
  Target,
  Settings,
  Lightbulb,
  TrendingUp,
  AlertTriangle,
  Info,
  Brain,
} from 'lucide-react';

function SectionEmpty({ surface, text }: { surface: string; text: string }) {
  useEffect(() => { trackEmptyStateViewed(surface); }, [surface]);
  return (
    <div data-testid="no-data-state" className="rounded-v2-xl border border-dashed border-v2-border-light bg-white p-5">
      <p className="text-v2-sm text-v2-text-secondary leading-relaxed">{text}</p>
      <Link to="/plan" className="inline-block mt-3 text-v2-xs font-semibold text-v2-primary-600 hover:text-v2-primary-700">
        Ir a mi plan
      </Link>
    </div>
  );
}

const repo = createLocalRepository();

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
  const timeline = state.timeline;
  const grouped = groupByDay(timeline);

  useEffect(() => { trackTimelineView(); }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-v2-lg font-bold text-v2-text-primary">Cronologia</h2>
        <p className="text-v2-xs text-v2-text-tertiary mt-1">Historial de acciones de tu negocio</p>
      </div>

      {timeline.length === 0 && (
        <SectionEmpty surface="business_timeline" text="Aún no hay actividad registrada. Cada acción que completes en LocalSEOHub aparecerá aquí con su fecha." />
      )}

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
  const insights = useMemo(() => generateInsights(state), [state]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb size={16} className="text-v2-warning-500" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary">Insights</h2>
      </div>

      {insights.length === 0 && (
        <SectionEmpty surface="business_insights" text="Todavía no tenemos suficiente actividad tuya para sacar conclusiones. Completa algunas acciones y te mostraremos observaciones basadas en lo que has hecho." />
      )}

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
  const preferences = useMemo(() => inferPreferences(state), [state]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Brain size={16} className="text-v2-primary-500" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary">Preferencias detectadas</h2>
      </div>
      <p className="text-v2-xs text-v2-text-tertiary">Se actualizan automaticamente segun tu uso de la aplicacion.</p>

      {preferences.length === 0 && (
        <SectionEmpty surface="business_preferences" text="Aún no hemos detectado preferencias. Las iremos deduciendo de cómo y cuándo completas tus acciones." />
      )}

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
