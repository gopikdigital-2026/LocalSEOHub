import type { Lang } from '../../lib/i18n';
import type { AttemptState, ExternalStage } from './repository';

type Text = Record<Lang, string>;

export const INTERNAL_NOTICE = 'Internal validation only. Not visible to customers.';

export const IG = {
  title: { es: 'Instagram (validación interna)', en: 'Instagram (internal validation)' },
  intro: { es: 'Comprueba la cuenta profesional, el texto guardado de Instagram y la imagen JPEG que se generaría. Solo se puede publicar si el servidor lo autoriza para esta publicación.', en: 'Checks the professional account, the saved Instagram text and the JPEG image that would be generated. Publishing is only possible when the server authorizes it for this publication.' },
  load: { es: 'Comprobar estado', en: 'Check status' },
  empty: { es: 'Abre una publicación con propuestas listas para comprobarla.', en: 'Open a publication with ready proposals to check it.' },
  publication: { es: 'Publicación', en: 'Publication' },
  account: { es: 'Cuenta de Instagram', en: 'Instagram account' },
  subtype: { es: 'Cuenta profesional vinculada; subtipo Business/Creator no verificado.', en: 'Professional account linked; Business vs Creator subtype not verified.' },
  version: { es: 'Versión del borrador', en: 'Draft version' },
  state: { es: 'Estado del intento', en: 'Attempt state' },
  stage: { es: 'Etapa externa', en: 'External stage' },
  container: { es: 'Contenedor guardado', en: 'Container stored' },
  preflight: { es: 'Comprobación previa', en: 'Preflight' },
  ready: { es: 'Apta', en: 'Eligible' },
  lastError: { es: 'Último error', en: 'Last error' },
  caption: { es: 'Texto exacto de Instagram', en: 'Exact Instagram text' },
  source: { es: 'Imagen original', en: 'Original image' },
  derivative: { es: 'Imagen para Instagram', en: 'Instagram image' },
  derivativeReady: { es: 'Se puede generar', en: 'Can be generated' },
  derivativeNo: { es: 'No se puede generar', en: 'Cannot be generated' },
  disabled: { es: 'Publicación real desactivada', en: 'Real publishing disabled' },
  trigger: { es: 'Publicar en Instagram (prueba interna)', en: 'Publish to Instagram (internal test)' },
  confirm: { es: 'Esto publicará esta imagen y texto en la cuenta de Instagram conectada. ¿Continuar?', en: 'This will post this image and text to the connected Instagram account. Continue?' },
  confirmYes: { es: 'Sí, publicar', en: 'Yes, publish' },
  cancel: { es: 'Cancelar', en: 'Cancel' },
  sending: { es: 'Enviando…', en: 'Sending…' },
  published: { es: 'Publicada', en: 'Published' },
  notAuthorized: { es: 'El servidor no autoriza esta publicación.', en: 'The server does not authorize this publication.' },
  yes: { es: 'sí', en: 'yes' },
  no: { es: 'no', en: 'no' },
} satisfies Record<string, Text>;

export const CROP_TEXT: Record<string, Text> = {
  none: { es: 'sin recorte', en: 'no crop' },
  tall_center_crop_4x5: { es: 'recorte centrado vertical a 4:5', en: 'vertical centre-crop to 4:5' },
  wide_center_crop_191x100: { es: 'recorte centrado horizontal a 1.91:1', en: 'horizontal centre-crop to 1.91:1' },
};

export const STAGE_TEXT: Record<ExternalStage, Text> = {
  none: { es: 'nada enviado', en: 'nothing sent' },
  container_requested: { es: 'contenedor solicitado', en: 'container requested' },
  container_created: { es: 'contenedor creado', en: 'container created' },
  publish_requested: { es: 'publicación solicitada', en: 'publish requested' },
};

export const STATE_TEXT: Record<AttemptState, Text> = {
  NOT_REQUESTED: { es: 'Sin solicitar', en: 'Not requested' },
  PUBLISHING: { es: 'Publicando', en: 'Publishing' },
  SUCCEEDED: { es: 'Publicada', en: 'Published' },
  FAILED: { es: 'Falló', en: 'Failed' },
  UNKNOWN: { es: 'Resultado desconocido: requiere verificación', en: 'Outcome unknown: verification required' },
};

export const GENERIC_ERROR: Text = { es: 'No se pudo completar. Inténtalo de nuevo más tarde.', en: 'Could not complete. Try again later.' };

export const CHECK = {
  title: { es: 'Conexión en vivo con Meta (solo lectura)', en: 'Live Meta connection (read-only)' },
  intro: { es: 'Consulta a Meta, en este momento, el estado de la autorización, los permisos, la Página y la cuenta de Instagram. No publica nada, no guarda el resultado y no activa la publicación.', en: 'Asks Meta, right now, about the authorization, permissions, Page and Instagram account. It posts nothing, stores nothing and does not enable publishing.' },
  run: { es: 'Comprobar conexión con Meta', en: 'Check Meta connection' },
  running: { es: 'Comprobando…', en: 'Checking…' },
  incomplete: { es: 'Comprobación incompleta: algunos datos no se pudieron confirmar. No es lo mismo que un fallo.', en: 'Incomplete check: some items could not be confirmed. This is not the same as a failure.' },
  failed: { es: 'Al menos una comprobación ha fallado.', en: 'At least one check failed.' },
  passed: { es: 'Todas las comprobaciones han pasado.', en: 'All checks passed.' },
  checkedAt: { es: 'Comprobado', en: 'Checked' },
  page: { es: 'Página de Facebook', en: 'Facebook Page' },
  account: { es: 'Cuenta de Instagram', en: 'Instagram account' },
  tokenValid: { es: 'Autorización válida', en: 'Authorization valid' },
  expiry: { es: 'Caducidad', en: 'Expiry' },
  dataAccess: { es: 'Acceso a datos hasta', en: 'Data access until' },
  eligibility: { es: 'Apta para publicar (profesional)', en: 'Publishing eligible (professional)' },
  limit: { es: 'Límite de publicación (24 h)', en: 'Publishing limit (24 h)' },
  subtype: { es: 'Meta no indica aquí si la cuenta es Business o Creator; la aptitud se deduce de la vinculación y del límite de publicación.', en: 'Meta does not say here whether the account is Business or Creator; eligibility is inferred from the link and the publishing limit.' },
  notStored: { es: 'Resultado no guardado. No cambia el botón de publicación.', en: 'Result not stored. It does not change the publish button.' },
  unknown: { es: 'desconocido', en: 'unknown' },
} satisfies Record<string, Text>;

export const EXPIRY_TEXT: Record<'never' | 'valid_until' | 'expired' | 'unknown', Text> = {
  never: { es: 'no caduca', en: 'does not expire' },
  valid_until: { es: 'válida hasta', en: 'valid until' },
  expired: { es: 'caducada', en: 'expired' },
  unknown: { es: 'desconocida', en: 'unknown' },
};

export const CHECK_TEXT: Record<'token' | 'permissions' | 'page' | 'instagram_account' | 'professional_eligibility' | 'publishing_limit', Text> = {
  token: { es: 'Autorización', en: 'Authorization' },
  permissions: { es: 'Permisos', en: 'Permissions' },
  page: { es: 'Página y vinculación', en: 'Page and link' },
  instagram_account: { es: 'Cuenta de Instagram', en: 'Instagram account' },
  professional_eligibility: { es: 'Aptitud profesional', en: 'Professional eligibility' },
  publishing_limit: { es: 'Límite de publicación', en: 'Publishing limit' },
};

export const STATUS_TEXT: Record<'pass' | 'fail' | 'inconclusive' | 'skipped', Text> = {
  pass: { es: 'correcto', en: 'pass' },
  fail: { es: 'fallo', en: 'fail' },
  inconclusive: { es: 'sin confirmar', en: 'inconclusive' },
  skipped: { es: 'no ejecutada', en: 'not run' },
};
