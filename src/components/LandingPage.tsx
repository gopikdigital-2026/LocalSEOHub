import {
  MapPin, Zap, TrendingUp, Shield, Star, Check, ArrowRight, Sparkles,
  Eye, Globe, Target, Calendar, MapPinned, ChevronRight, X, HelpCircle,
  Clock, Users, Award, BarChart3, Flame, BadgeCheck, ChevronDown,
} from 'lucide-react';
import { useState } from 'react';
import { PrivacyModal, TermsModal, ContactModal, type LegalModal } from './LegalModals';
import { LogoIcon } from './Logo';

interface LandingPageProps {
  onLoginClick: () => void;
  onSubscribeClick: () => void;
  scrollToPricing?: boolean;
}

const PLATFORMS = [
  'Etsy', 'Shopify', 'Amazon', 'Google Business', 'Wallapop',
  'Vinted', 'eBay', 'Instagram', 'TripAdvisor', 'Booking.com',
  'WooCommerce', 'Doctoralia', 'Habitissimo', 'Treatwell', 'Facebook Marketplace', 'Web propia',
];

const PAIN_POINTS = [
  'Publicas en redes pero nadie de tu ciudad te encuentra',
  'Tu ficha de Google Maps está a medias y no sabes cómo mejorarla',
  'Tus competidores aparecen antes que tú en Google aunque llevas más tiempo',
  'Pasas horas escribiendo textos y no sabes si están bien optimizados',
  'No sabes si ChatGPT o Google IA te recomiendan cuando alguien busca tu servicio',
];

const TOOLS = [
  {
    icon: <Sparkles size={22} />,
    badge: 'Core',
    title: 'Generador SEO Local',
    desc: 'Título, descripción y etiquetas perfectas para tu ciudad y plataforma en 30 segundos. También analiza tu foto y crea el alt text.',
    color: 'from-emerald-500/10 to-teal-500/5',
    border: 'border-emerald-500/20',
    iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  },
  {
    icon: <MapPinned size={22} />,
    badge: 'Maps',
    title: 'Escáner de Ficha Maps',
    desc: 'Audita tu Google Business Profile con IA. Puntuación de optimización + recomendaciones concretas listas para aplicar.',
    color: 'from-blue-500/10 to-sky-500/5',
    border: 'border-blue-500/20',
    iconBg: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  },
  {
    icon: <Eye size={22} />,
    badge: 'Twin',
    title: 'AI Digital Twin',
    desc: 'Mapa de calor interactivo que muestra en qué zonas de tu ciudad dominas y dónde te bloquean los competidores.',
    color: 'from-cyan-500/10 to-sky-500/5',
    border: 'border-cyan-500/20',
    iconBg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
  },
  {
    icon: <Target size={22} />,
    badge: 'Radar',
    title: 'Radar de Competencia',
    desc: 'Pega la URL de cualquier rival y obtén sus keywords, puntos débiles y cómo superarles en tiempo real.',
    color: 'from-orange-500/10 to-amber-500/5',
    border: 'border-orange-500/20',
    iconBg: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
  },
  {
    icon: <Globe size={22} />,
    badge: 'GEO',
    title: 'GEO Audit — Visibilidad en IA',
    desc: 'Descubre si ChatGPT, Gemini o Perplexity mencionan tu negocio. Mide tu AI Search Visibility Score.',
    color: 'from-teal-500/10 to-cyan-500/5',
    border: 'border-teal-500/20',
    iconBg: 'bg-teal-500/10 border-teal-500/20 text-teal-400',
  },
  {
    icon: <Calendar size={22} />,
    badge: 'Plan',
    title: 'Plan de Contenido & Directorios',
    desc: 'Plan editorial semanal con posts y hashtags locales. Escáner de directorios para aparecer donde buscan tus clientes.',
    color: 'from-rose-500/10 to-pink-500/5',
    border: 'border-rose-500/20',
    iconBg: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
  },
];

const TESTIMONIALS = [
  {
    name: 'Marta G.',
    city: 'Toledo',
    business: 'Cerámica artesanal',
    text: 'En 2 semanas tripliqué las visitas a mi tienda de Etsy. No sabía nada de SEO y ahora aparezco en la primera página.',
    stars: 5,
    metric: '+312% visitas en Etsy',
    initials: 'MG',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    name: 'Carlos R.',
    city: 'Valencia',
    business: 'Reparación de móviles',
    text: 'Mi Google Business está ahora en el top 3 de Valencia. El escáner de Maps me dijo exactamente qué estaba fallando.',
    stars: 5,
    metric: 'Top 3 Google Maps Valencia',
    initials: 'CR',
    color: 'from-blue-500 to-cyan-600',
  },
  {
    name: 'Laura M.',
    city: 'Sevilla',
    business: 'Floristería online',
    text: 'Genera en 30 segundos lo que antes me costaba 2 horas escribir. Vale cada euro y el soporte es inmediato.',
    stars: 5,
    metric: '2h ahorradas por producto',
    initials: 'LM',
    color: 'from-rose-500 to-pink-600',
  },
];

const FAQS = [
  {
    q: '¿Necesito poner mi tarjeta para empezar?',
    a: 'No. Para los 7 días de prueba solo necesitas un email y una contraseña — sin tarjeta, sin datos bancarios, sin compromisos. Solo si decides continuar al finalizar el trial, se te pedirán los datos de pago para activar el plan mensual.',
  },
  {
    q: '¿Cuándo tendré que poner mi tarjeta?',
    a: 'Únicamente a partir del día 8, si quieres seguir usando LocalSEOHub. Recibirás un email de aviso antes de que termine la prueba. Si no haces nada o decides no continuar, tu cuenta simplemente queda en modo gratuito y no se te cobra absolutamente nada.',
  },
  {
    q: '¿Funciona para mi tipo de negocio?',
    a: 'LocalSEOHub está diseñado para cualquier negocio local: tiendas físicas, servicios a domicilio, negocios online con venta local, restaurantes, clínicas, freelancers... Si tienes clientes en una ciudad, esto es para ti.',
  },
  {
    q: '¿Tengo que instalar algo?',
    a: 'No. Todo funciona desde el navegador, sin instalaciones ni configuraciones técnicas. En menos de 60 segundos tienes tu primer contenido generado.',
  },
  {
    q: '¿Qué pasa si quiero cancelar después de suscribirme?',
    a: 'Cancelas en un clic desde tu panel. Sin formularios, sin llamadas, sin preguntas. Tu acceso Pro se mantiene hasta el fin del período ya pagado.',
  },
];

const COMPARISON_ROWS = [
  { label: 'Coste mensual', bad: '800–2.000€/mes', good: '9,99€/mes' },
  { label: 'Tiempo en resultados', bad: '3–6 meses', good: 'Desde el primer día' },
  { label: 'Conocimiento técnico', bad: 'Necesitas aprender SEO', good: 'Cero conocimientos' },
  { label: 'Visibilidad en IA (ChatGPT)', bad: 'Sin seguimiento', good: 'GEO Audit incluido' },
  { label: 'Radar de competencia', bad: 'Herramientas de pago aparte', good: 'Incluido en el plan' },
  { label: 'Exportación a Etsy / Shopify', bad: 'Manual y lento', good: 'CSV en 1 clic' },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/70 transition-colors overflow-hidden"
    >
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <span className="text-sm font-semibold text-white">{q}</span>
        <div className={`shrink-0 w-5 h-5 rounded-full border border-slate-700 flex items-center justify-center transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <ChevronDown size={11} className="text-slate-400" />
        </div>
      </div>
      {open && (
        <div className="px-5 pb-4 border-t border-slate-800/60">
          <p className="text-slate-400 text-sm leading-relaxed pt-3">{a}</p>
        </div>
      )}
    </button>
  );
}

function ProductMockup() {
  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 to-teal-500/5 rounded-3xl blur-2xl scale-95" />
      <div className="relative rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-950">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-amber-500/60" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
          </div>
          <div className="flex-1 mx-3 h-5 rounded-md bg-slate-800 flex items-center px-3">
            <span className="text-slate-600 text-[10px]">localseohub.io</span>
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="h-2 w-20 rounded bg-slate-700/60" />
              <div className="h-9 rounded-lg border border-slate-700/60 bg-slate-800/80 flex items-center px-3 gap-2">
                <div className="w-3 h-3 rounded-sm bg-emerald-500/40" />
                <div className="h-1.5 w-28 rounded bg-slate-600/60" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-14 rounded bg-slate-700/60" />
              <div className="h-9 rounded-lg border border-slate-700/60 bg-slate-800/80 flex items-center px-3 gap-2">
                <MapPin size={12} className="text-slate-600" />
                <div className="h-1.5 w-16 rounded bg-slate-600/60" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-24 rounded bg-slate-700/60" />
              <div className="h-9 rounded-lg border border-slate-700/60 bg-slate-800/80 flex items-center px-3 gap-2">
                <div className="h-1.5 w-20 rounded bg-slate-600/60" />
              </div>
            </div>
            <button className="w-full h-9 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center gap-2 mt-1">
              <Sparkles size={13} className="text-slate-950" />
              <span className="text-slate-950 text-xs font-bold">Generar SEO</span>
            </button>
          </div>
          <div className="space-y-2.5">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <div className="h-1.5 w-10 rounded bg-emerald-500/40" />
              </div>
              <div className="h-1.5 w-full rounded bg-slate-600/50" />
              <div className="h-1.5 w-4/5 rounded bg-slate-600/40" />
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                <div className="h-1.5 w-14 rounded bg-slate-600/50" />
              </div>
              <div className="h-1.5 w-full rounded bg-slate-600/40" />
              <div className="h-1.5 w-full rounded bg-slate-600/40" />
              <div className="h-1.5 w-3/4 rounded bg-slate-600/30" />
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <div className="h-1.5 w-10 rounded bg-slate-600/50" />
              </div>
              <div className="flex flex-wrap gap-1">
                {[40, 28, 36, 22, 32, 24].map((w, i) => (
                  <div key={i} className="h-5 rounded-full bg-emerald-500/15 border border-emerald-500/20" style={{ width: `${w}px` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-500 font-medium">Generado en 3.2 seg</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="h-1.5 w-16 rounded bg-emerald-500/25" />
            <div className="h-5 w-14 rounded-md bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center">
              <span className="text-[9px] text-emerald-400 font-semibold">Copiar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({ onLoginClick }: LandingPageProps) {
  const [legalModal, setLegalModal] = useState<LegalModal>(null);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-emerald-500/6 rounded-full blur-3xl" />
          <div className="absolute top-32 left-1/4 w-72 h-72 bg-teal-500/4 rounded-full blur-3xl" />
          <div className="absolute top-20 right-1/4 w-56 h-56 bg-emerald-600/3 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto px-6 pt-16 pb-10 relative">
          {/* Urgency badge */}
          <div className="flex justify-center mb-7">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-400">
              <Flame size={12} className="text-orange-400" />
              <span>Acceso anticipado — 7 días gratis, sin tarjeta</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-white leading-[1.1] mb-5 tracking-tight text-center">
            Aparece primero en Google{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              cuando alguien busca
            </span>{' '}
            lo que vendes
          </h1>

          <p className="text-center text-slate-400 text-base sm:text-lg max-w-2xl mx-auto mb-7 leading-relaxed">
            LocalSEOHub genera en 30 segundos el SEO que una agencia te cobraría 500€.
            Sin conocimientos técnicos. Sin tarjeta de crédito. Con resultados desde el primer día.
          </p>

          {/* Sub bullets */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 mb-9 text-sm text-slate-300">
            {[
              'SEO local generado con IA en 30 seg',
              'Audita tu Google Maps al instante',
              'Sin cursos ni agencias caras',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <BadgeCheck size={14} className="text-emerald-400 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-3">
            <button
              onClick={onLoginClick}
              className="flex items-center gap-2.5 px-9 py-4 rounded-xl font-bold text-base transition-all duration-300
                bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                text-slate-950 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/45 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Zap size={17} fill="currentColor" />
              Empieza gratis — sin tarjeta
              <ArrowRight size={16} />
            </button>
          </div>

          <p className="text-center text-xs text-slate-600 mb-8">
            ¿Ya tienes cuenta?{' '}
            <button onClick={onLoginClick} className="text-emerald-500 hover:text-emerald-400 transition-colors font-medium">
              Inicia sesión
            </button>
          </p>

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-slate-500 mb-14">
            <div className="flex items-center gap-1.5">
              <Shield size={11} className="text-emerald-500" />
              <span>Sin tarjeta · Sin compromiso</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-teal-500" />
              <span>Resultados en menos de 60 segundos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users size={11} className="text-emerald-400" />
              <span>Acceso anticipado · Plazas limitadas</span>
            </div>
          </div>

          <ProductMockup />
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────────────── */}
      <section className="border-y border-slate-800/60 py-8 mt-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { value: '16+', label: 'Plataformas compatibles', icon: <Globe size={16} className="text-teal-400" /> },
              { value: '< 60 seg', label: 'Para generar contenido', icon: <Clock size={16} className="text-blue-400" /> },
              { value: '6', label: 'Herramientas de IA incluidas', icon: <Sparkles size={16} className="text-emerald-400" /> },
              { value: '4.2h', label: 'Ahorradas por semana', icon: <BarChart3 size={16} className="text-amber-400" /> },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-1.5 mb-0.5">{s.icon}</div>
                <span className="text-2xl font-bold text-white">{s.value}</span>
                <span className="text-xs text-slate-500">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLATFORM STRIP ─────────────────────────────────────────── */}
      <section className="py-8 overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs text-slate-600 uppercase tracking-widest font-semibold mb-5">Compatible con 16+ plataformas</p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
            {PLATFORMS.map((p) => (
              <span key={p} className="text-slate-600 text-sm font-medium hover:text-slate-400 transition-colors cursor-default">{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="rounded-2xl border border-red-500/10 bg-red-500/3 p-8">
          <div className="text-center mb-7">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/15 rounded-full px-3 py-1 mb-3">
              <X size={11} /> ¿Te suena alguna de estas situaciones?
            </div>
            <h2 className="text-2xl font-bold text-white">El problema que tienen miles de negocios locales</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {PAIN_POINTS.map((p) => (
              <div key={p} className="flex items-start gap-3 bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/60">
                <div className="w-5 h-5 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <X size={9} className="text-red-400" />
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-7">
            <p className="text-slate-400 text-sm mb-4">LocalSEOHub resuelve todos estos problemas en una sola plataforma.</p>
            <button
              onClick={onLoginClick}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm
                bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                text-slate-950 shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5 transition-all duration-300"
            >
              Empieza gratis ahora <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* ── 6 TOOLS ────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-full px-3 py-1 mb-3">
            <Award size={11} /> 6 herramientas profesionales
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Todo lo que necesitas en un solo panel</h2>
          <p className="text-slate-400 max-w-xl mx-auto text-sm">Sin agencias, sin cursos, sin horas de trabajo manual. Desde generar contenido hasta espiar a tu competencia o medir si la IA te recomienda.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map((tool) => (
            <div
              key={tool.title}
              className={`group rounded-2xl bg-gradient-to-br ${tool.color} border ${tool.border} p-6 hover:scale-[1.02] transition-all duration-300 flex flex-col`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${tool.iconBg}`}>
                  {tool.icon}
                </div>
                <span className={`text-[10px] font-bold rounded-full px-2.5 py-1 border ${tool.iconBg} opacity-80`}>
                  {tool.badge}
                </span>
              </div>
              <h3 className="font-semibold text-white mb-2 text-sm leading-tight">{tool.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed flex-1">{tool.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-emerald-500 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                <Check size={11} /> Incluido en el plan
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Tan fácil como 1, 2, 3</h2>
          <p className="text-slate-400 text-sm">Sin curva de aprendizaje. En menos de 60 segundos tienes tu primer contenido listo.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative">
          <div className="hidden sm:block absolute top-8 left-[calc(16.66%+1rem)] right-[calc(16.66%+1rem)] h-px bg-gradient-to-r from-emerald-500/20 via-teal-500/30 to-emerald-500/20" />
          {[
            {
              num: '01', title: 'Describe tu negocio',
              desc: 'Nombre del producto o servicio, tu ciudad y la plataforma donde quieres vender. 10 segundos.',
              icon: <MapPin size={20} />,
            },
            {
              num: '02', title: 'La IA lo optimiza todo',
              desc: 'Títulos, descripciones, etiquetas, análisis de competencia y recomendaciones — listos en segundos.',
              icon: <Sparkles size={20} />,
              highlight: true,
            },
            {
              num: '03', title: 'Publica y recibe clientes',
              desc: 'Copia con un clic. Exporta a CSV para Shopify o Etsy. Aplica y empieza a aparecer antes que tu competencia.',
              icon: <TrendingUp size={20} />,
            },
          ].map((step) => (
            <div key={step.num} className="relative flex flex-col items-center text-center p-6">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 z-10 transition-transform duration-300 hover:scale-110
                ${step.highlight
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-slate-950 shadow-xl shadow-emerald-500/30'
                  : 'bg-slate-900 border-2 border-slate-700 text-emerald-400'}`}
              >
                {step.highlight ? step.icon : <span className="text-xl font-bold text-emerald-400">{step.num}</span>}
              </div>
              <h3 className="font-bold text-white mb-2 text-sm">{step.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMPARISON TABLE ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 mb-3">
            <BarChart3 size={11} /> Comparativa real
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Por qué no necesitas una agencia SEO</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">Obtén los mismos resultados — o mejores — por menos del 1% de lo que te cobraría una agencia.</p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-3 text-xs font-bold uppercase tracking-wider">
            <div className="px-5 py-3.5 text-slate-500 bg-slate-900/80 border-b border-slate-800" />
            <div className="px-5 py-3.5 text-slate-500 bg-slate-900/80 border-b border-slate-800 border-l border-slate-800 text-center">Agencia / Hacerlo solo</div>
            <div className="px-5 py-3.5 text-emerald-400 bg-emerald-500/8 border-b border-emerald-500/20 border-l border-emerald-500/20 text-center">LocalSEOHub</div>
          </div>
          {COMPARISON_ROWS.map((row, i) => (
            <div key={row.label} className={`grid grid-cols-3 text-sm ${i < COMPARISON_ROWS.length - 1 ? 'border-b border-slate-800/60' : ''}`}>
              <div className="px-5 py-4 text-slate-300 font-medium bg-slate-900/40">{row.label}</div>
              <div className="px-5 py-4 text-slate-500 bg-slate-900/20 border-l border-slate-800 flex items-center gap-2">
                <X size={13} className="text-red-500/70 shrink-0" />
                {row.bad}
              </div>
              <div className="px-5 py-4 text-emerald-400 bg-emerald-500/5 border-l border-emerald-500/15 flex items-center gap-2 font-medium">
                <Check size={13} className="text-emerald-500 shrink-0" />
                {row.good}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <button
            onClick={onLoginClick}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-sm transition-all duration-300
              bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
              text-slate-950 shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5"
          >
            <Zap size={15} fill="currentColor" />
            Pruébalo gratis 7 días — sin tarjeta
            <ArrowRight size={15} />
          </button>
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-0.5 mb-2">
            {[...Array(5)].map((_, i) => <Star key={i} size={16} className="text-amber-400 fill-amber-400" />)}
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">Lo que dicen nuestros primeros usuarios</h2>
          <p className="text-slate-500 text-sm">Resultados reales · Primeros accesos</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {TESTIMONIALS.map((item) => (
            <div key={item.name} className="rounded-2xl bg-slate-900/70 border border-slate-800/80 p-5 flex flex-col gap-3 hover:border-emerald-500/20 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}>
                  <span className="text-white text-xs font-bold">{item.initials}</span>
                </div>
                <div>
                  <p className="text-white text-xs font-bold">{item.name}</p>
                  <p className="text-slate-500 text-[11px]">{item.business} · {item.city}</p>
                </div>
                <div className="ml-auto flex items-center gap-0.5">
                  {[...Array(item.stars)].map((_, i) => (
                    <Star key={i} size={10} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed flex-1">"{item.text}"</p>
              <div className="pt-2 border-t border-slate-800">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 inline-flex">
                  <p className="text-emerald-400 text-[10px] font-bold">{item.metric}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-800/60 border border-slate-700/60 rounded-full px-3 py-1 mb-3">
            <HelpCircle size={11} /> Preguntas frecuentes
          </div>
          <h2 className="text-2xl font-bold text-white">Resolvemos tus dudas</h2>
        </div>
        <div className="space-y-2">
          {FAQS.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/12 via-teal-500/8 to-slate-900" />
          <div className="absolute inset-0 border border-emerald-500/20 rounded-2xl" />
          <div className="relative p-10 sm:p-14 text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-400 mb-5">
              <Flame size={11} className="text-orange-400" /> Acceso anticipado · Precio de lanzamiento
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4 leading-tight">
              Cada día sin LocalSEOHub es un día que<br className="hidden sm:block" />
              <span className="text-emerald-400"> tu competidor aparece antes que tú</span>
            </h2>
            <p className="text-slate-400 mb-6 max-w-lg mx-auto text-sm leading-relaxed">
              Los primeros negocios que adoptan IA en su ciudad ganan una ventaja que es muy difícil de recuperar.
              Los 7 primeros días son completamente gratis — si no ves resultados, cancelas y no pagas nada.
            </p>

            {/* Price anchor */}
            <div className="inline-flex items-center gap-3 bg-slate-900/60 border border-slate-700/60 rounded-2xl px-6 py-3 mb-7">
              <div className="text-left">
                <p className="text-slate-500 text-[11px] font-medium uppercase tracking-wide">Plan Pro</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">9,99€</span>
                  <span className="text-slate-400 text-sm">/mes</span>
                </div>
              </div>
              <div className="w-px h-10 bg-slate-700" />
              <div className="text-left">
                <p className="text-emerald-400 text-xs font-bold">7 días gratis</p>
                <p className="text-slate-500 text-[11px]">Sin tarjeta hasta el día 8</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={onLoginClick}
                className="inline-flex items-center justify-center gap-2.5 px-10 py-4 rounded-xl font-bold text-base transition-all duration-300
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
              >
                <Zap size={17} fill="currentColor" />
                Empieza gratis — sin tarjeta
                <ArrowRight size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-4 flex items-center justify-center gap-1.5">
              <Shield size={10} /> Sin tarjeta · Sin compromiso · Cancela en 1 clic · Soporte en español
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/50 py-7">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LogoIcon size={22} />
            <span className="text-xs text-slate-600 font-medium">LocalSEO<span className="text-emerald-600">Hub</span></span>
          </div>
          <p className="text-xs text-slate-700">© 2026 LocalSEOHub · Todos los derechos reservados</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setLegalModal('privacy')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Privacidad
            </button>
            <button onClick={() => setLegalModal('terms')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Términos
            </button>
            <button onClick={() => setLegalModal('contact')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Contacto
            </button>
          </div>
        </div>
      </footer>

      {legalModal === 'privacy' && <PrivacyModal onClose={() => setLegalModal(null)} />}
      {legalModal === 'terms' && <TermsModal onClose={() => setLegalModal(null)} />}
      {legalModal === 'contact' && <ContactModal onClose={() => setLegalModal(null)} />}
    </div>
  );
}
