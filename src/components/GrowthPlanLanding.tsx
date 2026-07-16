import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRight, Check, Copy, Mail, Eye, Calendar, Zap } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { trackLead, trackCompleteRegistration } from '../lib/pixel';

// ─── UTM & scroll helpers ─────────────────────────────────────────────────────

function getUtm() {
  const p = new URLSearchParams(window.location.search);
  return {
    landing_path: '/plan-crecimiento-gratis',
    referrer: document.referrer || undefined,
    utm_source: p.get('utm_source') ?? undefined,
    utm_medium: p.get('utm_medium') ?? undefined,
    utm_campaign: p.get('utm_campaign') ?? undefined,
    utm_content: p.get('utm_content') ?? undefined,
    fbclid: p.get('fbclid') ?? undefined,
  };
}

// ─── Sector detection from name ───────────────────────────────────────────────

type Sector = 'restaurante' | 'clinica' | 'peluqueria' | 'taller' | 'tienda' | 'fitness' | 'inmobiliaria' | 'general';

const SECTOR_KEYWORDS: [string, Sector][] = [
  ['restaurante', 'restaurante'], ['bar', 'restaurante'], ['pizz', 'restaurante'], ['sushi', 'restaurante'],
  ['cafeter', 'restaurante'], ['asador', 'restaurante'], ['tapas', 'restaurante'],
  ['clínica', 'clinica'], ['clinica', 'clinica'], ['dental', 'clinica'], ['fisio', 'clinica'],
  ['médic', 'clinica'], ['medic', 'clinica'], ['optic', 'clinica'], ['veterinar', 'clinica'],
  ['peluquer', 'peluqueria'], ['salón', 'peluqueria'], ['salon', 'peluqueria'],
  ['estétic', 'peluqueria'], ['estetica', 'peluqueria'], ['barbería', 'peluqueria'], ['barberia', 'peluqueria'],
  ['taller', 'taller'], ['mecánic', 'taller'], ['mecanica', 'taller'], ['reparaci', 'taller'],
  ['electric', 'taller'], ['fontaner', 'taller'], ['reforma', 'taller'],
  ['tienda', 'tienda'], ['florist', 'tienda'], ['moda', 'tienda'], ['zapater', 'tienda'],
  ['boutique', 'tienda'], ['farmac', 'tienda'],
  ['gym', 'fitness'], ['gimnasio', 'fitness'], ['crossfit', 'fitness'], ['yoga', 'fitness'], ['pilates', 'fitness'],
  ['inmobiliar', 'inmobiliaria'], ['inmueble', 'inmobiliaria'], ['piso', 'inmobiliaria'],
];

function detectSector(name: string): Sector {
  const lower = name.toLowerCase();
  for (const [kw, sector] of SECTOR_KEYWORDS) {
    if (lower.includes(kw)) return sector;
  }
  return 'general';
}

// ─── Content generation (deterministic, based on sector) ──────────────────────

interface PlanContent {
  publication: { title: string; body: string; cta: string; channel: string };
  opportunity: string;
  priority: { action: string; impact: 'alto' | 'medio' };
}

const PLANS: Record<Sector, PlanContent> = {
  restaurante: {
    publication: {
      title: '3 platos que nuestros clientes repiten cada semana',
      body: 'Hemos preguntado a nuestros clientes habituales cuáles son sus platos favoritos. Aquí tienes los tres más pedidos y por qué les encantan.',
      cta: 'Reserva tu mesa y pruébalos',
      channel: 'Instagram / Google Business',
    },
    opportunity: 'Crear contenido sobre platos populares y experiencias de clientes para búsquedas relacionadas con "dónde comer" + tu zona.',
    priority: { action: 'Publicar al menos 3 fotos nuevas de platos esta semana y responder las reseñas pendientes en Google.', impact: 'alto' },
  },
  clinica: {
    publication: {
      title: '5 señales de que deberías pedir cita con tu especialista',
      body: 'Muchas personas ignoran pequeñas señales que podrían prevenirse con una consulta a tiempo. Aquí explicamos cuáles son las más habituales.',
      cta: 'Pide tu cita de revisión',
      channel: 'Google Business / Blog',
    },
    opportunity: 'Posicionar contenido educativo sobre prevención y síntomas frecuentes en tu especialidad para captar búsquedas locales.',
    priority: { action: 'Actualizar los servicios de tu ficha online y añadir horarios precisos para esta semana.', impact: 'alto' },
  },
  peluqueria: {
    publication: {
      title: 'Tendencias de esta temporada que mejor quedan según tu tipo de rostro',
      body: 'No todos los cortes funcionan igual. Te explicamos cómo elegir el estilo que más favorece según la forma de tu cara.',
      cta: 'Reserva tu sesión de asesoramiento',
      channel: 'Instagram / TikTok',
    },
    opportunity: 'Publicar transformaciones de clientes (antes/después) para aparecer en búsquedas tipo "mejor peluquería cerca de mí".',
    priority: { action: 'Subir 5 fotos recientes de trabajos terminados a tu perfil online.', impact: 'alto' },
  },
  taller: {
    publication: {
      title: '3 revisiones que te evitarán averías caras este verano',
      body: 'Antes de un viaje largo o de la temporada de calor, hay tres puntos que merece la pena revisar para prevenir problemas.',
      cta: 'Pide cita para tu revisión preventiva',
      channel: 'Google Business / WhatsApp Business',
    },
    opportunity: 'Crear contenido estacional sobre mantenimiento preventivo para captar búsquedas tipo "taller cerca" + servicio concreto.',
    priority: { action: 'Responder todas las reseñas pendientes y añadir fotos del taller y del equipo.', impact: 'alto' },
  },
  tienda: {
    publication: {
      title: 'Novedades de esta semana: lo que más nos están pidiendo',
      body: 'Cada semana seleccionamos los productos más demandados por nuestros clientes. Estos son los favoritos de esta semana.',
      cta: 'Ven a verlos o consulta disponibilidad',
      channel: 'Instagram / Google Business',
    },
    opportunity: 'Publicar novedades semanales y productos estrella para generar visitas recurrentes desde búsquedas locales.',
    priority: { action: 'Actualizar catálogo online con los 5 productos más vendidos este mes.', impact: 'medio' },
  },
  fitness: {
    publication: {
      title: 'Rutina de 20 minutos para empezar la semana con energía',
      body: 'No siempre hace falta una sesión larga. Te enseñamos una rutina rápida y efectiva para esos días con menos tiempo.',
      cta: 'Prueba una clase gratis',
      channel: 'Instagram Reels / TikTok',
    },
    opportunity: 'Crear contenido de rutinas rápidas y consejos prácticos para aparecer en búsquedas de "gimnasio" + tu barrio o ciudad.',
    priority: { action: 'Publicar un vídeo corto mostrando las instalaciones y el ambiente de una clase.', impact: 'alto' },
  },
  inmobiliaria: {
    publication: {
      title: '¿Cuánto ha cambiado el precio por m² en tu zona este año?',
      body: 'Te contamos cómo ha evolucionado el mercado en tu barrio y qué significa si estás pensando en comprar o vender.',
      cta: 'Solicita una valoración gratuita',
      channel: 'Google Business / Blog',
    },
    opportunity: 'Publicar análisis de mercado local para posicionarte como referencia en búsquedas de "pisos en venta" + tu zona.',
    priority: { action: 'Actualizar la descripción de tu negocio online con los barrios y tipos de inmueble que trabajas.', impact: 'medio' },
  },
  general: {
    publication: {
      title: 'Lo que nuestros clientes nos preguntan con más frecuencia',
      body: 'Hemos recopilado las dudas más habituales que recibimos cada semana y las respondemos de forma clara.',
      cta: 'Contacta con nosotros si tienes más preguntas',
      channel: 'Google Business / Instagram',
    },
    opportunity: 'Responder preguntas frecuentes de forma pública para captar búsquedas relacionadas con tu servicio y ubicación.',
    priority: { action: 'Completar toda la información de tu perfil online: horarios, servicios, fotos y descripción.', impact: 'alto' },
  },
};

function getPlan(name: string): PlanContent {
  const sector = detectSector(name);
  return PLANS[sector];
}

// ─── Loading ──────────────────────────────────────────────────────────────────

const LOAD_STEPS = [
  'Identificando tu negocio',
  'Entendiendo tus servicios',
  'Detectando oportunidades locales',
  'Preparando ideas de contenido',
  'Priorizando las próximas acciones',
];

function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [active, setActive] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());

  useEffect(() => {
    const dur = 4200;
    const gap = dur / LOAD_STEPS.length;
    const timers: ReturnType<typeof setTimeout>[] = [];

    LOAD_STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setActive(i);
        if (i > 0) setDone(p => new Set(p).add(i - 1));
      }, i * gap));
    });
    timers.push(setTimeout(() => {
      setDone(new Set(LOAD_STEPS.map((_, i) => i)));
      setTimeout(onDone, 300);
    }, dur));

    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(2,7,12,0.97)', backdropFilter: 'blur(20px)' }}>
      <div className="w-full max-w-[320px]">
        <div className="flex justify-center mb-8">
          <div className="relative w-14 h-14">
            <div className="absolute inset-0 rounded-full animate-ping"
              style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.15) 0%, transparent 70%)' }} />
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <Zap size={20} className="text-emerald-400" />
            </div>
          </div>
        </div>

        <div className="space-y-3.5">
          {LOAD_STEPS.map((step, i) => {
            const isDone = done.has(i);
            const isActive = active === i && !isDone;
            return (
              <div key={i} className="flex items-center gap-3 transition-all duration-300"
                style={{ opacity: isDone || isActive ? 1 : 0.12 }}>
                <div className="flex-shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center transition-all"
                  style={{
                    background: isDone ? '#10b981' : 'transparent',
                    border: isDone ? 'none' : `1px solid ${isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'}`,
                  }}>
                  {isDone ? <Check size={10} className="text-white" strokeWidth={3} />
                    : isActive ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> : null}
                </div>
                <span className="text-[13px]"
                  style={{ color: isDone ? '#34d399' : isActive ? '#fff' : 'rgba(255,255,255,0.12)' }}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Result view ──────────────────────────────────────────────────────────────

function ResultView({ business, plan, onRegister }: {
  business: string;
  plan: PlanContent;
  onRegister: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<0 | 1 | 2>(0);
  const gateRef = useRef<HTMLDivElement>(null);
  const utm = useRef(getUtm());

  useEffect(() => {
    track('result_viewed', { business, ...utm.current });
  }, [business]);

  const copyPost = () => {
    navigator.clipboard.writeText(`${plan.publication.title}\n\n${plan.publication.body}\n\n${plan.publication.cta}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { label: 'Contenido', icon: Calendar },
    { label: 'Visibilidad', icon: Eye },
    { label: 'Prioridad', icon: Zap },
  ];

  return (
    <div className="min-h-screen pb-32">
      {/* Header */}
      <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-white font-bold text-sm">Plan inicial para {business}</span>
      </div>

      <div className="max-w-lg mx-auto px-5 pt-6 space-y-5">

        {/* Tab nav */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)' }}>
          {tabs.map((t, i) => (
            <button key={i} onClick={() => {
              setTab(i as 0 | 1 | 2);
              track(`${['content','opportunity','priority'][i]}_preview_viewed`, { business, ...utm.current });
            }}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-semibold transition-all"
              style={{
                background: tab === i ? 'rgba(16,185,129,0.12)' : 'transparent',
                color: tab === i ? '#34d399' : 'rgba(148,163,184,0.6)',
                border: tab === i ? '1px solid rgba(16,185,129,0.2)' : '1px solid transparent',
              }}>
              <t.icon size={13} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 0 && (
          <div className="glass-card rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={13} className="text-emerald-400" />
              <span className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">Publicación recomendada</span>
            </div>
            <h3 className="text-white font-bold text-[15px] leading-snug">{plan.publication.title}</h3>
            <p className="text-slate-400 text-[13px] leading-relaxed">{plan.publication.body}</p>
            <p className="text-emerald-400 text-[13px] font-medium">{plan.publication.cta}</p>
            <div className="flex items-center justify-between pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-slate-600 text-[11px]">Canal: {plan.publication.channel}</span>
              <button onClick={copyPost}
                className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-all"
                style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>
                {copied ? <><Check size={11} />Copiado</> : <><Copy size={11} />Copiar</>}
              </button>
            </div>
          </div>
        )}

        {tab === 1 && (
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Eye size={13} className="text-emerald-400" />
              <span className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">Oportunidad detectada</span>
            </div>
            <p className="text-white text-[14px] leading-relaxed font-medium">{plan.opportunity}</p>
            <p className="text-slate-600 text-[11px] leading-relaxed pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              Esta recomendación se basa en el tipo de negocio y patrones habituales del sector. No implica un análisis de datos externos.
            </p>
          </div>
        )}

        {tab === 2 && (
          <div className="glass-card rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Zap size={13} className="text-emerald-400" />
              <span className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider">Haz esto primero</span>
            </div>
            <p className="text-white text-[14px] leading-relaxed font-medium">{plan.priority.action}</p>
            <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-slate-600 text-[11px]">Impacto potencial:</span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  color: plan.priority.impact === 'alto' ? '#34d399' : '#fbbf24',
                  background: plan.priority.impact === 'alto' ? 'rgba(16,185,129,0.1)' : 'rgba(251,191,36,0.1)',
                }}>
                {plan.priority.impact}
              </span>
            </div>
            <p className="text-slate-700 text-[10px]">La priorización es orientativa y depende del estado actual de cada negocio.</p>
          </div>
        )}

        {/* Gate section */}
        <div ref={gateRef} className="pt-4 space-y-4">
          {/* Blurred preview */}
          <div className="relative" style={{ userSelect: 'none' }}>
            <div className="space-y-3" style={{ filter: 'blur(5px)', opacity: 0.3 }}>
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-white text-sm font-medium">Calendario de 30 publicaciones</p>
                <p className="text-slate-600 text-xs">Planificación completa del mes...</p>
              </div>
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-white text-sm font-medium">Plan semanal personalizado</p>
                <p className="text-slate-600 text-xs">Acciones priorizadas para cada semana...</p>
              </div>
              <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-white text-sm font-medium">Herramientas de visibilidad local</p>
                <p className="text-slate-600 text-xs">Análisis, directorios, reseñas...</p>
              </div>
            </div>
          </div>

          {/* Gate CTA */}
          <div className="glass-card rounded-2xl p-6 text-center space-y-4">
            <h3 className="text-white font-black text-[18px] leading-snug">Tu plan completo ya está preparado</h3>
            <p className="text-slate-500 text-[13px] leading-relaxed">
              Crea tu cuenta gratuita para guardar el plan, desbloquear el calendario completo y seguir generando contenido para tu negocio.
            </p>
            <button onClick={() => {
              track('register_click', { business, ...utm.current });
              onRegister();
            }}
              className="w-full font-bold text-[14px] py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
              style={{ background: '#10b981', color: '#fff', boxShadow: '0 0 0 1px rgba(16,185,129,0.3), 0 6px 24px rgba(16,185,129,0.22)' }}>
              Guardar y desbloquear mi plan <ArrowRight size={14} />
            </button>
            <p className="text-slate-700 text-[11px]">Sin tarjeta. Puedes probarlo antes de decidir.</p>
          </div>

          {/* Trust */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-slate-400 text-[13px] font-semibold mb-3">¿Qué puedes hacer con tu plan?</p>
            <ul className="space-y-2">
              {['Saber qué publicar cada semana', 'Priorizar las acciones importantes', 'Ahorrar tiempo con recomendaciones adaptadas', 'Mejorar progresivamente tu presencia digital'].map(t => (
                <li key={t} className="flex items-center gap-2.5 text-slate-500 text-[12px]">
                  <Check size={12} className="text-emerald-500 flex-shrink-0" strokeWidth={3} />{t}
                </li>
              ))}
            </ul>
            <p className="text-slate-700 text-[10px] mt-3 leading-relaxed">
              LocalSEOHub organiza las recomendaciones. Los resultados dependen también de la ejecución, el mercado y la competencia.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Registration overlay ─────────────────────────────────────────────────────

type RegState = 'form' | 'sending' | 'sent' | 'error';

function RegisterOverlay({ business, onClose }: { business: string; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<RegState>('form');
  const [err, setErr] = useState('');
  const utm = useRef(getUtm());

  useEffect(() => {
    track('register_started', { business, ...utm.current });
  }, [business]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState('sending');
    setErr('');

    localStorage.setItem('_gp_name', business);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin + '/plan-crecimiento-gratis',
        shouldCreateUser: true,
      },
    });

    if (error) {
      setState('error');
      setErr('No pudimos enviar el enlace. Inténtalo de nuevo.');
      track('register_failed', { business, error: error.message, ...utm.current });
      return;
    }

    trackLead();
    trackCompleteRegistration();
    track('register_success', { business, method: 'magic_link', ...utm.current });
    setState('sent');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(2,7,12,0.92)', backdropFilter: 'blur(12px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-[420px] mx-4 mb-4 sm:mb-0 rounded-2xl overflow-hidden"
        style={{ background: 'linear-gradient(180deg, rgba(18,38,58,0.95) 0%, rgba(10,22,36,0.98) 100%)', border: '1px solid rgba(255,255,255,0.1)' }}>

        {/* Context reminder */}
        <div className="px-6 pt-5 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-slate-500 text-[11px]">Tu plan para:</p>
          <p className="text-white font-bold text-[14px]">{business}</p>
        </div>

        <div className="px-6 py-5">
          {state === 'sent' ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
                <Mail size={20} className="text-emerald-400" />
              </div>
              <p className="text-white font-bold text-[15px] mb-1">Revisa tu email</p>
              <p className="text-slate-500 text-[13px] leading-relaxed">
                Hemos enviado un enlace a <span className="text-slate-300">{email}</span>.
                <br />Al hacer clic accederás a tu plan completo.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <p className="text-white font-bold text-[15px] mb-1">Continúa con tu plan</p>
              <p className="text-slate-500 text-[12px] mb-3">Introduce tu email para guardar el plan y acceder cuando quieras.</p>
              <div className="relative">
                <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="Tu email"
                  className="w-full rounded-xl pl-10 pr-4 py-4 text-sm text-white placeholder-slate-600 outline-none"
                  style={{ background: 'rgba(3,8,16,0.88)', border: '1px solid rgba(255,255,255,0.09)' }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)')}
                />
              </div>
              {err && <p className="text-red-400 text-xs">{err}</p>}
              <button type="submit" disabled={state === 'sending'}
                className="w-full font-bold text-[14px] py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                style={{ background: '#10b981', color: '#fff', boxShadow: '0 0 0 1px rgba(16,185,129,0.3), 0 6px 20px rgba(16,185,129,0.2)' }}>
                {state === 'sending'
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Enviando...</>
                  : <>Continuar con mi plan <ArrowRight size={14} /></>
                }
              </button>
              <p className="text-center text-slate-700 text-[11px]">Sin tarjeta · Sin compromiso</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type Stage = 'hero' | 'loading' | 'result';

export default function GrowthPlanLanding() {
  const [stage, setStage] = useState<Stage>('hero');
  const [name, setName] = useState('');
  const [plan, setPlan] = useState<PlanContent | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [previewTab, setPreviewTab] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [formVisible, setFormVisible] = useState(true);
  const startRef = useRef(0);
  const utm = useRef(getUtm());
  const typedOnce = useRef(false);
  const scrollTracked = useRef(false);
  const loadTs = useRef(Date.now());

  // ── Magic-link return ──────────────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const saved = localStorage.getItem('_gp_name');
        if (saved) {
          setName(saved);
          setPlan(getPlan(saved));
          setStage('result');
          setShowRegister(false);
          trackCompleteRegistration();
          track('register_success', { business: saved, method: 'magic_link_return', ...utm.current });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Page tracking ──────────────────────────────────────────
  useEffect(() => {
    track('landing_view', utm.current);
    track('hero_visible', utm.current);
  }, []);

  // ── Form visibility observer (for sticky CTA) ──────────────
  useEffect(() => {
    if (!formRef.current) return;
    const obs = new IntersectionObserver(([e]) => setFormVisible(e.isIntersecting), { threshold: 0.3 });
    obs.observe(formRef.current);
    return () => obs.disconnect();
  }, [stage]);

  // ── Scroll depth ───────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (scrollTracked.current) return;
      const pct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      if (pct > 50) {
        scrollTracked.current = true;
        track('scroll_depth_50', utm.current);
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  // ── Input handlers ─────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (!typedOnce.current && e.target.value.length > 0) {
      typedOnce.current = true;
      track('business_name_started', { time_to_type_ms: Date.now() - loadTs.current, ...utm.current });
    }
  };

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { inputRef.current?.focus(); return; }
    track('business_name_completed', { business: name.trim(), ...utm.current });
    track('analysis_click', { business: name.trim(), time_to_click_ms: Date.now() - loadTs.current, ...utm.current });
    startRef.current = Date.now();
    setStage('loading');
    track('analysis_started', { business: name.trim(), ...utm.current });
  }, [name]);

  const handleLoadDone = useCallback(() => {
    const p = getPlan(name.trim());
    setPlan(p);
    track('analysis_completed', { business: name.trim(), analysis_time_ms: Date.now() - startRef.current, ...utm.current });
    setStage('result');
  }, [name]);

  const ready = name.trim().length >= 2;

  // ── Preview content (changes based on detected sector) ─────
  const previewSector = ready ? detectSector(name) : 'general';
  const previewPlan = PLANS[previewSector];
  const previews = [
    { label: 'Contenido', text: `"${previewPlan.publication.title}"`, sub: 'Generar confianza y consultas locales.' },
    { label: 'Visibilidad', text: 'Crear contenido específico para búsquedas relacionadas con tu servicio y ciudad.', sub: '' },
    { label: 'Prioridad', text: 'Actualizar servicios, publicar una novedad y responder las reseñas pendientes.', sub: '' },
  ];

  // ── Loading ────────────────────────────────────────────────
  if (stage === 'loading') return <LoadingScreen onDone={handleLoadDone} />;

  // ── Result ─────────────────────────────────────────────────
  if (stage === 'result' && plan) {
    return (
      <>
        <ResultView business={name.trim()} plan={plan} onRegister={() => setShowRegister(true)} />
        {showRegister && <RegisterOverlay business={name.trim()} onClose={() => setShowRegister(false)} />}
      </>
    );
  }

  // ── Hero ───────────────────────────────────────────────────
  return (
    <div className="min-h-[100svh] flex flex-col">

      <div className="flex-1 flex flex-col items-center justify-center px-5 pt-6 pb-4 relative">
        {/* Top glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[200px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.06) 0%, transparent 70%)' }} />

        <div className="relative w-full max-w-[480px]">
          {/* Eyebrow */}
          <div className="flex justify-center mb-5">
            <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] px-3 py-1.5 rounded-full"
              style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)', color: 'rgba(52,211,153,0.85)' }}>
              Diagnóstico gratuito para negocios locales
            </span>
          </div>

          {/* Headline */}
          <h1 className="text-white text-center font-black leading-[1.08] tracking-[-0.03em] mb-3"
            style={{ fontSize: 'clamp(22px, 5.5vw, 40px)' }}>
            Descubre qué publicaría, mejoraría y priorizaría la IA para tu negocio{' '}
            <span style={{ background: 'linear-gradient(135deg, #10b981, #34d399)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              este mes
            </span>
          </h1>

          {/* Subtitle */}
          <p className="text-center text-slate-500 leading-[1.6] mb-6 max-w-[380px] mx-auto"
            style={{ fontSize: 'clamp(12px, 1.6vw, 14px)' }}>
            Introduce tu negocio y recibe una vista previa personalizada con ideas de contenido, oportunidades de visibilidad y acciones recomendadas.
          </p>

          {/* ═══ FORM ═══ */}
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-slate-400 text-[11px] font-semibold mb-1.5 block pl-1">
                Nombre de tu negocio
              </label>
              <input
                ref={inputRef}
                type="text"
                autoFocus
                autoComplete="off"
                value={name}
                onChange={handleChange}
                placeholder="Ejemplo: Clínica Dental Sonrisa, Málaga"
                className="w-full rounded-xl text-white outline-none transition-all duration-200"
                style={{
                  padding: '16px',
                  fontSize: 15,
                  background: ready ? 'rgba(16,185,129,0.04)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${ready ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.1)'}`,
                  boxShadow: ready ? '0 0 0 3px rgba(16,185,129,0.06)' : 'none',
                }}
              />
              {ready && (
                <p className="text-emerald-600 text-[11px] mt-1.5 pl-1 animate-pulse">
                  Estamos preparando una vista previa para tu negocio.
                </p>
              )}
            </div>
            <button type="submit"
              className="w-full font-black rounded-xl flex items-center justify-center gap-2 transition-all duration-200"
              style={{
                padding: '16px',
                fontSize: 14,
                background: ready ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(16,185,129,0.15)',
                color: ready ? '#fff' : 'rgba(16,185,129,0.45)',
                boxShadow: ready ? '0 0 0 1px rgba(16,185,129,0.3), 0 6px 24px rgba(16,185,129,0.2)' : 'none',
              }}>
              {ready ? `Analizar ${name.trim().slice(0, 30)}` : 'Crear mi plan gratuito'}
              <ArrowRight size={14} style={{ opacity: ready ? 1 : 0.4 }} />
            </button>
          </form>

          {/* Micro trust */}
          <div className="flex items-center justify-center gap-3 mt-3 flex-wrap">
            {['Sin tarjeta', 'Resultado personalizado', 'Menos de 60 segundos'].map(t => (
              <span key={t} className="flex items-center gap-1 text-[11px]" style={{ color: 'rgba(100,116,139,0.65)' }}>
                <Check size={10} className="text-emerald-600 flex-shrink-0" strokeWidth={3} />{t}
              </span>
            ))}
          </div>

          <p className="text-center text-slate-700 text-[10px] mt-2.5 leading-relaxed max-w-[320px] mx-auto">
            No recibirás un informe genérico. Las recomendaciones se adaptarán a tu negocio, ubicación y sector.
          </p>
        </div>
      </div>

      {/* ═══ PREVIEW SECTION ═══ */}
      <div className="px-5 pb-6 max-w-[480px] mx-auto w-full">
        <p className="text-slate-500 text-[12px] font-semibold text-center mb-3">
          Esto es parte de lo que recibirás
        </p>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)' }}>
          {previews.map((pv, i) => (
            <button key={i} onClick={() => setPreviewTab(i)}
              className="flex-1 text-[11px] font-semibold py-2 rounded-lg transition-all"
              style={{
                background: previewTab === i ? 'rgba(16,185,129,0.1)' : 'transparent',
                color: previewTab === i ? '#34d399' : 'rgba(148,163,184,0.5)',
                border: previewTab === i ? '1px solid rgba(16,185,129,0.15)' : '1px solid transparent',
              }}>
              {pv.label}
            </button>
          ))}
        </div>

        {/* Preview card */}
        <div className="rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p className="text-white text-[13px] font-medium leading-snug mb-1">{previews[previewTab].text}</p>
          {previews[previewTab].sub && (
            <p className="text-slate-600 text-[11px]">{previews[previewTab].sub}</p>
          )}
        </div>
      </div>

      {/* ═══ STICKY MOBILE CTA ═══ */}
      {!formVisible && stage === 'hero' && (
        <div className="sm:hidden fixed bottom-0 left-0 right-0 z-20 px-4 py-3"
          style={{ background: 'rgba(2,7,12,0.97)', borderTop: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>
          <button
            onClick={() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="w-full text-white font-black text-[13px] py-4 rounded-xl flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', boxShadow: '0 0 0 1px rgba(16,185,129,0.3), 0 6px 20px rgba(16,185,129,0.2)' }}>
            Crear mi plan gratuito <ArrowRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
