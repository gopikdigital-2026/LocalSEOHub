import type {
  Business,
  DataSource,
  Recommendation,
  Task,
  WeeklyGoal,
  Metric,
  DataMode,
} from '../../domain/types';

const DEMO_MODE: DataMode = 'demo';

export const demoBusiness: Business = {
  id: 'demo-biz-001',
  name: 'Mi Negocio Demo',
  city: 'Madrid',
  category: 'Servicios locales',
  website: 'https://ejemplo.com',
  ownerId: 'demo-user',
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-07-18T08:00:00Z',
};

export const demoDataSources: DataSource[] = [
  {
    id: 'ds-gbp',
    type: 'google_business',
    name: 'Google Business Profile',
    connected: false,
    lastUpdatedAt: null,
    status: 'not_connected',
  },
  {
    id: 'ds-web',
    type: 'website',
    name: 'Sitio web',
    connected: false,
    lastUpdatedAt: null,
    status: 'not_connected',
  },
  {
    id: 'ds-reviews',
    type: 'reviews',
    name: 'Resenas',
    connected: false,
    lastUpdatedAt: null,
    status: 'not_connected',
  },
];

export const demoRecommendations: Recommendation[] = [
  {
    id: 'rec-demo-001',
    businessId: 'demo-biz-001',
    title: 'Responder resenas pendientes',
    summary: 'Tienes resenas sin responder que afectan tu reputacion online.',
    explanation: 'Google valora las respuestas rapidas a resenas. Los negocios que responden en menos de 24 horas aparecen mejor posicionados en busquedas locales.',
    reason: 'Las resenas sin respuesta reducen la confianza de nuevos clientes potenciales.',
    source: 'Google Business Profile',
    sourceType: 'google_business',
    sourceUpdatedAt: null,
    confidence: 'demo',
    impact: 'high',
    estimatedTimeMinutes: 15,
    status: 'new',
    actionType: 'respond_reviews',
    createdAt: '2026-07-18T08:00:00Z',
    dataMode: DEMO_MODE,
  },
  {
    id: 'rec-demo-002',
    businessId: 'demo-biz-001',
    title: 'Preparar una publicacion para Google Business',
    summary: 'Publicar contenido semanal en tu perfil mejora la visibilidad.',
    explanation: 'Los perfiles con publicaciones recientes reciben hasta un 35% mas de clics en Google Maps. Un post semanal mantiene tu perfil activo.',
    reason: 'Tu perfil lleva mas de 7 dias sin actividad de publicaciones.',
    source: 'Google Business Profile',
    sourceType: 'google_business',
    sourceUpdatedAt: null,
    confidence: 'demo',
    impact: 'medium',
    estimatedTimeMinutes: 20,
    status: 'new',
    actionType: 'publish_post',
    createdAt: '2026-07-18T08:00:00Z',
    dataMode: DEMO_MODE,
  },
  {
    id: 'rec-demo-003',
    businessId: 'demo-biz-001',
    title: 'Revisar la descripcion del servicio principal',
    summary: 'Tu descripcion puede optimizarse para incluir palabras clave locales.',
    explanation: 'Una descripcion que incluya tu ciudad, barrio y servicios especificos ayuda a que Google muestre tu negocio en busquedas relevantes.',
    reason: 'La descripcion actual no menciona la ubicacion ni los servicios diferenciadores.',
    source: 'Sitio web',
    sourceType: 'website',
    sourceUpdatedAt: null,
    confidence: 'demo',
    impact: 'medium',
    estimatedTimeMinutes: 30,
    status: 'new',
    actionType: 'update_description',
    createdAt: '2026-07-18T08:00:00Z',
    dataMode: DEMO_MODE,
  },
];

export const demoTasks: Task[] = demoRecommendations.map((rec) => ({
  id: `task-${rec.id}`,
  recommendationId: rec.id,
  title: rec.title,
  description: rec.summary,
  status: 'pending' as const,
  priority: rec.impact,
  dataMode: DEMO_MODE,
}));

export const demoWeeklyGoal: WeeklyGoal = {
  id: 'goal-demo-001',
  businessId: 'demo-biz-001',
  title: 'Mejorar la actividad y la confianza del perfil de Google',
  description: 'Esta semana el foco es activar el perfil de Google Business con publicaciones y respuestas a resenas.',
  weekStart: '2026-07-15T00:00:00Z',
  dataMode: DEMO_MODE,
};

export const demoMetrics: Metric[] = [
  {
    id: 'metric-demo-001',
    name: 'Visitas al perfil',
    value: 0,
    unit: 'visitas/semana',
    source: 'google_business',
    updatedAt: '2026-07-18T08:00:00Z',
    confidence: 'demo',
    dataMode: DEMO_MODE,
  },
  {
    id: 'metric-demo-002',
    name: 'Resenas nuevas',
    value: 0,
    unit: 'resenas/mes',
    source: 'reviews',
    updatedAt: '2026-07-18T08:00:00Z',
    confidence: 'demo',
    dataMode: DEMO_MODE,
  },
];
