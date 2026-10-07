export type Lang = 'es' | 'en';

const COPY = {
  es: {
    welcomeTitle: 'Vamos a preparar tus primeras acciones',
    welcomeText: 'LocalSEOHub te indica qué hacer, paso a paso, para que más clientes de tu zona encuentren tu negocio.',
    welcomeTime: 'Menos de 2 minutos',
    welcomeItems: ['Dos preguntas rápidas sobre tu negocio', 'Tus primeras acciones, ordenadas por prioridad', 'No necesitas conectar Google para empezar'],
    start: 'Empezar',
    step: (n: number, total: number) => `Paso ${n} de ${total}`,
    bizTitle: 'Tu negocio',
    bizHelper: 'Con esto adaptamos las recomendaciones a tu tipo de negocio y a tu zona.',
    name: 'Nombre del negocio', namePh: 'Ej: Clínica Dental Sonríe', nameErr: 'El nombre es necesario',
    category: 'Actividad', categoryPh: 'Ej: Restaurante, Clínica, Peluquería...', categoryErr: 'Indica a qué se dedica tu negocio',
    city: 'Ciudad o zona', cityPh: 'Ej: Madrid', cityErr: 'Indica la ciudad o zona donde trabajas',
    website: 'Sitio web (opcional)', websiteHelper: 'Si tienes web la tendremos en cuenta. Puedes añadirla más tarde.',
    goalTitle: '¿Cuál es tu objetivo principal?',
    goalHelper: 'Lo utilizaremos para priorizar las acciones que más pueden ayudarte. Podrás cambiarlo cuando quieras.',
    back: 'Atrás', next: 'Continuar', finish: 'Ver mis acciones', saving: 'Guardando...',
    saveError: 'No hemos podido guardar este paso. Tus datos siguen aquí; inténtalo de nuevo.',
    finishingTitle: 'Preparando tu primer plan',
    finishingText: 'Estamos guardando tu negocio y ordenando tus primeras acciones.',
    finishError: 'No hemos podido guardar tu negocio. No se ha perdido nada de lo que has escrito.',
    retry: 'Reintentar', reset: 'Empezar de nuevo',
  },
  en: {
    welcomeTitle: "Let's prepare your first actions",
    welcomeText: 'LocalSEOHub tells you what to do, step by step, so more customers near you find your business.',
    welcomeTime: 'Under 2 minutes',
    welcomeItems: ['Two quick questions about your business', 'Your first actions, ordered by priority', 'No need to connect Google to get started'],
    start: 'Start',
    step: (n: number, total: number) => `Step ${n} of ${total}`,
    bizTitle: 'Your business',
    bizHelper: 'This lets us tailor recommendations to your type of business and your area.',
    name: 'Business name', namePh: 'E.g. Smile Dental Clinic', nameErr: 'The name is required',
    category: 'Activity', categoryPh: 'E.g. Restaurant, Clinic, Hair salon...', categoryErr: 'Tell us what your business does',
    city: 'City or area', cityPh: 'E.g. Madrid', cityErr: 'Tell us the city or area you work in',
    website: 'Website (optional)', websiteHelper: 'If you have a website we will take it into account. You can add it later.',
    goalTitle: 'What is your main goal?',
    goalHelper: 'We use it to prioritise the actions that can help you most. You can change it at any time.',
    back: 'Back', next: 'Continue', finish: 'See my actions', saving: 'Saving...',
    saveError: "We couldn't save this step. Your details are still here; please try again.",
    finishingTitle: 'Preparing your first plan',
    finishingText: 'We are saving your business and ordering your first actions.',
    finishError: "We couldn't save your business. Nothing you typed has been lost.",
    retry: 'Retry', reset: 'Start over',
  },
};

export function onboardingCopy(lang: Lang) {
  return COPY[lang];
}
