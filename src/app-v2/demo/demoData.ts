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
    title: 'Responder 5 resenas pendientes',
    summary: 'Tienes resenas sin responder que afectan tu reputacion online.',
    explanation: 'Los clientes valoran que un negocio responda. Responder demuestra actividad y confianza. Google prioriza negocios que interactuan con sus clientes.',
    reason: 'Las resenas sin respuesta reducen la confianza de nuevos clientes potenciales.',
    source: 'Google Business Profile',
    sourceType: 'google_business',
    sourceUpdatedAt: null,
    confidence: 'demo',
    impact: 'high',
    estimatedTimeMinutes: 7,
    status: 'new',
    actionType: 'respond_reviews',
    createdAt: '2026-07-25T08:00:00Z',
    dataMode: DEMO_MODE,
  },
  {
    id: 'rec-demo-002',
    businessId: 'demo-biz-001',
    title: 'Publicar una actualizacion semanal',
    summary: 'Tu perfil lleva mas de 7 dias sin actividad de publicaciones.',
    explanation: 'Los perfiles con publicaciones recientes reciben hasta un 35% mas de clics en Google Maps. Un post semanal mantiene tu perfil activo y visible.',
    reason: 'La ausencia de publicaciones recientes indica inactividad a Google y a los clientes.',
    source: 'Google Business Profile',
    sourceType: 'google_business',
    sourceUpdatedAt: null,
    confidence: 'demo',
    impact: 'medium',
    estimatedTimeMinutes: 12,
    status: 'new',
    actionType: 'publish_post',
    createdAt: '2026-07-25T08:00:00Z',
    dataMode: DEMO_MODE,
  },
  {
    id: 'rec-demo-003',
    businessId: 'demo-biz-001',
    title: 'Optimizar la descripcion del negocio',
    summary: 'Tu descripcion puede incluir palabras clave locales que mejoren tu posicionamiento.',
    explanation: 'Una descripcion con tu ciudad, barrio y servicios especificos ayuda a que Google muestre tu negocio en busquedas relevantes. Es una mejora rapida con impacto duradero.',
    reason: 'La descripcion actual no menciona la ubicacion ni los servicios diferenciadores.',
    source: 'Sitio web',
    sourceType: 'website',
    sourceUpdatedAt: null,
    confidence: 'demo',
    impact: 'medium',
    estimatedTimeMinutes: 20,
    status: 'new',
    actionType: 'update_description',
    createdAt: '2026-07-25T08:00:00Z',
    dataMode: DEMO_MODE,
  },
  {
    id: 'rec-demo-004',
    businessId: 'demo-biz-001',
    title: 'Subir 3 fotos nuevas del negocio',
    summary: 'Los perfiles con fotos recientes reciben un 42% mas de solicitudes de direccion.',
    explanation: 'Las fotos actualizadas generan confianza visual. Los clientes quieren ver el estado real del negocio antes de visitarlo.',
    reason: 'No se han subido fotos nuevas en las ultimas 4 semanas.',
    source: 'Google Business Profile',
    sourceType: 'google_business',
    sourceUpdatedAt: null,
    confidence: 'demo',
    impact: 'low',
    estimatedTimeMinutes: 10,
    status: 'new',
    actionType: 'add_photos',
    createdAt: '2026-07-25T08:00:00Z',
    dataMode: DEMO_MODE,
  },
  {
    id: 'rec-demo-005',
    businessId: 'demo-biz-001',
    title: 'Verificar horario de verano',
    summary: 'Es temporada de cambio de horarios. Verificar que el horario publicado sea correcto.',
    explanation: 'Un horario incorrecto frustra a clientes que llegan y encuentran cerrado. Google penaliza perfiles con informacion desactualizada.',
    reason: 'El horario no se ha actualizado desde hace 3 meses.',
    source: 'Google Business Profile',
    sourceType: 'google_business',
    sourceUpdatedAt: null,
    confidence: 'demo',
    impact: 'low',
    estimatedTimeMinutes: 5,
    status: 'new',
    actionType: 'update_hours',
    createdAt: '2026-07-25T08:00:00Z',
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
  weekStart: '2026-07-21T00:00:00Z',
  dataMode: DEMO_MODE,
};

export const demoMetrics: Metric[] = [
  {
    id: 'metric-demo-001',
    name: 'Visitas al perfil',
    value: 0,
    unit: 'visitas/semana',
    source: 'google_business',
    updatedAt: '2026-07-25T08:00:00Z',
    confidence: 'demo',
    dataMode: DEMO_MODE,
  },
  {
    id: 'metric-demo-002',
    name: 'Resenas nuevas',
    value: 0,
    unit: 'resenas/mes',
    source: 'reviews',
    updatedAt: '2026-07-25T08:00:00Z',
    confidence: 'demo',
    dataMode: DEMO_MODE,
  },
];

export interface DailyBriefingData {
  goal: Recommendation | null;
  actions: Recommendation[];
  completedToday: number;
  timeInvestedMinutes: number;
  weeklyProgress: { completed: number; total: number };
  tomorrowTopics: string[];
}

export const demoDailyBriefing: DailyBriefingData = {
  goal: demoRecommendations[0],
  actions: demoRecommendations.slice(0, 3),
  completedToday: 0,
  timeInvestedMinutes: 0,
  weeklyProgress: { completed: 6, total: 10 },
  tomorrowTopics: ['SEO Local', 'Publicaciones', 'Competidores'],
};
