import type { Band, CheckId, PriorityId } from './engine';

export interface MapsCopy {
  back: string;
  title: string;
  subtitle: string;
  intro: string;
  loading: string;
  noBusiness: string;
  premiumTitle: string;
  premiumBody: string;
  premiumCta: string;
  billingUnknown: string;
  headerKicker: string;
  coverage: string;
  coverageNote: (evaluated: number, total: number) => string;
  disclaimer: string;
  insufficient: string;
  bands: Record<Band, string>;
  refresh: string;
  refreshing: string;
  refreshed: string;
  refreshFailed: string;
  sourcesFailed: string;
  checklistLocal: string;
  checklistLocalNote: string;
  checklistGoogle: string;
  checklistGoogleNote: string;
  status: { ok: string; improve: string; unchecked: string };
  trust: { verified: string; available: string; unchecked: string };
  origin: { localseohub: string; google: string };
  checks: Record<CheckId, string>;
  details: {
    partial_services: string;
    phone_mismatch: string;
    website_mismatch: string;
    no_reviews: string;
    has_reviews: (n: number) => string;
  };
  prioritiesTitle: string;
  priorities: Record<PriorityId, { title: string; cta: string }>;
  sourcesTitle: string;
  gbpConnected: string;
  gbpNotConnected: string;
  gbpNotConnectedBody: string;
  gbpError: string;
  gbpNoSyncData: string;
  lastSync: (date: string) => string;
  profileUpdated: (date: string) => string;
  reviewSources: string;
  outOfScopeTitle: string;
  outOfScope: string[];
  costNote: string;
}

const es: MapsCopy = {
  back: 'Herramientas',
  title: 'Maps Profile Scanner',
  subtitle: 'Diagnóstico de presencia local',
  intro: 'Analizamos la información local disponible de tu negocio. Cuando Google Business Profile esté conectado, podremos comprobar más elementos.',
  loading: 'Cargando diagnóstico…',
  noBusiness: 'No hemos podido cargar tu negocio. Recarga la página o revisa tus datos en Mi negocio.',
  premiumTitle: 'Disponible con Premium',
  premiumBody: 'El diagnóstico de presencia local está incluido en Premium y en el periodo de prueba.',
  premiumCta: 'Ver planes',
  billingUnknown: 'No hemos podido comprobar tu plan. Recarga la página en unos segundos.',
  headerKicker: 'DIAGNÓSTICO DE PRESENCIA LOCAL',
  coverage: 'Cobertura',
  coverageNote: (e, t) => `${e} de ${t} elementos comprobados`,
  disclaimer: 'Esta puntuación evalúa la completitud y calidad de la información disponible. No representa tu posición en Google Maps.',
  insufficient: 'Necesitamos más información para calcular un diagnóstico fiable.',
  bands: { excellent: 'Excelente', good: 'Bien', improvable: 'Mejorable', incomplete: 'Incompleto' },
  refresh: 'Actualizar diagnóstico',
  refreshing: 'Recalculando…',
  refreshed: 'Diagnóstico recalculado con los datos guardados.',
  refreshFailed: 'No hemos podido recargar tus datos. Se muestra el último diagnóstico.',
  sourcesFailed: 'No hemos podido cargar el estado de tus fuentes. Los elementos de Google se muestran como no comprobados.',
  checklistLocal: 'Información en LocalSEOHub',
  checklistLocalNote: 'Datos que has indicado tú. Están disponibles, pero no verificados con Google.',
  checklistGoogle: 'Google Business Profile',
  checklistGoogleNote: 'Solo se marcan como verificados los datos recibidos de Google.',
  status: { ok: 'Correcto', improve: 'Mejorable', unchecked: 'No comprobado' },
  trust: { verified: 'Verificado con Google', available: 'Disponible', unchecked: 'No comprobado' },
  origin: { localseohub: 'LocalSEOHub', google: 'Google Business Profile' },
  checks: {
    name: 'Nombre del negocio',
    category: 'Actividad principal',
    city: 'Ciudad o zona',
    phone: 'Teléfono de contacto',
    website: 'Sitio web',
    schedule: 'Horario',
    services: 'Servicios principales',
    gbp_name: 'Nombre en Google',
    gbp_category: 'Categoría en Google',
    gbp_address: 'Dirección en Google',
    gbp_phone: 'Teléfono en Google',
    gbp_website: 'Sitio web en Google',
    gbp_hours: 'Horario en Google',
    gbp_reviews: 'Reseñas en Google',
  },
  details: {
    partial_services: 'Solo hay un servicio. Añade al menos dos.',
    phone_mismatch: 'No coincide con el teléfono de Mi negocio.',
    website_mismatch: 'No coincide con la web de Mi negocio.',
    no_reviews: 'Google no muestra reseñas todavía.',
    has_reviews: (n) => `${n} ${n === 1 ? 'reseña' : 'reseñas'} según Google.`,
  },
  prioritiesTitle: 'Prioridades',
  priorities: {
    complete_profile: { title: 'Completa el nombre y la actividad de tu negocio', cta: 'Completar datos' },
    add_category: { title: 'Indica la actividad principal de tu negocio', cta: 'Completar datos' },
    add_city: { title: 'Indica la ciudad o zona donde trabajas', cta: 'Completar datos' },
    add_phone: { title: 'Añade un teléfono de contacto', cta: 'Completar datos' },
    fix_gbp: { title: 'Revisa la conexión con Google Business Profile', cta: 'Revisar fuentes' },
    connect_gbp: { title: 'Conecta Google Business Profile para ampliar el diagnóstico', cta: 'Revisar fuentes' },
    add_schedule: { title: 'Completa tu horario', cta: 'Completar datos' },
    add_services: { title: 'Añade tus servicios principales', cta: 'Completar datos' },
    add_website: { title: 'Añade tu sitio web', cta: 'Completar datos' },
    align_phone: { title: 'Usa el mismo teléfono en Google y en Mi negocio', cta: 'Completar datos' },
    align_website: { title: 'Usa la misma web en Google y en Mi negocio', cta: 'Completar datos' },
    reviews: { title: 'Pide reseñas a tus clientes recientes', cta: 'Pedir ideas al asesor' },
    keep_fresh: { title: 'Mantén tu información al día y publica con regularidad', cta: 'Crear contenido' },
  },
  sourcesTitle: 'Fuentes',
  gbpConnected: 'Google Business Profile conectado',
  gbpNotConnected: 'Google Business Profile no está conectado.',
  gbpNotConnectedBody: 'Puedes analizar la información disponible ahora y conectar Google para ampliar el diagnóstico.',
  gbpError: 'La conexión con Google Business Profile tiene un problema. Revísala para ampliar el diagnóstico.',
  gbpNoSyncData: 'Todavía no hemos recibido datos de Google. Los elementos de Google se muestran como no comprobados.',
  lastSync: (d) => `Última sincronización con Google: ${d}`,
  profileUpdated: (d) => `Datos actualizados: ${d}`,
  reviewSources: 'Revisar fuentes',
  outOfScopeTitle: 'Qué no medimos',
  outOfScope: [
    'Tu posición en Google Maps',
    'Visitas, búsquedas, llamadas o solicitudes de ruta',
    'Fotos y descripción del perfil',
    'El contenido de tu sitio web',
  ],
  costNote: 'Este diagnóstico se calcula con reglas fijas, sin IA. No consume consultas de tu plan.',
};

const en: MapsCopy = {
  ...es,
  back: 'Tools',
  subtitle: 'Local presence check',
  intro: 'We analyse the local information available for your business. Once Google Business Profile is connected, we can check more items.',
  loading: 'Loading check…',
  noBusiness: 'We could not load your business. Reload the page or review your details in My business.',
  premiumTitle: 'Available with Premium',
  premiumBody: 'The local presence check is included in Premium and in the trial.',
  premiumCta: 'See plans',
  billingUnknown: 'We could not check your plan. Reload the page in a few seconds.',
  headerKicker: 'LOCAL PRESENCE CHECK',
  coverage: 'Coverage',
  coverageNote: (e, t) => `${e} of ${t} items checked`,
  disclaimer: 'This score measures how complete and good the available information is. It does not represent your position on Google Maps.',
  insufficient: 'We need more information to calculate a reliable check.',
  bands: { excellent: 'Excellent', good: 'Good', improvable: 'Could improve', incomplete: 'Incomplete' },
  refresh: 'Refresh check',
  refreshing: 'Recalculating…',
  refreshed: 'Check recalculated with your saved data.',
  refreshFailed: 'We could not reload your data. Showing the last check.',
  sourcesFailed: 'We could not load your sources. Google items are shown as not checked.',
  checklistLocal: 'Information in LocalSEOHub',
  checklistLocalNote: 'Details you entered. They are available, but not verified with Google.',
  checklistGoogleNote: 'Only data received from Google is marked as verified.',
  status: { ok: 'Good', improve: 'Could improve', unchecked: 'Not checked' },
  trust: { verified: 'Verified with Google', available: 'Available', unchecked: 'Not checked' },
  checks: {
    name: 'Business name',
    category: 'Main activity',
    city: 'City or area',
    phone: 'Contact phone',
    website: 'Website',
    schedule: 'Opening hours',
    services: 'Main services',
    gbp_name: 'Name on Google',
    gbp_category: 'Category on Google',
    gbp_address: 'Address on Google',
    gbp_phone: 'Phone on Google',
    gbp_website: 'Website on Google',
    gbp_hours: 'Hours on Google',
    gbp_reviews: 'Reviews on Google',
  },
  details: {
    partial_services: 'Only one service listed. Add at least two.',
    phone_mismatch: 'Does not match the phone in My business.',
    website_mismatch: 'Does not match the website in My business.',
    no_reviews: 'Google shows no reviews yet.',
    has_reviews: (n) => `${n} ${n === 1 ? 'review' : 'reviews'} according to Google.`,
  },
  prioritiesTitle: 'Priorities',
  priorities: {
    complete_profile: { title: 'Add your business name and activity', cta: 'Complete details' },
    add_category: { title: 'Add your main business activity', cta: 'Complete details' },
    add_city: { title: 'Add the city or area you serve', cta: 'Complete details' },
    add_phone: { title: 'Add a contact phone', cta: 'Complete details' },
    fix_gbp: { title: 'Review your Google Business Profile connection', cta: 'Review sources' },
    connect_gbp: { title: 'Connect Google Business Profile to extend the check', cta: 'Review sources' },
    add_schedule: { title: 'Add your opening hours', cta: 'Complete details' },
    add_services: { title: 'Add your main services', cta: 'Complete details' },
    add_website: { title: 'Add your website', cta: 'Complete details' },
    align_phone: { title: 'Use the same phone on Google and in My business', cta: 'Complete details' },
    align_website: { title: 'Use the same website on Google and in My business', cta: 'Complete details' },
    reviews: { title: 'Ask recent customers for reviews', cta: 'Ask the advisor' },
    keep_fresh: { title: 'Keep your details up to date and post regularly', cta: 'Create content' },
  },
  sourcesTitle: 'Sources',
  gbpConnected: 'Google Business Profile connected',
  gbpNotConnected: 'Google Business Profile is not connected.',
  gbpNotConnectedBody: 'You can check the information available now and connect Google to extend the check.',
  gbpError: 'There is a problem with your Google Business Profile connection. Review it to extend the check.',
  gbpNoSyncData: 'We have not received data from Google yet. Google items are shown as not checked.',
  lastSync: (d) => `Last sync with Google: ${d}`,
  profileUpdated: (d) => `Data updated: ${d}`,
  reviewSources: 'Review sources',
  outOfScopeTitle: 'What we do not measure',
  outOfScope: [
    'Your position on Google Maps',
    'Views, searches, calls or direction requests',
    'Profile photos and description',
    'The content of your website',
  ],
  costNote: 'This check uses fixed rules, without AI. It does not use your plan’s queries.',
};

export const COPY = { es, en };
