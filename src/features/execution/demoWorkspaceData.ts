import type { ReviewItem, PostDraft, ProfileOptimization } from './types';

export const demoReviews: ReviewItem[] = [
  {
    id: 'review-001',
    author: 'Maria Garcia',
    rating: 4,
    text: 'Buen servicio en general, aunque tuve que esperar un poco mas de lo esperado. El resultado final fue excelente.',
    date: '2026-07-20',
    suggestedResponse: 'Hola Maria, muchas gracias por tu valoracion. Lamentamos la espera y nos alegra que el resultado final te haya gustado. Estamos trabajando para mejorar nuestros tiempos. Esperamos verte pronto.',
  },
  {
    id: 'review-002',
    author: 'Carlos Lopez',
    rating: 5,
    text: 'Increible atencion al cliente. Me explicaron todo con paciencia y el resultado supero mis expectativas. 100% recomendable.',
    date: '2026-07-22',
    suggestedResponse: 'Muchas gracias Carlos, tu comentario nos motiva a seguir dando lo mejor. Nos encanta saber que la experiencia fue positiva. Te esperamos cuando necesites.',
  },
  {
    id: 'review-003',
    author: 'Ana Martinez',
    rating: 3,
    text: 'El servicio es correcto pero el local necesita una renovacion. Los precios son competitivos.',
    date: '2026-07-23',
    suggestedResponse: 'Hola Ana, gracias por compartir tu opinion. Tomamos nota sobre las instalaciones, estamos planificando mejoras para los proximos meses. Valoramos tu sinceridad y esperamos sorprenderte en tu proxima visita.',
  },
  {
    id: 'review-004',
    author: 'Pedro Sanchez',
    rating: 5,
    text: 'De los mejores servicios que he probado en la zona. Profesionales y rapidos.',
    date: '2026-07-24',
    suggestedResponse: 'Pedro, muchas gracias por tus palabras. Nos esforzamos por ofrecer un servicio profesional y agil. Es un placer tenerte como cliente.',
  },
  {
    id: 'review-005',
    author: 'Laura Fernandez',
    rating: 4,
    text: 'Muy satisfecha con el resultado. La relacion calidad-precio es muy buena.',
    date: '2026-07-24',
    suggestedResponse: 'Gracias Laura, nos alegra mucho que estes satisfecha. Trabajamos para mantener la mejor relacion calidad-precio de la zona. Te esperamos pronto.',
  },
];

export const demoPostDraft: PostDraft = {
  title: 'Novedades de verano en nuestro negocio',
  body: 'Este verano queremos compartir las ultimas novedades con nuestros clientes. Hemos incorporado nuevos servicios pensados para ti. Visitanos y descubre todo lo que podemos hacer por ti. Horario de verano: Lunes a Viernes de 9:00 a 14:00 y de 17:00 a 20:00.',
  callToAction: 'Reserva tu cita',
};

export const demoProfileOptimizations: ProfileOptimization[] = [
  {
    field: 'Descripcion del negocio',
    current: 'Somos un negocio local dedicado a ofrecer servicios de calidad.',
    proposed: 'Somos un negocio local en Madrid especializado en servicios profesionales para particulares y empresas. Ubicados en el centro, ofrecemos atencion personalizada con mas de 10 anos de experiencia en la zona.',
  },
  {
    field: 'Categorias',
    current: 'Servicios locales',
    proposed: 'Servicios locales, Servicios profesionales, Consultoria',
  },
  {
    field: 'Atributos',
    current: 'Sin atributos configurados',
    proposed: 'Accesible para sillas de ruedas, Wifi gratuito, Pago con tarjeta, Cita previa disponible',
  },
];

export const demoContentIdeas = [
  {
    id: 'content-001',
    title: 'Guia: Como elegir el mejor servicio para tu necesidad',
    type: 'Blog post',
    estimatedWords: 600,
    outline: [
      'Introduccion: Por que es importante elegir bien',
      'Factor 1: Experiencia y trayectoria',
      'Factor 2: Opiniones de otros clientes',
      'Factor 3: Relacion calidad-precio',
      'Conclusion: Nuestro compromiso',
    ],
  },
  {
    id: 'content-002',
    title: '5 razones para confiar en un profesional local',
    type: 'Google Post',
    estimatedWords: 150,
    outline: [
      'Cercania y accesibilidad',
      'Conocimiento del mercado local',
      'Atencion personalizada',
      'Compromiso con la comunidad',
      'Garantia y seguimiento',
    ],
  },
];
