// Same sessionStorage key the landing writes before opening signup.
const PENDING_BUSINESS_KEY = 'pending_business_name';
export const PENDING_BUSINESS_META_KEY = 'pending_business_name';
const MAX_LENGTH = 120;

function clean(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const v = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH);
  return v || null;
}

export function peekPendingBusinessName(): string | null {
  try {
    return clean(sessionStorage.getItem(PENDING_BUSINESS_KEY));
  } catch {
    return null;
  }
}

/** Signup metadata hint so the name survives a confirmation link opened in another tab or device. */
export function pendingBusinessMetadata(name: string | null): Record<string, string> {
  const v = clean(name);
  return v ? { [PENDING_BUSINESS_META_KEY]: v } : {};
}

/** user_metadata is user-editable: only ever used to prefill the onboarding form. */
export function pendingBusinessFromMetadata(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  return clean((metadata as Record<string, unknown>)[PENDING_BUSINESS_META_KEY]);
}
