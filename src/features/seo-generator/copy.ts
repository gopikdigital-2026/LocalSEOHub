import type { SeoErrorCode, SeoFormat } from './repository';

type FormatCopy = { label: string; hint: string };

export interface SeoCopy {
  back: string;
  title: string;
  subtitle: string;
  contextTitle: string;
  business: string;
  activity: string;
  city: string;
  notSet: string;
  missingNote: string;
  goToBusiness: string;
  editBusiness: string;
  formatLabel: string;
  formats: Record<SeoFormat, FormatCopy>;
  topicLabel: string;
  topicOptional: string;
  topicPlaceholder: string;
  topicCount: (n: number, max: number) => string;
  generate: string;
  generating: string;
  costNote: string;
  usage: (used: number, limit: number) => string;
  usageUnavailable: string;
  resultTitle: string;
  suggestedTitle: string;
  cta: string;
  keywords: string;
  hashtags: string;
  disclaimer: string;
  copy: string;
  copied: string;
  copyFailed: string;
  another: string;
  emptyTitle: string;
  emptyBody: string;
  loading: string;
  noBusiness: string;
  errors: Record<SeoErrorCode, string>;
  premiumCta: string;
}

export const COPY: Record<'es' | 'en', SeoCopy> = {
  es: {
    back: 'Herramientas',
    title: 'Generador SEO',
    subtitle: 'Crea contenido optimizado para tu negocio, servicios y ubicación.',
    contextTitle: 'Usaremos la información de tu negocio para personalizar el contenido.',
    business: 'Negocio',
    activity: 'Actividad',
    city: 'Ciudad',
    notSet: 'Sin indicar',
    missingNote: 'Completa el nombre, la actividad y la ciudad de tu negocio para generar contenido.',
    goToBusiness: 'Completar en Mi negocio',
    editBusiness: 'Editar en Mi negocio',
    formatLabel: '¿Qué quieres crear?',
    formats: {
      google_post: { label: 'Publicación para Google', hint: 'Para tu Perfil de Empresa de Google' },
      web_text: { label: 'Texto web / SEO local', hint: 'Para una página de tu web' },
      social_post: { label: 'Publicación para redes sociales', hint: 'Con hashtags sugeridos' },
      service_description: { label: 'Descripción de servicio', hint: 'Explica uno de tus servicios' },
    },
    topicLabel: '¿Sobre qué quieres hablar?',
    topicOptional: 'Opcional',
    topicPlaceholder: 'Ej.: promoción de otoño, reparación de aire acondicionado, menú del día…',
    topicCount: (n, max) => `${n} / ${max}`,
    generate: 'Generar contenido',
    generating: 'Generando…',
    costNote: 'Cada generación usa 1 de tus usos del mes.',
    usage: (used, limit) => `Generaciones este mes: ${used} / ${limit}`,
    usageUnavailable: 'No se pudo cargar tu contador de este mes.',
    resultTitle: 'Tu contenido',
    suggestedTitle: 'Título sugerido',
    cta: 'Llamada a la acción',
    keywords: 'Frases clave',
    hashtags: 'Hashtags',
    disclaimer: 'Contenido generado con IA. Revísalo antes de publicarlo.',
    copy: 'Copiar',
    copied: 'Copiado',
    copyFailed: 'No se pudo copiar. Selecciona el texto y cópialo manualmente.',
    another: 'Generar otra versión',
    emptyTitle: 'Aquí aparecerá tu contenido',
    emptyBody: 'Elige un formato, añade un tema si quieres y pulsa «Generar contenido».',
    loading: 'Cargando tu negocio…',
    noBusiness: 'No hemos podido cargar tu negocio. Inténtalo de nuevo en unos minutos.',
    premiumCta: 'Ver planes',
    errors: {
      profile_incomplete: 'Faltan datos de tu negocio para generar este contenido. Complétalos en Mi negocio.',
      seo_limit: 'Has alcanzado el límite mensual de generaciones SEO. Podrás generar más el mes que viene.',
      global_limit: 'Has alcanzado el límite mensual de uso de IA de tu cuenta. Podrás generar más el mes que viene.',
      ai_unavailable: 'El servicio de IA no está disponible ahora mismo. No se ha descontado ningún uso. Inténtalo de nuevo en unos minutos.',
      generation_failed: 'No hemos podido generar un contenido que cumpla nuestras reglas de calidad. Prueba con otro tema o formato.',
      premium_required: 'El Generador SEO está incluido en tu plan de pago. Activa tu plan para usarlo.',
      rate_limited: 'Has hecho muchas solicitudes seguidas. Espera un poco y vuelve a intentarlo.',
      unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
      invalid_input: 'Revisa las opciones elegidas e inténtalo de nuevo.',
      topic_too_long: 'El tema es demasiado largo. Resúmelo en menos de 200 caracteres.',
      duplicate_request: 'Esta solicitud ya se estaba procesando. Inténtalo de nuevo.',
      not_found: 'No hemos encontrado tu negocio. Recarga la página.',
      unavailable: 'Algo ha fallado. Inténtalo de nuevo en unos minutos.',
    },
  },
  en: {
    back: 'Tools',
    title: 'SEO Generator',
    subtitle: 'Create optimised content for your business, services and location.',
    contextTitle: "We'll use your business information to personalise the content.",
    business: 'Business',
    activity: 'Activity',
    city: 'City',
    notSet: 'Not set',
    missingNote: 'Add your business name, activity and city to generate content.',
    goToBusiness: 'Complete in My business',
    editBusiness: 'Edit in My business',
    formatLabel: 'What do you want to create?',
    formats: {
      google_post: { label: 'Google post', hint: 'For your Google Business Profile' },
      web_text: { label: 'Web text / local SEO', hint: 'For a page on your website' },
      social_post: { label: 'Social media post', hint: 'With suggested hashtags' },
      service_description: { label: 'Service description', hint: 'Explain one of your services' },
    },
    topicLabel: 'What do you want to talk about?',
    topicOptional: 'Optional',
    topicPlaceholder: 'E.g.: autumn promotion, air conditioning repair, lunch menu…',
    topicCount: (n, max) => `${n} / ${max}`,
    generate: 'Generate content',
    generating: 'Generating…',
    costNote: 'Each generation uses 1 of your monthly uses.',
    usage: (used, limit) => `Generations this month: ${used} / ${limit}`,
    usageUnavailable: "We couldn't load your monthly counter.",
    resultTitle: 'Your content',
    suggestedTitle: 'Suggested title',
    cta: 'Call to action',
    keywords: 'Key phrases',
    hashtags: 'Hashtags',
    disclaimer: 'AI-generated content. Review it before publishing.',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: "Couldn't copy. Select the text and copy it manually.",
    another: 'Generate another version',
    emptyTitle: 'Your content will appear here',
    emptyBody: 'Choose a format, add a theme if you like and press "Generate content".',
    loading: 'Loading your business…',
    noBusiness: "We couldn't load your business. Please try again in a few minutes.",
    premiumCta: 'See plans',
    errors: {
      profile_incomplete: 'Some business details are missing for this content. Complete them in My business.',
      seo_limit: "You've reached this month's SEO generation limit. You can generate more next month.",
      global_limit: "You've reached your account's monthly AI usage limit. You can generate more next month.",
      ai_unavailable: 'The AI service is not available right now. No use was deducted. Please try again in a few minutes.',
      generation_failed: "We couldn't generate content that meets our quality rules. Try another theme or format.",
      premium_required: 'The SEO Generator is included in your paid plan. Activate your plan to use it.',
      rate_limited: "You've made many requests in a row. Wait a moment and try again.",
      unauthorized: 'Your session has expired. Please sign in again.',
      invalid_input: 'Check the selected options and try again.',
      topic_too_long: 'The theme is too long. Keep it under 200 characters.',
      duplicate_request: 'This request was already being processed. Please try again.',
      not_found: "We couldn't find your business. Reload the page.",
      unavailable: 'Something went wrong. Please try again in a few minutes.',
    },
  },
};
