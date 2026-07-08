const SESSION_KEY = 'ls_sid';

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
      properties,
    }),
  }).catch(() => {});
}
