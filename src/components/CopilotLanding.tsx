import { useState, useEffect, useRef } from 'react';
import {
  ArrowRight, Sparkles, Search, PenTool, BarChart3, Calendar,
  Zap, CheckCircle2, ChevronDown, Star, TrendingUp, MessageSquare,
  Target, Clock, Lightbulb, ListChecks, History, Play,
} from 'lucide-react';
import { track } from '../lib/analytics';

// ─── Scroll animation hook ────────────────────────────────────────────────────

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.15 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

// ─── Tracking helper ──────────────────────────────────────────────────────────

function getUtm() {
  const p = new URLSearchParams(window.location.search);
  return {
    landing_path: '/copiloto-ia',
    referrer: document.referrer || undefined,
    utm_source: p.get('utm_source') ?? undefined,
    utm_medium: p.get('utm_medium') ?? undefined,
    utm_campaign: p.get('utm_campaign') ?? undefined,
    fbclid: p.get('fbclid') ?? undefined,
  };
}

// ─── Scroll depth tracking ────────────────────────────────────────────────────

function useScrollDepth() {
  const tracked = useRef(new Set<number>());
  const utm = useRef(getUtm());
  useEffect(() => {
    const handler = () => {
      const pct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
      [25, 50, 75, 100].forEach(t => {
        if (pct >= t && !tracked.current.has(t)) {
          tracked.current.add(t);
          track(`scroll_${t}`, utm.current);
        }
      });
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);
}

// ─── Mini dashboard component (hero) ─────────────────────────────────────────

function DashboardDemo() {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = ['Contenido', 'Prioridades', 'Visibilidad'];

  return (
    <div className="rounded-2xl overflow-hidden shadow-2xl shadow-slate-200/80 border border-slate-200/60"
      style={{ background: '#fafbfc' }}>
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-100">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="flex-1 flex justify-center">
          <div className="px-4 py-1 rounded-md text-[10px] text-slate-400 bg-slate-100">localseohub.io/dashboard</div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="hidden sm:flex flex-col w-[140px] border-r border-slate-100 py-3 px-2 gap-0.5">
          {['Panel', 'Contenido', 'Calendario', 'Visibilidad', 'Competencia'].map((item, i) => (
            <div key={item} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] transition-all ${i === 0 ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-slate-500 hover:bg-slate-50'}`}>
              {[BarChart3, PenTool, Calendar, Search, Target][i] &&
                (() => { const Icon = [BarChart3, PenTool, Calendar, Search, Target][i]; return <Icon size={12} />; })()
              }
              {item}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div className="flex-1 p-4 space-y-3">
          {/* Score card */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[11px] font-black">82</div>
            <div>
              <p className="text-slate-900 text-[12px] font-semibold">Clínica Dental Sonrisa</p>
              <p className="text-slate-400 text-[10px]">3 acciones pendientes esta semana</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-0.5 rounded-lg bg-slate-100">
            {tabs.map((t, i) => (
              <button key={t} onClick={() => setActiveTab(i)}
                className={`flex-1 text-[10px] font-medium py-1.5 rounded-md transition-all ${activeTab === i ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>
                {t}
              </button>
            ))}
          </div>

          {/* Content */}
          {activeTab === 0 && (
            <div className="space-y-2">
              {[
                { title: 'Cómo evitar sensibilidad dental este verano', tag: 'Instagram', color: 'emerald' },
                { title: '5 señales de que necesitas una revisión', tag: 'Blog', color: 'blue' },
                { title: 'Antes y después: blanqueamiento dental', tag: 'Google Business', color: 'amber' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all cursor-pointer group">
                  <div className={`w-1.5 h-6 rounded-full flex-shrink-0 ${item.color === 'emerald' ? 'bg-emerald-400' : item.color === 'blue' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 text-[11px] font-medium truncate">{item.title}</p>
                    <p className="text-slate-400 text-[9px]">{item.tag}</p>
                  </div>
                  <ArrowRight size={10} className="text-slate-300 group-hover:text-emerald-500 transition-colors" />
                </div>
              ))}
            </div>
          )}
          {activeTab === 1 && (
            <div className="space-y-2">
              {[
                { text: 'Responder reseñas pendientes', impact: 'Alto', done: false },
                { text: 'Actualizar horarios de verano', impact: 'Alto', done: false },
                { text: 'Publicar foto del equipo', impact: 'Medio', done: true },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-slate-100">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.done ? 'border-emerald-400 bg-emerald-400' : 'border-slate-300'}`}>
                    {item.done && <CheckCircle2 size={10} className="text-white" />}
                  </div>
                  <p className={`text-[11px] flex-1 ${item.done ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{item.text}</p>
                  <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${item.impact === 'Alto' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{item.impact}</span>
                </div>
              ))}
            </div>
          )}
          {activeTab === 2 && (
            <div className="space-y-2">
              <div className="p-2.5 rounded-lg border border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-slate-500">Visibilidad en búsquedas</span>
                  <TrendingUp size={10} className="text-emerald-500" />
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-all duration-1000" style={{ width: '68%' }} />
                </div>
              </div>
              <div className="p-2.5 rounded-lg border border-emerald-100 bg-emerald-50/40">
                <p className="text-[10px] font-medium text-emerald-700">Oportunidad detectada</p>
                <p className="text-[10px] text-slate-600 mt-0.5">Crear contenido sobre "ortodoncia invisible" - alta demanda en tu zona.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({ icon: Icon, title, desc, delay }: { icon: typeof Search; title: string; desc: string; delay: number }) {
  const { ref, visible } = useReveal();
  return (
    <div ref={ref}
      className="group p-6 rounded-2xl border border-slate-100 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-50 transition-all duration-500 bg-white cursor-default"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)', transitionDelay: `${delay}ms` }}>
      <div className="w-11 h-11 rounded-xl bg-slate-50 group-hover:bg-emerald-50 flex items-center justify-center mb-4 transition-colors">
        <Icon size={20} className="text-slate-600 group-hover:text-emerald-600 transition-colors" />
      </div>
      <h3 className="text-slate-900 font-bold text-[15px] mb-1.5">{title}</h3>
      <p className="text-slate-500 text-[13px] leading-relaxed">{desc}</p>
    </div>
  );
}

// ─── Interactive dashboard section ────────────────────────────────────────────

function InteractiveDashboard() {
  const { ref, visible } = useReveal();
  const [hoveredWidget, setHoveredWidget] = useState<number | null>(null);

  const widgets = [
    { icon: Lightbulb, title: 'Ideas de contenido', value: '12 nuevas', desc: 'Publicaciones adaptadas a tu sector y temporada', color: 'amber' },
    { icon: Calendar, title: 'Calendario', value: 'Julio 2026', desc: '8 publicaciones planificadas para este mes', color: 'blue' },
    { icon: Target, title: 'Prioridades', value: '3 pendientes', desc: 'Acciones de alto impacto para esta semana', color: 'emerald' },
    { icon: Star, title: 'Google Business', value: '4.6 / 5', desc: '2 reseñas sin responder', color: 'amber' },
    { icon: TrendingUp, title: 'Visibilidad', value: '+12%', desc: 'Tendencia positiva en búsquedas locales', color: 'emerald' },
    { icon: MessageSquare, title: 'Competencia', value: '5 analizados', desc: 'Detecta qué hacen bien tus competidores', color: 'blue' },
  ];

  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(32px)', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)' }}>
      {widgets.map((w, i) => (
        <div key={i}
          onMouseEnter={() => setHoveredWidget(i)}
          onMouseLeave={() => setHoveredWidget(null)}
          className={`relative p-5 rounded-xl border transition-all duration-300 cursor-default ${hoveredWidget === i ? 'border-emerald-200 shadow-lg shadow-emerald-50 scale-[1.02]' : 'border-slate-100 hover:border-slate-200'}`}
          style={{ background: hoveredWidget === i ? 'linear-gradient(135deg, #f0fdf4, #ffffff)' : '#fff' }}>
          <div className="flex items-center justify-between mb-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${w.color === 'emerald' ? 'bg-emerald-50' : w.color === 'blue' ? 'bg-blue-50' : 'bg-amber-50'}`}>
              <w.icon size={15} className={w.color === 'emerald' ? 'text-emerald-600' : w.color === 'blue' ? 'text-blue-600' : 'text-amber-600'} />
            </div>
            <span className={`text-[11px] font-bold ${w.color === 'emerald' ? 'text-emerald-600' : w.color === 'blue' ? 'text-blue-600' : 'text-amber-600'}`}>{w.value}</span>
          </div>
          <p className="text-slate-900 text-[13px] font-semibold mb-0.5">{w.title}</p>
          <p className="text-slate-400 text-[11px] leading-relaxed">{w.desc}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Steps section ────────────────────────────────────────────────────────────

function StepsSection() {
  const { ref, visible } = useReveal();
  const steps = [
    { num: '1', title: 'Escribe tu negocio', desc: 'Nombre, sector y ubicación.' },
    { num: '2', title: 'La IA entiende tu situación', desc: 'Analiza tu presencia digital.' },
    { num: '3', title: 'Recibes un plan completo', desc: 'Contenido, acciones y prioridades.' },
    { num: '4', title: 'Empiezas a ejecutarlo', desc: 'Con guía paso a paso.' },
  ];

  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(32px)', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1)' }}>
      {steps.map((s, i) => (
        <div key={i} className="relative text-center p-6">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 text-emerald-600 font-black text-sm mb-4">{s.num}</div>
          {i < steps.length - 1 && (
            <div className="hidden lg:block absolute top-10 left-[60%] w-[80%] h-px bg-gradient-to-r from-emerald-200 to-transparent" />
          )}
          <h4 className="text-slate-900 font-bold text-[14px] mb-1">{s.title}</h4>
          <p className="text-slate-500 text-[12px]">{s.desc}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Benefits grid ────────────────────────────────────────────────────────────

function BenefitsGrid() {
  const { ref, visible } = useReveal();
  const items = [
    { icon: Lightbulb, text: 'Ideas de contenido' },
    { icon: Calendar, text: 'Calendario' },
    { icon: Zap, text: 'Prioridades' },
    { icon: Search, text: 'Auditoría' },
    { icon: TrendingUp, text: 'Oportunidades' },
    { icon: Sparkles, text: 'IA personalizada' },
    { icon: BarChart3, text: 'Seguimiento' },
    { icon: ListChecks, text: 'Plan semanal' },
    { icon: History, text: 'Historial' },
    { icon: Target, text: 'Próximas acciones' },
  ];

  return (
    <div ref={ref} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)' }}>
      {items.map((item, i) => (
        <div key={i} className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group cursor-default">
          <div className="w-9 h-9 rounded-lg bg-slate-50 group-hover:bg-emerald-50 flex items-center justify-center transition-colors">
            <item.icon size={16} className="text-slate-500 group-hover:text-emerald-600 transition-colors" />
          </div>
          <span className="text-slate-700 text-[11px] font-medium text-center">{item.text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Live preview simulation ──────────────────────────────────────────────────

function LivePreview() {
  const { ref, visible } = useReveal();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => setStep(p => (p + 1) % 4), 3000);
    return () => clearInterval(t);
  }, [visible]);

  return (
    <div ref={ref} className="max-w-lg mx-auto"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(24px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)' }}>
      <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-xl shadow-slate-100">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-[10px] font-black">82</div>
          <div>
            <p className="text-slate-900 text-[13px] font-bold">Clínica Dental Sonrisa</p>
            <p className="text-slate-400 text-[10px]">Analizado por LocalSEOHub</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3 min-h-[140px]">
          <div className={`transition-all duration-500 ${step === 0 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 absolute pointer-events-none'}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={12} className="text-emerald-500" />
              <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Puntuación</span>
            </div>
            <p className="text-slate-800 text-[14px] font-medium">82 / 100 - Buen nivel, con margen de mejora.</p>
          </div>
          <div className={`transition-all duration-500 ${step === 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 absolute pointer-events-none'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={12} className="text-amber-500" />
              <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Oportunidad</span>
            </div>
            <p className="text-slate-800 text-[14px] font-medium">Actualizar preguntas frecuentes en Google Business Profile.</p>
          </div>
          <div className={`transition-all duration-500 ${step === 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 absolute pointer-events-none'}`}>
            <div className="flex items-center gap-2 mb-2">
              <PenTool size={12} className="text-blue-500" />
              <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Nueva publicación</span>
            </div>
            <p className="text-slate-800 text-[14px] font-medium">Cómo evitar sensibilidad dental este verano.</p>
          </div>
          <div className={`transition-all duration-500 ${step === 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 absolute pointer-events-none'}`}>
            <div className="flex items-center gap-2 mb-2">
              <Zap size={12} className="text-emerald-500" />
              <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Prioridad</span>
            </div>
            <p className="text-slate-800 text-[14px] font-medium">Responder las últimas reseñas de Google.</p>
          </div>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 pb-4">
          {[0, 1, 2, 3].map(i => (
            <button key={i} onClick={() => setStep(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${step === i ? 'w-4 bg-emerald-500' : 'bg-slate-200'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

function FAQ() {
  const [open, setOpen] = useState<number | null>(null);
  const items = [
    { q: '¿Necesito conocimientos técnicos?', a: 'No. LocalSEOHub está diseñado para cualquier persona que gestione un negocio local. La IA se encarga de analizar, recomendar y crear contenido. Tú solo decides qué ejecutar.' },
    { q: '¿Cuánto tarda en generar resultados?', a: 'El primer plan se genera en menos de un minuto. Las mejoras en visibilidad dependen de la constancia, pero las primeras acciones puedes ejecutarlas el mismo día.' },
    { q: '¿Es gratis?', a: 'Puedes empezar sin coste. Hay un plan gratuito con funcionalidades básicas y planes de pago para negocios que quieran acceder a todas las herramientas.' },
    { q: '¿Sirve para cualquier tipo de negocio local?', a: 'Sí. Restaurantes, clínicas, talleres, tiendas, gimnasios, peluquerías, inmobiliarias y cualquier negocio con presencia local. La IA adapta las recomendaciones al sector.' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-2">
      {items.map((item, i) => (
        <div key={i} className="border border-slate-100 rounded-xl overflow-hidden hover:border-slate-200 transition-colors">
          <button onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-center justify-between p-5 text-left">
            <span className="text-slate-900 text-[14px] font-medium pr-4">{item.q}</span>
            <ChevronDown size={16} className={`text-slate-400 flex-shrink-0 transition-transform duration-300 ${open === i ? 'rotate-180' : ''}`} />
          </button>
          <div className={`overflow-hidden transition-all duration-300 ${open === i ? 'max-h-40 pb-5' : 'max-h-0'}`}>
            <p className="px-5 text-slate-500 text-[13px] leading-relaxed">{item.a}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Benefit item (extracted to respect hook rules) ───────────────────────────

function BenefitItem({ title, desc, index }: { title: string; desc: string; index: number }) {
  const { ref, visible } = useReveal();
  return (
    <div ref={ref} className="flex gap-3"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)', transition: `all 0.5s cubic-bezier(0.16,1,0.3,1) ${index * 80}ms` }}>
      <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-slate-900 font-semibold text-[14px]">{title}</p>
        <p className="text-slate-500 text-[13px]">{desc}</p>
      </div>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ children, id, className = '' }: { children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`px-5 sm:px-8 py-16 sm:py-24 ${className}`}>
      <div className="max-w-5xl mx-auto">{children}</div>
    </section>
  );
}

function SectionTitle({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  const { ref, visible } = useReveal();
  return (
    <div ref={ref} className="text-center mb-12 sm:mb-16"
      style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(16px)', transition: 'all 0.6s cubic-bezier(0.16,1,0.3,1)' }}>
      {eyebrow && <p className="text-emerald-600 text-[11px] font-semibold uppercase tracking-[0.15em] mb-3">{eyebrow}</p>}
      <h2 className="text-slate-900 font-black text-[24px] sm:text-[32px] leading-tight tracking-[-0.02em]">{title}</h2>
      {subtitle && <p className="text-slate-500 text-[14px] sm:text-[15px] mt-3 max-w-xl mx-auto leading-relaxed">{subtitle}</p>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CopilotLanding() {
  const utm = useRef(getUtm());
  useScrollDepth();

  useEffect(() => {
    track('landing_view', utm.current);
  }, []);

  const handleCta = (label: string) => {
    track('hero_cta', { button: label, ...utm.current });
    window.location.href = '/plan-crecimiento-gratis';
  };

  const handleSignup = () => {
    track('signup_click', utm.current);
    window.location.href = '/plan-crecimiento-gratis';
  };

  const scrollToHow = () => {
    document.getElementById('como-funciona')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>

      {/* ═══ NAV ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-5 sm:px-8 py-4 flex items-center justify-between"
        style={{ background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(16px) saturate(180%)', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
            <Zap size={14} className="text-white" fill="white" />
          </div>
          <span className="font-bold text-[14px] text-slate-900 tracking-tight">LocalSEOHub</span>
        </div>
        <button onClick={() => handleCta('nav')}
          className="text-[12px] font-semibold px-4 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors">
          Probar gratis
        </button>
      </nav>

      {/* ═══ HERO ═══ */}
      <Section className="pt-28 sm:pt-36 pb-8 sm:pb-16">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-100 mb-6">
              <Sparkles size={12} className="text-emerald-500" />
              <span className="text-emerald-700 text-[11px] font-semibold uppercase tracking-wider">IA para negocios locales</span>
            </div>
            <h1 className="text-[28px] sm:text-[40px] lg:text-[48px] font-black leading-[1.05] tracking-[-0.03em] text-slate-900 mb-5">
              El copiloto de IA que trabaja cada día para hacer crecer tu negocio.
            </h1>
            <p className="text-slate-500 text-[15px] sm:text-[17px] leading-relaxed mb-8 max-w-lg">
              Analiza tu negocio, descubre oportunidades, genera contenido, mejora Google Business Profile y sigue un plan de crecimiento desde una única plataforma.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => handleCta('hero_primary')}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-slate-900 text-white font-semibold text-[14px] hover:bg-slate-800 shadow-lg shadow-slate-900/10 transition-all hover:shadow-xl hover:shadow-slate-900/15 hover:-translate-y-0.5">
                Probar gratis <ArrowRight size={15} />
              </button>
              <button onClick={scrollToHow}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-[14px] hover:bg-slate-50 transition-all">
                <Play size={14} /> Ver cómo funciona
              </button>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-8 rounded-3xl pointer-events-none"
              style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(16,185,129,0.04) 0%, transparent 70%)' }} />
            <DashboardDemo />
          </div>
        </div>
      </Section>

      {/* ═══ FEATURES ═══ */}
      <Section className="bg-slate-50/50">
        <SectionTitle
          eyebrow="Funcionalidades"
          title="¿Qué hace LocalSEOHub?"
          subtitle="Todo lo que necesitas para gestionar la presencia digital de tu negocio local, en un solo lugar."
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard icon={Search} title="Analiza tu negocio" desc="Detecta oportunidades de crecimiento y áreas de mejora." delay={0} />
          <FeatureCard icon={PenTool} title="Genera contenido" desc="Publicaciones adaptadas a tu negocio y temporada." delay={100} />
          <FeatureCard icon={BarChart3} title="Optimiza Google Business" desc="Descubre acciones prioritarias para mejorar tu perfil." delay={200} />
          <FeatureCard icon={Calendar} title="Organiza tu estrategia" desc="La IA crea un plan semanal con las tareas más importantes." delay={300} />
        </div>
      </Section>

      {/* ═══ DASHBOARD ═══ */}
      <Section>
        <SectionTitle
          eyebrow="Plataforma"
          title="Todo en un solo lugar"
          subtitle="Un panel de control inteligente que organiza tu estrategia digital completa."
        />
        <InteractiveDashboard />
      </Section>

      {/* ═══ HOW IT WORKS ═══ */}
      <Section id="como-funciona" className="bg-slate-50/50">
        <SectionTitle
          eyebrow="Proceso"
          title="Así funciona"
          subtitle="Desde que escribes tu negocio hasta que empiezas a ejecutar tu plan."
        />
        <StepsSection />
      </Section>

      {/* ═══ WHAT YOU GET ═══ */}
      <Section>
        <SectionTitle
          eyebrow="Incluido"
          title="¿Qué recibes?"
          subtitle="Cada herramienta que necesitas para mejorar la visibilidad de tu negocio."
        />
        <BenefitsGrid />
      </Section>

      {/* ═══ LIVE PREVIEW ═══ */}
      <Section className="bg-slate-50/50">
        <SectionTitle
          eyebrow="Ejemplo real"
          title="Así se ve tu plan"
          subtitle="Un adelanto de lo que la IA prepara para cada negocio."
        />
        <LivePreview />
      </Section>

      {/* ═══ BENEFITS ═══ */}
      <Section>
        <SectionTitle
          eyebrow="Resultados"
          title="Menos esfuerzo, más impacto"
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {[
            { title: 'Más claridad', desc: 'Sabes exactamente qué hacer cada semana.' },
            { title: 'Más organización', desc: 'Un plan estructurado en vez de improvisación.' },
            { title: 'Más tiempo', desc: 'La IA genera el contenido por ti.' },
            { title: 'Más ideas', desc: 'Nunca te quedas sin saber qué publicar.' },
            { title: 'Mejor presencia digital', desc: 'Acciones concretas para mejorar tu perfil.' },
            { title: 'Menos estrés', desc: 'Deja de pensar qué publicar y cuándo.' },
          ].map((item, i) => (
            <BenefitItem key={i} title={item.title} desc={item.desc} index={i} />
          ))}
        </div>
      </Section>

      {/* ═══ FAQ ═══ */}
      <Section className="bg-slate-50/50">
        <SectionTitle
          eyebrow="Preguntas frecuentes"
          title="¿Tienes dudas?"
        />
        <FAQ />
      </Section>

      {/* ═══ FINAL CTA ═══ */}
      <Section>
        <div className="text-center">
          <h2 className="text-slate-900 font-black text-[24px] sm:text-[32px] tracking-[-0.02em] mb-4">
            Empieza hoy tu plan de crecimiento.
          </h2>
          <p className="text-slate-500 text-[15px] mb-8 max-w-md mx-auto">
            Prueba LocalSEOHub gratis. Sin tarjeta. Sin compromiso.
          </p>
          <button onClick={handleSignup}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-slate-900 text-white font-bold text-[15px] hover:bg-slate-800 shadow-lg shadow-slate-900/10 transition-all hover:shadow-xl hover:shadow-slate-900/15 hover:-translate-y-0.5">
            Crear mi cuenta gratuita <ArrowRight size={16} />
          </button>
        </div>
      </Section>

      {/* ═══ FOOTER ═══ */}
      <footer className="px-5 sm:px-8 py-8 border-t border-slate-100">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center">
              <Zap size={10} className="text-white" fill="white" />
            </div>
            <span className="text-slate-400 text-[12px]">LocalSEOHub</span>
          </div>
          <p className="text-slate-400 text-[11px]">Hecho para negocios locales.</p>
        </div>
      </footer>
    </div>
  );
}
