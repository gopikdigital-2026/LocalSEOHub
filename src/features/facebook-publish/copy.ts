import type { Lang } from '../../lib/i18n';
import type { AttemptState } from './repository';

type Text = Record<Lang, string>;

export const INTERNAL_NOTICE = 'Internal validation only. Not visible to customers.';

export const FB = {
  title: { es: 'Publicar en Facebook (validación interna)', en: 'Publish to Facebook (internal validation)' },
  intro: { es: 'Una foto y el texto guardado de Facebook, publicados al momento en la Página conectada.', en: 'One photo and the saved Facebook text, published immediately to the connected Page.' },
  load: { es: 'Comprobar estado', en: 'Check status' },
  empty: { es: 'Abre una publicación con propuestas listas para comprobarla.', en: 'Open a publication with ready proposals to check it.' },
  publication: { es: 'Publicación', en: 'Publication' },
  page: { es: 'Página de Facebook', en: 'Facebook Page' },
  version: { es: 'Versión del texto', en: 'Text version' },
  state: { es: 'Estado del intento', en: 'Attempt state' },
  preflight: { es: 'Comprobación previa', en: 'Preflight' },
  ready: { es: 'Lista para publicar', en: 'Ready to publish' },
  lastError: { es: 'Último error', en: 'Last error' },
  caption: { es: 'Texto exacto que se enviará', en: 'Exact text that will be sent' },
  image: { es: 'Imagen privada', en: 'Private image' },
  imageMissing: { es: 'No se pudo cargar la imagen.', en: 'The image could not be loaded.' },
  armedOn: { es: 'Publicación real ACTIVADA para tu cuenta', en: 'Real publishing ARMED for your account' },
  armedOff: { es: 'Publicación real desactivada en el servidor', en: 'Real publishing disabled on the server' },
  publish: { es: 'Publicar en Facebook', en: 'Publish to Facebook' },
  retry: { es: 'Reintentar publicación', en: 'Retry publication' },
  confirmTitle: { es: 'Esto creará una publicación pública real', en: 'This will create a real public post' },
  confirmBody: { es: 'Se publicará una vez en la Página indicada, con este texto y esta imagen. No se puede deshacer desde aquí.', en: 'It will be posted once to the Page shown, with this text and image. It cannot be undone from here.' },
  confirm: { es: 'Sí, publicar ahora', en: 'Yes, publish now' },
  cancel: { es: 'Cancelar', en: 'Cancel' },
  permalink: { es: 'Ver en Facebook', en: 'View on Facebook' },
  objectId: { es: 'Identificador de Meta', en: 'Meta identifier' },
  yes: { es: 'sí', en: 'yes' },
  no: { es: 'no', en: 'no' },
} satisfies Record<string, Text>;

export const STATE_TEXT: Record<AttemptState, Text> = {
  NOT_REQUESTED: { es: 'Sin solicitar', en: 'Not requested' },
  PUBLISHING: { es: 'Publicando', en: 'Publishing' },
  SUCCEEDED: { es: 'Publicada', en: 'Published' },
  FAILED: { es: 'Falló', en: 'Failed' },
  UNKNOWN: { es: 'Resultado desconocido: no reintentar, revisa la Página', en: 'Outcome unknown: do not retry, check the Page' },
};

export const CODE_TEXT: Record<string, Text> = {
  REAL_PUBLISH_DISABLED: { es: 'La publicación real está desactivada en el servidor.', en: 'Real publishing is disabled on the server.' },
  PERMISSION_REQUIRED: { es: 'Falta el permiso de publicación o la tarea de crear contenido en la Página.', en: 'Publishing permission or the Page create-content task is missing.' },
  VERSION_CONFLICT: { es: 'El texto cambió. Recarga antes de publicar.', en: 'The text changed. Reload before publishing.' },
  ALREADY_PUBLISHED: { es: 'Ya está publicada en Facebook.', en: 'Already published to Facebook.' },
  PUBLISH_IN_PROGRESS: { es: 'Ya hay una publicación en curso.', en: 'A publication is already in progress.' },
  PUBLISH_OUTCOME_UNKNOWN: { es: 'No sabemos si se publicó. No reintentes; revisa la Página.', en: 'We do not know whether it was posted. Do not retry; check the Page.' },
  META_REJECTED: { es: 'Facebook rechazó la publicación. Edita y guarda el texto antes de reintentar.', en: 'Facebook rejected the post. Edit and save the text before retrying.' },
};

export const GENERIC_ERROR: Text = { es: 'No se pudo completar. Inténtalo de nuevo más tarde.', en: 'Could not complete. Try again later.' };
