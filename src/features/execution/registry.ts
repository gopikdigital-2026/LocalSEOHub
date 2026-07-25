import type { ActionType } from '../../domain/types';

export interface ActionRegistryEntry {
  id: string;
  actionTypes: ActionType[];
  label: string;
  description: string;
  icon: string;
}

const REGISTRY: ActionRegistryEntry[] = [
  {
    id: 'review',
    actionTypes: ['respond_reviews', 'request_reviews'],
    label: 'Resenas',
    description: 'Gestiona y responde resenas de clientes',
    icon: 'MessageSquare',
  },
  {
    id: 'post',
    actionTypes: ['publish_post'],
    label: 'Publicaciones',
    description: 'Crea y publica contenido en Google Business',
    icon: 'FileText',
  },
  {
    id: 'profile',
    actionTypes: ['update_description', 'add_photos', 'update_hours', 'optimize_profile'],
    label: 'Perfil',
    description: 'Optimiza tu perfil de negocio',
    icon: 'Building2',
  },
  {
    id: 'content',
    actionTypes: ['create_content', 'other'],
    label: 'Contenido',
    description: 'Crea contenido para tu presencia digital',
    icon: 'Sparkles',
  },
];

export function getRegistryEntry(actionType: ActionType): ActionRegistryEntry | undefined {
  return REGISTRY.find((entry) => entry.actionTypes.includes(actionType));
}

export function getRegistryEntryById(id: string): ActionRegistryEntry | undefined {
  return REGISTRY.find((entry) => entry.id === id);
}

export function getAllRegistryEntries(): ActionRegistryEntry[] {
  return REGISTRY;
}
