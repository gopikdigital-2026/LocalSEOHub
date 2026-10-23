import type { RoadmapPhase } from './model';

interface RoadmapCopy {
  heading: string;
  subtitle: string;
  phases: Record<RoadmapPhase, { title: string; hint: string }>;
  inProgress: string;
  continueCta: string;
  cta: string;
  emptyTitle: string;
  emptyText: string;
  emptyCta: string;
  missionsNote: string;
}

export const ROADMAP_COPY: Record<'es' | 'en', RoadmapCopy> = {
  es: {
    heading: 'Tu hoja de ruta',
    subtitle: 'Las mejoras pendientes en el mismo orden que ves en Hoy. Cada una desaparece sola cuando guardas el dato que falta.',
    phases: {
      now: { title: 'Ahora', hint: 'Lo mismo que ves en Hoy.' },
      next: { title: 'Siguiente', hint: 'Lo que viene después de tus prioridades.' },
      later: { title: 'Después', hint: 'Mejoras útiles para más adelante.' },
    },
    inProgress: 'En curso',
    continueCta: 'Continuar',
    cta: 'Ir ahora',
    emptyTitle: 'Tu hoja de ruta no tiene mejoras prioritarias pendientes ahora',
    emptyText: 'Con los datos que tenemos de tu negocio no vemos nada importante que completar. Puedes revisar tus herramientas cuando quieras.',
    emptyCta: 'Ver herramientas',
    missionsNote: 'Debajo siguen tus misiones de la semana: ahí puedes empezar, completar o descartar tareas.',
  },
  en: {
    heading: 'Your roadmap',
    subtitle: 'Your pending improvements in the same order you see on Today. Each one disappears on its own once you save the missing detail.',
    phases: {
      now: { title: 'Now', hint: 'The same as you see on Today.' },
      next: { title: 'Next', hint: 'What comes after your priorities.' },
      later: { title: 'Later', hint: 'Useful improvements for later on.' },
    },
    inProgress: 'In progress',
    continueCta: 'Continue',
    cta: 'Go now',
    emptyTitle: 'Your roadmap has no priority improvements pending right now',
    emptyText: 'With the details we have about your business, we see nothing important to complete. You can review your tools whenever you like.',
    emptyCta: 'View tools',
    missionsNote: 'Your weekly missions are still below: that is where you can start, complete or dismiss tasks.',
  },
};
