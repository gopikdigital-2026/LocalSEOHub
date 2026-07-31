import type { ActionType, ImpactLevel, Recommendation } from '../../domain/types';
import type {
  BusinessMemoryState,
  BusinessInsight,
  BusinessPreference,
  TimelineEvent,
  WeeklySummaryData,
  GoalId,
} from './types';
import type { MemoryRepository } from './repository';

// ─── Event Registration ─────────────────────────────────────────────────────

export function registerActionCompleted(
  repo: MemoryRepository,
  title: string,
  actionType: ActionType,
  impact: ImpactLevel,
  durationMinutes: number,
): void {
  const event: TimelineEvent = {
    id: `evt-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: 'action_completed',
    title,
    actionType,
    impact,
    durationMinutes,
  };
  repo.addTimelineEvent(event);
}

export function registerGoalSet(repo: MemoryRepository, goalId: GoalId, label: string): void {
  const event: TimelineEvent = {
    id: `evt-goal-${goalId}-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: 'goal_set',
    title: `Objetivo definido: ${label}`,
  };
  repo.addTimelineEvent(event);
}

export function registerProfileUpdated(repo: MemoryRepository, field: string): void {
  const event: TimelineEvent = {
    id: `evt-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: 'profile_updated',
    title: `Perfil actualizado: ${field}`,
  };
  repo.addTimelineEvent(event);
}

// ─── Insight Generation ─────────────────────────────────────────────────────

export function generateInsights(state: BusinessMemoryState): BusinessInsight[] {
  const insights: BusinessInsight[] = [];
  const now = Date.now();
  const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

  const thisWeekActions = state.timeline.filter(
    (e) => e.type === 'action_completed' && new Date(e.timestamp).getTime() > oneWeekAgo,
  );
  const lastWeekActions = state.timeline.filter(
    (e) =>
      e.type === 'action_completed' &&
      new Date(e.timestamp).getTime() > twoWeeksAgo &&
      new Date(e.timestamp).getTime() <= oneWeekAgo,
  );

  // Comparison with previous week
  if (thisWeekActions.length > lastWeekActions.length && lastWeekActions.length > 0) {
    insights.push({
      id: 'insight-more-actions',
      text: `Esta semana has completado ${thisWeekActions.length} acciones, mas que las ${lastWeekActions.length} de la semana anterior.`,
      type: 'positive',
      generatedAt: new Date().toISOString(),
      basedOn: 'Comparacion semanal de acciones completadas',
    });
  }

  // Inactivity detection
  const lastAction = state.timeline.find((e) => e.type === 'action_completed');
  if (lastAction) {
    const daysSinceLastAction = Math.floor((now - new Date(lastAction.timestamp).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceLastAction >= 7) {
      insights.push({
        id: 'insight-inactivity',
        text: `Llevas ${daysSinceLastAction} dias sin completar una accion. Retomar la actividad mejorara tu visibilidad.`,
        type: 'warning',
        generatedAt: new Date().toISOString(),
        basedOn: 'Dias desde la ultima accion completada',
      });
    }
  }

  // Goal progress
  if (state.goals.length > 0 && thisWeekActions.length >= 7) {
    insights.push({
      id: 'insight-goal-progress',
      text: `Has completado el ${Math.min(100, Math.round((thisWeekActions.length / 10) * 100))}% del plan semanal.`,
      type: thisWeekActions.length >= 10 ? 'positive' : 'neutral',
      generatedAt: new Date().toISOString(),
      basedOn: 'Progreso respecto al plan semanal de 10 acciones',
    });
  }

  // Review-specific insight
  const reviewActions = thisWeekActions.filter((e) => e.actionType === 'respond_reviews');
  if (reviewActions.length > 0) {
    insights.push({
      id: 'insight-reviews',
      text: `Has respondido resenas ${reviewActions.length} ${reviewActions.length === 1 ? 'vez' : 'veces'} esta semana. Mantener esta frecuencia mejora tu reputacion.`,
      type: 'positive',
      generatedAt: new Date().toISOString(),
      basedOn: 'Acciones de tipo resena completadas esta semana',
    });
  }

  // Content publishing
  const lastContentAction = state.timeline.find(
    (e) => e.type === 'action_completed' && (e.actionType === 'publish_post' || e.actionType === 'create_content'),
  );
  if (lastContentAction) {
    const daysSinceContent = Math.floor(
      (now - new Date(lastContentAction.timestamp).getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceContent >= 10) {
      insights.push({
        id: 'insight-content-gap',
        text: `Llevas ${daysSinceContent} dias sin publicar contenido. Una publicacion semanal mantiene tu perfil activo.`,
        type: 'warning',
        generatedAt: new Date().toISOString(),
        basedOn: 'Dias desde la ultima publicacion de contenido',
      });
    }
  }

  return insights;
}

// ─── Preference Inference ───────────────────────────────────────────────────

export function inferPreferences(state: BusinessMemoryState): BusinessPreference[] {
  const preferences: BusinessPreference[] = [];
  const actions = state.timeline.filter((e) => e.type === 'action_completed');

  if (actions.length < 3) return preferences;

  // Day-of-week preference
  const dayCounts: Record<number, number> = {};
  actions.forEach((a) => {
    const day = new Date(a.timestamp).getDay();
    dayCounts[day] = (dayCounts[day] ?? 0) + 1;
  });
  const topDay = Object.entries(dayCounts).sort(([, a], [, b]) => b - a)[0];
  if (topDay && Number(topDay[1]) >= 3) {
    const dayNames = ['domingos', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabados'];
    preferences.push({
      id: 'pref-day',
      label: `Suele trabajar los ${dayNames[Number(topDay[0])]}`,
      inferredFrom: `${topDay[1]} acciones completadas ese dia`,
      confidence: Number(topDay[1]) >= 5 ? 'high' : 'medium',
    });
  }

  // Time-of-day preference
  const hourCounts: Record<string, number> = { morning: 0, afternoon: 0, evening: 0 };
  actions.forEach((a) => {
    const h = new Date(a.timestamp).getHours();
    if (h < 12) hourCounts.morning++;
    else if (h < 18) hourCounts.afternoon++;
    else hourCounts.evening++;
  });
  const topTime = Object.entries(hourCounts).sort(([, a], [, b]) => b - a)[0];
  if (topTime && topTime[1] >= 3) {
    const timeLabels: Record<string, string> = { morning: 'por la manana', afternoon: 'por la tarde', evening: 'por la noche' };
    preferences.push({
      id: 'pref-time',
      label: `Completa tareas ${timeLabels[topTime[0]]}`,
      inferredFrom: `${topTime[1]} acciones en ese horario`,
      confidence: topTime[1] >= 5 ? 'high' : 'medium',
    });
  }

  // Action type preference
  const typeCounts: Record<string, number> = {};
  actions.forEach((a) => {
    if (a.actionType) typeCounts[a.actionType] = (typeCounts[a.actionType] ?? 0) + 1;
  });
  const topType = Object.entries(typeCounts).sort(([, a], [, b]) => b - a)[0];
  if (topType && topType[1] >= 3) {
    const typeLabels: Record<string, string> = {
      respond_reviews: 'Responder resenas',
      publish_post: 'Publicar contenido',
      update_description: 'Optimizar perfil',
      create_content: 'Crear contenido',
      add_photos: 'Subir fotos',
      update_hours: 'Actualizar horarios',
      optimize_profile: 'Optimizar perfil',
      request_reviews: 'Solicitar resenas',
      other: 'Otras acciones',
    };
    preferences.push({
      id: 'pref-action-type',
      label: `Prefiere: ${typeLabels[topType[0]] ?? topType[0]}`,
      inferredFrom: `${topType[1]} acciones de este tipo completadas`,
      confidence: topType[1] >= 5 ? 'high' : 'medium',
    });
  }

  // Duration preference
  const shortActions = actions.filter((a) => (a.durationMinutes ?? 0) <= 15).length;
  if (shortActions > actions.length * 0.6 && actions.length >= 5) {
    preferences.push({
      id: 'pref-short-tasks',
      label: 'Prefiere tareas rapidas (menos de 15 min)',
      inferredFrom: `${Math.round((shortActions / actions.length) * 100)}% de acciones son cortas`,
      confidence: 'medium',
    });
  }

  return preferences;
}

// ─── Weekly Summary Generation ──────────────────────────────────────────────

export function generateWeeklySummary(state: BusinessMemoryState): WeeklySummaryData {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const weekActions = state.timeline.filter(
    (e) =>
      e.type === 'action_completed' &&
      new Date(e.timestamp).getTime() >= weekStart.getTime() &&
      new Date(e.timestamp).getTime() <= weekEnd.getTime(),
  );

  const timeInvested = weekActions.reduce((sum, e) => sum + (e.durationMinutes ?? 0), 0);

  const impactAchieved = { high: 0, medium: 0, low: 0 };
  weekActions.forEach((e) => {
    if (e.impact) impactAchieved[e.impact]++;
  });

  const goalsProgress = state.goals.map((g) => {
    const relatedActions = weekActions.filter((e) => {
      const goalDef = AVAILABLE_GOALS.find((ag) => ag.id === g.goalId);
      return goalDef?.relatedActions.includes(e.actionType as ActionType);
    });
    return { goalId: g.goalId, progress: Math.min(100, relatedActions.length * 25) };
  });

  let topRecommendation = 'Mantener la actividad actual para consolidar resultados.';
  if (weekActions.length === 0) {
    topRecommendation = 'Empezar con una accion rapida para recuperar el ritmo.';
  } else if (weekActions.length < 5) {
    topRecommendation = 'Aumentar la frecuencia de acciones para alcanzar el objetivo semanal.';
  } else if (impactAchieved.high === 0) {
    topRecommendation = 'Priorizar al menos una accion de alto impacto la proxima semana.';
  }

  return {
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    actionsCompleted: weekActions.length,
    timeInvestedMinutes: timeInvested,
    goalsProgress,
    impactAchieved,
    topRecommendation,
  };
}

// ─── Personalized Recommendation Scoring ────────────────────────────────────

export function personalizedScore(
  rec: Recommendation,
  state: BusinessMemoryState,
): number {
  let score = 0;

  // Goal alignment: +20 if the action matches a selected goal
  const goalIds = state.goals.map((g) => g.goalId);
  const matchingGoal = AVAILABLE_GOALS.find(
    (g) => goalIds.includes(g.id) && g.relatedActions.includes(rec.actionType),
  );
  if (matchingGoal) score += 20;

  // Recency penalty: -10 if same actionType completed in last 2 days
  const recentSameType = state.timeline.find(
    (e) =>
      e.type === 'action_completed' &&
      e.actionType === rec.actionType &&
      Date.now() - new Date(e.timestamp).getTime() < 2 * 24 * 60 * 60 * 1000,
  );
  if (recentSameType) score -= 10;

  // Preference alignment: +10 if action is the preferred type
  const prefType = state.preferences.find((p) => p.id === 'pref-action-type');
  if (prefType && prefType.label.toLowerCase().includes(rec.actionType.replace('_', ' '))) {
    score += 10;
  }

  // Variety bonus: +5 if actionType hasn't been done this week
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const doneThisWeek = state.timeline.some(
    (e) =>
      e.type === 'action_completed' &&
      e.actionType === rec.actionType &&
      new Date(e.timestamp).getTime() > oneWeekAgo,
  );
  if (!doneThisWeek) score += 5;

  return score;
}

// ─── Available Goals Catalog ────────────────────────────────────────────────

import type { BusinessGoal } from './types';

export const AVAILABLE_GOALS: BusinessGoal[] = [
  {
    id: 'more_calls',
    label: 'Conseguir mas llamadas',
    description: 'Optimizar el perfil para que mas clientes potenciales te llamen directamente.',
    icon: 'Phone',
    relatedActions: ['optimize_profile', 'update_description', 'update_hours'],
  },
  {
    id: 'more_reviews',
    label: 'Conseguir mas resenas',
    description: 'Aumentar el numero de resenas positivas para mejorar la reputacion online.',
    icon: 'Star',
    relatedActions: ['respond_reviews', 'request_reviews'],
  },
  {
    id: 'better_local_seo',
    label: 'Mejorar posicionamiento local',
    description: 'Aparecer mas arriba en Google Maps y busquedas locales.',
    icon: 'MapPin',
    relatedActions: ['update_description', 'publish_post', 'add_photos', 'optimize_profile'],
  },
  {
    id: 'more_bookings',
    label: 'Conseguir mas reservas',
    description: 'Facilitar que los clientes reserven directamente desde tu perfil.',
    icon: 'CalendarCheck',
    relatedActions: ['optimize_profile', 'update_hours', 'publish_post'],
  },
  {
    id: 'more_web_visits',
    label: 'Aumentar visitas a la web',
    description: 'Dirigir mas trafico desde Google hacia tu sitio web.',
    icon: 'Globe',
    relatedActions: ['create_content', 'publish_post', 'update_description'],
  },
  {
    id: 'more_followers',
    label: 'Ganar seguidores',
    description: 'Aumentar la audiencia en tus perfiles digitales.',
    icon: 'Users',
    relatedActions: ['publish_post', 'create_content'],
  },
  {
    id: 'better_reputation',
    label: 'Mejorar reputacion online',
    description: 'Gestionar activamente lo que los clientes dicen de tu negocio.',
    icon: 'Shield',
    relatedActions: ['respond_reviews', 'request_reviews', 'publish_post'],
  },
];
