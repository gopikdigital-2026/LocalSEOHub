import type { DataSourceType } from '../../domain/types';
import type { SourceRegistryEntry, SourceId } from './types';

const REGISTRY: SourceRegistryEntry[] = [
  {
    id: 'google_business',
    name: 'Google Business Profile',
    description: 'Perfil de negocio, publicaciones, fotos y atributos.',
    icon: 'Building2',
    dataSourceType: 'google_business',
    defaultPermissions: ['read_profile', 'read_posts', 'read_photos'],
    connectLabel: 'Conectar Google Business',
    syncIntervalMinutes: 60,
  },
  {
    id: 'website',
    name: 'Sitio web',
    description: 'Analisis del contenido, estructura y SEO de tu pagina.',
    icon: 'Globe',
    dataSourceType: 'website',
    defaultPermissions: ['read_pages', 'read_meta'],
    connectLabel: 'Analizar sitio web',
    syncIntervalMinutes: 1440,
  },
  {
    id: 'reviews',
    name: 'Resenas de Google',
    description: 'Resenas, valoraciones y respuestas de tu perfil.',
    icon: 'MessageSquare',
    dataSourceType: 'reviews',
    defaultPermissions: ['read_reviews', 'read_ratings'],
    connectLabel: 'Conectar resenas',
    syncIntervalMinutes: 120,
  },
  {
    id: 'search_console',
    name: 'Google Search Console',
    description: 'Consultas de busqueda, impresiones y posicion media.',
    icon: 'Search',
    dataSourceType: 'google_business',
    defaultPermissions: ['read_queries', 'read_performance'],
    connectLabel: 'Conectar Search Console',
    syncIntervalMinutes: 1440,
  },
  {
    id: 'analytics',
    name: 'Google Analytics',
    description: 'Visitas, comportamiento de usuarios y conversiones.',
    icon: 'BarChart2',
    dataSourceType: 'website',
    defaultPermissions: ['read_traffic', 'read_events'],
    connectLabel: 'Conectar Analytics',
    syncIntervalMinutes: 1440,
  },
  {
    id: 'manual',
    name: 'Entrada manual',
    description: 'Datos introducidos directamente por ti.',
    icon: 'PenTool',
    dataSourceType: 'manual',
    defaultPermissions: ['read_write'],
    connectLabel: 'Siempre disponible',
    syncIntervalMinutes: 0,
  },
];

export function getSourceEntry(id: SourceId): SourceRegistryEntry | undefined {
  return REGISTRY.find((entry) => entry.id === id);
}

export function getAllSourceEntries(): SourceRegistryEntry[] {
  return REGISTRY;
}

export function getSourceEntriesByType(type: DataSourceType): SourceRegistryEntry[] {
  return REGISTRY.filter((entry) => entry.dataSourceType === type);
}

export function getSourceEntryByDataType(type: DataSourceType): SourceRegistryEntry | undefined {
  return REGISTRY.find((entry) => entry.dataSourceType === type);
}
