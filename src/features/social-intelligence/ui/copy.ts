import type { Lang } from '../../../lib/i18n';
import type { SupportedRecommendationKey } from '../findings/types';
import type { SocialPlatform } from '../types';

export type PlatformStatusKey =
  | 'connected' | 'stale' | 'reauth' | 'permission' | 'notConnected' | 'notLinked'
  | 'rateLimited' | 'syncError' | 'neverSynced';

export type CoverageAspect = 'frequency' | 'contentType' | 'engagement' | 'dates';
export type RefreshStatus = 'idle' | 'refreshing' | 'success' | 'cooldown' | 'rateLimited' | 'reauth' | 'permission' | 'error';
export type ContentTypeLabelKey = 'post' | 'photo' | 'video' | 'link' | 'event' | 'image' | 'carousel' | 'reel';

export interface SocialUiCopy {
  back: string;
  title: string;
  subtitle: string;
  sourceNote: string;
  loading: string;
  errorTitle: string;
  errorTemporary: string;
  retry: string;
  noBusiness: string;
  noBusinessCta: string;
  overviewTitle: string;
  attentionTitle: string;
  attentionEmpty: string;
  knownTitle: string;
  coverageTitle: string;
  dataTitle: string;
  dataBody: string;
  platform: Record<SocialPlatform, string>;
  status: Record<PlatformStatusKey, string>;
  activityRecent: string;
  activityLong: string;
  activityNoContent: string;
  activityNoDates: string;
  lastPost: (days: number) => string;
  postsAnalysed: (n: number) => string;
  historyBuilding: string;
  updated: (relative: string) => string;
  neverUpdated: string;
  recTitle: Partial<Record<SupportedRecommendationKey, string>>;
  priority: string;
  toReview: string;
  why: string;
  lastGood: (date: string) => string;
  viewPosts: string;
  hidePosts: string;
  postsListLabel: string;
  openOn: (platform: string) => string;
  newTab: string;
  noLink: string;
  dateUnavailable: string;
  contentType: Record<ContentTypeLabelKey, string>;
  windowTruncated: string;
  coverageHistoryTitle: string;
  coverageHistoryBody: (aspects: string) => string;
  coverageAspect: Record<CoverageAspect, string>;
  coverageEngagementUnavailable: (platform: string) => string;
  refresh: string;
  refreshState: Record<Exclude<RefreshStatus, 'idle'>, string>;
  showingLastGood: string;
  goToSources: string;
  connectCta: string;
  emptyTitle: string;
  emptyBody: string;
  emptyNote: string;
}

const es: SocialUiCopy = {
  back: 'Volver a Herramientas',
  title: 'Inteligencia Social',
  subtitle: 'Analizamos los datos reales de tus cuentas conectadas de Facebook e Instagram para mostrarte qué merece atención y qué puedes revisar.',
  sourceNote: 'Solo leemos tus publicaciones. No publicamos ni modificamos nada en Meta.',
  loading: 'Cargando el análisis de tus redes…',
  errorTitle: 'Análisis no disponible',
  errorTemporary: 'No hemos podido cargar el análisis ahora mismo. Inténtalo de nuevo en unos segundos.',
  retry: 'Reintentar',
  noBusiness: 'Selecciona o crea un negocio para ver su análisis social.',
  noBusinessCta: 'Ir a Mi negocio',
  overviewTitle: 'Tus cuentas',
  attentionTitle: 'Qué merece tu atención',
  attentionEmpty: 'Ahora mismo no hay nada que requiera tu atención con los datos disponibles.',
  knownTitle: 'Lo que sabemos hasta ahora',
  coverageTitle: 'Alcance del análisis',
  dataTitle: 'Datos del análisis',
  dataBody: 'El análisis se calcula con las publicaciones sincronizadas desde Meta. Al actualizar, volvemos a leer tus publicaciones de Facebook e Instagram.',
  platform: { facebook: 'Facebook', instagram: 'Instagram' },
  status: {
    connected: 'Conectado',
    stale: 'Datos desactualizados',
    reauth: 'Requiere reconexión',
    permission: 'Acceso limitado',
    notConnected: 'Sin conectar',
    notLinked: 'Sin vincular',
    rateLimited: 'Pausa temporal de Meta',
    syncError: 'Error temporal',
    neverSynced: 'Pendiente de sincronizar',
  },
  activityRecent: 'Actividad reciente',
  activityLong: 'Sin publicaciones recientes',
  activityNoContent: 'Sin publicaciones observadas',
  activityNoDates: 'Fechas no disponibles',
  lastPost: (d) => (d === 0 ? 'Última publicación hoy' : d === 1 ? 'Última publicación hace 1 día' : `Última publicación hace ${d} días`),
  postsAnalysed: (n) => (n === 1 ? '1 publicación analizada' : `${n} publicaciones analizadas`),
  historyBuilding: 'Historial en construcción',
  updated: (rel) => `Datos actualizados ${rel}`,
  neverUpdated: 'Aún sin datos sincronizados',
  recTitle: {
    REVIEW_POSTS_WITHOUT_TEXT: 'Revisa el texto de algunas publicaciones',
    REVIEW_POSTS_WITHOUT_CAPTION: 'Revisa la descripción de algunas publicaciones',
    RECONNECT_META: 'Vuelve a conectar Meta',
    REVIEW_META_PERMISSIONS: 'Revisa los permisos de Meta',
  },
  priority: 'Prioritario',
  toReview: 'Para revisar',
  why: '¿Por qué?',
  lastGood: (date) => `Última actualización correcta: ${date}.`,
  viewPosts: 'Ver publicaciones',
  hidePosts: 'Ocultar publicaciones',
  postsListLabel: 'Publicaciones afectadas',
  openOn: (p) => `Abrir en ${p}`,
  newTab: '(se abre en una pestaña nueva)',
  noLink: 'Enlace no disponible',
  dateUnavailable: 'Fecha no disponible',
  contentType: { post: 'Publicación', photo: 'Foto', video: 'Vídeo', link: 'Enlace', event: 'Evento', image: 'Imagen', carousel: 'Carrusel', reel: 'Reel' },
  windowTruncated: 'Basado en tus publicaciones más recientes.',
  coverageHistoryTitle: 'Historial en construcción',
  coverageHistoryBody: (aspects) => `Necesitamos más publicaciones sincronizadas para valorar ${aspects} con fiabilidad. Esto describe los límites del análisis, no la situación de tu negocio.`,
  coverageAspect: { frequency: 'el ritmo de publicación', contentType: 'los formatos', engagement: 'la interacción', dates: 'las fechas de publicación' },
  coverageEngagementUnavailable: (p) => `Las métricas de interacción de ${p} no están disponibles actualmente para este análisis.`,
  refresh: 'Actualizar datos',
  refreshState: {
    refreshing: 'Actualizando datos…',
    success: 'Datos actualizados. El análisis refleja la última sincronización.',
    cooldown: 'Acabas de actualizar. Espera un minuto antes de volver a intentarlo.',
    rateLimited: 'Meta está limitando temporalmente las consultas. Inténtalo más tarde.',
    reauth: 'La conexión con Meta necesita autorizarse de nuevo. Puedes hacerlo desde Fuentes.',
    permission: 'Falta un permiso para leer tus datos. Puedes revisarlo desde Fuentes.',
    error: 'No hemos podido actualizar los datos ahora mismo.',
  },
  showingLastGood: 'Seguimos mostrando los datos de la última actualización correcta.',
  goToSources: 'Ir a Fuentes',
  connectCta: 'Conectar redes',
  emptyTitle: 'Conecta tus redes para empezar',
  emptyBody: 'Cuando conectes Facebook e Instagram, analizaremos tus publicaciones reales para mostrarte qué merece atención, como publicaciones sin texto o periodos sin publicar.',
  emptyNote: 'Solo leemos tus publicaciones. Puedes desconectar cuando quieras desde Fuentes.',
};

const en: SocialUiCopy = {
  back: 'Back to Tools',
  title: 'Social Intelligence',
  subtitle: 'We analyse real data from your connected Facebook and Instagram accounts to show you what deserves attention and what you can review.',
  sourceNote: 'We only read your posts. We never publish or change anything on Meta.',
  loading: 'Loading your social analysis…',
  errorTitle: 'Analysis unavailable',
  errorTemporary: 'We could not load the analysis right now. Please try again in a few seconds.',
  retry: 'Try again',
  noBusiness: 'Select or create a business to see its social analysis.',
  noBusinessCta: 'Go to My business',
  overviewTitle: 'Your accounts',
  attentionTitle: 'What deserves your attention',
  attentionEmpty: 'Right now there is nothing that needs your attention based on the available data.',
  knownTitle: 'What we know so far',
  coverageTitle: 'Analysis coverage',
  dataTitle: 'Analysis data',
  dataBody: 'The analysis is calculated from the posts synced from Meta. Refreshing reads your Facebook and Instagram posts again.',
  platform: { facebook: 'Facebook', instagram: 'Instagram' },
  status: {
    connected: 'Connected',
    stale: 'Out-of-date data',
    reauth: 'Reconnection needed',
    permission: 'Limited access',
    notConnected: 'Not connected',
    notLinked: 'Not linked',
    rateLimited: 'Temporary pause by Meta',
    syncError: 'Temporary error',
    neverSynced: 'Waiting for first sync',
  },
  activityRecent: 'Recent activity',
  activityLong: 'No recent posts',
  activityNoContent: 'No posts observed',
  activityNoDates: 'Dates unavailable',
  lastPost: (d) => (d === 0 ? 'Last post today' : d === 1 ? 'Last post 1 day ago' : `Last post ${d} days ago`),
  postsAnalysed: (n) => (n === 1 ? '1 post analysed' : `${n} posts analysed`),
  historyBuilding: 'History still building',
  updated: (rel) => `Data updated ${rel}`,
  neverUpdated: 'No synced data yet',
  recTitle: {
    REVIEW_POSTS_WITHOUT_TEXT: 'Check the text of some posts',
    REVIEW_POSTS_WITHOUT_CAPTION: 'Check the caption of some posts',
    RECONNECT_META: 'Reconnect Meta',
    REVIEW_META_PERMISSIONS: 'Review your Meta permissions',
  },
  priority: 'Priority',
  toReview: 'To review',
  why: 'Why?',
  lastGood: (date) => `Last successful update: ${date}.`,
  viewPosts: 'View posts',
  hidePosts: 'Hide posts',
  postsListLabel: 'Affected posts',
  openOn: (p) => `Open on ${p}`,
  newTab: '(opens in a new tab)',
  noLink: 'Link unavailable',
  dateUnavailable: 'Date unavailable',
  contentType: { post: 'Post', photo: 'Photo', video: 'Video', link: 'Link', event: 'Event', image: 'Image', carousel: 'Carousel', reel: 'Reel' },
  windowTruncated: 'Based on your most recent posts.',
  coverageHistoryTitle: 'History still building',
  coverageHistoryBody: (aspects) => `We need more synced posts to reliably assess ${aspects}. This describes the limits of the analysis, not the state of your business.`,
  coverageAspect: { frequency: 'posting rhythm', contentType: 'formats', engagement: 'interaction', dates: 'publish dates' },
  coverageEngagementUnavailable: (p) => `${p} interaction metrics are not currently available for this analysis.`,
  refresh: 'Refresh data',
  refreshState: {
    refreshing: 'Refreshing data…',
    success: 'Data refreshed. The analysis reflects the latest sync.',
    cooldown: 'You just refreshed. Please wait a minute before trying again.',
    rateLimited: 'Meta is temporarily limiting requests. Please try again later.',
    reauth: 'The Meta connection needs to be authorised again. You can do this from Sources.',
    permission: 'A permission needed to read your data is missing. You can review it from Sources.',
    error: 'We could not refresh the data right now.',
  },
  showingLastGood: 'We are still showing the data from the last successful update.',
  goToSources: 'Go to Sources',
  connectCta: 'Connect social accounts',
  emptyTitle: 'Connect your social accounts to get started',
  emptyBody: 'Once you connect Facebook and Instagram, we will analyse your real posts to show you what deserves attention, such as posts without text or periods without posting.',
  emptyNote: 'We only read your posts. You can disconnect at any time from Sources.',
};

export const SOCIAL_UI_COPY: Record<Lang, SocialUiCopy> = { es, en };

export function joinList(lang: Lang, items: string[]): string {
  if (items.length <= 1) return items.join('');
  const and = lang === 'en' ? ' and ' : ' y ';
  return `${items.slice(0, -1).join(', ')}${and}${items[items.length - 1]}`;
}
