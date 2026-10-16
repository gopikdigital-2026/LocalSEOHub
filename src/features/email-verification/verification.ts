import { isValidEmail, type AuthErrorLike } from '../password-reset/recovery';

export const VERIFY_REDIRECT_PATH = '/login';

export type VerificationLinkProblem = 'expired' | 'invalid';

/**
 * Detects a failed email-link landing on the sign-in page. A successful link needs no
 * handling here: the Supabase client turns it into a session, and nothing in the URL is
 * trusted to mean "verified" or "premium".
 */
export function captureVerificationLinkProblem(href: string): VerificationLinkProblem | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname !== VERIFY_REDIRECT_PATH) return null;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const get = (key: string) => hash.get(key) ?? url.searchParams.get(key);
  if (get('type') === 'recovery') return null;
  if (!get('error') && !get('error_code') && !get('error_description')) return null;
  return get('error_code') === 'otp_expired' ? 'expired' : 'invalid';
}

export function verificationRedirectUrl(origin: string): string {
  return `${origin}${VERIFY_REDIRECT_PATH}`;
}

export function isEmailNotConfirmed(error: AuthErrorLike | null): boolean {
  if (!error) return false;
  return error.code === 'email_not_confirmed' || /email not confirmed/i.test(error.message ?? '');
}

export type ResendOutcome = 'sent' | 'rate_limited' | 'invalid_email' | 'error';

// Account-specific answers (unknown, already confirmed, per-address send limit) all read as
// "sent", so the screen never reveals whether an address is registered or confirmed.
const NEUTRAL_CODES = new Set([
  'over_email_send_rate_limit',
  'user_not_found',
  'email_exists',
  'user_already_exists',
  'email_not_confirmed',
]);

export function classifyResendError(error: AuthErrorLike | null): ResendOutcome {
  if (!error) return 'sent';
  if (error.code && NEUTRAL_CODES.has(error.code)) return 'sent';
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'rate_limited';
  if (error.code === 'email_address_invalid' || error.code === 'validation_failed') return 'invalid_email';
  return 'error';
}

export interface ResendAuthClient {
  resend(params: { type: 'signup'; email: string; options: { emailRedirectTo: string } }): Promise<{ error: AuthErrorLike | null }>;
}

export async function requestVerificationResend(
  client: ResendAuthClient,
  email: string,
  origin: string,
): Promise<ResendOutcome> {
  if (!isValidEmail(email)) return 'invalid_email';
  try {
    const { error } = await client.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: verificationRedirectUrl(origin) },
    });
    return classifyResendError(error);
  } catch {
    return 'error';
  }
}
