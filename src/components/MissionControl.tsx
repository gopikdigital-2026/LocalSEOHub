import React, { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  LayoutDashboard, Building2, Target, Brain, Zap, Settings,
  FileText, History, ScanSearch, Radar, Mic, MapPinned, BarChart2,
  BrainCircuit, TrendingUp, CheckCircle2, Sparkles, AlertCircle,
  ChevronRight, Menu, X, Trophy, ArrowRight, Star, MapPin,
  Check, Lock, Shield,
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
      { tab: 'generator',  label: 'Generador SEO', Icon: FileText      },
      { tab: 'saved',      label: 'Guardados',     Icon: History       },
      { tab: 'ai-twin',    label: 'Digital Twin',  Icon: BrainCircuit  },
      { tab: 'geo-audit',  label: 'GEO Audit',     Icon: ScanSearch    },
    ],
  },
  competidores: {
    label: 'Competidores',
    tools: [
      { tab: 'radar', label: 'Radar de Competencia', Icon: Radar },
    ],
  },
  ia: {
    label: 'IA',
    tools: [
      { tab: 'ai-advisor', label: 'AI Advisor',        Icon: BarChart2 },
      { tab: 'voice-sim',  label: 'Voice Simulator',   Icon: Mic       },
    ],
  },
  automatizaciones: {
    label: 'Automatizaciones',
    tools: [
      { tab: 'maps-scanner', label: 'Maps Scanner', Icon: MapPinned },
    ],
  },
};

const NAV: { id: SectionId; label: string; Icon: React.ElementType; tab?: string; divider?: boolean }[] = [
  { id: 'home',             label: 'Dashboard',          Icon: LayoutDashboard },
  { id: 'negocio',          label: 'Mi Negocio',         Icon: Building2,  tab: 'generator' },
  { id: 'competidores',     label: 'Competidores',       Icon: Target,     tab: 'radar' },
  { id: 'ia',               label: 'IA',                 Icon: Brain,      tab: 'ai-advisor' },
  { id: 'automatizaciones', label: 'Automatizaciones',   Icon: Zap,        tab: 'maps-scanner' },
  { id: 'configuracion',    label: 'Configuración',      Icon: Settings,   tab: 'saved', divider: true },
];

const MOBILE_NAV = NAV.slice(0, 5);

const ACTIONS = [
  { id: 'reviews',  title: 'Responder 12 reseñas pendientes',   impact: '+8%',  time: '5 min',  diff: 'Fácil', section: 'automatizaciones', tab: 'maps-scanner', color: 'emerald' },
  { id: 'photos',   title: 'Añadir 8 fotos al perfil',          impact: '+6%',  time: '15 min', diff: 'Fácil', section: 'negocio',          tab: 'generator',    color: 'sky'     },
  { id: 'desc',     title: 'Optimizar descripción local',        impact: '+5%',  time: '20 min', diff: 'Medio', section: 'negocio',          tab: 'generator',    color: 'amber'   },
];

const IMPACT_CLR: Record<string, string> = {
  emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
  sky:     'text-sky-400     bg-sky-500/10     border-sky-500/25',
  amber:   'text-amber-400   bg-amber-500/10   border-amber-500/25',
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

function getSectionId(tab: string): SectionId {
  if (tab === 'radar') return 'competidores';
  if (tab === 'ai-advisor' || tab === 'voice-sim') return 'ia';
  if (tab === 'maps-scanner') return 'automatizaciones';
  if (tab === 'saved' || tab === 'generator' || tab === 'ai-twin' || tab === 'geo-audit') return 'negocio';
  return 'negocio';
}

// ─── Animation presets ────────────────────────────────────────────────────────
const FU   = { hidden: { opacity: 0, y: 18 },      show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16,1,0.3,1] as const } } };
const STAG = { show: { transition: { staggerChildren: 0.08 } } };

// ─── Confetti ─────────────────────────────────────────────────────────────────
const Confetti = memo(function Confetti({ active, onDone }: { active: boolean; onDone: () => void }) {
  const particles = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    id: i,
    x: 5 + Math.random() * 90,
    color: ['#10b981','#f59e0b','#3b82f6','#f43f5e','#8b5cf6','#14b8a6'][i % 6],
    delay: Math.random() * 0.5,
    duration: 0.9 + Math.random() * 0.7,
    size: 5 + Math.random() * 7,
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
          style={{ position: 'absolute', top: 0, width: size, height: size,
            borderRadius: id % 3 === 0 ? '50%' : '2px', backgroundColor: color }} />
      ))}
    </div>
  );
});

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const Skeleton = memo(function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-lg bg-slate-800/50 animate-pulse ${className}`} />
  );
});

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score, weekly = 5 }: { score: number; weekly?: number }) {
  const [anim, setAnim] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const R = 58; const C = 2 * Math.PI * R;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';

  useEffect(() => {
    if (!inView) return;
    let n = 0;
    const iv = setInterval(() => { n = Math.min(n + 1, score); setAnim(n); if (n >= score) clearInterval(iv); }, 14);
    return () => clearInterval(iv);
  }, [inView, score]);

  return (
    <div ref={ref} className="relative inline-flex items-center justify-center w-[140px] h-[140px]">
      <svg width={140} height={140} className="absolute inset-0 -rotate-90">
        <circle cx={70} cy={70} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={9} />
        <circle cx={70} cy={70} r={R} fill="none" stroke={color} strokeWidth={9}
          strokeDasharray={`${(anim / 100) * C} ${C}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color}55)`, transition: 'none' }} />
      </svg>
      <div className="flex flex-col items-center z-10">
        <span className="text-[2.2rem] font-black text-white tabular-nums leading-none">{anim}</span>
        <span className="text-slate-500 text-[10px]">/100</span>
        {weekly > 0 && (
          <span className="flex items-center gap-0.5 text-[10px] font-bold text-emerald-400 mt-1">
            <TrendingUp size={9} />+{weekly}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Mission Control Home ─────────────────────────────────────────────────────
function MCHome({
  score, userEmail, completedActions, onActionDone, onNavigate, isActive, onSubscribe,
}: {
  score: number;
  userEmail?: string;
  completedActions: Set<string>;
  onActionDone: (id: string, tab: string) => void;
  onNavigate: (section: SectionId, tab?: string) => void;
  isActive: boolean;
  onSubscribe: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const t = setTimeout(() => setLoaded(true), 900); return () => clearTimeout(t); }, []);

  const name = getName(userEmail);
  const greeting = getGreeting();
  const opCount = ACTIONS.filter(a => !completedActions.has(a.id)).length;
  const progressPct = Math.min(100, Math.round((score / 90) * 100));

  return (
    <div className="max-w-3xl mx-auto px-5 py-10 space-y-7">

      {/* ── Greeting ── */}
      <motion.div initial="hidden" animate={loaded ? 'show' : 'hidden'} variants={STAG} className="space-y-5">
        <motion.div variants={FU}
          className="rounded-2xl border border-slate-700/40 p-6"
          style={{ background: 'linear-gradient(135deg,rgba(14,22,38,0.98) 0%,rgba(8,14,26,1) 100%)' }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1.5">
              <p className="text-slate-400 text-sm">{greeting}{name ? ',' : ''}</p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {name && <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">{name} </span>}
                {!name && 'Bienvenido '}
                {opCount > 0 ? (
                  <span className="text-white">hemos encontrado{' '}
                    <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">
                      {opCount} {opCount === 1 ? 'oportunidad' : 'oportunidades'}
                    </span>
                    {' '}para crecer hoy.
                  </span>
                ) : (
                  <span className="text-white">¡todo al día! Sigue así.</span>
                )}
              </h1>
            </div>
            {opCount > 0 && (
              <motion.button onClick={() => onNavigate('automatizaciones', 'maps-scanner')}
                whileHover={{ scale: 1.03, y: -1 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm
                  bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
                  shadow-lg shadow-emerald-500/25 shrink-0">
                <Zap size={14} fill="currentColor" />
                Comenzar
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* ── Score + Progress ── */}
        <motion.div variants={FU}
          className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Score card */}
          <div className="rounded-2xl border border-slate-700/40 p-6 flex items-center gap-6"
            style={{ background: 'linear-gradient(135deg,rgba(14,22,38,0.98) 0%,rgba(8,14,26,1) 100%)' }}>
            {loaded ? (
              <ScoreRing score={score} weekly={5} />
            ) : (
              <Skeleton className="w-[140px] h-[140px] rounded-full" />
            )}
            <div className="flex-1 space-y-1.5">
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.18em] font-semibold">Visibilidad Local</p>
              <p className="text-white font-bold text-lg leading-tight">
                {score >= 80 ? 'Perfil bien optimizado' : score >= 60 ? 'Hay margen de mejora' : 'Necesita atención'}
              </p>
              <p className="text-slate-500 text-xs">Última semana: <span className="text-emerald-400 font-semibold">+5 puntos</span></p>
            </div>
          </div>

          {/* Progress card */}
          <div className="rounded-2xl border border-slate-700/40 p-6 flex flex-col justify-between"
            style={{ background: 'linear-gradient(135deg,rgba(14,22,38,0.98) 0%,rgba(8,14,26,1) 100%)' }}>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] text-slate-500 uppercase tracking-[0.18em] font-semibold">Objetivo</p>
                <span className="text-[11px] font-bold text-emerald-400">90 / 100</span>
              </div>
              <p className="text-white font-bold text-lg mb-4">Llegar a 90 puntos</p>
            </div>
            <div>
              <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden mb-2">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                  initial={{ width: 0 }} animate={{ width: loaded ? `${progressPct}%` : 0 }}
                  transition={{ duration: 1.2, ease: [0.16,1,0.3,1], delay: 0.3 }}
                  style={{ boxShadow: '0 0 10px rgba(16,185,129,0.4)' }} />
              </div>
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{score} pts actuales</span>
                <span className="text-slate-500">Faltan {Math.max(0, 90 - score)} pts</span>
              </div>
              {score >= 90 && (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Trophy size={13} />¡Objetivo alcanzado!
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── 3 Actions ── */}
        <motion.div variants={FU}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-base flex items-center gap-2">
              <Sparkles size={16} className="text-emerald-400" />
              Las 3 acciones más importantes
            </h2>
          </div>
          <div className="space-y-3">
            {ACTIONS.map((action) => {
              const done = completedActions.has(action.id);
              const ic = IMPACT_CLR[action.color] ?? IMPACT_CLR.emerald;
              return (
                <motion.div key={action.id} layout
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: done ? 0.45 : 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`rounded-xl border border-slate-700/40 p-4 flex items-center gap-4 ${done ? 'pointer-events-none' : ''}`}
                  style={{ background: 'linear-gradient(135deg,rgba(14,22,38,0.92) 0%,rgba(8,14,26,0.97) 100%)' }}>
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${ic}`}>
                    {done ? <Check size={16} /> : <CheckCircle2 size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${done ? 'line-through text-slate-500' : 'text-white'}`}>
                      {action.title}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${ic}`}>{action.impact}</span>
                      <span className="text-[10px] text-slate-500">{action.time}</span>
                      <span className={`text-[10px] ${action.diff === 'Fácil' ? 'text-emerald-400/70' : 'text-amber-400/70'}`}>{action.diff}</span>
                    </div>
                  </div>
                  {!done && (
                    <motion.button onClick={() => onActionDone(action.id, action.tab)}
                      whileHover={{ scale: 1.05, x: 2 }} whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-bold text-xs
                        bg-slate-800 hover:bg-slate-700 border border-slate-700/60 text-slate-300 hover:text-white
                        transition-colors shrink-0">
                      Hacer ahora
                      <ArrowRight size={11} />
                    </motion.button>
                  )}
                </motion.div>
              );
            })}
          </div>
        </motion.div>

        {/* ── AI Alert ── */}
        <motion.div variants={FU}>
          <div className="rounded-2xl border border-amber-500/25 p-5"
            style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.06) 0%,rgba(8,14,26,0.98) 100%)' }}>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0 mt-0.5">
                <AlertCircle size={18} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Alerta IA</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                </div>
                <p className="text-slate-200 text-sm leading-relaxed">
                  Tu principal competidor ha recibido <strong>17 nuevas reseñas esta semana</strong> y subió su puntuación a 4,9 estrellas.
                  Responder tus reseñas pendientes podría cerrar la brecha.
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <motion.button onClick={() => onNavigate('automatizaciones', 'maps-scanner')}
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold
                  bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/25 text-amber-300
                  transition-colors">
                Ver detalles <ChevronRight size={13} />
              </motion.button>
            </div>
          </div>
        </motion.div>

      </motion.div>

      {/* ── Subscription gate ── */}
      {!isActive && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}
          className="rounded-2xl border border-emerald-500/20 p-6 text-center"
          style={{ background: 'linear-gradient(160deg,rgba(16,185,129,0.07) 0%,rgba(8,14,26,0.99) 100%)' }}>
          <Lock size={20} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-white font-bold text-base mb-1">Activa el plan para ver el informe completo</p>
          <p className="text-slate-400 text-sm mb-4">7 días gratis · Cancela cuando quieras</p>
          <motion.button onClick={onSubscribe} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm
              bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/25">
            <Zap size={14} fill="currentColor" />Analizar mi negocio gratis
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
const Sidebar = memo(function Sidebar({
  activeSection, onNavigate, userEmail, isActive,
}: {
  activeSection: SectionId;
  onNavigate: (id: SectionId, tab?: string) => void;
  userEmail?: string;
  isActive: boolean;
}) {
  return (
    <nav className="hidden sm:flex flex-col w-56 shrink-0 border-r border-slate-800/50 min-h-screen"
      style={{ background: 'rgba(8,12,22,0.96)', backdropFilter: 'blur(20px)' }}>

      {/* Logo area */}
      <div className="px-5 py-5 border-b border-slate-800/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <Sparkles size={13} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-white font-bold text-sm leading-tight">AI Copilot</p>
            <p className="text-emerald-400/70 text-[10px]">Mission Control</p>
          </div>
        </div>
      </div>

      {/* Nav items */}
      <div className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ id, label, Icon, tab, divider }) => {
          const active = activeSection === id;
          return (
            <React.Fragment key={id}>
              {divider && <div className="my-2 border-t border-slate-800/40" />}
              <motion.button
                onClick={() => onNavigate(id, tab)}
                whileHover={{ x: 2 }} whileTap={{ scale: 0.97 }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150
                  ${active
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}>
                <Icon size={16} className={active ? 'text-emerald-400' : 'text-slate-500'} />
                {label}
                {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />}
              </motion.button>
            </React.Fragment>
          );
        })}
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-t border-slate-800/40">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-slate-700/60 border border-slate-600/40 flex items-center justify-center shrink-0 text-[11px] font-bold text-slate-300">
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
    <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-slate-800/60"
      style={{ background: 'rgba(7,10,18,0.97)', backdropFilter: 'blur(20px)' }}>
      <div className="flex items-center justify-around px-2 pb-safe">
        {MOBILE_NAV.map(({ id, label, Icon, tab }) => {
          const active = activeSection === id;
          return (
            <button key={id} onClick={() => onNavigate(id, tab)}
              className="flex flex-col items-center gap-1 py-3 px-3 min-w-0">
              <Icon size={20} className={active ? 'text-emerald-400' : 'text-slate-500'} />
              <span className={`text-[9px] font-semibold truncate ${active ? 'text-emerald-400' : 'text-slate-600'}`}>
                {label}
              </span>
              {active && <div className="absolute bottom-0.5 w-1 h-1 rounded-full bg-emerald-400" />}
            </button>
          );
        })}
      </div>
    </div>
  );
});

// ─── Sub-tool nav ─────────────────────────────────────────────────────────────
const SubToolNav = memo(function SubToolNav({
  sectionId, currentTab, onSetTab,
}: {
  sectionId: SectionId;
  currentTab: string;
  onSetTab: (tab: string) => void;
}) {
  const section = SECTIONS[sectionId];
  if (!section || section.tools.length <= 1) return null;
  return (
    <div className="flex gap-2 px-5 pt-6 pb-2 overflow-x-auto">
      {section.tools.map(({ tab, label, Icon }) => {
        const active = currentTab === tab;
        return (
          <motion.button key={tab} onClick={() => onSetTab(tab)} whileHover={{ y: -1 }} whileTap={{ scale: 0.97 }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              active
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/25'
                : 'bg-slate-800/50 text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700/40'
            }`}>
            <Icon size={13} />
            {label}
          </motion.button>
        );
      })}
    </div>
  );
});

// ─── Main MissionControl ──────────────────────────────────────────────────────
export default function MissionControl({
  tab, setTab, isActive, onSubscribe, userEmail, children,
}: MissionControlProps) {
  const [view, setView]                 = useState<MCView>('home');
  const [activeSection, setActiveSection] = useState<SectionId>('home');
  const [completedActions, setCompleted] = useState<Set<string>>(new Set());
  const [confetti, setConfetti]         = useState(false);

  // Sync section from tab when view is 'tool'
  useEffect(() => {
    if (view === 'tool') setActiveSection(getSectionId(tab));
  }, [tab, view]);

  const navigate = useCallback((id: SectionId, toolTab?: string) => {
    if (id === 'home') {
      setView('home');
      setActiveSection('home');
    } else {
      if (toolTab) {
        track('tool_open', { tool: toolTab });
        setTab(toolTab);
      }
      setView('tool');
      setActiveSection(id);
    }
  }, [setTab]);

  const handleActionDone = useCallback((id: string, toolTab: string) => {
    setCompleted(prev => new Set([...prev, id]));
    setConfetti(true);
    // Navigate to the tool after a brief delay
    setTimeout(() => {
      track('tool_open', { tool: toolTab });
      setTab(toolTab);
      setView('tool');
      setActiveSection(getSectionId(toolTab));
    }, 600);
  }, [setTab]);

  const handleSubToolSet = useCallback((t: string) => {
    track('tool_open', { tool: t });
    setTab(t);
  }, [setTab]);

  const score = useMemo(() => getScore(userEmail), [userEmail]);

  return (
    <div className="flex" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <Sidebar
        activeSection={activeSection}
        onNavigate={navigate}
        userEmail={userEmail}
        isActive={isActive}
      />

      <div className="flex-1 min-w-0 pb-16 sm:pb-0">
        <AnimatePresence mode="wait">
          {view === 'home' ? (
            <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.3 }}>
              <MCHome
                score={score}
                userEmail={userEmail}
                completedActions={completedActions}
                onActionDone={handleActionDone}
                onNavigate={navigate}
                isActive={isActive}
                onSubscribe={onSubscribe}
              />
            </motion.div>
          ) : (
            <motion.div key="tool" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.3 }}>
              <SubToolNav sectionId={activeSection} currentTab={tab} onSetTab={handleSubToolSet} />
              <div className="px-2 sm:px-0">
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
