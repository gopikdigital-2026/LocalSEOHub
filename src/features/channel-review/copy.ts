import type { Lang } from '../../lib/i18n';
import type { Channel, ReviewErrorCode, TextIssue } from './types';

type Text = Record<Lang, string>;

export const INTERNAL_NOTICE = 'Validación interna — no es una función para clientes.';

export const NOTHING_PUBLISHED = { es: 'No se ha publicado nada todavía.', en: 'Nothing has been published yet.' } satisfies Text;

export const REVIEW = {
  title: { es: 'Paso 4 · Revisa los textos antes de publicar', en: 'Step 4 · Review the texts before publishing' },
  intro: {
    es: 'Puedes editar libremente ambos textos. El texto generado se conserva siempre y puedes restaurarlo. Guardar no usa IA.',
    en: 'You can freely edit both texts. The generated text is always kept and you can restore it. Saving does not use AI.',
  },
  load: { es: 'Cargar textos para revisar', en: 'Load texts to review' },
  reload: { es: 'Recargar la versión más reciente', en: 'Reload the latest version' },
  loading: { es: 'Cargando…', en: 'Loading…' },
  empty: { es: 'Todavía no hay textos adaptados. Adapta primero la propuesta en el paso 3.', en: 'No adapted texts yet. Adapt the proposal in step 3 first.' },
  generated: { es: 'Versión generada', en: 'Generated version' },
  edited: { es: 'Editado por ti', en: 'Edited by you' },
  restore: { es: 'Restaurar versión generada', en: 'Restore generated version' },
  restoreConfirm: {
    es: 'Perderás los cambios sin guardar de este canal. ¿Restaurar la versión generada?',
    en: 'You will lose the unsaved changes for this channel. Restore the generated version?',
  },
  save: { es: 'Guardar borradores', en: 'Save drafts' },
  saving: { es: 'Guardando…', en: 'Saving…' },
  unsaved: { es: 'Cambios sin guardar', en: 'Unsaved changes' },
  saved: { es: 'Guardado', en: 'Saved' },
  savedTitle: { es: 'Borradores guardados', en: 'Drafts saved' },
  status: { es: 'Estado', en: 'Status' },
  ready: { es: 'Borrador listo', en: 'Draft ready' },
  reviewing: { es: 'Listo para revisar', en: 'Ready to review' },
  notReady: { es: 'Pendiente de corregir', en: 'Needs fixing' },
  version: { es: 'Versión', en: 'Version' },
  leaveWarning: { es: 'Tienes cambios sin guardar.', en: 'You have unsaved changes.' },
} satisfies Record<string, Text>;

export const CHANNEL_NAME: Record<Channel, string> = { facebook: 'Facebook', instagram: 'Instagram' };

export const ISSUE_TEXT: Record<TextIssue, Text> = {
  empty: { es: 'El texto no puede estar vacío.', en: 'The text cannot be empty.' },
  too_long: { es: 'Supera el máximo de caracteres. Acórtalo para poder guardar.', en: 'It exceeds the character limit. Shorten it to save.' },
  control_chars: { es: 'Contiene caracteres invisibles no permitidos.', en: 'It contains invisible characters that are not allowed.' },
  markup: { es: 'No se admiten etiquetas HTML (por ejemplo <b> o <script>).', en: 'HTML tags are not allowed (for example <b> or <script>).' },
};

export const REVIEW_ERROR_TEXT: Record<ReviewErrorCode, Text> = {
  unauthenticated: { es: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', en: 'Your session has expired. Please sign in again.' },
  not_found: { es: 'No encontramos este borrador.', en: 'We could not find this draft.' },
  forbidden: { es: 'No tienes permiso para editar este borrador.', en: 'You do not have permission to edit this draft.' },
  not_ready: { es: 'Este borrador todavía no tiene textos adaptados.', en: 'This draft does not have adapted texts yet.' },
  busy: { es: 'Hay una adaptación en curso. Espera a que termine y recarga.', en: 'An adaptation is running. Wait for it to finish and reload.' },
  stale_draft: {
    es: 'Este borrador ha cambiado desde que lo abriste. Recarga la versión más reciente antes de guardar.',
    en: 'This draft has changed since you opened it. Reload the latest version before saving.',
  },
  invalid_facebook_text: { es: 'El texto de Facebook no es válido.', en: 'The Facebook text is not valid.' },
  invalid_instagram_text: { es: 'El texto de Instagram no es válido.', en: 'The Instagram text is not valid.' },
  invalid_payload: { es: 'No hay cambios que guardar.', en: 'There are no changes to save.' },
  payload_too_large: { es: 'El texto es demasiado largo.', en: 'The text is too long.' },
  internal_error: { es: 'No se pudo guardar. Inténtalo de nuevo.', en: 'This could not be saved. Please try again.' },
};
