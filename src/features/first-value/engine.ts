import type { ActionType, ImpactLevel } from '../../domain/types';
import type { GoalId } from '../business-memory/types';
import type { BusinessSetupData, FirstRecommendationData, SourceChoice } from './types';
import { AVAILABLE_GOALS } from '../business-memory/engine';

interface AnalysisInput {
  business: BusinessSetupData;
  goalId: GoalId;
  source: SourceChoice;
}

interface RecommendationTemplate {
  goalIds: GoalId[];
  title: string;
  whatHappens: string;
  whyItMatters: string;
  whatWePreparedFn: (business: BusinessSetupData) => string;
  estimatedMinutes: number;
  impact: ImpactLevel;
  actionType: ActionType;
}

const TEMPLATES: RecommendationTemplate[] = [
  {
    goalIds: ['more_reviews', 'better_reputation'],
    title: 'Responde a tus resenas pendientes',
    whatHappens: 'Los clientes que dejan resenas esperan una respuesta. Sin respuesta, pueden percibir desinteres.',
    whyItMatters: 'Responder resenas mejora la confianza de futuros clientes y senala actividad a Google.',
    whatWePreparedFn: (b) => `Hemos preparado respuestas adaptadas a ${b.name || 'tu negocio'} para que solo tengas que revisar y confirmar.`,
    estimatedMinutes: 5,
    impact: 'high',
    actionType: 'respond_reviews',
  },
  {
    goalIds: ['more_web_visits', 'better_local_seo', 'more_followers'],
    title: 'Publica una actualizacion esta semana',
    whatHappens: 'No hemos encontrado publicaciones recientes asociadas a tu negocio.',
    whyItMatters: 'Los perfiles con actividad reciente reciben mas visibilidad en Google Maps y busquedas locales.',
    whatWePreparedFn: (b) => `Hemos preparado una publicacion sobre ${b.category || 'tu actividad'} en ${b.city || 'tu zona'} lista para revisar.`,
    estimatedMinutes: 3,
    impact: 'medium',
    actionType: 'publish_post',
  },
  {
    goalIds: ['more_calls', 'more_bookings'],
    title: 'Optimiza la descripcion de tu perfil',
    whatHappens: 'La descripcion actual no menciona tu ubicacion ni servicios diferenciadores.',
    whyItMatters: 'Una descripcion con palabras clave locales ayuda a que Google muestre tu negocio en busquedas relevantes.',
    whatWePreparedFn: (b) => `Hemos redactado una propuesta de descripcion para ${b.name || 'tu negocio'} que incluye tu ciudad y servicios principales.`,
    estimatedMinutes: 4,
    impact: 'high',
    actionType: 'update_description',
  },
];

const FALLBACK_TEMPLATE: RecommendationTemplate = {
  goalIds: [],
  title: 'Publica una actualizacion sobre tu negocio',
  whatHappens: 'Mantener actividad regular es clave para la visibilidad online.',
  whyItMatters: 'Una publicacion semanal mantiene tu perfil activo y visible para clientes potenciales.',
  whatWePreparedFn: (b) => `Hemos preparado un texto adaptado a ${b.category || 'tu sector'} en ${b.city || 'tu zona'}.`,
  estimatedMinutes: 3,
  impact: 'medium',
  actionType: 'publish_post',
};

export function generateFirstRecommendation(input: AnalysisInput): FirstRecommendationData {
  const { business, goalId, source } = input;

  const template = TEMPLATES.find((t) => t.goalIds.includes(goalId)) ?? FALLBACK_TEMPLATE;

  const sourceName = source.type === 'website_analysis'
    ? 'Analisis del sitio web'
    : source.type === 'manual_entry'
      ? 'Datos proporcionados manualmente'
      : 'Datos demostrativos';

  return {
    id: `fv-rec-${goalId}-${Date.now()}`,
    title: template.title,
    whatHappens: template.whatHappens,
    whyItMatters: template.whyItMatters,
    whatWePrepared: template.whatWePreparedFn(business),
    estimatedMinutes: template.estimatedMinutes,
    source: sourceName,
    confidence: source.confidence,
    impact: template.impact,
    actionType: template.actionType,
  };
}

export function getGoalLabel(goalId: GoalId): string {
  return AVAILABLE_GOALS.find((g) => g.id === goalId)?.label ?? '';
}

export function computeTimeToFirstValue(startedAt: string): number {
  return Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
}
