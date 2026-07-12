import React, { useState, useEffect, useMemo, memo, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  LayoutDashboard, Building2, Target, Brain, Zap, Settings,
  FileText, History, ScanSearch, Radar, Mic, MapPinned, BarChart2,
  BrainCircuit, TrendingUp, CheckCircle2, Sparkles, AlertCircle,
  ChevronRight, Trophy, ArrowRight, Check, Lock, Star,
  Clock, Activity, MessageSquare, Camera, PenLine, Search,
  Flame, RefreshCw, ChevronUp, Bot, ArrowUpRight,
} from 'lucide-react';
import { track } from '../lib/analytics';
import AiAutopilot from './AiAutopilot';
import { useI18n } from '../lib/i18n';

// ─── Types ────────────────────────────────────────────────────────────────────
type MCView = 'home' | 'autopilot' | 'tool';
type SectionId = 'home' | 'negocio' | 'competidores' | 'ia' | 'automatizaciones' | 'configuracion' | 'autopilot';

export interface MissionControlProps {
  tab: string;
  setTab: (tab: string) => void;
  isActive: boolean;
  onSubscribe: () => void;
  userEmail?: string;
  children: React.ReactNode;
}

// ─── Static data ──────────────────────────────────────────────────────────────
type TFn = (key: string) => string;

function getSections(t: TFn): Record<string, { label: string; tools: { tab: string; label: string; Icon: React.ElementType }[] }> {
  return {
    negocio: {
      label: t('mc_sec_negocio'),
      tools: [
        { tab: 'generator',  label: t('mc_tool_generator'), Icon: FileText     },
        { tab: 'saved',      label: t('mc_tool_saved'),     Icon: History      },
        { tab: 'ai-twin',    label: t('mc_tool_twin'),      Icon: BrainCircuit },
        { tab: 'geo-audit',  label: t('mc_tool_geo'),       Icon: ScanSearch   },
      ],
    },
    competidores: {
      label: t('mc_sec_competidores'),
      tools: [{ tab: 'radar', label: t('mc_tool_radar'), Icon: Radar }],
    },
    ia: {
      label: t('mc_sec_ia'),
      tools: [
        { tab: 'ai-advisor', label: t('mc_tool_advisor'),  Icon: BarChart2 },
        { tab: 'voice-sim',  label: t('mc_tool_voice'),    Icon: Mic       },
      ],
    },
    automatizaciones: {
      label: t('mc_sec_automatizaciones'),
      tools: [{ tab: 'maps-scanner', label: t('mc_tool_maps'), Icon: MapPinned }],
    },
  };
}

function getNav(t: TFn): { id: SectionId; label: string; Icon: React.ElementType; tab?: string; divider?: boolean; badge?: string }[] {
  return [
    { id: 'home',             label: t('mc_nav_dashboard'),        Icon: LayoutDashboard },
    { id: 'autopilot',        label: t('mc_nav_autopilot'),        Icon: Bot,            badge: t('mc_badge_new') },
    { id: 'negocio',          label: t('mc_nav_negocio'),          Icon: Building2,  tab: 'generator'    },
    { id: 'competidores',     label: t('mc_nav_competidores'),     Icon: Target,     tab: 'radar'        },
    { id: 'ia',               label: t('mc_nav_ia'),               Icon: Brain,      tab: 'ai-advisor'   },
    { id: 'automatizaciones', label: t('mc_nav_automatizaciones'), Icon: Zap,        tab: 'maps-scanner' },
    { id: 'configuracion',    label: t('mc_nav_configuracion'),    Icon: Settings,   tab: 'saved', divider: true },
  ];
}

function getMission(t: TFn) {
  return {
    id: 'mission-reviews',
    title: t('mc_mission_title'),
    desc: t('mc_mission_desc'),
    impact: t('mc_mission_impact'),
    time: t('mc_mission_time'),
    tab: 'maps-scanner',
    section: 'automatizaciones' as SectionId,
  };
}

function getTodayMissions(t: TFn) {
  return [
    {
      id: 'tm1',
      title: t('mc_mission_title'),
      impact: 5,
      time: t('mc_mission_time'),
      tab: 'maps-scanner',
      section: 'automatizaciones' as SectionId,
      Icon: MessageSquare,
      color: 'emerald',
    },
    {
      id: 'tm2',
      title: t('mc_pri1_title'),
      impact: 4,
      time: '15 min',
      tab: 'generator',
      section: 'negocio' as SectionId,
      Icon: Camera,
      color: 'sky',
    },
    {
      id: 'tm3',
      title: t('mc_pri2_title'),
      impact: 3,
      time: '20 min',
      tab: 'generator',
      section: 'negocio' as SectionId,
      Icon: PenLine,
      color: 'violet',
    },
  ];
}

function getAiActivity(t: TFn) {
  return [
    {
      id: 'a1',
      time: t('mc_act1_time'),
      text: t('mc_act1_text'),
      tab: 'radar',
      section: 'competidores' as SectionId,
      icon: AlertCircle,
      accent: 'amber',
    },
    {
      id: 'a2',
      time: t('mc_act2_time'),
      text: t('mc_act2_text'),
      tab: 'ai-advisor',
      section: 'ia' as SectionId,
      icon: Sparkles,
      accent: 'emerald',
    },
    {
      id: 'a3',
      time: t('mc_act3_time'),
      text: t('mc_act3_text'),
      tab: 'maps-scanner',
      section: 'automatizaciones' as SectionId,
      icon: MessageSquare,
      accent: 'sky',
    },
  ];
}

function getAiInsights(t: TFn) {
  return [
    {
      id: 'i1',
      text: t('mc_ins1_text'),
      tab: 'geo-audit',
      section: 'negocio' as SectionId,
      accent: 'red',
      Icon: TrendingUp,
    },
    {
      id: 'i2',
      text: t('mc_ins2_text'),
      tab: 'radar',
      section: 'competidores' as SectionId,
      accent: 'amber',
      Icon: Star,
    },
    {
      id: 'i3',
      text: t('mc_ins3_text'),
      tab: 'generator',
      section: 'negocio' as SectionId,
      accent: 'violet',
      Icon: RefreshCw,
    },
  ];
}

function getSetupChecklist(t: TFn) {
  return [
    { id: 'ch1', label: t('mc_setup_1'), done: true  },
    { id: 'ch2', label: t('mc_setup_2'), done: false },
    { id: 'ch3', label: t('mc_setup_3'), done: true  },
    { id: 'ch4', label: t('mc_setup_4'), done: true  },
    { id: 'ch5', label: t('mc_setup_5'), done: false },
  ];
}

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

function getGreeting(t: TFn): string {
  const h = new Date().getHours();
  if (h < 12) return t('mc_greeting_morning');
  if (h < 19) return t('mc_greeting_afternoon');
  return t('mc_greeting_evening');
}

function getScoreLevel(score: number, t: TFn): { label: string; next: number; color: string } {
  if (score >= 90) return { label: t('mc_score_level_pro'),      next: 100, color: 'text-emerald-400' };
  if (score >= 80) return { label: t('mc_score_level_advanced'), next: 90,  color: 'text-teal-400'    };
  if (score >= 65) return { label: t('mc_score_level_growing'),  next: 80,  color: 'text-sky-400'     };
  return                  { label: t('mc_score_level_beginner'), next: 65,  color: 'text-amber-400'   };
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

// ─── Setup checklist ──────────────────────────────────────────────────────────
function SetupChecklist() {
  const { t } = useI18n();
  const SETUP_CHECKLIST = getSetupChecklist(t);
  const done  = SETUP_CHECKLIST.filter(i => i.done).length;
  const total = SETUP_CHECKLIST.length;
  const pct   = Math.round((done / total) * 100);
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-2xl border border-slate-700/40 overflow-hidden"
      style={{ background: 'linear-gradient(135deg,rgba(12,18,32,0.97) 0%,rgba(7,10,18,0.99) 100%)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full px-5 py-4 flex items-center gap-3"
      >
        <div className="flex-1 text-left">
          <p className="text-xs font-bold text-slate-300">{t('mc_setup_header')}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{done}/{total} {t('mc_setup_done')} · {pct}%</p>
        </div>
        <div className="w-20 h-1 rounded-full bg-slate-800 overflow-hidden shrink-0">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: [0.16,1,0.3,1] }}
          />
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight size={14} className="text-slate-600 rotate-90" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16,1,0.3,1] }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-5 pb-4 pt-1 space-y-2 border-t border-slate-800/40">
              {SETUP_CHECKLIST.map(item => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                    item.done
                      ? 'bg-emerald-500/15 border-emerald-500/30'
                      : 'bg-slate-800/60 border-slate-700/40'
                  }`}>
                    {item.done && <Check size={10} className="text-emerald-400" />}
                  </div>
                  <span className={`text-xs font-medium ${item.done ? 'text-slate-400 line-through' : 'text-slate-300'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Large animated score number ─────────────────────────────────────────────
function LargeScoreNumber({ score }: { score: number }) {
  const [anim, setAnim] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    let n = 0;
    const iv = setInterval(() => { n = Math.min(n + 1, score); setAnim(n); if (n >= score) clearInterval(iv); }, 14);
    return () => clearInterval(iv);
  }, [inView, score]);
  return (
    <div ref={ref}>
      <span className="text-[3.5rem] sm:text-[4rem] font-black text-white tabular-nums leading-none">{anim}</span>
    </div>
  );
}

// ─── MCHome — AI Command Center ───────────────────────────────────────────────
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
  const { t } = useI18n();
  const TODAY_MISSIONS = getTodayMissions(t);
  const AI_ACTIVITY = getAiActivity(t);
  const [loaded, setLoaded] = useState(false);
  const [doneMissions, setDoneMissions] = useState<Set<string>>(new Set(prioritiesDone));
  useEffect(() => { const timer = setTimeout(() => setLoaded(true), 400); return () => clearTimeout(timer); }, []);

  const name     = getName(userEmail);
  const greeting = getGreeting(t);
  const level    = getScoreLevel(score, t);
  const nextPct  = Math.min(100, Math.round(((score - (level.next - 15)) / 15) * 100));

  const insights = [
    t('mc_home_insight_visibility'),
    t('mc_home_insight_rivals'),
    t('mc_home_insight_opps'),
  ];
  const [insightIdx, setInsightIdx] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setInsightIdx(i => (i + 1) % insights.length), 4000);
    return () => clearInterval(iv);
  }, [insights.length]);

  const activeMissions = TODAY_MISSIONS.filter(m => !doneMissions.has(m.id));

  const handleCompleteMission = (id: string) => {
    setDoneMissions(prev => new Set([...prev, id]));
    onCompleteMission();
  };

  return (
    <div className="max-w-[680px] mx-auto px-4 sm:px-8 py-8 space-y-5 pb-24 sm:pb-12">
      <motion.div initial="hidden" animate={loaded ? 'show' : 'hidden'} variants={STAG} className="space-y-5">

        {/* ══════════════════════════════════ 1. HERO */}
        <motion.div variants={FU}>
          <div className="space-y-1 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-slate-300 text-[15px] font-semibold">
                {greeting}{name ? `, ${name}` : ''} 👋
              </p>
            </div>
            <div className="overflow-hidden h-6">
              <AnimatePresence mode="wait">
                <motion.p key={insightIdx}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35, ease: [0.16,1,0.3,1] }}
                  className="text-slate-500 text-sm"
                >
                  {insights[insightIdx]}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>

          {/* Last analysis indicator */}
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] text-slate-600 font-medium">
              {t('mc_home_last_analysis')}: <span className="text-emerald-400/70">{t('mc_home_last_analysis_val')}</span>
            </span>
          </div>
        </motion.div>

        {/* ══════════════════════════════════ 2. LOCAL GROWTH SCORE™ */}
        <motion.div variants={FU}>
          <div
            className="rounded-2xl border border-slate-700/50 overflow-hidden"
            style={{ background: 'linear-gradient(145deg,rgba(11,17,29,0.98) 0%,rgba(7,10,18,1) 100%)' }}
          >
            <div className="h-[1px] bg-gradient-to-r from-emerald-500/60 via-teal-400/40 to-transparent" />
            <div className="p-6 sm:p-7">

              {/* Label row */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center">
                    <TrendingUp size={13} className="text-emerald-400" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.14em]">{t('mc_score_label')}</span>
                </div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                  level.color === 'text-emerald-400' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
                  : level.color === 'text-teal-400'  ? 'bg-teal-500/10 border-teal-500/25 text-teal-400'
                  : level.color === 'text-sky-400'   ? 'bg-sky-500/10 border-sky-500/25 text-sky-400'
                  :                                    'bg-amber-500/10 border-amber-500/25 text-amber-400'
                }`}>{level.label}</span>
              </div>

              {/* Score + evolution */}
              <div className="flex items-end gap-4 mb-5">
                <div className="flex items-baseline gap-1.5">
                  <LargeScoreNumber score={score} />
                  <span className="text-slate-600 text-lg font-medium">/100</span>
                </div>
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp size={13} className="text-emerald-400" />
                  <span className="text-emerald-400 text-sm font-bold">{t('mc_score_week')}</span>
                </div>
              </div>

              {/* Progress to next level */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-500 font-medium">{score}</span>
                  <span className="text-slate-600">{t('mc_score_next_target')} {level.next}</span>
                </div>
                <ProgressBar pct={nextPct} delay={0.3} />
                <p className="text-[10px] text-slate-600">
                  {level.next - score > 0
                    ? `${level.next - score} ${t('mc_score_next_points')}`
                    : t('mc_progress_pro_level')}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ══════════════════════════════════ 3. TODAY'S MISSIONS */}
        <motion.div variants={FU}>
          {/* Section header */}
          <div className="flex items-center justify-between mb-3 px-0.5">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">{t('mc_today_mission_label')}</span>
            </div>
            <span className="text-[10px] text-slate-600">{t('mc_today_mission_sub')}</span>
          </div>

          <div
            className="rounded-2xl border border-slate-700/50 overflow-hidden divide-y divide-slate-800/60"
            style={{ background: 'linear-gradient(145deg,rgba(11,17,29,0.98) 0%,rgba(7,10,18,1) 100%)' }}
          >
            {activeMissions.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="p-6 flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center shrink-0">
                  <CheckCircle2 size={18} className="text-emerald-400" />
                </div>
                <div>
                  <p className="text-emerald-400 font-bold text-sm">{t('mc_mission_done_title')}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{t('mc_mission_done_sub')}</p>
                </div>
              </motion.div>
            ) : (
              <AnimatePresence>
                {activeMissions.map((mission, i) => {
                  const c = CLR_MAP[mission.color] ?? CLR_MAP.emerald;
                  const stars = Array.from({ length: 5 });
                  return (
                    <motion.div key={mission.id}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                      transition={{ duration: 0.35, ease: [0.16,1,0.3,1] }}
                    >
                      <div className="p-5 sm:p-6">
                        <div className="flex items-start gap-4">
                          {/* Number badge */}
                          <div className="w-7 h-7 rounded-lg bg-slate-800/70 border border-slate-700/50 flex items-center justify-center shrink-0 text-[11px] font-black text-slate-500 mt-0.5">
                            {i + 1}
                          </div>

                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-bold text-[14px] leading-snug mb-2">{mission.title}</h3>

                            {/* Impact + time row */}
                            <div className="flex flex-wrap items-center gap-4 text-[11px]">
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-600 font-medium">{t('mc_mission_impact_label')}</span>
                                <div className="flex gap-0.5">
                                  {stars.map((_, si) => (
                                    <Star key={si} size={10}
                                      className={si < mission.impact ? 'text-amber-400 fill-amber-400' : 'text-slate-700 fill-slate-700'} />
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-slate-600 font-medium">{t('mc_mission_time_label2')}</span>
                                <span className="text-slate-400 font-semibold flex items-center gap-0.5">
                                  <Clock size={9} />{mission.time}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Resolve button */}
                          <motion.button
                            onClick={() => { track('tool_open', { tool: mission.tab }); onNavigate(mission.section, mission.tab); handleCompleteMission(mission.id); }}
                            whileHover={{ scale: 1.04, y: -1 }} whileTap={{ scale: 0.96 }}
                            className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-xl font-bold text-xs
                              ${i === 0
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                                : `border ${c.border} ${c.text} ${c.bg}`
                              }`}
                          >
                            {t('mc_resolve')}
                            <ArrowRight size={10} />
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </motion.div>

        {/* ══════════════════════════════════ 4. AI ACTIVITY FEED */}
        <motion.div variants={FU}>
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">{t('mc_activity_label')}</span>
          </div>

          <div
            className="rounded-2xl border border-slate-700/50 overflow-hidden"
            style={{ background: 'linear-gradient(145deg,rgba(11,17,29,0.98) 0%,rgba(7,10,18,1) 100%)' }}
          >
            {AI_ACTIVITY.map((item, i) => {
              const c = CLR_MAP[item.accent] ?? CLR_MAP.emerald;
              return (
                <div key={item.id}
                  className={`flex items-start gap-4 px-5 py-4 ${i < AI_ACTIVITY.length - 1 ? 'border-b border-slate-800/50' : ''}`}
                >
                  {/* Timeline dot + icon */}
                  <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
                    <div className={`w-7 h-7 rounded-lg border flex items-center justify-center ${c.bg} ${c.border}`}>
                      <item.icon size={13} className={c.text} />
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 size={10} className="text-emerald-400 shrink-0" />
                      <p className="text-[10px] text-slate-600 font-medium">{item.time}</p>
                    </div>
                    <p className="text-slate-300 text-sm leading-relaxed">{item.text}</p>
                  </div>

                  <motion.button
                    onClick={() => onNavigate(item.section, item.tab)}
                    whileHover={{ scale: 1.08, x: 1 }} whileTap={{ scale: 0.95 }}
                    className="shrink-0 mt-1 w-7 h-7 rounded-lg border border-slate-700/50 bg-slate-800/60 flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <ArrowUpRight size={12} />
                  </motion.button>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* ══════════════════════════════════ 5. NEXT GOAL */}
        <motion.div variants={FU}>
          <div className="flex items-center gap-2 mb-3 px-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.14em]">{t('mc_next_goal_label')}</span>
          </div>

          <div
            className="rounded-2xl border border-sky-500/15 overflow-hidden"
            style={{ background: 'linear-gradient(145deg,rgba(14,24,42,0.98) 0%,rgba(7,10,18,1) 100%)' }}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
                  <Trophy size={16} className="text-sky-400" />
                </div>
                <div>
                  <p className="text-white font-bold text-[15px]">
                    {t('mc_score_next_target')} {level.next} {t('mc_score_label').replace('™','').trim()}
                  </p>
                  <p className="text-sky-400/70 text-xs mt-0.5">
                    {t('mc_next_goal_missing')} {level.next - score} {t('mc_next_goal_points')}
                  </p>
                </div>
              </div>

              <ProgressBar pct={nextPct} delay={0.2} />

              <div className="flex items-center justify-between mt-2.5">
                <span className="text-[11px] text-slate-600">{score}</span>
                <span className="text-[11px] text-slate-500 font-medium">{level.next}</span>
              </div>

              <p className="text-slate-500 text-xs mt-4 leading-relaxed">{t('mc_next_goal_desc')}</p>
            </div>
          </div>
        </motion.div>

        {/* ══════════════════════════════════ SUBSCRIPTION GATE */}
        {!isActive && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.0 }}
            className="rounded-2xl border border-emerald-500/20 p-6 text-center"
            style={{ background: 'linear-gradient(160deg,rgba(16,185,129,0.07) 0%,rgba(8,14,26,0.99) 100%)' }}
          >
            <Lock size={18} className="text-emerald-400 mx-auto mb-3" />
            <p className="text-white font-bold text-base mb-1">{t('mc_sub_gate_title')}</p>
            <p className="text-slate-400 text-sm mb-4">{t('mc_sub_gate_sub')}</p>
            <motion.button onClick={onSubscribe} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm
                bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/25"
            >
              <Zap size={14} fill="currentColor" />{t('mc_sub_gate_cta')}
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
  const { t } = useI18n();
  const NAV = getNav(t);
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
          <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{t('mc_visibility_label')}</span>
          <span className={`text-[11px] font-bold ${score >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>{score}/100</span>
        </div>
        <ProgressBar pct={goalPct} />
      </div>

      {/* Nav items */}
      <div className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ id, label, Icon, tab, divider, badge }) => {
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
                {badge && !active && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 uppercase tracking-wide">
                    {badge}
                  </span>
                )}
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
            <p className="text-slate-300 text-xs font-medium truncate">{userEmail ?? t('mc_user_label')}</p>
            <p className={`text-[10px] font-semibold ${isActive ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isActive ? `● ${t('mc_pro_active')}` : `● ${t('mc_trial_active')}`}
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
  const { t } = useI18n();
  const NAV = getNav(t);
  const MOBILE_NAV = NAV.slice(0, 5);
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
  const { t } = useI18n();
  const SECTIONS = getSections(t);
  const section = SECTIONS[sectionId];

  return (
    <div className="flex items-center gap-3 px-5 pt-6 pb-3 border-b border-slate-800/40">
      <motion.button
        onClick={onBack}
        whileHover={{ x: -2 }} whileTap={{ scale: 0.96 }}
        className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-xs font-medium transition-colors shrink-0"
      >
        <ChevronUp size={13} className="rotate-[-90deg]" />
        {t('mc_nav_dashboard')}
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
    } else if (id === 'autopilot') {
      setView('autopilot');
      setActiveSection('autopilot');
    } else {
      if (toolTab) { track('tool_open', { tool: toolTab }); setTab(toolTab); }
      setView('tool');
      setActiveSection(id);
    }
  }, [setTab]);

  const handleStartMission = useCallback(() => {
    navigate('automatizaciones', 'maps-scanner');
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
          ) : view === 'autopilot' ? (
            <motion.div key="autopilot"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}
            >
              <AiAutopilot
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
