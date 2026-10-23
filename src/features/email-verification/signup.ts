import type { AuthErrorLike } from '../password-reset/recovery';
import { isValidEmail } from '../password-reset/recovery';
import { verificationRedirectUrl } from './verification';

export type SignupOutcome = 'verify' | 'signed_in' | 'rate_limited' | 'weak_password' | 'invalid_email' | 'error';

export interface SignUpAuthClient {
  signUp(params: {
    email: string;
    password: string;
    options: { emailRedirectTo: string; data?: Record<string, string> };
  }): Promise<{ data: { session: unknown | null } | null; error: AuthErrorLike | null }>;
}

// An already-registered address reads as "check your email", so signup never reveals account existence.
const NEUTRAL_CODES = new Set(['user_already_exists', 'email_exists']);

export function classifySignupError(error: AuthErrorLike): SignupOutcome {
  if (error.code && NEUTRAL_CODES.has(error.code)) return 'verify';
  if (/already registered/i.test(error.message ?? '')) return 'verify';
  if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || error.status === 429) return 'rate_limited';
  if (error.code === 'weak_password') return 'weak_password';
  if (error.code === 'email_address_invalid' || error.code === 'validation_failed') return 'invalid_email';
  return 'error';
}

/**
 * Standard Supabase signup. With Confirm email enabled there is no session until the
 * mailbox owner opens the link; a returned session only happens while it is disabled.
 */
export async function requestEmailSignup(
  client: SignUpAuthClient,
  email: string,
  password: string,
  origin: string,
  metadata: Record<string, string> = {},
): Promise<SignupOutcome> {
  if (!isValidEmail(email)) return 'invalid_email';
  try {
    const { data, error } = await client.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: verificationRedirectUrl(origin), data: metadata },
    });
    if (error) return classifySignupError(error);
    return data?.session ? 'signed_in' : 'verify';
  } catch {
    return 'error';
  }
}
