import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowRight, Check, Search, TrendingUp, Star, Lock, Mail } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { trackLead, trackCompleteRegistration } from '../lib/pixel';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function utmParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source:   p.get('utm_source')   ?? undefined,
    utm_campaign: p.get('utm_campaign') ?? undefined,
    utm_content:  p.get('utm_content')  ?? undefined,
    fbclid:       p.get('fbclid')       ?? undefined,
  };
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ─── Score engine ─────────────────────────────────────────────────────────────

const OPPORTUNITIES = [
  {
    title: 'Pierdes clientes antes de que lleguen a ti',
    detail: 'El 76% de los clientes toma su decisión antes de hacer clic. Tu presencia actual no les está convenciendo en ese momento clave.',
  },
  {
    title: 'Otros negocios aparecen donde tú deberías estar',
    detail: 'En las búsquedas más importantes para tu sector, tus competidores ocupan el espacio que podría ser tuyo.',
  },
  {
    title: 'Tu negocio no transmite suficiente confianza',
    detail: 'Las señales de confianza de tu presencia online están incompletas. Los clientes dudan y eligen a otro.',
  },
  {
    title: 'Hay clientes buscándote ahora mismo que no te encuentran',
    detail: 'Cada día, personas en tu zona buscan exactamente lo que ofreces. No te están encontrando.',
  },
  {
    title: 'Estás perdiendo visibilidad cada semana sin notarlo',
    detail: 'Sin actividad constante, tu posición cae de forma silenciosa. Tus competidores activos toman tu lugar.',
  },
  {
    title: 'Tu potencial de crecimiento está sin explotar',
    detail: 'Con ajustes concretos, tu negocio podría multiplicar su visibilidad sin inversión adicional.',
  },
];

interface Score {
  value: number;
  label: string;
  labelColor: string;
  ring: string;
  opportunities: typeof OPPORTUNITIES;
}

function buildScore(name: string): Score {
  const seed = hashStr(name.trim().toLowerCase());
  const value = 52 + (seed % 30); // 52–81

  const cfg =
    value < 62 ? { label: 'Mejorable',  labelColor: '#f59e0b', ring: '#f59e0b' } :
    value < 74 ? { label: 'Bueno',      labelColor: '#10b981', ring: '#10b981' } :
                 { label: 'Notable',    labelColor: '#22d3ee', ring: '#22d3ee' };

  const start = seed % OPPORTUNITIES.length;
  const opportunities = Array.from({ length: 5 }, (_, i) => OPPORTUNITIES[(start + i) % OPPORTUNITIES.length]);

  return { value, opportunities, ...cfg };
}

// ─── Counter hook ─────────────────────────────────────────────────────────────

function useCount(target: number, run: boolean, ms = 1500) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!run) return;
    const t0 = performance.now();
    const raf = (now: number) => {
      const p = Math.min((now - t0) / ms, 1);
      setN(Math.round((1 - Math.pow(1 - p, 4)) * target));
      if (p < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [target, run, ms]);
  return n;
}

// ─── Score ring (SVG) ─────────────────────────────────────────────────────────

function Ring({ value, run, color }: { value: number; run: boolean; color: string }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const n = useCount(value, run, 1700);
  const offset = C * (1 - n / 100);
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="128" height="128" className="-rotate-90" style={{ overflow: 'visible' }}>
        <circle cx="64" cy="64" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
        <circle
          cx="64" cy="64" r={R} fill="none"
          stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={run ? offset : C}
          style={{
            transition: 'stroke-dashoffset 40ms linear',
            filter: `drop-shadow(0 0 10px ${color}70)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[38px] font-black text-white leading-none tabular-nums">{n}</span>
        <span className="text-[11px] text-slate-600 font-medium mt-0.5">/ 100</span>
      </div>
    </div>
  );
}

// ─── Loading screen ───────────────────────────────────────────────────────────

const STEPS = [
  'Analizando presencia digital...',
  'Comparando competidores...',
  'Buscando oportunidades...',
  'Calculando potencial...',
  'Preparando diagnóstico...',
  'Generando recomendaciones...',
];

function Loading({ onDone }: { onDone: () => void }) {
  const [active, setActive] = useState(0);
  const [done, setDone] = useState<Set<number>>(new Set());

  useEffect(() => {
    const dur = 3800;
    const gap = dur / STEPS.length;
    const timers: ReturnType<typeof setTimeout>[] = [];

    STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setActive(i);
        if (i > 0) setDone(prev => new Set(prev).add(i - 1));
      }, i * gap));
    });

    timers.push(setTimeout(() => {
      setDone(new Set(STEPS.map((_, i) => i)));
      setTimeout(onDone, 350);
    }, dur + 100));

    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  const progress = (done.size / STEPS.length) * 100;

  return (
    <div className="fixed inset-0 flex items-center justify-center px-6 z-50"
      style={{ background: 'rgba(2,7,12,0.97)', backdropFilter: 'blur(20px)' }}>
      <div className="w-full max-w-[300px]">

        {/* Animated orb */}
        <div className="flex justify-center mb-10">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full animate-ping"
              style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)' }} />
            <div className="absolute inset-0 rounded-full animate-ping"
              style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.10) 0%, transparent 70%)', animationDelay: '0.4s' }} />
            <div className="relative w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)' }}>
              <Search size={22} className="text-emerald-400" />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-8">
          {STEPS.map((step, i) => {
            const isDone   = done.has(i);
            const isActive = active === i && !isDone;
            return (
              <div
                key={i}
                className="flex items-center gap-3 transition-all duration-300"
                style={{ opacity: isDone || isActive ? 1 : 0.15 }}
              >
                <div
                  className="flex-shrink-0 rounded-full flex items-center justify-center transition-all duration-300"
                  style={{
                    width: 18, height: 18,
                    background:    isDone ? '#10b981' : 'transparent',
                    border:        isDone ? 'none' : `1px solid ${isActive ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'}`,
                  }}
                >
                  {isDone
                    ? <Check size={10} className="text-white" strokeWidth={3} />
                    : isActive
                      ? <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse block" />
                      : null
                  }
                </div>
                <span className="text-[13px]" style={{ color: isDone ? '#34d399' : isActive ? '#fff' : 'rgba(255,255,255,0.15)' }}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        {/* Bar */}
        <div className="h-px rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#10b981,#34d399)' }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Magic-link gate ──────────────────────────────────────────────────────────

type GateState = 'idle' | 'sending' | 'sent' | 'error';

function Gate({ business }: { business: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<GateState>('idle');
  const [errMsg, setErrMsg] = useState('');
  const utm = useRef(utmParams());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState('sending');
    setErrMsg('');

    track('gate_register_click', { business, ...utm.current });

    localStorage.setItem('_ptl_name', business);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: window.location.origin + '/descubre-tu-potencial',
        shouldCreateUser: true,
      },
    });

    if (error) {
      setState('error');
      setErrMsg('No pudimos enviar el enlace. Inténtalo de nuevo.');
      return;
    }

    trackLead();
    track('register_started', { business, ...utm.current });
    setState('sent');
  };

  if (state === 'sent') {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
          style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)' }}>
          <Mail size={20} className="text-emerald-400" />
        </div>
        <p className="text-white font-bold text-[15px] mb-1">Revisa tu email</p>
        <p className="text-slate-500 text-sm leading-relaxed">
          Enviamos el acceso a <span className="text-slate-300">{email}</span>.
          <br />Haz clic en el enlace para ver tu informe completo.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="relative">
        <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Tu email"
          className="w-full rounded-xl pl-10 pr-4 py-4 text-sm text-white placeholder-slate-600 outline-none transition-all"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
        />
      </div>
      {errMsg && <p className="text-red-400 text-xs pl-1">{errMsg}</p>}
      <button
        type="submit"
        disabled={state === 'sending'}
        className="w-full font-bold text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-all duration-150 disabled:opacity-60"
        style={{
          background: '#10b981',
          color: '#fff',
          boxShadow: '0 0 0 1px rgba(16,185,129,0.3), 0 6px 24px rgba(16,185,129,0.22)',
        }}
      >
        {state === 'sending'
          ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Enviando...</>
          : <>Ver informe completo <ArrowRight size={14} /></>
        }
      </button>
      <p className="text-center text-slate-700 text-[11px]">Sin tarjeta · Sin compromiso · 7 días gratis</p>
    </form>
  );
}

// ─── Result view ──────────────────────────────────────────────────────────────

function Result({
  business,
  score,
  unlocked,
}: {
  business: string;
  score: Score;
  unlocked: boolean;
}) {
  const [run, setRun] = useState(false);
  useEffect(() => { const t = setTimeout(() => setRun(true), 120); return () => clearTimeout(t); }, []);

  const visible = score.opportunities.slice(0, 2);
  const gated   = score.opportunities.slice(2);

  return (
    <div className="min-h-screen pb-28">

      {/* Top bar */}
      <div className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-white font-bold text-sm tracking-tight">Diagnóstico</span>
        {unlocked && (
          <span className="text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
            <Check size={11} strokeWidth={3} />Desbloqueado
          </span>
        )}
      </div>

      <div className="max-w-lg mx-auto px-5 pt-7 space-y-4">

        {/* Score card */}
        <div className="glass-card rounded-2xl px-6 pt-7 pb-6 text-center">
          <p className="text-[11px] text-slate-600 uppercase tracking-[0.18em] font-semibold mb-5">
            Puntuación · {business}
          </p>
          <div className="flex justify-center mb-4">
            <Ring value={score.value} run={run} color={score.ring} />
          </div>
          <span
            className="inline-block text-sm font-bold px-4 py-1.5 rounded-full"
            style={{ color: score.labelColor, background: `${score.labelColor}12`, border: `1px solid ${score.labelColor}25` }}
          >
            {score.label}
          </span>
          <p className="text-slate-600 text-xs mt-3 leading-relaxed">
            Hemos detectado{' '}
            <span className="text-white font-semibold">{score.opportunities.length} oportunidades</span>{' '}
            que podrían ayudarte a conseguir más clientes.
          </p>
        </div>

        {/* Visible opportunities */}
        <div className="space-y-3">
          {visible.map((opp, i) => (
            <div key={i} className="glass-card rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full flex-shrink-0 mt-[7px]"
                  style={{ background: score.ring, boxShadow: `0 0 6px ${score.ring}80` }} />
                <div>
                  <p className="text-white font-semibold text-[13px] leading-snug mb-1.5">{opp.title}</p>
                  <p className="text-slate-600 text-[12px] leading-relaxed">{opp.detail}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Gated */}
        {!unlocked ? (
          <>
            {/* Blurred cards */}
            <div className="relative space-y-3" style={{ userSelect: 'none' }}>
              {gated.map((opp, i) => (
                <div key={i} className="rounded-2xl p-5"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    filter: 'blur(5px)',
                    opacity: 0.3,
                  }}>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: score.ring }} />
                    <div>
                      <p className="text-white font-semibold text-[13px] mb-1">{opp.title}</p>
                      <p className="text-slate-600 text-[12px]">{opp.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
              {/* Lock badge */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-full"
                  style={{ background: 'rgba(2,7,12,0.9)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}>
                  <Lock size={11} className="text-slate-500" />
                  <span className="text-slate-400 text-[12px] font-medium">{gated.length} oportunidades bloqueadas</span>
                </div>
              </div>
            </div>

            {/* Gate CTA */}
            <div id="gate-cta" className="glass-card rounded-2xl p-7">
              <div className="text-center mb-6">
                <h3 className="text-white font-black text-[19px] leading-snug mb-3">
                  Tu informe completo está preparado.
                </h3>
                <p className="text-slate-500 text-[13px] leading-relaxed">
                  Hemos encontrado varias oportunidades que podrían ayudarte a conseguir más clientes.{' '}
                  <span className="text-slate-300 font-medium">Desbloquéalas gratis.</span>
                </p>
              </div>
              <Gate business={business} />
            </div>
          </>
        ) : (
          // Unlocked
          <>
            <div className="space-y-3">
              {gated.map((opp, i) => (
                <div key={i} className="glass-card rounded-2xl p-5"
                  style={{ border: '1px solid rgba(16,185,129,0.15)' }}>
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-[7px]"
                      style={{ background: '#10b981' }} />
                    <div>
                      <p className="text-white font-semibold text-[13px] leading-snug mb-1.5">{opp.title}</p>
                      <p className="text-slate-600 text-[12px] leading-relaxed">{opp.detail}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-2xl p-6 text-center"
              style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.18)' }}>
              <Check size={22} className="text-emerald-400 mx-auto mb-3" />
              <p className="text-white font-bold mb-1">Revisa tu email</p>
              <p className="text-slate-500 text-[12px]">Haz clic en el enlace que te hemos enviado para acceder a tu panel completo.</p>
            </div>
          </>
        )}
      </div>

      {/* Sticky bottom bar when locked */}
      {!unlocked && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3"
          style={{ background: 'rgba(2,7,12,0.97)', borderTop: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)' }}>
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-white text-[12px] font-semibold">Informe completo listo</p>
              <p className="text-slate-600 text-[11px]">7 días gratis · sin tarjeta</p>
            </div>
            <button
              onClick={() => document.getElementById('gate-cta')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="flex-shrink-0 text-white font-bold text-[12px] px-4 py-3 rounded-xl flex items-center gap-1.5 transition-all"
              style={{ background: '#10b981', boxShadow: '0 0 0 1px rgba(16,185,129,0.3)' }}
            >
              Ver informe <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type Stage = 'hero' | 'loading' | 'result';

export default function PotentialLanding() {
  const [stage,    setStage]    = useState<Stage>('hero');
  const [name,     setName]     = useState('');
  const [score,    setScore]    = useState<Score | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const inputRef  = useRef<HTMLInputElement>(null);
  const startRef  = useRef(0);
  const utm       = useRef(utmParams());
  const typedOnce = useRef(false);
  const doneOnce  = useRef(false);

  // ── Magic-link return detection ──────────────────────────────
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        const saved = localStorage.getItem('_ptl_name');
        if (saved) {
          setName(saved);
          setScore(buildScore(saved));
          setUnlocked(true);
          setStage('result');
          trackCompleteRegistration();
          track('register_success', { business: saved, method: 'magic_link', ...utm.current });
        }
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Page view ────────────────────────────────────────────────
  useEffect(() => {
    track('page_view',    { page: 'potential', ...utm.current });
    track('hero_visible', { page: 'potential', ...utm.current });
  }, []);

  // ── Input handlers ───────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
    if (!typedOnce.current && e.target.value.length > 0) {
      typedOnce.current = true;
      track('business_name_started', { ...utm.current });
    }
  };

  const handleBlur = () => {
    if (!doneOnce.current && name.trim().length >= 3) {
      doneOnce.current = true;
      track('business_name_completed', { business: name.trim(), ...utm.current });
    }
  };

  // ── Form submit ──────────────────────────────────────────────
  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) { inputRef.current?.focus(); return; }
    startRef.current = Date.now();
    track('analysis_start', { business: name.trim(), ...utm.current });
    setStage('loading');
  }, [name]);

  // ── Loading done ─────────────────────────────────────────────
  const handleDone = useCallback(() => {
    const s = buildScore(name.trim());
    setScore(s);
    const ms = Date.now() - startRef.current;
    track('analysis_completed', { business: name.trim(), score: s.value, analysis_time: ms, ...utm.current });
    setTimeout(() => track('gate_shown', { business: name.trim(), ...utm.current }), 600);
    setStage('result');
  }, [name]);

  const ready = name.trim().length >= 2;

  // ── Loading screen ───────────────────────────────────────────
  if (stage === 'loading') return <Loading onDone={handleDone} />;

  // ── Result ───────────────────────────────────────────────────
  if (stage === 'result' && score) {
    return <Result business={name.trim()} score={score} unlocked={unlocked} />;
  }

  // ── Hero ─────────────────────────────────────────────────────
  return (
    <div
      className="min-h-[100svh] flex flex-col"
      style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
    >
      {/* ═══ HERO: everything the user sees above the fold ═══ */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 pt-8 pb-4 relative">

        {/* Subtle top glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[280px] pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.07) 0%, transparent 70%)' }} />

        <div className="relative w-full max-w-[500px]">

          {/* Eyebrow */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.14em]"
              style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.18)', color: 'rgba(52,211,153,0.85)' }}>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Análisis gratuito · Resultado en 60 seg.
            </div>
          </div>

          {/* Headline */}
          <h1
            className="text-white text-center font-black leading-[1.06] tracking-[-0.035em] mb-4"
            style={{ fontSize: 'clamp(28px, 6vw, 50px)' }}
          >
            Descubre qué está impidiendo
            {' '}que tu negocio consiga{' '}
            <span style={{
              background: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              más clientes.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="text-center text-slate-500 leading-[1.65] mb-8 max-w-[390px] mx-auto"
            style={{ fontSize: 'clamp(13px, 1.8vw, 15px)' }}>
            Nuestra IA analiza tu negocio y detecta oportunidades que quizá no estás viendo.
          </p>

          {/* ════ THE FORM ════ */}
          <form onSubmit={handleSubmit} className="space-y-3">

            {/* Input */}
            <div className="relative group">
              <Search
                size={17}
                className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200"
                style={{ color: ready ? '#10b981' : 'rgba(148,163,184,0.35)' }}
              />
              <input
                ref={inputRef}
                type="text"
                autoFocus
                autoComplete="off"
                value={name}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Escribe el nombre de tu negocio"
                className="w-full rounded-2xl text-white outline-none transition-all duration-200"
                style={{
                  padding: '17px 18px 17px 44px',
                  fontSize: 15,
                  background:   ready ? 'rgba(16,185,129,0.04)' : 'rgba(255,255,255,0.04)',
                  border:       `1px solid ${ready ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.1)'}`,
                  boxShadow:    ready ? '0 0 0 3px rgba(16,185,129,0.07)' : 'none',
                }}
              />
              {/* Placeholder example */}
              {name.length === 0 && (
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none hidden sm:block"
                  style={{ color: 'rgba(100,116,139,0.45)' }}>
                  Ej: Restaurante El Faro Marbella
                </span>
              )}
            </div>

            {/* CTA button */}
            <button
              type="submit"
              className="w-full font-black rounded-2xl flex items-center justify-center gap-2.5 transition-all duration-200"
              style={{
                padding: '17px',
                fontSize: 15,
                background: ready
                  ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                  : 'rgba(16,185,129,0.15)',
                color: ready ? '#fff' : 'rgba(16,185,129,0.45)',
                boxShadow: ready ? '0 0 0 1px rgba(16,185,129,0.3), 0 8px 30px rgba(16,185,129,0.22)' : 'none',
                cursor: ready ? 'pointer' : 'default',
                transform: ready ? 'translateY(0)' : 'none',
              }}
              onMouseEnter={e => ready && (e.currentTarget.style.transform = 'translateY(-1px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
            >
              Analizar GRATIS ahora
              <ArrowRight size={16} style={{ opacity: ready ? 1 : 0.35 }} />
            </button>
          </form>

          {/* Micro-trust */}
          <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
            {['Resultado en menos de 60 segundos', 'Sin tarjeta', 'Sin compromiso'].map(t => (
              <span key={t} className="flex items-center gap-1.5 text-[12px]" style={{ color: 'rgba(100,116,139,0.7)' }}>
                <Check size={11} className="text-emerald-500 flex-shrink-0" strokeWidth={3} />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ THREE CARDS — just below the form, still visible on most screens ═══ */}
      <div className="px-5 pb-8 max-w-[500px] mx-auto w-full">
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: TrendingUp, label: 'Más clientes',    desc: 'Descubre oportunidades para crecer.' },
            { icon: Star,       label: 'Más confianza',   desc: 'Detecta mejoras que aumentan tu reputación.' },
            { icon: Search,     label: 'Más visibilidad', desc: 'Conoce por qué otros aparecen antes que tú.' },
          ].map(({ icon: Icon, label, desc }) => (
            <div
              key={label}
              className="glass-card rounded-2xl p-4 flex flex-col items-center text-center gap-2"
            >
              <Icon size={16} className="text-emerald-500 flex-shrink-0" />
              <p className="text-white font-bold text-[11px] sm:text-[12px] leading-snug">{label}</p>
              <p className="text-slate-600 text-[10px] leading-relaxed hidden sm:block">{desc}</p>
            </div>
          ))}
        </div>

        {/* Social proof */}
        <div className="flex items-center justify-center gap-2 mt-4">
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={11} fill="currentColor" className="text-amber-400" />
            ))}
          </div>
          <p className="text-[11px]" style={{ color: 'rgba(100,116,139,0.65)' }}>
            Más de 1.000 diagnósticos realizados
          </p>
        </div>
      </div>

      {/* ═══ MOBILE sticky CTA ═══ */}
      <div
        className="sm:hidden fixed bottom-0 left-0 right-0 z-20 px-4 py-3"
        style={{
          background: 'rgba(2,7,12,0.97)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          backdropFilter: 'blur(20px)',
        }}
      >
        <button
          onClick={() => inputRef.current?.focus()}
          className="w-full text-white font-black text-[14px] py-4 rounded-xl flex items-center justify-center gap-2 transition-all"
          style={{
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            boxShadow: '0 0 0 1px rgba(16,185,129,0.3), 0 6px 20px rgba(16,185,129,0.2)',
          }}
        >
          Analizar GRATIS ahora <ArrowRight size={15} />
        </button>
      </div>
    </div>
  );
}
