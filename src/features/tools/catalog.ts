export type ToolId = 'seo' | 'maps' | 'twin' | 'radar' | 'geo' | 'advisor' | 'voice';

// Internal audit status (A2.4.1). Never rendered in the UI.
export type ToolRecoveryStatus =
  | 'ACTIVE'
  | 'READY_FOR_SAFE_RECOVERY'
  | 'PARTIAL'
  | 'REQUIRES_REBUILD'
  | 'BLOCKED'
  | 'NO_IMPLEMENTATION_FOUND';

export type ToolDataKind = 'business_ai' | 'sources' | 'available_data' | 'user_input' | 'estimate' | 'simulation';

type Copy = { name: string; description: string; indicator: string };

interface ToolBase {
  id: ToolId;
  dataKind: ToolDataKind;
  recoveryStatus: ToolRecoveryStatus;
  legacyFunction: string | null;
  copy: { es: Copy; en: Copy };
}

export type ToolDefinition = ToolBase & ({ enabled: true; path: string } | { enabled: false; path?: never });

export const TOOLS: readonly ToolDefinition[] = [
  {
    id: 'seo',
    dataKind: 'business_ai',
    recoveryStatus: 'ACTIVE',
    legacyFunction: 'generate-seo',
    enabled: true,
    path: '/herramientas/seo',
    copy: {
      es: {
        name: 'Generador SEO',
        description: 'Crea contenido optimizado para tu negocio, servicios y ubicación.',
        indicator: 'Utiliza los datos de tu negocio + IA',
      },
      en: {
        name: 'SEO Generator',
        description: 'Create optimised content for your business, services and location.',
        indicator: 'Uses your business data + AI',
      },
    },
  },
  {
    id: 'maps',
    dataKind: 'sources',
    recoveryStatus: 'ACTIVE',
    legacyFunction: 'audit-maps-profile',
    enabled: true,
    path: '/herramientas/maps',
    copy: {
      es: {
        name: 'Maps Profile Scanner',
        description: 'Revisa la información disponible de tu presencia local y descubre qué puedes mejorar.',
        indicator: 'Precisión según las fuentes disponibles',
      },
      en: {
        name: 'Maps Profile Scanner',
        description: 'Review the available information about your local presence and find what you can improve.',
        indicator: 'Accuracy depends on the available sources',
      },
    },
  },
  {
    id: 'twin',
    dataKind: 'available_data',
    recoveryStatus: 'ACTIVE',
    legacyFunction: null,
    enabled: true,
    path: '/herramientas/twin',
    copy: {
      es: {
        name: 'AI Digital Twin',
        description: 'Obtén una representación estratégica de la presencia digital de tu negocio y detecta oportunidades de mejora.',
        indicator: 'Análisis basado en los datos disponibles',
      },
      en: {
        name: 'AI Digital Twin',
        description: "Get a strategic view of your business's digital presence and spot opportunities to improve.",
        indicator: 'Analysis based on the available data',
      },
    },
  },
  {
    id: 'radar',
    dataKind: 'user_input',
    recoveryStatus: 'ACTIVE',
    legacyFunction: 'analyze-competitor-url',
    enabled: true,
    path: '/herramientas/radar',
    copy: {
      es: {
        name: 'Competitor Radar',
        description: 'Compara tu presencia online con competidores que tú indiques y encuentra oportunidades.',
        indicator: 'No inventamos competidores',
      },
      en: {
        name: 'Competitor Radar',
        description: 'Compare your online presence with competitors you choose and find opportunities.',
        indicator: "We don't invent competitors",
      },
    },
  },
  {
    id: 'geo',
    dataKind: 'estimate',
    recoveryStatus: 'ACTIVE',
    legacyFunction: 'generate-geo-audit',
    enabled: true,
    path: '/herramientas/geo',
    copy: {
      es: {
        name: 'GEO Audit',
        description: 'Evalúa cómo está preparada la información de tu negocio para los nuevos entornos de búsqueda y asistentes de IA.',
        indicator: 'Evaluación orientativa, no ranking real en IA',
      },
      en: {
        name: 'GEO Audit',
        description: "Assess how ready your business information is for new search experiences and AI assistants.",
        indicator: 'Indicative assessment, not a real AI ranking',
      },
    },
  },
  {
    id: 'advisor',
    dataKind: 'business_ai',
    recoveryStatus: 'ACTIVE',
    legacyFunction: 'generate-business-audit',
    enabled: true,
    path: '/herramientas/advisor',
    copy: {
      es: {
        name: 'AI Business Advisor',
        description: 'Pregunta cómo mejorar tu negocio y recibe recomendaciones adaptadas a tu actividad, objetivo y situación.',
        indicator: 'Utiliza el contexto de tu negocio + IA',
      },
      en: {
        name: 'AI Business Advisor',
        description: 'Ask how to improve your business and get recommendations tailored to your activity, goal and situation.',
        indicator: 'Uses your business context + AI',
      },
    },
  },
  {
    id: 'voice',
    dataKind: 'simulation',
    recoveryStatus: 'ACTIVE',
    legacyFunction: 'generate-voice-script',
    enabled: true,
    path: '/herramientas/voice',
    copy: {
      es: {
        name: 'Voice Simulator',
        description: 'Simula conversaciones con clientes y practica respuestas adaptadas a tu negocio.',
        indicator: 'Simulación generada con IA',
      },
      en: {
        name: 'Voice Simulator',
        description: 'Simulate customer conversations and practise replies tailored to your business.',
        indicator: 'AI-generated simulation',
      },
    },
  },
];
