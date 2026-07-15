import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone,
  MapPin,
  Star,
  ArrowRight,
  Check,
  Lock,
  ChevronDown,
  MessageSquare,
  TrendingUp,
  AlertTriangle,
  Shield,
  Zap,
  BarChart2,
  Clock,
  Users,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { trackCompleteRegistration } from '../lib/pixel';

// ---------------------------------------------------------------------------
// UTM helpers
// ---------------------------------------------------------------------------
function getUtmParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get('utm_source') ?? undefined,
    utm_campaign: p.get('utm_campaign') ?? undefined,
    utm_content: p.get('utm_content') ?? undefined,
    fbclid: p.get('fbclid') ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Audit generation (client-side, deterministic from inputs)
// ---------------------------------------------------------------------------
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function getScore(business: string, city: string, category: string): number {
  const seed = hashStr(`${business}${city}${category}`);
  return 38 + (seed % 25); // 38–62, always "needs improvement"
}

interface Opportunity {
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  impact: string;
}

const OPPORTUNITY_POOL: Record<string, Opportunity[]> = {
  default: [
    {
      severity: 'high',
      title: 'No respondes a las reseñas',
      detail: 'Google penaliza los negocios que ignoran sus reseñas. Los clientes leen las respuestas antes de decidir.',
      impact: 'Hasta un 30% más de conversiones',
    },
    {
      severity: 'high',
      title: 'Publicas menos de 2 veces al mes',
      detail: 'Los negocios que publican semanalmente en Google Business generan 5× más visitas al perfil.',
      impact: 'Visibilidad ×5 en búsquedas locales',
    },
    {
      severity: 'medium',
      title: 'Tu ficha de Google no está optimizada',
      detail: 'Faltan atributos clave, categorías secundarias y descripción actualizada que usan tus competidores.',
      impact: 'Posición más alta en Google Maps',
    },
    {
      severity: 'medium',
      title: 'Tus competidores tienen más fotos',
      detail: 'Los negocios con más de 10 fotos reciben un 42% más de solicitudes de ruta y llamadas directas.',
      impact: '+42% llamadas y visitas',
    },
    {
      severity: 'high',
      title: 'Palabras clave locales no posicionadas',
      detail: 'No apareces en búsquedas del tipo "mejor [sector] en [ciudad]" que tus clientes ideales hacen cada día.',
      impact: 'Captación de tráfico orgánico cualificado',
    },
    {
      severity: 'medium',
      title: 'Horario o datos de contacto desactualizados',
      detail: 'Un 20% de los perfiles locales tiene datos incorrectos. Google premia la precisión y penaliza la inconsistencia.',
      impact: 'Mayor confianza y menos rebotes',
    },
  ],
};

function getOpportunities(category: string, seed: number): Opportunity[] {
  const pool = OPPORTUNITY_POOL.default;
  const start = seed % pool.length;
  const result: Opportunity[] = [];
  for (let i = 0; i < 4; i++) {
    result.push(pool[(start + i) % pool.length]);
  }
  return result;
}

interface AuditData {
  score: number;
  opportunities: Opportunity[];
  potential: string;
}

function generateAudit(business: string, city: string, category: string): AuditData {
  const seed = hashStr(`${business}${city}${category}`);
  const score = getScore(business, city, category);
  const opportunities = getOpportunities(category, seed);
  const gain = 45 + (seed % 40);
  const potential = `Aplicando estas acciones, negocios similares a ${business} en ${city} han conseguido hasta un ${gain}% más de visibilidad en Google Maps en 30 días.`;
  return { score, opportunities, potential };
}

// ---------------------------------------------------------------------------
// Score ring SVG
// ---------------------------------------------------------------------------
function ScoreRing({ score, animate }: { score: number; animate: boolean }) {
  const radius = 54;
  const circ = 2 * Math.PI * radius;
  const fill = animate ? circ - (circ * score) / 100 : circ;
  const color = score < 50 ? '#f59e0b' : score < 70 ? '#f97316' : '#10b981';
  const label = score < 50 ? 'Bajo' : score < 70 ? 'Medio' : 'Bueno';

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${circ}`}
            strokeDashoffset={fill}
            style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-extrabold text-white leading-none">{score}</span>
          <span className="text-xs text-slate-500 mt-0.5">/ 100</span>
        </div>
      </div>
      <span
        className="mt-2 text-xs font-semibold px-3 py-1 rounded-full"
        style={{ color, background: `${color}18` }}
      >
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading animation
// ---------------------------------------------------------------------------
const LOADING_STEPS = [
  'Analizando tu negocio...',
  'Comparando con competidores...',
  'Revisando Google Business...',
  'Detectando oportunidades...',
  'Calculando potencial...',
  'Generando recomendaciones...',
];

function LoadingAnimation({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);

  useEffect(() => {
    const total = 4800;
    const step = total / LOADING_STEPS.length;
    const timers: ReturnType<typeof setTimeout>[] = [];
    LOADING_STEPS.forEach((_, i) => {
      timers.push(setTimeout(() => {
        setCurrent(i);
        if (i > 0) setCompleted((p) => [...p, i - 1]);
      }, i * step));
    });
    timers.push(setTimeout(() => {
      setCompleted(LOADING_STEPS.map((_, i) => i));
      setTimeout(onDone, 350);
    }, total + 200));
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div className="min-h-screen bg-[#07090c] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-5">
            <BarChart2 size={24} className="text-amber-400" />
          </div>
          <h2 className="text-white font-bold text-lg">Analizando tu negocio</h2>
          <p className="text-slate-500 text-sm mt-1">Comparando con la competencia en tu zona...</p>
        </div>
        <div className="space-y-4">
          {LOADING_STEPS.map((step, i) => {
            const done = completed.includes(i);
            const active = current === i && !done;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 transition-all duration-500 ${
                  done ? 'opacity-100' : active ? 'opacity-100' : 'opacity-25'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    done
                      ? 'bg-emerald-500'
                      : active
                      ? 'border-2 border-amber-400'
                      : 'border border-slate-700'
                  }`}
                >
                  {done ? (
                    <Check size={12} className="text-white" strokeWidth={3} />
                  ) : active ? (
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  ) : null}
                </div>
                <span className={`text-sm font-medium ${done ? 'text-emerald-400' : active ? 'text-white' : 'text-slate-600'}`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-10 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 rounded-full transition-all duration-500"
            style={{ width: `${(completed.length / LOADING_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Register panel
// ---------------------------------------------------------------------------
function RegisterPanel({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    track('register_click', { source: 'business_audit', method: 'email', ...getUtmParams() });
    const res = await supabase.functions.invoke('signup-instant', { body: { email, password } });
    if (res.error) {
      setError('No se pudo crear la cuenta. Inténtalo de nuevo.');
      setLoading(false);
      return;
    }
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
    if (loginErr) {
      setError('Cuenta creada. Inicia sesión desde el panel.');
      setLoading(false);
      return;
    }
    trackCompleteRegistration();
    track('register_success', { source: 'business_audit', ...getUtmParams() });
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[#0d1117] border border-slate-700/60 rounded-2xl overflow-hidden shadow-2xl">
        <div className="h-[2px] bg-gradient-to-r from-amber-500 via-emerald-400 to-teal-500" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Desbloquea tu informe completo</h2>
              <p className="text-slate-500 text-xs mt-0.5">7 días gratis · Sin tarjeta · Sin compromiso</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
              <ChevronDown size={20} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Tu email"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60 transition-colors"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña (mínimo 6 caracteres)"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-3.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60 transition-colors"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-4 rounded-xl text-sm transition-all duration-200 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
            </button>
          </form>
          <div className="flex items-center justify-center gap-4 mt-4">
            {['Gratis 7 días', 'Sin tarjeta', 'Cancela cuando quieras'].map((t) => (
              <span key={t} className="flex items-center gap-1 text-slate-600 text-[10px]">
                <Check size={10} className="text-emerald-500" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Testimonials data
// ---------------------------------------------------------------------------
const TESTIMONIALS = [
  {
    name: 'Carlos M.',
    business: 'Taller mecánico, Sevilla',
    text: 'En una semana empezamos a aparecer en búsquedas donde antes no salíamos. Las llamadas aumentaron notablemente.',
    initials: 'CM',
    color: 'from-blue-500 to-blue-600',
  },
  {
    name: 'Laura G.',
    business: 'Clínica dental, Valencia',
    text: 'Nunca pensé que optimizar el perfil de Google pudiera marcar tanta diferencia. Ahora tenemos lista de espera.',
    initials: 'LG',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    name: 'Paco R.',
    business: 'Restaurante, Madrid',
    text: 'Seguimos las recomendaciones paso a paso y en 30 días las reservas online se duplicaron. Muy recomendable.',
    initials: 'PR',
    color: 'from-amber-500 to-orange-600',
  },
];

// ---------------------------------------------------------------------------
// Category list
// ---------------------------------------------------------------------------
const CATEGORIES = [
  'Restaurante', 'Cafetería / Bar', 'Peluquería / Barbería', 'Clínica dental',
  'Centro de estética / Spa', 'Fisioterapia', 'Autoescuela',
  'Fontanería / Electricidad', 'Academia / Clases particulares', 'Tienda de ropa',
  'Frutería / Carnicería', 'Gimnasio / Pilates', 'Abogado / Gestoría',
  'Inmobiliaria', 'Taller mecánico', 'Otro',
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
type Stage = 'landing' | 'loading' | 'result';

export default function BusinessAuditLanding() {
  const [stage, setStage] = useState<Stage>('landing');
  const [business, setBusiness] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [audit, setAudit] = useState<AuditData | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [ringAnimated, setRingAnimated] = useState(false);
  const startTimeRef = useRef(0);
  const utmRef = useRef(getUtmParams());
  const gateTrackedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    track('page_view', { page: 'business_audit', ...utmRef.current });
  }, []);

  useEffect(() => {
    if (stage === 'result') {
      setTimeout(() => setRingAnimated(true), 100);
      if (!gateTrackedRef.current) {
        gateTrackedRef.current = true;
        setTimeout(() => track('gate_shown', { ...utmRef.current }), 1200);
      }
    }
  }, [stage]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!business.trim() || !city.trim() || !category) return;
      startTimeRef.current = Date.now();
      track('analysis_start', { business, city, category, ...utmRef.current });
      setStage('loading');
    },
    [business, city, category]
  );

  const handleLoadingDone = useCallback(() => {
    const data = generateAudit(business, city, category);
    setAudit(data);
    const elapsed = Date.now() - startTimeRef.current;
    track('analysis_completed', { business, city, category, elapsed_ms: elapsed, ...utmRef.current });
    setStage('result');
  }, [business, city, category]);

  const handleRegisterOpen = useCallback(() => {
    track('register_click', { source: 'business_audit', ...utmRef.current });
    setShowRegister(true);
  }, []);

  const handleRegisterSuccess = useCallback(() => {
    setShowRegister(false);
    setRegistered(true);
  }, []);

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ---------- Loading ----------
  if (stage === 'loading') {
    return <LoadingAnimation onDone={handleLoadingDone} />;
  }

  // ---------- Result ----------
  if (stage === 'result' && audit) {
    const visibleOpportunities = audit.opportunities.slice(0, 2);
    const gatedOpportunities = audit.opportunities.slice(2);

    return (
      <div className="min-h-screen bg-[#07090c] pb-28">
        {showRegister && (
          <RegisterPanel onSuccess={handleRegisterSuccess} onClose={() => setShowRegister(false)} />
        )}

        {/* Top bar */}
        <div className="border-b border-white/5 px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Zap size={13} className="text-emerald-400" />
              </div>
              <span className="text-white font-bold text-sm">LocalSEOHub</span>
            </div>
            {registered && (
              <span className="text-emerald-400 text-xs font-medium flex items-center gap-1.5">
                <Check size={12} /> Informe desbloqueado
              </span>
            )}
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pt-8 space-y-6">
          {/* Score card */}
          <div className="rounded-2xl border border-white/6 bg-white/[0.02] p-6">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-4">
              Informe de visibilidad
            </p>
            <div className="flex items-center gap-6 flex-wrap">
              <ScoreRing score={audit.score} animate={ringAnimated} />
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-white leading-tight mb-1">
                  {business}
                </h1>
                <p className="text-slate-500 text-sm mb-3">
                  {city} · {category}
                </p>
                <div
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}
                >
                  <AlertTriangle size={12} />
                  Potencial de mejora alto
                </div>
              </div>
            </div>
          </div>

          {/* Visible opportunities */}
          <div>
            <h2 className="text-white font-bold text-base mb-3">
              Oportunidades detectadas
            </h2>
            <div className="space-y-3">
              {visibleOpportunities.map((opp, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-white/6 bg-white/[0.02] p-5"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        opp.severity === 'high'
                          ? 'bg-red-500/10 border border-red-500/20'
                          : 'bg-amber-500/10 border border-amber-500/20'
                      }`}
                    >
                      <AlertTriangle
                        size={14}
                        className={opp.severity === 'high' ? 'text-red-400' : 'text-amber-400'}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-white font-semibold text-sm">{opp.title}</h3>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            opp.severity === 'high'
                              ? 'bg-red-500/15 text-red-400'
                              : 'bg-amber-500/15 text-amber-400'
                          }`}
                        >
                          {opp.severity === 'high' ? 'PRIORITARIO' : 'IMPORTANTE'}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs leading-relaxed mb-2">{opp.detail}</p>
                      <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                        <TrendingUp size={11} />
                        {opp.impact}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Potential estimate */}
          <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/5 p-5">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <TrendingUp size={14} className="text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-1">
                  Potencial estimado
                </p>
                <p className="text-slate-300 text-sm leading-relaxed">{audit.potential}</p>
              </div>
            </div>
          </div>

          {/* Gated opportunities */}
          {!registered && (
            <>
              <div className="relative space-y-3">
                {gatedOpportunities.map((opp, i) => (
                  <div
                    key={i}
                    className="rounded-2xl border border-white/4 bg-white/[0.015] p-5 relative overflow-hidden"
                  >
                    <div className="absolute inset-0 backdrop-blur-sm z-10 bg-slate-950/50 rounded-2xl" />
                    <div className="flex items-start gap-3 opacity-40 select-none">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={14} className="text-amber-400" />
                      </div>
                      <div>
                        <h3 className="text-white font-semibold text-sm mb-1">{opp.title}</h3>
                        <p className="text-slate-400 text-xs">{opp.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                  <div className="flex items-center gap-2 bg-slate-950/90 border border-slate-700/60 px-4 py-2 rounded-full">
                    <Lock size={13} className="text-slate-400" />
                    <span className="text-slate-400 text-xs font-medium">
                      {gatedOpportunities.length} recomendaciones más bloqueadas
                    </span>
                  </div>
                </div>
              </div>

              {/* Gate CTA */}
              <div className="rounded-2xl border border-white/8 bg-gradient-to-b from-white/[0.03] to-transparent p-7 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
                  <Lock size={18} className="text-emerald-400" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">
                  Tu informe completo ya está preparado.
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-sm mx-auto">
                  Regístrate gratis para desbloquear todas las recomendaciones, el{' '}
                  <span className="text-white font-medium">plan de acción personalizado</span> y las
                  herramientas IA.
                </p>
                <button
                  onClick={handleRegisterOpen}
                  className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-8 py-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5 shadow-xl shadow-emerald-500/20"
                >
                  Desbloquear informe completo
                  <ArrowRight size={15} />
                </button>
                <p className="text-slate-600 text-xs mt-4">7 días gratis · Sin compromiso</p>
              </div>
            </>
          )}

          {/* Post-register state */}
          {registered && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
              <Check size={24} className="text-emerald-400 mx-auto mb-3" />
              <h3 className="text-white font-bold mb-1">Cuenta creada con éxito</h3>
              <p className="text-slate-400 text-sm mb-4">
                Accede a tu panel para ver el plan completo y empezar a aplicar las mejoras.
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-6 py-3 rounded-xl transition-colors"
              >
                Ir a mi panel <ArrowRight size={14} />
              </a>
            </div>
          )}
        </div>

        {/* Fixed bottom CTA */}
        {!registered && (
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-[#07090c]/92 backdrop-blur-xl border-t border-white/5 px-4 py-4">
            <div className="max-w-2xl mx-auto flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  Informe completo listo
                </p>
                <p className="text-slate-500 text-xs">7 días gratis · sin compromiso</p>
              </div>
              <button
                onClick={handleRegisterOpen}
                className="flex-shrink-0 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-5 py-3 rounded-xl transition-all flex items-center gap-1.5"
              >
                Desbloquear <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- Landing page ----------
  return (
    <div className="min-h-screen bg-[#07090c] text-white">

      {/* ===== HERO ===== */}
      <section className="min-h-[100svh] flex flex-col items-center justify-center px-4 pt-12 pb-8 sm:pt-20 sm:pb-12 relative overflow-hidden">
        {/* Background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-amber-500/6 blur-[120px] pointer-events-none" />

        <div className="relative z-10 w-full max-w-xl text-center">
          {/* Urgency pill */}
          <div className="inline-flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold px-4 py-2 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            Negocios de tu zona ya están aplicando esto
          </div>

          {/* Headline */}
          <h1 className="text-[clamp(30px,7vw,56px)] font-extrabold leading-[1.08] tracking-tight mb-5">
            ¿Estás perdiendo{' '}
            <span className="relative inline-block">
              <span className="text-amber-400">clientes</span>
            </span>{' '}
            sin saberlo?
          </h1>

          {/* Subheadline */}
          <p className="text-slate-400 text-base sm:text-lg leading-relaxed mb-8 max-w-lg mx-auto">
            Analiza gratuitamente tu negocio y descubre por qué otros aparecen antes que tú en Google
            y qué puedes hacer para conseguir más{' '}
            <span className="text-slate-200">llamadas, visitas y reservas.</span>
          </p>

          {/* Trust trio */}
          <div className="flex items-center justify-center gap-5 flex-wrap mb-8">
            {[
              { label: 'Gratis' },
              { label: 'En menos de 60 segundos' },
              { label: 'Sin conocimientos de SEO' },
            ].map(({ label }) => (
              <span key={label} className="flex items-center gap-1.5 text-slate-400 text-sm">
                <Check size={14} className="text-emerald-400 flex-shrink-0" />
                {label}
              </span>
            ))}
          </div>

          {/* CTA */}
          <button
            onClick={scrollToForm}
            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-8 py-4 rounded-xl text-base transition-all duration-200 hover:-translate-y-0.5 shadow-2xl shadow-emerald-500/20 mb-4"
          >
            Quiero mi análisis gratuito
            <ArrowRight size={17} />
          </button>

          {/* Social proof */}
          <div className="flex items-center justify-center gap-1 mt-2">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={13} fill="currentColor" className="text-amber-400" />
            ))}
            <span className="text-slate-500 text-xs ml-2">Valorado por cientos de negocios locales</span>
          </div>
        </div>
      </section>

      {/* ===== SECTION 2 — URGENCY ===== */}
      <section className="px-4 py-16 sm:py-24 border-t border-white/4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight mb-3">
            Cada día que no optimizas tu presencia online...
          </h2>
          <p className="text-slate-400 text-base sm:text-lg mb-12">
            ...otros negocios reciben los clientes que podrían ser tuyos.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                icon: Phone,
                color: 'text-emerald-400',
                bg: 'bg-emerald-500/8 border-emerald-500/15',
                title: 'Más llamadas',
                desc: 'Clientes que buscan exactamente lo que ofreces y te encuentran a ti primero.',
              },
              {
                icon: MapPin,
                color: 'text-blue-400',
                bg: 'bg-blue-500/8 border-blue-500/15',
                title: 'Más visibilidad',
                desc: 'Aparece en las búsquedas locales donde hoy aparecen tus competidores.',
              },
              {
                icon: Star,
                color: 'text-amber-400',
                bg: 'bg-amber-500/8 border-amber-500/15',
                title: 'Más confianza',
                desc: 'Una presencia online cuidada convierte visitas en clientes recurrentes.',
              },
            ].map(({ icon: Icon, color, bg, title, desc }) => (
              <div
                key={title}
                className={`rounded-2xl border p-6 text-left ${bg} hover:scale-[1.02] transition-transform duration-200`}
              >
                <div className={`w-10 h-10 rounded-xl ${bg} border flex items-center justify-center mb-4`}>
                  <Icon size={18} className={color} />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SECTION 3 — HOW IT WORKS ===== */}
      <section className="px-4 py-16 sm:py-24 border-t border-white/4">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-3">
            Proceso
          </p>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-12">
            ¿Cómo funciona?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                step: '1',
                icon: Users,
                title: 'Introduce tu negocio',
                desc: 'Nombre, ciudad y categoría. Nada más.',
              },
              {
                step: '2',
                icon: BarChart2,
                title: 'La IA analiza tu presencia',
                desc: 'Comparamos tu negocio con la competencia en tiempo real.',
              },
              {
                step: '3',
                icon: TrendingUp,
                title: 'Recibes un plan personalizado',
                desc: 'Acciones prioritarias ordenadas por impacto para tu sector y ciudad.',
              },
            ].map(({ step, icon: Icon, title, desc }) => (
              <div key={step} className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/8 flex items-center justify-center mb-4 relative">
                  <Icon size={24} className="text-slate-300" />
                  <span className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-extrabold flex items-center justify-center">
                    {step}
                  </span>
                </div>
                <h3 className="text-white font-bold mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="px-4 py-16 sm:py-24 border-t border-white/4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
              Casos reales
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
              Lo que dicen otros negocios
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-white/6 bg-white/[0.02] p-5 flex flex-col"
              >
                <div className="flex items-center gap-0.5 mb-3">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={12} fill="currentColor" className="text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed flex-1 mb-4">
                  "{t.text}"
                </p>
                <div className="flex items-center gap-2.5 mt-auto">
                  <div
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}
                  >
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-white text-xs font-semibold">{t.name}</p>
                    <p className="text-slate-600 text-[10px]">{t.business}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FORM ===== */}
      <section className="px-4 py-16 sm:py-24 border-t border-white/4" id="form-section">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <p className="text-xs font-semibold text-emerald-400 uppercase tracking-widest mb-2">
              Empieza ahora
            </p>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-3">
              Analiza tu negocio gratis
            </h2>
            <p className="text-slate-500 text-sm">
              En menos de 60 segundos tendrás tu informe personalizado.
            </p>
          </div>

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              required
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              placeholder="Nombre de tu negocio"
              className="w-full bg-white/[0.04] border border-white/8 rounded-xl px-4 py-4 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/50 transition-colors"
            />
            <input
              type="text"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ciudad"
              className="w-full bg-white/[0.04] border border-white/8 rounded-xl px-4 py-4 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/50 transition-colors"
            />
            <div className="relative">
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full appearance-none bg-white/[0.04] border border-white/8 rounded-xl px-4 py-4 text-sm outline-none focus:border-emerald-500/50 transition-colors cursor-pointer"
                style={{ color: category ? 'white' : 'rgb(75 85 99)' }}
              >
                <option value="" disabled style={{ color: 'rgb(75 85 99)' }}>Categoría de tu negocio</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} style={{ color: 'white', background: '#0d1117' }}>{c}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-4 rounded-xl text-sm transition-all duration-200 hover:-translate-y-0.5 shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <BarChart2 size={16} />
              Analizar mi negocio
            </button>
          </form>

          <p className="text-center text-slate-600 text-xs mt-4">
            Gratis · Sin tarjeta · Resultados en menos de 60 segundos
          </p>
        </div>
      </section>

      {/* ===== GUARANTEES ===== */}
      <section className="px-4 py-12 border-t border-white/4">
        <div className="max-w-2xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
            {[
              { icon: Clock, title: '7 días gratis', desc: 'No cobramos nada durante los primeros 7 días.' },
              { icon: Zap, title: 'Sin compromiso', desc: 'Puedes cancelar cuando quieras, sin penalizaciones.' },
              { icon: Shield, title: 'Datos protegidos', desc: 'Tu información nunca se comparte con terceros.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex flex-col items-center">
                <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/8 flex items-center justify-center mb-3">
                  <Icon size={18} className="text-slate-400" />
                </div>
                <h4 className="text-white font-semibold text-sm mb-1">{title}</h4>
                <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FOOTER MICRO ===== */}
      <div className="border-t border-white/4 px-4 py-6 text-center">
        <p className="text-slate-700 text-xs">
          © {new Date().getFullYear()} LocalSEOHub · Todos los derechos reservados
        </p>
      </div>

      {/* Fixed bottom CTA on mobile */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-[#07090c]/95 backdrop-blur-xl border-t border-white/6 px-4 py-3">
        <button
          onClick={scrollToForm}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
        >
          <BarChart2 size={15} />
          Quiero mi análisis gratuito
        </button>
      </div>
    </div>
  );
}
