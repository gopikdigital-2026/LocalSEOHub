import { normalizeGbp, type GbpSnapshot } from '../../maps-scanner/engine';

// Fixture data only. No real Google, Stripe or AI call is made.

export const FULL = {
  name: 'Gopik.Digital', category: 'Agencia de marketing', city: 'Marbella', phone: '+34 600 123 456',
  website: 'https://www.gopik.digital/', schedule: 'L-V 9:00-18:00', services: ['Diseño web', 'SEO local', 'Redes sociales'],
  target_audience: 'Pequeños negocios locales', primary_goal: 'more_calls',
};
export const EMPTY = {};
export const MINIMAL = { name: 'Bar Pepe', category: 'Bar' };
export const PARTIAL = { name: 'Bar Pepe', category: 'Bar', city: 'Málaga', services: ['Tapas'] };

const VERIFIED = {
  name: 'Gopik.Digital', category: 'Marketing', address: 'Calle 1, Marbella', phone: '+34 600 123 456',
  website: 'https://gopik.digital', hours: [{ d: 1 }],
};
export const OFF: GbpSnapshot = normalizeGbp(null);
export const ERR: GbpSnapshot = normalizeGbp({ status: 'error' });
export const ON: GbpSnapshot = normalizeGbp({
  status: 'connected', verified_at: '2026-10-10T09:30:00.000Z', verified_profile: { ...VERIFIED, totalReviews: 0 },
});
export const ON_REVIEWED: GbpSnapshot = normalizeGbp({
  status: 'connected', verified_at: '2026-10-10T09:30:00.000Z', verified_profile: { ...VERIFIED, totalReviews: 12 },
});

export const without = (k: keyof typeof FULL) => ({ ...FULL, [k]: k === 'services' ? [] : '' });
