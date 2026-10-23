export type MetaConnectionStatus =
  | 'disconnected' | 'connecting' | 'authorized' | 'page_selection_required' | 'connected' | 'error' | 'reauth_required';

export type InstagramStatus = 'connected' | 'not_associated' | 'unsupported' | 'permission_unavailable' | 'api_error';

export interface MetaPage {
  id: string;
  name: string;
}

export interface MetaConnectionRow {
  status: MetaConnectionStatus;
  page_id: string | null;
  page_name: string | null;
  instagram_status: InstagramStatus | null;
  instagram_username: string | null;
  available_pages: MetaPage[];
  last_error: string | null;
  attempt_started_at: string | null;
  connected_at: string | null;
}

export type MetaView =
  | { kind: 'disconnected'; errorCode: string | null }
  | { kind: 'connecting' }
  | { kind: 'page_selection'; pages: MetaPage[] }
  | { kind: 'connected'; pageName: string; instagram: InstagramStatus; instagramUsername: string | null }
  | { kind: 'error'; errorCode: string | null }
  | { kind: 'reauth' };

export type InstagramOutcome =
  | 'INSTAGRAM_CONNECTED'
  | 'NO_INSTAGRAM_ACCOUNT_ASSOCIATED'
  | 'INSTAGRAM_NOT_PROFESSIONAL_OR_UNSUPPORTED'
  | 'INSTAGRAM_PERMISSION_UNAVAILABLE'
  | 'INSTAGRAM_API_ERROR';

// Mirrors the server: OAuth state TTL (10 min) plus 60 s grace.
export const META_STALE_ATTEMPT_MS = 11 * 60 * 1000;
export const META_POLL_MS = 30 * 1000;

export const INSTAGRAM_OUTCOME: Record<InstagramStatus, InstagramOutcome> = {
  connected: 'INSTAGRAM_CONNECTED',
  not_associated: 'NO_INSTAGRAM_ACCOUNT_ASSOCIATED',
  unsupported: 'INSTAGRAM_NOT_PROFESSIONAL_OR_UNSUPPORTED',
  permission_unavailable: 'INSTAGRAM_PERMISSION_UNAVAILABLE',
  api_error: 'INSTAGRAM_API_ERROR',
};

// A connection the browser cannot finish (lost tab, closed Meta window) never stays "Conectando…" forever.
export function metaView(row: MetaConnectionRow | null, now: Date = new Date()): MetaView {
  if (!row) return { kind: 'disconnected', errorCode: null };
  switch (row.status) {
    case 'connecting':
    case 'authorized': {
      const started = row.attempt_started_at ? Date.parse(row.attempt_started_at) : NaN;
      if (!Number.isFinite(started) || now.getTime() - started > META_STALE_ATTEMPT_MS) {
        return { kind: 'error', errorCode: 'OAUTH_STATE_EXPIRED' };
      }
      return { kind: 'connecting' };
    }
    case 'page_selection_required':
      return row.available_pages.length > 0
        ? { kind: 'page_selection', pages: row.available_pages }
        : { kind: 'error', errorCode: 'NO_AUTHORIZED_PAGES' };
    case 'connected':
      return {
        kind: 'connected',
        pageName: row.page_name ?? '',
        instagram: row.instagram_status ?? 'api_error',
        instagramUsername: row.instagram_username,
      };
    case 'reauth_required':
      return { kind: 'reauth' };
    case 'error':
      return { kind: 'error', errorCode: row.last_error };
    default:
      return { kind: 'disconnected', errorCode: row.last_error };
  }
}

type Lang = 'es' | 'en';

export const META_COPY = {
  es: {
    title: 'Facebook e Instagram',
    description: 'Conecta los perfiles sociales de tu negocio para que LocalSEOHub pueda analizar tu presencia y ayudarte a mejorarla.',
    connect: 'Conecta Facebook e Instagram',
    connecting: 'Conectando…',
    connectingHint: 'Si cerraste la ventana de Meta o no terminaste el permiso, puedes cancelar y volver a empezar.',
    cancelConnection: 'Cancelar conexión',
    retryConnection: 'Reintentar conexión',
    selectPage: 'Selecciona la página de tu negocio',
    selectPageHint: 'Tu cuenta gestiona varias páginas. Elige la que corresponde a este negocio.',
    choose: 'Elegir página',
    confirm: 'Usar esta página',
    cancel: 'Cancelar',
    facebook: 'Facebook',
    instagram: 'Instagram',
    noProfessional: 'No hay una cuenta profesional asociada',
    instagramUnsupported: 'La cuenta asociada no es profesional o no es compatible',
    instagramPermission: 'Falta el permiso para ver la cuenta de Instagram',
    instagramError: 'No se pudo consultar Instagram ahora mismo',
    failed: 'No se pudo completar la conexión',
    reauth: 'Vuelve a conectar tu cuenta',
    unavailable: 'La conexión con Meta todavía no está disponible.',
    retry: 'Reintentar',
    reconnect: 'Volver a conectar',
    disconnect: 'Desconectar',
    confirmDisconnect: '¿Desconectar Facebook e Instagram? Borraremos el acceso guardado.',
    badge: { disconnected: 'Sin conectar', connecting: 'Conectando', page_selection: 'Falta elegir página', connected: 'Conectado', error: 'Error', reauth: 'Requiere acción' },
  },
  en: {
    title: 'Facebook and Instagram',
    description: "Connect your business's social profiles so LocalSEOHub can analyse your presence and help you improve it.",
    connect: 'Connect Facebook and Instagram',
    connecting: 'Connecting…',
    connectingHint: 'If you closed the Meta window or did not finish granting permission, you can cancel and start again.',
    cancelConnection: 'Cancel connection',
    retryConnection: 'Retry connection',
    selectPage: 'Select your business Page',
    selectPageHint: 'Your account manages several Pages. Choose the one for this business.',
    choose: 'Choose Page',
    confirm: 'Use this Page',
    cancel: 'Cancel',
    facebook: 'Facebook',
    instagram: 'Instagram',
    noProfessional: 'No professional account is linked',
    instagramUnsupported: 'The linked account is not professional or not supported',
    instagramPermission: 'Permission to view the Instagram account is missing',
    instagramError: 'Instagram could not be checked right now',
    failed: 'The connection could not be completed',
    reauth: 'Reconnect your account',
    unavailable: 'The Meta connection is not available yet.',
    retry: 'Try again',
    reconnect: 'Reconnect',
    disconnect: 'Disconnect',
    confirmDisconnect: 'Disconnect Facebook and Instagram? We will delete the saved access.',
    badge: { disconnected: 'Not connected', connecting: 'Connecting', page_selection: 'Page needed', connected: 'Connected', error: 'Error', reauth: 'Action needed' },
  },
};

const ERROR_DETAIL: Record<Lang, Record<string, string>> = {
  es: {
    OAUTH_DENIED: 'Cancelaste el permiso en Meta. Puedes intentarlo de nuevo cuando quieras.',
    OAUTH_CANCELLED: 'Cancelaste la conexión. Puedes intentarlo de nuevo cuando quieras.',
    ALREADY_CONNECTED: 'Facebook e Instagram ya están conectados. Desconéctalos primero si quieres usar otra cuenta.',
    OAUTH_STATE_INVALID: 'La solicitud de conexión no era válida. Vuelve a empezar desde aquí.',
    OAUTH_STATE_EXPIRED: 'La conexión tardó demasiado y caducó. Vuelve a intentarlo.',
    TOKEN_EXCHANGE_FAILED: 'Meta no confirmó el acceso. Vuelve a intentarlo.',
    META_APP_NOT_CONFIGURED: 'La conexión con Meta todavía no está disponible.',
    META_PERMISSION_UNAVAILABLE: 'No se concedieron todos los permisos necesarios para ver tus páginas (incluido el acceso a la empresa). Vuelve a conectar y acéptalos todos.',
    META_API_RATE_LIMIT: 'Meta está limitando las consultas. Espera unos minutos y vuelve a intentarlo.',
    PAGE_DISCOVERY_FAILED: 'Meta devolvió un error al consultar tus páginas de Facebook. Espera unos minutos y vuelve a intentarlo.',
    NO_AUTHORIZED_PAGES: 'Meta no devolvió ninguna página de Facebook. Comprueba que administras la página del negocio y que la marcaste al dar permiso, y vuelve a conectar.',
    INSTAGRAM_DISCOVERY_FAILED: 'No pudimos consultar tu cuenta de Instagram.',
    REAUTH_REQUIRED: 'El acceso a Meta ha caducado. Vuelve a conectar tu cuenta.',
    SESSION_MISMATCH: 'La conexión se inició en otra sesión. Vuelve a empezar desde aquí.',
    UNKNOWN_ERROR: 'Algo salió mal. Vuelve a intentarlo.',
  },
  en: {
    OAUTH_DENIED: 'You cancelled the permission on Meta. You can try again whenever you like.',
    OAUTH_CANCELLED: 'You cancelled the connection. You can try again whenever you like.',
    ALREADY_CONNECTED: 'Facebook and Instagram are already connected. Disconnect first to use another account.',
    OAUTH_STATE_INVALID: 'The connection request was not valid. Start again from here.',
    OAUTH_STATE_EXPIRED: 'The connection took too long and expired. Try again.',
    TOKEN_EXCHANGE_FAILED: 'Meta did not confirm access. Try again.',
    META_APP_NOT_CONFIGURED: 'The Meta connection is not available yet.',
    META_PERMISSION_UNAVAILABLE: 'Not all permissions needed to view your Pages were granted (including business access). Reconnect and accept them all.',
    META_API_RATE_LIMIT: 'Meta is limiting requests. Wait a few minutes and try again.',
    PAGE_DISCOVERY_FAILED: 'Meta returned an error while checking your Facebook Pages. Wait a few minutes and try again.',
    NO_AUTHORIZED_PAGES: 'Meta returned no Facebook Page. Check that you manage the business Page and selected it when granting permission, then reconnect.',
    INSTAGRAM_DISCOVERY_FAILED: 'We could not check your Instagram account.',
    REAUTH_REQUIRED: 'Meta access has expired. Reconnect your account.',
    SESSION_MISMATCH: 'The connection was started in another session. Start again from here.',
    UNKNOWN_ERROR: 'Something went wrong. Try again.',
  },
};

export function metaErrorMessage(code: string | null | undefined, lang: Lang = 'es'): string {
  return (code && ERROR_DETAIL[lang][code]) || ERROR_DETAIL[lang].UNKNOWN_ERROR;
}

export function instagramLabel(status: InstagramStatus, username: string | null, lang: Lang = 'es'): string {
  const t = META_COPY[lang];
  if (status === 'connected' && username) return `@${username}`;
  if (status === 'not_associated') return t.noProfessional;
  if (status === 'unsupported') return t.instagramUnsupported;
  if (status === 'permission_unavailable') return t.instagramPermission;
  return t.instagramError;
}
