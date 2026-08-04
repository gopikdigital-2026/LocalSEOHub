import type { SourceRegistryEntry } from './types';

export const SOURCE_REGISTRY: SourceRegistryEntry[] = [
  {
    id: 'google_business',
    name: 'Google Business Profile',
    description: 'Importa nombre, categoria, direccion, horarios, rating y resenas de tu ficha de Google.',
    icon: 'map-pin',
    comingSoon: false,
    requiresOAuth: true,
  },
  {
    id: 'website',
    name: 'Sitio web',
    description: 'Analiza HTTPS, titulo, meta description, H1, robots.txt, sitemap y schema basico.',
    icon: 'globe',
    comingSoon: false,
    requiresOAuth: false,
  },
  {
    id: 'reviews',
    name: 'Resenas de Google',
    description: 'Importa resenas, ratings y estado de respuesta desde tu ficha de Google.',
    icon: 'star',
    comingSoon: false,
    requiresOAuth: true,
    dependsOn: 'google_business',
  },
  {
    id: 'search_console',
    name: 'Google Search Console',
    description: 'Permitira analizar busquedas, impresiones y posiciones.',
    icon: 'search',
    comingSoon: true,
    requiresOAuth: true,
  },
  {
    id: 'analytics',
    name: 'Google Analytics',
    description: 'Permitira analizar trafico y conversiones.',
    icon: 'bar-chart-2',
    comingSoon: true,
    requiresOAuth: true,
  },
  {
    id: 'manual',
    name: 'Entrada manual',
    description: 'Completa servicios, publico objetivo, diferenciadores, promociones, FAQs y tono.',
    icon: 'pen-line',
    comingSoon: false,
    requiresOAuth: false,
  },
];

export function getSourceEntry(id: string): SourceRegistryEntry | undefined {
  return SOURCE_REGISTRY.find(s => s.id === id);
}
