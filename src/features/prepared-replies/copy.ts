import type { BookingMethod, MissingFact, ReplyCategory, ReplyProblem } from './model';

export interface RepliesCopy {
  title: string;
  intro: string;
  questions: Record<ReplyCategory, string>;
  status: { saved: string; edited: string; suggested: string; missing: string; review: string };
  savedSummary: (saved: number, total: number) => string;
  suggestedNote: string;
  edit: string;
  save: string;
  saving: string;
  cancel: string;
  copy: string;
  copied: string;
  copiedNote: string;
  copyError: string;
  close: string;
  unsaved: string;
  chars: (n: number, max: number) => string;
  editLabel: (question: string) => string;
  problems: Record<ReplyProblem, string>;
  saveError: string;
  conflict: string;
  loadLatest: string;
  lockedSave: string;
  lockedIntro: string;
  loadError: string;
  retry: string;
  staleNote: string;
  staleMissing: string;
  refresh: string;
  refreshNote: string;
  missingTitle: string;
  missingFacts: Record<MissingFact, string>;
  completeProfile: string;
  address: { label: string; placeholder: string; note: string; change: string; tooLong: string };
  booking: { prompt: string; change: string; options: Record<BookingMethod, string> };
  detailsSaved: string;
  showAll: string;
  hideAll: string;
}

export const REPLIES_COPY: Record<'es' | 'en', RepliesCopy> = {
  es: {
    title: 'Tus respuestas preparadas',
    intro: 'Ten listas las respuestas a las preguntas habituales de tus clientes. Edítalas y cópialas cuando las necesites.',
    questions: {
      location: '¿Dónde está vuestro negocio?',
      services: '¿Qué servicios ofrecéis?',
      hours: '¿Cuál es vuestro horario?',
      booking: '¿Cómo puedo pedir una cita?',
      contact: '¿Cómo puedo contactar con vosotros?',
    },
    status: { saved: 'Guardada', edited: 'Editada por ti', suggested: 'Sugerida', missing: 'Faltan datos', review: 'Revisar' },
    savedSummary: (s, t) => `${s} de ${t} guardadas`,
    suggestedNote: 'Sugerencia creada con los datos de tu negocio. Revísala y guárdala para tenerla siempre a mano.',
    edit: 'Editar',
    save: 'Guardar',
    saving: 'Guardando…',
    cancel: 'Cancelar',
    copy: 'Copiar',
    copied: 'Copiada',
    copiedNote: 'Copiada al portapapeles. No se ha enviado nada: pégala donde quieras.',
    copyError: 'No hemos podido copiar el texto. Selecciónalo y cópialo manualmente.',
    close: 'Cerrar',
    unsaved: 'Cambios sin guardar',
    chars: (n, max) => `${n}/${max}`,
    editLabel: (q) => `Respuesta a: ${q}`,
    problems: {
      empty: 'La respuesta no puede quedar vacía.',
      too_long: 'La respuesta es demasiado larga.',
      invalid_chars: 'La respuesta contiene caracteres no válidos.',
    },
    saveError: 'No hemos podido guardar. Inténtalo de nuevo en unos segundos.',
    conflict: 'Esta respuesta se ha cambiado en otra pestaña. Carga la versión más reciente antes de seguir.',
    loadLatest: 'Cargar la versión más reciente',
    lockedSave: 'Guardar respuestas está disponible durante la prueba gratuita o con una suscripción activa.',
    lockedIntro: 'Puedes consultar y copiar tus respuestas guardadas. Para preparar o editar respuestas necesitas la prueba gratuita o una suscripción activa.',
    loadError: 'No hemos podido cargar tus respuestas.',
    retry: 'Reintentar',
    staleNote: 'Los datos de tu negocio han cambiado desde que se guardó esta respuesta. Puede que esté desactualizada.',
    staleMissing: 'Algunos datos que usaba esta respuesta ya no están en tu perfil. Revísala antes de usarla.',
    refresh: 'Actualizar con mis datos actuales',
    refreshNote: 'Hemos cargado la sugerencia con tus datos actuales. Revísala y pulsa Guardar para sustituir la anterior.',
    missingTitle: 'Para preparar esta respuesta necesitamos:',
    missingFacts: {
      name: 'El nombre de tu negocio',
      address: 'La dirección de tu negocio',
      services: 'Los servicios que ofreces',
      schedule: 'Tu horario',
      contact: 'Un teléfono o una web de contacto',
      booking: 'Cómo pueden pedir cita tus clientes',
      phone: 'Un teléfono (has indicado que las citas se piden por teléfono)',
      website: 'Tu web (has indicado que las citas se piden desde la web)',
    },
    completeProfile: 'Completar perfil del negocio',
    address: {
      label: 'Dirección del negocio',
      placeholder: 'Ej.: Calle Mayor 12, local 3',
      note: 'Escríbela tal y como quieres que la vean tus clientes.',
      change: 'Cambiar dirección',
      tooLong: 'La dirección es demasiado larga.',
    },
    booking: {
      prompt: 'Indica cómo pueden pedir cita tus clientes. No damos por hecho que tengas un sistema de reservas.',
      change: 'Cambiar forma de pedir cita',
      options: {
        phone: 'Llamando por teléfono',
        website: 'Desde mi web',
        in_person: 'En persona, en el local',
        walk_in: 'No hace falta cita',
      },
    },
    detailsSaved: 'Datos guardados.',
    showAll: 'Ver mis respuestas',
    hideAll: 'Ocultar respuestas',
  },
  en: {
    title: 'Your prepared replies',
    intro: 'Keep answers to your customers\' usual questions ready. Edit them and copy them whenever you need them.',
    questions: {
      location: 'Where is your business?',
      services: 'What services do you offer?',
      hours: 'What are your opening hours?',
      booking: 'How can I book an appointment?',
      contact: 'How can I get in touch with you?',
    },
    status: { saved: 'Saved', edited: 'Edited by you', suggested: 'Suggested', missing: 'Missing info', review: 'Review' },
    savedSummary: (s, t) => `${s} of ${t} saved`,
    suggestedNote: 'Suggestion built from your business details. Review it and save it to keep it at hand.',
    edit: 'Edit',
    save: 'Save',
    saving: 'Saving…',
    cancel: 'Cancel',
    copy: 'Copy',
    copied: 'Copied',
    copiedNote: 'Copied to the clipboard. Nothing has been sent: paste it wherever you like.',
    copyError: 'We couldn\'t copy the text. Select it and copy it manually.',
    close: 'Close',
    unsaved: 'Unsaved changes',
    chars: (n, max) => `${n}/${max}`,
    editLabel: (q) => `Reply to: ${q}`,
    problems: {
      empty: 'The reply can\'t be empty.',
      too_long: 'The reply is too long.',
      invalid_chars: 'The reply contains invalid characters.',
    },
    saveError: 'We couldn\'t save. Please try again in a few seconds.',
    conflict: 'This reply was changed in another tab. Load the latest version before continuing.',
    loadLatest: 'Load the latest version',
    lockedSave: 'Saving replies is available during the free trial or with an active subscription.',
    lockedIntro: 'You can view and copy your saved replies. To prepare or edit replies you need the free trial or an active subscription.',
    loadError: 'We couldn\'t load your replies.',
    retry: 'Retry',
    staleNote: 'Your business details have changed since this reply was saved. It may be out of date.',
    staleMissing: 'Some details this reply used are no longer in your profile. Review it before using it.',
    refresh: 'Update with my current details',
    refreshNote: 'We loaded the suggestion with your current details. Review it and press Save to replace the previous one.',
    missingTitle: 'To prepare this reply we need:',
    missingFacts: {
      name: 'Your business name',
      address: 'Your business address',
      services: 'The services you offer',
      schedule: 'Your opening hours',
      contact: 'A contact phone or website',
      booking: 'How customers can book an appointment',
      phone: 'A phone number (you said appointments are booked by phone)',
      website: 'Your website (you said appointments are booked online)',
    },
    completeProfile: 'Complete business profile',
    address: {
      label: 'Business address',
      placeholder: 'e.g. 12 High Street, Unit 3',
      note: 'Write it exactly as you want customers to see it.',
      change: 'Change address',
      tooLong: 'The address is too long.',
    },
    booking: {
      prompt: 'Tell us how customers can book an appointment. We don\'t assume you have a booking system.',
      change: 'Change how to book',
      options: {
        phone: 'By phone',
        website: 'On my website',
        in_person: 'In person, at the premises',
        walk_in: 'No appointment needed',
      },
    },
    detailsSaved: 'Details saved.',
    showAll: 'View my replies',
    hideAll: 'Hide replies',
  },
};
