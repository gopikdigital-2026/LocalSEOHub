import type { BusinessProfile } from './types';

export type ProfileField = 'name' | 'category' | 'city' | 'website' | 'phone' | 'schedule' | 'targetAudience' | 'services';
export type ProfileErrors = Partial<Record<ProfileField, string>>;
type Lang = 'es' | 'en';

// Kept in line with the length CHECK constraints on public.businesses.
export const PROFILE_LIMITS = { name: 200, category: 200, city: 200, website: 500, phone: 50, schedule: 500, targetAudience: 1000, service: 120, services: 30 } as const;

const MSG = {
  es: {
    required: 'Este campo es obligatorio.',
    tooLong: (n: number) => `Máximo ${n} caracteres.`,
    website: 'Escribe una dirección web válida, por ejemplo https://tunegocio.es',
    phone: 'Escribe un teléfono válido (solo números, espacios, +, guiones o paréntesis).',
    services: `Puedes añadir hasta ${PROFILE_LIMITS.services} servicios de ${PROFILE_LIMITS.service} caracteres como máximo.`,
  },
  en: {
    required: 'This field is required.',
    tooLong: (n: number) => `Maximum ${n} characters.`,
    website: 'Enter a valid web address, for example https://yourbusiness.com',
    phone: 'Enter a valid phone number (digits, spaces, +, dashes or brackets only).',
    services: `You can add up to ${PROFILE_LIMITS.services} services of at most ${PROFILE_LIMITS.service} characters.`,
  },
};

export function normalizeWebsite(raw: string): string {
  const value = raw.trim();
  if (!value) return '';
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

export function isValidWebsite(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname.includes('.') && !url.username && !url.password;
  } catch {
    return false;
  }
}

function isValidPhone(value: string): boolean {
  return /^[0-9+()\-.\s]+$/.test(value) && value.replace(/\D/g, '').length >= 6;
}

export function validateProfile(profile: BusinessProfile, lang: Lang): ProfileErrors {
  const m = MSG[lang];
  const errors: ProfileErrors = {};
  const text: [ProfileField, string, number, boolean][] = [
    ['name', profile.name, PROFILE_LIMITS.name, true],
    ['category', profile.category, PROFILE_LIMITS.category, true],
    ['city', profile.city, PROFILE_LIMITS.city, true],
    ['schedule', profile.schedule, PROFILE_LIMITS.schedule, false],
    ['targetAudience', profile.targetAudience, PROFILE_LIMITS.targetAudience, false],
  ];
  for (const [field, value, max, required] of text) {
    const v = value.trim();
    if (required && !v) errors[field] = m.required;
    else if (v.length > max) errors[field] = m.tooLong(max);
  }

  const website = normalizeWebsite(profile.website);
  if (website.length > PROFILE_LIMITS.website) errors.website = m.tooLong(PROFILE_LIMITS.website);
  else if (website && !isValidWebsite(website)) errors.website = m.website;

  const phone = profile.phone.trim();
  if (phone.length > PROFILE_LIMITS.phone) errors.phone = m.tooLong(PROFILE_LIMITS.phone);
  else if (phone && !isValidPhone(phone)) errors.phone = m.phone;

  if (profile.services.length > PROFILE_LIMITS.services || profile.services.some((s) => s.length > PROFILE_LIMITS.service)) {
    errors.services = m.services;
  }
  return errors;
}
