import type { PublicationErrorCode, PublicationLang, PublicationProposalRole } from '../types';

export const VALIDATION_ROUTE = '/internal/publications-validation';

type Text = Record<PublicationLang, string>;

export const ROLE_LABEL: Record<PublicationProposalRole, Text> = {
  direct: { es: '1. Directa / Comercial', en: '1. Direct / Commercial' },
  close: { es: '2. Cercana / Natural', en: '2. Close / Natural' },
  professional: { es: '3. Profesional / Informativa', en: '3. Professional / Informative' },
};

export const UI = {
  title: { es: 'Validación interna — Publicaciones', en: 'Internal validation — Publications' },
  internal: {
    es: 'Herramienta temporal de prueba. No es una función para clientes.',
    en: 'Temporary test tool. Not a customer feature.',
  },
  privacy: {
    es: 'La imagen se procesa de forma privada para generar las propuestas. No se publica en Facebook, Instagram ni Google.',
    en: 'The image is processed privately to generate the proposals. It is not published on Facebook, Instagram or Google.',
  },
  business: { es: 'Negocio', en: 'Business' },
  noBusiness: { es: 'No hay ningún negocio asociado a esta cuenta.', en: 'There is no business linked to this account.' },
  step1: { es: 'Paso 1 — Elige una foto', en: 'Step 1 — Choose a photo' },
  constraints: { es: 'JPEG o PNG, máximo 8 MB.', en: 'JPEG or PNG, max 8 MB.' },
  fileLabel: { es: 'Foto del negocio', en: 'Business photo' },
  upload: { es: 'Subir foto', en: 'Upload photo' },
  uploading: { es: 'Subiendo y limpiando la foto...', en: 'Uploading and cleaning the photo...' },
  uploaded: { es: 'Foto subida y limpiada', en: 'Photo uploaded and cleaned' },
  step2: { es: 'Paso 2 — Idioma y generación', en: 'Step 2 — Language and generation' },
  language: { es: 'Idioma de las propuestas', en: 'Proposal language' },
  generate: { es: 'Generar 3 propuestas reales', en: 'Generate 3 real proposals' },
  regenerate: { es: 'Regenerar propuestas', en: 'Regenerate proposals' },
  generating: { es: 'Generando con la IA real... puede tardar hasta un minuto.', en: 'Generating with the real AI... this can take up to a minute.' },
  observed: { es: 'Lo que LocalSEOHub ha observado', en: 'What LocalSEOHub observed' },
  uncertain: { es: 'Incertidumbres', en: 'Uncertainties' },
  body: { es: 'Texto', en: 'Body' },
  cta: { es: 'Llamada a la acción', en: 'Call to action' },
  copy: { es: 'Copiar', en: 'Copy' },
  copied: { es: 'Copiado', en: 'Copied' },
  technical: { es: 'Datos técnicos', en: 'Technical data' },
  remove: { es: 'Eliminar prueba', en: 'Delete test' },
  removing: { es: 'Eliminando...', en: 'Deleting...' },
  replaceHint: {
    es: 'Para probar otra foto, elimina esta prueba y empieza de nuevo.',
    en: 'To test another photo, delete this test and start again.',
  },
  limitReached: { es: 'Límite de generaciones de esta publicación alcanzado.', en: 'Generation limit for this publication reached.' },
  diagnostic: { es: 'Diagnóstico interno', en: 'Internal diagnostic' },
} satisfies Record<string, Text>;

export const ERROR_TEXT: Record<PublicationErrorCode, Text> = {
  unauthenticated: { es: 'Tu sesión ha caducado. Vuelve a iniciar sesión.', en: 'Your session expired. Please sign in again.' },
  premium_required: { es: 'Esta prueba requiere una cuenta Premium.', en: 'This test requires a Premium account.' },
  rate_limited: { es: 'Demasiadas solicitudes seguidas. Espera un poco y vuelve a intentarlo.', en: 'Too many requests. Wait a little and try again.' },
  not_found: { es: 'No se ha encontrado la publicación de prueba.', en: 'The test publication was not found.' },
  draft_limit: { es: 'Has alcanzado el máximo de borradores.', en: 'You reached the maximum number of drafts.' },
  business_not_owned: { es: 'Este negocio no pertenece a tu cuenta.', en: 'This business does not belong to your account.' },
  invalid_request: { es: 'Solicitud no válida.', en: 'Invalid request.' },
  file_empty: { es: 'El archivo está vacío.', en: 'The file is empty.' },
  file_too_large: { es: 'La foto supera los 8 MB.', en: 'The photo is larger than 8 MB.' },
  unsupported_media_type: { es: 'Solo se admiten fotos JPEG o PNG.', en: 'Only JPEG or PNG photos are supported.' },
  image_unreadable: { es: 'No se ha podido leer la foto.', en: 'The photo could not be read.' },
  image_dimensions_out_of_range: { es: 'La foto es demasiado pequeña o demasiado grande.', en: 'The photo is too small or too large.' },
  image_already_attached: { es: 'Esta prueba ya tiene una foto.', en: 'This test already has a photo.' },
  no_image_to_replace: { es: 'No hay ninguna foto que reemplazar.', en: 'There is no photo to replace.' },
  conflict: { es: 'La publicación ha cambiado. Recarga la página.', en: 'The publication changed. Reload the page.' },
  image_required: { es: 'Primero sube una foto.', en: 'Upload a photo first.' },
  image_not_normalized: { es: 'La foto no se ha procesado correctamente. Sube otra.', en: 'The photo was not processed correctly. Upload another.' },
  business_context_missing: {
    es: 'Faltan datos del negocio (nombre, categoría o ciudad). Complétalos en el perfil del negocio.',
    en: 'Business details are missing (name, category or city). Complete them in the business profile.',
  },
  generation_in_progress: { es: 'Ya hay una generación en curso.', en: 'A generation is already running.' },
  regeneration_limit: { es: 'Has usado las 4 generaciones de esta publicación.', en: 'You used all 4 generations for this publication.' },
  image_changed: { es: 'La foto ha cambiado durante la generación.', en: 'The photo changed during generation.' },
  duplicate_request: { es: 'Solicitud duplicada.', en: 'Duplicate request.' },
  ai_limit: { es: 'Has alcanzado el límite de generaciones disponible.', en: 'You reached the available generation limit.' },
  business_image_mismatch: { es: 'Posible incompatibilidad entre imagen y negocio', en: 'Possible mismatch between image and business' },
  ai_response_invalid: {
    es: 'No hemos podido completar el análisis de la imagen de forma segura. Inténtalo de nuevo más tarde.',
    en: 'We could not complete the image analysis safely. Please try again later.',
  },
  image_not_understandable: {
    es: 'No hemos podido entender esta imagen con suficiente seguridad. Prueba con otra fotografía.',
    en: 'We could not understand this image with enough confidence. Try another photo.',
  },
  generation_failed: {
    es: 'La IA no ha producido tres propuestas seguras y distintas. Puedes volver a intentarlo.',
    en: 'The AI did not produce three safe, different proposals. You can try again.',
  },
  provider_timeout: { es: 'La generación ha tardado demasiado. Puedes volver a intentarlo.', en: 'Generation took too long. You can try again.' },
  unavailable: { es: 'El servicio no está disponible ahora mismo. Inténtalo más tarde.', en: 'The service is unavailable right now. Try later.' },
};
