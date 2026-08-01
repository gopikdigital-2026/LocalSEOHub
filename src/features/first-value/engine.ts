import type { ActionType, ImpactLevel } from '../../domain/types';
import type { GoalId } from '../business-memory/types';
import type {
  BusinessSetupData,
  Confidence,
  DataMode,
  FirstRecommendationData,
  ManualContextData,
  PreparedContent,
  SourceChoice,
} from './types';
import { AVAILABLE_GOALS } from '../business-memory/engine';

// ─── Input ──────────────────────────────────────────────────────────────────

export interface RecommendationInput {
  userId: string;
  businessId: string;
  business: BusinessSetupData;
  goalId: GoalId;
  source: SourceChoice;
  manualContext: ManualContextData | null;
}

// ─── Template ───────────────────────────────────────────────────────────────

interface RecommendationTemplate {
  goalIds: GoalId[];
  title: string;
  descriptionFn: (b: BusinessSetupData) => string;
  reasonFn: (b: BusinessSetupData, goal: string) => string;
  actionType: ActionType;
  impact: ImpactLevel;
  estimatedMinutes: number;
  contentFn: (b: BusinessSetupData, ctx: ManualContextData | null) => PreparedContent;
}

// ─── Honest templates (no fake claims) ──────────────────────────────────────

const TEMPLATES: RecommendationTemplate[] = [
  {
    goalIds: ['more_reviews', 'better_reputation'],
    title: 'Prepara una plantilla de respuesta a resenas',
    descriptionFn: (b) =>
      `Como primera orientacion para ${b.name || 'tu negocio'}, preparar respuestas tipo a resenas positivas y negativas te permite reaccionar rapidamente cuando lleguen.`,
    reasonFn: (_b, goal) =>
      `Basandonos en tu objetivo "${goal}" y tu categoria, responder resenas es una de las acciones con mayor impacto inmediato en la percepcion de nuevos clientes.`,
    actionType: 'respond_reviews',
    impact: 'high',
    estimatedMinutes: 5,
    contentFn: (b, ctx) => {
      const used: string[] = ['nombre del negocio'];
      const missing: string[] = [];
      if (ctx?.communicationTone) used.push('tono');
      else missing.push('tono de comunicacion');
      if (b.category) used.push('categoria');

      return {
        title: `Plantilla de respuesta a resenas para ${b.name || 'tu negocio'}`,
        body: `Muchas gracias por tu opinion sobre ${b.name || 'nuestro negocio'}. En ${b.name || 'nuestro equipo'}${b.city ? `, en ${b.city},` : ''} trabajamos cada dia para ofrecer la mejor experiencia${ctx?.mainService ? ` en ${ctx.mainService}` : ''}. Tu opinion nos ayuda a seguir mejorando.\n\nEsperamos verte pronto.`,
        callToAction: 'Copia esta plantilla y adaptala a cada resena que recibas.',
        personalizedWith: used,
        missingData: missing,
      };
    },
  },
  {
    goalIds: ['more_web_visits', 'better_local_seo', 'more_followers'],
    title: 'Publica una primera actualizacion sobre tu negocio',
    descriptionFn: (b) =>
      `Con la informacion disponible sobre ${b.name || 'tu negocio'}, preparamos una publicacion inicial que muestra actividad y relevancia para tu audiencia local.`,
    reasonFn: (_b, goal) =>
      `Basandonos en tu objetivo "${goal}", mantener actividad publica regular es una de las primeras acciones recomendadas. Esta recomendacion es estimada y se refinara al conectar fuentes reales.`,
    actionType: 'publish_post',
    impact: 'medium',
    estimatedMinutes: 4,
    contentFn: (b, ctx) => {
      const used: string[] = ['nombre del negocio'];
      const missing: string[] = [];
      if (b.category) used.push('categoria');
      if (b.city) used.push('ciudad');
      if (ctx?.mainService) used.push('servicio principal');
      else missing.push('servicio principal');
      if (ctx?.clientType) used.push('tipo de cliente');

      const service = ctx?.mainService || b.category || 'nuestros servicios';
      const audience = ctx?.clientType || 'nuestros clientes';

      return {
        title: `${service} en ${b.city || 'tu zona'} — ${b.name || 'Tu negocio'}`,
        body: `En ${b.name || 'nuestro negocio'}${b.city ? `, en ${b.city},` : ''} ayudamos a ${audience} con ${service}.\n\n${ctx?.mainService ? `Nuestro servicio principal, ${ctx.mainService}, esta pensado para ofrecerte resultados reales.` : `Cada dia trabajamos para ofrecer un servicio de calidad adaptado a tus necesidades.`}\n\nContactanos para saber como podemos ayudarte.`,
        callToAction: 'Publica este texto en tu perfil de Google Business o redes sociales.',
        personalizedWith: used,
        missingData: missing,
      };
    },
  },
  {
    goalIds: ['more_calls', 'more_bookings'],
    title: 'Define tu propuesta de valor en una frase',
    descriptionFn: (b) =>
      `Para ${b.name || 'tu negocio'}, tener una propuesta de valor clara ayuda a que los clientes entiendan rapidamente por que elegirte. Usaremos esto en futuras recomendaciones.`,
    reasonFn: (_b, goal) =>
      `Basandonos en tu objetivo "${goal}" y tu categoria, una propuesta de valor clara es el primer paso para convertir visitas en contactos. Esta recomendacion es inicial y se refinara con mas datos.`,
    actionType: 'update_description',
    impact: 'high',
    estimatedMinutes: 5,
    contentFn: (b, ctx) => {
      const used: string[] = ['nombre del negocio'];
      const missing: string[] = [];
      if (b.category) used.push('categoria');
      if (b.city) used.push('ciudad');
      if (ctx?.mainService) used.push('servicio principal');
      else missing.push('servicio principal');
      if (ctx?.clientType) used.push('tipo de cliente');
      else missing.push('tipo de cliente');

      const service = ctx?.mainService || b.category || 'nuestros servicios';
      const audience = ctx?.clientType || 'particulares y empresas';

      return {
        title: `Propuesta de valor para ${b.name || 'tu negocio'}`,
        body: `${b.name || 'Tu negocio'} es ${b.category ? `un negocio de ${b.category.toLowerCase()}` : 'un negocio local'}${b.city ? ` en ${b.city}` : ''} especializado en ${service}. Ayudamos a ${audience}${ctx?.mainService ? ` con ${ctx.mainService}` : ''}.\n\nContactanos para descubrir como podemos ayudarte.`,
        callToAction: 'Usa esta descripcion en tu perfil de Google Business y pagina web.',
        personalizedWith: used,
        missingData: missing,
      };
    },
  },
];

const FALLBACK_TEMPLATE: RecommendationTemplate = {
  goalIds: [],
  title: 'Completa la informacion basica de tu perfil',
  descriptionFn: (b) =>
    `Como primera orientacion para ${b.name || 'tu negocio'}, completar la informacion basica del perfil es el paso mas seguro para comenzar a mejorar tu presencia online.`,
  reasonFn: () =>
    'Esta recomendacion es estimada. Necesitamos conectar una fuente para verificar tu situacion actual y ofrecerte acciones mas especificas.',
  actionType: 'optimize_profile',
  impact: 'medium',
  estimatedMinutes: 5,
  contentFn: (b, ctx) => {
    const used: string[] = [];
    const missing: string[] = [];
    if (b.name) used.push('nombre del negocio');
    if (b.category) used.push('categoria');
    else missing.push('categoria');
    if (b.city) used.push('ciudad');
    else missing.push('ciudad');
    if (ctx?.mainService) used.push('servicio principal');
    else missing.push('servicio principal');

    return {
      title: `Perfil basico de ${b.name || 'tu negocio'}`,
      body: `Revisa que la informacion de tu perfil incluya:\n\n- Nombre: ${b.name || '(sin definir)'}\n- Categoria: ${b.category || '(sin definir)'}\n- Ciudad: ${b.city || '(sin definir)'}\n- Servicio principal: ${ctx?.mainService || '(sin definir)'}\n- Web: ${b.website || '(sin definir)'}\n\nCompleta los campos que falten para que tus clientes te encuentren facilmente.`,
      callToAction: 'Revisa y actualiza tu perfil en Google Business.',
      personalizedWith: used,
      missingData: missing,
    };
  },
};

// ─── Generate recommendation ────────────────────────────────────────────────

export function generateFirstRecommendation(input: RecommendationInput): FirstRecommendationData {
  const { userId, businessId, business, goalId, source, manualContext } = input;

  const template = TEMPLATES.find((t) => t.goalIds.includes(goalId)) ?? FALLBACK_TEMPLATE;
  const goalLabel = getGoalLabel(goalId);

  const dataMode = resolveDataMode(source);
  const confidence = resolveConfidence(source, manualContext);
  const sourceName = resolveSourceName(source);

  const evidenceSummary = buildEvidenceSummary(source, manualContext, business);
  const limitations = buildLimitations(source);

  const preparedContent = template.contentFn(business, manualContext);

  const now = new Date().toISOString();
  const stableId = `fv-${userId.slice(0, 8)}-${businessId}-${goalId}`;

  return {
    id: stableId,
    businessId,
    userId,
    goalId,
    title: template.title,
    description: template.descriptionFn(business),
    reason: template.reasonFn(business, goalLabel),
    evidenceSummary,
    limitations,
    actionType: template.actionType,
    impact: template.impact,
    estimatedTimeMinutes: template.estimatedMinutes,
    sourceType: source.type,
    sourceName,
    sourceUpdatedAt: now,
    dataMode,
    confidence,
    preparedContent,
    status: 'new',
    createdAt: now,
    updatedAt: now,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getGoalLabel(goalId: GoalId): string {
  return AVAILABLE_GOALS.find((g) => g.id === goalId)?.label ?? goalId;
}

export function computeTimeToFirstValue(startedAt: string): number {
  return Math.round((Date.now() - new Date(startedAt).getTime()) / 1000);
}

function resolveDataMode(source: SourceChoice): DataMode {
  switch (source.type) {
    case 'website_analysis': return source.websiteStatus === 'website_verified' ? 'verified' : 'estimated';
    case 'manual_entry': return 'manual';
    case 'demo': return 'demo';
  }
}

function resolveConfidence(source: SourceChoice, manualContext: ManualContextData | null): Confidence {
  if (source.type === 'demo') return 'low';
  if (source.type === 'manual_entry' && manualContext) return 'medium';
  if (source.type === 'website_analysis' && source.websiteStatus === 'website_verified') return 'high';
  return 'low';
}

function resolveSourceName(source: SourceChoice): string {
  switch (source.type) {
    case 'website_analysis': return 'Sitio web proporcionado (no analizado)';
    case 'manual_entry': return 'Datos proporcionados manualmente';
    case 'demo': return 'Datos demostrativos';
  }
}

function buildEvidenceSummary(source: SourceChoice, manualContext: ManualContextData | null, business: BusinessSetupData): string {
  const parts: string[] = [];
  if (business.name) parts.push(`Negocio: ${business.name}`);
  if (business.category) parts.push(`Categoria: ${business.category}`);
  if (business.city) parts.push(`Ciudad: ${business.city}`);

  if (source.type === 'website_analysis') {
    parts.push(`Web proporcionada: ${business.website}`);
    parts.push('Estado: sitio web proporcionado, todavia no analizado');
  } else if (source.type === 'manual_entry' && manualContext) {
    if (manualContext.mainService) parts.push(`Servicio principal: ${manualContext.mainService}`);
    if (manualContext.clientType) parts.push(`Cliente tipo: ${manualContext.clientType}`);
    if (manualContext.mainDifficulty) parts.push(`Dificultad: ${manualContext.mainDifficulty}`);
  } else if (source.type === 'demo') {
    parts.push('Usando datos demostrativos para explorar la herramienta');
  }

  return parts.join('. ') + '.';
}

function buildLimitations(source: SourceChoice): string {
  switch (source.type) {
    case 'website_analysis':
      return 'No se ha realizado un analisis real del sitio web. La recomendacion se basa unicamente en el objetivo y la categoria del negocio. Conecta Google Business para obtener recomendaciones verificadas.';
    case 'manual_entry':
      return 'Basado en la informacion que has proporcionado. La precision mejorara al conectar fuentes de datos reales.';
    case 'demo':
      return 'Esta es una recomendacion demostrativa. No refleja datos reales de tu negocio. Completa el perfil y conecta una fuente para obtener recomendaciones reales.';
  }
}
