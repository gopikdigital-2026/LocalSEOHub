import type { BlockState, KnowledgeBand, Provenance, TwinBlockId, TwinFieldId, TwinGapId, UnavailableId } from './engine';

type ToolKey = 'seo' | 'maps' | 'geo' | 'advisor';

export interface TwinCopy {
  back: string;
  title: string;
  subtitle: string;
  definition: string;
  loading: string;
  noBusiness: string;
  premiumTitle: string;
  premiumBody: string;
  premiumCta: string;
  billingUnknown: string;
  twinKicker: string;
  center: string;
  knowledgeKicker: string;
  knowledgeExplain: (p: number) => string;
  knowledgeNote: string;
  bands: Record<KnowledgeBand, string>;
  startingTitle: string;
  startingBody: string;
  refresh: string;
  refreshing: string;
  refreshed: string;
  refreshFailed: string;
  sourcesFailed: string;
  mapTitle: string;
  blocks: Record<TwinBlockId, string>;
  blockState: Record<BlockState, string>;
  fields: Record<TwinFieldId, string>;
  provenance: Record<Provenance, string>;
  provenanceHelp: Record<Exclude<Provenance, 'unchecked'>, string>;
  notDefined: string;
  notAvailable: string;
  notChecked: string;
  description: string;
  servicesEmpty: string;
  audienceEmpty: string;
  goalEmpty: string;
  secondaryGoals: string;
  partialServices: (n: number) => string;
  shortAudience: string;
  invalidWebsite: string;
  invalidPhone: string;
  gbpAddress: string;
  gbpCategory: string;
  gbpStatus: string;
  gbpConnected: string;
  gbpConnectedNoData: string;
  gbpNotConnected: string;
  gbpError: string;
  gbpLastSync: (d: string) => string;
  businessUpdated: (d: string) => string;
  webUrl: string;
  webUrlAvailable: string;
  webAnalysis: string;
  webAnalysisNote: string;
  gapsTitle: string;
  gapsWhy: string;
  gaps: Record<TwinGapId, { title: string; cta: string }>;
  unavailableTitle: string;
  unavailable: Record<UnavailableId, string>;
  unavailableNote: string;
  sourcesTitle: string;
  sourceCounts: (d: number, det: number, v: number) => string;
  contextTitle: string;
  contextIntro: string;
  tools: Record<ToolKey, { name: string; does: string }>;
  costNote: string;
}

const es: TwinCopy = {
  back: 'Herramientas',
  title: 'AI Digital Twin',
  subtitle: 'Así entiende LocalSEOHub tu negocio.',
  definition: 'Una representación estructurada de lo que LocalSEOHub conoce sobre tu negocio.',
  loading: 'Cargando tu Digital Twin…',
  noBusiness: 'No hemos podido cargar tu negocio. Recarga la página o revisa tus datos en Mi negocio.',
  premiumTitle: 'Disponible con Premium',
  premiumBody: 'AI Digital Twin está incluido en Premium y en el periodo de prueba.',
  premiumCta: 'Ver planes',
  billingUnknown: 'No hemos podido comprobar tu plan. Recarga la página en unos segundos.',
  twinKicker: 'TU DIGITAL TWIN',
  center: 'Tu negocio',
  knowledgeKicker: 'CONOCIMIENTO DEL NEGOCIO',
  knowledgeExplain: (p) => `LocalSEOHub conoce el ${p} % de los datos que utiliza para construir tu representación digital.`,
  knowledgeNote: 'Este porcentaje mide la información disponible, no la calidad de tu negocio, tu posicionamiento ni tus resultados.',
  bands: { very_complete: 'Muy completo', well_defined: 'Bien definido', partial: 'Parcial', initial: 'Información inicial' },
  startingTitle: 'Tu Digital Twin está empezando a construirse.',
  startingBody: 'Completa la información de tu negocio para obtener una representación más útil.',
  refresh: 'Actualizar Digital Twin',
  refreshing: 'Actualizando…',
  refreshed: 'Digital Twin actualizado con los datos guardados.',
  refreshFailed: 'No hemos podido recargar tus datos. Se muestra la última versión.',
  sourcesFailed: 'No hemos podido cargar el estado de tus fuentes. La presencia en Google se muestra como no comprobada.',
  mapTitle: 'Mapa de tu negocio',
  blocks: {
    identity: 'Identidad', location: 'Ubicación', offer: 'Oferta', customer: 'Cliente', contact: 'Contacto',
    goals: 'Objetivos', local: 'Presencia local', web: 'Presencia web',
  },
  blockState: { complete: 'Completo', partial: 'Parcial', empty: 'Sin información', unchecked: 'No comprobado' },
  fields: {
    name: 'Nombre', activity: 'Actividad', city: 'Ciudad o zona', services: 'Servicios principales', audience: 'Cliente objetivo',
    website: 'Web', phone: 'Teléfono', hours: 'Horario', primary_goal: 'Objetivo principal', gbp: 'Google Business Profile',
  },
  provenance: { declared: 'Declarado', detected: 'Detectado', verified: 'Verificado', unchecked: 'No comprobado' },
  provenanceHelp: {
    declared: 'Información introducida por ti en LocalSEOHub.',
    detected: 'Información obtenida automáticamente de una conexión real.',
    verified: 'Información sincronizada directamente desde Google.',
  },
  notDefined: 'No definido',
  notAvailable: 'No disponible',
  notChecked: 'No comprobado',
  description: 'Descripción',
  servicesEmpty: 'No has definido todavía tus servicios principales.',
  audienceEmpty: 'Cliente objetivo no definido.',
  goalEmpty: 'Objetivo principal no definido.',
  secondaryGoals: 'Otros objetivos',
  partialServices: (n) => `${n} de ${3} servicios recomendados`,
  shortAudience: 'Descripción muy breve',
  invalidWebsite: 'La dirección guardada no parece una web válida',
  invalidPhone: 'El teléfono guardado parece incompleto',
  gbpAddress: 'Dirección (Google)',
  gbpCategory: 'Categoría (Google)',
  gbpStatus: 'Estado',
  gbpConnected: 'Conectado',
  gbpConnectedNoData: 'Conectado, sin datos sincronizados todavía',
  gbpNotConnected: 'No conectado',
  gbpError: 'La conexión necesita revisión',
  gbpLastSync: (d) => `Última sincronización: ${d}`,
  businessUpdated: (d) => `Información del negocio actualizada: ${d}`,
  webUrl: 'Sitio web',
  webUrlAvailable: 'URL disponible',
  webAnalysis: 'Contenido de la web',
  webAnalysisNote: 'LocalSEOHub todavía no guarda un análisis de tu web, así que su contenido no se ha comprobado.',
  gapsTitle: 'Completa tu Digital Twin',
  gapsWhy: 'Cuanto más completa sea la información de tu negocio, más personalizadas podrán ser las recomendaciones, contenidos y análisis de LocalSEOHub.',
  gaps: {
    complete_identity: { title: 'Indica el nombre y la actividad de tu negocio', cta: 'Completar negocio' },
    add_activity: { title: 'Indica a qué se dedica tu negocio', cta: 'Completar negocio' },
    add_city: { title: 'Añade tu ciudad o zona', cta: 'Completar negocio' },
    add_services: { title: 'Define tus servicios principales', cta: 'Completar negocio' },
    add_audience: { title: 'Describe a tu cliente ideal', cta: 'Completar negocio' },
    add_goal: { title: 'Elige tu objetivo principal', cta: 'Elegir objetivo' },
    add_phone: { title: 'Añade tu teléfono', cta: 'Completar negocio' },
    add_hours: { title: 'Completa tu horario', cta: 'Completar negocio' },
    add_website: { title: 'Añade tu sitio web', cta: 'Completar negocio' },
    fix_gbp: { title: 'Revisa la conexión con Google Business Profile', cta: 'Revisar fuentes' },
    connect_gbp: { title: 'Conecta Google Business Profile', cta: 'Revisar fuentes' },
    sync_gbp: { title: 'Sincroniza los datos de Google Business Profile', cta: 'Revisar fuentes' },
    keep_updated: { title: 'Mantén tu información al día cuando algo cambie', cta: 'Revisar negocio' },
  },
  unavailableTitle: 'Qué no puede conocer todavía',
  unavailable: {
    description: 'Descripción del negocio',
    web_analysis: 'Contenido de tu sitio web',
    structured_data: 'Datos estructurados de tu web',
  },
  unavailableNote: 'No existe todavía una fuente que guarde estos datos, por eso no cuentan en el porcentaje.',
  sourcesTitle: 'Procedencia de los datos',
  sourceCounts: (d, det, v) => `${d} declarados · ${det} detectados · ${v} verificados`,
  contextTitle: 'Qué puede hacer LocalSEOHub con este contexto',
  contextIntro: 'Con la información de tu Digital Twin, LocalSEOHub puede:',
  tools: {
    seo: { name: 'Generador SEO', does: 'Personalizar contenido SEO para tu negocio.' },
    advisor: { name: 'AI Business Advisor', does: 'Ofrecer recomendaciones más contextualizadas.' },
    maps: { name: 'Maps Profile Scanner', does: 'Analizar tu presencia local.' },
    geo: { name: 'GEO Audit', does: 'Revisar la preparación GEO de tu información.' },
  },
  costNote: 'Esta herramienta no utiliza IA ni consume usos de tu plan.',
};

const en: TwinCopy = {
  back: 'Tools',
  title: 'AI Digital Twin',
  subtitle: 'This is how LocalSEOHub understands your business.',
  definition: 'A structured representation of what LocalSEOHub knows about your business.',
  loading: 'Loading your Digital Twin…',
  noBusiness: "We couldn't load your business. Reload the page or check your details in My business.",
  premiumTitle: 'Available with Premium',
  premiumBody: 'AI Digital Twin is included in Premium and during the trial.',
  premiumCta: 'See plans',
  billingUnknown: "We couldn't check your plan. Reload the page in a few seconds.",
  twinKicker: 'YOUR DIGITAL TWIN',
  center: 'Your business',
  knowledgeKicker: 'BUSINESS KNOWLEDGE',
  knowledgeExplain: (p) => `LocalSEOHub knows ${p} % of the data it uses to build your digital representation.`,
  knowledgeNote: 'This percentage measures available information, not the quality of your business, your ranking or your results.',
  bands: { very_complete: 'Very complete', well_defined: 'Well defined', partial: 'Partial', initial: 'Initial information' },
  startingTitle: 'Your Digital Twin is just getting started.',
  startingBody: 'Complete your business information to get a more useful representation.',
  refresh: 'Refresh Digital Twin',
  refreshing: 'Refreshing…',
  refreshed: 'Digital Twin refreshed from your saved data.',
  refreshFailed: "We couldn't reload your data. Showing the last version.",
  sourcesFailed: "We couldn't load your sources. Google presence is shown as not checked.",
  mapTitle: 'Map of your business',
  blocks: {
    identity: 'Identity', location: 'Location', offer: 'Offer', customer: 'Customer', contact: 'Contact',
    goals: 'Goals', local: 'Local presence', web: 'Web presence',
  },
  blockState: { complete: 'Complete', partial: 'Partial', empty: 'No information', unchecked: 'Not checked' },
  fields: {
    name: 'Name', activity: 'Activity', city: 'City or area', services: 'Main services', audience: 'Target customer',
    website: 'Website', phone: 'Phone', hours: 'Opening hours', primary_goal: 'Main goal', gbp: 'Google Business Profile',
  },
  provenance: { declared: 'Declared', detected: 'Detected', verified: 'Verified', unchecked: 'Not checked' },
  provenanceHelp: {
    declared: 'Information you entered in LocalSEOHub.',
    detected: 'Information obtained automatically from a real connection.',
    verified: 'Information synced directly from Google.',
  },
  notDefined: 'Not defined',
  notAvailable: 'Not available',
  notChecked: 'Not checked',
  description: 'Description',
  servicesEmpty: "You haven't defined your main services yet.",
  audienceEmpty: 'Target customer not defined.',
  goalEmpty: 'Main goal not defined.',
  secondaryGoals: 'Other goals',
  partialServices: (n) => `${n} of ${3} recommended services`,
  shortAudience: 'Very short description',
  invalidWebsite: "The saved address doesn't look like a valid website",
  invalidPhone: 'The saved phone looks incomplete',
  gbpAddress: 'Address (Google)',
  gbpCategory: 'Category (Google)',
  gbpStatus: 'Status',
  gbpConnected: 'Connected',
  gbpConnectedNoData: 'Connected, no synced data yet',
  gbpNotConnected: 'Not connected',
  gbpError: 'The connection needs attention',
  gbpLastSync: (d) => `Last sync: ${d}`,
  businessUpdated: (d) => `Business information updated: ${d}`,
  webUrl: 'Website',
  webUrlAvailable: 'URL available',
  webAnalysis: 'Website content',
  webAnalysisNote: "LocalSEOHub doesn't store a website analysis yet, so its content hasn't been checked.",
  gapsTitle: 'Complete your Digital Twin',
  gapsWhy: 'The more complete your business information is, the more personalised LocalSEOHub recommendations, content and analyses can be.',
  gaps: {
    complete_identity: { title: 'Add your business name and activity', cta: 'Complete business' },
    add_activity: { title: 'Say what your business does', cta: 'Complete business' },
    add_city: { title: 'Add your city or area', cta: 'Complete business' },
    add_services: { title: 'Define your main services', cta: 'Complete business' },
    add_audience: { title: 'Describe your ideal customer', cta: 'Complete business' },
    add_goal: { title: 'Choose your main goal', cta: 'Choose goal' },
    add_phone: { title: 'Add your phone', cta: 'Complete business' },
    add_hours: { title: 'Complete your opening hours', cta: 'Complete business' },
    add_website: { title: 'Add your website', cta: 'Complete business' },
    fix_gbp: { title: 'Check your Google Business Profile connection', cta: 'Review sources' },
    connect_gbp: { title: 'Connect Google Business Profile', cta: 'Review sources' },
    sync_gbp: { title: 'Sync your Google Business Profile data', cta: 'Review sources' },
    keep_updated: { title: 'Keep your information up to date when something changes', cta: 'Review business' },
  },
  unavailableTitle: "What it can't know yet",
  unavailable: {
    description: 'Business description',
    web_analysis: 'Your website content',
    structured_data: 'Structured data on your website',
  },
  unavailableNote: "No source stores this data yet, so it doesn't count towards the percentage.",
  sourcesTitle: 'Where the data comes from',
  sourceCounts: (d, det, v) => `${d} declared · ${det} detected · ${v} verified`,
  contextTitle: 'What LocalSEOHub can do with this context',
  contextIntro: 'With your Digital Twin information, LocalSEOHub can:',
  tools: {
    seo: { name: 'SEO Generator', does: 'Personalise SEO content for your business.' },
    advisor: { name: 'AI Business Advisor', does: 'Give more contextual recommendations.' },
    maps: { name: 'Maps Profile Scanner', does: 'Analyse your local presence.' },
    geo: { name: 'GEO Audit', does: 'Review how GEO-ready your information is.' },
  },
  costNote: "This tool doesn't use AI or consume your plan's usage.",
};

export const COPY = { es, en };
