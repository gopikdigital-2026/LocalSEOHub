import React, { useState, useRef, useEffect, type FormEvent } from 'react';
import {
  MapPin, Zap, Shield, Star, Check, ArrowRight, Sparkles,
  Eye, Globe, Target, MapPinned, Lock, AlertCircle, ExternalLink,
  Mail, ChevronDown, Brain, FileText, BarChart3, Users, Award,
  BadgeCheck, Flame, TrendingUp, CheckCircle2, Building2, Mic,
  MessageSquare, Clock, Radar, ChevronRight, Search,
} from 'lucide-react';
import { PrivacyModal, TermsModal, ContactModal, type LegalModal } from './LegalModals';
import { LogoIcon } from './Logo';
import { useI18n } from '../lib/i18n';
import { track, storeGoogleIntent } from '../lib/analytics';
import { isInAppBrowser } from '../lib/socialWebView';

interface LandingPageProps {
  onLoginClick: (email?: string) => void;
  onSubscribeClick: () => void;
  scrollToPricing?: boolean;
}

// ─── Tool trial config ────────────────────────────────────────────────────────
type TrialToolId = 'seo' | 'maps' | 'twin' | 'radar' | 'advisor';
type DemoPhase = 'idle' | 'scanning' | 'result';

const TRIAL_TOOLS: Array<{
  id: TrialToolId;
  label: string;
  shortLabel: string;
  IconComponent: React.ElementType;
  gradient: string;
  border: string;
  iconBg: string;
  ph1: string;
  ph2: string;
  btn: string;
  scanMsg: string;
}> = [
  {
    id: 'seo',
    label: 'Generador SEO',
    shortLabel: 'SEO',
    IconComponent: FileText,
    gradient: 'from-emerald-500/15 to-teal-500/8',
    border: 'border-emerald-500/30',
    iconBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    ph1: 'Tu negocio o producto (ej: peluquería, fontanero…)',
    ph2: 'Tu ciudad',
    btn: 'Generar mi SEO gratis',
    scanMsg: 'Generando contenido SEO optimizado…',
  },
  {
    id: 'maps',
    label: 'Escaner Maps',
    shortLabel: 'Maps',
    IconComponent: MapPinned,
    gradient: 'from-blue-500/15 to-sky-500/8',
    border: 'border-blue-500/30',
    iconBg: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    ph1: 'Nombre de tu negocio en Google Maps',
    ph2: 'Tu ciudad',
    btn: 'Escanear mi ficha gratis',
    scanMsg: 'Analizando tu ficha de Google Maps…',
  },
  {
    id: 'twin',
    label: 'AI Digital Twin',
    shortLabel: 'Twin',
    IconComponent: Eye,
    gradient: 'from-cyan-500/15 to-sky-500/8',
    border: 'border-cyan-500/30',
    iconBg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
    ph1: 'Nombre de tu negocio',
    ph2: 'Categoría (ej: restaurante, clínica, tienda…)',
    btn: 'Crear mi Digital Twin gratis',
    scanMsg: 'Construyendo tu gemelo digital…',
  },
  {
    id: 'radar',
    label: 'Radar de Competencia',
    shortLabel: 'Radar',
    IconComponent: Target,
    gradient: 'from-orange-500/15 to-amber-500/8',
    border: 'border-orange-500/30',
    iconBg: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
    ph1: 'Nombre de tu negocio',
    ph2: 'Tu ciudad',
    btn: 'Analizar mis competidores gratis',
    scanMsg: 'Escaneando competidores en tu zona…',
  },
  {
    id: 'advisor',
    label: 'AI Advisor',
    shortLabel: 'Advisor',
    IconComponent: Brain,
    gradient: 'from-rose-500/15 to-pink-500/8',
    border: 'border-rose-500/30',
    iconBg: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
    ph1: 'Nombre de tu negocio',
    ph2: 'Tu mayor reto de captación ahora mismo',
    btn: 'Obtener consejo gratis',
    scanMsg: 'Analizando tu situación con IA…',
  },
];

const TOOLS_SHOWCASE = [
  {
    icon: FileText,
    name: 'Generador de Contenido SEO',
    desc: 'Genera títulos, descripciones y keywords optimizadas para Google Business, Etsy, Shopify, Amazon y 13 plataformas más. La IA adapta el copy a tu categoría, ciudad y algoritmo específico.',
    badge: '16+ plataformas',
    color: 'emerald',
  },
  {
    icon: MapPinned,
    name: 'Escaner de Fichas de Maps',
    desc: 'Audita tu Google Business Profile con IA. Puntuación de optimización 0-100, fallos críticos detectados automáticamente y plan de acción con los cambios exactos que debes aplicar.',
    badge: 'Puntuación 0-100',
    color: 'blue',
  },
  {
    icon: Eye,
    name: 'AI Digital Twin',
    desc: 'Crea un gemelo digital de tu negocio y visualiza cómo te perciben los buscadores. Mapa de calor de visibilidad por zonas de tu ciudad para detectar dónde pierdes clientes.',
    badge: 'Mapa de calor local',
    color: 'cyan',
  },
  {
    icon: Target,
    name: 'Radar de Competencia',
    desc: 'Pega la URL de cualquier competidor y obtén un análisis completo de sus keywords, puntuación SEO y estrategia. Genera contramedidas automáticas personalizadas para superarle.',
    badge: 'Análisis en tiempo real',
    color: 'orange',
  },
  {
    icon: Globe,
    name: 'GEO Audit — Visibilidad en IA',
    desc: 'Mide si ChatGPT, Gemini o Perplexity recomiendan tu negocio. El 30% de las búsquedas ya pasan por IA — asegúrate de que te mencionan cuando alguien pregunta por tu servicio.',
    badge: 'ChatGPT · Gemini',
    color: 'teal',
  },
  {
    icon: Brain,
    name: 'AI Business Advisor',
    desc: 'Consejero de marketing digital disponible 24/7. Describe tu situación y recibe un plan de acción concreto, priorizado y adaptado a tu tipo de negocio y presupuesto real.',
    badge: 'Estrategia personalizada',
    color: 'rose',
  },
  {
    icon: Mic,
    name: 'Voice & Campaign Simulator',
    desc: 'Simula cómo suena tu negocio en búsquedas por voz (Siri, Alexa, Google Assistant) y previsualiza el rendimiento de campañas antes de invertir un solo euro en publicidad.',
    badge: 'Voz + Campañas',
    color: 'violet',
  },
];

const TESTIMONIALS = [
  {
    name: 'Javier Medina',
    role: 'Fontanero autónomo',
    city: 'Zaragoza',
    stars: 5,
    metric: '+3 llamadas en 48h',
    text: 'Llevaba 3 años con mi negocio en Google Maps sin conseguir que me llamasen. Con el Escaner me di cuenta de que mi ficha tenía 6 fallos críticos. Los corregí un martes y ese mismo viernes tuve 3 llamadas nuevas.',
    photo: 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop',
    initials: 'JM',
  },
  {
    name: 'Ana Climent',
    role: 'Directora, Agencia Digital Spark',
    city: 'Valencia',
    stars: 5,
    metric: '10 horas/semana ahorradas',
    text: 'Gestionamos SEO local para 12 pequeños negocios. LocalSEOHub nos ahorra entre 8 y 10 horas semanales de trabajo manual. El Generador SEO solo ya justifica con creces la suscripción.',
    photo: 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop',
    initials: 'AC',
  },
  {
    name: 'David Ramos',
    role: 'Fisioterapeuta, Clínica FisioRDR',
    city: 'Málaga',
    stars: 5,
    metric: '4 de cada 5 respuestas de ChatGPT',
    text: 'El GEO Audit me mostró que ChatGPT no me recomendaba cuando alguien preguntaba por fisioterapeutas en Málaga. Apliqué los cambios y ahora aparezco en 4 de cada 5 consultas de IA.',
    photo: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop',
    initials: 'DR',
  },
  {
    name: 'Marta Iglesias',
    role: 'Propietaria, Peluquería Éclat',
    city: 'Madrid',
    stars: 5,
    metric: 'Del puesto 8 al 2 en Maps',
    text: 'Nunca había entendido de SEO. Con el Generador metí mi nombre y mi barrio y en 30 segundos tuve el texto perfecto para mi ficha. Pasé del puesto 8 al 2 en búsquedas de peluquería en mi zona.',
    photo: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop',
    initials: 'MI',
  },
];

const FAQS = [
  {
    q: '¿Necesito saber de SEO para usar LocalSEOHub?',
    a: 'No. Está diseñado para propietarios de negocios sin conocimientos técnicos. Introduces el nombre de tu negocio y tu ciudad — la IA hace el resto. Sin jerga, sin configuraciones complejas.',
  },
  {
    q: '¿Funciona para cualquier tipo de negocio local?',
    a: 'Sí. Fontaneros, peluquerías, restaurantes, clínicas, tiendas de ropa, academias, abogados, talleres mecánicos… Cualquier negocio que quiera aparecer en búsquedas locales se beneficia de LocalSEOHub.',
  },
  {
    q: '¿Qué pasa cuando terminan los 7 días de prueba?',
    a: 'Si decides continuar, se activa tu suscripción mensual. Si no, puedes cancelar en cualquier momento antes del día 7 sin que se te cobre nada. No pedimos tarjeta para empezar.',
  },
  {
    q: '¿Puedo usar LocalSEOHub para varios negocios o clientes?',
    a: 'Sí. Muchos de nuestros usuarios son agencias de marketing digital que gestionan varios clientes. Con una sola suscripción puedes analizar y generar contenido para todos.',
  },
  {
    q: '¿Los textos generados son únicos o plantillas genéricas?',
    a: 'Cada texto se genera en el momento con IA adaptada a tu negocio, tu ciudad, tu categoría y la plataforma elegida. Nunca recibirás el mismo texto que otro usuario.',
  },
];

// ─── Google icon ──────────────────────────────────────────────────────────────
function GoogleIconSm() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

// ─── Registration gate ────────────────────────────────────────────────────────
// NOTE: Google button routes through onLoginClick (opens LoginModal) instead of
// calling signInWithOAuth directly. Direct OAuth had 0% completion rate — users
// were landing on Google consent but never returning. LoginModal is the proven path.
function RegistrationGate({
  onLoginClick,
  context,
  businessName,
  toolLabel,
}: {
  onLoginClick: (email?: string) => void;
  context: string;
  businessName?: string;
  toolLabel: string;
}) {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inApp = isInAppBrowser();

  useEffect(() => { track('gate_shown', { context, trigger: 'tool_result' }); }, [context]);

  const handleEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    track('gate_register_click', { context, method: 'email_inline' });
    setSubmitted(true);
    onLoginClick(email.trim());
  };

  const handleGoogle = () => {
    track('gate_register_click', { context, method: 'google_modal' });
    storeGoogleIntent(context);
    onLoginClick(); // abre LoginModal — el flujo que sí completa
  };

  if (submitted) {
    return (
      <div className="rounded-2xl p-5 text-center space-y-2 border border-emerald-500/28"
        style={{ background: 'linear-gradient(160deg, rgba(16,185,129,0.09) 0%, rgba(8,14,26,0.99) 55%)' }}>
        <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mx-auto">
          <Check size={18} className="text-emerald-400" />
        </div>
        <p className="text-white font-bold text-sm">Abriendo tu informe completo…</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-emerald-500/30"
      style={{ background: 'linear-gradient(170deg, rgba(16,185,129,0.08) 0%, rgba(8,14,26,0.99) 50%)' }}>
      <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />
      <div className="p-5 space-y-3">

        <div className="text-center space-y-1">
          <p className="text-white font-extrabold text-base leading-tight">
            {businessName
              ? `Tu análisis de "${businessName}" está listo`
              : `Tu ${toolLabel} está listo`}
          </p>
          <p className="text-emerald-400 text-[12px]">
            Regístrate gratis para ver el informe completo — 7 días sin coste, sin tarjeta
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 py-1">
          {['Informe completo', 'Todas las keywords', 'Plan de acción'].map((item) => (
            <div key={item} className="flex flex-col items-center gap-1 rounded-xl bg-slate-800/40 border border-slate-700/40 p-2">
              <Check size={11} className="text-emerald-400" />
              <span className="text-[10px] text-slate-400 text-center leading-tight">{item}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2" onClick={() => track('gate_cta_visible', { context })}>

          {/* PRIMARY: email — es el método que convierte según los datos */}
          <form onSubmit={handleEmail} className="space-y-2">
            <div className="relative">
              <Mail size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com — empieza gratis"
                className="w-full bg-slate-900/80 border border-slate-600/60 rounded-xl pl-10 pr-3 py-3 text-sm text-slate-100
                  placeholder-slate-600 outline-none transition-all focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20" />
            </div>
            <button type="submit" disabled={!email.trim()}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all duration-150
                bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                text-slate-950 shadow-[0_4px_20px_rgba(16,185,129,0.35)] hover:-translate-y-0.5 active:translate-y-0
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0">
              <ArrowRight size={14} />
              Ver mi informe completo — gratis
            </button>
          </form>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[9px] text-slate-600 px-1">o</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* SECONDARY: Google / in-app fallback */}
          {inApp ? (
            <a href={window.location.href} target="_blank" rel="noopener noreferrer"
              onClick={() => { track('gate_register_click', { context, method: 'inapp_open' }); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-[12px]
                border border-slate-700/60 hover:border-slate-600 text-slate-300 hover:bg-slate-800/40 transition-all no-underline">
              <ExternalLink size={12} />Abrir en navegador para continuar
            </a>
          ) : (
            <button type="button" onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl font-semibold text-[12px]
                border border-slate-700/60 hover:border-slate-600/80 text-slate-300 hover:bg-slate-800/40 transition-all">
              <GoogleIconSm />
              Continuar con Google
            </button>
          )}

          <div className="flex items-center justify-center gap-3 pt-0.5">
            <span className="text-[9px] text-slate-600 flex items-center gap-0.5"><Shield size={8} />7 días gratis</span>
            <span className="text-slate-700 text-[9px]">·</span>
            <span className="text-[9px] text-slate-600 flex items-center gap-0.5"><Shield size={8} />Sin tarjeta</span>
            <span className="text-slate-700 text-[9px]">·</span>
            <span className="text-[9px] text-slate-600">
              ¿Ya tienes cuenta?{' '}
              <button type="button" onClick={() => { track('gate_register_click', { context, method: 'login_link' }); onLoginClick(); }}
                className="text-emerald-400 hover:text-emerald-300 transition-colors">
                Inicia sesión
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tool demo result renderers ───────────────────────────────────────────────
function SeoResult({ input1, input2 }: { input1: string; input2: string }) {
  const biz = input1 || 'tu negocio';
  const city = input2 || 'tu ciudad';
  const title = `${biz} en ${city} — Expertos Locales · Reserva Online · Resultados Garantizados`;
  const desc = `¿Buscas ${biz.toLowerCase()} en ${city}? Somos especialistas con más de 10 años de experiencia. Ofrecemos atención personalizada, presupuesto sin compromiso y el mejor servicio de la zona.`;
  const kws = [`${biz.toLowerCase()} ${city}`, `mejor ${biz.toLowerCase()} ${city}`];
  const score = Math.floor(38 + Math.random() * 28);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Resultado generado</p>
        <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-full px-2 py-0.5 font-semibold uppercase">Gratis</span>
      </div>
      <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3.5">
        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mb-1.5">Título SEO optimizado</p>
        <p className="text-white text-sm font-medium leading-snug">{title}</p>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">Descripción (vista previa)</p>
        <p className="text-slate-300 text-xs leading-relaxed">{desc}</p>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
          <Lock size={9} />
          <span>Versión SEO extendida + schema estructurado bloqueados</span>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Keywords</p>
        <div className="flex flex-wrap gap-2">
          {kws.map((k) => <span key={k} className="text-[11px] bg-teal-500/15 border border-teal-500/20 text-teal-300 rounded-full px-3 py-1">{k}</span>)}
          <span className="flex items-center gap-1 text-[11px] bg-slate-700/60 border border-slate-600/50 text-slate-400 rounded-full px-3 py-1"><Lock size={9} />+8 bloqueadas</span>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/6 border border-amber-500/25">
        <AlertCircle size={14} className="text-amber-400 shrink-0" />
        <p className="text-amber-300/90 text-xs">Tu ficha actual tiene un score estimado de <strong>{score}/100</strong>. Con las optimizaciones completas puedes llegar a 85+.</p>
      </div>
    </div>
  );
}

function MapsResult({ input1, input2 }: { input1: string; input2: string }) {
  const biz = input1 || 'tu negocio';
  const city = input2 || 'tu ciudad';
  const score = Math.floor(32 + Math.random() * 30);
  const title = `${biz} en ${city} — Abierto hoy | Atención personalizada | Reserva online`;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Puntuación de optimización</p>
          <p className="text-white font-bold text-sm">{biz} · {city}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-extrabold text-amber-400 tabular-nums">{score}/100</div>
          <div className="text-[10px] text-slate-500">Infraoptimizado</div>
        </div>
      </div>
      <div className="w-full bg-slate-800/60 rounded-full h-2.5 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-1000"
          style={{ width: `${score}%` }} />
      </div>
      <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3.5">
        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mb-1.5">Título optimizado (gratis)</p>
        <p className="text-white text-sm font-medium leading-snug">{title}</p>
      </div>
      <div className="rounded-xl bg-amber-500/6 border border-amber-500/25 p-3.5">
        <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-2">Fallos críticos detectados</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-amber-300/80">
            <AlertCircle size={10} className="text-amber-400 shrink-0" />
            <span>Sin horarios especiales para festivos (pierdes el 68% de búsquedas nocturnas)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock size={10} className="shrink-0" /><span className="blur-[3px] select-none">Descripción sin keywords semánticas locales</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock size={10} className="shrink-0" /><span className="blur-[3px] select-none">Sin schema de negocio estructurado</span>
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={9} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Competidores cercanos — bloqueado</p>
        </div>
        <div className="space-y-1.5">
          {['Competidor #1 en tu zona', 'Competidor #2 en tu zona'].map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[9px] font-black text-amber-400 w-4">#{i + 1}</span>
              <span className="text-[11px] text-slate-300 blur-[5px] select-none flex-1">{c}</span>
              <span className="text-[9px] text-red-400 font-bold">+{i === 0 ? 47 : 29} pts</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TwinResult({ input1, input2 }: { input1: string; input2: string }) {
  const biz = input1 || 'tu negocio';
  const cat = input2 || 'negocio local';
  const score = Math.floor(40 + Math.random() * 28);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider mb-0.5">Gemelo Digital creado</p>
          <p className="text-white font-bold text-sm">{biz} · {cat}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-extrabold text-cyan-400 tabular-nums">{score}/100</div>
          <div className="text-[10px] text-slate-500">Presencia digital</div>
        </div>
      </div>
      <div className="w-full bg-slate-800/60 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 transition-all duration-1000"
          style={{ width: `${score}%` }} />
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Señales detectadas</p>
        <div className="space-y-2">
          {[
            { ok: true, label: 'Presencia en Google Maps: Activa' },
            { ok: true, label: 'Categoría principal: Correcta' },
            { ok: false, label: 'Keywords semánticas en descripción' },
          ].map(({ ok, label }, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {ok
                ? <BadgeCheck size={11} className="text-emerald-400 shrink-0" />
                : <AlertCircle size={11} className="text-amber-400 shrink-0" />}
              <span className={ok ? 'text-slate-300' : 'text-amber-300/80'}>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock size={10} className="shrink-0" />
            <span className="blur-[3px] select-none">Schema estructurado: No detectado</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock size={10} className="shrink-0" />
            <span className="blur-[3px] select-none">Visibilidad en IA generativa: Sin datos</span>
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3">
        <div className="flex items-center gap-2">
          <Lock size={9} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Mapa de calor de visibilidad por zonas — bloqueado</p>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1">
          {[90, 45, 70, 20, 85, 35, 60, 80, 25, 55].map((v, i) => (
            <div key={i} className="h-6 rounded-sm opacity-30"
              style={{ background: `rgba(34,211,238,${v / 100})` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RadarResult({ input1, input2 }: { input1: string; input2: string }) {
  const biz = input1 || 'Tu negocio';
  const city = input2 || 'tu ciudad';
  const myScore = Math.floor(30 + Math.random() * 25);
  const comps = [
    { score: myScore + 42 + Math.floor(Math.random() * 10), reviews: 142 },
    { score: myScore + 28 + Math.floor(Math.random() * 8), reviews: 97 },
    { score: myScore + 15 + Math.floor(Math.random() * 6), reviews: 63 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="text-center shrink-0">
          <div className="text-2xl font-extrabold text-orange-400 tabular-nums">{myScore}</div>
          <div className="text-[9px] text-slate-500">Tu score</div>
        </div>
        <div className="flex-1">
          <p className="text-white font-bold text-sm">{biz}</p>
          <p className="text-slate-500 text-[11px]">vs. 3 competidores en {city}</p>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5 space-y-2.5">
        {comps.map((c, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 blur-[4px] select-none">Competidor #{i + 1} en {city}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-red-400 font-bold">+{c.score - myScore} pts</span>
                <Star size={9} className="text-amber-400 fill-amber-400" />
                <span className="text-[9px] text-slate-400">{c.reviews}</span>
              </div>
            </div>
            <div className="w-full bg-slate-700/40 rounded-full h-1.5">
              <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400"
                style={{ width: `${Math.min(c.score, 100)}%` }} />
            </div>
          </div>
        ))}
        <div className="space-y-1 border-t border-slate-700/50 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-400">{biz} (tú)</span>
            <span className="text-[10px] text-slate-400 font-bold">{myScore}/100</span>
          </div>
          <div className="w-full bg-slate-700/40 rounded-full h-1.5">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
              style={{ width: `${myScore}%` }} />
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3">
        <div className="flex items-center gap-2">
          <Lock size={9} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Plan para superar al #1 en 30 días — bloqueado</p>
        </div>
        <div className="mt-2 space-y-1">
          {['Acción inmediata #1 para cerrar la brecha', 'Palabras clave que el #1 usa y tú no', 'Estrategia de reseñas semana a semana'].map((item) => (
            <p key={item} className="text-[11px] text-slate-500 blur-[3.5px] select-none">{item}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdvisorResult({ input1, input2 }: { input1: string; input2: string }) {
  const biz = input1 || 'tu negocio';
  const problem = input2 || 'captación de clientes';

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Consejo AI para {biz}</p>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Análisis de tu situación</p>
        <p className="text-slate-300 text-xs leading-relaxed">
          Para un negocio como <strong className="text-white">{biz}</strong>, el mayor obstáculo en la captación suele ser la baja visibilidad local: apareces tarde en los resultados cuando un cliente potencial busca "{problem.toLowerCase()}" cerca de tu dirección. Esto se debe principalmente a una ficha de Google Business Profile incompleta y a la ausencia de señales semánticas locales…
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <Lock size={9} className="text-slate-500" />
          <span className="text-[10px] text-slate-500">Análisis completo (8 puntos más) bloqueado</span>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={9} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Plan de acción en 5 pasos — bloqueado</p>
        </div>
        <div className="space-y-1">
          {['Quick win esta semana: optimizar ficha GBP', 'Conseguir 10 reseñas con plantilla incluida', 'Keywords locales prioritarias para tu categoría'].map((item) => (
            <p key={item} className="text-[11px] text-slate-500 blur-[3.5px] select-none">{item}</p>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/6 border border-rose-500/20">
        <AlertCircle size={14} className="text-rose-400 shrink-0" />
        <p className="text-rose-300/90 text-xs">Sin un plan estructurado, la mayoría de negocios locales pierden entre el 60% y el 80% de sus clientes potenciales ante competidores mejor posicionados.</p>
      </div>
    </div>
  );
}

// ─── Main tool trial widget ───────────────────────────────────────────────────
function ToolTrialSection({ onLoginClick, initialToolIdx }: { onLoginClick: (email?: string) => void; initialToolIdx?: number }) {
  const [activeTool, setActiveTool] = useState(initialToolIdx ?? 0);
  const [input1, setInput1] = useState('');
  const [input2, setInput2] = useState('');
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [showGate, setShowGate] = useState(false);
  const [lockedInput1, setLockedInput1] = useState('');
  const [lockedInput2, setLockedInput2] = useState('');
  const scanRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialToolIdx !== undefined) {
      if (scanRef.current) clearTimeout(scanRef.current);
      setActiveTool(initialToolIdx);
      setInput1('');
      setInput2('');
      setPhase('idle');
      setShowGate(false);
    }
  }, [initialToolIdx]);

  const tool = TRIAL_TOOLS[activeTool];

  const switchTool = (idx: number) => {
    if (scanRef.current) clearTimeout(scanRef.current);
    setActiveTool(idx);
    setInput1('');
    setInput2('');
    setPhase('idle');
    setShowGate(false);
  };

  const handleScan = () => {
    if (!input1.trim()) return;
    setLockedInput1(input1.trim());
    setLockedInput2(input2.trim());
    setPhase('scanning');
    setShowGate(false);
    track('widget_scan_start', { tool: tool.id, input: input1 });
    scanRef.current = setTimeout(() => {
      setPhase('result');
      setShowGate(true);
      track('widget_scan_result', { tool: tool.id });
    }, 1800);
  };

  useEffect(() => () => { if (scanRef.current) clearTimeout(scanRef.current); }, []);

  const INPUT_CLS = 'w-full bg-slate-950/70 border border-slate-700/50 rounded-xl px-4 py-3.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20';

  return (
    <div className="max-w-2xl mx-auto">
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />

        {/* Tool picker */}
        <div className="px-5 pt-5 pb-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mb-3 text-center">
            Elige una herramienta y pruébala gratis ahora
          </p>
          <div className="grid grid-cols-5 gap-1">
            {TRIAL_TOOLS.map((t, i) => {
              const Icon = t.IconComponent;
              const isActive = activeTool === i;
              return (
                <button key={t.id} onClick={() => switchTool(i)}
                  className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl text-[10px] font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent hover:bg-slate-800/40'
                  }`}>
                  <Icon size={14} className={isActive ? 'text-emerald-400' : 'text-slate-500'} />
                  <span className="hidden sm:block truncate w-full text-center">{t.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 pb-5">
          {/* Active tool header */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${tool.iconBg}`}>
              <tool.IconComponent size={14} />
            </div>
            <div>
              <p className="text-white text-sm font-bold leading-tight">{tool.label}</p>
              <p className="text-slate-500 text-[11px]">Análisis gratuito — sin registro</p>
            </div>
          </div>

          {/* Idle — form */}
          {phase === 'idle' && (
            <div className="space-y-3">
              <input type="text" value={input1} onChange={(e) => setInput1(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                placeholder={tool.ph1} className={INPUT_CLS} />
              <input type="text" value={input2} onChange={(e) => setInput2(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                placeholder={tool.ph2} className={INPUT_CLS} />
              <button onClick={handleScan} disabled={!input1.trim()}
                className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base transition-all duration-300
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/45 hover:-translate-y-0.5 active:translate-y-0
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                <Zap size={16} fill="currentColor" />
                {tool.btn}
              </button>
              <p className="text-center text-[11px] text-slate-600 flex items-center justify-center gap-1">
                <Shield size={9} />Sin registro · Sin tarjeta · Resultado en segundos
              </p>
            </div>
          )}

          {/* Scanning */}
          {phase === 'scanning' && (
            <div className="py-10 flex flex-col items-center gap-5">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full"
                  style={{ background: 'conic-gradient(from 0deg, rgba(16,185,129,0.25), transparent 55%)', animation: 'radarSweep 1.8s linear infinite' }} />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="absolute rounded-full border border-emerald-400/35"
                    style={{ width: `${40 + i * 20}px`, height: `${40 + i * 20}px`, animation: 'radarRing 2s ease-out infinite', animationDelay: `${i * 0.55}s` }} />
                ))}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-500/40 z-10">
                  <tool.IconComponent size={18} className="text-slate-950" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-white font-bold text-sm">{tool.scanMsg}</p>
                <p className="text-slate-500 text-xs">Analizando: <span className="text-slate-300">"{lockedInput1}"</span></p>
              </div>
              <div className="w-full max-w-xs bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                  style={{ animation: 'scanProgress 2.5s ease-out forwards' }} />
              </div>
            </div>
          )}

          {/* Result */}
          {phase === 'result' && (
            <div className="space-y-3">
              <button onClick={() => { setPhase('idle'); setInput1(''); setInput2(''); setShowGate(false); }}
                className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors mb-1">
                <ChevronRight size={11} className="rotate-180" />
                Analizar otro negocio
              </button>

              {activeTool === 0 && <SeoResult input1={lockedInput1} input2={lockedInput2} />}
              {activeTool === 1 && <MapsResult input1={lockedInput1} input2={lockedInput2} />}
              {activeTool === 2 && <TwinResult input1={lockedInput1} input2={lockedInput2} />}
              {activeTool === 3 && <RadarResult input1={lockedInput1} input2={lockedInput2} />}
              {activeTool === 4 && <AdvisorResult input1={lockedInput1} input2={lockedInput2} />}

              {showGate && (
                <RegistrationGate
                  onLoginClick={onLoginClick}
                  context={tool.id}
                  businessName={lockedInput1 || undefined}
                  toolLabel={tool.label}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen((v) => !v)}
      className="w-full text-left rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/70 transition-colors overflow-hidden">
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

// ─── Color map for tool cards ─────────────────────────────────────────────────
// ─── Per-tool benefits for the picker section ────────────────────────────────
const TOOL_BENEFITS: Array<{
  id: string;
  trialIdx?: number;
  icon: React.ElementType;
  name: string;
  badge: string;
  color: string;
  tagline: string;
  benefits: string[];
}> = [
  {
    id: 'seo', trialIdx: 0, icon: FileText, name: 'Generador SEO',
    badge: '16+ plataformas', color: 'emerald',
    tagline: 'Contenido SEO listo para copiar en 30 segundos',
    benefits: [
      'Títulos y descripciones optimizados para Google, Shopify, Amazon y 13 plataformas más',
      'Keywords de alta intención de compra adaptadas a tu ciudad y categoría',
      'Schema estructurado y versión extendida para máximo impacto en buscadores',
    ],
  },
  {
    id: 'maps', trialIdx: 1, icon: MapPinned, name: 'Escaner Maps',
    badge: 'Puntuación 0-100', color: 'blue',
    tagline: 'Descubre por qué tu ficha no aparece en los primeros resultados',
    benefits: [
      'Score de optimización 0-100 con fallos críticos detectados automáticamente',
      'Plan de acción exacto: qué cambiar, cómo y en qué orden',
      'Comparativa con los competidores mejor posicionados en tu zona',
    ],
  },
  {
    id: 'twin', trialIdx: 2, icon: Eye, name: 'AI Digital Twin',
    badge: 'Mapa de calor local', color: 'cyan',
    tagline: 'Ve tu negocio tal y como lo ven los buscadores',
    benefits: [
      'Mapa de calor de visibilidad por zonas de tu ciudad',
      'Señales de presencia digital auditadas en tiempo real',
      'Identifica los barrios donde pierdes clientes frente a la competencia',
    ],
  },
  {
    id: 'radar', trialIdx: 3, icon: Target, name: 'Radar de Competencia',
    badge: 'Análisis en tiempo real', color: 'orange',
    tagline: 'Conoce la estrategia exacta de tus competidores',
    benefits: [
      'Analiza keywords, score SEO y estrategia de cualquier competidor',
      'Contramedidas automáticas y personalizadas para superarles',
      'Detecta las brechas de posicionamiento que puedes explotar hoy',
    ],
  },
  {
    id: 'geo', trialIdx: undefined, icon: Globe, name: 'GEO Audit — IA',
    badge: 'ChatGPT · Gemini', color: 'teal',
    tagline: 'Aparece cuando la IA responde a tus clientes potenciales',
    benefits: [
      'Mide si ChatGPT, Gemini o Perplexity te recomiendan cuando alguien pregunta por tu servicio',
      'El 30% de las búsquedas ya pasan por IA — optimiza antes que tu competencia',
      'Informe de visibilidad comparado con los negocios líderes de tu sector',
    ],
  },
  {
    id: 'advisor', trialIdx: 4, icon: Brain, name: 'AI Business Advisor',
    badge: 'Estrategia personalizada', color: 'rose',
    tagline: 'Tu consejero de marketing digital disponible 24/7',
    benefits: [
      'Describe tu situación y recibe un plan de acción concreto y priorizado',
      'Adaptado a tu tipo de negocio, tu ciudad y tu presupuesto real',
      'Estrategias probadas que otros negocios locales ya están aplicando',
    ],
  },
  {
    id: 'voice', trialIdx: undefined, icon: Mic, name: 'Voice & Campañas',
    badge: 'Voz + Publicidad', color: 'violet',
    tagline: 'Domina la búsqueda por voz y optimiza tu publicidad',
    benefits: [
      'Simula cómo suenas en Siri, Alexa y Google Assistant antes de publicar',
      'Previsualiza el rendimiento de campañas antes de invertir un solo euro',
      'Optimiza tu presencia en el canal de búsqueda de mayor crecimiento',
    ],
  },
];

// ─── Color map for tool cards ─────────────────────────────────────────────────
const TOOL_COLORS: Record<string, { bg: string; border: string; icon: string; badge: string }> = {
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'text-emerald-400', badge: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400' },
  blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: 'text-blue-400',    badge: 'bg-blue-500/15 border-blue-500/25 text-blue-400' },
  cyan:    { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',    icon: 'text-cyan-400',    badge: 'bg-cyan-500/15 border-cyan-500/25 text-cyan-400' },
  orange:  { bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  icon: 'text-orange-400',  badge: 'bg-orange-500/15 border-orange-500/25 text-orange-400' },
  teal:    { bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    icon: 'text-teal-400',    badge: 'bg-teal-500/15 border-teal-500/25 text-teal-400' },
  rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    icon: 'text-rose-400',    badge: 'bg-rose-500/15 border-rose-500/25 text-rose-400' },
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  icon: 'text-violet-400',  badge: 'bg-violet-500/15 border-violet-500/25 text-violet-400' },
};

// ─── Main landing page ────────────────────────────────────────────────────────
export default function LandingPage({ onLoginClick, onSubscribeClick }: LandingPageProps) {
  const [legalModal, setLegalModal] = useState<LegalModal>(null);
  const [selectedToolIdx, setSelectedToolIdx] = useState<number | undefined>(undefined);
  const { lang } = useI18n();
  const pricingRef = useRef<HTMLDivElement>(null);
  const heroWidgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => { track('page_view', { page: 'landing' }); }, []);

  const handlePickTool = (trialIdx: number) => {
    setSelectedToolIdx(trialIdx);
    setTimeout(() => heroWidgetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── HERO ─────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute top-40 left-1/4 w-64 h-64 bg-teal-500/4 rounded-full blur-3xl" />
          <div className="absolute top-20 right-1/4 w-72 h-72 bg-cyan-500/3 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-5 pt-12 pb-16 relative">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">

            {/* ── Left: copy ── */}
            <div>
              <div className="mb-5">
                <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-400">
                  <Flame size={12} className="text-orange-400" />
                  Para negocios locales y agencias de marketing
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              </div>

              <h1 className="text-3xl sm:text-4xl xl:text-5xl font-extrabold text-white leading-[1.1] mb-4 tracking-tight">
                Más clientes locales con{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  7 herramientas de IA
                </span>
              </h1>

              <p className="text-slate-400 text-base sm:text-lg mb-3 leading-relaxed">
                SEO local, Google Maps, análisis de competencia y visibilidad en IA generativa — sin saber de SEO.
              </p>
              <p className="text-slate-500 text-sm mb-8">
                Introduce tu negocio y obtén tu primer análisis en segundos, completamente gratis.
              </p>

              <div className="space-y-2.5 mb-8">
                {[
                  '7 días gratis — sin tarjeta de crédito',
                  'Resultados en segundos, sin configuraciones',
                  'Agencias y autónomos en toda España',
                ].map((text) => (
                  <div key={text} className="flex items-center gap-2.5 text-sm text-slate-300">
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                    {text}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { value: '7', label: 'Herramientas IA', icon: Sparkles },
                  { value: '16+', label: 'Plataformas', icon: Globe },
                  { value: '4.9★', label: 'Valoración', icon: Star },
                  { value: '9,99€', label: '/mes todo incl.', icon: Shield },
                ].map(({ value, label, icon: Icon }) => (
                  <div key={label} className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-900/50 border border-slate-800/60">
                    <Icon size={13} className="text-emerald-400" />
                    <span className="text-white font-extrabold text-base leading-none">{value}</span>
                    <span className="text-slate-500 text-[10px] text-center">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Right: interactive widget ── */}
            <div ref={heroWidgetRef}>
              <ToolTrialSection onLoginClick={onLoginClick} initialToolIdx={selectedToolIdx} />
            </div>

          </div>
        </div>
      </section>

      {/* ── ELIGE TU HERRAMIENTA ────────────────────────────────────────────── */}
      <section id="tool-picker" className="py-14 px-5 bg-slate-900/30 border-y border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-400 mb-4">
              <Sparkles size={11} />
              7 herramientas — elige la que necesitas ahora
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">
              ¿Qué quieres mejorar de tu negocio hoy?
            </h2>
            <p className="text-slate-400 text-sm max-w-xl mx-auto">
              Cada herramienta resuelve un problema concreto de visibilidad local. Elige una, pruébala gratis y ve los resultados en segundos.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {TOOL_BENEFITS.map((tool) => {
              const Icon = tool.icon;
              const c = TOOL_COLORS[tool.color] ?? TOOL_COLORS.emerald;
              const isTrial = tool.trialIdx !== undefined;
              return (
                <div key={tool.id}
                  className={`group relative rounded-2xl border p-5 flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${c.border}`}
                  style={{ background: 'linear-gradient(145deg, rgba(15,23,42,0.92) 0%, rgba(8,14,26,0.97) 100%)' }}>

                  {isTrial && (
                    <span className="absolute top-3.5 right-3.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
                      Gratis
                    </span>
                  )}

                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${c.bg} ${c.border}`}>
                      <Icon size={18} className={c.icon} />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm leading-tight">{tool.name}</p>
                      <span className={`inline-block mt-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${c.badge}`}>
                        {tool.badge}
                      </span>
                    </div>
                  </div>

                  <p className={`text-xs font-semibold mb-3 leading-snug ${c.icon}`}>{tool.tagline}</p>

                  <ul className="space-y-2 mb-5 flex-1">
                    {tool.benefits.map((b, bi) => (
                      <li key={bi} className="flex items-start gap-2 text-[11px] text-slate-400 leading-relaxed">
                        <Check size={10} className={`${c.icon} shrink-0 mt-0.5`} />
                        {b}
                      </li>
                    ))}
                  </ul>

                  {isTrial ? (
                    <button
                      onClick={() => handlePickTool(tool.trialIdx!)}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition-all duration-150
                        bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                        text-slate-950 shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/35`}>
                      <Zap size={11} fill="currentColor" />
                      Analizar mi negocio gratis
                    </button>
                  ) : (
                    <button
                      onClick={onSubscribeClick}
                      className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition-all duration-150
                        border ${c.border} ${c.icon} hover:bg-slate-800/40`}>
                      <ArrowRight size={11} />
                      Incluida en la suscripción
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PARA AGENCIAS ────────────────────────────────────────────────────── */}
      <section className="py-14 px-5">
        <div className="max-w-4xl mx-auto">
          <div className="rounded-2xl border border-teal-500/25 overflow-hidden"
            style={{ background: 'linear-gradient(145deg, rgba(20,184,166,0.07) 0%, rgba(8,14,26,0.98) 60%)' }}>
            <div className="h-[2px] bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-500" />
            <div className="p-6 sm:p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-10 h-10 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0">
                  <Building2 size={18} className="text-teal-400" />
                </div>
                <div>
                  <p className="text-teal-400 text-[11px] font-bold uppercase tracking-wider mb-1">Para agencias de marketing digital</p>
                  <h3 className="text-white text-xl font-extrabold leading-tight">
                    Multiplica tu capacidad sin aumentar tu equipo
                  </h3>
                </div>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-2xl">
                Si gestionas el SEO local de varios clientes, LocalSEOHub te permite generar en minutos lo que antes te costaba horas. Análisis, reportes, contenido y estrategia para todos tus clientes desde un único panel.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {[
                  { icon: Clock, text: 'Genera contenido SEO para 10 clientes en menos de 30 minutos' },
                  { icon: BarChart3, text: 'Reportes de competencia listos para presentar al cliente' },
                  { icon: Target, text: 'Radar de competencia para cada negocio que gestiones' },
                  { icon: FileText, text: 'Exportación a CSV compatible con Shopify, Etsy y GMB' },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-800/30 border border-slate-700/30">
                    <Icon size={13} className="text-teal-400 shrink-0 mt-0.5" />
                    <span className="text-slate-300 text-xs leading-relaxed">{text}</span>
                  </div>
                ))}
              </div>
              <button onClick={onSubscribeClick}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm
                  bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-lg shadow-teal-500/25 hover:-translate-y-0.5 transition-all duration-200">
                <ArrowRight size={14} />
                Probar para mi agencia — gratis 7 días
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── CÓMO FUNCIONA ────────────────────────────────────────────────────── */}
      <section className="py-14 px-5 bg-slate-900/20 border-y border-slate-800/40">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">Tan fácil como 1, 2, 3</h2>
            <p className="text-slate-400 text-sm">En menos de 60 segundos tienes tu primer análisis listo.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { step: '01', icon: Search, title: 'Introduce tu negocio', desc: 'Escribe el nombre de tu negocio, tu ciudad y el servicio o producto que ofreces. Sin formularios largos ni configuraciones.' },
              { step: '02', icon: Sparkles, title: 'La IA lo analiza todo', desc: 'En segundos recibes tu análisis SEO, puntuación de visibilidad, competidores y recomendaciones concretas y priorizadas.' },
              { step: '03', icon: TrendingUp, title: 'Aplica y capta clientes', desc: 'Copia los textos con un clic, aplica los cambios en tu ficha y empieza a aparecer antes que tu competencia.' },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="relative">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                    <Icon size={16} className="text-emerald-400" />
                  </div>
                  <span className="text-4xl font-black text-slate-800/80 tabular-nums">{step}</span>
                </div>
                <h3 className="text-white font-bold text-base mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────────────────────────── */}
      <section className="py-14 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">Lo que dicen nuestros usuarios</h2>
            <p className="text-slate-400 text-sm">Negocios reales, resultados reales.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TESTIMONIALS.map((t, i) => (
              <div key={i} className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-5 space-y-3">
                <div className="flex items-center gap-1">
                  {Array.from({ length: t.stars }).map((_, j) => (
                    <Star key={j} size={12} className="text-amber-400 fill-amber-400" />
                  ))}
                  <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
                    {t.metric}
                  </span>
                </div>
                <p className="text-slate-300 text-sm leading-relaxed">"{t.text}"</p>
                <div className="flex items-center gap-3 pt-1 border-t border-slate-800/60">
                  <img src={t.photo} alt={t.name} className="w-9 h-9 rounded-full object-cover border border-slate-700/50" />
                  <div>
                    <p className="text-white text-sm font-bold">{t.name}</p>
                    <p className="text-slate-500 text-[11px]">{t.role} · {t.city}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARATIVA ──────────────────────────────────────────────────────── */}
      <section className="py-14 px-5 bg-slate-900/30 border-y border-slate-800/50">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-extrabold text-white mb-2">Con LocalSEOHub vs. sin él</h2>
            <p className="text-slate-400 text-sm">La diferencia en posicionamiento es real y medible.</p>
          </div>
          <div className="rounded-2xl border border-slate-700/50 overflow-hidden">
            <div className="grid grid-cols-3 text-center text-[11px] font-bold uppercase tracking-wider border-b border-slate-700/50">
              <div className="py-3 px-4 text-slate-500">Situación</div>
              <div className="py-3 px-4 text-red-400 bg-red-500/5 border-x border-slate-700/50">Sin LocalSEOHub</div>
              <div className="py-3 px-4 text-emerald-400 bg-emerald-500/5">Con LocalSEOHub</div>
            </div>
            {[
              ['Tiempo para generar contenido SEO', '4-6 horas', '2 minutos'],
              ['Análisis de competidores', 'Manual o imposible', 'Automático e instantáneo'],
              ['Visibilidad en ChatGPT / Gemini', 'Desconocida', 'Medida y optimizada'],
              ['Coste mensual', '300-600€/mes agencia', '9,99€/mes todo incluido'],
              ['Conocimientos técnicos necesarios', 'Experto en SEO', 'Ninguno'],
            ].map(([label, bad, good], i) => (
              <div key={i} className={`grid grid-cols-3 text-sm border-b border-slate-800/40 ${i % 2 === 0 ? '' : 'bg-slate-900/20'}`}>
                <div className="py-3 px-4 text-slate-400 text-xs flex items-center">{label}</div>
                <div className="py-3 px-4 text-red-400/80 text-xs flex items-center justify-center bg-red-500/3 border-x border-slate-800/40">
                  <span className="flex items-center gap-1"><span className="text-red-500">✗</span> {bad}</span>
                </div>
                <div className="py-3 px-4 text-emerald-400/90 text-xs flex items-center justify-center bg-emerald-500/3">
                  <span className="flex items-center gap-1"><span className="text-emerald-500">✓</span> {good}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────────────────────────────── */}
      <section ref={pricingRef} className="py-16 px-5">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">Precio simple y transparente</h2>
            <p className="text-slate-400 text-sm">Acceso completo a todas las herramientas. Sin sorpresas ni letra pequeña.</p>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 overflow-hidden"
            style={{ background: 'linear-gradient(160deg, rgba(16,185,129,0.08) 0%, rgba(8,14,26,0.99) 55%)' }}>
            <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />
            <div className="p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-400">
                  TODO INCLUIDO
                </span>
              </div>
              <div className="flex items-end gap-2 mb-1 mt-3">
                <span className="text-4xl font-extrabold text-white">9,99€</span>
                <span className="text-slate-400 text-sm mb-1">/mes</span>
              </div>
              <p className="text-slate-500 text-[12px] mb-6">7 días gratis, después 9,99€/mes · Cancela cuando quieras</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-7">
                {[
                  'Generador SEO ilimitado (16+ plataformas)',
                  'Escaner de Ficha Google Maps + Score',
                  'AI Digital Twin con mapa de calor',
                  'Radar de Competencia en tiempo real',
                  'GEO Audit — visibilidad en ChatGPT y Gemini',
                  'AI Business Advisor personalizado',
                  'Voice & Campaign Simulator',
                  'Exportación a CSV (Shopify, Etsy)',
                  'Soporte prioritario por email',
                  'Actualizaciones del motor IA incluidas',
                ].map((f) => (
                  <div key={f} className="flex items-start gap-2 text-xs text-slate-300">
                    <CheckCircle2 size={13} className="text-emerald-400 shrink-0 mt-0.5" />
                    {f}
                  </div>
                ))}
              </div>

              <button onClick={onSubscribeClick}
                className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/45 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200">
                <Zap size={16} fill="currentColor" />
                Empezar 7 días gratis — sin tarjeta
              </button>
              <p className="text-center text-[11px] text-slate-500 mt-3 flex items-center justify-center gap-1.5">
                <Shield size={10} className="text-slate-600" />
                Pago seguro con Stripe · Sin permanencia · Cancela en cualquier momento
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ────────────────────────────────────────────────────────── */}
      <section className="py-14 px-5 bg-slate-900/40 border-y border-slate-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 rounded-full px-4 py-1.5 text-xs font-semibold text-orange-400 mb-5">
            <Flame size={12} className="text-orange-400" />
            Tu competencia ya usa IA
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-4 leading-tight">
            Cada día sin LocalSEOHub es un día que tus competidores aparecen antes que tú
          </h2>
          <p className="text-slate-400 text-sm max-w-xl mx-auto mb-8 leading-relaxed">
            Únete a los negocios locales y agencias que ya usan LocalSEOHub para captar más clientes, ahorrar tiempo y superar a su competencia en Google Maps e IA generativa.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button onClick={onSubscribeClick}
              className="flex items-center gap-2.5 px-8 py-4 rounded-xl font-bold text-base
                bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                text-slate-950 shadow-xl shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200">
              <Zap size={16} fill="currentColor" />
              Empezar gratis ahora — 7 días sin coste
            </button>
            <button onClick={() => onLoginClick()}
              className="flex items-center gap-2 px-6 py-4 rounded-xl font-semibold text-sm text-slate-400
                border border-slate-700/60 hover:border-slate-600 hover:text-slate-300 hover:bg-slate-800/40 transition-all duration-200">
              Ya tengo cuenta — Iniciar sesión
            </button>
          </div>
          <div className="flex items-center justify-center gap-5 mt-6">
            {['Sin tarjeta para empezar', 'Cancela en cualquier momento', 'Soporte en español'].map((t) => (
              <span key={t} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Check size={10} className="text-emerald-500" />{t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────────── */}
      <section className="py-14 px-5">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-extrabold text-white mb-2">Preguntas frecuentes</h2>
            <p className="text-slate-400 text-sm">Todo lo que necesitas saber antes de empezar.</p>
          </div>
          <div className="space-y-2">
            {FAQS.map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/60 py-8 px-5">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <LogoIcon size={20} />
              <span className="text-white font-bold text-sm">LocalSEOHub.io</span>
              <span className="text-slate-600 text-xs">© 2026</span>
            </div>
            <div className="flex items-center gap-5">
              {[
                { label: 'Privacidad', modal: 'privacy' as LegalModal },
                { label: 'Términos', modal: 'terms' as LegalModal },
                { label: 'Contacto', modal: 'contact' as LegalModal },
              ].map(({ label, modal }) => (
                <button key={label} onClick={() => setLegalModal(modal)}
                  className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ── LEGAL MODALS ─────────────────────────────────────────────────────── */}
      {legalModal === 'privacy' && <PrivacyModal onClose={() => setLegalModal(null)} />}
      {legalModal === 'terms'   && <TermsModal   onClose={() => setLegalModal(null)} />}
      {legalModal === 'contact' && <ContactModal onClose={() => setLegalModal(null)} />}
    </div>
  );
}
