import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Zap, Shield, Star, Check, Sparkles,
  Globe, Target, Lock, AlertCircle,
  BarChart3, Radar, ChevronRight, CheckCircle2,
} from 'lucide-react';
import { track } from '../lib/analytics';
import { LogoIcon } from './Logo';

// ─── Types ───────────────────────────────────────────────────────────────────
type VPhase = 'idle' | 'loading' | 'result';

interface VResult {
  name: string;
  overall: number;
  subs: { label: string; score: number; Icon: React.ElementType; clr: string }[];
  actions: { title: string; impact: 'Alto' | 'Medio'; time: string; diff: 'Fácil' | 'Medio' }[];
}

// ─── Deterministic result ─────────────────────────────────────────────────────
function buildResult(name: string): VResult {
  const h = Array.from(name.toLowerCase()).reduce((a, c) => a + c.charCodeAt(0), 0);
  const j = (b: number, r: number) => Math.min(97, Math.max(28, b + (h % r) - Math.floor(r / 2)));
  return {
    name,
    overall: j(70, 30),
    subs: [
      { label: 'Google Business', score: j(76, 22), Icon: Globe,     clr: 'sky'     },
      { label: 'Reseñas',         score: j(62, 26), Icon: Star,      clr: 'amber'   },
      { label: 'Competidores',    score: j(52, 24), Icon: Target,    clr: 'orange'  },
      { label: 'SEO Técnico',     score: j(86, 16), Icon: BarChart3, clr: 'emerald' },
    ],
    actions: [
      { title: 'Añadir más fotos al perfil',              impact: 'Alto',  time: '15 min', diff: 'Fácil'  },
      { title: 'Responder reseñas pendientes',             impact: 'Alto',  time: '10 min', diff: 'Fácil'  },
      { title: 'Publicar una actualización semanal',       impact: 'Medio', time: '20 min', diff: 'Fácil'  },
      { title: 'Optimizar categorías principales',         impact: 'Alto',  time: '5 min',  diff: 'Fácil'  },
      { title: 'Mejorar descripción con keywords locales', impact: 'Alto',  time: '30 min', diff: 'Medio'  },
    ],
  };
}

const CLR: Record<string, { text: string; bg: string; bar: string; ring: string }> = {
  sky:     { text: 'text-sky-400',     bg: 'bg-sky-500/10',     bar: 'bg-sky-400',     ring: 'border-sky-500/25'     },
  amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   bar: 'bg-amber-400',   ring: 'border-amber-500/25'   },
  orange:  { text: 'text-orange-400',  bg: 'bg-orange-500/10',  bar: 'bg-orange-400',  ring: 'border-orange-500/25'  },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', bar: 'bg-emerald-400', ring: 'border-emerald-500/25' },
};

// ─── Score ring ───────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const [anim, setAnim] = useState(0);
  const R = 70, C = 2 * Math.PI * R;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const tag   = score >= 80 ? 'Bueno'   : score >= 60 ? 'Mejorable' : 'Crítico';
  const tagC  = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400';

  useEffect(() => {
    let n = 0;
    const iv = setInterval(() => {
      n = Math.min(n + 1, score);
      setAnim(n);
      if (n >= score) clearInterval(iv);
    }, 14);
    return () => clearInterval(iv);
  }, [score]);

  return (
    <div className="relative inline-flex items-center justify-center w-[168px] h-[168px]">
      <svg width={168} height={168} className="absolute inset-0 -rotate-90">
        <circle cx={84} cy={84} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={10} />
        <circle cx={84} cy={84} r={R} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${(anim / 100) * C} ${C}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color}55)` }} />
      </svg>
      <div className="flex flex-col items-center justify-center z-10">
        <span className="text-[2.6rem] font-black text-white tabular-nums leading-none">{anim}</span>
        <span className="text-slate-600 text-xs">/100</span>
        <span className={`text-xs font-bold mt-1.5 ${tagC}`}>{tag}</span>
      </div>
    </div>
  );
}

// ─── Sub-score card ───────────────────────────────────────────────────────────
function SubScoreCard({ label, score, Icon, clr }: { label: string; score: number; Icon: React.ElementType; clr: string }) {
  const [anim, setAnim] = useState(0);
  const c = CLR[clr] ?? CLR.emerald;
  useEffect(() => {
    let n = 0;
    const iv = setInterval(() => { n = Math.min(n + 1, score); setAnim(n); if (n >= score) clearInterval(iv); }, 18);
    return () => clearInterval(iv);
  }, [score]);
  return (
    <div className={`rounded-xl border ${c.ring} p-4 flex flex-col gap-3`}
      style={{ background: 'linear-gradient(145deg,rgba(15,23,42,0.92) 0%,rgba(8,14,26,0.97) 100%)' }}>
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon size={14} className={c.text} />
        </div>
        <span className={`text-xl font-black tabular-nums ${c.text}`}>{anim}</span>
      </div>
      <div>
        <p className="text-slate-400 text-[11px] mb-1.5">{label}</p>
        <div className="w-full h-1.5 rounded-full bg-slate-800">
          <div className={`h-full rounded-full ${c.bar} transition-none`} style={{ width: `${anim}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Loading stages ───────────────────────────────────────────────────────────
const LOAD_MSGS = [
  'Buscando ficha de Google…',
  'Verificando información del negocio…',
  'Analizando reseñas…',
  'Calculando Local Score…',
  'Buscando competidores en tu zona…',
  'Analizando categorías…',
  'Detectando oportunidades de crecimiento…',
  'Generando informe personalizado…',
];

const LOAD_STAGES = [
  { pct:  0, msg: 0, ms:    0 },
  { pct: 15, msg: 1, ms:  450 },
  { pct: 30, msg: 2, ms:  900 },
  { pct: 48, msg: 3, ms: 1400 },
  { pct: 64, msg: 4, ms: 1900 },
  { pct: 78, msg: 5, ms: 2400 },
  { pct: 91, msg: 6, ms: 2900 },
  { pct:100, msg: 7, ms: 3350 },
];

// ─── UTM / fbclid extraction ──────────────────────────────────────────────────
function getUTMParams(): Record<string, string | null> {
  const params = new URLSearchParams(window.location.search);
  return {
    utm_source: params.get('utm_source'),
    utm_campaign: params.get('utm_campaign'),
    utm_content: params.get('utm_content'),
    fbclid: params.get('fbclid'),
  };
}

// ─── Main component ───────────────────────────────────────────────────────────
interface MetaAdsLandingProps {
  onUnlock: () => void;
}

export default function MetaAdsLanding({ onUnlock }: MetaAdsLandingProps) {
  const [phase,       setPhase]       = useState<VPhase>('idle');
  const [name,        setName]        = useState('');
  const [pct,         setPct]         = useState(0);
  const [msgI,        setMsgI]        = useState(0);
  const [result,      setResult]      = useState<VResult | null>(null);
  const [earlyResult, setEarlyResult] = useState<VResult | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number>(0);
  const pctRef       = useRef<number>(0);

  // Track page_view with UTM + fbclid
  useEffect(() => {
    const utm = getUTMParams();
    track('page_view', {
      page: 'meta_ads_landing',
      page_path: window.location.pathname,
      path: window.location.pathname,
      referrer: document.referrer || null,
      ...utm,
    });
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { inputRef.current?.focus(); return; }
    startTimeRef.current = Date.now();
    const utm = getUTMParams();
    track('hero_analysis_start', { name: n, page_path: window.location.pathname, ...utm });
    setPhase('loading');
    setPct(0); setMsgI(0);
    setEarlyResult(null);
  };

  useEffect(() => {
    if (phase !== 'loading') return;
    const ts = LOAD_STAGES.map(({ pct: p, msg: m, ms }) =>
      setTimeout(() => {
        setPct(p);
        pctRef.current = p;
        setMsgI(m);
        if (p >= 64 && !earlyResult) {
          setEarlyResult(buildResult(name.trim()));
        }
      }, ms)
    );
    const done = setTimeout(() => {
      const r = buildResult(name.trim());
      setResult(r);
      setPhase('result');
      track('analysis_completed', {
        name: name.trim(),
        duration_ms: Date.now() - startTimeRef.current,
      });
    }, 3500);
    return () => { ts.forEach(clearTimeout); clearTimeout(done); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, name]);

  useEffect(() => {
    if (phase !== 'loading') return;
    return () => {
      if (pctRef.current < 100) {
        track('analysis_abandoned', {
          name: name.trim(),
          progress_pct: pctRef.current,
          duration_ms: Date.now() - startTimeRef.current,
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const reset = () => {
    setPhase('idle');
    setPct(0); setMsgI(0); setResult(null); setEarlyResult(null);
    pctRef.current = 0;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden">
      <AnimatePresence mode="wait">

        {/* ══════════════════════════════════════════════════════════════════ IDLE */}
        {phase === 'idle' && (
          <motion.section key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.35 }}
            className="relative min-h-[100svh] flex flex-col items-center justify-center px-4 py-6 overflow-hidden">

            {/* Background glow */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-teal-500/3 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-xl mx-auto text-center flex flex-col items-center justify-center gap-5 py-4">

              {/* Badge */}
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-1.5 text-[11px] sm:text-xs font-semibold text-emerald-400">
                  <Sparkles size={11} className="text-orange-400" />
                  Análisis gratuito · Google Maps
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </span>
              </motion.div>

              {/* Title */}
              <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
                className="text-[1.6rem] leading-[1.15] sm:text-4xl font-extrabold text-white tracking-tight px-2">
                ¿Tu competencia aparece antes que tú en{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  Google Maps?
                </span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
                className="text-slate-400 text-sm sm:text-base max-w-md mx-auto px-2">
                Analiza gratis tu negocio y descubre qué debes mejorar para conseguir más visibilidad local.
              </motion.p>

              {/* Form */}
              <motion.form onSubmit={handleSubmit} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
                className="w-full max-w-md mx-auto">
                <div className="flex flex-col gap-2 p-2 rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-sm shadow-2xl shadow-black/40">
                  <div className="flex items-center gap-3 flex-1 px-4 py-3">
                    <MapPin size={18} className="text-emerald-400 shrink-0" />
                    <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="Escribe el nombre de tu negocio..."
                      className="flex-1 bg-transparent text-white placeholder-slate-500 text-base focus:outline-none min-w-0"
                      aria-label="Nombre del negocio"
                      autoComplete="off"
                    />
                    {name && (
                      <button type="button" onClick={() => { setName(''); inputRef.current?.focus(); }}
                        className="text-slate-600 hover:text-slate-400 transition-colors text-sm leading-none px-1"
                        aria-label="Limpiar">✕</button>
                    )}
                  </div>
                  <motion.button type="submit" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    className="flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl font-bold text-base
                      bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
                      shadow-lg shadow-emerald-500/30 shrink-0 whitespace-nowrap">
                    <Zap size={15} fill="currentColor" />
                    Analizar mi negocio gratis
                  </motion.button>
                </div>

                {/* Trust line */}
                <p className="text-center text-[11px] sm:text-xs text-slate-500 mt-3 flex items-center justify-center gap-1.5 flex-wrap">
                  <Shield size={10} className="text-emerald-400" />
                  Sin tarjeta
                  <span className="text-slate-700">·</span>
                  Resultado en menos de 30 segundos
                  <span className="text-slate-700">·</span>
                  Gratis
                </p>
              </motion.form>

              {/* Demo preview — result screenshot mock */}
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.3 }}
                className="w-full max-w-md mx-auto mt-2">
                <div className="rounded-2xl overflow-hidden border border-slate-700/40 shadow-xl shadow-black/40"
                  style={{ background: 'linear-gradient(160deg,rgba(14,22,38,0.95) 0%,rgba(7,12,20,1) 100%)' }}>
                  {/* Browser chrome */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 bg-slate-900/70">
                    <div className="flex gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-red-500/50" />
                      <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                      <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
                    </div>
                    <div className="flex-1 mx-2 bg-slate-800/70 rounded-md px-2.5 py-0.5 text-[9px] text-slate-500 font-mono text-center">
                      Tu resultado
                    </div>
                  </div>
                  {/* Mini result preview */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Informe de Visibilidad</p>
                        <p className="text-white font-bold text-sm">Peluquería López · Madrid</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400">Mejorable</span>
                    </div>
                    {/* Score + bars */}
                    <div className="flex items-center gap-4">
                      <div className="relative w-20 h-20 shrink-0">
                        <svg width={80} height={80} className="-rotate-90">
                          <circle cx={40} cy={40} r={32} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={6} />
                          <circle cx={40} cy={40} r={32} fill="none" stroke="#f59e0b" strokeWidth={6}
                            strokeDasharray={`${0.74 * 2 * Math.PI * 32} ${2 * Math.PI * 32}`} strokeLinecap="round" />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-lg font-black text-white tabular-nums leading-none">74</span>
                          <span className="text-[8px] text-slate-600">/100</span>
                        </div>
                      </div>
                      <div className="flex-1 space-y-1.5">
                        {[
                          { label: 'Google Business', score: 68, clr: 'bg-sky-400' },
                          { label: 'Reseñas',         score: 54, clr: 'bg-amber-400' },
                          { label: 'Competidores',    score: 42, clr: 'bg-orange-400' },
                        ].map(({ label, score, clr }) => (
                          <div key={label}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span className="text-[9px] text-slate-500">{label}</span>
                              <span className="text-[9px] text-slate-400 font-bold tabular-nums">{score}</span>
                            </div>
                            <div className="w-full h-1 rounded-full bg-slate-800 overflow-hidden">
                              <div className={`h-full rounded-full ${clr}`} style={{ width: `${score}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Action items preview */}
                    <div className="space-y-1.5">
                      {[
                        { t: 'Añadir más fotos al perfil', p: 'Alto' },
                        { t: 'Responder reseñas pendientes', p: 'Alto' },
                      ].map(({ t, p }) => (
                        <div key={t} className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/30">
                          <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                          <span className="text-[10px] text-slate-300 flex-1">{t}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${p === 'Alto' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'}`}>{p}</span>
                        </div>
                      ))}
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-800/20">
                        <Lock size={10} className="text-slate-600 shrink-0" />
                        <span className="text-[10px] text-slate-600 blur-[2px] select-none flex-1">+3 acciones adicionales bloqueadas</span>
                      </div>
                    </div>
                  </div>
                </div>
                <p className="text-center text-[10px] text-slate-600 mt-2">Así se verá tu informe personalizado</p>
              </motion.div>
            </div>
          </motion.section>
        )}

        {/* ════════════════════════════════════════════════════════════════ LOADING */}
        {phase === 'loading' && (
          <motion.section key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="relative min-h-screen flex flex-col items-center justify-center px-5 py-16 overflow-hidden">

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
              {[0, 1, 2].map(i => (
                <motion.div key={i}
                  className="absolute w-40 h-40 rounded-full border border-emerald-500/15"
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 3.5 + i * 0.7, opacity: 0 }}
                  transition={{ duration: 4, repeat: Infinity, delay: i * 1.3, ease: 'easeOut' }} />
              ))}
              <div className="absolute w-3 h-3 rounded-full bg-emerald-400/40 blur-sm" />
            </div>

            <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
              style={{ backgroundImage: 'linear-gradient(rgba(16,185,129,1) 1px,transparent 1px),linear-gradient(90deg,rgba(16,185,129,1) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

            <div className="relative z-10 w-full max-w-md mx-auto space-y-10">
              <div className="text-center space-y-4">
                <div className="w-20 h-20 rounded-3xl bg-slate-900/80 border border-emerald-500/25 flex items-center justify-center mx-auto shadow-xl shadow-black/40">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                    <Radar size={32} className="text-emerald-400" />
                  </motion.div>
                </div>
                <div>
                  <p className="text-slate-400 text-sm">Analizando</p>
                  <p className="text-white font-bold text-xl mt-1 px-4 break-words">"{name}"</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <motion.span key={msgI} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="text-slate-300 font-medium">
                    {LOAD_MSGS[msgI]}
                  </motion.span>
                  <span className="text-slate-500 tabular-nums font-mono">{pct}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800/80 overflow-hidden">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.9, ease: 'easeOut' }}
                    style={{ boxShadow: '0 0 12px rgba(16,185,129,0.45)' }} />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-800/60 p-5 bg-slate-900/40">
                {LOAD_MSGS.map((msg, i) => {
                  if (i > msgI) return null;
                  const done   = i < msgI;
                  const active = i === msgI;
                  return (
                    <motion.div key={msg} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3 }}
                      className="flex items-center gap-3 text-sm">
                      {done
                        ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                        : <motion.div animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 1.1, repeat: Infinity }}
                            className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500/70 shrink-0" />
                      }
                      <span className={done ? 'text-slate-500' : active ? 'text-slate-200 font-medium' : 'text-slate-500'}>
                        {msg}
                      </span>
                    </motion.div>
                  );
                })}
              </div>

              {earlyResult && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.16,1,0.3,1] as const }}
                  className="rounded-2xl border border-slate-800/60 p-5 bg-slate-900/40">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-3">Vista previa — puntuación detectada</p>
                  <div className="flex items-center gap-5">
                    <ScoreRing score={earlyResult.overall} />
                    <div className="flex-1 space-y-2">
                      {earlyResult.subs.slice(0, 2).map(({ label, score, Icon, clr }) => (
                        <SubScoreCard key={label} label={label} score={score} Icon={Icon} clr={clr} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.section>
        )}

        {/* ════════════════════════════════════════════════════════════════ RESULT */}
        {phase === 'result' && result && (
          <motion.section key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ duration: 0.5 }}
            className="relative px-5 py-16 pb-28 overflow-hidden">

            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/4 rounded-full blur-3xl" />
            </div>

            <div className="relative max-w-2xl mx-auto">
              <button onClick={reset}
                className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-8 transition-colors group">
                <ChevronRight size={14} className="rotate-180 group-hover:-translate-x-0.5 transition-transform" />
                Analizar otro negocio
              </button>

              <motion.div initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.55, ease: [0.16,1,0.3,1] as const }}
                className="rounded-3xl border border-slate-700/40 overflow-hidden"
                style={{ background: 'linear-gradient(160deg,rgba(14,22,38,0.98) 0%,rgba(7,12,20,1) 100%)' }}>

                <div className="px-7 pt-6 pb-5 border-b border-slate-800/50 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-[0.18em] font-semibold mb-1">Informe de Visibilidad</p>
                    <p className="text-white font-bold text-xl leading-snug">{result.name}</p>
                    <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                      <MapPin size={10} />Google Maps · España
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 mt-1">
                    Mejorable
                  </span>
                </div>

                <div className="p-7 space-y-8">
                  <div className="flex flex-col sm:flex-row items-center gap-8">
                    <div className="flex flex-col items-center gap-2.5 shrink-0">
                      <ScoreRing score={result.overall} />
                      <div className="text-center">
                        <p className="text-white font-bold text-sm">Visibilidad Local</p>
                        <p className="text-slate-500 text-xs mt-0.5">4 factores analizados</p>
                      </div>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-3 w-full">
                      {result.subs.map(({ label, score, Icon, clr }) => (
                        <SubScoreCard key={label} label={label} score={score} Icon={Icon} clr={clr} />
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-white font-bold text-base mb-4 flex items-center gap-2">
                      <Sparkles size={15} className="text-emerald-400" />
                      Tu Plan de Acción
                    </p>
                    <div className="space-y-2">
                      {result.actions.map(({ title, impact, time, diff }, i) => (
                        <motion.div key={title}
                          initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 + i * 0.08, duration: 0.35 }}
                          className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-700/30 bg-slate-800/30">
                          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                          <span className="flex-1 text-slate-200 text-sm">{title}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              impact === 'Alto' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                            }`}>{impact}</span>
                            <span className="text-[10px] text-slate-600 hidden sm:block">{time}</span>
                            <span className={`text-[10px] hidden sm:block ${diff === 'Fácil' ? 'text-emerald-400/60' : 'text-amber-400/60'}`}>{diff}</span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>

                  {/* Unlock CTA */}
                  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
                    className="rounded-2xl border border-emerald-500/20 overflow-hidden relative">

                    <div className="px-6 pt-5 pb-2 space-y-2" aria-hidden="true">
                      {[
                        'Plan de contenido para los próximos 30 días',
                        'Análisis de 87 keywords locales',
                        'Estrategia de reseñas personalizada',
                        'Comparativa detallada con 3 competidores',
                      ].map((t) => (
                        <div key={t} className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-800/30">
                          <Lock size={13} className="text-slate-700 shrink-0" />
                          <span className="text-slate-500 text-sm select-none blur-[3px]">{t}</span>
                        </div>
                      ))}
                    </div>

                    <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent to-slate-950/80 pointer-events-none" />

                    <div className="px-6 pb-6 pt-4 relative z-10"
                      style={{ background: 'linear-gradient(160deg,rgba(16,185,129,0.08) 0%,rgba(8,14,26,0.99) 60%)' }}>
                      <div className="rounded-2xl border border-emerald-500/25 p-6 text-center space-y-4">
                        <div className="flex items-center justify-center gap-2.5 mb-1">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                            <Lock size={14} className="text-emerald-400" />
                          </div>
                          <p className="text-white font-bold text-lg">Desbloquea el informe completo</p>
                        </div>
                        <p className="text-slate-400 text-sm max-w-sm mx-auto">
                          Accede a tu plan detallado con IA: keywords, estrategia de reseñas, comparativa de competidores y más.
                        </p>
                        <motion.button onClick={onUnlock} whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                          className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base
                            bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
                            shadow-xl shadow-emerald-500/35 hover:shadow-emerald-500/55 transition-shadow">
                          <Zap size={16} fill="currentColor" />
                          Ver informe completo — 7 días gratis
                        </motion.button>
                        <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                          <Shield size={10} className="text-slate-600" />
                          Sin tarjeta · Cancela cuando quieras · 9,99€/mes después
                        </p>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Footer — minimal */}
      {phase === 'idle' && (
        <footer className="border-t border-slate-800/50 py-6 px-5 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <LogoIcon size={16} />
            <span className="text-slate-400 font-bold text-xs">LocalSEOHub.io</span>
          </div>
          <p className="text-slate-600 text-[10px]">© 2026 · Análisis gratuito de visibilidad en Google Maps</p>
        </footer>
      )}
    </div>
  );
}
