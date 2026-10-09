import type { SourceRegistryEntry } from './types';

export const SOURCE_REGISTRY: SourceRegistryEntry[] = [
  {
    id: 'google_business',
    name: 'Google Business Profile',
    nameEn: 'Google Business Profile',
    description: 'Importa nombre, categoría, dirección, horario y número de reseñas de tu ficha de Google.',
    descriptionEn: 'Imports name, category, address, opening hours and review count from your Google listing.',
    icon: 'map-pin',
    comingSoon: false,
    requiresOAuth: true,
  },
  {
    id: 'website',
    name: 'Sitio web',
    nameEn: 'Website',
    description: 'Revisa tu página principal: conexión segura (HTTPS), título, descripción para buscadores, encabezado, robots.txt, sitemap y datos estructurados.',
    descriptionEn: 'Checks your home page: secure connection (HTTPS), title, search description, heading, robots.txt, sitemap and structured data.',
    icon: 'globe',
    comingSoon: false,
    requiresOAuth: false,
  },
  {
    id: 'reviews',
    name: 'Reseñas de Google',
    nameEn: 'Google reviews',
    description: 'No es una conexión independiente: se activa sola al conectar Google Business Profile y muestra el número de reseñas de tu ficha.',
    descriptionEn: 'Not a separate connection: it turns on automatically when Google Business Profile is connected and shows your listing’s review count.',
    icon: 'star',
    comingSoon: false,
    requiresOAuth: true,
    dependsOn: 'google_business',
  },
  {
    id: 'search_console',
    name: 'Google Search Console',
    nameEn: 'Google Search Console',
    description: 'Permitirá analizar búsquedas, impresiones y posiciones. Todavía no está disponible.',
    descriptionEn: 'Will let us analyse searches, impressions and rankings. Not available yet.',
    icon: 'search',
    comingSoon: true,
    requiresOAuth: true,
  },
  {
    id: 'analytics',
    name: 'Google Analytics',
    nameEn: 'Google Analytics',
    description: 'Permitirá analizar tráfico y conversiones. Todavía no está disponible.',
    descriptionEn: 'Will let us analyse traffic and conversions. Not available yet.',
    icon: 'bar-chart-2',
    comingSoon: true,
    requiresOAuth: true,
  },
  {
    id: 'manual',
    name: 'Entrada manual',
    nameEn: 'Manual entry',
    description: 'Cuéntanos tus servicios, público, diferenciadores, promociones, preguntas frecuentes y tono. Son datos declarados por ti; no los verificamos.',
    descriptionEn: 'Tell us your services, audience, differentiators, promotions, FAQs and tone. This is information you declare; we do not verify it.',
    icon: 'pen-line',
    comingSoon: false,
    requiresOAuth: false,
  },
];

export function getSourceEntry(id: string): SourceRegistryEntry | undefined {
  return SOURCE_REGISTRY.find(s => s.id === id);
}
