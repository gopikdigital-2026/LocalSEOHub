import type { GeoBand, GeoBlock, GeoCriterionId, GeoPriorityId, MismatchField } from './engine';

export interface GeoCopy {
  back: string;
  title: string;
  subtitle: string;
  loading: string;
  noBusiness: string;
  premiumTitle: string;
  premiumBody: string;
  premiumCta: string;
  billingUnknown: string;
  scoreKicker: string;
  coverageKicker: string;
  coverageNote: (e: number, t: number) => string;
  disclaimer: string;
  insufficient: string;
  bands: Record<GeoBand, string>;
  refresh: string;
  refreshing: string;
  refreshed: string;
  refreshFailed: string;
  sourcesFailed: string;
  checklistTitle: string;
  blocks: Record<GeoBlock, string>;
  status: { ok: string; improve: string; unchecked: string };
  trust: { verified: string; available: string; unchecked: string };
  origin: { localseohub: string; website: string; google: string };
  criteria: Record<GeoCriterionId, string>;
  details: {
    few_services: string;
    short_audience: string;
    no_source: string;
    no_gbp_address: string;
    mismatch: (fields: string) => string;
  };
  fields: Record<MismatchField, string>;
  prioritiesTitle: string;
  priorities: Record<GeoPriorityId, { title: string; why: string; cta: string }>;
  sourcesTitle: string;
  sourceBusiness: string;
  sourceBusinessUpdated: (d: string) => string;
  sourceWebsite: string;
  sourceWebsiteNote: string;
  gbpConnected: string;
  gbpNotConnected: string;
  gbpNotConnectedBody: string;
  gbpError: string;
  gbpNoSyncData: string;
  gbpLastSync: (d: string) => string;
  gbpNote: string;
  reviewSources: string;
  notMeasuredTitle: string;
  notMeasured: string[];
  notMeasuredNote: string;
  uncheckedTitle: string;
  costNote: string;
}

const es: GeoCopy = {
  back: 'Herramientas',
  title: 'GEO Audit',
  subtitle: 'Evalúa si la información de tu negocio está preparada para ser comprendida por buscadores y asistentes de IA.',
  loading: 'Cargando auditoría…',
  noBusiness: 'No hemos podido cargar tu negocio. Recarga la página o revisa tus datos en Mi negocio.',
  premiumTitle: 'Disponible con Premium',
  premiumBody: 'La auditoría GEO está incluida en Premium y en el periodo de prueba.',
  premiumCta: 'Ver planes',
  billingUnknown: 'No hemos podido comprobar tu plan. Recarga la página en unos segundos.',
  scoreKicker: 'PREPARACIÓN GEO',
  coverageKicker: 'COBERTURA DEL ANÁLISIS',
  coverageNote: (e, t) => `${e} de ${t} criterios comprobados`,
  disclaimer: 'Esta puntuación evalúa la preparación de tu información digital. No mide tu posición ni tu aparición real en ChatGPT, Gemini, Perplexity u otros asistentes.',
  insufficient: 'No hay suficiente información para calcular una auditoría GEO fiable.',
  bands: { very_ready: 'Muy preparado', ready: 'Bien preparado', improvable: 'Mejorable', low: 'Preparación baja' },
  refresh: 'Actualizar auditoría',
  refreshing: 'Recalculando…',
  refreshed: 'Auditoría recalculada con los datos guardados.',
  refreshFailed: 'No hemos podido recargar tus datos. Se muestra la última auditoría.',
  sourcesFailed: 'No hemos podido cargar el estado de tus fuentes. Los criterios de Google se muestran como no comprobados.',
  checklistTitle: 'Checklist GEO',
  blocks: {
    identity: 'Identidad',
    location: 'Ubicación',
    offer: 'Oferta',
    contact: 'Contacto',
    context: 'Contexto comercial',
    web: 'Presencia web',
    google: 'Presencia en Google',
    consistency: 'Consistencia entre fuentes',
    structured: 'Datos estructurados',
  },
  status: { ok: 'Bien definido', improve: 'Mejorable', unchecked: 'No comprobado' },
  trust: { verified: 'Sincronizado desde Google', available: 'Declarado en LocalSEOHub', unchecked: 'No comprobado' },
  origin: { localseohub: 'LocalSEOHub', website: 'Sitio web', google: 'Google Business Profile' },
  criteria: {
    name: 'Nombre del negocio',
    activity: 'Actividad principal',
    description: 'Descripción del negocio',
    city: 'Ciudad o zona',
    address: 'Dirección',
    services: 'Servicios principales',
    website: 'Sitio web',
    phone: 'Teléfono',
    hours: 'Horario',
    audience: 'Público objetivo',
    web_content: 'Contenido de la web',
    gbp_category: 'Categoría en Google',
    consistency: 'Coherencia entre LocalSEOHub y Google',
    structured_data: 'Datos estructurados (Schema.org)',
  },
  details: {
    few_services: 'Indica al menos 3 servicios para que se entienda bien qué ofreces.',
    short_audience: 'Describe con algo más de detalle a quién te diriges.',
    no_source: 'Todavía no tenemos una fuente que permita comprobarlo.',
    no_gbp_address: 'Google no ha devuelto una dirección.',
    mismatch: (f) => `No coincide: ${f}.`,
  },
  fields: { name: 'nombre', city: 'ciudad', phone: 'teléfono', website: 'sitio web' },
  prioritiesTitle: 'Prioridades GEO',
  priorities: {
    complete_identity: {
      title: 'Completa el nombre y la actividad de tu negocio',
      why: 'Sin estos datos no es posible identificar con claridad qué negocio eres.',
      cta: 'Completar negocio',
    },
    add_activity: {
      title: 'Indica claramente tu actividad principal',
      why: 'Ayuda a que buscadores y sistemas de IA clasifiquen correctamente tu negocio.',
      cta: 'Completar negocio',
    },
    add_city: {
      title: 'Indica claramente la ciudad o zona donde trabajas',
      why: 'La ubicación permite relacionar tu negocio con búsquedas de tu zona.',
      cta: 'Completar negocio',
    },
    add_services: {
      title: 'Define mejor tus servicios principales',
      why: 'Esto ayuda a que buscadores y sistemas de IA comprendan con mayor precisión qué ofrece tu negocio.',
      cta: 'Completar negocio',
    },
    add_website: {
      title: 'Añade tu sitio web',
      why: 'Una web propia es una referencia clara sobre quién eres y qué ofreces.',
      cta: 'Completar negocio',
    },
    fix_gbp: {
      title: 'Revisa la conexión con Google Business Profile',
      why: 'Con la conexión activa podremos comprobar más criterios de la auditoría.',
      cta: 'Revisar fuentes',
    },
    connect_gbp: {
      title: 'Conecta Google Business Profile para ampliar la auditoría',
      why: 'Permite comprobar tu dirección, tu categoría y la coherencia de tus datos.',
      cta: 'Revisar fuentes',
    },
    align_sources: {
      title: 'Unifica tus datos entre LocalSEOHub y Google',
      why: 'Datos coherentes entre fuentes facilitan identificar tu negocio sin ambigüedad.',
      cta: 'Completar negocio',
    },
    add_audience: {
      title: 'Completa tu público objetivo',
      why: 'Ayuda a entender a quién sirve tu negocio y en qué contexto recomendarlo.',
      cta: 'Completar negocio',
    },
    add_phone: {
      title: 'Añade un teléfono de contacto',
      why: 'Un dato de contacto claro refuerza la identificación de tu negocio.',
      cta: 'Completar negocio',
    },
    add_hours: {
      title: 'Completa tu horario',
      why: 'El horario es información práctica que los usuarios suelen buscar.',
      cta: 'Completar negocio',
    },
    gbp_category: {
      title: 'Revisa la categoría de tu perfil de Google',
      why: 'Google no ha devuelto una categoría para tu perfil.',
      cta: 'Revisar fuentes',
    },
    keep_fresh: {
      title: 'Publica contenido sobre tus servicios con regularidad',
      why: 'Mantener información reciente y clara refuerza lo que ya está bien definido.',
      cta: 'Crear contenido',
    },
  },
  sourcesTitle: 'Fuentes utilizadas',
  sourceBusiness: 'Mi negocio (LocalSEOHub)',
  sourceBusinessUpdated: (d) => `Datos actualizados: ${d}`,
  sourceWebsite: 'Análisis del sitio web',
  sourceWebsiteNote: 'No disponible. No hay un análisis de tu web guardado, así que no lo usamos.',
  gbpConnected: 'Google Business Profile conectado',
  gbpNotConnected: 'Google Business Profile no está conectado.',
  gbpNotConnectedBody: 'Los criterios de Google aparecen como no comprobados.',
  gbpError: 'La conexión con Google Business Profile tiene un problema.',
  gbpNoSyncData: 'Todavía no hemos recibido datos de Google.',
  gbpLastSync: (d) => `Última sincronización: ${d}`,
  gbpNote: 'Usamos los datos tal como se guardaron en la última sincronización.',
  reviewSources: 'Revisar fuentes',
  notMeasuredTitle: 'Qué no medimos',
  notMeasured: [
    'Tu posición real en ChatGPT',
    'Tu posición real en Gemini',
    'Tu posición real en Perplexity',
    'Cuántas veces una IA recomienda tu negocio',
    'Cuota de visibilidad en IA',
    'Ranking en respuestas generativas',
  ],
  notMeasuredNote: 'LocalSEOHub no consulta ni simula rankings en asistentes de IA en esta auditoría.',
  uncheckedTitle: 'Qué no podemos comprobar todavía',
  costNote: 'Esta auditoría se calcula con reglas fijas, sin IA. No consume consultas de tu plan.',
};

const en: GeoCopy = {
  ...es,
  back: 'Tools',
  subtitle: 'Check whether your business information is ready to be understood by search engines and AI assistants.',
  loading: 'Loading audit…',
  noBusiness: 'We could not load your business. Reload the page or review your details in My business.',
  premiumTitle: 'Available with Premium',
  premiumBody: 'The GEO audit is included in Premium and in the trial.',
  premiumCta: 'See plans',
  billingUnknown: 'We could not check your plan. Reload the page in a few seconds.',
  scoreKicker: 'GEO READINESS',
  coverageKicker: 'ANALYSIS COVERAGE',
  coverageNote: (e, t) => `${e} of ${t} criteria checked`,
  disclaimer: 'This score measures how ready your digital information is. It does not measure your position or real appearance in ChatGPT, Gemini, Perplexity or other assistants.',
  insufficient: 'There is not enough information to calculate a reliable GEO audit.',
  bands: { very_ready: 'Very ready', ready: 'Ready', improvable: 'Could improve', low: 'Low readiness' },
  refresh: 'Refresh audit',
  refreshing: 'Recalculating…',
  refreshed: 'Audit recalculated with your saved data.',
  refreshFailed: 'We could not reload your data. Showing the last audit.',
  sourcesFailed: 'We could not load your sources. Google criteria are shown as not checked.',
  checklistTitle: 'GEO checklist',
  blocks: {
    identity: 'Identity',
    location: 'Location',
    offer: 'Offer',
    contact: 'Contact',
    context: 'Business context',
    web: 'Web presence',
    google: 'Google presence',
    consistency: 'Consistency across sources',
    structured: 'Structured data',
  },
  status: { ok: 'Well defined', improve: 'Could improve', unchecked: 'Not checked' },
  trust: { verified: 'Synced from Google', available: 'Entered in LocalSEOHub', unchecked: 'Not checked' },
  origin: { localseohub: 'LocalSEOHub', website: 'Website', google: 'Google Business Profile' },
  criteria: {
    name: 'Business name',
    activity: 'Main activity',
    description: 'Business description',
    city: 'City or area',
    address: 'Address',
    services: 'Main services',
    website: 'Website',
    phone: 'Phone',
    hours: 'Opening hours',
    audience: 'Target audience',
    web_content: 'Website content',
    gbp_category: 'Category on Google',
    consistency: 'Consistency between LocalSEOHub and Google',
    structured_data: 'Structured data (Schema.org)',
  },
  details: {
    few_services: 'List at least 3 services so it is clear what you offer.',
    short_audience: 'Describe who you serve in a bit more detail.',
    no_source: 'We do not have a source to check this yet.',
    no_gbp_address: 'Google did not return an address.',
    mismatch: (f) => `Does not match: ${f}.`,
  },
  fields: { name: 'name', city: 'city', phone: 'phone', website: 'website' },
  prioritiesTitle: 'GEO priorities',
  priorities: {
    complete_identity: { title: 'Add your business name and activity', why: 'Without them your business cannot be clearly identified.', cta: 'Complete business' },
    add_activity: { title: 'State your main activity clearly', why: 'It helps search engines and AI systems classify your business correctly.', cta: 'Complete business' },
    add_city: { title: 'State the city or area you serve', why: 'Location links your business with searches in your area.', cta: 'Complete business' },
    add_services: { title: 'Define your main services better', why: 'This helps search engines and AI systems understand more precisely what your business offers.', cta: 'Complete business' },
    add_website: { title: 'Add your website', why: 'Your own website is a clear reference for who you are and what you offer.', cta: 'Complete business' },
    fix_gbp: { title: 'Review your Google Business Profile connection', why: 'With an active connection we can check more criteria.', cta: 'Review sources' },
    connect_gbp: { title: 'Connect Google Business Profile to extend the audit', why: 'It lets us check your address, category and data consistency.', cta: 'Review sources' },
    align_sources: { title: 'Align your details between LocalSEOHub and Google', why: 'Consistent details make your business easier to identify without ambiguity.', cta: 'Complete business' },
    add_audience: { title: 'Complete your target audience', why: 'It helps explain who your business serves.', cta: 'Complete business' },
    add_phone: { title: 'Add a contact phone', why: 'Clear contact details reinforce your business identity.', cta: 'Complete business' },
    add_hours: { title: 'Add your opening hours', why: 'Opening hours are practical information people often look for.', cta: 'Complete business' },
    gbp_category: { title: 'Review your Google profile category', why: 'Google did not return a category for your profile.', cta: 'Review sources' },
    keep_fresh: { title: 'Publish content about your services regularly', why: 'Recent, clear information reinforces what is already well defined.', cta: 'Create content' },
  },
  sourcesTitle: 'Sources used',
  sourceBusiness: 'My business (LocalSEOHub)',
  sourceBusinessUpdated: (d) => `Data updated: ${d}`,
  sourceWebsite: 'Website analysis',
  sourceWebsiteNote: 'Not available. No analysis of your website is stored, so we do not use it.',
  gbpConnected: 'Google Business Profile connected',
  gbpNotConnected: 'Google Business Profile is not connected.',
  gbpNotConnectedBody: 'Google criteria are shown as not checked.',
  gbpError: 'There is a problem with your Google Business Profile connection.',
  gbpNoSyncData: 'We have not received data from Google yet.',
  gbpLastSync: (d) => `Last sync: ${d}`,
  gbpNote: 'We use the data as stored at the last sync.',
  reviewSources: 'Review sources',
  notMeasuredTitle: 'What we do not measure',
  notMeasured: [
    'Your real position in ChatGPT',
    'Your real position in Gemini',
    'Your real position in Perplexity',
    'How many times an AI recommends your business',
    'AI visibility share',
    'Ranking in generative answers',
  ],
  notMeasuredNote: 'LocalSEOHub does not query or simulate rankings in AI assistants in this audit.',
  uncheckedTitle: 'What we cannot check yet',
  costNote: 'This audit uses fixed rules, without AI. It does not use your plan’s queries.',
};

export const COPY = { es, en };
