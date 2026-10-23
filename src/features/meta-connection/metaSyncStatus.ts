export type SyncPlatform = 'facebook' | 'instagram';

export interface MetaSyncStateRow {
  platform: SyncPlatform;
  status: string;
  error_code: string | null;
  item_count: number | null;
  last_success_at: string | null;
  last_attempt_at: string | null;
}

export type SyncResult =
  | { ok: true }
  | { ok: false; code: string };

export const META_SYNC_COPY = {
  es: {
    sync: 'Sincronizar',
    syncing: 'Sincronizando…',
    never: 'Aún no sincronizado',
    notLinked: 'Sin cuenta vinculada',
    items: (n: number, p: SyncPlatform) => `${n} ${p === 'facebook' ? (n === 1 ? 'publicación' : 'publicaciones') : (n === 1 ? 'contenido' : 'contenidos')}`,
    empty: 'Sin publicaciones recientes',
    lastSync: 'Última sincronización',
    staleNote: 'Datos de la última sincronización correcta',
    noData: 'Sin datos sincronizados',
    status: {
      permission_unavailable: 'Meta no concedió permiso para leer este contenido',
      reauth_required: 'Debes volver a conectar con Meta',
      rate_limited: 'Meta limitó temporalmente las consultas. Inténtalo más tarde',
      malformed: 'Meta devolvió una respuesta no válida',
      api_error: 'No se pudo leer de Meta',
    } as Record<string, string>,
    cooldown: 'Acabas de sincronizar. Espera un minuto antes de volver a intentarlo.',
    failed: 'No se pudo sincronizar. Inténtalo de nuevo.',
  },
  en: {
    sync: 'Sync',
    syncing: 'Syncing…',
    never: 'Not synced yet',
    notLinked: 'No linked account',
    items: (n: number, p: SyncPlatform) => `${n} ${p === 'facebook' ? (n === 1 ? 'post' : 'posts') : (n === 1 ? 'item' : 'items')}`,
    empty: 'No recent posts',
    lastSync: 'Last sync',
    staleNote: 'Data from the last successful sync',
    noData: 'No synced data',
    status: {
      permission_unavailable: 'Meta did not grant permission to read this content',
      reauth_required: 'You need to reconnect with Meta',
      rate_limited: 'Meta is temporarily limiting requests. Try again later',
      malformed: 'Meta returned an invalid response',
      api_error: 'Could not read from Meta',
    } as Record<string, string>,
    cooldown: 'You just synced. Wait a minute before trying again.',
    failed: 'Sync failed. Please try again.',
  },
} as const;

export interface SyncLine {
  tone: 'ok' | 'muted' | 'warning';
  summary: string;
  detail: string | null;
}

function formatDate(iso: string | null, lang: 'es' | 'en'): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function syncLine(row: MetaSyncStateRow | undefined, platform: SyncPlatform, lang: 'es' | 'en'): SyncLine {
  const t = META_SYNC_COPY[lang];
  if (!row || row.status === 'never') return { tone: 'muted', summary: t.never, detail: null };
  if (row.status === 'not_linked') return { tone: 'muted', summary: t.notLinked, detail: null };
  const success = formatDate(row.last_success_at, lang);
  if (row.status === 'ok' || row.status === 'empty') {
    const summary = row.item_count && row.item_count > 0 ? t.items(row.item_count, platform) : t.empty;
    return { tone: 'ok', summary, detail: success ? `${t.lastSync}: ${success}` : null };
  }
  const reason = t.status[row.status] ?? t.status.api_error;
  if (!success) return { tone: 'warning', summary: reason, detail: t.noData };
  const kept = row.item_count != null ? ` (${t.items(row.item_count, platform)})` : '';
  return { tone: 'warning', summary: reason, detail: `${t.staleNote}: ${success}${kept}` };
}
