import type { OpportunityId, OwnProvenance, RadarBlockId, RadarRowId, RowStatus, TheirProvenance } from './engine';
import type { RadarErrorCode } from './types';

type OppCopy = { title: (d: { value?: string; list?: string[] }) => string; body: (d: { value?: string; list?: string[] }) => string; cta: string };

export interface RadarCopy {
  back: string;
  title: string;
  subtitle: string;
  loading: string;
  billingUnknown: string;
  premiumTitle: string;
  premiumBody: string;
  premiumCta: string;
  noBusiness: string;
  emptyTitle: string;
  emptyBody: string;
  inputLabel: string;
  placeholder: string;
  analyze: string;
  analyzing: string;
  publicOnly: string;
  notMeasuredShort: string;
  yourBusiness: string;
  competitor: string;
  vs: string;
  observedKicker: string;
  observedOn: (date: string) => string;
  notDefined: string;
  servicesCount: (n: number) => string;
  counts: (observed: number, differences: number, opportunities: number) => string;
  noScore: string;
  comparisonTitle: string;
  comparisonIntro: string;
  blocks: Record<RadarBlockId, string>;
  rows: Record<RadarRowId, string>;
  status: Record<RowStatus, string>;
  statusHelp: Record<RowStatus, string>;
  ownProv: Record<OwnProvenance, string>;
  theirProv: Record<TheirProvenance, string>;
  notDetected: string;
  notMeasuredHere: string;
  cannotCheck: string;
  yes: string;
  no: string;
  words: (n: number) => string;
  noServiceMatch: string;
  gbp: { connected: string; connected_no_data: string; none: string };
  opportunitiesTitle: string;
  opportunitiesIntro: string;
  noOpportunities: string;
  opportunities: Record<OpportunityId, OppCopy>;
  checkedTitle: string;
  checked: { domain: string; https: string; redirected: string; status: string; contentType: string; size: string; time: string };
  kb: (bytes: number) => string;
  seconds: (ms: number) => string;
  notMeasuredTitle: string;
  notMeasuredList: string[];
  notMeasuredNote: string;
  newAnalysis: string;
  costNote: string;
  errors: Record<RadarErrorCode, string>;
}

const ES: RadarCopy = {
  back: 'Herramientas',
  title: 'Competitor Radar',
  subtitle: 'Analiza la información pública disponible en la web de un competidor y detecta diferencias que pueden ayudarte a mejorar tu presencia digital.',
  loading: 'Cargando…',
  billingUnknown: 'No hemos podido comprobar tu plan. Recarga la página en unos segundos.',
  premiumTitle: 'Competitor Radar está incluido en Premium',
  premiumBody: 'Activa Premium o tu periodo de prueba para analizar la web de un competidor.',
  premiumCta: 'Ver planes',
  noBusiness: 'No hemos encontrado tu negocio. Completa primero los datos de tu negocio.',
  emptyTitle: 'Analiza un competidor',
  emptyBody: 'Introduce la web de un negocio competidor para comparar la información pública que podemos observar con los datos disponibles de tu negocio.',
  inputLabel: 'Web del competidor',
  placeholder: 'https://competidor.com',
  analyze: 'Analizar competidor',
  analyzing: 'Analizando información pública…',
  publicOnly: 'Solo analizamos información pública de la página indicada.',
  notMeasuredShort: 'No medimos tráfico, ventas, cuota de mercado ni posiciones en Google.',
  yourBusiness: 'Tu negocio',
  competitor: 'Competidor analizado',
  vs: 'vs.',
  observedKicker: 'Lo que hemos observado',
  observedOn: (d) => `Página analizada el ${d}`,
  notDefined: 'Sin definir',
  servicesCount: (n) => (n === 0 ? 'Sin servicios definidos' : n === 1 ? '1 servicio definido' : `${n} servicios definidos`),
  counts: (o, d, p) => `${o} señales observadas · ${d} ${d === 1 ? 'diferencia' : 'diferencias'} · ${p} ${p === 1 ? 'oportunidad' : 'oportunidades'}`,
  noScore: 'No asignamos una puntuación al competidor ni a tu negocio: solo mostramos lo que hemos podido observar.',
  comparisonTitle: 'Comparación',
  comparisonIntro: 'Cada dato indica de dónde procede. «Oportunidad» solo significa que hay una diferencia observable que puedes valorar, no que el competidor funcione mejor.',
  blocks: { identity: 'Identidad', services: 'Servicios', location: 'Ubicación', contact: 'Contacto', content: 'Contenido', seo: 'SEO on-page', local: 'Señales locales' },
  rows: {
    name: 'Nombre / marca', services: 'Servicios', services_match: 'Tus servicios mencionados en su web', city: 'Ubicación',
    phone: 'Teléfono', website: 'Web', socials: 'Redes sociales enlazadas', h1: 'Titular principal (H1)',
    headings: 'Secciones principales (H2)', cta: 'Llamadas a la acción', words: 'Texto visible', title: 'Título de la página',
    meta_description: 'Descripción para buscadores', canonical: 'URL canónica', robots: 'Indicaciones a buscadores (meta robots)',
    https: 'Conexión segura (HTTPS)', viewport: 'Adaptada a móvil (viewport)', lang: 'Idioma declarado',
    schema: 'Datos estructurados', local_schema: 'Ficha de negocio local en datos estructurados', address: 'Dirección en datos estructurados',
    map: 'Mapa o enlace a Google Maps', gbp: 'Perfil de Google Business',
  },
  status: { available: 'Disponible', opportunity: 'Oportunidad', unchecked: 'No comprobado' },
  statusHelp: {
    available: 'LocalSEOHub tiene este dato de tu negocio.',
    opportunity: 'El competidor lo muestra y tu negocio todavía no lo tiene en LocalSEOHub.',
    unchecked: 'No se puede comparar con la información disponible.',
  },
  ownProv: { declared: 'Declarado', detected: 'Detectado', verified: 'Verificado', unchecked: 'No comprobado' },
  theirProv: { observed: 'Observado en la web', unchecked: 'No comprobado' },
  notDetected: 'No detectado en la página analizada',
  notMeasuredHere: 'No analizamos tu web en esta herramienta',
  cannotCheck: 'No podemos comprobarlo desde su web',
  yes: 'Sí',
  no: 'No',
  words: (n) => `Unas ${n.toLocaleString('es-ES')} palabras`,
  noServiceMatch: 'Ninguno de tus servicios aparece con el mismo nombre en la página analizada',
  gbp: { connected: 'Conectado y sincronizado', connected_no_data: 'Conectado, sin datos sincronizados', none: 'No conectado' },
  opportunitiesTitle: 'Oportunidades detectadas',
  opportunitiesIntro: 'Basadas solo en diferencias observadas. Revisa si tienen sentido para tu negocio.',
  noOpportunities: 'No hemos detectado diferencias claras con la información disponible. Puedes analizar otro competidor.',
  opportunities: {
    own_services: {
      title: () => 'Tu negocio todavía no tiene servicios definidos en LocalSEOHub.',
      body: (d) => (d.list && d.list.length ? `El competidor menciona servicios concretos en la página analizada (${d.list.slice(0, 3).join(', ')}). Podrías valorar definir los tuyos.` : 'Definir tus servicios ayuda a comparar mejor y a personalizar tus contenidos.'),
      cta: 'Añadir servicios',
    },
    own_website: {
      title: () => 'Tu negocio no tiene web registrada en LocalSEOHub.',
      body: () => 'El competidor tiene una web pública. Si tienes web, añádela a los datos de tu negocio.',
      cta: 'Añadir web',
    },
    own_city: {
      title: () => 'Tu negocio no tiene ciudad definida en LocalSEOHub.',
      body: (d) => `El competidor menciona una ubicación concreta${d.value ? ` (${d.value})` : ''}. Puede ser útil indicar dónde trabajas.`,
      cta: 'Añadir ciudad',
    },
    own_phone: {
      title: () => 'Tu negocio no tiene teléfono registrado en LocalSEOHub.',
      body: () => 'La página analizada muestra un teléfono de contacto. Podrías valorar añadir el tuyo.',
      cta: 'Añadir teléfono',
    },
    their_cta: {
      title: (d) => `La página analizada utiliza una llamada a la acción visible${d.list?.length ? ` («${d.list[0]}»)` : ''}.`,
      body: () => 'Revisa si tu web y tus publicaciones invitan claramente a contactar contigo.',
      cta: 'Crear contenido',
    },
    their_location: {
      title: () => 'El competidor menciona una ubicación concreta en su contenido.',
      body: (d) => `Revisa si tu web menciona claramente ${d.value ?? 'tu ciudad'}.`,
      cta: 'Revisar GEO',
    },
    their_schema: {
      title: (d) => `La página analizada incluye datos estructurados${d.list?.length ? ` (${d.list.join(', ')})` : ''}.`,
      body: () => 'Puede ser útil revisar si tu web los utiliza para describir tu negocio.',
      cta: 'Revisar GEO',
    },
    their_description: {
      title: () => 'La página analizada tiene una descripción para buscadores.',
      body: () => 'Revisa si tu web tiene una descripción clara de lo que ofreces.',
      cta: 'Crear texto',
    },
    their_map: {
      title: () => 'La página analizada muestra cómo llegar (mapa o enlace a Google Maps).',
      body: () => 'Podrías valorar si tu ubicación es fácil de encontrar.',
      cta: 'Revisar Maps',
    },
  },
  checkedTitle: 'Qué hemos podido comprobar',
  checked: { domain: 'Dominio analizado', https: 'Conexión segura', redirected: 'Redirección', status: 'Respuesta de la web', contentType: 'Tipo de contenido', size: 'Tamaño descargado', time: 'Tiempo de análisis' },
  kb: (b) => `${Math.max(1, Math.round(b / 1024)).toLocaleString('es-ES')} KB`,
  seconds: (ms) => `${(ms / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`,
  notMeasuredTitle: 'Qué no medimos',
  notMeasuredList: [
    'Tráfico, visitas ni clics', 'Ventas, ingresos, clientes ni conversiones', 'Cuota de mercado',
    'Posiciones en Google o en Maps', 'Palabras clave, enlaces ni autoridad de dominio', 'Reseñas, valoraciones ni publicidad',
  ],
  notMeasuredNote: 'Solo leemos la página indicada, sin ejecutar su código. Si algo no aparece, no significa que no exista en otras páginas de su web.',
  newAnalysis: 'Analizar otro competidor',
  costNote: 'Este análisis no utiliza IA y no consume tu uso mensual de IA.',
  errors: {
    invalid_input: 'No hemos podido procesar la solicitud. Inténtalo de nuevo.',
    url_required: 'Escribe la web del competidor.',
    url_too_long: 'La dirección es demasiado larga.',
    invalid_url: 'La dirección no es válida. Escríbela completa, por ejemplo https://competidor.com',
    blocked: 'Esta dirección no se puede analizar por motivos de seguridad. Usa la web pública del competidor.',
    not_found: 'No hemos encontrado tu negocio. Recarga la página.',
    dns_failed: 'No hemos podido comprobar ese dominio. Revisa que esté bien escrito.',
    dns_empty: 'Ese dominio no existe o no tiene una web publicada.',
    connect_failed: 'La web no responde. Inténtalo más tarde.',
    tls_failed: 'La web no tiene una conexión segura válida.',
    bad_response: 'La web ha devuelto una respuesta que no podemos leer.',
    timeout: 'La web tarda demasiado en responder. Inténtalo más tarde.',
    too_large: 'La página es demasiado grande para analizarla (máximo 2 MB).',
    too_many_redirects: 'La web redirige demasiadas veces. Prueba con la dirección final.',
    redirect_loop: 'La web redirige en bucle. Prueba con la dirección final.',
    off_site_redirect: 'La web redirige a otro sitio. Prueba con la dirección final.',
    bad_status: 'La página indicada no está disponible. Revisa la dirección.',
    unsupported_content: 'La dirección no es una página web que podamos analizar.',
    premium_required: 'Competitor Radar requiere Premium o un periodo de prueba activo.',
    rate_limited: 'Has hecho muchos análisis en poco tiempo. Espera un rato e inténtalo de nuevo.',
    unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
    unavailable: 'No hemos podido completar el análisis. Inténtalo de nuevo en unos minutos.',
  },
};

const EN: RadarCopy = {
  ...ES,
  back: 'Tools',
  subtitle: "Analyse the public information on a competitor's website and spot differences that can help you improve your online presence.",
  loading: 'Loading…',
  billingUnknown: "We couldn't check your plan. Reload the page in a few seconds.",
  premiumTitle: 'Competitor Radar is included in Premium',
  premiumBody: "Activate Premium or your trial to analyse a competitor's website.",
  premiumCta: 'See plans',
  noBusiness: "We couldn't find your business. Fill in your business details first.",
  emptyTitle: 'Analyse a competitor',
  emptyBody: "Enter a competitor's website to compare the public information we can observe with what we know about your business.",
  inputLabel: "Competitor's website",
  analyze: 'Analyse competitor',
  analyzing: 'Analysing public information…',
  publicOnly: 'We only analyse public information from the page you enter.',
  notMeasuredShort: "We don't measure traffic, sales, market share or Google rankings.",
  yourBusiness: 'Your business',
  competitor: 'Analysed competitor',
  observedKicker: 'What we observed',
  observedOn: (d) => `Page analysed on ${d}`,
  notDefined: 'Not defined',
  servicesCount: (n) => (n === 0 ? 'No services defined' : n === 1 ? '1 service defined' : `${n} services defined`),
  counts: (o, d, p) => `${o} observed signals · ${d} ${d === 1 ? 'difference' : 'differences'} · ${p} ${p === 1 ? 'opportunity' : 'opportunities'}`,
  noScore: "We don't score the competitor or your business: we only show what we could observe.",
  comparisonTitle: 'Comparison',
  comparisonIntro: 'Every item shows where it comes from. "Opportunity" only means there is an observable difference you may want to consider, not that the competitor performs better.',
  blocks: { identity: 'Identity', services: 'Services', location: 'Location', contact: 'Contact', content: 'Content', seo: 'On-page SEO', local: 'Local signals' },
  rows: {
    name: 'Name / brand', services: 'Services', services_match: 'Your services mentioned on their site', city: 'Location',
    phone: 'Phone', website: 'Website', socials: 'Linked social networks', h1: 'Main heading (H1)',
    headings: 'Main sections (H2)', cta: 'Calls to action', words: 'Visible text', title: 'Page title',
    meta_description: 'Search description', canonical: 'Canonical URL', robots: 'Search engine directives (meta robots)',
    https: 'Secure connection (HTTPS)', viewport: 'Mobile-ready (viewport)', lang: 'Declared language',
    schema: 'Structured data', local_schema: 'Local business in structured data', address: 'Address in structured data',
    map: 'Map or Google Maps link', gbp: 'Google Business Profile',
  },
  status: { available: 'Available', opportunity: 'Opportunity', unchecked: 'Not checked' },
  statusHelp: {
    available: 'LocalSEOHub has this information about your business.',
    opportunity: "The competitor shows it and your business doesn't have it in LocalSEOHub yet.",
    unchecked: "It can't be compared with the information available.",
  },
  ownProv: { declared: 'Declared', detected: 'Detected', verified: 'Verified', unchecked: 'Not checked' },
  theirProv: { observed: 'Observed on the site', unchecked: 'Not checked' },
  notDetected: 'Not detected on the analysed page',
  notMeasuredHere: "We don't analyse your website in this tool",
  cannotCheck: "We can't check this from their website",
  yes: 'Yes',
  no: 'No',
  words: (n) => `About ${n.toLocaleString('en-GB')} words`,
  noServiceMatch: 'None of your services appear with the same name on the analysed page',
  gbp: { connected: 'Connected and synced', connected_no_data: 'Connected, no synced data', none: 'Not connected' },
  opportunitiesTitle: 'Detected opportunities',
  opportunitiesIntro: 'Based only on observed differences. Check whether they make sense for your business.',
  noOpportunities: 'We found no clear differences with the information available. You can analyse another competitor.',
  opportunities: {
    own_services: {
      title: () => "Your business doesn't have any services defined in LocalSEOHub yet.",
      body: (d) => (d.list && d.list.length ? `The competitor mentions specific services on the analysed page (${d.list.slice(0, 3).join(', ')}). You could consider defining yours.` : 'Defining your services helps compare better and personalise your content.'),
      cta: 'Add services',
    },
    own_website: {
      title: () => "Your business doesn't have a website registered in LocalSEOHub.",
      body: () => 'The competitor has a public website. If you have one, add it to your business details.',
      cta: 'Add website',
    },
    own_city: {
      title: () => "Your business doesn't have a city defined in LocalSEOHub.",
      body: (d) => `The competitor mentions a specific location${d.value ? ` (${d.value})` : ''}. It may help to state where you work.`,
      cta: 'Add city',
    },
    own_phone: {
      title: () => "Your business doesn't have a phone registered in LocalSEOHub.",
      body: () => 'The analysed page shows a contact phone. You could consider adding yours.',
      cta: 'Add phone',
    },
    their_cta: {
      title: (d) => `The analysed page uses a visible call to action${d.list?.length ? ` ("${d.list[0]}")` : ''}.`,
      body: () => 'Check whether your website and posts clearly invite people to contact you.',
      cta: 'Create content',
    },
    their_location: {
      title: () => 'The competitor mentions a specific location in its content.',
      body: (d) => `Check whether your website clearly mentions ${d.value ?? 'your city'}.`,
      cta: 'Review GEO',
    },
    their_schema: {
      title: (d) => `The analysed page includes structured data${d.list?.length ? ` (${d.list.join(', ')})` : ''}.`,
      body: () => 'It may be useful to check whether your website uses it to describe your business.',
      cta: 'Review GEO',
    },
    their_description: {
      title: () => 'The analysed page has a search description.',
      body: () => 'Check whether your website has a clear description of what you offer.',
      cta: 'Create text',
    },
    their_map: {
      title: () => 'The analysed page shows how to get there (map or Google Maps link).',
      body: () => 'You could consider whether your location is easy to find.',
      cta: 'Review Maps',
    },
  },
  checkedTitle: 'What we could check',
  checked: { domain: 'Analysed domain', https: 'Secure connection', redirected: 'Redirect', status: 'Website response', contentType: 'Content type', size: 'Downloaded size', time: 'Analysis time' },
  kb: (b) => `${Math.max(1, Math.round(b / 1024)).toLocaleString('en-GB')} KB`,
  seconds: (ms) => `${(ms / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} s`,
  notMeasuredTitle: "What we don't measure",
  notMeasuredList: [
    'Traffic, visits or clicks', 'Sales, revenue, customers or conversions', 'Market share',
    'Google or Maps rankings', 'Keywords, backlinks or domain authority', 'Reviews, ratings or advertising',
  ],
  notMeasuredNote: "We only read the page you enter, without running its code. If something doesn't appear, it may still exist on other pages of their site.",
  newAnalysis: 'Analyse another competitor',
  costNote: "This analysis doesn't use AI and doesn't count towards your monthly AI usage.",
  errors: {
    invalid_input: "We couldn't process the request. Please try again.",
    url_required: "Enter the competitor's website.",
    url_too_long: 'The address is too long.',
    invalid_url: 'The address is not valid. Enter it in full, for example https://competitor.com',
    blocked: "This address can't be analysed for security reasons. Use the competitor's public website.",
    not_found: "We couldn't find your business. Reload the page.",
    dns_failed: "We couldn't check that domain. Make sure it is spelled correctly.",
    dns_empty: "That domain doesn't exist or has no published website.",
    connect_failed: 'The website is not responding. Try again later.',
    tls_failed: "The website doesn't have a valid secure connection.",
    bad_response: "The website returned a response we can't read.",
    timeout: 'The website is taking too long to respond. Try again later.',
    too_large: 'The page is too large to analyse (2 MB max).',
    too_many_redirects: 'The website redirects too many times. Try the final address.',
    redirect_loop: 'The website redirects in a loop. Try the final address.',
    off_site_redirect: 'The website redirects to another site. Try the final address.',
    bad_status: 'The page you entered is not available. Check the address.',
    unsupported_content: "The address isn't a web page we can analyse.",
    premium_required: 'Competitor Radar requires Premium or an active trial.',
    rate_limited: "You've run many analyses in a short time. Wait a while and try again.",
    unauthorized: 'Your session has expired. Sign in again.',
    unavailable: "We couldn't complete the analysis. Please try again in a few minutes.",
  },
};

export const COPY: Record<'es' | 'en', RadarCopy> = { es: ES, en: EN };
