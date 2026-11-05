import type { ActionSourceType } from '../actions/types';

interface WeeklyPlanCopy {
  navLabel: string;
  title: string;
  effortEstimate: (minutes: number) => string;
  sourceLabels: Record<ActionSourceType, string>;
  sourceWhy: Record<ActionSourceType, string>;
  progressNote: string;
  addedNote: (count: number) => string;
  readOnlyNote: string;
  timeZoneNote: string;
}

export const WEEKLY_PLAN_COPY: Record<'es' | 'en', WeeklyPlanCopy> = {
  es: {
    navLabel: 'Tu Semana',
    title: 'Tu plan semanal',
    effortEstimate: (m) => `Unos ${m} min (estimado)`,
    sourceLabels: {
      VERIFIED_FINDING: 'Dato verificado de una fuente conectada',
      BUSINESS_PROFILE: 'Datos de tu negocio',
      GOAL_BASED: 'Tu objetivo principal',
      GENERAL_BEST_PRACTICE: 'Buena práctica general',
      FOLLOW_UP: 'Seguimiento de una tarea anterior',
      SOURCE_REQUIRED: 'Fuente sin conectar',
    },
    sourceWhy: {
      VERIFIED_FINDING: 'Lo hemos detectado en una fuente que tienes conectada.',
      BUSINESS_PROFILE: 'Falta un dato en el perfil de tu negocio.',
      GOAL_BASED: 'Te acerca al objetivo que elegiste.',
      GENERAL_BEST_PRACTICE: 'Es una recomendación general para negocios locales, no un dato medido de tu negocio.',
      FOLLOW_UP: 'Continúa una tarea que ya empezaste.',
      SOURCE_REQUIRED: 'Sin esta conexión no podemos ver esos datos.',
    },
    progressNote: 'Mide las tareas cerradas esta semana, no resultados de negocio. Las descartadas no cuentan.',
    addedNote: (n) => (n === 1 ? 'Esta semana ha aparecido 1 tarea nueva.' : `Esta semana han aparecido ${n} tareas nuevas.`),
    readOnlyNote: 'Con tu plan actual puedes ver tus tareas, pero no marcarlas.',
    timeZoneNote: 'La semana empieza el lunes a las 00:00 según la hora de tu dispositivo.',
  },
  en: {
    navLabel: 'Your Week',
    title: 'Your weekly plan',
    effortEstimate: (m) => `About ${m} min (estimate)`,
    sourceLabels: {
      VERIFIED_FINDING: 'Verified data from a connected source',
      BUSINESS_PROFILE: 'Your business details',
      GOAL_BASED: 'Your main goal',
      GENERAL_BEST_PRACTICE: 'General best practice',
      FOLLOW_UP: 'Follow-up on an earlier task',
      SOURCE_REQUIRED: 'Source not connected',
    },
    sourceWhy: {
      VERIFIED_FINDING: 'We found this in a source you have connected.',
      BUSINESS_PROFILE: 'A detail is missing from your business profile.',
      GOAL_BASED: 'It moves you towards the goal you chose.',
      GENERAL_BEST_PRACTICE: 'This is general advice for local businesses, not measured data about yours.',
      FOLLOW_UP: 'It continues a task you already started.',
      SOURCE_REQUIRED: 'Without this connection we cannot see that data.',
    },
    progressNote: 'This counts tasks closed this week, not business results. Dismissed tasks do not count.',
    addedNote: (n) => (n === 1 ? '1 new task appeared this week.' : `${n} new tasks appeared this week.`),
    readOnlyNote: 'On your current plan you can view your tasks but not mark them.',
    timeZoneNote: 'The week starts on Monday at 00:00 in your device time.',
  },
};
