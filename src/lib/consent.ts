/**
 * Privacy consent for optional (non-essential) technologies: Meta Pixel and Microsoft Clarity.
 * Only the decision is stored — no identifiers, no personal data.
 */
export const CONSENT_KEY = 'lsh_privacy_consent';
export const CONSENT_VERSION = 1;

export interface ConsentDecision {
  version: typeof CONSENT_VERSION;
  advertising: boolean;
  decidedAt: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function consentStore(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** A missing, malformed or older-version record counts as "not decided", so the banner asks again. */
export function readConsent(store: Store | null = consentStore()): ConsentDecision | null {
  try {
    const raw = store?.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const { version, advertising, decidedAt } = parsed as Record<string, unknown>;
    if (version !== CONSENT_VERSION || typeof advertising !== 'boolean' || typeof decidedAt !== 'string') return null;
    return { version, advertising, decidedAt };
  } catch {
    return null;
  }
}

export function writeConsent(advertising: boolean, store: Store | null = consentStore(), now: Date = new Date()): ConsentDecision {
  const decision: ConsentDecision = { version: CONSENT_VERSION, advertising, decidedAt: now.toISOString() };
  try {
    store?.setItem(CONSENT_KEY, JSON.stringify(decision));
  } catch {
    // storage unavailable: the decision still applies to this page view
  }
  return decision;
}

export function hasAdvertisingConsent(store: Store | null = consentStore()): boolean {
  return readConsent(store)?.advertising === true;
}
