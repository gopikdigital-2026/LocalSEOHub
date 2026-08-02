import type {
  Recommendation,
  DataMode,
} from '../../domain/types';

const DEMO_MODE: DataMode = 'demo';

export const demoRecommendations: Recommendation[] = [
  {
    id: 'rec-demo-001',
    businessId: 'demo-biz-001',
    title: 'Responder 5 resenas pendientes',
    summary: 'Tienes resenas sin responder que afectan tu reputacion online.',
    explanation: 'Los clientes valoran que un negocio responda. Responder demuestra actividad y confianza.',
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
    explanation: 'Los perfiles con publicaciones recientes reciben mas clics. Un post semanal mantiene tu perfil activo.',
    reason: 'La ausencia de publicaciones recientes indica inactividad.',
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
    explanation: 'Una descripcion con tu ciudad, barrio y servicios especificos ayuda a que aparezcas en busquedas relevantes.',
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
    summary: 'Las fotos actualizadas generan confianza visual para nuevos clientes.',
    explanation: 'Los clientes quieren ver el estado real del negocio antes de visitarlo.',
    reason: 'No se han subido fotos nuevas en las ultimas semanas.',
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
    explanation: 'Un horario incorrecto frustra a clientes que llegan y encuentran cerrado.',
    reason: 'El horario no se ha actualizado recientemente.',
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
  weeklyProgress: { completed: 0, total: 5 },
  tomorrowTopics: ['Presencia local', 'Resenas', 'Contenido'],
};
