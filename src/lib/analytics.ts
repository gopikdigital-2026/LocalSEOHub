import { supabase } from './supabase';

const SESSION_KEY = 'ls_sid';

function getSessionId(): string {
  let sid = localStorage.getItem(SESSION_KEY);
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, sid);
  }
  return sid;
}

// Fire-and-forget — never throws, never blocks the UI
export function track(eventName: string, properties: Record<string, unknown> = {}) {
  const sessionId = getSessionId();
  supabase.auth.getSession().then(({ data: { session } }) => {
    // Must call .then() to actually execute the lazy Supabase query
    supabase.from('analytics_events').insert({
      session_id: sessionId,
      user_id: session?.user?.id ?? null,
      event_name: eventName,
      properties,
    }).then(() => {});
  }).catch(() => {});
}
