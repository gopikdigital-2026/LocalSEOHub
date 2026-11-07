import type { WeeklyItemState } from './model';

interface WeeklyPageCopy {
  weekOf: (from: string, to: string) => string;
  purpose: string;
  goal: string;
  progressTitle: string;
  progressCount: (done: number, total: number) => string;
  progressEmpty: string;
  progressChanges: string;
  focusTitle: string;
  focusEmpty: string;
  laterTitle: (n: number) => string;
  activityTitle: string;
  activityEmpty: string;
  executed: string;
  resolved: string;
  dismissed: string;
  outdated: string;
  notCounted: string;
  why: string;
  source: string;
  priority: string;
  effort: string;
  states: Record<WeeklyItemState, string>;
  markDone: string;
  dismiss: string;
  view: string;
  autoClose: string;
  loading: string;
  errorTitle: string;
  errorText: string;
  retry: string;
  noBusinessTitle: string;
  noBusinessText: string;
  emptyTitle: string;
  emptyText: string;
  completeProfile: string;
  incompleteProfile: string;
  missingSources: string;
  connectSources: string;
  failStart: string;
  failComplete: string;
  failDismiss: string;
  locked: string;
  close: string;
}

export const WEEKLY_PAGE_COPY: Record<'es' | 'en', WeeklyPageCopy> = {
  es: {
    weekOf: (from, to) => `Semana del ${from} al ${to}`,
    purpose: 'Las tareas más importantes para tu negocio esta semana, ordenadas por prioridad, con el motivo de cada una.',
    goal: 'Objetivo',
    progressTitle: 'Progreso de la semana',
    progressCount: (d, t) => `${d} de ${t} tareas cerradas`,
    progressEmpty: 'Todavía no hay tareas que contar esta semana.',
    progressChanges: 'Si aparecen tareas nuevas, el porcentaje puede bajar aunque no hayas perdido nada.',
    focusTitle: 'Prioridades de la semana',
    focusEmpty: 'No tienes tareas pendientes esta semana.',
    laterTitle: (n) => `Para después (${n})`,
    activityTitle: 'Actividad de la semana',
    activityEmpty: 'Aún no has cerrado ninguna tarea esta semana.',
    executed: 'Hechas por ti',
    resolved: 'Resueltas al actualizar tus datos',
    dismissed: 'Descartadas por ti',
    outdated: 'Ya no aplican',
    notCounted: 'No cuentan en el progreso',
    why: 'Por qué',
    source: 'Origen',
    priority: 'Prioridad',
    effort: 'Esfuerzo',
    states: {
      pending: 'Pendiente', in_progress: 'En curso', executed: 'Hecha por ti',
      data_completed: 'Resuelta con tus datos', dismissed: 'Descartada', outdated: 'Ya no aplica',
    },
    markDone: 'Marcar como hecha',
    dismiss: 'Descartar',
    view: 'Ver',
    autoClose: 'Se cierra sola cuando el dato esté guardado',
    loading: 'Cargando tu semana...',
    errorTitle: 'No hemos podido cargar tu semana',
    errorText: 'Comprueba tu conexión e inténtalo de nuevo.',
    retry: 'Reintentar',
    noBusinessTitle: 'Aún no hay ningún negocio',
    noBusinessText: 'Crea tu negocio para recibir tu plan semanal.',
    emptyTitle: 'Aún no tienes tareas',
    emptyText: 'Completa los datos de tu negocio para recibir tus primeras tareas.',
    completeProfile: 'Completar datos',
    incompleteProfile: 'Tu perfil está incompleto. Con más datos, las tareas serán más precisas.',
    missingSources: 'Algunas fuentes de datos todavía no están disponibles. Conéctalas para obtener recomendaciones más precisas.',
    connectSources: 'Ver fuentes',
    failStart: 'No hemos podido empezar esta tarea. Inténtalo de nuevo.',
    failComplete: 'No hemos podido marcarla como hecha. Sigue pendiente; inténtalo de nuevo.',
    failDismiss: 'No hemos podido descartarla. Inténtalo de nuevo.',
    locked: 'Para esto necesitas una prueba activa o una suscripción. Tus tareas siguen guardadas.',
    close: 'Cerrar',
  },
  en: {
    weekOf: (from, to) => `Week of ${from} to ${to}`,
    purpose: 'The most important tasks for your business this week, in priority order, with the reason for each one.',
    goal: 'Goal',
    progressTitle: 'Weekly progress',
    progressCount: (d, t) => `${d} of ${t} tasks closed`,
    progressEmpty: 'There are no tasks to count yet this week.',
    progressChanges: 'If new tasks appear, the percentage can go down even though you have not lost anything.',
    focusTitle: 'This week’s priorities',
    focusEmpty: 'You have no pending tasks this week.',
    laterTitle: (n) => `For later (${n})`,
    activityTitle: 'This week’s activity',
    activityEmpty: 'You have not closed any tasks this week yet.',
    executed: 'Done by you',
    resolved: 'Resolved when your details were updated',
    dismissed: 'Dismissed by you',
    outdated: 'No longer apply',
    notCounted: 'Not counted in progress',
    why: 'Why',
    source: 'Source',
    priority: 'Priority',
    effort: 'Effort',
    states: {
      pending: 'Pending', in_progress: 'In progress', executed: 'Done by you',
      data_completed: 'Resolved with your details', dismissed: 'Dismissed', outdated: 'No longer applies',
    },
    markDone: 'Mark as done',
    dismiss: 'Dismiss',
    view: 'View',
    autoClose: 'Closes on its own once the detail is saved',
    loading: 'Loading your week...',
    errorTitle: 'We could not load your week',
    errorText: 'Check your connection and try again.',
    retry: 'Retry',
    noBusinessTitle: 'No business yet',
    noBusinessText: 'Create your business to receive your weekly plan.',
    emptyTitle: 'You have no tasks yet',
    emptyText: 'Complete your business details to receive your first tasks.',
    completeProfile: 'Complete details',
    incompleteProfile: 'Your profile is incomplete. With more details, your tasks will be more precise.',
    missingSources: 'Some data sources are not yet available. Connect them for more precise recommendations.',
    connectSources: 'View sources',
    failStart: "We couldn't start this task. Please try again.",
    failComplete: "We couldn't mark it as done. It is still pending; please try again.",
    failDismiss: "We couldn't dismiss it. Please try again.",
    locked: 'This needs an active trial or subscription. Your tasks are still saved.',
    close: 'Close',
  },
};
