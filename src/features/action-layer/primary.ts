import type { Lang } from '../../lib/i18n';
import type { ActionItem, ActionKey } from './model';

/** Field anchors match the input ids rendered by BusinessProfilePage, so a link can land on the exact field. */
export const PROFILE_ANCHORS = {
  name: 'profile-name', category: 'profile-category', city: 'profile-city', phone: 'profile-phone',
  website: 'profile-website', schedule: 'profile-schedule', services: 'profile-service-input', audience: 'profile-targetAudience',
} as const;

const profile = (field: keyof typeof PROFILE_ANCHORS) => `/negocio#${PROFILE_ANCHORS[field]}`;

// One fix per problem: Maps, Twin and GEO send the same gap to the same place. Keys absent here keep the tool's own link.
export const CANONICAL_TARGETS: Partial<Record<ActionKey, string>> = {
  identity: profile('name'), activity: profile('category'), city: profile('city'), phone: profile('phone'),
  website: profile('website'), hours: profile('schedule'), services: profile('services'), audience: profile('audience'),
  goal: '/negocio/objetivos', align_phone: profile('phone'), align_website: profile('website'),
  gbp_connect: '/fuentes', gbp_fix: '/fuentes', gbp_sync: '/fuentes', gbp_category: '/fuentes', align_sources: '/fuentes',
};

export const PRIMARY_CTA: Record<Lang, Partial<Record<ActionKey, string>>> = {
  es: {
    identity: 'Completar nombre', activity: 'Completar actividad', city: 'Añadir ciudad', phone: 'Añadir teléfono',
    website: 'Añadir sitio web', hours: 'Completar horario', services: 'Completar servicios', audience: 'Definir público objetivo',
    goal: 'Elegir objetivo', align_phone: 'Revisar teléfono', align_website: 'Revisar sitio web',
    gbp_connect: 'Revisar fuentes', gbp_fix: 'Revisar fuentes', gbp_sync: 'Revisar fuentes', gbp_category: 'Revisar fuentes', align_sources: 'Revisar fuentes',
  },
  en: {
    identity: 'Complete name', activity: 'Complete activity', city: 'Add city', phone: 'Add phone',
    website: 'Add website', hours: 'Complete opening hours', services: 'Complete services', audience: 'Define target audience',
    goal: 'Choose a goal', align_phone: 'Review phone', align_website: 'Review website',
    gbp_connect: 'Review sources', gbp_fix: 'Review sources', gbp_sync: 'Review sources', gbp_category: 'Review sources', align_sources: 'Review sources',
  },
};

/** Primary button of a diagnostic priority: the canonical fix when known, otherwise the tool's own link and label. */
export function primaryAction(lang: Lang, item: ActionItem | undefined, fallback: { to: string; label: string }) {
  if (!item) return fallback;
  return { to: CANONICAL_TARGETS[item.key] ?? fallback.to, label: PRIMARY_CTA[lang][item.key] ?? fallback.label };
}
