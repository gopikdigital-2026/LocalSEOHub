import type { AdvisorErrorCode } from './repository';

export interface AdvisorCopy {
  back: string;
  title: string;
  subtitle: string;
  contextTitle: string;
  business: string;
  activity: string;
  city: string;
  goal: string;
  notSet: string;
  missingNote: string;
  goToBusiness: string;
  editBusiness: string;
  usage: (used: number, limit: number) => string;
  remaining: (n: number) => string;
  usageUnavailable: string;
  costNote: string;
  quickTitle: string;
  quickQuestions: string[];
  inputLabel: string;
  placeholder: string;
  count: (n: number, max: number) => string;
  send: string;
  sending: string;
  thinking: string;
  emptyTitle: string;
  emptyBody: string;
  you: string;
  advisor: string;
  firstStep: string;
  actions: string;
  priority: (n: number) => string;
  why: string;
  nextStep: string;
  dataNote: string;
  disclaimer: string;
  copy: string;
  copied: string;
  copyFailed: string;
  newChat: string;
  sessionNote: string;
  loading: string;
  noBusiness: string;
  premiumCta: string;
  errors: Record<AdvisorErrorCode, string>;
}

export const COPY: Record<'es' | 'en', AdvisorCopy> = {
  es: {
    back: 'Herramientas',
    title: 'AI Business Advisor',
    subtitle: 'Pregunta cómo mejorar tu negocio y recibe recomendaciones adaptadas a tu situación.',
    contextTitle: 'Tu asesor utiliza la información disponible de tu negocio para darte respuestas más relevantes.',
    business: 'Negocio',
    activity: 'Actividad',
    city: 'Ciudad',
    goal: 'Objetivo principal',
    notSet: 'Sin indicar',
    missingNote: 'Cuantos más datos tenga tu asesor, más útiles serán sus respuestas.',
    goToBusiness: 'Completar Mi negocio',
    editBusiness: 'Editar en Mi negocio',
    usage: (used, limit) => `Consultas este mes: ${used} / ${limit}`,
    remaining: (n) => (n === 1 ? 'Te queda 1 consulta este mes.' : `Te quedan ${n} consultas este mes.`),
    usageUnavailable: 'No se pudo cargar tu contador de este mes.',
    costNote: 'Cada respuesta usa 1 consulta. Elegir o escribir una pregunta no consume.',
    quickTitle: 'Preguntas rápidas',
    quickQuestions: [
      '¿Qué debería mejorar primero?',
      '¿Cómo puedo conseguir más clientes?',
      '¿Qué puedo hacer para mejorar en Google?',
      '¿Qué debería promocionar esta semana?',
    ],
    inputLabel: 'Pregunta a tu asesor',
    placeholder: 'Ej.: Los martes tengo pocas reservas. ¿Qué puedo hacer para mejorar?',
    count: (n, max) => `${n} / ${max}`,
    send: 'Preguntar',
    sending: 'Pensando…',
    thinking: 'Tu asesor está preparando la respuesta…',
    emptyTitle: '¿En qué puedo ayudarte hoy?',
    emptyBody: 'Pregúntame sobre clientes, visibilidad, promociones, servicios o qué deberías priorizar en tu negocio.',
    you: 'Tú',
    advisor: 'Asesor',
    firstStep: 'Qué haría primero',
    actions: 'Acciones concretas',
    priority: (n) => `Prioridad ${n}`,
    why: 'Por qué puede ayudarte',
    nextStep: 'Próximo paso',
    dataNote: 'Con la información disponible',
    disclaimer: 'Recomendaciones generadas con IA. No garantizan resultados; adáptalas a tu negocio.',
    copy: 'Copiar',
    copied: 'Copiado',
    copyFailed: 'No se pudo copiar. Selecciona el texto y cópialo manualmente.',
    newChat: 'Nueva conversación',
    sessionNote: 'La conversación se mantiene mientras estés en esta página.',
    loading: 'Cargando tu negocio…',
    noBusiness: 'No hemos podido cargar tu negocio. Inténtalo de nuevo en unos minutos.',
    premiumCta: 'Ver planes',
    errors: {
      profile_incomplete: 'Indica al menos el nombre o la actividad de tu negocio en Mi negocio para usar el asesor.',
      advisor_limit: 'Has alcanzado el límite de 15 consultas de este mes. Podrás hacer más el mes que viene.',
      global_limit: 'Has alcanzado el límite mensual de uso de IA de tu cuenta. Podrás usarla de nuevo el mes que viene.',
      ai_unavailable: 'El servicio de IA no está disponible ahora mismo. No se ha descontado ninguna consulta. Inténtalo de nuevo en unos minutos.',
      generation_failed: 'No hemos podido preparar una respuesta que cumpla nuestras reglas de calidad. Prueba a formular la pregunta de otra forma.',
      premium_required: 'El asesor está incluido en tu plan de pago. Activa tu plan para usarlo.',
      rate_limited: 'Has hecho muchas consultas seguidas. Espera un poco y vuelve a intentarlo.',
      unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
      invalid_input: 'No hemos podido enviar tu pregunta. Inténtalo de nuevo.',
      question_empty: 'Escribe una pregunta para tu asesor.',
      question_too_long: 'La pregunta es demasiado larga. Resúmela en menos de 500 caracteres.',
      history_too_long: 'La conversación es demasiado larga. Empieza una nueva conversación.',
      duplicate_request: 'Esta consulta ya se estaba procesando. Inténtalo de nuevo.',
      not_found: 'No hemos encontrado tu negocio. Recarga la página.',
      unavailable: 'Algo ha fallado. Inténtalo de nuevo en unos minutos.',
    },
  },
  en: {
    back: 'Tools',
    title: 'AI Business Advisor',
    subtitle: 'Ask how to improve your business and get recommendations tailored to your situation.',
    contextTitle: 'Your advisor uses the available information about your business to give you more relevant answers.',
    business: 'Business',
    activity: 'Activity',
    city: 'City',
    goal: 'Main goal',
    notSet: 'Not set',
    missingNote: 'The more your advisor knows, the more useful its answers will be.',
    goToBusiness: 'Complete My business',
    editBusiness: 'Edit in My business',
    usage: (used, limit) => `Questions this month: ${used} / ${limit}`,
    remaining: (n) => (n === 1 ? 'You have 1 question left this month.' : `You have ${n} questions left this month.`),
    usageUnavailable: "We couldn't load your monthly counter.",
    costNote: 'Each answer uses 1 question. Choosing or typing a question is free.',
    quickTitle: 'Quick questions',
    quickQuestions: [
      'What should I improve first?',
      'How can I get more customers?',
      'What can I do to improve on Google?',
      'What should I promote this week?',
    ],
    inputLabel: 'Ask your advisor',
    placeholder: 'E.g.: I get few bookings on Tuesdays. What can I do to improve?',
    count: (n, max) => `${n} / ${max}`,
    send: 'Ask',
    sending: 'Thinking…',
    thinking: 'Your advisor is preparing the answer…',
    emptyTitle: 'How can I help you today?',
    emptyBody: 'Ask me about customers, visibility, promotions, services or what you should prioritise in your business.',
    you: 'You',
    advisor: 'Advisor',
    firstStep: 'What I would do first',
    actions: 'Concrete actions',
    priority: (n) => `Priority ${n}`,
    why: 'Why it may help',
    nextStep: 'Next step',
    dataNote: 'With the information available',
    disclaimer: 'AI-generated recommendations. Results are not guaranteed; adapt them to your business.',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: "Couldn't copy. Select the text and copy it manually.",
    newChat: 'New conversation',
    sessionNote: 'The conversation is kept while you stay on this page.',
    loading: 'Loading your business…',
    noBusiness: "We couldn't load your business. Please try again in a few minutes.",
    premiumCta: 'See plans',
    errors: {
      profile_incomplete: 'Add at least your business name or activity in My business to use the advisor.',
      advisor_limit: "You've reached this month's limit of 15 questions. You can ask more next month.",
      global_limit: "You've reached your account's monthly AI usage limit. You can use it again next month.",
      ai_unavailable: 'The AI service is not available right now. No question was deducted. Please try again in a few minutes.',
      generation_failed: "We couldn't prepare an answer that meets our quality rules. Try phrasing the question differently.",
      premium_required: 'The advisor is included in your paid plan. Activate your plan to use it.',
      rate_limited: "You've asked many questions in a row. Wait a moment and try again.",
      unauthorized: 'Your session has expired. Please sign in again.',
      invalid_input: "We couldn't send your question. Please try again.",
      question_empty: 'Type a question for your advisor.',
      question_too_long: 'The question is too long. Keep it under 500 characters.',
      history_too_long: 'The conversation is too long. Start a new conversation.',
      duplicate_request: 'This question was already being processed. Please try again.',
      not_found: "We couldn't find your business. Reload the page.",
      unavailable: 'Something went wrong. Please try again in a few minutes.',
    },
  },
};
