type Lang = 'es' | 'en';

export const PUBLISHING_ACCESS_COPY = {
  es: {
    title: 'Publicaciones en Facebook',
    explain: 'Autoriza a LocalSEOHub para publicar en tu página de Facebook. No se publicará nada al activar este permiso.',
    activate: 'Activar publicaciones',
    activating: 'Abriendo Meta…',
    checking: 'Comprobando el permiso de publicación…',
    unavailable: 'No pudimos comprobar el permiso de publicación.',
    retry: 'Reintentar',
    ready: 'Permiso de publicación activado. Nada se publica sin tu confirmación.',
    returnedEnabled: 'Meta confirmó el permiso de publicación.',
    returnedIncomplete: 'Meta completó la autorización, pero todavía falta el permiso para publicar en esta página. Tu conexión sigue activa.',
  },
  en: {
    title: 'Facebook publishing',
    explain: 'Allow LocalSEOHub to publish to your Facebook Page. Nothing will be posted when you enable this permission.',
    activate: 'Enable publishing',
    activating: 'Opening Meta…',
    checking: 'Checking the publishing permission…',
    unavailable: 'We could not check the publishing permission.',
    retry: 'Retry',
    ready: 'Publishing permission enabled. Nothing is posted without your confirmation.',
    returnedEnabled: 'Meta confirmed the publishing permission.',
    returnedIncomplete: 'Meta completed the authorization, but the permission to publish to this Page is still missing. Your connection is still active.',
  },
};

const ERRORS: Record<Lang, Record<string, string>> = {
  es: {
    PUBLISHING_CONSENT_DECLINED: 'No se concedió el permiso para publicar. Tu conexión de Facebook sigue activa; puedes intentarlo de nuevo.',
    OAUTH_DENIED: 'Cancelaste la autorización en Meta. Tu conexión de Facebook sigue activa.',
    PUBLISHING_ACCOUNT_MISMATCH: 'Autorizaste con otra cuenta de Facebook. Usa la misma cuenta con la que conectaste la página.',
    PUBLISHING_CONSENT_DOWNGRADE: 'Meta devolvió menos permisos de los que ya tenías. Vuelve a intentarlo y acéptalos todos.',
    OAUTH_STATE_EXPIRED: 'La autorización tardó demasiado y caducó. Vuelve a intentarlo.',
    OAUTH_STATE_INVALID: 'La solicitud de autorización no era válida. Vuelve a empezar desde aquí.',
    SESSION_MISMATCH: 'La autorización se inició en otra sesión. Vuelve a empezar desde aquí.',
    CHANNEL_NOT_CONNECTED: 'Primero conecta tu página de Facebook.',
    META_APP_NOT_CONFIGURED: 'La autorización con Meta todavía no está disponible.',
    PAGE_DISCOVERY_FAILED: 'Meta devolvió un error al consultar tu página. Espera unos minutos y vuelve a intentarlo.',
    TOKEN_EXCHANGE_FAILED: 'Meta no confirmó la autorización. Vuelve a intentarlo.',
    UNKNOWN_ERROR: 'Algo salió mal. Vuelve a intentarlo.',
  },
  en: {
    PUBLISHING_CONSENT_DECLINED: 'The publishing permission was not granted. Your Facebook connection is still active; you can try again.',
    OAUTH_DENIED: 'You cancelled the authorization on Meta. Your Facebook connection is still active.',
    PUBLISHING_ACCOUNT_MISMATCH: 'You authorized with a different Facebook account. Use the same account you connected the Page with.',
    PUBLISHING_CONSENT_DOWNGRADE: 'Meta returned fewer permissions than you already had. Try again and accept them all.',
    OAUTH_STATE_EXPIRED: 'The authorization took too long and expired. Try again.',
    OAUTH_STATE_INVALID: 'The authorization request was not valid. Start again from here.',
    SESSION_MISMATCH: 'The authorization was started in another session. Start again from here.',
    CHANNEL_NOT_CONNECTED: 'Connect your Facebook Page first.',
    META_APP_NOT_CONFIGURED: 'Authorization with Meta is not available yet.',
    PAGE_DISCOVERY_FAILED: 'Meta returned an error while checking your Page. Wait a few minutes and try again.',
    TOKEN_EXCHANGE_FAILED: 'Meta did not confirm the authorization. Try again.',
    UNKNOWN_ERROR: 'Something went wrong. Try again.',
  },
};

export function publishingAccessError(code: string | null | undefined, lang: Lang): string {
  return (code && ERRORS[lang][code]) || ERRORS[lang].UNKNOWN_ERROR;
}
