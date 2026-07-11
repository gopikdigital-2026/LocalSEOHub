import React, { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  LayoutDashboard, Building2, Target, Brain, Zap, Settings,
  FileText, History, ScanSearch, Radar, Mic, MapPinned, BarChart2,
  BrainCircuit, TrendingUp, CheckCircle2, Sparkles, AlertCircle,
  ChevronRight, Trophy, ArrowRight, Check, Lock, Star,
  Clock, Activity, MessageSquare, Camera, PenLine, Search,
  Flame, RefreshCw, ChevronUp,
} from 'lucide-react';
import { track } from '../lib/analytics';

// ─── Types ────────────────────────────────────────────────────────────────────
type MCView = 'home' | 'tool';
type SectionId = 'home' | 'negocio' | 'competidores' | 'ia' | 'automatizaciones' | 'configuracion';

export interface MissionControlProps {
  tab: string;
  setTab: (tab: string) => void;
  isActive: boolean;
  onSubscribe: () => void;
  userEmail?: string;
  children: React.ReactNode;
}

// ─── Static data ──────────────────────────────────────────────────────────────
const SECTIONS: Record<string, { label: string; tools: { tab: string; label: string; Icon: React.ElementType }[] }> = {
  negocio: {
    label: 'Mi Negocio',
    tools: [
      { tab: 'generator',  label: 'Generador SEO', Icon: FileText     },
      { tab: 'saved',      label: 'Guardados',     Icon: History      },
      { tab: 'ai-twin',    label: 'Digital Twin',  Icon: BrainCircuit },
      { tab: 'geo-audit',  label: 'GEO Audit',     Icon: ScanSearch   },
    ],
  },
  competidores: {
    label: 'Competidores',
    tools: [{ tab: 'radar', label: 'Radar de Competencia', Icon: Radar }],
  },
  ia: {
    label: 'IA',
    tools: [
      { tab: 'ai-advisor', label: 'AI Advisor',      Icon: BarChart2 },
      { tab: 'voice-sim',  label: 'Voice Simulator', Icon: Mic       },
    ],
  },
  automatizaciones: {
    label: 'Automatizaciones',
    tools: [{ tab: 'maps-scanner', label: 'Maps Scanner', Icon: MapPinned }],
  },
};

const NAV: { id: SectionId; label: string; Icon: React.ElementType; tab?: string; divider?: boolean }[] = [
  { id: 'home',             label: 'Dashboard',        Icon: LayoutDashboard },
  { id: 'negocio',          label: 'Mi Negocio',       Icon: Building2,  tab: 'generator'    },
  { id: 'competidores',     label: 'Competidores',     Icon: Target,     tab: 'radar'        },
  { id: 'ia',               label: 'IA',               Icon: Brain,      tab: 'ai-advisor'   },
  { id: 'automatizaciones', label: 'Automatizaciones', Icon: Zap,        tab: 'maps-scanner' },
  { id: 'configuracion',    label: 'Configuración',    Icon: Settings,   tab: 'saved', divider: true },
];
const MOBILE_NAV = NAV.slice(0, 5);

// Daily mission
const MISSION = {
  id: 'mission-reviews',
  title: 'Responder las últimas 8 reseñas',
  desc: 'Tu perfil lleva 12 días sin responder reseñas. Google premia la actividad reciente.',
  impact: '+6% Visibilidad',
  time: '4 minutos',
  tab: 'maps-scanner',
  section: 'automatizaciones' as SectionId,
};

// Priority actions (max 3)
const PRIORITIES = [
  {
    id: 'photos',
    title: 'Añadir 8 fotos al perfil',
    desc: 'Los perfiles con más de 100 fotos reciben un 42% más de clics.',
    impact: '+6%',
    time: '15 min',
    tab: 'generator',
    section: 'negocio' as SectionId,
    Icon: Camera,
    color: 'sky',
  },
  {
    id: 'desc',
    title: 'Optimizar descripción local',
    desc: 'Incluir palabras clave de tu zona aumenta la visibilidad en Maps.',
    impact: '+5%',
    time: '20 min',
    tab: 'generator',
    section: 'negocio' as SectionId,
    Icon: PenLine,
    color: 'violet',
  },
  {
    id: 'keywords',
    title: 'Analizar palabras clave locales',
    desc: 'Detectamos 3 búsquedas de alta intención sin optimizar.',
    impact: '+4%',
    time: '10 min',
    tab: 'geo-audit',
    section: 'negocio' as SectionId,
    Icon: Search,
    color: 'amber',
  },
];

// AI activity timeline
const AI_ACTIVITY = [
  {
    id: 'a1',
    time: 'Hace 3 horas',
    text: 'La IA ha detectado que un competidor ha cambiado su categoría principal.',
    tab: 'radar',
    section: 'competidores' as SectionId,
    icon: AlertCircle,
    accent: 'amber',
  },
  {
    id: 'a2',
    time: 'Hace 1 hora',
    text: 'Se ha encontrado una nueva oportunidad de contenido para "restaurante cerca de mí".',
    tab: 'ai-advisor',
    section: 'ia' as SectionId,
    icon: Sparkles,
    accent: 'emerald',
  },
  {
    id: 'a3',
    time: 'Hace 20 minutos',
    text: 'Se detectaron 8 reseñas nuevas sin responder. Responder mejora tu posición.',
    tab: 'maps-scanner',
    section: 'automatizaciones' as SectionId,
    icon: MessageSquare,
    accent: 'sky',
  },
];

// AI insights
const AI_INSIGHTS = [
  {
    id: 'i1',
    text: 'Hemos detectado una caída del 7% en visibilidad esta semana.',
    tab: 'geo-audit',
    section: 'negocio' as SectionId,
    accent: 'red',
    Icon: TrendingUp,
  },
  {
    id: 'i2',
    text: 'Tu competidor principal ha conseguido 15 nuevas reseñas en 7 días.',
    tab: 'radar',
    section: 'competidores' as SectionId,
    accent: 'amber',
    Icon: Star,
  },
  {
    id: 'i3',
    text: 'Tu perfil lleva 12 días sin publicar contenido nuevo.',
    tab: 'generator',
    section: 'negocio' as SectionId,
    accent: 'violet',
    Icon: RefreshCw,
  },
];

const CLR_MAP: Record<string, { dot: string; bg: string; border: string; text: string; badge: string }> = {
  emerald: { dot: 'bg-emerald-400', bg: 'bg-emerald-500/8',  border: 'border-emerald-500/20', text: 'text-emerald-400', badge: 'bg-emerald-500/12 text-emerald-400 border-emerald-500/25' },
  sky:     { dot: 'bg-sky-400',     bg: 'bg-sky-500/8',      border: 'border-sky-500/20',     text: 'text-sky-400',     badge: 'bg-sky-500/12     text-sky-400     border-sky-500/25'     },
  amber:   { dot: 'bg-amber-400',   bg: 'bg-amber-500/8',    border: 'border-amber-500/20',   text: 'text-amber-400',   badge: 'bg-amber-500/12   text-amber-400   border-amber-500/25'   },
  violet:  { dot: 'bg-violet-400',  bg: 'bg-violet-500/8',   border: 'border-violet-500/20',  text: 'text-violet-400',  badge: 'bg-violet-500/12  text-violet-400  border-violet-500/25'  },
  red:     { dot: 'bg-red-400',     bg: 'bg-red-500/8',      border: 'border-red-500/20',     text: 'text-red-400',     badge: 'bg-red-500/12     text-red-400     border-red-500/25'     },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getScore(email?: string): number {
  if (!email) return 78;
  const h = Array.from(email).reduce((a, c) => a + c.charCodeAt(0), 0);
  return 68 + (h % 22);
}

function getName(email?: string): string {
  if (!email) return '';
  const local = (email.split('@')[0] ?? '').split(/[._]/)[0] ?? '';
  return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function getSectionId(t: string): SectionId {
  if (t === 'radar') return 'competidores';
  if (t === 'ai-advisor' || t === 'voice-sim') return 'ia';
  if (t === 'maps-scanner') return 'automatizaciones';
  return 'negocio';
}

// ─── Animation presets ────────────────────────────────────────────────────────
const FU   = { hidden: { opacity: 0, y: 16 },     show: { opacity: 1, y: 0,     transition: { duration: 0.48, ease: [0.16, 1, 0.3, 1] as const } } };
const STAG = { show: { transition: { staggerChildren: 0.07 } } };

// ─── Confetti ─────────────────────────────────────────────────────────────────
const Confetti = memo(function Confetti({ active, onDone }: { active: boolean; onDone: () => void }) {
  const particles = useMemo(() => Array.from({ length: 32 }, (_, i) => ({
    id: i,
    x: 5 + Math.random() * 90,
    color: ['#10b981','#f59e0b','#3b82f6','#f43f5e','#8b5cf6','#14b8a6','#f97316'][i % 7],
    delay: Math.random() * 0.45,
    duration: 0.9 + Math.random() * 0.8,
    size: 5 + Math.random() * 8,
    spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360),
  })), []);

  if (!active) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {particles.map(({ id, x, color, delay, duration, size, spin }) => (
        <motion.div key={id}
          initial={{ y: -20, x: `${x}vw`, opacity: 1, rotate: 0 }}
          animate={{ y: '105vh', opacity: [1, 1, 0], rotate: spin }}
          transition={{ duration, delay, ease: 'easeIn' }}
          onAnimationComplete={() => { if (id === 0) onDone(); }}
          style={{
            position: 'absolute', top: 0,
            width: size, height: size,
            borderRadius: id % 3 === 0 ? '50%' : '2px',
            backgroundColor: color,
          }}
        />
      ))}
    </div>
  );
});

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const [anim, setAnim] = useState(0);
  const ref  = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const R = 44; const C = 2 * Math.PI * R;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

  useEffect(() => {
    if (!inView) return;
    let n = 0;
    const iv = setInterval(() => { n = Math.min(n + 1, score); setAnim(n); if (n >= score) clearInterval(iv); }, 12);
    return () => clearInterval(iv);
  }, [inView, score]);

  return (
    <div ref={ref} className="relative inline-flex items-center justify-center w-[104px] h-[104px]">
      <svg width={104} height={104} className="absolute inset-0 -rotate-90">
        <circle cx={52} cy={52} r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={7} />
        <circle cx={52} cy={52} r={R} fill="none" stroke={color} strokeWidth={7}
          strokeDasharray={`${(anim / 100) * C} ${C}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 7px ${color}55)` }} />
      </svg>
      <div className="flex flex-col items-center z-10">
        <span className="text-[1.7rem] font-black text-white tabular-nums leading-none">{anim}</span>
        <span className="text-slate-500 text-[9px] font-medium">/100</span>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function ProgressBar({ pct, delay = 0 }: { pct: number; delay?: number }) {
  return (
    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1], delay }}
        style={{ boxShadow: '0 0 8px rgba(16,185,129,0.4)' }}
      />
    </div>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────────
function Card({ children, className = '', accent }: { children: React.ReactNode; className?: string; accent?: string }) {
  const border = accent ? CLR_MAP[accent]?.border ?? 'border-slate-700/40' : 'border-slate-700/40';
  const bg     = accent ? CLR_MAP[accent]?.bg     ?? '' : '';
  return (
    <div
      className={`rounded-2xl border ${border} ${className}`}
      style={{ background: `linear-gradient(135deg,${bg ? '' : ''}rgba(12,18,32,0.97) 0%,rgba(7,10,18,0.99) 100%)` }}
    >
      {children}
    </div>
  );
}

// ─── MCHome ───────────────────────────────────────────────────────────────────
function MCHome({
  score, userEmail, missionDone, prioritiesDone,
  onStartMission, onCompleteMission,
  onCompletePriority, onNavigate,
  isActive, onSubscribe,
}: {
  score: number;
  userEmail?: string;
  missionDone: boolean;
  prioritiesDone: Set<string>;
  onStartMission: () => void;
  onCompleteMission: () => void;
  onCompletePriority: (id: string, tab: string, section: SectionId) => void;
  onNavigate: (section: SectionId, tab?: string) => void;
  isActive: boolean;
  onSubscribe: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLoaded(true), 600); return () => clearTimeout(t); }, []);

  const name      = getName(userEmail);
  const greeting  = getGreeting();
  const completed = prioritiesDone.size + (missionDone ? 1 : 0);
  const total     = PRIORITIES.length + 1;
  const weeklyPct = Math.min(100, Math.round((completed / total) * 100));
  const goalPct   = Math.min(100, Math.round(((score - 60) / 30) * 100));

  return (
    <div className="max-w-[720px] mx-auto px-5 sm:px-8 py-8 sm:py-10 space-y-6 pb-24 sm:pb-10">
      <motion.div initial="hidden" animate={loaded ? 'show' : 'hidden'} variants={STAG} className="space-y-5">

        {/* ─── 1. Day Summary ─── */}
        <motion.div variants={FU}>
          <Card className="p-6 sm:p-7">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
              <div className="space-y-1.5">
                <p className="text-slate-400 text-sm font-medium">{greeting}{name ? `, ${name}` : ''} 👋</p>
                <h1 className="text-2xl sm:text-[1.7rem] font-extrabold text-white tracking-tight leading-tight">
                  Hoy hemos detectado{' '}
                  <span className="text-emerald-400">{total - completed}</span>
                  {' '}oportunidades para mejorar tu visibilidad.
                </h1>
                <p className="text-slate-500 text-sm pt-0.5">
                  La IA está monitorizando tu presencia en tiempo real.
                </p>
              </div>
              <motion.button
                onClick={onStartMission}
                whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.96 }}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-bold text-sm shrink-0
                  bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
                  shadow-lg shadow-emerald-500/25 self-start sm:self-auto"
              >
                <Flame size={15} fill="currentColor" />
                Comenzar misión
              </motion.button>
            </div>
          </Card>
        </motion.div>

        {/* ─── 2. Mission of the Day ─── */}
        <motion.div variants={FU}>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Misión del día</span>
          </div>
          <AnimatePresence mode="wait">
            {missionDone ? (
              <motion.div key="done"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-emerald-500/25 p-5 flex items-center gap-4"
                style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.07) 0%,rgba(7,10,18,0.99) 100%)' }}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-emerald-400 font-bold text-sm">¡Misión completada!</p>
                  <p className="text-slate-500 text-xs mt-0.5">Excelente trabajo. Vuelve mañana para la próxima misión.</p>
                </div>
              </motion.div>
            ) : (
              <motion.div key="active"
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              >
                <Card className="p-5 sm:p-6" accent="emerald">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquare size={17} className="text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-bold text-[15px] leading-snug">{MISSION.title}</h3>
                        <p className="text-slate-400 text-xs mt-1 leading-relaxed">{MISSION.desc}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full border
                            bg-emerald-500/10 text-emerald-400 border-emerald-500/25">
                            <TrendingUp size={9} />{MISSION.impact}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] text-slate-500">
                            <Clock size={9} />{MISSION.time}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5 flex gap-2.5">
                    <motion.button
                      onClick={() => { track('tool_open', { tool: MISSION.tab }); onNavigate(MISSION.section, MISSION.tab); }}
                      whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm
                        bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
                        shadow-md shadow-emerald-500/20"
                    >
                      Realizar ahora
                      <ArrowRight size={13} />
                    </motion.button>
                    <motion.button
                      onClick={onCompleteMission}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm
                        bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 text-slate-400 hover:text-emerald-400
                        transition-colors"
                    >
                      <Check size={13} />
                      Marcar hecho
                    </motion.button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ─── 3. High Priority (max 3) ─── */}
        <motion.div variants={FU}>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Prioridad alta</span>
          </div>
          <div className="space-y-3">
            {PRIORITIES.map((p) => {
              const done = prioritiesDone.has(p.id);
              const c = CLR_MAP[p.color] ?? CLR_MAP.emerald;
              return (
                <motion.div key={p.id} layout
                  animate={{ opacity: done ? 0.45 : 1 }}
                  className={`rounded-2xl border ${c.border} p-4 flex items-center gap-4 ${done ? 'pointer-events-none' : ''}`}
                  style={{ background: 'linear-gradient(135deg,rgba(12,18,32,0.97) 0%,rgba(7,10,18,0.99) 100%)' }}
                >
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${c.bg} ${c.border}`}>
                    {done
                      ? <Check size={15} className={c.text} />
                      : <p.Icon size={15} className={c.text} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-snug ${done ? 'line-through text-slate-500' : 'text-white'}`}>
                      {p.title}
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5 truncate">{p.desc}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${c.badge}`}>{p.impact} Visibilidad</span>
                      <span className="text-[10px] text-slate-600 flex items-center gap-0.5"><Clock size={8} />{p.time}</span>
                    </div>
                  </div>
                  {!done && (
                    <motion.button
                      onClick={() => onCompletePriority(p.id, p.tab, p.section)}
                      whileHover={{ scale: 1.04, x: 1 }} whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold text-xs shrink-0
                        bg-slate-800/70 hover:bg-slate-700/70 border border-slate-700/50 text-slate-300 hover:text-white
                        transition-colors"
                    >
                      Resolver
                      <ArrowRight size={10} />
                    </motion.button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* ─── Progress System ─── */}
        <motion.div variants={FU}>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Tu progreso</span>
          </div>
          <Card className="p-5 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {/* Score ring */}
              <div className="flex flex-col items-center gap-2 sm:border-r sm:border-slate-800/60 sm:pr-5">
                <ScoreRing score={score} />
                <div className="text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Visibilidad local</p>
                  <p className={`text-xs font-bold mt-0.5 ${score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                    {score >= 80 ? 'Bien optimizado' : score >= 60 ? 'Puede mejorar' : 'Necesita atención'}
                  </p>
                </div>
              </div>

              {/* Goal + weekly progress */}
              <div className="sm:col-span-2 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-400 font-medium">Objetivo semanal</span>
                    <span className="text-xs font-bold text-slate-300">80 / 100</span>
                  </div>
                  <ProgressBar pct={goalPct} delay={0.4} />
                  <p className="text-[10px] text-slate-600 mt-1">
                    {score < 80 ? `Faltan ${80 - score} puntos para el objetivo` : '¡Objetivo semanal alcanzado!'}
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-400 font-medium">Acciones completadas</span>
                    <span className="text-xs font-bold text-slate-300">{completed}/{total}</span>
                  </div>
                  <ProgressBar pct={weeklyPct} delay={0.55} />
                  <p className="text-[10px] text-slate-600 mt-1">Evolución esta semana</p>
                </div>

                <div className="pt-1 border-t border-slate-800/50 flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp size={12} className="text-emerald-400" />
                    <span className="text-xs text-emerald-400 font-bold">+5 pts</span>
                    <span className="text-xs text-slate-600">esta semana</span>
                  </div>
                  {score >= 80 && (
                    <div className="flex items-center gap-1.5">
                      <Trophy size={12} className="text-amber-400" />
                      <span className="text-xs text-amber-400 font-semibold">Nivel Pro</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </motion.div>

        {/* ─── 4. AI Activity Timeline ─── */}
        <motion.div variants={FU}>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">Actividad IA</span>
          </div>
          <Card className="p-5 divide-y divide-slate-800/50">
            {AI_ACTIVITY.map((item, i) => {
              const c = CLR_MAP[item.accent] ?? CLR_MAP.emerald;
              return (
                <div key={item.id} className={`flex items-start gap-4 ${i > 0 ? 'pt-4' : ''} ${i < AI_ACTIVITY.length - 1 ? 'pb-4' : ''}`}>
                  <div className="relative shrink-0 flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-xl border flex items-center justify-center ${c.bg} ${c.border}`}>
                      <item.icon size={14} className={c.text} />
                    </div>
                    {i < AI_ACTIVITY.length - 1 && (
                      <div className="w-px flex-1 bg-slate-800/60 mt-2 min-h-[12px]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-[10px] text-slate-600 mb-1 flex items-center gap-1">
                      <Activity size={8} />{item.time}
                    </p>
                    <p className="text-slate-300 text-sm leading-relaxed">{item.text}</p>
                    <motion.button
                      onClick={() => onNavigate(item.section, item.tab)}
                      whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}
                      className={`mt-2 flex items-center gap-1 text-xs font-semibold ${c.text} opacity-80 hover:opacity-100 transition-opacity`}
                    >
                      Ver solución <ChevronRight size={11} />
                    </motion.button>
                  </div>
                </div>
              );
            })}
          </Card>
        </motion.div>

        {/* ─── AI Insights ─── */}
        <motion.div variants={FU}>
          <div className="flex items-center gap-2 mb-3 px-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">AI Insights</span>
          </div>
          <div className="space-y-2.5">
            {AI_INSIGHTS.map((ins) => {
              const c = CLR_MAP[ins.accent] ?? CLR_MAP.emerald;
              return (
                <Card key={ins.id} className="p-4 flex items-center gap-4" accent={ins.accent}>
                  <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${c.bg} ${c.border}`}>
                    <ins.Icon size={14} className={c.text} />
                  </div>
                  <p className="text-slate-300 text-sm leading-relaxed flex-1">{ins.text}</p>
                  <motion.button
                    onClick={() => onNavigate(ins.section, ins.tab)}
                    whileHover={{ scale: 1.04, x: 1 }} whileTap={{ scale: 0.96 }}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold
                      border ${c.border} ${c.text} ${c.bg} hover:opacity-90 transition-opacity`}
                  >
                    Ver solución <ChevronRight size={11} />
                  </motion.button>
                </Card>
              );
            })}
          </div>
        </motion.div>

        {/* ─── Subscription gate ─── */}
        {!isActive && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 }}
            className="rounded-2xl border border-emerald-500/20 p-6 text-center"
            style={{ background: 'linear-gradient(160deg,rgba(16,185,129,0.07) 0%,rgba(8,14,26,0.99) 100%)' }}
          >
            <Lock size={18} className="text-emerald-400 mx-auto mb-3" />
            <p className="text-white font-bold text-base mb-1">Activa el plan para el análisis completo</p>
            <p className="text-slate-400 text-sm mb-4">7 días gratis · Sin tarjeta · Cancela cuando quieras</p>
            <motion.button onClick={onSubscribe} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm
                bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/25"
            >
              <Zap size={14} fill="currentColor" />Comenzar gratis
            </motion.button>
          </motion.div>
        )}

      </motion.div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const Sidebar = memo(function Sidebar({
  activeSection, onNavigate, userEmail, isActive, score,
}: {
  activeSection: SectionId;
  onNavigate: (id: SectionId, tab?: string) => void;
  userEmail?: string;
  isActive: boolean;
  score: number;
}) {
  const goalPct = Math.min(100, Math.round(((score - 60) / 30) * 100));

  return (
    <nav
      className="hidden sm:flex flex-col w-[220px] shrink-0 border-r border-slate-800/50"
      style={{ background: 'rgba(7,10,18,0.97)', backdropFilter: 'blur(20px)', minHeight: 'calc(100vh - 64px)', position: 'sticky', top: '64px', alignSelf: 'flex-start', height: 'calc(100vh - 64px)', overflowY: 'auto' }}
    >
      {/* Branding */}
      <div className="px-5 py-5 border-b border-slate-800/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center">
            <Sparkles size={14} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-none">AI Copilot</p>
            <p className="text-emerald-400/60 text-[10px] mt-0.5">Mission Control</p>
          </div>
        </div>
      </div>

      {/* Progress mini */}
      <div className="px-5 py-4 border-b border-slate-800/30">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Visibilidad</span>
          <span className={`text-[11px] font-bold ${score >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>{score}/100</span>
        </div>
        <ProgressBar pct={goalPct} />
      </div>

      {/* Nav items */}
      <div className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ id, label, Icon, tab, divider }) => {
          const active = activeSection === id;
          return (
            <React.Fragment key={id}>
              {divider && <div className="my-3 border-t border-slate-800/40" />}
              <motion.button
                onClick={() => onNavigate(id, tab)}
                whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                  ${active
                    ? 'bg-emerald-500/10 border border-emerald-500/18 text-emerald-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'}`}
              >
                <Icon size={15} className={active ? 'text-emerald-400' : 'text-slate-500'} />
                <span className="flex-1 text-left">{label}</span>
                {active && <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
              </motion.button>
            </React.Fragment>
          );
        })}
      </div>

      {/* User pill */}
      <div className="px-4 py-4 border-t border-slate-800/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700/50 flex items-center justify-center shrink-0 text-[11px] font-bold text-slate-300">
            {userEmail ? userEmail.charAt(0).toUpperCase() : 'U'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-slate-300 text-xs font-medium truncate">{userEmail ?? 'Usuario'}</p>
            <p className={`text-[10px] font-semibold ${isActive ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isActive ? '● Pro activo' : '● Prueba gratuita'}
            </p>
          </div>
        </div>
      </div>
    </nav>
  );
});

// ─── Mobile bottom nav ────────────────────────────────────────────────────────
const MobileNav = memo(function MobileNav({
  activeSection, onNavigate,
}: {
  activeSection: SectionId;
  onNavigate: (id: SectionId, tab?: string) => void;
}) {
  return (
    <div
      className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800/60"
      style={{ background: 'rgba(7,10,18,0.97)', backdropFilter: 'blur(20px)' }}
    >
      <div className="flex items-center justify-around px-1 pb-safe">
        {MOBILE_NAV.map(({ id, label, Icon, tab }) => {
          const active = activeSection === id;
          return (
            <button key={id} onClick={() => onNavigate(id, tab)}
              className="relative flex flex-col items-center gap-1 py-3 px-3 min-w-0"
            >
              {active && (
                <motion.div
                  layoutId="mobile-nav-indicator"
                  className="absolute inset-x-1 top-1 h-full rounded-xl bg-emerald-500/10"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <Icon size={19} className={`relative z-10 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className={`relative z-10 text-[9px] font-semibold truncate ${active ? 'text-emerald-400' : 'text-slate-600'}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

// ─── Sub-tool nav ─────────────────────────────────────────────────────────────
const SubToolNav = memo(function SubToolNav({
  sectionId, currentTab, onSetTab, onBack,
}: {
  sectionId: SectionId;
  currentTab: string;
  onSetTab: (tab: string) => void;
  onBack: () => void;
}) {
  const section = SECTIONS[sectionId];

  return (
    <div className="flex items-center gap-3 px-5 pt-6 pb-3 border-b border-slate-800/40">
      <motion.button
        onClick={onBack}
        whileHover={{ x: -2 }} whileTap={{ scale: 0.96 }}
        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors shrink-0"
      >
        <ChevronUp size={13} className="rotate-[-90deg]" />
        Dashboard
      </motion.button>
      {section && section.tools.length > 1 && (
        <>
          <div className="w-px h-4 bg-slate-800" />
          <div className="flex gap-1.5 overflow-x-auto">
            {section.tools.map(({ tab, label, Icon }) => {
              const active = currentTab === tab;
              return (
                <motion.button key={tab} onClick={() => onSetTab(tab)}
                  whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    active
                      ? 'bg-emerald-500/12 border border-emerald-500/25 text-emerald-400'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-slate-700/50'
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </motion.button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
});

// ─── Main export ──────────────────────────────────────────────────────────────
export default function MissionControl({
  tab, setTab, isActive, onSubscribe, userEmail, children,
}: MissionControlProps) {
  const [view,           setView]          = useState<MCView>('home');
  const [activeSection,  setActiveSection] = useState<SectionId>('home');
  const [missionDone,    setMissionDone]   = useState(false);
  const [prioritiesDone, setPrioritiesDone] = useState<Set<string>>(new Set());
  const [confetti,       setConfetti]      = useState(false);

  useEffect(() => {
    if (view === 'tool') setActiveSection(getSectionId(tab));
  }, [tab, view]);

  const score = useMemo(() => getScore(userEmail), [userEmail]);

  const navigate = useCallback((id: SectionId, toolTab?: string) => {
    if (id === 'home') {
      setView('home');
      setActiveSection('home');
    } else {
      if (toolTab) { track('tool_open', { tool: toolTab }); setTab(toolTab); }
      setView('tool');
      setActiveSection(id);
    }
  }, [setTab]);

  const handleStartMission = useCallback(() => {
    navigate(MISSION.section, MISSION.tab);
  }, [navigate]);

  const handleCompleteMission = useCallback(() => {
    setMissionDone(true);
    setConfetti(true);
  }, []);

  const handleCompletePriority = useCallback((id: string, toolTab: string, section: SectionId) => {
    setPrioritiesDone(prev => new Set([...prev, id]));
    setConfetti(true);
    setTimeout(() => { navigate(section, toolTab); }, 700);
  }, [navigate]);

  const handleSubToolSet = useCallback((t: string) => {
    track('tool_open', { tool: t });
    setTab(t);
  }, [setTab]);

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <Sidebar
        activeSection={activeSection}
        onNavigate={navigate}
        userEmail={userEmail}
        isActive={isActive}
        score={score}
      />

      <div className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div key="home"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}
            >
              <MCHome
                score={score}
                userEmail={userEmail}
                missionDone={missionDone}
                prioritiesDone={prioritiesDone}
                onStartMission={handleStartMission}
                onCompleteMission={handleCompleteMission}
                onCompletePriority={handleCompletePriority}
                onNavigate={navigate}
                isActive={isActive}
                onSubscribe={onSubscribe}
              />
            </motion.div>
          ) : (
            <motion.div key={`tool-${tab}`}
              initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -14 }} transition={{ duration: 0.28 }}
            >
              <SubToolNav
                sectionId={activeSection}
                currentTab={tab}
                onSetTab={handleSubToolSet}
                onBack={() => navigate('home')}
              />
              <div className="px-2 sm:px-0 pb-20 sm:pb-0">
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <MobileNav activeSection={activeSection} onNavigate={navigate} />

      <Confetti active={confetti} onDone={() => setConfetti(false)} />
    </div>
  );
}
