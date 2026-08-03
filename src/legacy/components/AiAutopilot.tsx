import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  Zap, MessageSquare, Camera, FileText, Search, Code2,
  TrendingUp, Clock, ChevronDown, ChevronUp, Check,
  CircleDot, CheckCircle2, AlertCircle, Sparkles,
  ArrowRight, RefreshCw, Tag, Star, Activity,
  Play, Loader2, BarChart2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type OppStatus = 'new' | 'urgent' | 'in_progress' | 'done';
type SectionId = 'home' | 'negocio' | 'competidores' | 'ia' | 'automatizaciones' | 'configuracion' | 'autopilot';

interface Opportunity {
  id: string;
  category: string;
  title: string;
  desc: string;
  impact: 'Alta' | 'Media' | 'Baja';
  time: string;
  diff: 'Auto' | 'Fácil' | 'Medio';
  btn: string;
  tab: string;
  section: SectionId;
  Icon: React.ElementType;
  color: string;
  status: OppStatus;
}

export interface AiAutopilotProps {
  onNavigate: (section: SectionId, tab?: string) => void;
  isActive: boolean;
  onSubscribe: () => void;
}

// ─── Static data ──────────────────────────────────────────────────────────────
const OPPORTUNITIES: Opportunity[] = [
  {
    id: 'pub-9days',
    category: 'Publicaciones',
    title: 'Llevas 9 días sin publicar en Google Business',
    desc: 'Los perfiles activos publican al menos una vez por semana. Tu última publicación fue hace 9 días. Google da preferencia a perfiles con actividad reciente en las búsquedas locales.',
    impact: 'Alta',
    time: '2 min',
    diff: 'Auto',
    btn: 'Generar publicación',
    tab: 'generator',
    section: 'negocio',
    Icon: FileText,
    color: 'amber',
    status: 'urgent',
  },
  {
    id: 'reviews-17',
    category: 'Reseñas',
    title: 'Hay 17 reseñas sin responder',
    desc: 'Responder reseñas mejora hasta un 12% tu posición en Google Maps. Tienes 17 reseñas nuevas esperando respuesta, 3 de ellas con puntuación baja que requieren atención.',
    impact: 'Alta',
    time: '4 min',
    diff: 'Auto',
    btn: 'Responder con IA',
    tab: 'maps-scanner',
    section: 'automatizaciones',
    Icon: MessageSquare,
    color: 'red',
    status: 'urgent',
  },
  {
    id: 'category',
    category: 'Perfil GBP',
    title: 'Tu categoría principal podría optimizarse',
    desc: 'Hemos analizado los 15 competidores mejor posicionados en tu zona. El 73% usa la categoría "Restaurante mediterráneo" que obtiene un 23% más de visitas que tu categoría actual.',
    impact: 'Media',
    time: '3 min',
    diff: 'Fácil',
    btn: 'Ver propuesta',
    tab: 'ai-advisor',
    section: 'ia',
    Icon: Tag,
    color: 'sky',
    status: 'new',
  },
  {
    id: 'desc-keywords',
    category: 'Descripción',
    title: 'Tu descripción tiene pocas palabras clave locales',
    desc: 'La descripción actual cubre solo el 34% de las búsquedas clave de tu zona. La IA ha preparado una versión optimizada que cubre el 80% de las búsquedas relevantes detectadas.',
    impact: 'Alta',
    time: '1 min',
    diff: 'Auto',
    btn: 'Optimizar automáticamente',
    tab: 'generator',
    section: 'negocio',
    Icon: FileText,
    color: 'violet',
    status: 'new',
  },
  {
    id: 'photos',
    category: 'Fotografías',
    title: 'Tus competidores han añadido 23 nuevas fotos',
    desc: 'En los últimos 7 días, tus principales competidores han subido fotografías de alta calidad. Los perfiles con más de 100 fotos reciben un 42% más de clics en Maps.',
    impact: 'Media',
    time: '5 min',
    diff: 'Fácil',
    btn: 'Generar imágenes con IA',
    tab: 'ai-twin',
    section: 'negocio',
    Icon: Camera,
    color: 'emerald',
    status: 'new',
  },
  {
    id: 'schema',
    category: 'Schema',
    title: 'Tu web no tiene Schema LocalBusiness',
    desc: 'Sin Schema markup, los motores de búsqueda no pueden leer tus datos estructurados. Añadirlo puede aumentar un 20% tu tasa de clics desde los resultados orgánicos.',
    impact: 'Media',
    time: '2 min',
    diff: 'Auto',
    btn: 'Generar Schema',
    tab: 'geo-audit',
    section: 'negocio',
    Icon: Code2,
    color: 'teal',
    status: 'new',
  },
];

const JOBS = [
  { id: 'j1', label: 'Analizando perfil de competidores',    pct: 67, color: 'sky',     eta: '2 min' },
  { id: 'j2', label: 'Monitorizando nuevas reseñas',         pct: 91, color: 'emerald',  eta: '30 s'  },
  { id: 'j3', label: 'Generando propuestas de contenido',    pct: 38, color: 'violet',   eta: '5 min' },
  { id: 'j4', label: 'Escaneando oportunidades de keywords', pct: 55, color: 'amber',    eta: '3 min' },
];

const RESULTS = [
  { id: 'r1', time: 'Hace 15 minutos', text: 'Se optimizó la descripción del negocio con 12 nuevas palabras clave locales.', gain: '+3% Visibilidad', color: 'emerald' },
  { id: 'r2', time: 'Hace 1 hora',     text: 'Se respondieron 12 reseñas con respuestas personalizadas para cada cliente.', gain: '+2% Reputación',  color: 'sky'     },
  { id: 'r3', time: 'Hace 3 horas',    text: 'Se generó y publicó una publicación sobre el menú del fin de semana.',         gain: '+1% Actividad',  color: 'violet'  },
  { id: 'r4', time: 'Ayer, 18:30',     text: 'Se actualizó el horario especial de verano en el perfil de Google.',            gain: 'Perfil al día',  color: 'amber'   },
];

// ─── Color map ────────────────────────────────────────────────────────────────
const CLR: Record<string, {
  dot: string; bg: string; border: string; text: string;
  badge: string; bar: string; softBg: string;
}> = {
  emerald: { dot: 'bg-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/25', text: 'text-emerald-400', badge: 'bg-emerald-500/12 border-emerald-500/25 text-emerald-400', bar: 'from-emerald-500 to-teal-400', softBg: 'rgba(16,185,129,0.05)' },
  amber:   { dot: 'bg-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/25',   text: 'text-amber-400',   badge: 'bg-amber-500/12 border-amber-500/25 text-amber-400',    bar: 'from-amber-500 to-orange-400', softBg: 'rgba(245,158,11,0.05)'   },
  red:     { dot: 'bg-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/25',     text: 'text-red-400',     badge: 'bg-red-500/12 border-red-500/25 text-red-400',           bar: 'from-red-500 to-rose-400',     softBg: 'rgba(239,68,68,0.05)'    },
  sky:     { dot: 'bg-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/25',     text: 'text-sky-400',     badge: 'bg-sky-500/12 border-sky-500/25 text-sky-400',           bar: 'from-sky-500 to-cyan-400',     softBg: 'rgba(14,165,233,0.05)'   },
  violet:  { dot: 'bg-violet-400',  bg: 'bg-violet-500/10',  border: 'border-violet-500/25',  text: 'text-violet-400',  badge: 'bg-violet-500/12 border-violet-500/25 text-violet-400',  bar: 'from-violet-500 to-purple-400',softBg: 'rgba(139,92,246,0.05)'   },
  teal:    { dot: 'bg-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/25',    text: 'text-teal-400',    badge: 'bg-teal-500/12 border-teal-500/25 text-teal-400',        bar: 'from-teal-500 to-cyan-400',    softBg: 'rgba(20,184,166,0.05)'   },
};

const IMPACT_CLR: Record<string, string> = {
  Alta:  'text-red-400 bg-red-500/10 border-red-500/25',
  Media: 'text-amber-400 bg-amber-500/10 border-amber-500/25',
  Baja:  'text-slate-400 bg-slate-500/10 border-slate-500/25',
};

const STATUS_ICON: Record<OppStatus, { Icon: React.ElementType; color: string; label: string }> = {
  new:         { Icon: CircleDot,    color: 'text-sky-400',     label: 'Nueva'        },
  urgent:      { Icon: AlertCircle,  color: 'text-red-400',     label: 'Urgente'      },
  in_progress: { Icon: Loader2,      color: 'text-amber-400',   label: 'En curso'     },
  done:        { Icon: CheckCircle2, color: 'text-emerald-400', label: 'Completada'   },
};

// ─── Animation presets ────────────────────────────────────────────────────────
const FU   = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.16,1,0.3,1] as const } } };
const STAG = { show: { transition: { staggerChildren: 0.06 } } };

// ─── Animated progress bar ────────────────────────────────────────────────────
const AnimBar = memo(function AnimBar({ pct, colorClass, delay = 0 }: { pct: number; colorClass: string; delay?: number }) {
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <div ref={ref} className="w-full h-1 rounded-full bg-slate-800/80 overflow-hidden">
      <motion.div
        className={`h-full rounded-full bg-gradient-to-r ${colorClass}`}
        initial={{ width: 0 }}
        animate={{ width: inView ? `${pct}%` : 0 }}
        transition={{ duration: 1.0, ease: [0.16,1,0.3,1], delay }}
        style={{ boxShadow: '0 0 6px rgba(255,255,255,0.12)' }}
      />
    </div>
  );
});

// ─── Opportunity card ─────────────────────────────────────────────────────────
const OppCard = memo(function OppCard({
  opp, applied, onApply, onNavigate,
}: {
  opp: Opportunity;
  applied: boolean;
  onApply: (id: string) => void;
  onNavigate: (section: SectionId, tab: string) => void;
}) {
  const [expanded, setExpanded] = useState(opp.status === 'urgent');
  const c = CLR[opp.color] ?? CLR.sky;
  const s = STATUS_ICON[applied ? 'done' : opp.status];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: applied ? 0.5 : 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
        applied ? 'border-slate-800/40' : c.border
      }`}
      style={{
        background: applied
          ? 'rgba(7,10,18,0.8)'
          : `linear-gradient(135deg, ${c.softBg} 0%, rgba(7,10,18,0.99) 100%)`,
      }}
    >
      {/* Card header — always visible */}
      <button
        onClick={() => !applied && setExpanded(v => !v)}
        className="w-full flex items-start gap-4 p-4 sm:p-5 text-left"
        disabled={applied}
      >
        {/* Color accent strip */}
        <div className={`w-1 self-stretch rounded-full shrink-0 ${applied ? 'bg-slate-700' : c.dot}`} />

        {/* Icon */}
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${
          applied ? 'bg-slate-800/50 border-slate-700/40' : `${c.bg} ${c.border}`
        }`}>
          {applied
            ? <Check size={15} className="text-emerald-400" />
            : <opp.Icon size={15} className={c.text} />
          }
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{opp.category}</span>
            <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${IMPACT_CLR[opp.impact]}`}>
              {opp.impact}
            </span>
            <span className={`flex items-center gap-1 text-[10px] font-semibold ${s.color}`}>
              <s.Icon size={9} className={opp.status === 'in_progress' ? 'animate-spin' : ''} />
              {applied ? 'Aplicado' : s.label}
            </span>
          </div>
          <h3 className={`text-sm font-semibold leading-snug ${applied ? 'line-through text-slate-500' : 'text-slate-100'}`}>
            {opp.title}
          </h3>
          {!expanded && !applied && (
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-[10px] text-slate-500"><Clock size={9} />{opp.time}</span>
              <span className={`text-[10px] font-medium ${opp.diff === 'Auto' ? 'text-emerald-400/80' : 'text-slate-500'}`}>
                {opp.diff === 'Auto' ? '⚡ Automático' : opp.diff}
              </span>
            </div>
          )}
        </div>

        {!applied && (
          <div className={`shrink-0 mt-1 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            <ChevronDown size={15} className="text-slate-600" />
          </div>
        )}
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && !applied && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16,1,0.3,1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-5 sm:px-6 pb-5 ml-5 sm:ml-6 border-t border-slate-800/40 pt-4">
              <p className="text-slate-400 text-sm leading-relaxed mb-4">{opp.desc}</p>

              {/* Meta row */}
              <div className="flex flex-wrap gap-3 mb-4">
                <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-800/50 border border-slate-700/40 px-3 py-1.5 rounded-xl">
                  <TrendingUp size={11} className="text-emerald-400" />
                  Impacto <strong className="text-white">{opp.impact}</strong>
                </span>
                <span className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-800/50 border border-slate-700/40 px-3 py-1.5 rounded-xl">
                  <Clock size={11} />
                  Tiempo estimado <strong className="text-white">{opp.time}</strong>
                </span>
                <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl border ${
                  opp.diff === 'Auto'
                    ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                    : 'bg-slate-800/50 border-slate-700/40 text-slate-400'
                }`}>
                  {opp.diff === 'Auto' ? <><Zap size={11} fill="currentColor" />Aplicable automáticamente</> : opp.diff}
                </span>
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2.5">
                <motion.button
                  onClick={() => onApply(opp.id)}
                  whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm
                    bg-gradient-to-r ${c.bar} text-slate-950
                    shadow-md`}
                  style={{ boxShadow: `0 4px 14px ${c.softBg}` }}
                >
                  <Zap size={13} fill="currentColor" />
                  {opp.btn}
                </motion.button>
                <motion.button
                  onClick={() => onNavigate(opp.section, opp.tab)}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm
                    bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-300 hover:text-white
                    transition-colors"
                >
                  Ver herramienta
                  <ArrowRight size={12} />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
});

// ─── Jobs in progress ─────────────────────────────────────────────────────────
const JobsPanel = memo(function JobsPanel() {
  const [jobs, setJobs] = useState(JOBS);

  // Simulate incremental progress
  useEffect(() => {
    const iv = setInterval(() => {
      setJobs(prev => prev.map(j => ({
        ...j,
        pct: j.pct >= 99 ? 99 : j.pct + Math.floor(Math.random() * 2),
      })));
    }, 2800);
    return () => clearInterval(iv);
  }, []);

  return (
    <div className="rounded-2xl border border-slate-700/40 overflow-hidden"
      style={{ background: 'linear-gradient(135deg,rgba(12,18,32,0.97) 0%,rgba(7,10,18,0.99) 100%)' }}>
      <div className="px-5 py-4 border-b border-slate-800/40 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-xs font-bold text-slate-300">Trabajos en curso</span>
        <span className="ml-auto text-[10px] text-slate-600">{jobs.length} activos</span>
      </div>
      <div className="px-5 py-4 space-y-4">
        {jobs.map((job, i) => {
          const c = CLR[job.color] ?? CLR.emerald;
          return (
            <div key={job.id}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Loader2 size={11} className={`${c.text} animate-spin`} />
                  <span className="text-xs text-slate-400">{job.label}</span>
                </div>
                <span className={`text-[10px] font-bold ${c.text}`}>{job.pct}%</span>
              </div>
              <AnimBar pct={job.pct} colorClass={c.bar} delay={i * 0.1} />
              <p className="text-[10px] text-slate-600 mt-1">ETA: {job.eta}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ─── Recent results ───────────────────────────────────────────────────────────
const ResultsPanel = memo(function ResultsPanel() {
  return (
    <div className="rounded-2xl border border-slate-700/40 overflow-hidden"
      style={{ background: 'linear-gradient(135deg,rgba(12,18,32,0.97) 0%,rgba(7,10,18,0.99) 100%)' }}>
      <div className="px-5 py-4 border-b border-slate-800/40 flex items-center gap-2">
        <Activity size={13} className="text-emerald-400" />
        <span className="text-xs font-bold text-slate-300">Últimas mejoras realizadas</span>
      </div>
      <div className="px-5 py-4">
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-slate-800" />
          <div className="space-y-5">
            {RESULTS.map((r) => {
              const c = CLR[r.color] ?? CLR.emerald;
              return (
                <div key={r.id} className="flex items-start gap-4">
                  <div className={`w-3.5 h-3.5 rounded-full border-2 border-slate-900 ${c.dot} shrink-0 mt-0.5 relative z-10`} />
                  <div className="flex-1 min-w-0 -mt-0.5">
                    <p className="text-[10px] text-slate-600 mb-0.5">{r.time}</p>
                    <p className="text-xs text-slate-300 leading-relaxed">{r.text}</p>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold mt-1.5 px-2 py-0.5 rounded-full border ${c.badge}`}>
                      <CheckCircle2 size={8} />{r.gain}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Stats strip ─────────────────────────────────────────────────────────────
function StatsStrip({ totalOpps, applied }: { totalOpps: number; applied: number }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {[
        { label: 'Oportunidades',  value: totalOpps,                         color: 'text-white'        },
        { label: 'Aplicadas hoy',  value: applied,                           color: 'text-emerald-400'  },
        { label: 'Pendientes',     value: totalOpps - applied,               color: 'text-amber-400'    },
      ].map(({ label, value, color }) => (
        <div key={label}
          className="rounded-xl border border-slate-700/40 p-3 text-center"
          style={{ background: 'rgba(12,18,32,0.8)' }}>
          <p className={`text-xl font-black ${color} tabular-nums`}>{value}</p>
          <p className="text-[10px] text-slate-500 mt-0.5 font-medium">{label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Main AiAutopilot ─────────────────────────────────────────────────────────
export default function AiAutopilot({ onNavigate, isActive, onSubscribe }: AiAutopilotProps) {
  const [applied, setApplied]   = useState<Set<string>>(new Set());
  const [filter,  setFilter]    = useState<'all' | 'urgent' | 'auto'>('all');
  const [loaded,  setLoaded]    = useState(false);

  useEffect(() => { const t = setTimeout(() => setLoaded(true), 300); return () => clearTimeout(t); }, []);

  const handleApply = useCallback((id: string) => {
    setApplied(prev => new Set([...prev, id]));
  }, []);

  const visible = OPPORTUNITIES.filter(o => {
    if (filter === 'urgent') return o.status === 'urgent';
    if (filter === 'auto')   return o.diff === 'Auto';
    return true;
  });

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-8 py-8 pb-24 sm:pb-10">
      <motion.div
        initial="hidden"
        animate={loaded ? 'show' : 'hidden'}
        variants={STAG}
        className="space-y-6"
      >

        {/* ─── Header ─── */}
        <motion.div variants={FU}>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest">En línea</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
                AI Autopilot
              </h1>
              <p className="text-slate-400 text-sm mt-1.5">
                Tu consultor IA detectando oportunidades y actuando en tiempo real.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <motion.button
                onClick={() => setFilter('all')}
                whileTap={{ scale: 0.96 }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                  filter === 'all'
                    ? 'bg-slate-700 border-slate-600 text-white'
                    : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                }`}
              >Todas</motion.button>
              <motion.button
                onClick={() => setFilter('urgent')}
                whileTap={{ scale: 0.96 }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                  filter === 'urgent'
                    ? 'bg-red-500/15 border-red-500/30 text-red-400'
                    : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                }`}
              >Urgentes</motion.button>
              <motion.button
                onClick={() => setFilter('auto')}
                whileTap={{ scale: 0.96 }}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                  filter === 'auto'
                    ? 'bg-emerald-500/12 border-emerald-500/25 text-emerald-400'
                    : 'border-slate-800 text-slate-500 hover:text-slate-300 hover:border-slate-700'
                }`}
              ><Zap size={11} />Automáticas</motion.button>
            </div>
          </div>
        </motion.div>

        {/* ─── Stats ─── */}
        <motion.div variants={FU}>
          <StatsStrip totalOpps={OPPORTUNITIES.length} applied={applied.size} />
        </motion.div>

        {/* ─── Main grid: opportunities + sidebar ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">

          {/* Left: opportunities */}
          <motion.div variants={FU} className="space-y-3">
            <div className="flex items-center gap-2 px-1 mb-1">
              <BarChart2 size={13} className="text-slate-500" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">
                Oportunidades detectadas — {visible.length} resultado{visible.length !== 1 ? 's' : ''}
              </span>
            </div>
            <AnimatePresence>
              {visible.map((opp) => (
                <OppCard
                  key={opp.id}
                  opp={opp}
                  applied={applied.has(opp.id)}
                  onApply={handleApply}
                  onNavigate={onNavigate}
                />
              ))}
            </AnimatePresence>
            {visible.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-2xl border border-slate-800/40 p-10 text-center"
                style={{ background: 'rgba(7,10,18,0.8)' }}
              >
                <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-3" />
                <p className="text-white font-bold">Todo al día</p>
                <p className="text-slate-500 text-sm mt-1">No hay oportunidades en este filtro.</p>
              </motion.div>
            )}
          </motion.div>

          {/* Right sidebar */}
          <motion.div variants={FU} className="space-y-4">
            <JobsPanel />
            <ResultsPanel />

            {!isActive && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
                className="rounded-2xl border border-emerald-500/20 p-5 text-center"
                style={{ background: 'linear-gradient(160deg,rgba(16,185,129,0.07) 0%,rgba(8,14,26,0.99) 100%)' }}
              >
                <Sparkles size={16} className="text-emerald-400 mx-auto mb-2.5" />
                <p className="text-white font-bold text-sm mb-1">Autopilot completo</p>
                <p className="text-slate-500 text-xs mb-3 leading-relaxed">Activa el plan para aplicar mejoras automáticamente sin intervención manual.</p>
                <motion.button onClick={onSubscribe} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm
                    bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/20"
                >
                  <Zap size={13} fill="currentColor" />Activar Autopilot
                </motion.button>
              </motion.div>
            )}
          </motion.div>
        </div>

      </motion.div>
    </div>
  );
}
