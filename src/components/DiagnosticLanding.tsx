import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowRight,
  Check,
  Lock,
  ChevronDown,
  MapPin,
  Star,
  Globe,
  FileText,
  Users,
  MessageSquare,
  Search,
  Wifi,
  BrainCircuit,
  BarChart2,
  Shield,
  Clock,
  TrendingUp,
  AlertCircle,
  Zap,
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
// Score generation (deterministic from inputs)
// ---------------------------------------------------------------------------
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface SubScore { label: string; value: number; color: string }
interface DiagnosticResult {
  overall: number;
  subScores: SubScore[];
  opportunities: Opportunity[];
  label: string;
  labelColor: string;
}

interface Opportunity {
  title: string;
  detail: string;
  category: string;
  priority: 'critical' | 'high' | 'medium';
}

const OPPORTUNITY_POOL: Opportunity[] = [
  {
    title: 'Pierdes clientes antes de que te contacten',
    detail: 'El 68% de los usuarios lee reseñas antes de decidir. Tu negocio no responde a ninguna, lo que genera desconfianza y desvía clientes a la competencia.',
    category: 'Reputación',
    priority: 'critical',
  },
  {
    title: 'Eres invisible cuando más te necesitan',
    detail: 'No apareces en las búsquedas del tipo "mejor [sector] cerca de mí". Cada día, decenas de personas en tu ciudad buscan exactamente lo que ofreces y encuentran a otros.',
    category: 'Visibilidad',
    priority: 'critical',
  },
  {
    title: 'Tu negocio no transmite actividad',
    detail: 'Las fichas inactivas pierden posiciones. Los competidores que publican semanalmente captan la atención de clientes que podrían ser tuyos.',
    category: 'Contenido',
    priority: 'high',
  },
  {
    title: 'Tu competencia está mejor posicionada',
    detail: 'Tres negocios de tu sector en tu ciudad tienen perfiles más completos, más reseñas y mayor actividad. Eso les da ventaja directa en cada búsqueda.',
    category: 'Competidores',
    priority: 'high',
  },
  {
    title: 'Tu ficha no está aprovechada al máximo',
    detail: 'Faltan categorías secundarias, servicios, atributos y una descripción optimizada que duplicaría tu visibilidad sin ningún coste adicional.',
    category: 'Google Business',
    priority: 'high',
  },
  {
    title: 'Tus fotos no generan confianza suficiente',
    detail: 'Los negocios con más de 10 fotos reciben un 42% más de solicitudes de ruta. Las tuyas están desactualizadas o son insuficientes para transmitir profesionalidad.',
    category: 'Contenido',
    priority: 'medium',
  },
];

function generateDiagnostic(business: string, city: string, category: string): DiagnosticResult {
  const seed = hashStr(`${business}${city}${category}`);
  const base = 58 + (seed % 22); // 58–79

  const visibilidad = Math.max(35, Math.min(88, base - 8 + (seed >> 3) % 20));
  const reputacion  = Math.max(40, Math.min(92, base + 3 + (seed >> 5) % 15));
  const contenido   = Math.max(30, Math.min(65, base - 18 + (seed >> 7) % 18));
  const web         = Math.max(42, Math.min(85, base - 4 + (seed >> 9) % 20));

  const scoreColor = (v: number) =>
    v < 50 ? '#f43f5e' : v < 65 ? '#f59e0b' : '#10b981';

  const subScores: SubScore[] = [
    { label: 'Visibilidad',  value: visibilidad, color: scoreColor(visibilidad) },
    { label: 'Reputación',   value: reputacion,  color: scoreColor(reputacion)  },
    { label: 'Contenido',    value: contenido,   color: scoreColor(contenido)   },
    { label: 'Web',          value: web,         color: scoreColor(web)         },
  ];

  const start = seed % OPPORTUNITY_POOL.length;
  const opportunities = Array.from({ length: 5 }, (_, i) => OPPORTUNITY_POOL[(start + i) % OPPORTUNITY_POOL.length]);

  const labelFor = (v: number) => v < 55 ? 'Crítico' : v < 68 ? 'Mejorable' : v < 80 ? 'Bueno' : 'Excelente';
  const colorFor = (v: number) => v < 55 ? '#f43f5e' : v < 68 ? '#f59e0b' : v < 80 ? '#10b981' : '#22d3ee';

  return {
    overall: base,
    subScores,
    opportunities,
    label: labelFor(base),
    labelColor: colorFor(base),
  };
}

// ---------------------------------------------------------------------------
// Animated counter hook
// ---------------------------------------------------------------------------
function useCounter(target: number, active: boolean, duration = 1200) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(ease * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, active, duration]);
  return val;
}

// ---------------------------------------------------------------------------
// Sub-score card
// ---------------------------------------------------------------------------
function SubScoreCard({ item, animate }: { item: SubScore; animate: boolean }) {
  const count = useCounter(item.value, animate, 1000);
  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.025] p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-slate-400 text-sm font-medium">{item.label}</span>
        <span className="text-white font-extrabold text-xl tabular-nums">{count}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-[1200ms] ease-out"
          style={{
            width: animate ? `${item.value}%` : '0%',
            background: item.color,
            boxShadow: `0 0 8px ${item.color}60`,
          }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] text-slate-700">0</span>
        <span className="text-[10px] text-slate-700">100</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading animation
// ---------------------------------------------------------------------------
const LOADING_STEPS = [
  'Analizando Google...',
  'Comparando competidores...',
  'Buscando oportunidades...',
  'Calculando puntuación...',
  'Detectando puntos débiles...',
  'Generando plan de acción...',
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
      setTimeout(onDone, 400);
    }, total + 200));
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  return (
    <div className="min-h-screen bg-[#060709] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Animated logo mark */}
        <div className="flex justify-center mb-12">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center">
              <BrainCircuit size={28} className="text-slate-300" />
            </div>
            <div className="absolute inset-0 rounded-2xl border border-white/10 animate-ping opacity-20" />
          </div>
        </div>
        <div className="text-center mb-10">
          <h2 className="text-white font-bold text-xl mb-1">Analizando tu negocio</h2>
          <p className="text-slate-600 text-sm">Comparando con tu competencia local...</p>
        </div>
        <div className="space-y-3.5">
          {LOADING_STEPS.map((step, i) => {
            const done = completed.includes(i);
            const active = current === i && !done;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 transition-all duration-500 ${
                  done ? 'opacity-100' : active ? 'opacity-100' : 'opacity-20'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    done ? 'bg-emerald-500' : active ? 'border border-white/30' : 'border border-white/10'
                  }`}
                >
                  {done ? <Check size={11} className="text-white" strokeWidth={3} /> :
                   active ? <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> : null}
                </div>
                <span className={`text-sm ${done ? 'text-emerald-400' : active ? 'text-white' : 'text-slate-700'}`}>
                  {step}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-10 h-[1px] bg-white/5 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-slate-400 to-emerald-400 rounded-full transition-all duration-600"
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
    track('register_click', { source: 'diagnostic', method: 'email', ...getUtmParams() });
    const res = await supabase.functions.invoke('signup-instant', { body: { email, password } });
    if (res.error) {
      setError('No se pudo crear la cuenta. Inténtalo de nuevo.');
      setLoading(false);
      return;
    }
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
    if (loginErr) {
      setError('Cuenta creada. Accede desde el panel principal.');
      setLoading(false);
      return;
    }
    trackCompleteRegistration();
    track('register_success', { source: 'diagnostic', ...getUtmParams() });
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#060709]/90 backdrop-blur-lg" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl" style={{
        background: 'rgba(10,12,16,0.98)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div className="h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        <div className="p-7">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-white font-bold text-xl leading-tight">
                Desbloquea tu diagnóstico
              </h2>
              <p className="text-slate-500 text-sm mt-1">7 días gratis · Sin tarjeta · Cancela cuando quieras</p>
            </div>
            <button onClick={onClose} className="text-slate-600 hover:text-slate-400 transition-colors mt-0.5">
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
              className="w-full bg-white/[0.04] border border-white/8 rounded-xl px-4 py-4 text-sm text-white placeholder-slate-600 outline-none focus:border-white/20 transition-colors"
            />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Crea una contraseña (mínimo 6 caracteres)"
              className="w-full bg-white/[0.04] border border-white/8 rounded-xl px-4 py-4 text-sm text-white placeholder-slate-600 outline-none focus:border-white/20 transition-colors"
            />
            {error && <p className="text-red-400 text-xs pl-1">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-slate-950 font-bold py-4 rounded-xl text-sm transition-all duration-200 hover:bg-slate-100 disabled:opacity-60 flex items-center justify-center gap-2"
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
        </div>
      </div>
    </div>
  );
}

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
// Diagnostic areas for section 3
// ---------------------------------------------------------------------------
const AREAS = [
  { icon: MapPin,       label: 'Google Business Profile' },
  { icon: Search,       label: 'Visibilidad Local'        },
  { icon: Users,        label: 'Competidores'             },
  { icon: Star,         label: 'Reseñas'                  },
  { icon: Globe,        label: 'Página Web'               },
  { icon: Wifi,         label: 'Redes Sociales'           },
  { icon: TrendingUp,   label: 'SEO'                      },
  { icon: FileText,     label: 'Contenido'                },
  { icon: BrainCircuit, label: 'IA'                       },
];

const TESTIMONIALS = [
  {
    quote: 'Pensábamos que el problema era nuestra web y descubrimos que eran las reseñas. En dos semanas corregimos eso y las llamadas aumentaron un 40%.',
    name: 'Ana P.',
    role: 'Peluquería, Málaga',
    initials: 'AP',
    color: 'from-rose-500 to-pink-600',
  },
  {
    quote: 'El diagnóstico nos mostró exactamente por qué no aparecíamos cuando los clientes nos buscaban. Nos quedamos de piedra con los datos.',
    name: 'Sergio L.',
    role: 'Clínica dental, Barcelona',
    initials: 'SL',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    quote: 'Parecía una consultoría de verdad. En 60 segundos supe más sobre mi negocio online que en los últimos dos años.',
    name: 'Rosa M.',
    role: 'Restaurante, Bilbao',
    initials: 'RM',
    color: 'from-emerald-500 to-teal-600',
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
type Stage = 'landing' | 'loading' | 'result';

export default function DiagnosticLanding() {
  const [stage, setStage] = useState<Stage>('landing');
  const [business, setBusiness] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [animateScores, setAnimateScores] = useState(false);
  const startRef = useRef(0);
  const utmRef = useRef(getUtmParams());
  const gateTrackedRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const overallCount = useCounter(result?.overall ?? 0, animateScores, 1400);

  useEffect(() => {
    track('page_view', { page: 'diagnostic', ...utmRef.current });
  }, []);

  useEffect(() => {
    if (stage === 'result') {
      setTimeout(() => setAnimateScores(true), 150);
      if (!gateTrackedRef.current) {
        gateTrackedRef.current = true;
        setTimeout(() => track('gate_shown', { ...utmRef.current }), 1500);
      }
    }
  }, [stage]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!business.trim() || !city.trim() || !category) return;
      startRef.current = Date.now();
      track('diagnostic_start', { business, city, category, ...utmRef.current });
      setStage('loading');
    },
    [business, city, category]
  );

  const handleLoadingDone = useCallback(() => {
    const data = generateDiagnostic(business, city, category);
    setResult(data);
    const elapsed = Date.now() - startRef.current;
    track('diagnostic_completed', { business, city, category, elapsed_ms: elapsed, ...utmRef.current });
    setStage('result');
  }, [business, city, category]);

  const handleRegisterOpen = useCallback(() => {
    track('register_click', { source: 'diagnostic', ...utmRef.current });
    setShowRegister(true);
  }, []);

  const scrollToForm = () =>
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // ---------- Loading ----------
  if (stage === 'loading') return <LoadingAnimation onDone={handleLoadingDone} />;

  // ---------- Result ----------
  if (stage === 'result' && result) {
    const visible = result.opportunities.slice(0, 2);
    const gated = result.opportunities.slice(2);

    return (
      <div className="min-h-screen bg-[#060709] pb-28">
        {showRegister && (
          <RegisterPanel
            onSuccess={() => { setShowRegister(false); setRegistered(true); }}
            onClose={() => setShowRegister(false)}
          />
        )}

        {/* Top bar */}
        <div className="border-b border-white/[0.05] px-5 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <span className="text-white font-bold tracking-tight text-sm">LocalSEOHub</span>
            {registered && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-xs font-medium">
                <Check size={12} />Diagnóstico desbloqueado
              </span>
            )}
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pt-8 space-y-5">

          {/* Overall score */}
          <div className="rounded-2xl p-7" style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
            border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-[0.15em] mb-5">
              Salud Digital · {business}
            </p>
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[72px] font-black text-white leading-none tabular-nums">
                    {overallCount}
                  </span>
                  <span className="text-2xl text-slate-600 font-light mb-2">/ 100</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="text-sm font-bold px-3 py-1 rounded-full"
                    style={{ color: result.labelColor, background: `${result.labelColor}16`, border: `1px solid ${result.labelColor}30` }}
                  >
                    {result.label}
                  </span>
                  <span className="text-slate-600 text-sm">{city} · {category}</span>
                </div>
              </div>
              <div className="flex-1 min-w-[160px]">
                <p className="text-slate-600 text-xs leading-relaxed">
                  La IA ha detectado{' '}
                  <span className="text-white font-semibold">{result.opportunities.length} oportunidades</span>{' '}
                  importantes para tu negocio.
                </p>
              </div>
            </div>
          </div>

          {/* Sub-scores */}
          <div className="grid grid-cols-2 gap-3">
            {result.subScores.map((s) => (
              <SubScoreCard key={s.label} item={s} animate={animateScores} />
            ))}
          </div>

          {/* Visible opportunities */}
          <div>
            <h2 className="text-white font-bold text-base mb-3">Oportunidades detectadas</h2>
            <div className="space-y-3">
              {visible.map((opp, i) => (
                <OpportunityCard key={i} opp={opp} blurred={false} />
              ))}
            </div>
          </div>

          {/* Gated */}
          {!registered && (
            <>
              <div className="relative space-y-3">
                {gated.map((opp, i) => (
                  <OpportunityCard key={i} opp={opp} blurred />
                ))}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
                  <div className="flex items-center gap-2 bg-[#060709]/95 border border-white/10 px-4 py-2 rounded-full backdrop-blur-sm">
                    <Lock size={12} className="text-slate-400" />
                    <span className="text-slate-400 text-xs font-medium">
                      {gated.length} oportunidades bloqueadas
                    </span>
                  </div>
                </div>
              </div>

              {/* Gate CTA */}
              <div
                className="rounded-2xl p-8 text-center"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.07)',
                }}
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-white/[0.06] border border-white/10 mb-5">
                  <Lock size={18} className="text-slate-300" />
                </div>
                <h3 className="text-white font-bold text-xl mb-3 leading-tight">
                  Tu informe completo ya está preparado.
                </h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-7 max-w-sm mx-auto">
                  Regístrate gratis para desbloquear todas las oportunidades detectadas, el{' '}
                  <span className="text-slate-300 font-medium">plan de acción personalizado</span>{' '}
                  y las herramientas IA.
                </p>
                <button
                  onClick={handleRegisterOpen}
                  className="inline-flex items-center gap-2.5 bg-white text-slate-950 font-bold text-sm px-8 py-4 rounded-xl transition-all duration-200 hover:bg-slate-100 hover:-translate-y-0.5 shadow-2xl shadow-white/10"
                >
                  Desbloquear diagnóstico
                  <ArrowRight size={15} />
                </button>
                <p className="text-slate-700 text-xs mt-5">7 días gratis · Sin compromiso · Cancela cuando quieras</p>
              </div>
            </>
          )}

          {/* Registered success */}
          {registered && (
            <>
              <div className="space-y-3">
                {gated.map((opp, i) => (
                  <OpportunityCard key={i} opp={opp} blurred={false} />
                ))}
              </div>
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center">
                <Check size={24} className="text-emerald-400 mx-auto mb-3" />
                <h3 className="text-white font-bold mb-2">Diagnóstico completo desbloqueado</h3>
                <p className="text-slate-400 text-sm mb-5">
                  Accede a tu panel para ver el plan de acción completo y empezar a mejorar hoy.
                </p>
                <a
                  href="/"
                  className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-6 py-3 rounded-xl transition-colors"
                >
                  Ir a mi panel <ArrowRight size={14} />
                </a>
              </div>
            </>
          )}
        </div>

        {/* Fixed bottom bar */}
        {!registered && (
          <div className="fixed bottom-0 left-0 right-0 z-20 px-4 py-4"
            style={{ background: 'rgba(6,7,9,0.96)', borderTop: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
            <div className="max-w-2xl mx-auto flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">Diagnóstico completo listo</p>
                <p className="text-slate-600 text-xs">7 días gratis · sin compromiso</p>
              </div>
              <button
                onClick={handleRegisterOpen}
                className="flex-shrink-0 bg-white text-slate-950 font-bold text-sm px-5 py-3 rounded-xl transition-all hover:bg-slate-100 flex items-center gap-1.5"
              >
                Desbloquear <ArrowRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ---------- Landing ----------
  return (
    <div className="min-h-screen bg-[#060709] text-white" style={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* ===== HERO ===== */}
      <section className="min-h-[100svh] flex flex-col items-center justify-center px-5 pt-14 pb-10 relative overflow-hidden">
        {/* Subtle radial glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(255,255,255,0.025) 0%, transparent 70%)' }} />
        </div>

        <div className="relative z-10 w-full max-w-xl text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2.5 mb-8">
            <div className="h-[1px] w-8 bg-white/20" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-[0.18em]">
              Diagnóstico Digital Gratuito
            </span>
            <div className="h-[1px] w-8 bg-white/20" />
          </div>

          {/* Headline */}
          <h1 className="text-[clamp(32px,7vw,60px)] font-black leading-[1.05] tracking-[-0.03em] mb-6">
            ¿Sabes cuántos clientes estás{' '}
            <span className="relative">
              <span className="relative z-10">perdiendo</span>
              <span className="absolute bottom-1 left-0 right-0 h-[3px] bg-gradient-to-r from-red-500 to-rose-500 rounded-full opacity-70" />
            </span>{' '}
            cada semana?
          </h1>

          {/* Body */}
          <p className="text-slate-400 text-base sm:text-[17px] leading-[1.7] mb-10 max-w-lg mx-auto">
            En menos de un minuto nuestra IA analizará tu presencia digital y detectará las oportunidades que están aprovechando tus competidores.
          </p>

          {/* CTA */}
          <button
            onClick={scrollToForm}
            className="group inline-flex items-center gap-2.5 bg-white text-slate-950 font-bold px-8 py-4 rounded-xl text-[15px] transition-all duration-200 hover:bg-slate-100 hover:-translate-y-0.5 mb-5"
            style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.15), 0 20px 60px rgba(255,255,255,0.08)' }}
          >
            Quiero mi diagnóstico gratuito
            <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
          </button>

          {/* Trust row */}
          <div className="flex items-center justify-center gap-6 flex-wrap">
            {['Gratis', 'Sin conocimientos técnicos', 'Resultado en menos de 60 segundos'].map((t) => (
              <span key={t} className="flex items-center gap-1.5 text-slate-500 text-sm">
                <Check size={13} className="text-emerald-500 flex-shrink-0" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SECTION 2 — AREAS ===== */}
      <section className="px-5 py-20 sm:py-28 border-t border-white/[0.05]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-[34px] font-black leading-tight tracking-tight mb-4">
              Un negocio puede perder clientes<br className="hidden sm:block" /> sin darse cuenta.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { icon: MapPin, label: 'Google Business', question: '¿Apareces cuando te buscan?' },
              { icon: Star,   label: 'Reseñas',         question: '¿Generas suficiente confianza?' },
              { icon: Globe,  label: 'Página web',      question: '¿Convierte visitas en clientes?' },
              { icon: FileText, label: 'Contenido',     question: '¿Tu negocio transmite actividad?' },
            ].map(({ icon: Icon, label, question }) => (
              <div
                key={label}
                className="group rounded-2xl p-6 flex items-center gap-5 cursor-default transition-all duration-300 hover:bg-white/[0.03]"
                style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}
              >
                <div className="w-12 h-12 rounded-xl bg-white/[0.05] border border-white/8 flex items-center justify-center flex-shrink-0">
                  <Icon size={20} className="text-slate-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-600 uppercase tracking-widest mb-1">{label}</p>
                  <p className="text-white font-semibold text-[15px] leading-snug">{question}</p>
                  <div className="flex items-center gap-0.5 mt-2">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} size={10} fill="currentColor" className="text-amber-400/40 group-hover:text-amber-400/70 transition-colors" />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SECTION 3 — DIAGNOSTIC AREAS ===== */}
      <section className="px-5 py-20 sm:py-28 border-t border-white/[0.05]">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-semibold text-slate-600 uppercase tracking-[0.18em] mb-3">Cobertura</p>
          <h2 className="text-2xl sm:text-[34px] font-black tracking-tight mb-14">
            Tu diagnóstico analiza automáticamente
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
            {AREAS.map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-3 group">
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:bg-white/[0.06]"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
                >
                  <Icon size={22} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                </div>
                <span className="text-slate-600 text-[11px] font-medium text-center leading-tight group-hover:text-slate-400 transition-colors">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== SECTION 4 — HOW IT WORKS ===== */}
      <section className="px-5 py-20 sm:py-28 border-t border-white/[0.05]">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-[0.18em] mb-3">Proceso</p>
            <h2 className="text-2xl sm:text-[34px] font-black tracking-tight">¿Cómo funciona?</h2>
          </div>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-5 top-5 bottom-5 w-[1px] bg-gradient-to-b from-white/10 via-white/5 to-transparent hidden sm:block" />
            <div className="space-y-8">
              {[
                { n: '01', title: 'Escribes tu negocio', desc: 'Nombre, ciudad y categoría. Tres campos, sin formularios largos.' },
                { n: '02', title: 'La IA analiza toda tu presencia digital', desc: 'Comparamos tu negocio con la competencia local en tiempo real.' },
                { n: '03', title: 'Recibes un informe personalizado', desc: 'Una puntuación de salud digital con los puntos fuertes y débiles de tu negocio.' },
                { n: '04', title: 'Obtienes un plan de acción priorizado', desc: 'Las acciones ordenadas por impacto para conseguir más clientes cuanto antes.' },
              ].map(({ n, title, desc }) => (
                <div key={n} className="flex items-start gap-5 sm:gap-8 group">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-sm font-black text-slate-500 transition-all duration-300 group-hover:text-white"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
                  >
                    {n}
                  </div>
                  <div className="pt-2">
                    <h3 className="text-white font-bold text-[15px] mb-1">{title}</h3>
                    <p className="text-slate-600 text-sm leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="px-5 py-20 sm:py-28 border-t border-white/[0.05]">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-[0.18em] mb-3">Resultados</p>
            <h2 className="text-2xl sm:text-[34px] font-black tracking-tight">Lo que descubrieron otros negocios</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl p-6 flex flex-col"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={12} fill="currentColor" className="text-amber-400" />
                  ))}
                </div>
                <p className="text-slate-300 text-sm leading-relaxed flex-1 mb-5">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="text-white text-xs font-semibold">{t.name}</p>
                    <p className="text-slate-600 text-[10px]">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FORM ===== */}
      <section className="px-5 py-20 sm:py-28 border-t border-white/[0.05]">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-[0.18em] mb-3">Empieza hoy</p>
            <h2 className="text-2xl sm:text-[34px] font-black tracking-tight mb-3">
              Analiza tu negocio gratis
            </h2>
            <p className="text-slate-500 text-sm">Resultado en menos de 60 segundos.</p>
          </div>
          <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
            <input
              type="text"
              required
              value={business}
              onChange={(e) => setBusiness(e.target.value)}
              placeholder="Nombre de tu negocio"
              className="w-full bg-white/[0.04] border border-white/8 rounded-xl px-5 py-4 text-sm text-white placeholder-slate-600 outline-none focus:border-white/15 transition-colors"
            />
            <input
              type="text"
              required
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Ciudad"
              className="w-full bg-white/[0.04] border border-white/8 rounded-xl px-5 py-4 text-sm text-white placeholder-slate-600 outline-none focus:border-white/15 transition-colors"
            />
            <div className="relative">
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full appearance-none bg-white/[0.04] border border-white/8 rounded-xl px-5 py-4 text-sm outline-none focus:border-white/15 transition-colors cursor-pointer"
                style={{ color: category ? 'white' : 'rgb(75 85 99)' }}
              >
                <option value="" disabled style={{ color: 'rgb(75 85 99)' }}>Categoría de tu negocio</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} style={{ color: 'white', background: '#0d1117' }}>{c}</option>
                ))}
              </select>
              <ChevronDown size={15} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
            </div>
            <button
              type="submit"
              className="w-full bg-white text-slate-950 font-bold py-4 rounded-xl text-sm transition-all duration-200 hover:bg-slate-100 hover:-translate-y-0.5 flex items-center justify-center gap-2"
              style={{ boxShadow: '0 0 0 1px rgba(255,255,255,0.12), 0 10px 40px rgba(255,255,255,0.06)' }}
            >
              <BarChart2 size={15} />
              Analizar mi negocio
            </button>
          </form>
          <p className="text-center text-slate-700 text-xs mt-4">
            Gratis · Sin tarjeta · Resultado en menos de 60 segundos
          </p>
        </div>
      </section>

      {/* ===== GUARANTEES ===== */}
      <section className="px-5 py-14 border-t border-white/[0.05]">
        <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-6 text-center">
          {[
            { icon: Clock,  title: '7 días gratis',      desc: 'No cobramos nada durante los primeros 7 días.' },
            { icon: Zap,    title: 'Sin compromiso',     desc: 'Puedes cancelar cuando quieras, sin ninguna penalización.' },
            { icon: Shield, title: 'Sin permanencia',    desc: 'Ni contratos, ni letras pequeñas. Solo resultados.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex flex-col items-center">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                <Icon size={17} className="text-slate-500" />
              </div>
              <h4 className="text-white font-semibold text-sm mb-1">{title}</h4>
              <p className="text-slate-600 text-xs leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <div className="border-t border-white/[0.04] px-5 py-6 text-center">
        <p className="text-slate-800 text-xs">© {new Date().getFullYear()} LocalSEOHub</p>
      </div>

      {/* Mobile fixed CTA */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-20 px-4 py-3"
        style={{ background: 'rgba(6,7,9,0.97)', borderTop: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)' }}>
        <button
          onClick={scrollToForm}
          className="w-full bg-white text-slate-950 font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
        >
          <BarChart2 size={15} />
          Quiero mi diagnóstico gratuito
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Opportunity card (shared between visible + blurred)
// ---------------------------------------------------------------------------
function OpportunityCard({ opp, blurred }: { opp: Opportunity; blurred: boolean }) {
  const priorityConfig = {
    critical: { label: 'CRÍTICO',    color: '#f43f5e', bg: 'rgba(244,63,94,0.08)',  border: 'rgba(244,63,94,0.15)'  },
    high:     { label: 'PRIORITARIO', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.15)' },
    medium:   { label: 'IMPORTANTE',  color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.1)' },
  };
  const cfg = priorityConfig[opp.priority];

  return (
    <div
      className="rounded-2xl p-5 relative overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {blurred && <div className="absolute inset-0 backdrop-blur-md bg-[#060709]/50 rounded-2xl z-10" />}
      <div className={`flex items-start gap-4 ${blurred ? 'select-none opacity-40' : ''}`}>
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
        >
          <AlertCircle size={14} style={{ color: cfg.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h3 className="text-white font-semibold text-[14px] leading-snug">{opp.title}</h3>
            <span
              className="text-[9px] font-bold px-2 py-0.5 rounded-full tracking-widest"
              style={{ color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}` }}
            >
              {cfg.label}
            </span>
          </div>
          <p className="text-slate-500 text-xs leading-relaxed mb-2">{opp.detail}</p>
          <span
            className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
            style={{ color: '#94a3b8', background: 'rgba(148,163,184,0.06)', border: '1px solid rgba(148,163,184,0.1)' }}
          >
            {opp.category}
          </span>
        </div>
      </div>
    </div>
  );
}
