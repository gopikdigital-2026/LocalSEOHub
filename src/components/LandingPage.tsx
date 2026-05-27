import { MapPin, Zap, TrendingUp, Shield, Star, Check, ArrowRight, Sparkles } from 'lucide-react';

interface LandingPageProps {
  onLoginClick: () => void;
  scrollToPricing?: boolean;
}

const BENEFITS = [
  {
    icon: <MapPin size={20} />,
    title: 'SEO Local sin esfuerzo',
    desc: 'Genera contenido optimizado para tu ciudad en segundos, sin conocimientos técnicos.',
  },
  {
    icon: <TrendingUp size={20} />,
    title: 'Más clientes locales',
    desc: 'Aparece primero cuando alguien busca tu producto en tu ciudad. Convierte búsquedas en ventas.',
  },
  {
    icon: <Zap size={20} />,
    title: 'Listo para publicar',
    desc: 'Títulos, descripciones y etiquetas listos para Etsy, Shopify, Amazon o Google Business.',
  },
  {
    icon: <Shield size={20} />,
    title: 'IA entrenada en SEO local',
    desc: 'Nuestro motor entiende las búsquedas locales y genera textos que Google ama.',
  },
];

const TESTIMONIALS = [
  {
    name: 'Marta G.',
    city: 'Toledo',
    business: 'Cerámica artesanal',
    text: 'En 2 semanas tripl​iqué las visitas a mi tienda de Etsy. No sabía nada de SEO.',
    stars: 5,
  },
  {
    name: 'Carlos R.',
    city: 'Valencia',
    business: 'Reparación de móviles',
    text: 'Mi Google Business aparece ahora en el top 3 de Valencia. Increíble herramienta.',
    stars: 5,
  },
  {
    name: 'Laura M.',
    city: 'Sevilla',
    business: 'Floristería online',
    text: 'Genera en 30 segundos lo que antes me costaba horas escribir. Vale cada euro.',
    stars: 5,
  },
];

export default function LandingPage({ onLoginClick }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute top-20 left-1/4 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto px-6 pt-20 pb-24 text-center relative">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-emerald-400 mb-8">
            <Sparkles size={12} />
            Potenciado por Inteligencia Artificial
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6 tracking-tight">
            Atrae clientes locales en<br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              tu ciudad sin saber de SEO
            </span>
          </h1>

          <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            LocalSEO AI genera en segundos los títulos, descripciones y etiquetas perfectas
            para posicionarte en tu ciudad — en Etsy, Shopify, Amazon o Google Business.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={onLoginClick}
              className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all duration-300
                bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                text-slate-950 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0"
            >
              Empieza gratis ahora
              <ArrowRight size={18} />
            </button>
            <p className="text-xs text-slate-600">Sin tarjeta de crédito · Cancela cuando quieras</p>
          </div>

          {/* Social proof strip */}
          <div className="flex items-center justify-center gap-6 mt-12 flex-wrap">
            <div className="flex items-center gap-1.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
              ))}
              <span className="text-slate-400 text-sm ml-1">4.9/5</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <span className="text-slate-400 text-sm">+2.400 negocios locales confían en nosotros</span>
            <div className="w-px h-4 bg-slate-700 hidden sm:block" />
            <span className="text-slate-400 text-sm hidden sm:block">Disponible en toda España</span>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Todo lo que necesitas para dominar el SEO local
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Sin cursos, sin agencias caras, sin horas de trabajo manual.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="group rounded-2xl bg-slate-900/60 border border-slate-800/60 p-6 hover:border-emerald-500/20 hover:bg-slate-900/80 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 group-hover:bg-emerald-500/15 transition-colors">
                {b.icon}
              </div>
              <h3 className="font-semibold text-white mb-2">{b.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white mb-2">Lo que dicen nuestros clientes</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="rounded-2xl bg-slate-900/60 border border-slate-800/60 p-5 space-y-3">
              <div className="flex gap-0.5">
                {[...Array(t.stars)].map((_, i) => (
                  <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
                ))}
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">"{t.text}"</p>
              <div className="pt-1 border-t border-slate-800">
                <p className="text-white text-xs font-semibold">{t.name}</p>
                <p className="text-slate-500 text-xs">{t.business} · {t.city}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Precio simple y transparente</h2>
          <p className="text-slate-400">Sin sorpresas. Sin letra pequeña.</p>
        </div>

        <div className="flex justify-center">
          <div className="relative w-full max-w-sm">
            {/* Popular badge */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
              <span className="bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-bold px-4 py-1 rounded-full shadow-lg shadow-emerald-500/30">
                MAS POPULAR
              </span>
            </div>

            <div className="rounded-2xl bg-slate-900 border-2 border-emerald-500/40 p-8 shadow-2xl shadow-emerald-500/10">
              <div className="text-center mb-6">
                <p className="text-slate-400 text-sm font-medium mb-2">Plan Pro</p>
                <div className="flex items-end justify-center gap-1">
                  <span className="text-5xl font-bold text-white">9.99</span>
                  <span className="text-slate-400 mb-2">€/mes</span>
                </div>
                <p className="text-slate-500 text-xs mt-1">Facturado mensualmente · Cancela cuando quieras</p>
              </div>

              <ul className="space-y-3 mb-8">
                {[
                  'Generaciones ilimitadas de contenido SEO',
                  'Optimización para 4 plataformas',
                  'SEO localizado en toda España',
                  'Títulos, descripciones y etiquetas',
                  'Botón de copia con 1 clic',
                  'Actualizaciones del motor IA incluidas',
                  'Soporte prioritario por email',
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-slate-300">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={11} className="text-emerald-400" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={onLoginClick}
                className="w-full py-4 rounded-xl font-bold text-sm transition-all duration-300
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
              >
                Empezar con Plan Pro
              </button>

              <p className="text-center text-xs text-slate-600 mt-3">
                14 días de prueba gratuita incluidos
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            Listo para aparecer en las búsquedas de tu ciudad
          </h2>
          <p className="text-slate-400 mb-8 max-w-lg mx-auto">
            Únete a miles de negocios locales que ya generan más clientes con LocalSEO AI.
          </p>
          <button
            onClick={onLoginClick}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all duration-300
              bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
              text-slate-950 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
          >
            Crear cuenta gratis
            <ArrowRight size={18} />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/50 py-6">
        <div className="max-w-5xl mx-auto px-6 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <Zap size={10} className="text-slate-950" fill="currentColor" />
            </div>
            <span className="text-xs text-slate-600 font-medium">LocalSEO AI</span>
          </div>
          <p className="text-xs text-slate-700">© 2026 LocalSEO AI · Todos los derechos reservados</p>
        </div>
      </footer>
    </div>
  );
}
