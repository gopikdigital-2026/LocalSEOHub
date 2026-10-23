import { fireOnce, trackCompleteRegistration } from '../../lib/pixel';

export interface RegistrationUser {
  id: string;
  email_confirmed_at?: string | null;
  last_sign_in_at?: string | null;
}

/** Confirmation and the sign-in it produced happen together; a returning login moves last_sign_in_at far past it. */
export const CONFIRMATION_SIGN_IN_WINDOW_MS = 10 * 60 * 1000;

const ms = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

/**
 * True only for the session created by a fresh, confirmed registration: email link confirmation or a
 * first Google sign-in (Google sets email_confirmed_at when the account is created). Uses server
 * timestamps only, so the device clock cannot influence it.
 */
export function isConfirmedRegistrationSession(user: RegistrationUser | null | undefined): boolean {
  if (!user?.id) return false;
  const confirmed = ms(user.email_confirmed_at);
  const signedIn = ms(user.last_sign_in_at);
  if (confirmed === null || signedIn === null) return false;
  return signedIn >= confirmed - 60_000 && signedIn - confirmed <= CONFIRMATION_SIGN_IN_WINDOW_MS;
}

export function registrationKey(userId: string) {
  return `pixel:complete_registration:${userId}`;
}

export function trackConfirmedRegistration(
  user: RegistrationUser | null | undefined,
  store?: Pick<Storage, 'getItem' | 'setItem'> | null,
): boolean {
  if (!user || !isConfirmedRegistrationSession(user)) return false;
  return fireOnce(registrationKey(user.id), () => trackCompleteRegistration(), store);
}
