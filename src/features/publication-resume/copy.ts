import type { ResumeStage } from './model';

type Text = { es: string; en: string };

export const RESUME = {
  chooserTitle: { es: 'Continuar una publicación', en: 'Continue a publication' },
  chooserIntro: {
    es: 'Elige la publicación que quieres retomar, o empieza una nueva en el Paso 1.',
    en: 'Choose the publication you want to pick up, or start a new one in Step 1.',
  },
  continue: { es: 'Continuar', en: 'Continue' },
  stage: { es: 'Etapa', en: 'Stage' },
  lastModified: { es: 'Última modificación', en: 'Last modified' },
  edited: { es: 'Con cambios manuales', en: 'Has manual edits' },
  current: { es: 'Publicación en curso', en: 'Current publication' },
  switch: { es: 'Cambiar de publicación', en: 'Switch publication' },
  loading: { es: 'Cargando la publicación…', en: 'Loading the publication…' },
  unavailable: {
    es: 'Esta publicación no está disponible.',
    en: 'This publication is not available.',
  },
  otherBusiness: {
    es: 'Esta publicación no está disponible en el negocio actual.',
    en: 'This publication is not available in the current business.',
  },
  backToList: { es: 'Ver mis publicaciones', en: 'See my publications' },
  leaveWarning: {
    es: 'Tienes cambios sin guardar. Si cambias de publicación se perderán.',
    en: 'You have unsaved changes. They will be lost if you switch publication.',
  },
} satisfies Record<string, Text>;

export const STAGE_TEXT: Record<ResumeStage, Text> = {
  upload: { es: 'Falta subir la foto', en: 'Photo not uploaded yet' },
  generate: { es: 'Foto subida · falta generar propuestas', en: 'Photo uploaded · proposals not generated' },
  select: { es: 'Propuestas generadas · falta elegir una', en: 'Proposals generated · none chosen' },
  adapt: { es: 'Propuesta elegida · falta adaptar', en: 'Proposal chosen · not adapted' },
  review: { es: 'Textos adaptados · en revisión', en: 'Texts adapted · in review' },
};
