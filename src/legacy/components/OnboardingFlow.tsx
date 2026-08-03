import React, { useState, useEffect, useCallback, memo, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import {
  MapPin, Users, Star, Search, FileText, Tag, BookOpen,
  Check, Sparkles, TrendingUp, Target, Zap, ArrowRight,
  ChevronRight, Trophy, Flame,
} from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { track } from '../lib/analytics';

// ─── Types ────────────────────────────────────────────────────────────────────
type Step = 1 | 2 | 3 | 4 | 5;

export interface OnboardingFlowProps {
  userEmail?: string;
  onComplete: () => void;
}

// ─── Static data ──────────────────────────────────────────────────────────────
type TFn = (key: string) => string;

function getChecklistItems(t: TFn) {
  return [
    { id: 'gbp',        label: t('onb_chk_gbp'),          Icon: MapPin,   ms: 400  },
    { id: 'competitors',label: t('onb_chk_competitors'),  Icon: Users,    ms: 950  },
    { id: 'reviews',    label: t('onb_chk_reviews'),      Icon: Star,     ms: 1500 },
    { id: 'seo',        label: t('onb_chk_seo'),          Icon: Search,   ms: 2050 },
    { id: 'content',    label: t('onb_chk_content'),      Icon: FileText, ms: 2600 },
    { id: 'categories', label: t('onb_chk_categories'),   Icon: Tag,      ms: 3150 },
    { id: 'posts',      label: t('onb_chk_posts'),        Icon: BookOpen, ms: 3700 },
  ];
}

const ANALYSIS_DURATION = 4600; // total ms before auto-advance

// Deterministic results based on email hash
function getResults(email?: string): { score: number; competitor: string; gain: number; opp: string } {
  const h = Array.from(email ?? 'user').reduce((a, c) => a + c.charCodeAt(0), 0);
  const score = 68 + (h % 18);
  const competitors = ['Restaurante El Olivo', 'Café Central', 'La Taberna Real', 'Bodega Sur', 'El Rincón Verde'];
  return {
    score,
    competitor: competitors[h % competitors.length],
    gain: 18 + (h % 12),
    opp: 'Responder reseñas pendientes',
  };
}

// ─── Animation presets ────────────────────────────────────────────────────────
const PAGE_IN  = { hidden: { opacity: 0, y: 20 },   show: { opacity: 1, y: 0,   transition: { duration: 0.5, ease: [0.16,1,0.3,1] as const } } };
const PAGE_OUT = { exit:   { opacity: 0, y: -16,    transition: { duration: 0.3 } } };
const STAG     = { show: { transition: { staggerChildren: 0.09 } } };
const FU       = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.16,1,0.3,1] as const } } };

// ─── Animated score ring ─────────────────────────────────────────────────────
function ScoreRing({ target, size = 140 }: { target: number; size?: number }) {
  const [val, setVal] = useState(0);
  const ref    = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const R = size / 2 - 10;
  const C = 2 * Math.PI * R;
  const color = target >= 80 ? '#10b981' : target >= 60 ? '#f59e0b' : '#ef4444';

  useEffect(() => {
    if (!inView) return;
    let n = 0;
    const iv = setInterval(() => { n = Math.min(n + 1, target); setVal(n); if (n >= target) clearInterval(iv); }, 14);
    return () => clearInterval(iv);
  }, [inView, target]);

  return (
    <div ref={ref} className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size/2} cy={size/2} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={8} />
        <circle cx={size/2} cy={size/2} r={R} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={`${(val / 100) * C} ${C}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 10px ${color}55)` }} />
      </svg>
      <div className="flex flex-col items-center z-10">
        <span className="text-[2.4rem] font-black text-white tabular-nums leading-none">{val}</span>
        <span className="text-slate-500 text-xs font-medium">/100</span>
      </div>
    </div>
  );
}

// ─── Confetti ─────────────────────────────────────────────────────────────────
const Confetti = memo(function Confetti({ active }: { active: boolean }) {
  const particles = React.useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    id: i,
    x: 3 + Math.random() * 94,
    color: ['#10b981','#f59e0b','#3b82f6','#f43f5e','#8b5cf6','#14b8a6','#f97316','#06b6d4'][i % 8],
    delay: Math.random() * 0.5,
    duration: 1.0 + Math.random() * 0.8,
    size: 5 + Math.random() * 8,
    spin: (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360),
  })), []);

  if (!active) return null;
  return (
    <div className="fixed inset-0 pointer-events-none z-[200] overflow-hidden">
      {particles.map(({ id, x, color, delay, duration, size, spin }) => (
        <motion.div key={id}
          initial={{ y: -20, x: `${x}vw`, opacity: 1, rotate: 0 }}
          animate={{ y: '105vh', opacity: [1, 1, 0], rotate: spin }}
          transition={{ duration, delay, ease: 'easeIn' }}
          style={{ position: 'absolute', top: 0, width: size, height: size,
            borderRadius: id % 3 === 0 ? '50%' : '2px', backgroundColor: color }}
        />
      ))}
    </div>
  );
});

// ─── Step dots ────────────────────────────────────────────────────────────────
function StepDots({ current, total }: { current: Step; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => i + 1).map(n => (
        <motion.div key={n} layout
          className={`rounded-full transition-all duration-300 ${
            n === current ? 'w-5 h-1.5 bg-emerald-400' :
            n < current  ? 'w-1.5 h-1.5 bg-emerald-400/40' :
                           'w-1.5 h-1.5 bg-slate-700'
          }`}
        />
      ))}
    </div>
  );
}

// ─── Wrap every step ──────────────────────────────────────────────────────────
function StepWrap({ children, stepKey }: { children: React.ReactNode; stepKey: string }) {
  return (
    <motion.div
      key={stepKey}
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="w-full"
    >
      {children}
    </motion.div>
  );
}

// ─── Step 1: Welcome ─────────────────────────────────────────────────────────
function Step1Welcome({ onNext, userEmail }: { onNext: () => void; userEmail?: string }) {
  const { t } = useI18n();
  const name = (() => {
    if (!userEmail) return '';
    const local = (userEmail.split('@')[0] ?? '').split(/[._]/)[0] ?? '';
    return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
  })();

  return (
    <StepWrap stepKey="s1">
      <motion.div initial="hidden" animate="show" variants={STAG} className="text-center space-y-6">
        <motion.div variants={FU}>
          <motion.div
            animate={{ scale: [1, 1.08, 1], rotate: [0, -4, 4, 0] }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 3 }}
            className="inline-flex w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600
              items-center justify-center shadow-2xl shadow-emerald-500/30 mb-2"
          >
            <Sparkles size={34} className="text-white" fill="currentColor" />
          </motion.div>
        </motion.div>

        <motion.div variants={FU} className="space-y-3">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight">
            {name ? <>{t('onb_welcome_hello')}, <span className="text-emerald-400">{name}</span> 👋</> : `${t('onb_welcome_generic')} 👋`}
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed max-w-sm mx-auto">
            {t('onb_welcome_sub')}
          </p>
        </motion.div>

        <motion.div variants={FU} className="space-y-3">
          <div className="inline-flex items-center gap-6 text-sm text-slate-500 border border-slate-800 rounded-2xl px-6 py-3"
            style={{ background: 'rgba(12,18,32,0.8)' }}>
            {([[t('onb_welcome_stat1_val'), t('onb_welcome_stat1_lbl')], [t('onb_welcome_stat2_val'), t('onb_welcome_stat2_lbl')], [t('onb_welcome_stat3_val'), t('onb_welcome_stat3_lbl')]] as [string,string][]).map(([val, lbl]) => (
              <div key={lbl} className="text-center">
                <p className="text-white font-bold text-base leading-none">{val}</p>
                <p className="text-slate-600 text-[10px] mt-0.5">{lbl}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={FU}>
          <motion.button
            onClick={onNext}
            whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-2xl font-bold text-base
              bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
              shadow-xl shadow-emerald-500/30"
          >
            <Flame size={17} fill="currentColor" />
            {t('onb_welcome_cta')}
            <ArrowRight size={16} />
          </motion.button>
        </motion.div>
      </motion.div>
    </StepWrap>
  );
}

// ─── Step 2: Animated checklist ───────────────────────────────────────────────
function Step2Analysis({ onNext }: { onNext: () => void }) {
  const { t } = useI18n();
  const CHECKLIST_ITEMS = getChecklistItems(t);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [barPct,  setBarPct]  = useState(0);
  const done = checked.size === CHECKLIST_ITEMS.length;

  useEffect(() => {
    const timers = CHECKLIST_ITEMS.map(item =>
      setTimeout(() => setChecked(prev => new Set([...prev, item.id])), item.ms)
    );
    // progress bar
    const start = Date.now();
    const iv = setInterval(() => {
      const elapsed = Date.now() - start;
      setBarPct(Math.min(100, Math.round((elapsed / ANALYSIS_DURATION) * 100)));
      if (elapsed >= ANALYSIS_DURATION) clearInterval(iv);
    }, 40);
    const autoAdv = setTimeout(onNext, ANALYSIS_DURATION + 500);
    return () => { timers.forEach(clearTimeout); clearInterval(iv); clearTimeout(autoAdv); };
  }, [onNext]);

  return (
    <StepWrap stepKey="s2">
      <div className="space-y-7">
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-3">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
              className="w-5 h-5 rounded-full border-2 border-emerald-400 border-t-transparent"
            />
            <span className="text-emerald-400 text-sm font-bold uppercase tracking-widest">{t('onb_scan_label')}</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white">{t('onb_scan_title')}</h2>
          <p className="text-slate-500 text-sm">{t('onb_scan_sub')}</p>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
            style={{ width: `${barPct}%`, boxShadow: '0 0 10px rgba(16,185,129,0.5)' }}
            transition={{ duration: 0.08 }}
          />
        </div>

        {/* Checklist */}
        <div className="space-y-2.5">
          {CHECKLIST_ITEMS.map((item) => {
            const isChecked = checked.has(item.id);
            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.35, ease: [0.16,1,0.3,1] }}
                className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all duration-300 ${
                  isChecked
                    ? 'border-emerald-500/25 bg-emerald-500/5'
                    : 'border-slate-800/60 bg-slate-900/40'
                }`}
              >
                  <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 transition-all duration-300 ${
                    isChecked
                      ? 'bg-emerald-500/15 border-emerald-500/30'
                      : 'bg-slate-800/60 border-slate-700/40'
                  }`}>
                    {isChecked
                      ? <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 18 }}>
                          <Check size={14} className="text-emerald-400" />
                        </motion.div>
                      : <item.Icon size={14} className="text-slate-600" />
                    }
                  </div>
                  <span className={`text-sm font-medium transition-colors duration-300 ${isChecked ? 'text-slate-200' : 'text-slate-500'}`}>
                    {item.label}
                  </span>
                  {isChecked && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="ml-auto text-[10px] font-bold text-emerald-400 uppercase tracking-wide"
                    >
                      ✓
                    </motion.span>
                  )}
                </motion.div>
            );
          })}
        </div>

        {done && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center">
            <p className="text-emerald-400 text-sm font-bold">{t('onb_scan_done')}</p>
          </motion.div>
        )}
      </div>
    </StepWrap>
  );
}

// ─── Step 3: Executive Summary ────────────────────────────────────────────────
function Step3Summary({ onNext, userEmail }: { onNext: () => void; userEmail?: string }) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const r = getResults(userEmail);

  useEffect(() => { const timer = setTimeout(() => setLoaded(true), 100); return () => clearTimeout(timer); }, []);

  return (
    <StepWrap stepKey="s3">
      <motion.div initial="hidden" animate={loaded ? 'show' : 'hidden'} variants={STAG} className="space-y-6">

        <motion.div variants={FU} className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Check size={14} className="text-emerald-400" />
            <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest">{t('onb_summary_done_label')}</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white">{t('onb_summary_title')}</h2>
          <p className="text-slate-400 text-sm">{t('onb_summary_sub')}</p>
        </motion.div>

        {/* Score hero */}
        <motion.div variants={FU}
          className="rounded-2xl border border-slate-700/50 p-6 flex flex-col items-center gap-4"
          style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.06) 0%,rgba(7,10,18,0.99) 100%)' }}
        >
          <ScoreRing target={r.score} size={130} />
          <div className="text-center">
            <p className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold mb-1">{t('onb_score_current')}</p>
            <p className={`text-sm font-bold ${r.score >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {r.score >= 80 ? t('onb_score_good') : r.score >= 65 ? t('onb_score_medium') : t('onb_score_low')}
            </p>
          </div>
        </motion.div>

        {/* 3 metric cards */}
        <motion.div variants={FU} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { Icon: Target,     label: t('onb_metric_opp'),        value: r.opp,        sub: t('onb_metric_opp_sub'),   color: 'emerald' },
            { Icon: Users,      label: t('onb_metric_competitor'), value: r.competitor, sub: t('onb_metric_comp_sub'),  color: 'amber'   },
            { Icon: TrendingUp, label: t('onb_metric_potential'),  value: `+${r.gain}%`, sub: t('onb_metric_pot_sub'), color: 'sky'     },
          ].map(({ Icon, label, value, sub, color }) => (
            <div key={label}
              className={`rounded-xl border p-4 ${
                color === 'emerald' ? 'border-emerald-500/20 bg-emerald-500/5' :
                color === 'amber'   ? 'border-amber-500/20 bg-amber-500/5' :
                                     'border-sky-500/20 bg-sky-500/5'
              }`}
            >
              <Icon size={15} className={`mb-2 ${
                color === 'emerald' ? 'text-emerald-400' :
                color === 'amber'   ? 'text-amber-400' : 'text-sky-400'
              }`} />
              <p className="text-[10px] text-slate-500 uppercase tracking-wide font-semibold mb-1">{label}</p>
              <p className="text-white font-bold text-sm leading-snug">{value}</p>
              <p className="text-slate-600 text-[10px] mt-0.5">{sub}</p>
            </div>
          ))}
        </motion.div>

        <motion.div variants={FU}>
          <motion.button
            onClick={onNext}
            whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl font-bold text-base
              bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
              shadow-xl shadow-emerald-500/25"
          >
            <Zap size={16} fill="currentColor" />
            {t('onb_summary_cta')}
            <ArrowRight size={15} />
          </motion.button>
        </motion.div>
      </motion.div>
    </StepWrap>
  );
}

// ─── Step 4: First Mission ────────────────────────────────────────────────────
function Step4Mission({ onAccept, onSkip, userEmail }: { onAccept: () => void; onSkip: () => void; userEmail?: string }) {
  const { t } = useI18n();
  const [loaded, setLoaded] = useState(false);
  const r = getResults(userEmail);

  useEffect(() => { const timer = setTimeout(() => setLoaded(true), 200); return () => clearTimeout(timer); }, []);

  return (
    <StepWrap stepKey="s4">
      <motion.div initial="hidden" animate={loaded ? 'show' : 'hidden'} variants={STAG} className="space-y-6">

        <motion.div variants={FU} className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-1">
            <Sparkles size={13} className="text-emerald-400" />
            <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest">{t('onb_mission_ai_label')}</span>
          </div>
          <h2 className="text-2xl font-extrabold text-white">{t('onb_mission_title')}</h2>
          <p className="text-slate-400 text-sm">{t('onb_mission_sub')}</p>
        </motion.div>

        {/* Mission card */}
        <motion.div variants={FU}
          className="rounded-2xl border border-emerald-500/25 p-6"
          style={{ background: 'linear-gradient(135deg,rgba(16,185,129,0.07) 0%,rgba(7,10,18,0.99) 100%)' }}
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
              <Star size={20} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-widest mb-1">{t('onb_mission_badge')}</p>
              <h3 className="text-white font-bold text-lg leading-snug">{r.opp}</h3>
              <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                {t('onb_mission_desc')}
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-3 gap-3">
            {[
              { label: t('onb_mission_time_label'),       value: t('onb_mission_time_val'),   Icon: Zap },
              { label: t('onb_mission_impact_label'),     value: `+${Math.min(r.gain, 9)}% ${t('onb_mission_impact_suffix')}`, Icon: TrendingUp },
              { label: t('onb_mission_difficulty_label'), value: t('onb_mission_difficulty_val'), Icon: Target },
            ].map(({ label, value, Icon }) => (
              <div key={label} className="bg-slate-900/60 rounded-xl p-3 border border-slate-800/50">
                <Icon size={12} className="text-emerald-400 mb-1.5" />
                <p className="text-[10px] text-slate-500 mb-0.5">{label}</p>
                <p className="text-white text-xs font-bold leading-tight">{value}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={FU} className="space-y-2.5">
          <motion.button
            onClick={onAccept}
            whileHover={{ scale: 1.02, y: -1 }} whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl font-bold text-base
              bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
              shadow-xl shadow-emerald-500/25"
          >
            <Flame size={16} fill="currentColor" />
            {t('onb_mission_cta')}
          </motion.button>
          <button
            onClick={onSkip}
            className="w-full py-3 text-sm text-slate-500 hover:text-slate-300 transition-colors font-medium"
          >
            {t('onb_mission_skip')}
          </button>
        </motion.div>
      </motion.div>
    </StepWrap>
  );
}

// ─── Step 5: Celebration ──────────────────────────────────────────────────────
function Step5Celebrate({ onComplete, userEmail }: { onComplete: () => void; userEmail?: string }) {
  const { t } = useI18n();
  const [showConfetti, setShowConfetti] = useState(false);
  const [loaded,       setLoaded]       = useState(false);
  const [completing,   setCompleting]   = useState(false);
  const r        = getResults(userEmail);
  const newScore = Math.min(r.score + Math.min(r.gain, 9), 99);

  // Track mount so we never call setState after unmount
  const mounted = useRef(true);
  useEffect(() => { return () => { mounted.current = false; }; }, []);

  useEffect(() => {
    if (!mounted.current) return;
    setShowConfetti(true);
    const tLoaded = setTimeout(() => { if (mounted.current) setLoaded(true);         }, 200);
    const stop    = setTimeout(() => { if (mounted.current) setShowConfetti(false); }, 3200);
    return () => { clearTimeout(tLoaded); clearTimeout(stop); };
  }, []);

  const handleComplete = useCallback(() => {
    if (completing) return;
    setCompleting(true);
    track('onboarding_completed');
    // Let the whileTap animation and any pending Framer Motion callbacks fully settle
    setTimeout(() => { if (mounted.current) onComplete(); }, 350);
  }, [completing, onComplete]);

  return (
    <StepWrap stepKey="s5">
      <Confetti active={showConfetti} />
      <motion.div initial="hidden" animate={loaded ? 'show' : 'hidden'} variants={STAG} className="text-center space-y-6">

        <motion.div variants={FU}>
          <motion.div
            animate={{ scale: [1, 1.15, 0.95, 1.05, 1], rotate: [0, -8, 8, -4, 0] }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="inline-flex w-24 h-24 rounded-3xl items-center justify-center
              bg-gradient-to-br from-amber-400 to-orange-500
              shadow-2xl shadow-amber-500/30 mb-1"
          >
            <Trophy size={38} className="text-white" fill="currentColor" />
          </motion.div>
        </motion.div>

        <motion.div variants={FU} className="space-y-2">
          <h2 className="text-3xl font-extrabold text-white tracking-tight">{t('onb_done_title')}</h2>
          <p className="text-slate-400 text-base leading-relaxed">
            {t('onb_done_sub')}
          </p>
        </motion.div>

        {/* Score before/after */}
        <motion.div variants={FU}
          className="rounded-2xl border border-amber-500/20 p-6 flex items-center justify-center gap-8"
          style={{ background: 'linear-gradient(135deg,rgba(245,158,11,0.06) 0%,rgba(7,10,18,0.99) 100%)' }}
        >
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{t('onb_done_before')}</p>
            <p className="text-2xl font-black text-slate-500 tabular-nums">{r.score}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <ArrowRight size={20} className="text-emerald-400" />
            <span className="text-emerald-400 text-xs font-bold">+{Math.min(r.gain, 9)} pts</span>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{t('onb_done_after')}</p>
            <motion.p
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.4 }}
              className="text-2xl font-black text-emerald-400 tabular-nums"
            >
              {newScore}
            </motion.p>
          </div>
        </motion.div>

        {/* Checklist preview */}
        <motion.div variants={FU}
          className="rounded-xl border border-slate-800/50 p-4 text-left"
          style={{ background: 'rgba(12,18,32,0.8)' }}
        >
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mb-3">{t('onb_done_next_label')}</p>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center shrink-0">
              <FileText size={13} className="text-sky-400" />
            </div>
            <div>
              <p className="text-slate-200 text-sm font-medium">{t('onb_done_next_title')}</p>
              <p className="text-slate-600 text-[10px] mt-0.5">{t('onb_done_next_sub')}</p>
            </div>
            <ChevronRight size={15} className="text-slate-600 ml-auto shrink-0" />
          </div>
        </motion.div>

        <motion.div variants={FU}>
          <motion.button
            onClick={handleComplete}
            disabled={completing}
            whileHover={completing ? {} : { scale: 1.02, y: -1 }} whileTap={completing ? {} : { scale: 0.97 }}
            className={`w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl font-bold text-base
              bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
              shadow-xl shadow-emerald-500/25 transition-opacity ${completing ? 'opacity-70' : ''}`}
          >
            {completing ? t('onb_done_opening') : t('onb_done_cta')}
            <ArrowRight size={15} />
          </motion.button>
        </motion.div>
      </motion.div>
    </StepWrap>
  );
}

// ─── Main OnboardingFlow ──────────────────────────────────────────────────────
export default function OnboardingFlow({ userEmail, onComplete }: OnboardingFlowProps) {
  const { t } = useI18n();
  const [step, setStep] = useState<Step>(1);
  const next = useCallback(() => setStep(s => Math.min(s + 1, 5) as Step), []);

  const handleSkip = useCallback(() => {
    track('onboarding_skipped', { from_step: step });
    setTimeout(onComplete, 0);
  }, [onComplete, step]);

  const handleMissionAccepted = useCallback(() => {
    track('onboarding_mission_accepted');
    next();
  }, [next]);

  const handleMissionSkipped = useCallback(() => {
    track('onboarding_mission_skipped');
    next();
  }, [next]);

  // Fire once on mount and once per step change
  useEffect(() => { track('onboarding_started'); }, []);
  useEffect(() => { track('onboarding_step_viewed', { step }); }, [step]);

  // Map step → title shown above dots
  const STEP_LABELS: Record<Step, string> = {
    1: t('onb_step_welcome'),
    2: t('onb_step_scanning'),
    3: t('onb_step_summary'),
    4: t('onb_step_mission'),
    5: t('onb_step_done'),
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-5 py-10"
      style={{ background: 'linear-gradient(160deg,rgba(5,8,16,1) 0%,rgba(7,12,22,1) 100%)' }}
    >
      {/* Header */}
      <div className="w-full max-w-[460px] mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <Sparkles size={12} className="text-emerald-400" />
          </div>
          <span className="text-slate-400 text-xs font-semibold">AI Copilot</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] text-slate-600 font-medium">{STEP_LABELS[step]}</span>
          <StepDots current={step} total={5} />
        </div>
      </div>

      {/* Content */}
      <div className="w-full max-w-[460px]">
        <AnimatePresence mode="wait">
          {step === 1 && <Step1Welcome key="s1" onNext={next} userEmail={userEmail} />}
          {step === 2 && <Step2Analysis key="s2" onNext={next} />}
          {step === 3 && <Step3Summary  key="s3" onNext={next} userEmail={userEmail} />}
          {step === 4 && <Step4Mission  key="s4" onAccept={handleMissionAccepted} onSkip={handleMissionSkipped} userEmail={userEmail} />}
          {step === 5 && <Step5Celebrate key="s5" onComplete={onComplete} userEmail={userEmail} />}
        </AnimatePresence>
      </div>

      {/* Skip — only steps 1, 3, 4 */}
      {(step === 1 || step === 3 || step === 4) && (
        <motion.button
          onClick={handleSkip}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2 }}
          className="mt-8 text-xs text-slate-700 hover:text-slate-400 transition-colors"
        >
          {t('onb_skip')}
        </motion.button>
      )}
    </div>
  );
}
