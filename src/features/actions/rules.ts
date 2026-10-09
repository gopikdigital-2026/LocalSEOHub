import type { BusinessRecord } from '../business-memory/businessRecord';
import type { GoalId } from '../business-memory/types';
import type { WebsiteAnalysis } from '../reality-engine/types';
import type { ActionCandidate, BusinessAction, SourceSnapshot } from './types';

export interface EvaluationContext {
  business: BusinessRecord;
  sources: SourceSnapshot[];
  history: BusinessAction[];
  now: Date;
}

export interface ActionRule {
  id: string;
  cooldownDays: number;
  evaluate(ctx: EvaluationContext): ActionCandidate[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const isBlank = (v: string | null | undefined) => !v || !v.trim();

function source(ctx: EvaluationContext, type: string): SourceSnapshot | undefined {
  return ctx.sources.find((s) => s.sourceType === type);
}

// A GBP source only counts as verified data once a sync has actually completed.
function syncedGbp(ctx: EvaluationContext): SourceSnapshot | undefined {
  const gbp = source(ctx, 'google_business');
  return gbp && gbp.status === 'connected' && gbp.lastSyncAt ? gbp : undefined;
}

// Follow-up content only makes sense once we know what the business does and where.
function essentialsComplete(b: BusinessRecord): boolean {
  return !isBlank(b.category) && !isBlank(b.city) && b.services.some((s) => s.trim());
}

function mainService(b: BusinessRecord): string {
  return b.services.find((s) => s.trim())?.trim() ?? '';
}

function websiteAnalysis(ctx: EvaluationContext): WebsiteAnalysis | undefined {
  const site = source(ctx, 'website');
  const analysis = site?.status === 'connected' ? site.metadata.analysis : undefined;
  return analysis && typeof analysis === 'object' && 'https' in analysis ? analysis as WebsiteAnalysis : undefined;
}

function declaredFaqs(ctx: EvaluationContext): string {
  const faqs = source(ctx, 'manual')?.metadata.faqs;
  return typeof faqs === 'string' ? faqs.trim() : '';
}

const GOAL_POST_GOALS: GoalId[] = ['more_calls', 'more_bookings'];

function lastCompleted(ctx: EvaluationContext, ruleId: string): BusinessAction | undefined {
  return ctx.history
    .filter((a) => a.ruleId === ruleId && a.status === 'COMPLETED' && a.completedAt)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0];
}

const connectGbp: ActionRule = {
  id: 'connect_google_business_profile',
  cooldownDays: 7,
  evaluate(ctx) {
    const gbp = source(ctx, 'google_business');
    // A failed connection is not a connected profile: the action stays open until a sync works.
    if (gbp && (gbp.status === 'connected' || gbp.status === 'syncing')) return [];
    return [{
      ruleId: this.id, actionType: 'other', category: 'data', sourceType: 'SOURCE_REQUIRED',
      sourceReference: 'connected_sources.google_business', impact: 'high', effortMinutes: 5, cta: 'connect', ctaTo: '/fuentes',
      copy: {
        es: {
          title: 'Conecta tu Perfil de Empresa de Google',
          description: 'Vincula tu perfil para que podamos leer tus datos reales: horario, teléfono, web y reseñas.',
          reason: 'Todavía no tenemos datos de tu Perfil de Empresa, así que no podemos analizar tu presencia en Google.',
          value: 'Mientras tanto trabajamos con los datos que nos indicas y con el análisis de tu web.',
        },
        en: {
          title: 'Connect your Google Business Profile',
          description: 'Link your profile so we can read your real data: hours, phone, website and reviews.',
          reason: 'We do not have data from your Business Profile yet, so we cannot analyse your presence on Google.',
          value: 'Meanwhile we work with the details you give us and the analysis of your website.',
        },
      },
    }];
  },
};

const fixSourceConnection: ActionRule = {
  id: 'fix_source_connection',
  cooldownDays: 3,
  evaluate(ctx) {
    return ctx.sources
      // Google errors are covered by connect_google_business_profile; reviews only mirror that connection.
      .filter((s) => s.status === 'error' && s.sourceType !== 'google_business' && s.sourceType !== 'reviews')
      .map((s) => {
        const website = s.sourceType === 'website';
        return {
          ruleId: `${this.id}:${s.sourceType}`, actionType: 'other', category: 'data', sourceType: 'SOURCE_REQUIRED',
          sourceReference: `connected_sources.${s.sourceType}.status`, impact: 'medium', effortMinutes: 5, cta: 'review', ctaTo: '/fuentes',
          copy: {
            es: {
              title: website ? 'Vuelve a analizar tu web' : 'Revisa la conexión de una fuente de datos',
              description: website
                ? 'El último análisis de tu web no se pudo completar. Comprueba que la dirección abre en el navegador y vuelve a analizarla en Fuentes.'
                : 'Una de tus fuentes dio un error en la última sincronización. Revísala en Fuentes.',
              reason: 'La fuente está en estado de error, así que no usamos sus datos hasta que funcione.',
              value: 'Recuperarla permite basar las recomendaciones en datos comprobados.',
            },
            en: {
              title: website ? 'Analyse your website again' : 'Check a data source connection',
              description: website
                ? 'The last analysis of your website could not finish. Check the address opens in a browser and analyse it again in Sources.'
                : 'One of your sources failed on its last sync. Check it in Sources.',
              reason: 'The source is in an error state, so we do not use its data until it works.',
              value: 'Restoring it lets recommendations rely on checked data.',
            },
          },
        };
      });
  },
};

const connectWebsite: ActionRule = {
  id: 'connect_website_source',
  cooldownDays: 14,
  evaluate(ctx) {
    if (isBlank(ctx.business.website) || source(ctx, 'website')) return [];
    return [{
      ruleId: this.id, actionType: 'other', category: 'data', sourceType: 'SOURCE_REQUIRED',
      sourceReference: 'businesses.website', impact: 'medium', effortMinutes: 3, cta: 'connect', ctaTo: '/fuentes',
      copy: {
        es: {
          title: 'Analiza tu sitio web',
          description: 'Añade tu web como fuente para revisar su título y descripción tal como los ve Google.',
          reason: 'Nos indicaste una web, pero todavía no la hemos analizado.',
          value: 'Así las recomendaciones sobre tu web se basarán en lo que hay publicado.',
        },
        en: {
          title: 'Analyse your website',
          description: 'Add your website as a source to review its title and description as Google sees them.',
          reason: 'You gave us a website, but we have not analysed it yet.',
          value: 'Website recommendations will then be based on what is actually published.',
        },
      },
    }];
  },
};

const completeBasics: ActionRule = {
  id: 'complete_business_basics',
  cooldownDays: 14,
  evaluate(ctx) {
    if (!isBlank(ctx.business.category) && !isBlank(ctx.business.city)) return [];
    return [{
      ruleId: this.id, actionType: 'optimize_profile', category: 'profile', sourceType: 'BUSINESS_PROFILE',
      sourceReference: 'businesses.category,businesses.city', impact: 'high', effortMinutes: 3, cta: 'complete', ctaTo: '/negocio',
      copy: {
        es: {
          title: 'Completa la categoría y la ciudad de tu negocio',
          description: 'Indica a qué te dedicas y dónde estás.',
          reason: 'Falta la categoría o la ciudad en la ficha de tu negocio.',
          value: 'Son la base de cualquier recomendación de búsqueda local.',
        },
        en: {
          title: 'Add your business category and city',
          description: 'Tell us what you do and where you are.',
          reason: 'Your business record is missing its category or city.',
          value: 'They are the foundation of every local search recommendation.',
        },
      },
    }];
  },
};

const addContact: ActionRule = {
  id: 'add_business_contact',
  cooldownDays: 14,
  evaluate(ctx) {
    const out: ActionCandidate[] = [];
    if (isBlank(ctx.business.phone)) {
      out.push({
        ruleId: 'add_business_phone', actionType: 'optimize_profile', category: 'profile', sourceType: 'BUSINESS_PROFILE',
        sourceReference: 'businesses.phone', impact: 'high', effortMinutes: 2, cta: 'complete', ctaTo: '/negocio',
        copy: {
          es: { title: 'Añade el teléfono de tu negocio', description: 'Guarda el número en el que te llaman tus clientes.', reason: 'Tu ficha de negocio no tiene teléfono.', value: 'Un teléfono visible facilita que te llamen.' },
          en: { title: 'Add your business phone number', description: 'Save the number your customers call.', reason: 'Your business record has no phone number.', value: 'A visible phone number makes it easier to call you.' },
        },
      });
    }
    if (isBlank(ctx.business.website)) {
      out.push({
        ruleId: 'add_business_website', actionType: 'optimize_profile', category: 'profile', sourceType: 'BUSINESS_PROFILE',
        sourceReference: 'businesses.website', impact: 'medium', effortMinutes: 2, cta: 'complete', ctaTo: '/negocio',
        copy: {
          es: { title: 'Añade tu sitio web o página principal', description: 'Si tienes web, redes o una página de reservas, guárdala.', reason: 'Tu ficha de negocio no tiene sitio web.', value: 'Da a tus clientes un lugar donde saber más de ti.' },
          en: { title: 'Add your website or main page', description: 'If you have a website, social page or booking page, save it.', reason: 'Your business record has no website.', value: 'Gives customers a place to learn more about you.' },
        },
      });
    }
    return out;
  },
};

const addSchedule: ActionRule = {
  id: 'add_business_schedule',
  cooldownDays: 14,
  evaluate(ctx) {
    if (!isBlank(ctx.business.schedule)) return [];
    return [{
      ruleId: this.id, actionType: 'update_hours', category: 'profile', sourceType: 'BUSINESS_PROFILE',
      sourceReference: 'businesses.schedule', impact: 'medium', effortMinutes: 3, cta: 'complete', ctaTo: '/negocio',
      copy: {
        es: { title: 'Indica tu horario de apertura', description: 'Escribe los días y horas en que atiendes.', reason: 'Tu ficha de negocio no tiene horario.', value: 'Evita que un cliente se acerque cuando está cerrado.' },
        en: { title: 'Add your opening hours', description: 'Write the days and hours you are open.', reason: 'Your business record has no opening hours.', value: 'Prevents customers from showing up when you are closed.' },
      },
    }];
  },
};

const completeServices: ActionRule = {
  id: 'complete_business_services',
  cooldownDays: 14,
  evaluate(ctx) {
    if (ctx.business.services.filter((s) => s.trim()).length > 0) return [];
    return [{
      ruleId: this.id, actionType: 'update_description', category: 'profile', sourceType: 'BUSINESS_PROFILE',
      sourceReference: 'businesses.services', impact: 'high', effortMinutes: 5, cta: 'complete', ctaTo: '/negocio',
      copy: {
        es: { title: 'Describe tus servicios principales', description: 'Enumera lo que ofreces con las palabras que usan tus clientes.', reason: 'Tu ficha de negocio no tiene servicios.', value: 'Ayuda a preparar contenido y descripciones relevantes.' },
        en: { title: 'Describe your main services', description: 'List what you offer using the words your customers use.', reason: 'Your business record has no services listed.', value: 'Helps prepare relevant content and descriptions.' },
      },
    }];
  },
};

const defineAudience: ActionRule = {
  id: 'define_target_audience',
  cooldownDays: 30,
  evaluate(ctx) {
    if (!isBlank(ctx.business.target_audience)) return [];
    return [{
      ruleId: this.id, actionType: 'optimize_profile', category: 'profile', sourceType: 'BUSINESS_PROFILE',
      sourceReference: 'businesses.target_audience', impact: 'low', effortMinutes: 3, cta: 'complete', ctaTo: '/negocio',
      copy: {
        es: { title: 'Describe a tu cliente ideal', description: 'Una frase sobre a quién te diriges.', reason: 'No has indicado tu público objetivo.', value: 'Permite adaptar el tono de tus publicaciones.' },
        en: { title: 'Describe your ideal customer', description: 'One sentence about who you serve.', reason: 'You have not set a target audience.', value: 'Lets us adapt the tone of your posts.' },
      },
    }];
  },
};

const setPrimaryGoal: ActionRule = {
  id: 'set_primary_goal',
  cooldownDays: 14,
  evaluate(ctx) {
    if (ctx.business.primary_goal) return [];
    return [{
      ruleId: this.id, actionType: 'other', category: 'goals', sourceType: 'BUSINESS_PROFILE',
      sourceReference: 'businesses.primary_goal', impact: 'medium', effortMinutes: 2, cta: 'complete', ctaTo: '/negocio/objetivos',
      copy: {
        es: { title: 'Elige tu objetivo principal', description: 'Dinos qué quieres conseguir primero.', reason: 'Todavía no has elegido un objetivo.', value: 'Ordenamos tus acciones según lo que más te importa.' },
        en: { title: 'Choose your main goal', description: 'Tell us what you want to achieve first.', reason: 'You have not chosen a goal yet.', value: 'We order your actions by what matters most to you.' },
      },
    }];
  },
};

type GoalAction = Omit<ActionCandidate, 'sourceType' | 'sourceReference'>;

const GOAL_ACTIONS: Partial<Record<GoalId, GoalAction>> = {
  more_reviews: {
    ruleId: 'request_customer_reviews', actionType: 'request_reviews', category: 'reputation', impact: 'high', effortMinutes: 10, cta: 'prepare',
    copy: {
      es: { title: 'Pide una reseña a tus clientes recientes', description: 'Prepara un mensaje breve y envíalo a 3 clientes satisfechos.', reason: 'Tu objetivo es conseguir más reseñas.', value: 'Pedirlas directamente es la forma más habitual de conseguirlas.' },
      en: { title: 'Ask recent customers for a review', description: 'Prepare a short message and send it to 3 happy customers.', reason: 'Your goal is to get more reviews.', value: 'Asking directly is the most common way to get them.' },
    },
  },
  more_calls: {
    ruleId: 'publish_call_to_action_post', actionType: 'publish_post', category: 'content', impact: 'medium', effortMinutes: 15, cta: 'prepare',
    copy: {
      es: { title: 'Publica una oferta con llamada a la acción', description: 'Prepara una publicación que invite a llamarte.', reason: 'Tu objetivo es recibir más llamadas.', value: 'Una invitación clara facilita que el cliente dé el paso.' },
      en: { title: 'Publish an offer with a call to action', description: 'Prepare a post inviting people to call you.', reason: 'Your goal is to get more calls.', value: 'A clear invitation makes it easier for customers to act.' },
    },
  },
  better_local_seo: {
    ruleId: 'optimize_services_keywords', actionType: 'update_description', category: 'visibility', impact: 'medium', effortMinutes: 15, cta: 'prepare',
    copy: {
      es: { title: 'Revisa la descripción de tu negocio', description: 'Prepara una descripción que mencione tus servicios y tu ciudad.', reason: 'Tu objetivo es mejorar tu visibilidad local.', value: 'Una descripción clara ayuda a que te encuentren por lo que haces.' },
      en: { title: 'Review your business description', description: 'Prepare a description that mentions your services and city.', reason: 'Your goal is better local visibility.', value: 'A clear description helps people find you for what you do.' },
    },
  },
};
GOAL_ACTIONS.better_reputation = GOAL_ACTIONS.more_reviews;
GOAL_ACTIONS.more_bookings = GOAL_ACTIONS.more_calls;
GOAL_ACTIONS.more_web_visits = GOAL_ACTIONS.better_local_seo;

const goalFocus: ActionRule = {
  id: 'goal_focus_action',
  cooldownDays: 7,
  evaluate(ctx) {
    const goal = ctx.business.primary_goal;
    const action = goal ? GOAL_ACTIONS[goal] : undefined;
    if (!goal || !action) return [];
    // The verified "first reviews" finding already covers asking for reviews.
    if (action.ruleId === 'request_customer_reviews' && gbpFirstReviews.evaluate(ctx).length > 0) return [];
    return [{ ...action, sourceType: 'GOAL_BASED', sourceReference: `businesses.primary_goal=${goal}` }];
  },
};

const weeklyPost: ActionRule = {
  id: 'create_weekly_post',
  cooldownDays: 7,
  evaluate(ctx) {
    const b = ctx.business;
    if (!essentialsComplete(b)) return [];
    if (b.primary_goal && GOAL_POST_GOALS.includes(b.primary_goal as GoalId)) return [];
    const service = mainService(b);
    return [{
      ruleId: this.id, actionType: 'publish_post', category: 'content', sourceType: 'GENERAL_BEST_PRACTICE',
      sourceReference: 'businesses.services,businesses.city', impact: 'medium', effortMinutes: 15, cta: 'prepare',
      evidence: { service, city: b.city.trim() },
      copy: {
        es: { title: `Prepara una publicación local sobre «${service}»`, description: `Redacta una novedad, consejo u oferta sobre ${service} para tus clientes de ${b.city.trim()}.`, reason: 'Publicar con regularidad es una práctica recomendada para negocios locales.', value: 'Mantiene tu perfil activo y con información reciente sobre lo que ofreces.' },
        en: { title: `Prepare a local post about "${service}"`, description: `Write an update, tip or offer about ${service} for your customers in ${b.city.trim()}.`, reason: 'Posting regularly is a recommended practice for local businesses.', value: 'Keeps your profile active with recent information about what you offer.' },
      },
    }];
  },
};

const recentPhotos: ActionRule = {
  id: 'add_recent_photos',
  cooldownDays: 30,
  evaluate(ctx) {
    if (!essentialsComplete(ctx.business)) return [];
    return [{
      ruleId: this.id, actionType: 'add_photos', category: 'visibility', sourceType: 'GENERAL_BEST_PRACTICE',
      sourceReference: 'best_practice.recent_photos', impact: 'low', effortMinutes: 10, cta: 'start',
      copy: {
        es: { title: 'Sube fotos recientes de tu negocio', description: 'Haz 3 fotos del local, tu equipo o tus productos y súbelas a tu perfil.', reason: 'Actualizar las fotos cada mes es una práctica recomendada.', value: 'Muestra a los clientes cómo es tu negocio hoy.' },
        en: { title: 'Upload recent photos of your business', description: 'Take 3 photos of your premises, team or products and upload them.', reason: 'Refreshing photos monthly is a recommended practice.', value: 'Shows customers what your business looks like today.' },
      },
    }];
  },
};

const gbpProfileGaps: ActionRule = {
  id: 'gbp_profile_gaps',
  cooldownDays: 14,
  evaluate(ctx) {
    const gbp = syncedGbp(ctx);
    if (!gbp) return [];
    const m = gbp.metadata;
    const out: ActionCandidate[] = [];
    const local = { website: ctx.business.website, phone: ctx.business.phone, hours: ctx.business.schedule };
    const gap = (field: 'website' | 'phone' | 'hours', es: [string, string], en: [string, string]) => {
      if (!(field in m) || m[field] !== null) return;
      // Until the business saves the value here, the profile action asks for it; one request per gap.
      if (isBlank(local[field])) return;
      out.push({
        ruleId: `gbp_add_${field}`, actionType: field === 'hours' ? 'update_hours' : 'optimize_profile', category: 'visibility',
        sourceType: 'VERIFIED_FINDING', sourceReference: `connected_sources.google_business.metadata.${field}`,
        impact: 'high', effortMinutes: 5, cta: 'review',
        copy: {
          es: { title: es[0], description: es[1], reason: 'Lo hemos comprobado en la última sincronización de tu Perfil de Empresa.', value: 'Un perfil completo da a los clientes la información que buscan.' },
          en: { title: en[0], description: en[1], reason: 'We checked this in the last sync of your Business Profile.', value: 'A complete profile gives customers the information they need.' },
        },
      });
    };
    gap('website', ['Añade tu web a tu Perfil de Empresa', 'Tu Perfil de Empresa de Google no muestra sitio web.'], ['Add your website to your Business Profile', 'Your Google Business Profile shows no website.']);
    gap('phone', ['Añade tu teléfono a tu Perfil de Empresa', 'Tu Perfil de Empresa de Google no muestra teléfono.'], ['Add your phone to your Business Profile', 'Your Google Business Profile shows no phone number.']);
    gap('hours', ['Añade tu horario a tu Perfil de Empresa', 'Tu Perfil de Empresa de Google no muestra horario.'], ['Add your hours to your Business Profile', 'Your Google Business Profile shows no opening hours.']);
    return out;
  },
};

const gbpFirstReviews: ActionRule = {
  id: 'gbp_get_first_reviews',
  cooldownDays: 14,
  evaluate(ctx) {
    const gbp = syncedGbp(ctx);
    if (!gbp || gbp.metadata.totalReviews !== 0) return [];
    return [{
      ruleId: this.id, actionType: 'request_reviews', category: 'reputation', sourceType: 'VERIFIED_FINDING',
      sourceReference: 'connected_sources.google_business.metadata.totalReviews', impact: 'high', effortMinutes: 10, cta: 'prepare',
      copy: {
        es: { title: 'Consigue tus primeras reseñas', description: 'Pide a 3 clientes de confianza que dejen su opinión en Google.', reason: 'Tu Perfil de Empresa no tiene reseñas según la última sincronización.', value: 'Las primeras reseñas generan confianza en nuevos clientes.' },
        en: { title: 'Get your first reviews', description: 'Ask 3 trusted customers to leave their opinion on Google.', reason: 'Your Business Profile has no reviews according to the last sync.', value: 'First reviews build trust with new customers.' },
      },
    }];
  },
};

const followUps: ActionRule = {
  id: 'follow_up_actions',
  cooldownDays: 7,
  evaluate(ctx) {
    const out: ActionCandidate[] = [];
    const ageDays = (a?: BusinessAction) => (a?.completedAt ? (ctx.now.getTime() - new Date(a.completedAt).getTime()) / DAY_MS : -1);
    const asked = [lastCompleted(ctx, 'request_customer_reviews'), lastCompleted(ctx, 'gbp_get_first_reviews')]
      .find((a) => { const d = ageDays(a); return d >= 3 && d <= 21; });
    if (asked) {
      out.push({
        ruleId: 'follow_up_reply_reviews', actionType: 'respond_reviews', category: 'follow_up', sourceType: 'FOLLOW_UP',
        sourceReference: `business_actions.${asked.id}`, impact: 'medium', effortMinutes: 10, cta: 'review',
        copy: {
          es: { title: 'Responde a las reseñas que hayas recibido', description: 'Revisa tu perfil y agradece cada reseña nueva.', reason: 'Hace unos días pediste reseñas a tus clientes.', value: 'Responder muestra que escuchas a tus clientes.' },
          en: { title: 'Reply to the reviews you received', description: 'Check your profile and thank each new review.', reason: 'You asked customers for reviews a few days ago.', value: 'Replying shows you listen to your customers.' },
        },
      });
    }
    const posted = lastCompleted(ctx, 'create_weekly_post') ?? lastCompleted(ctx, 'publish_call_to_action_post');
    const d = ageDays(posted);
    if (posted && d >= 2 && d <= 14) {
      out.push({
        ruleId: 'follow_up_check_post', actionType: 'other', category: 'follow_up', sourceType: 'FOLLOW_UP',
        sourceReference: `business_actions.${posted.id}`, impact: 'low', effortMinutes: 5, cta: 'review',
        copy: {
          es: { title: 'Revisa cómo ha ido tu última publicación', description: 'Mira en tu perfil si ha recibido visitas o mensajes.', reason: 'Completaste una publicación hace unos días.', value: 'Te ayuda a decidir qué tipo de contenido repetir.' },
          en: { title: 'Check how your last post went', description: 'See on your profile whether it got views or messages.', reason: 'You completed a post a few days ago.', value: 'Helps you decide what kind of content to repeat.' },
        },
      });
    }
    return out;
  },
};

const websiteFindings: ActionRule = {
  id: 'website_findings',
  cooldownDays: 14,
  evaluate(ctx) {
    const a = websiteAnalysis(ctx);
    if (!a) return [];
    const out: ActionCandidate[] = [];
    const ref = (f: string) => `connected_sources.website.metadata.analysis.${f}`;
    const reasonEs = `Lo hemos comprobado al analizar ${a.url}.`;
    const reasonEn = `We checked this when analysing ${a.url}.`;
    const finding = (ruleId: string, field: string, impact: ActionCandidate['impact'], minutes: number, es: [string, string, string], en: [string, string, string], evidence: ActionCandidate['evidence']) => {
      out.push({
        ruleId, actionType: 'other', category: 'visibility', sourceType: 'VERIFIED_FINDING', sourceReference: ref(field),
        impact, effortMinutes: minutes, cta: 'review', ctaTo: '/fuentes', evidence: { url: a.url, analyzed_at: a.analyzedAt, ...evidence },
        copy: {
          es: { title: es[0], description: es[1], reason: reasonEs, value: es[2] },
          en: { title: en[0], description: en[1], reason: reasonEn, value: en[2] },
        },
      });
    };
    if (!a.https) {
      finding('website_enable_https', 'https', 'high', 20,
        ['Activa la conexión segura (HTTPS) en tu web', 'Tu web no se sirve con HTTPS. Pide a tu proveedor de hosting que active el certificado y vuelve a analizarla.', 'Los navegadores marcan como «no segura» una web sin HTTPS.'],
        ['Enable secure connection (HTTPS) on your website', 'Your website is not served over HTTPS. Ask your hosting provider to enable the certificate, then analyse it again.', 'Browsers flag websites without HTTPS as "not secure".'],
        { https: false });
    }
    if (!a.title) {
      finding('website_add_title', 'title', 'high', 10,
        ['Añade un título a tu página principal', 'Tu página principal no tiene título. Escribe uno con tu actividad y tu ciudad y vuelve a analizarla.', 'El título es lo primero que se ve en los resultados de búsqueda.'],
        ['Add a title to your home page', 'Your home page has no title. Write one with your activity and city, then analyse it again.', 'The title is the first thing shown in search results.'],
        { title: null });
    } else if (!isBlank(ctx.business.city) && !a.title.toLowerCase().includes(ctx.business.city.trim().toLowerCase())) {
      finding('website_title_city', 'title', 'medium', 10,
        ['Revisa el título de tu web', `El título actual («${a.title}») no menciona ${ctx.business.city.trim()}. Valora incluir tu ciudad y vuelve a analizarla.`, 'Ayuda a que quien busca en tu zona entienda que atiendes allí.'],
        ['Review your website title', `The current title ("${a.title}") does not mention ${ctx.business.city.trim()}. Consider including your city, then analyse it again.`, 'Helps people searching in your area see that you serve it.'],
        { title: a.title, city: ctx.business.city.trim() });
    }
    if (!a.metaDescription) {
      finding('website_add_meta_description', 'metaDescription', 'medium', 10,
        ['Escribe la descripción de tu web para buscadores', 'Tu página principal no tiene meta descripción. Redacta 1–2 frases sobre lo que haces y dónde, y vuelve a analizarla.', 'Es el texto que suele aparecer bajo el título en los resultados.'],
        ['Write your website description for search engines', 'Your home page has no meta description. Write 1–2 sentences about what you do and where, then analyse it again.', 'It is the text usually shown under the title in search results.'],
        { meta_description: null });
    }
    if (!a.h1) {
      finding('website_add_h1', 'h1', 'low', 10,
        ['Añade un encabezado principal a tu web', 'Tu página principal no tiene encabezado H1. Añade uno que diga claramente qué ofreces.', 'Deja claro a visitantes y buscadores de qué trata la página.'],
        ['Add a main heading to your website', 'Your home page has no H1 heading. Add one that clearly says what you offer.', 'Makes clear to visitors and search engines what the page is about.'],
        { h1: null });
    }
    return out;
  },
};

const faqAnswers: ActionRule = {
  id: 'write_faq_answers',
  cooldownDays: 30,
  evaluate(ctx) {
    if (!essentialsComplete(ctx.business) || declaredFaqs(ctx)) return [];
    return [{
      ruleId: this.id, actionType: 'create_content', category: 'content', sourceType: 'BUSINESS_PROFILE',
      sourceReference: 'connected_sources.manual.metadata.faqs', impact: 'medium', effortMinutes: 15, cta: 'complete', ctaTo: '/fuentes',
      copy: {
        es: { title: 'Redacta respuestas a tus preguntas frecuentes', description: 'Anota en «Entrada manual» 3 preguntas que te hacen los clientes y tu respuesta a cada una.', reason: 'Todavía no nos has indicado las preguntas frecuentes de tus clientes.', value: 'Las usaremos para preparar contenido y respuestas con tus propias palabras.' },
        en: { title: 'Write answers to your frequently asked questions', description: 'In "Manual entry", note 3 questions customers ask you and your answer to each.', reason: 'You have not told us your customers\' frequent questions yet.', value: 'We will use them to prepare content and replies in your own words.' },
      },
    }];
  },
};

const serviceDescription: ActionRule = {
  id: 'improve_service_description',
  cooldownDays: 30,
  evaluate(ctx) {
    const b = ctx.business;
    if (!essentialsComplete(b)) return [];
    const service = mainService(b);
    return [{
      ruleId: this.id, actionType: 'update_description', category: 'profile', sourceType: 'GENERAL_BEST_PRACTICE',
      sourceReference: 'businesses.services[0]', impact: 'medium', effortMinutes: 15, cta: 'prepare',
      evidence: { service, city: b.city.trim(), audience: b.target_audience.trim() || null },
      copy: {
        es: { title: `Mejora la descripción de «${service}»`, description: `Escribe 3–4 frases que expliquen qué incluye ${service}, para quién es y cómo reservarlo en ${b.city.trim()}.`, reason: `${service} es el primer servicio que nos indicaste.`, value: 'Una descripción concreta ayuda al cliente a decidir sin tener que preguntar.' },
        en: { title: `Improve the description of "${service}"`, description: `Write 3–4 sentences explaining what ${service} includes, who it is for and how to book it in ${b.city.trim()}.`, reason: `${service} is the first service you told us about.`, value: 'A concrete description helps customers decide without having to ask.' },
      },
    }];
  },
};

export const ACTION_RULES: ActionRule[] = [
  connectGbp, fixSourceConnection, connectWebsite, completeBasics, addContact, addSchedule,
  completeServices, defineAudience, setPrimaryGoal, goalFocus, weeklyPost, recentPhotos,
  gbpProfileGaps, gbpFirstReviews, websiteFindings, faqAnswers, serviceDescription, followUps,
];
