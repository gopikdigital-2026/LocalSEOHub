import type { FactKey, Scenario, SimulatorErrorCode } from './repository';

export interface SimulatorCopy {
  back: string;
  title: string;
  subtitle: string;
  badge: string;
  intro: string;
  scenarioTitle: string;
  scenarios: Record<Scenario, { label: string; hint: string }>;
  customLabel: string;
  customLabelOptional: string;
  placeholder: string;
  count: (n: number, max: number) => string;
  privacy: string;
  examplesTitle: string;
  examples: Array<{ text: string; scenario: Scenario }>;
  generate: string;
  generating: string;
  regenerate: string;
  regenerateNote: string;
  usage: (used: number, limit: number) => string;
  remaining: (n: number) => string;
  usageUnavailable: string;
  limitReached: string;
  emptyTitle: string;
  emptyBody: string;
  customerLabel: string;
  responseLabel: string;
  whyLabel: string;
  tipLabel: string;
  factsLabel: string;
  facts: Record<FactKey, string>;
  disclaimer: string;
  copy: string;
  copied: string;
  copyFailed: string;
  notSaved: string;
  missingNote: string;
  goToBusiness: string;
  loading: string;
  noBusiness: string;
  billingUnknown: string;
  premiumTitle: string;
  premiumBody: string;
  premiumCta: string;
  errors: Record<SimulatorErrorCode, string>;
}

export const COPY: Record<'es' | 'en', SimulatorCopy> = {
  es: {
    back: 'Herramientas',
    title: 'Voice Simulator',
    subtitle: 'Practica conversaciones con clientes y prepara mejores respuestas.',
    badge: 'Simulación con IA',
    intro: 'Simula conversaciones con clientes y practica respuestas adaptadas a tu negocio.',
    scenarioTitle: 'Elige una situación',
    scenarios: {
      general_inquiry: { label: 'Consulta general', hint: 'Qué hacéis y cómo trabajáis' },
      price_request: { label: 'Solicitud de precio', hint: 'Cuánto cuesta un servicio' },
      price_objection: { label: 'Objeción de precio', hint: 'Le parece caro' },
      quote_request: { label: 'Petición de presupuesto', hint: 'Quiere un presupuesto' },
      undecided: { label: 'Cliente indeciso', hint: 'No sabe qué elegir' },
      booking: { label: 'Reserva o cita', hint: 'Quiere reservar o pedir cita' },
      service_inquiry: { label: 'Consulta sobre un servicio', hint: 'Pregunta por un servicio concreto' },
      unhappy_customer: { label: 'Cliente insatisfecho', hint: 'Tiene una queja' },
      follow_up: { label: 'Seguimiento comercial', hint: 'Retomar un contacto' },
      custom: { label: 'Personalizado', hint: 'Describe la situación' },
    },
    customLabel: 'Describe la situación',
    customLabelOptional: 'Añade detalles (opcional)',
    placeholder: 'Ej.: Un cliente pregunta si podemos atenderle esta semana para una revisión.',
    count: (n, max) => `${n}/${max}`,
    privacy: 'No introduzcas datos personales sensibles de clientes.',
    examplesTitle: 'Ejemplos rápidos',
    examples: [
      { text: 'Un cliente pregunta el precio.', scenario: 'price_request' },
      { text: 'Un cliente dice que le parece caro.', scenario: 'price_objection' },
      { text: 'Un cliente quiere saber qué servicio elegir.', scenario: 'undecided' },
    ],
    generate: 'Generar simulación',
    generating: 'Generando simulación…',
    regenerate: 'Generar otra respuesta',
    regenerateNote: 'Cada nueva simulación consume 1 uso.',
    usage: (used, limit) => `Simulaciones IA ${used} / ${limit} utilizadas`,
    remaining: (n) => (n === 1 ? 'Te queda 1 simulación este mes.' : `Te quedan ${n} simulaciones este mes.`),
    usageUnavailable: 'No se ha podido cargar tu uso de este mes.',
    limitReached: 'Has alcanzado el límite de simulaciones de este mes. Podrás generar nuevas simulaciones cuando se renueve tu cupo mensual.',
    emptyTitle: 'Practica una situación con un cliente.',
    emptyBody: 'Selecciona un escenario o describe una situación concreta.',
    customerLabel: 'Cliente',
    responseLabel: 'Respuesta recomendada',
    whyLabel: 'Por qué funciona',
    tipLabel: 'Consejo',
    factsLabel: 'Datos de tu negocio utilizados',
    facts: {
      name: 'Nombre', category: 'Actividad', city: 'Ciudad', services: 'Servicios', target_audience: 'Público',
      primary_goal: 'Objetivo principal', secondary_goals: 'Otros objetivos', website: 'Web', phone: 'Teléfono', schedule: 'Horario',
    },
    disclaimer: 'Esta conversación es una simulación generada por IA para ayudarte a practicar. No representa una conversación real con un cliente.',
    copy: 'Copiar respuesta',
    copied: 'Copiada',
    copyFailed: 'No se ha podido copiar. Selecciona el texto manualmente.',
    notSaved: 'Las simulaciones no se guardan. Copia la respuesta si quieres conservarla.',
    missingNote: 'Completa los servicios y el horario de tu negocio para obtener respuestas más concretas.',
    goToBusiness: 'Completar mi negocio',
    loading: 'Cargando…',
    noBusiness: 'No hemos podido cargar tu negocio. Recarga la página o inténtalo más tarde.',
    billingUnknown: 'No hemos podido comprobar tu plan. Recarga la página en unos segundos.',
    premiumTitle: 'Voice Simulator está incluido en Premium',
    premiumBody: 'Activa Premium o tu periodo de prueba para practicar conversaciones con clientes.',
    premiumCta: 'Ver planes',
    errors: {
      profile_incomplete: 'Añade al menos el nombre o la actividad de tu negocio para generar simulaciones.',
      voice_limit: 'Has alcanzado el límite de simulaciones de este mes.',
      global_limit: 'Has alcanzado el límite mensual total de uso de IA de tu plan.',
      ai_unavailable: 'El servicio de IA no está disponible ahora mismo. No se ha descontado ningún uso. Inténtalo de nuevo en unos minutos.',
      ai_busy: 'El servicio de IA está saturado. No se ha descontado ningún uso. Inténtalo de nuevo en unos minutos.',
      ai_timeout: 'La simulación ha tardado demasiado. No se ha descontado ningún uso. Inténtalo de nuevo.',
      generation_failed: 'No hemos podido generar una simulación fiable con esta situación. Prueba a reformularla.',
      premium_required: 'Esta herramienta está incluida en el plan Premium o en tu periodo de prueba.',
      rate_limited: 'Has hecho muchas solicitudes seguidas. Espera un momento antes de volver a intentarlo.',
      unauthorized: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
      invalid_input: 'No hemos podido procesar la solicitud. Revisa los datos e inténtalo de nuevo.',
      scenario_invalid: 'Selecciona una situación válida.',
      custom_empty: 'Describe la situación con un poco más de detalle.',
      custom_too_long: 'La descripción es demasiado larga.',
      payload_too_large: 'La descripción es demasiado larga.',
      duplicate_request: 'Esta solicitud ya se ha procesado. Inténtalo de nuevo.',
      not_found: 'No hemos encontrado tu negocio.',
      unavailable: 'No se ha podido generar la simulación. Inténtalo de nuevo más tarde.',
    },
  },
  en: {
    back: 'Tools',
    title: 'Voice Simulator',
    subtitle: 'Practise customer conversations and prepare better replies.',
    badge: 'AI simulation',
    intro: 'Simulate customer conversations and practise replies tailored to your business.',
    scenarioTitle: 'Choose a situation',
    scenarios: {
      general_inquiry: { label: 'General inquiry', hint: 'What you do and how you work' },
      price_request: { label: 'Price request', hint: 'How much a service costs' },
      price_objection: { label: 'Price objection', hint: 'Thinks it is expensive' },
      quote_request: { label: 'Quote request', hint: 'Wants a quote' },
      undecided: { label: 'Undecided customer', hint: 'Unsure what to choose' },
      booking: { label: 'Booking or appointment', hint: 'Wants to book' },
      service_inquiry: { label: 'Service inquiry', hint: 'Asks about a specific service' },
      unhappy_customer: { label: 'Unhappy customer', hint: 'Has a complaint' },
      follow_up: { label: 'Follow-up', hint: 'Get back in touch' },
      custom: { label: 'Custom', hint: 'Describe the situation' },
    },
    customLabel: 'Describe the situation',
    customLabelOptional: 'Add details (optional)',
    placeholder: 'E.g. A customer asks whether we can see them this week for a check-up.',
    count: (n, max) => `${n}/${max}`,
    privacy: 'Do not enter sensitive personal customer data.',
    examplesTitle: 'Quick examples',
    examples: [
      { text: 'A customer asks for the price.', scenario: 'price_request' },
      { text: 'A customer says it seems expensive.', scenario: 'price_objection' },
      { text: 'A customer wants to know which service to choose.', scenario: 'undecided' },
    ],
    generate: 'Generate simulation',
    generating: 'Generating simulation…',
    regenerate: 'Generate another reply',
    regenerateNote: 'Each new simulation uses 1 credit.',
    usage: (used, limit) => `AI simulations ${used} / ${limit} used`,
    remaining: (n) => (n === 1 ? '1 simulation left this month.' : `${n} simulations left this month.`),
    usageUnavailable: "We couldn't load your usage for this month.",
    limitReached: "You've reached this month's simulation limit. You can generate new simulations when your monthly allowance renews.",
    emptyTitle: 'Practise a situation with a customer.',
    emptyBody: 'Select a scenario or describe a specific situation.',
    customerLabel: 'Customer',
    responseLabel: 'Recommended reply',
    whyLabel: 'Why it works',
    tipLabel: 'Tip',
    factsLabel: 'Business details used',
    facts: {
      name: 'Name', category: 'Activity', city: 'City', services: 'Services', target_audience: 'Audience',
      primary_goal: 'Main goal', secondary_goals: 'Other goals', website: 'Website', phone: 'Phone', schedule: 'Opening hours',
    },
    disclaimer: 'This conversation is an AI-generated simulation to help you practise. It does not represent a real conversation with a customer.',
    copy: 'Copy reply',
    copied: 'Copied',
    copyFailed: "Couldn't copy. Select the text manually.",
    notSaved: 'Simulations are not saved. Copy the reply if you want to keep it.',
    missingNote: 'Add your services and opening hours to get more specific replies.',
    goToBusiness: 'Complete my business',
    loading: 'Loading…',
    noBusiness: "We couldn't load your business. Reload the page or try again later.",
    billingUnknown: "We couldn't check your plan. Reload the page in a few seconds.",
    premiumTitle: 'Voice Simulator is included in Premium',
    premiumBody: 'Activate Premium or your trial to practise customer conversations.',
    premiumCta: 'See plans',
    errors: {
      profile_incomplete: 'Add at least your business name or activity to generate simulations.',
      voice_limit: "You've reached this month's simulation limit.",
      global_limit: "You've reached your plan's total monthly AI usage limit.",
      ai_unavailable: 'The AI service is unavailable right now. No credit was used. Try again in a few minutes.',
      ai_busy: 'The AI service is busy. No credit was used. Try again in a few minutes.',
      ai_timeout: 'The simulation took too long. No credit was used. Please try again.',
      generation_failed: "We couldn't generate a reliable simulation for this situation. Try rephrasing it.",
      premium_required: 'This tool is included in Premium or your trial period.',
      rate_limited: "You've made many requests in a row. Wait a moment before trying again.",
      unauthorized: 'Your session has expired. Please sign in again.',
      invalid_input: "We couldn't process the request. Check the details and try again.",
      scenario_invalid: 'Select a valid situation.',
      custom_empty: 'Describe the situation in a bit more detail.',
      custom_too_long: 'The description is too long.',
      payload_too_large: 'The description is too long.',
      duplicate_request: 'This request was already processed. Please try again.',
      not_found: "We couldn't find your business.",
      unavailable: "The simulation couldn't be generated. Please try again later.",
    },
  },
};
