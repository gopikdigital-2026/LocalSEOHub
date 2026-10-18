import type { ActionKey, ActionTool } from '../action-layer/model';

export interface TodayCopy {
  heading: string;
  subtitle: string;
  startHere: string;
  detectedIn: string;
  tools: Record<ActionTool, string>;
  cta: string;
  emptyTitle: string;
  emptyText: string;
  emptyCta: string;
  footer: string;
  footerCta: string;
  titles: Record<ActionKey, string>;
}

const es: TodayCopy = {
  heading: 'Tus prioridades ahora',
  subtitle: 'Lo más útil que puedes hacer hoy, según los datos actuales de tu negocio.',
  startHere: 'Empieza por aquí',
  detectedIn: 'Detectado en',
  tools: { maps: 'Maps', twin: 'Digital Twin', geo: 'GEO' },
  cta: 'Ir ahora',
  emptyTitle: 'No tienes acciones prioritarias pendientes ahora',
  emptyText: 'Los datos que revisan Maps, Digital Twin y GEO están completos. Cuando cambie algo, lo verás aquí.',
  emptyCta: 'Ver herramientas',
  footer: 'Se actualiza solo cuando completas tus datos. El detalle completo sigue en cada herramienta.',
  footerCta: 'Ver herramientas',
  titles: {
    identity: 'Completa los datos básicos de tu negocio',
    activity: 'Indica a qué se dedica tu negocio',
    city: 'Añade la ciudad donde trabajas',
    services: 'Define tus servicios principales',
    phone: 'Añade tu teléfono de contacto',
    website: 'Añade tu sitio web',
    hours: 'Añade tu horario',
    audience: 'Describe a tu cliente ideal',
    goal: 'Elige tu objetivo principal',
    gbp_connect: 'Conecta Google Business Profile',
    gbp_fix: 'Revisa la conexión con Google',
    gbp_sync: 'Actualiza los datos de Google',
    gbp_category: 'Revisa la categoría de tu perfil de Google',
    align_phone: 'Unifica tu teléfono con el de Google',
    align_website: 'Unifica tu web con la de Google',
    align_sources: 'Haz coincidir tus datos con los de Google',
    reviews: 'Tu perfil de Google aún no muestra reseñas',
    keep_fresh: 'Mantén tus datos al día',
    keep_updated: 'Mantén tus datos al día',
  },
};

const en: TodayCopy = {
  heading: 'Your priorities right now',
  subtitle: 'The most useful things you can do today, based on your current business details.',
  startHere: 'Start here',
  detectedIn: 'Found in',
  tools: { maps: 'Maps', twin: 'Digital Twin', geo: 'GEO' },
  cta: 'Go now',
  emptyTitle: 'You have no priority actions pending right now',
  emptyText: 'The details Maps, Digital Twin and GEO review are complete. When something changes, you will see it here.',
  emptyCta: 'See tools',
  footer: 'Updates on its own as you complete your details. Each tool still shows its full breakdown.',
  footerCta: 'See tools',
  titles: {
    identity: 'Complete your basic business details',
    activity: 'Say what your business does',
    city: 'Add the city where you work',
    services: 'Define your main services',
    phone: 'Add your contact phone',
    website: 'Add your website',
    hours: 'Add your opening hours',
    audience: 'Describe your ideal customer',
    goal: 'Choose your main goal',
    gbp_connect: 'Connect Google Business Profile',
    gbp_fix: 'Check your Google connection',
    gbp_sync: 'Refresh your Google data',
    gbp_category: 'Check your Google profile category',
    align_phone: 'Match your phone with Google',
    align_website: 'Match your website with Google',
    align_sources: 'Match your details with Google',
    reviews: "Your Google profile doesn't show reviews yet",
    keep_fresh: 'Keep your details up to date',
    keep_updated: 'Keep your details up to date',
  },
};

export const TODAY_COPY = { es, en };
