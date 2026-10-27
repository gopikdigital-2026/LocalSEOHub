import type { Lang } from '../../lib/i18n';
import type { DraftErrorCode } from '../publications/drafts/types';
import type { PublicationProposalRole } from '../publications/types';
import type { AdaptationErrorCode, LimitScope } from './types';

type Text = Record<Lang, string>;

export const INTERNAL_NOTICE = 'Validación interna — no es una función para clientes.';

export const PANEL = {
  title: { es: 'Paso 3 · Elegir propuesta y adaptar a Facebook e Instagram', en: 'Step 3 · Choose a proposal and adapt it for Facebook and Instagram' },
  privacy: {
    es: 'La adaptación se genera a partir del texto elegido, sin volver a enviar la imagen. No se publica nada en Facebook, Instagram ni Google.',
    en: 'The adaptation is generated from the chosen text without resending the image. Nothing is published on Facebook, Instagram or Google.',
  },
  load: { es: 'Cargar propuestas generadas', en: 'Load generated proposals' },
  loading: { es: 'Cargando…', en: 'Loading…' },
  empty: { es: 'Todavía no hay propuestas. Genera primero las 3 propuestas en el paso 2 y vuelve a cargar.', en: 'No proposals yet. Generate the 3 proposals in step 2 first, then load again.' },
  choose: { es: 'Elegir esta', en: 'Choose this one' },
  chosen: { es: 'Elegida', en: 'Chosen' },
  selecting: { es: 'Guardando elección…', en: 'Saving choice…' },
  original: { es: 'Propuesta elegida (original)', en: 'Chosen proposal (original)' },
  noSelection: { es: 'Elige una de las 3 propuestas para poder adaptarla.', en: 'Choose one of the 3 proposals to adapt it.' },
  adapt: { es: 'Adaptar para Facebook e Instagram', en: 'Adapt for Facebook and Instagram' },
  adapting: { es: 'Adaptando… puede tardar unos segundos.', en: 'Adapting… this can take a few seconds.' },
  facebook: { es: 'Facebook', en: 'Facebook' },
  instagram: { es: 'Instagram', en: 'Instagram' },
  version: { es: 'Versión', en: 'Version' },
  used: { es: 'Adaptaciones usadas', en: 'Adaptations used' },
  adaptedAt: { es: 'Adaptado', en: 'Adapted' },
  limitReached: { es: 'Límite de adaptaciones alcanzado para esta publicación.', en: 'Adaptation limit reached for this publication.' },
  body: { es: 'Texto', en: 'Text' },
  cta: { es: 'Llamada a la acción', en: 'Call to action' },
  copy: { es: 'Copiar', en: 'Copy' },
  copied: { es: 'Copiado', en: 'Copied' },
} satisfies Record<string, Text>;

export const ROLE_TEXT: Record<PublicationProposalRole, Text> = {
  direct: { es: 'Directa', en: 'Direct' },
  close: { es: 'Cercana', en: 'Warm' },
  professional: { es: 'Profesional', en: 'Professional' },
};

export const ADAPTATION_ERROR_TEXT: Record<AdaptationErrorCode, Text> = {
  unauthenticated: { es: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', en: 'Your session has expired. Please sign in again.' },
  premium_required: { es: 'Esta prueba requiere una cuenta Premium.', en: 'This test requires a Premium account.' },
  rate_limited: { es: 'Demasiadas solicitudes seguidas. Espera un momento.', en: 'Too many requests in a row. Please wait a moment.' },
  not_found: { es: 'No encontramos esta publicación.', en: 'We could not find this publication.' },
  publication_not_ready: { es: 'La publicación todavía no tiene propuestas listas.', en: 'The publication does not have proposals ready yet.' },
  no_selected_proposal: { es: 'Elige primero una propuesta.', en: 'Choose a proposal first.' },
  stale_selection: { es: 'La elección ha cambiado. Vuelve a cargar las propuestas.', en: 'The choice has changed. Load the proposals again.' },
  busy: { es: 'Ya hay una adaptación en curso para esta publicación.', en: 'An adaptation is already running for this publication.' },
  limit_reached: { es: 'Has alcanzado el límite de adaptaciones.', en: 'You have reached the adaptation limit.' },
  ai_unavailable: { es: 'El servicio de adaptación no está disponible ahora. Inténtalo de nuevo.', en: 'The adaptation service is unavailable right now. Please try again.' },
  invalid_ai_output: { es: 'La adaptación no cumplió los requisitos de calidad. Inténtalo de nuevo.', en: 'The adaptation did not meet the quality requirements. Please try again.' },
  unsafe_output: { es: 'La adaptación se descartó por seguridad (datos no verificados). Inténtalo de nuevo.', en: 'The adaptation was discarded for safety (unverified details). Please try again.' },
  conflict: { es: 'Otra operación cambió la publicación. Vuelve a cargar.', en: 'Another action changed the publication. Load again.' },
  unavailable: { es: 'No se pudo completar. Inténtalo de nuevo.', en: 'This could not be completed. Please try again.' },
  unknown: { es: 'Ha ocurrido un error inesperado.', en: 'An unexpected error occurred.' },
};

export const LIMIT_SCOPE_TEXT: Record<LimitScope, Text> = {
  publication: { es: 'Máximo 3 adaptaciones por publicación.', en: 'Maximum 3 adaptations per publication.' },
  monthly: { es: 'Límite mensual de adaptaciones alcanzado (20).', en: 'Monthly adaptation limit reached (20).' },
  global: { es: 'Límite mensual total de IA alcanzado.', en: 'Total monthly AI limit reached.' },
};

export const SELECTION_ERROR_TEXT: Record<DraftErrorCode, Text> = {
  unauthenticated: ADAPTATION_ERROR_TEXT.unauthenticated,
  not_found: ADAPTATION_ERROR_TEXT.not_found,
  publication_not_ready: ADAPTATION_ERROR_TEXT.publication_not_ready,
  stale_generation: { es: 'Las propuestas han cambiado. Vuelve a cargarlas.', en: 'The proposals have changed. Load them again.' },
  invalid_position: { es: 'Propuesta no válida.', en: 'Invalid proposal.' },
  proposal_not_found: { es: 'No encontramos esa propuesta.', en: 'We could not find that proposal.' },
  busy: { es: 'Hay una adaptación en curso; espera a que termine para cambiar la elección.', en: 'An adaptation is running; wait for it to finish before changing the choice.' },
  unavailable: ADAPTATION_ERROR_TEXT.unavailable,
  unknown: ADAPTATION_ERROR_TEXT.unknown,
};
