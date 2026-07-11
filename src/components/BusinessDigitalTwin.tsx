import React, { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  MapPin, Phone, Globe, Star, Instagram, Clock,
  TrendingUp, Shield, Zap, Camera, BarChart2, MessageSquare,
  Check, ArrowRight, ChevronRight, Sparkles, Brain,
  Building2, Tag, Wifi, Users, Award, Target,
  AlertCircle, CheckCircle2, ChevronDown,
} from 'lucide-react';

// ─── Architecture-ready data layer ───────────────────────────────────────────
// Replace these with Supabase queries when real data is available

const BUSINESS = {
  name:     'Restaurante La Bodega Sur',
  category: 'Restaurante Mediterráneo',
  hours:    'Lun–Dom 12:00–16:00 · 20:00–24:00',
  services: ['Cocina mediterránea', 'Menú del día', 'Terraza exterior', 'Eventos privados', 'Bodega propia'],
  zone:     'Barrio de Salamanca, Madrid',
  phone:    '+34 91 234 56 78',
  web:      'labodegasur.es',
  google:   '4.7 ★  ·  284 reseñas',
  instagram:'@labodegasur',
  facebook: 'fb.com/labodegasur',
  status:   'Activo',
  since:    '2019',
};

const METRICS = [
  { id: 'seo',         label: 'Nivel SEO',              value: 72, Icon: Search2,  color: 'sky'     },
  { id: 'reputation',  label: 'Reputación',              value: 86, Icon: Star,     color: 'emerald' },
  { id: 'competitive', label: 'Nivel competitivo',       value: 61, Icon: Target,   color: 'amber'   },
  { id: 'frequency',   label: 'Frecuencia publicaciones',value: 45, Icon: Zap,      color: 'red'     },
  { id: 'optimization',label: 'Optimización',            value: 78, Icon: BarChart2,color: 'violet'  },
  { id: 'photos',      label: 'Calidad fotografías',     value: 55, Icon: Camera,   color: 'pink'    },
  { id: 'popularity',  label: 'Popularidad local',       value: 70, Icon: Users,    color: 'teal'    },
  { id: 'trust',       label: 'Confianza',               value: 83, Icon: Shield,   color: 'emerald' },
  { id: 'tone',        label: 'Tono de comunicación',    value: 68, Icon: MessageSquare, color: 'sky' },
];

// Placeholder icon — real one assigned below
function Search2({ size, className }: { size: number; className?: string }) {
  return <Target size={size} className={className} />;
}

const PERSONALITY = [
  { id: 'p1', text: 'Tu negocio transmite cercanía y autenticidad local.', accent: 'emerald', Icon: Sparkles },
  { id: 'p2', text: 'El lenguaje en tus publicaciones es directo y cercano al cliente.', accent: 'sky', Icon: MessageSquare },
  { id: 'p3', text: 'Tus clientes valoran especialmente la rapidez del servicio.', accent: 'violet', Icon: Zap },
  { id: 'p4', text: 'Las reseñas reflejan una satisfacción alta, especialmente en ambiente y producto.', accent: 'amber', Icon: Star },
  { id: 'p5', text: 'La competencia comunica de forma más emocional y visual que tú.', accent: 'red', Icon: Brain },
];

const STRENGTHS = [
  { id: 's1', title: 'Reputación online sólida',     desc: 'Con 4.7★ y 284 reseñas superás al 85% de competidores en tu zona.' },
  { id: 's2', title: 'Alta tasa de respuesta',        desc: 'Respondes al 76% de las reseñas. La media del sector es solo 34%.'  },
  { id: 's3', title: 'Fotografías destacadas',        desc: 'Tus fotos de platos tienen un engagement 2× superior a la media.'   },
  { id: 's4', title: 'Horario completo y actualizado', desc: 'Horario publicado con festivos y temporadas. Genera un 18% más de visitas.' },
  { id: 's5', title: 'Categorías bien asignadas',     desc: '3 categorías secundarias que amplían tu alcance de búsqueda local.' },
];

const OPPORTUNITIES = [
  { id: 'o1', title: 'Añadir menú digital al perfil', desc: 'Solo el 12% de perfiles de tu zona tienen menú digital activo. Es una ventaja clara.',  impact: 'Alta', time: '10 min', color: 'amber',   tab: 'generator'    },
  { id: 'o2', title: 'Aumentar frecuencia de publicaciones', desc: 'Lleva 9 días sin publicar. La frecuencia óptima es 2–3 veces por semana.',          impact: 'Alta', time: '5 min',  color: 'red',     tab: 'generator'    },
  { id: 'o3', title: 'Enriquecer descripción de servicios', desc: 'Tus servicios no tienen descripción detallada. Esto penaliza el SEO local.',          impact: 'Media', time: '15 min', color: 'sky',    tab: 'generator'    },
  { id: 'o4', title: 'Responder 8 reseñas pendientes', desc: '8 reseñas sin responder en 14 días. Cada respuesta suma puntos de posición.',              impact: 'Alta', time: '4 min',  color: 'emerald', tab: 'maps-scanner' },
  { id: 'o5', title: 'Renovar fotos del interior', desc: 'Las fotos del interior tienen más de 6 meses. Actualizarlas genera un +22% de clics.',         impact: 'Media', time: '20 min', color: 'violet', tab: 'geo-audit'    },
];

const EXEC_ACTIONS = [
  { num: '01', title: 'Responder las 8 reseñas pendientes',     impact: '+6% Reputación', color: 'emerald', tab: 'maps-scanner' },
  { num: '02', title: 'Publicar 3 contenidos esta semana',       impact: '+8% Visibilidad', color: 'sky',    tab: 'generator'    },
  { num: '03', title: 'Optimizar descripción del perfil GBP',    impact: '+5% SEO',         color: 'violet', tab: 'generator'    },
];

const EVOLUTION = [
  { month: 'Ene', score: 54 },
  { month: 'Feb', score: 58 },
  { month: 'Mar', score: 61 },
  { month: 'Abr', score: 65 },
  { month: 'May', score: 63 },
  { month: 'Jun', score: 70 },
  { month: 'Jul', score: 78 },
];

// ─── Color map ────────────────────────────────────────────────────────────────
const CLR: Record<string, { text: string; bg: string; border: string; bar: string; soft: string }> = {
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', bar: 'from-emerald-500 to-teal-400',  soft: 'rgba(16,185,129,0.07)'  },
  sky:     { text: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/25',     bar: 'from-sky-500 to-cyan-400',      soft: 'rgba(14,165,233,0.07)'  },
  amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   bar: 'from-amber-500 to-orange-400',  soft: 'rgba(245,158,11,0.07)'  },
  violet:  { text: 'text-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/25',  bar: 'from-violet-500 to-purple-400', soft: 'rgba(139,92,246,0.07)'  },
  red:     { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25',     bar: 'from-red-500 to-rose-400',      soft: 'rgba(239,68,68,0.07)'   },
  teal:    { text: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/25',    bar: 'from-teal-500 to-cyan-400',     soft: 'rgba(20,184,166,0.07)'  },
  pink:    { text: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/25',    bar: 'from-pink-500 to-rose-400',     soft: 'rgba(236,72,153,0.07)'  },
};

const IMPACT_CLR: Record<string, string> = {
  Alta:  'text-red-400 bg-red-500/10 border-red-500/25',
  Media: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  Baja:  'text-slate-400 bg-slate-700/30 border-slate-700/40',
};

// ─── Animations ───────────────────────────────────────────────────────────────
const FU   = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16,1,0.3,1] as const } } };
const STAG = { show: { transition: { staggerChildren: 0.07 } } };

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ dot, children }: { dot: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">{children}</span>
    </div>
  );
}

// ─── Animated metric bar ──────────────────────────────────────────────────────
function MetricBar({ value, barClass, delay = 0 }: { value: number; barClass: string; delay?: number }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div ref={ref} className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${barClass}`}
        initial={{ width: 0 }}
        animate={{ width: inView ? `${value}%` : 0 }}
        transition={{ duration: 1.0, ease: [0.16,1,0.3,1], delay }}
        style={{ boxShadow: '0 0 6px rgba(255,255,255,0.12)' }}
      />
    </div>
  );
}

// ─── SVG Radar chart ──────────────────────────────────────────────────────────
function RadarChart({ metrics }: { metrics: typeof METRICS }) {
  const ref    = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let p = 0;
    const iv = setInterval(() => {
      p = Math.min(p + 0.04, 1);
      setProgress(p);
      if (p >= 1) clearInterval(iv);
    }, 18);
    return () => clearInterval(iv);
  }, [inView]);

  const N    = metrics.length;
  const CX   = 130; const CY = 130; const R = 100;
  const rings = [0.25, 0.5, 0.75, 1.0];

  const toXY = (i: number, radius: number) => {
    const angle = (i / N) * 2 * Math.PI - Math.PI / 2;
    return { x: CX + radius * Math.cos(angle), y: CY + radius * Math.sin(angle) };
  };

  const polygonPoints = metrics.map((m, i) => {
    const r = (m.value / 100) * R * progress;
    const { x, y } = toXY(i, r);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg ref={ref} viewBox="0 0 260 260" className="w-full max-w-[260px] mx-auto">
      {/* Background rings */}
      {rings.map((f) => (
        <polygon key={f}
          points={metrics.map((_, i) => { const { x, y } = toXY(i, R * f); return `${x},${y}`; }).join(' ')}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
      ))}
      {/* Axis lines */}
      {metrics.map((_, i) => {
        const { x, y } = toXY(i, R);
        return <line key={i} x1={CX} y1={CY} x2={x} y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />;
      })}
      {/* Data polygon */}
      <motion.polygon
        points={polygonPoints}
        fill="rgba(16,185,129,0.15)"
        stroke="#10b981"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* Data points */}
      {metrics.map((m, i) => {
        const r = (m.value / 100) * R * progress;
        const { x, y } = toXY(i, r);
        return <circle key={i} cx={x} cy={y} r={3} fill="#10b981" />;
      })}
      {/* Labels */}
      {metrics.map((m, i) => {
        const { x, y } = toXY(i, R + 18);
        const textAnchor = x < CX - 5 ? 'end' : x > CX + 5 ? 'start' : 'middle';
        return (
          <text key={i} x={x} y={y} textAnchor={textAnchor}
            fill="rgba(148,163,184,0.8)" fontSize={8} fontWeight="600"
            style={{ fontFamily: 'system-ui, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {m.label.split(' ')[0]}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Evolution SVG chart ──────────────────────────────────────────────────────
function EvolutionChart({ data }: { data: typeof EVOLUTION }) {
  const ref    = useRef<SVGSVGElement>(null);
  const inView = useInView(ref, { once: true });
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let p = 0;
    const iv = setInterval(() => {
      p = Math.min(p + 0.035, 1);
      setProgress(p);
      if (p >= 1) clearInterval(iv);
    }, 18);
    return () => clearInterval(iv);
  }, [inView]);

  const W = 520; const H = 140;
  const pad = { t: 16, r: 16, b: 32, l: 28 };
  const iW = W - pad.l - pad.r;
  const iH = H - pad.t - pad.b;
  const minV = 40; const maxV = 100;

  const pts = data.map((d, i) => ({
    x: pad.l + (i / (data.length - 1)) * iW,
    y: pad.t + iH - ((d.score - minV) / (maxV - minV)) * iH,
    d,
  }));

  // Smooth path using catmull-rom
  const pathD = pts.reduce((acc, p, i) => {
    if (i === 0) return `M ${p.x} ${p.y}`;
    const prev = pts[i - 1];
    const cpX = (prev.x + p.x) / 2;
    return `${acc} C ${cpX} ${prev.y} ${cpX} ${p.y} ${p.x} ${p.y}`;
  }, '');

  const areaD = `${pathD} L ${pts[pts.length - 1].x} ${pad.t + iH} L ${pts[0].x} ${pad.t + iH} Z`;

  // Clip the drawn portion based on progress
  const clipRight = pad.l + iW * progress;

  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </linearGradient>
        <clipPath id="chartClip">
          <rect x={pad.l} y={0} width={Math.max(0, clipRight - pad.l)} height={H} />
        </clipPath>
      </defs>
      {/* Grid lines */}
      {[50, 60, 70, 80, 90].map(v => {
        const y = pad.t + iH - ((v - minV) / (maxV - minV)) * iH;
        return (
          <g key={v}>
            <line x1={pad.l} y1={y} x2={pad.l + iW} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth={1} strokeDasharray="4 4" />
            <text x={pad.l - 6} y={y + 3} fill="rgba(148,163,184,0.5)" fontSize={8} textAnchor="end" fontFamily="system-ui">{v}</text>
          </g>
        );
      })}
      {/* Area fill */}
      <path d={areaD} fill="url(#chartGrad)" clipPath="url(#chartClip)" />
      {/* Line */}
      <path d={pathD} fill="none" stroke="#10b981" strokeWidth={2.5} strokeLinecap="round" clipPath="url(#chartClip)"
        style={{ filter: 'drop-shadow(0 0 4px rgba(16,185,129,0.5))' }} />
      {/* Month labels */}
      {pts.map(({ x, d }) => (
        <text key={d.month} x={x} y={H - 4} fill="rgba(100,116,139,0.8)" fontSize={9} textAnchor="middle" fontFamily="system-ui">{d.month}</text>
      ))}
      {/* Data points + tooltips */}
      {pts.map(({ x, y, d }, i) => {
        const visible = (i / (pts.length - 1)) <= progress;
        return visible ? (
          <g key={d.month}>
            <circle cx={x} cy={y} r={4} fill="#10b981" stroke="#0d1117" strokeWidth={2} />
            {i === pts.length - 1 && (
              <g>
                <rect x={x - 22} y={y - 22} width={44} height={16} rx={4} fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.3)" strokeWidth={1} />
                <text x={x} y={y - 10} fill="#10b981" fontSize={9} textAnchor="middle" fontFamily="system-ui" fontWeight="700">{d.score} pts</text>
              </g>
            )}
          </g>
        ) : null;
      })}
    </svg>
  );
}

// ─── Business profile card ────────────────────────────────────────────────────
function ProfileCard() {
  const INFO = [
    { Icon: Building2,      label: 'Categoría',     value: BUSINESS.category },
    { Icon: MapPin,         label: 'Zona',          value: BUSINESS.zone     },
    { Icon: Clock,          label: 'Horario',       value: BUSINESS.hours    },
    { Icon: Phone,          label: 'Teléfono',      value: BUSINESS.phone    },
    { Icon: Globe,          label: 'Web',           value: BUSINESS.web      },
    { Icon: Star,           label: 'Google',        value: BUSINESS.google   },
    { Icon: Instagram,      label: 'Instagram',     value: BUSINESS.instagram},
    { Icon: Wifi,           label: 'Estado',        value: BUSINESS.status,   special: 'status' },
  ];

  return (
    <div className="rounded-2xl border border-slate-700/40 overflow-hidden"
      style={{ background: 'linear-gradient(135deg,rgba(12,18,32,0.98) 0%,rgba(7,10,18,0.99) 100%)' }}>
      {/* Hero band */}
      <div className="px-6 py-5 border-b border-slate-800/50 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/25 flex items-center justify-center shrink-0">
            <Building2 size={24} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-white font-extrabold text-xl leading-tight">{BUSINESS.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 uppercase tracking-wide">
                {BUSINESS.category}
              </span>
              <span className="text-slate-600 text-xs">desde {BUSINESS.since}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-emerald-400">{BUSINESS.status}</span>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 divide-y divide-slate-800/40 sm:divide-y-0">
        {INFO.filter(i => !i.special).map(({ Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 px-5 py-3 border-b border-slate-800/30 last:border-b-0 sm:odd:border-r sm:odd:border-slate-800/30">
            <Icon size={13} className="text-slate-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-slate-600 font-medium">{label}</p>
              <p className="text-slate-300 text-xs font-medium truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Services */}
      <div className="px-5 py-4 border-t border-slate-800/40">
        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-2.5">Servicios</p>
        <div className="flex flex-wrap gap-2">
          {BUSINESS.services.map(s => (
            <span key={s} className="text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-700/50 bg-slate-800/40 text-slate-300">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AI Intelligence metrics ──────────────────────────────────────────────────
function MetricsPanel() {
  const avgScore = Math.round(METRICS.reduce((a, m) => a + m.value, 0) / METRICS.length);

  return (
    <div className="rounded-2xl border border-slate-700/40 overflow-hidden"
      style={{ background: 'linear-gradient(135deg,rgba(12,18,32,0.98) 0%,rgba(7,10,18,0.99) 100%)' }}>
      <div className="px-5 py-4 border-b border-slate-800/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={14} className="text-emerald-400" />
          <span className="text-xs font-bold text-slate-300">La IA conoce tu negocio</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-black tabular-nums ${avgScore >= 70 ? 'text-emerald-400' : 'text-amber-400'}`}>{avgScore}</span>
          <span className="text-[10px] text-slate-600">/100 medio</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Left: radar */}
        <div className="flex items-center justify-center p-6 border-b lg:border-b-0 lg:border-r border-slate-800/40">
          <RadarChart metrics={METRICS} />
        </div>

        {/* Right: bars */}
        <div className="px-5 py-5 space-y-4">
          {METRICS.map((m, i) => {
            const c = CLR[m.color] ?? CLR.emerald;
            const label = m.value >= 80 ? 'Excelente' : m.value >= 65 ? 'Bueno' : m.value >= 50 ? 'Mejorable' : 'Bajo';
            return (
              <div key={m.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-slate-400">{m.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${c.text}`}>{label}</span>
                    <span className="text-[11px] font-black text-white tabular-nums w-7 text-right">{m.value}</span>
                  </div>
                </div>
                <MetricBar value={m.value} barClass={c.bar} delay={i * 0.07} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── AI Personality ───────────────────────────────────────────────────────────
function PersonalityPanel() {
  return (
    <div className="rounded-2xl border border-slate-700/40 p-5"
      style={{ background: 'linear-gradient(135deg,rgba(12,18,32,0.98) 0%,rgba(7,10,18,0.99) 100%)' }}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={14} className="text-emerald-400" />
        <span className="text-xs font-bold text-slate-300">Perfil de personalidad del negocio</span>
        <span className="ml-auto text-[10px] font-semibold text-emerald-400/70 bg-emerald-500/8 border border-emerald-500/20 px-2 py-0.5 rounded-full">IA Generado</span>
      </div>
      <div className="space-y-3">
        {PERSONALITY.map(({ id, text, accent, Icon }) => {
          const c = CLR[accent] ?? CLR.emerald;
          return (
            <motion.div key={id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: Number(id.replace('p','')) * 0.08 }}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${c.border}`}
              style={{ background: c.soft }}
            >
              <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${c.bg} ${c.border}`}>
                <Icon size={12} className={c.text} />
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">{text}</p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Strengths ────────────────────────────────────────────────────────────────
function StrengthsPanel() {
  return (
    <div>
      <SectionLabel dot="bg-emerald-400">Lo estás haciendo muy bien</SectionLabel>
      <div className="space-y-2.5">
        {STRENGTHS.map((s, i) => (
          <motion.div key={s.id}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.38, delay: i * 0.08 }}
            className="flex items-start gap-3 rounded-xl border border-emerald-500/15 px-4 py-3.5"
            style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.05) 0%,rgba(7,10,18,0.99) 100%)' }}
          >
            <div className="w-6 h-6 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0 mt-0.5">
              <Check size={11} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-semibold">{s.title}</p>
              <p className="text-slate-500 text-xs mt-0.5 leading-relaxed">{s.desc}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─── Opportunities ────────────────────────────────────────────────────────────
function OpportunitiesPanel({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [applied, setApplied] = useState<Set<string>>(new Set());

  return (
    <div>
      <SectionLabel dot="bg-amber-400">Oportunidades de mejora</SectionLabel>
      <div className="space-y-3">
        {OPPORTUNITIES.map((o, i) => {
          const done = applied.has(o.id);
          const c = CLR[o.color] ?? CLR.emerald;
          return (
            <motion.div key={o.id}
              layout
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: done ? 0.45 : 1, y: 0 }}
              transition={{ duration: 0.38, delay: i * 0.07 }}
              className={`rounded-xl border p-4 ${done ? 'border-slate-800/40' : c.border}`}
              style={{ background: done ? 'rgba(7,10,18,0.8)' : `linear-gradient(135deg,${c.soft} 0%,rgba(7,10,18,0.99) 100%)` }}
            >
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${c.bg} ${c.border}`}>
                  {done
                    ? <Check size={13} className="text-emerald-400" />
                    : <AlertCircle size={13} className={c.text} />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-snug ${done ? 'line-through text-slate-500' : 'text-white'}`}>{o.title}</p>
                  <p className="text-slate-500 text-xs mt-1 leading-relaxed">{o.desc}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${IMPACT_CLR[o.impact]}`}>{o.impact}</span>
                    <span className="text-[10px] text-slate-600">· {o.time}</span>
                  </div>
                </div>
              </div>
              {!done && (
                <div className="mt-3 flex gap-2">
                  <motion.button
                    onClick={() => { setApplied(prev => new Set([...prev, o.id])); onNavigate(o.tab); }}
                    whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold
                      bg-gradient-to-r ${c.bar} text-slate-950 shadow-sm`}
                  >
                    <Zap size={11} fill="currentColor" />
                    Aplicar mejora
                  </motion.button>
                  <motion.button
                    onClick={() => onNavigate(o.tab)}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold
                      bg-slate-800/50 border border-slate-700/40 text-slate-400 hover:text-white transition-colors"
                  >
                    Ver herramienta <ChevronRight size={10} />
                  </motion.button>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Executive Summary ────────────────────────────────────────────────────────
function ExecutiveSummary({ onNavigate }: { onNavigate: (tab: string) => void }) {
  return (
    <div className="rounded-2xl border border-violet-500/20 overflow-hidden"
      style={{ background: 'linear-gradient(135deg,rgba(139,92,246,0.06) 0%,rgba(7,10,18,0.99) 100%)' }}>
      <div className="px-5 py-4 border-b border-violet-500/15 flex items-center gap-2">
        <Award size={14} className="text-violet-400" />
        <span className="text-xs font-bold text-slate-300">Resumen ejecutivo del consultor IA</span>
      </div>
      <div className="px-5 py-5">
        <p className="text-slate-300 text-sm leading-relaxed mb-5">
          Si únicamente realizaras estas <strong className="text-white">3 acciones este mes</strong>, podrías mejorar tu visibilidad local de forma significativa y superar a tus principales competidores en posicionamiento Maps.
        </p>
        <div className="space-y-3">
          {EXEC_ACTIONS.map(({ num, title, impact, color, tab }) => {
            const c = CLR[color] ?? CLR.emerald;
            return (
              <motion.div key={num}
                whileHover={{ x: 2 }}
                className="flex items-center gap-4 rounded-xl border border-slate-800/50 px-4 py-3.5 cursor-pointer group"
                style={{ background: 'rgba(12,18,32,0.8)' }}
                onClick={() => onNavigate(tab)}
              >
                <span className={`text-[11px] font-black ${c.text} shrink-0 w-6`}>{num}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-sm font-semibold truncate">{title}</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${c.bg} ${c.border} ${c.text} shrink-0`}>
                  {impact}
                </span>
                <ChevronRight size={13} className="text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Evolution timeline ───────────────────────────────────────────────────────
function EvolutionPanel() {
  const first = EVOLUTION[0].score;
  const last  = EVOLUTION[EVOLUTION.length - 1].score;
  const delta = last - first;

  return (
    <div className="rounded-2xl border border-slate-700/40 overflow-hidden"
      style={{ background: 'linear-gradient(135deg,rgba(12,18,32,0.98) 0%,rgba(7,10,18,0.99) 100%)' }}>
      <div className="px-5 py-4 border-b border-slate-800/40 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={13} className="text-emerald-400" />
          <span className="text-xs font-bold text-slate-300">Evolución del negocio</span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingUp size={11} className="text-emerald-400" />
          <span className="text-xs font-bold text-emerald-400">+{delta} pts</span>
          <span className="text-xs text-slate-600">en 7 meses</span>
        </div>
      </div>
      <div className="px-5 py-5">
        <EvolutionChart data={EVOLUTION} />
      </div>
      {/* Milestones */}
      <div className="px-5 pb-5 flex flex-wrap gap-3">
        {[
          { month: 'Mar', event: 'Primera optimización SEO', color: 'sky' },
          { month: 'May', event: 'Campaña de reseñas activa', color: 'amber' },
          { month: 'Jul', event: 'Perfil completamente optimizado', color: 'emerald' },
        ].map(({ month, event, color }) => {
          const c = CLR[color] ?? CLR.sky;
          return (
            <div key={month} className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border ${c.border} ${c.bg}`}>
              <div className={`w-1.5 h-1.5 rounded-full ${c.text.replace('text', 'bg')}`} />
              <span className={`font-bold ${c.text}`}>{month}</span>
              <span className="text-slate-400">{event}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main BusinessDigitalTwin ─────────────────────────────────────────────────
export interface BusinessDigitalTwinProps {
  onNavigate?: (tab: string) => void;
  userEmail?: string;
}

export default function BusinessDigitalTwin({ onNavigate, userEmail }: BusinessDigitalTwinProps) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLoaded(true), 200); return () => clearTimeout(t); }, []);

  const handleNavigate = (tab: string) => {
    if (onNavigate) onNavigate(tab);
  };

  return (
    <div className="max-w-[800px] mx-auto px-5 sm:px-8 py-8 pb-24 sm:pb-10 space-y-8">
      <motion.div initial="hidden" animate={loaded ? 'show' : 'hidden'} variants={STAG} className="space-y-8">

        {/* ── Header ── */}
        <motion.div variants={FU}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">Perfil activo</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Mi Negocio</h1>
              <p className="text-slate-400 text-sm mt-1">Representación inteligente de tu presencia local generada por IA.</p>
            </div>
            <div className="shrink-0 flex items-center gap-2 px-3.5 py-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <Brain size={13} className="text-emerald-400" />
              <span className="text-xs font-bold text-emerald-400 hidden sm:block">Digital Twin</span>
            </div>
          </div>
        </motion.div>

        {/* ── Business profile card ── */}
        <motion.div variants={FU}>
          <SectionLabel dot="bg-sky-400">Ficha de negocio</SectionLabel>
          <ProfileCard />
        </motion.div>

        {/* ── AI Metrics ── */}
        <motion.div variants={FU}>
          <SectionLabel dot="bg-emerald-400 animate-pulse">Inteligencia IA</SectionLabel>
          <MetricsPanel />
        </motion.div>

        {/* ── Personality ── */}
        <motion.div variants={FU}>
          <SectionLabel dot="bg-violet-400">Personalidad del negocio</SectionLabel>
          <PersonalityPanel />
        </motion.div>

        {/* ── Strengths ── */}
        <motion.div variants={FU}>
          <StrengthsPanel />
        </motion.div>

        {/* ── Opportunities ── */}
        <motion.div variants={FU}>
          <OpportunitiesPanel onNavigate={handleNavigate} />
        </motion.div>

        {/* ── Executive Summary ── */}
        <motion.div variants={FU}>
          <SectionLabel dot="bg-violet-400">Consultor IA</SectionLabel>
          <ExecutiveSummary onNavigate={handleNavigate} />
        </motion.div>

        {/* ── Evolution ── */}
        <motion.div variants={FU}>
          <SectionLabel dot="bg-teal-400">Evolución histórica</SectionLabel>
          <EvolutionPanel />
        </motion.div>

      </motion.div>
    </div>
  );
}
