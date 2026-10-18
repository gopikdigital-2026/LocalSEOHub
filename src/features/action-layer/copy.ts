import type { ActionKey, ActionTool, Consumer, SupportingTool } from './model';

type Entry = { why: string; next: string };

export interface ActionCopy {
  whyLabel: string;
  nextLabel: string;
  usedByLabel: string;
  supportingLabel: string;
  consumers: Record<Consumer, string>;
  supporting: Record<SupportingTool, string>;
  // Generic reasons per action; a tool can override the reason with its own context.
  actions: Record<ActionKey, Entry>;
  overrides: Partial<Record<ActionTool, Partial<Record<ActionKey, Partial<Entry>>>>>;
}

const es: ActionCopy = {
  whyLabel: 'Por qué importa',
  nextLabel: 'Siguiente paso',
  usedByLabel: 'También lo usan',
  supportingLabel: 'Te puede ayudar',
  consumers: {
    seo: 'Generador SEO', advisor: 'AI Business Advisor', voice: 'Voice Simulator',
    maps: 'Maps Profile Scanner', geo: 'GEO Audit', twin: 'AI Digital Twin',
  },
  supporting: {
    seo: 'Redactar una descripción de servicio',
    advisor: 'Pensarlo con el asesor',
  },
  actions: {
    identity: {
      why: 'Sin el nombre y la actividad, LocalSEOHub no puede saber qué negocio eres ni personalizar nada.',
      next: 'Escribe el nombre de tu negocio y a qué se dedica en Mi negocio.',
    },
    activity: {
      why: 'La actividad principal indica de qué tipo es tu negocio y orienta el resto de análisis.',
      next: 'Indica tu actividad con palabras sencillas, por ejemplo «peluquería» o «fontanero».',
    },
    city: {
      why: 'La ciudad o zona relaciona tu negocio con el lugar donde trabajas.',
      next: 'Indica la ciudad o el barrio donde atiendes a tus clientes.',
    },
    phone: {
      why: 'Un teléfono de contacto es uno de los datos prácticos que más buscan los clientes.',
      next: 'Añade el teléfono en el que atiendes a tus clientes.',
    },
    website: {
      why: 'Tu web es una referencia clara de quién eres y qué ofreces.',
      next: 'Añade la dirección completa de tu web. Si no tienes, puedes dejarlo para más adelante.',
    },
    hours: {
      why: 'El horario es información práctica que los clientes suelen consultar antes de ir o llamar.',
      next: 'Escribe tu horario habitual, por ejemplo «Lun–Vie 9:00–18:00».',
    },
    services: {
      why: 'Definir tus servicios ayuda a describir lo que realmente ofreces y permite recomendaciones más relacionadas con tu negocio.',
      next: 'Añade tus servicios principales, uno por línea, con nombres claros.',
    },
    audience: {
      why: 'Saber a quién te diriges permite adaptar mejor las recomendaciones y los textos.',
      next: 'Describe en una frase a tu cliente habitual, por ejemplo «familias del barrio».',
    },
    goal: {
      why: 'Tu objetivo principal indica qué quieres conseguir y ayuda a priorizar recomendaciones.',
      next: 'Elige el objetivo que más te importa ahora mismo.',
    },
    gbp_connect: {
      why: 'Sin la conexión, los datos de Google no se pueden comprobar y se muestran como «No comprobado».',
      next: 'Conecta tu perfil de Google Business Profile desde Fuentes.',
    },
    gbp_fix: {
      why: 'Mientras la conexión tenga un problema, los datos de Google no se pueden comprobar.',
      next: 'Revisa la conexión en Fuentes y vuelve a conectarla si hace falta.',
    },
    gbp_sync: {
      why: 'La conexión existe, pero todavía no hay datos de Google guardados para comprobar.',
      next: 'Sincroniza tu perfil desde Fuentes.',
    },
    gbp_category: {
      why: 'Google no ha devuelto una categoría para tu perfil, así que no podemos confirmarla.',
      next: 'Revisa la categoría directamente en tu perfil de Google y vuelve a sincronizar desde Fuentes.',
    },
    align_phone: {
      why: 'Si el teléfono es distinto en Google y en Mi negocio, un cliente puede dudar de cuál es el correcto.',
      next: 'Comprueba cuál es el teléfono correcto y usa el mismo en ambos sitios.',
    },
    align_website: {
      why: 'Si la web es distinta en Google y en Mi negocio, la información de tu negocio es menos clara.',
      next: 'Comprueba cuál es tu web correcta y usa la misma en ambos sitios.',
    },
    align_sources: {
      why: 'Datos coherentes entre fuentes facilitan identificar tu negocio sin confusión.',
      next: 'Revisa los datos marcados como distintos y usa los mismos en Mi negocio y en Google.',
    },
    reviews: {
      why: 'Google no muestra reseñas para tu perfil. LocalSEOHub no gestiona reseñas, solo lee el total que devuelve Google.',
      next: 'Pide a clientes recientes y satisfechos que dejen su opinión en Google.',
    },
    keep_fresh: {
      why: 'Los datos básicos ya están completos. Mantenerlos al día evita información desactualizada.',
      next: 'Revisa tus datos cuando algo cambie y publica sobre tus servicios con regularidad.',
    },
    keep_updated: {
      why: 'Tu Digital Twin ya tiene los datos principales. Solo es tan útil como lo actualizada que esté tu información.',
      next: 'Actualiza Mi negocio cuando cambien tus servicios, horario o contacto.',
    },
  },
  overrides: {
    twin: {
      services: { why: 'LocalSEOHub todavía no conoce bien tus servicios. Con ellos puede generar contenido y recomendaciones más relacionados con lo que ofreces.' },
      gbp_connect: { why: 'Sin la conexión, tu presencia en Google no forma parte de lo que LocalSEOHub conoce.' },
    },
  },
};

const en: ActionCopy = {
  whyLabel: 'Why it matters',
  nextLabel: 'Next step',
  usedByLabel: 'Also used by',
  supportingLabel: 'Can help',
  consumers: {
    seo: 'SEO Generator', advisor: 'AI Business Advisor', voice: 'Voice Simulator',
    maps: 'Maps Profile Scanner', geo: 'GEO Audit', twin: 'AI Digital Twin',
  },
  supporting: {
    seo: 'Draft a service description',
    advisor: 'Think it through with the advisor',
  },
  actions: {
    identity: {
      why: "Without a name and activity, LocalSEOHub can't tell what your business is or personalise anything.",
      next: 'Enter your business name and what it does in My business.',
    },
    activity: {
      why: 'Your main activity says what kind of business you are and guides the other checks.',
      next: 'Describe your activity in plain words, for example "hair salon" or "plumber".',
    },
    city: {
      why: 'Your city or area links your business to the place where you work.',
      next: 'Add the city or neighbourhood where you serve customers.',
    },
    phone: {
      why: 'A contact phone is one of the practical details customers look for most.',
      next: 'Add the phone number customers can reach you on.',
    },
    website: {
      why: 'Your website is a clear reference for who you are and what you offer.',
      next: "Add your full website address. If you don't have one, you can leave it for later.",
    },
    hours: {
      why: 'Opening hours are practical information customers often check before visiting or calling.',
      next: 'Enter your usual hours, for example "Mon–Fri 9:00–18:00".',
    },
    services: {
      why: 'Defining your services describes what you really offer and leads to recommendations more relevant to your business.',
      next: 'Add your main services, one per line, with clear names.',
    },
    audience: {
      why: 'Knowing who you serve helps tailor recommendations and texts.',
      next: 'Describe your typical customer in one sentence, for example "local families".',
    },
    goal: {
      why: 'Your main goal says what you want to achieve and helps prioritise recommendations.',
      next: 'Choose the goal that matters most to you right now.',
    },
    gbp_connect: {
      why: 'Without the connection, Google data cannot be checked and is shown as "Not checked".',
      next: 'Connect your Google Business Profile from Sources.',
    },
    gbp_fix: {
      why: "While the connection has a problem, Google data can't be checked.",
      next: 'Review the connection in Sources and reconnect if needed.',
    },
    gbp_sync: {
      why: 'The connection exists, but no Google data has been stored yet to check.',
      next: 'Sync your profile from Sources.',
    },
    gbp_category: {
      why: "Google didn't return a category for your profile, so we can't confirm it.",
      next: 'Check the category directly in your Google profile, then sync again from Sources.',
    },
    align_phone: {
      why: 'If the phone differs between Google and My business, customers may not know which one is right.',
      next: 'Check which phone is correct and use the same one in both places.',
    },
    align_website: {
      why: 'If the website differs between Google and My business, your business information is less clear.',
      next: 'Check which website is correct and use the same one in both places.',
    },
    align_sources: {
      why: 'Consistent details across sources make your business easier to identify without confusion.',
      next: 'Review the details marked as different and use the same ones in My business and on Google.',
    },
    reviews: {
      why: "Google shows no reviews for your profile. LocalSEOHub doesn't manage reviews; it only reads the total Google returns.",
      next: 'Ask recent, happy customers to leave their opinion on Google.',
    },
    keep_fresh: {
      why: 'Your basic details are complete. Keeping them current avoids outdated information.',
      next: 'Review your details when something changes and post about your services regularly.',
    },
    keep_updated: {
      why: 'Your Digital Twin has the main details. It is only as useful as your information is current.',
      next: 'Update My business when your services, hours or contact details change.',
    },
  },
  overrides: {
    twin: {
      services: { why: "LocalSEOHub doesn't know your services well yet. With them it can create content and recommendations closer to what you offer." },
      gbp_connect: { why: "Without the connection, your Google presence isn't part of what LocalSEOHub knows." },
    },
  },
};

export const ACTION_COPY = { es, en };

export function actionText(c: ActionCopy, tool: ActionTool, key: ActionKey): Entry {
  return { ...c.actions[key], ...c.overrides[tool]?.[key] };
}
