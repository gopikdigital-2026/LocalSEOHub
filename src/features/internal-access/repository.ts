import { supabase } from '../../lib/supabase';

export type InternalAccess = 'allowed' | 'denied';

export async function checkInternalAccess(): Promise<InternalAccess> {
  try {
    const { data, error } = await supabase.functions.invoke('internal-access', { body: {} });
    if (error) return 'denied';
    return data && typeof data === 'object' && (data as { allowed?: unknown }).allowed === true ? 'allowed' : 'denied';
  } catch {
    return 'denied';
  }
}
