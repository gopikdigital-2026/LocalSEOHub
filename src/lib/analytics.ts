const SESSION_KEY = 'ls_sid';
const GOOGLE_INTENT_KEY = '_ga_intent';

function getSessionId(): string {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

// Read the Supabase session synchronously from localStorage so this works even
// during page unload (where async getSession() would be cancelled).
function getStoredUserId(): string | null {
  try {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith('sb-') && k.endsWith('-auth-token')
    );
    if (!key) return null;
    const data = JSON.parse(localStorage.getItem(key) ?? '{}');
    return data?.user?.id ?? null;
  } catch {
    return null;
  }
}

function detectDevice(): 'mobile' | 'tablet' | 'desktop' {
  const ua = navigator.userAgent;
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|iphone|ipod|android.*mobile|blackberry|windows phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari';
  return 'Other';
}

// Lazily cached so UA parsing runs once per session
let _device: ReturnType<typeof detectDevice> | null = null;
let _browser: string | null = null;
function getDeviceInfo() {
  if (!_device) _device = detectDevice();
  if (!_browser) _browser = detectBrowser();
  return { device_type: _device, browser: _browser };
}

// Uses fetch with keepalive:true so the request survives page unloads (e.g.
// when a Google OAuth redirect fires immediately after the click event).
export function track(eventName: string, properties: Record<string, unknown> = {}) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/analytics_events`;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

  fetch(url, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      session_id: getSessionId(),
      user_id: getStoredUserId(),
      event_name: eventName,
      properties: { ...getDeviceInfo(), ...properties },
    }),
  }).catch(() => {});
}

// Call this immediately before triggering Google OAuth redirect.
// Stores the intent in localStorage so it can be flushed on the next page load
// if the keepalive fetch didn't survive the navigation.
export function storeGoogleIntent(context: string) {
  try {
    localStorage.setItem(GOOGLE_INTENT_KEY, JSON.stringify({ context, ts: Date.now() }));
  } catch { /* ignore */ }
}

// Flush any Google OAuth intent stored before a redirect (runs once on module load).
function flushGoogleIntent() {
  try {
    const raw = localStorage.getItem(GOOGLE_INTENT_KEY);
    if (!raw) return;
    const intent = JSON.parse(raw) as { context: string; ts: number };
    localStorage.removeItem(GOOGLE_INTENT_KEY);
    // Only flush if the redirect happened within the last 3 minutes
    if (Date.now() - intent.ts < 180_000) {
      track('google_auth_attempted', { context: intent.context, elapsed_ms: Date.now() - intent.ts });
    }
  } catch { /* ignore */ }
}

flushGoogleIntent();
