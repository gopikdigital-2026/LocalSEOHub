export const RESET_PASSWORD_PATH = '/reset-password';
export const RESEND_COOLDOWN_SECONDS = 60;
export const PASSWORD_MIN_LENGTH = 6;
// Supabase Auth hashes with bcrypt, which rejects passwords longer than 72 characters.
export const PASSWORD_MAX_LENGTH = 72;

export interface AuthErrorLike {
  message?: string;
  status?: number;
  code?: string;
  name?: string;
  reasons?: string[];
}

interface Result {
  error: AuthErrorLike | null;
}

interface SessionResult {
  data: { session: unknown | null } | null;
  error: AuthErrorLike | null;
}

/** The subset of `supabase.auth` used by the recovery flow. */
export interface RecoveryAuthClient {
  resetPasswordForEmail(email: string, options: { redirectTo: string }): Promise<Result>;
  getSession(): Promise<SessionResult>;
  verifyOtp(params: { token_hash: string; type: 'recovery' }): Promise<SessionResult>;
  exchangeCodeForSession(code: string): Promise<SessionResult>;
  updateUser(attributes: { password: string }): Promise<Result>;
  signOut(options: { scope: 'global' | 'local' }): Promise<Result>;
}

export type InvalidReason = 'expired' | 'invalid' | 'missing';

export type RecoveryLink =
  | { kind: 'implicit' }
  | { kind: 'token_hash'; tokenHash: string }
  | { kind: 'code'; code: string }
  | { kind: 'error'; reason: Exclude<InvalidReason, 'missing'> };

/**
 * Reads the recovery data Supabase appends to the redirect URL. Must run at app start:
 * the Supabase client strips the hash once it has processed it.
 */
export function captureRecoveryLink(href: string): RecoveryLink | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
  const query = url.searchParams;
  const get = (key: string) => hash.get(key) ?? query.get(key);

  if (get('type') === 'recovery') {
    if (hash.get('access_token')) return { kind: 'implicit' };
    const tokenHash = query.get('token_hash');
    if (tokenHash) return { kind: 'token_hash', tokenHash };
  }

  if (url.pathname !== RESET_PASSWORD_PATH) return null;

  if (get('error') || get('error_code') || get('error_description')) {
    return { kind: 'error', reason: get('error_code') === 'otp_expired' ? 'expired' : 'invalid' };
  }
  if (hash.get('access_token') || query.get('token_hash')) return { kind: 'error', reason: 'invalid' };
  const code = query.get('code');
  if (code) return { kind: 'code', code };
  return null;
}

export function resetRedirectUrl(origin: string): string {
  return `${origin}${RESET_PASSWORD_PATH}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(raw: string): boolean {
  const email = raw.trim();
  return email.length > 0 && email.length <= 254 && EMAIL_PATTERN.test(email);
}

export type ResetRequestOutcome = 'sent' | 'rate_limited' | 'invalid_email' | 'error';

/**
 * Supabase answers 200 for unknown addresses, but its per-address send limits
 * (`over_email_send_rate_limit`) only trigger for existing accounts. Those are reported
 * as `sent` so the screen never reveals whether an address is registered. The IP-level
 * limit is checked before any account lookup, so it is safe to surface.
 */
export function classifyResetRequestError(error: AuthErrorLike | null): ResetRequestOutcome {
  if (!error) return 'sent';
  if (error.code === 'over_email_send_rate_limit') return 'sent';
  if (error.code === 'over_request_rate_limit' || error.status === 429) return 'rate_limited';
  if (error.code === 'email_address_invalid' || error.code === 'validation_failed') return 'invalid_email';
  return 'error';
}

export async function requestPasswordReset(
  client: RecoveryAuthClient,
  email: string,
  origin: string,
): Promise<ResetRequestOutcome> {
  if (!isValidEmail(email)) return 'invalid_email';
  try {
    const { error } = await client.resetPasswordForEmail(email.trim(), { redirectTo: resetRedirectUrl(origin) });
    return classifyResetRequestError(error);
  } catch {
    return 'error';
  }
}

export type RecoveryCheck = { ok: true } | { ok: false; reason: InvalidReason };

function linkErrorReason(error: AuthErrorLike): Exclude<InvalidReason, 'missing'> {
  return error.code === 'otp_expired' || error.code === 'flow_state_expired' ? 'expired' : 'invalid';
}

export async function establishRecoverySession(
  client: RecoveryAuthClient,
  link: RecoveryLink | null,
): Promise<RecoveryCheck> {
  if (!link) return { ok: false, reason: 'missing' };
  if (link.kind === 'error') return { ok: false, reason: link.reason };
  try {
    const { data, error } =
      link.kind === 'implicit'
        ? await client.getSession()
        : link.kind === 'token_hash'
          ? await client.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' })
          : await client.exchangeCodeForSession(link.code);
    if (error) return { ok: false, reason: linkErrorReason(error) };
    if (!data?.session) return { ok: false, reason: 'invalid' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'invalid' };
  }
}

export type PasswordProblem = 'too_short' | 'too_long' | 'mismatch';

export function validateNewPassword(password: string, confirmation: string): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return 'too_short';
  if (password.length > PASSWORD_MAX_LENGTH) return 'too_long';
  if (password !== confirmation) return 'mismatch';
  return null;
}

export type WeakReason = 'length' | 'characters' | 'pwned';

export type UpdateOutcome =
  | { ok: true }
  | { ok: false; problem: 'weak'; reasons: WeakReason[] }
  | { ok: false; problem: 'same' | 'session' | 'rate_limited' | 'error' };

const SESSION_CODES = ['session_not_found', 'session_expired', 'bad_jwt', 'no_authorization', 'user_not_found', 'reauthentication_needed'];
const WEAK_REASONS: WeakReason[] = ['length', 'characters', 'pwned'];

export function classifyUpdateError(error: AuthErrorLike): UpdateOutcome {
  if (error.code === 'weak_password') {
    const reasons = (error.reasons ?? []).filter((r): r is WeakReason => (WEAK_REASONS as string[]).includes(r));
    return { ok: false, problem: 'weak', reasons };
  }
  if (error.code === 'same_password') return { ok: false, problem: 'same' };
  if (error.status === 429 || error.code === 'over_request_rate_limit') return { ok: false, problem: 'rate_limited' };
  if (
    error.name === 'AuthSessionMissingError' ||
    (error.code && SESSION_CODES.includes(error.code)) ||
    error.status === 401 ||
    error.status === 403
  ) {
    return { ok: false, problem: 'session' };
  }
  return { ok: false, problem: 'error' };
}

export async function updateRecoveredPassword(client: RecoveryAuthClient, password: string): Promise<UpdateOutcome> {
  try {
    const { error } = await client.updateUser({ password });
    return error ? classifyUpdateError(error) : { ok: true };
  } catch {
    return { ok: false, problem: 'error' };
  }
}

/**
 * Ends every session of the account after a reset, so a session opened by whoever
 * knew the old password does not survive. Falls back to clearing this browser only.
 */
export async function endSessionsAfterReset(client: RecoveryAuthClient): Promise<void> {
  try {
    const { error } = await client.signOut({ scope: 'global' });
    if (!error) return;
  } catch {
    // fall through to the local sign-out
  }
  try {
    await client.signOut({ scope: 'local' });
  } catch {
    // the local session is already unusable for this page; nothing else to do
  }
}
