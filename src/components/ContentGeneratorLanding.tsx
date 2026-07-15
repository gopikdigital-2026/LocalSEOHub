import { useState, useEffect, useRef, useCallback } from 'react';
import { Copy, Check, Lock, ChevronDown, Star, Clock, Zap, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { trackCompleteRegistration } from '../lib/pixel';

// ---------------------------------------------------------------------------
// UTM / tracking helpers
// ---------------------------------------------------------------------------
function getUtmParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    utm_source: p.get('utm_source') ?? undefined,
    utm_campaign: p.get('utm_campaign') ?? undefined,
    fbclid: p.get('fbclid') ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Content generation helpers (client-side, no AI call needed for preview)
// ---------------------------------------------------------------------------
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

interface Post {
  day: string;
  title: string;
  body: string;
  hashtags: string[];
}

function generatePosts(business: string, city: string, category: string): Post[] {
  const b = business.trim();
  const c = city.trim();
  const cat = category.trim().toLowerCase();

  const templates: Array<{ title: string; body: (b: string, c: string, cat: string) => string; tags: string[] }> = [
    {
      title: '¿Sabías que...?',
      body: (b, c, cat) =>
        `En ${c}, los negocios de ${cat} que cuidan su presencia online reciben hasta 3 veces más consultas. En ${b} lo sabemos y trabajamos cada día para ofrecerte lo mejor. ¡Ven a conocernos!`,
      tags: ['#sabiasque', '#negociolocal', '#consejos'],
    },
    {
      title: 'Consejo de la semana',
      body: (b, c) =>
        `Tip para sacar el máximo partido a tu visita: reserva con antelación y dinos lo que necesitas. En ${b} preparamos todo para que tu experiencia en ${c} sea perfecta desde el primer momento.`,
      tags: ['#consejo', '#tip', '#experiencia'],
    },
    {
      title: 'Detrás de cámaras',
      body: (b, c, cat) =>
        `¿Cómo es un día normal en ${b}? Desde temprano preparamos todo para que cada cliente de ${c} se lleve lo mejor. El ${cat} tiene sus secretos, y hoy te contamos uno: el detalle marca la diferencia.`,
      tags: ['#detras', '#equipo', '#proceso'],
    },
    {
      title: 'Oferta especial',
      body: (b, c) =>
        `Solo esta semana en ${b}: condiciones especiales para nuevos clientes de ${c}. No dejes pasar esta oportunidad. Escríbenos por mensaje o llámanos directamente. ¡Plazas limitadas!`,
      tags: ['#oferta', '#promocion', '#descuento'],
    },
    {
      title: 'Lo que dicen nuestros clientes',
      body: (b, c) =>
        `"Desde que confío en ${b} no busco en ningún otro sitio. El trato en ${c} es diferente, se nota que les importas." Gracias por cada reseña. Son el motor que nos hace mejorar cada día.`,
      tags: ['#testimonios', '#opiniones', '#clientes'],
    },
    {
      title: '¿Lo sabías?',
      body: (_b, _c, cat) =>
        `Curiosidad del sector ${cat}: la mayoría de clientes toma su decisión de compra en menos de 30 segundos. Por eso cuidamos cada detalle: la imagen, la atención y la calidad. ¿Tienes alguna pregunta? Aquí estamos.`,
      tags: ['#curiosidad', '#dato', '#sector'],
    },
    {
      title: 'Empieza el fin de semana con nosotros',
      body: (b, c) =>
        `¿Planes para el fin de semana en ${c}? En ${b} tienes todo lo que necesitas. Pásate, contáctanos o simplemente síguenos para no perderte nada. ¡Feliz semana a todos!`,
      tags: ['#findesemana', '#planes', '#comunidad'],
    },
  ];

  return templates.map((t, i) => ({
    day: DAYS[i],
    title: t.title,
    body: t.body(b, c, cat),
    hashtags: [...t.tags, `#${cat.replace(/\s+/g, '')}`, `#${c.toLowerCase().replace(/\s+/g, '')}`],
  }));
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const LOADING_STEPS = [
  'Analizando tu negocio...',
  'Detectando categoría...',
  'Estudiando competidores...',
  'Buscando tendencias locales...',
  'Creando calendario editorial...',
  'Escribiendo publicaciones...',
];

function LoadingAnimation({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState<number[]>([]);
  const startRef = useRef(Date.now());
  const doneRef = useRef(false);

  useEffect(() => {
    const totalDuration = 4800;
    const stepDuration = totalDuration / LOADING_STEPS.length;

    const intervals: ReturnType<typeof setTimeout>[] = [];

    LOADING_STEPS.forEach((_, i) => {
      intervals.push(
        setTimeout(() => {
          setCurrent(i);
          if (i > 0) setCompleted((prev) => [...prev, i - 1]);
        }, i * stepDuration)
      );
    });

    const doneTimer = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      setCompleted(LOADING_STEPS.map((_, i) => i));
      setTimeout(onDone, 300);
    }, totalDuration + 300);

    intervals.push(doneTimer);

    return () => intervals.forEach(clearTimeout);
  }, [onDone]);

  const elapsed = Date.now() - startRef.current;
  void elapsed;

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <Zap size={24} className="text-emerald-400" />
          </div>
          <p className="text-slate-400 text-sm">Generando tu contenido...</p>
        </div>

        <div className="space-y-4">
          {LOADING_STEPS.map((step, i) => {
            const done = completed.includes(i);
            const active = current === i && !done;
            return (
              <div
                key={i}
                className={`flex items-center gap-3 transition-all duration-500 ${
                  done ? 'opacity-100' : active ? 'opacity-100' : 'opacity-30'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
                    done
                      ? 'bg-emerald-500'
                      : active
                      ? 'border-2 border-emerald-400 bg-transparent'
                      : 'border border-slate-700 bg-transparent'
                  }`}
                >
                  {done ? (
                    <Check size={13} className="text-white" strokeWidth={3} />
                  ) : active ? (
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  ) : null}
                </div>
                <span
                  className={`text-sm font-medium transition-colors duration-300 ${
                    done ? 'text-emerald-400' : active ? 'text-white' : 'text-slate-600'
                  }`}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        {/* progress bar */}
        <div className="mt-10 h-1 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-500"
            style={{ width: `${((completed.length) / LOADING_STEPS.length) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function PostCard({
  post,
  index,
  blurred,
}: {
  post: Post;
  index: number;
  blurred: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (blurred) return;
    const text = `${post.title}\n\n${post.body}\n\n${post.hashtags.join(' ')}`;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`relative rounded-2xl border transition-all duration-300 ${
        blurred
          ? 'border-slate-800/40 bg-slate-900/20'
          : 'border-slate-700/50 bg-slate-900/60 hover:border-slate-600/60'
      }`}
    >
      {blurred && (
        <div className="absolute inset-0 backdrop-blur-md rounded-2xl z-10 bg-slate-950/40" />
      )}

      <div className={`p-5 ${blurred ? 'select-none' : ''}`}>
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
            {post.day}
          </span>
          {!blurred && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
              {copied ? 'Copiado' : 'Copiar'}
            </button>
          )}
        </div>

        <h3 className="font-bold text-white text-base mb-2">{post.title}</h3>
        <p className="text-slate-400 text-sm leading-relaxed mb-3">{post.body}</p>
        <div className="flex flex-wrap gap-1.5">
          {post.hashtags.map((h) => (
            <span
              key={h}
              className="text-[11px] text-emerald-500/70 font-medium bg-emerald-500/8 px-2 py-0.5 rounded-full"
            >
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function GateBlock({ onRegister }: { onRegister: () => void }) {
  return (
    <div className="relative rounded-2xl border border-emerald-500/20 bg-gradient-to-b from-slate-900 to-slate-950 p-8 text-center overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/60 to-slate-950 pointer-events-none" />
      <div className="relative z-10">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
          <Lock size={20} className="text-emerald-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">
          Tu calendario completo ya está preparado.
        </h3>
        <p className="text-slate-400 text-sm leading-relaxed mb-6 max-w-sm mx-auto">
          Crea una cuenta gratuita para desbloquear las{' '}
          <span className="text-white font-semibold">30 publicaciones</span> y seguir generando
          contenido cuando quieras.
        </p>
        <button
          onClick={onRegister}
          className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-8 py-4 rounded-xl transition-all duration-200 hover:-translate-y-0.5 shadow-xl shadow-emerald-500/25"
        >
          Desbloquear gratis
          <ArrowRight size={16} />
        </button>
        <p className="text-slate-600 text-xs mt-4">7 días gratis · Sin compromiso</p>
      </div>
    </div>
  );
}

// Inline mini register form (no modal needed for conversion speed)
function RegisterPanel({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    track('content_register_click', { method: 'email', ...getUtmParams() });

    const res = await supabase.functions.invoke('signup-instant', { body: { email, password } });
    if (res.error) {
      setError('No se pudo crear la cuenta. Inténtalo de nuevo.');
      setLoading(false);
      return;
    }
    const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
    if (loginErr) {
      setError('Cuenta creada. Inicia sesión con tu email.');
      setLoading(false);
      return;
    }
    trackCompleteRegistration();
    track('register_success', { source: 'content_generator', ...getUtmParams() });
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose} />
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden shadow-2xl">
        <div className="h-[2px] bg-gradient-to-r from-emerald-500 to-teal-400" />
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-white font-bold text-lg">Desbloquea tu calendario</h2>
              <p className="text-slate-500 text-xs mt-0.5">7 días gratis · sin tarjeta</p>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1">
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
              {loading ? (
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : null}
              {loading ? 'Creando cuenta...' : 'Crear cuenta gratis'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category options
// ---------------------------------------------------------------------------
const CATEGORIES = [
  'Restaurante',
  'Cafetería / Bar',
  'Peluquería / Barbería',
  'Clínica dental',
  'Centro de estética / Spa',
  'Fisioterapia',
  'Autoescuela',
  'Fontanería / Electricidad',
  'Academia / Clases particulares',
  'Tienda de ropa',
  'Frutería / Carnicería',
  'Gimnasio / Pilates',
  'Abogado / Gestoría',
  'Inmobiliaria',
  'Taller mecánico',
  'Otro',
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
type Stage = 'hero' | 'form' | 'loading' | 'result';

export default function ContentGeneratorLanding() {
  const [stage, setStage] = useState<Stage>('hero');
  const [business, setBusiness] = useState('');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [posts, setPosts] = useState<Post[]>([]);
  const [showRegister, setShowRegister] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const startTimeRef = useRef<number>(0);
  const utmRef = useRef(getUtmParams());

  // Track page view once
  useEffect(() => {
    track('page_view', { page: 'content_generator', ...utmRef.current });
  }, []);

  const handleStartGenerate = useCallback(() => {
    setStage('form');
    track('content_generator_start', { ...utmRef.current });
  }, []);

  const handleGenerate = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!business.trim() || !city.trim() || !category) return;
      startTimeRef.current = Date.now();
      track('content_generator_start', {
        business,
        city,
        category,
        ...utmRef.current,
      });
      setStage('loading');
    },
    [business, city, category]
  );

  const handleLoadingDone = useCallback(() => {
    const generated = generatePosts(business, city, category);
    setPosts(generated);
    const elapsed = Date.now() - startTimeRef.current;
    track('content_generated', { business, city, category, elapsed_ms: elapsed, ...utmRef.current });
    setStage('result');
  }, [business, city, category]);

  const handleGateShown = useCallback(() => {
    track('content_gate_shown', { business, city, category, ...utmRef.current });
  }, [business, city, category]);

  const handleRegisterOpen = useCallback(() => {
    track('content_register_click', { ...utmRef.current });
    setShowRegister(true);
  }, []);

  const handleRegisterSuccess = useCallback(() => {
    setShowRegister(false);
    setRegistered(true);
  }, []);

  // When result mounts, trigger gate tracking
  const gateTrackedRef = useRef(false);
  useEffect(() => {
    if (stage === 'result' && !gateTrackedRef.current) {
      gateTrackedRef.current = true;
      // Small delay so card renders first
      setTimeout(handleGateShown, 800);
    }
  }, [stage, handleGateShown]);

  // -------------------------------------------------------------------------
  // Render stages
  // -------------------------------------------------------------------------
  if (stage === 'loading') {
    return <LoadingAnimation onDone={handleLoadingDone} />;
  }

  if (stage === 'result') {
    const visiblePosts = registered ? posts : posts.slice(0, 2);
    const blurredPosts = registered ? [] : posts.slice(2, 4);

    return (
      <div className="min-h-screen bg-[#0a0f0a] pb-24">
        {showRegister && (
          <RegisterPanel
            onSuccess={handleRegisterSuccess}
            onClose={() => setShowRegister(false)}
          />
        )}

        {/* Header */}
        <div className="border-b border-slate-800/50 px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Zap size={14} className="text-emerald-400" />
              </div>
              <span className="text-white font-bold text-sm">LocalSEOHub</span>
            </div>
            {registered && (
              <span className="text-emerald-400 text-xs font-medium flex items-center gap-1">
                <Check size={12} /> Contenido desbloqueado
              </span>
            )}
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 pt-8">
          {/* Summary */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">
                Calendario generado
              </span>
            </div>
            <h1 className="text-2xl font-bold text-white">
              {registered ? '30 publicaciones para' : 'Vista previa para'}{' '}
              <span className="text-emerald-400">{business}</span>
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              {city} · {category}
            </p>
          </div>

          {/* Visible posts */}
          <div className="space-y-4">
            {visiblePosts.map((post, i) => (
              <PostCard key={i} post={post} index={i} blurred={false} />
            ))}
          </div>

          {/* Blurred posts + gate */}
          {!registered && (
            <>
              <div className="space-y-4 mt-4">
                {blurredPosts.map((post, i) => (
                  <PostCard key={i} post={post} index={i + 2} blurred={true} />
                ))}
              </div>
              <div className="mt-6">
                <GateBlock onRegister={handleRegisterOpen} />
              </div>
            </>
          )}

          {/* If registered, show all remaining */}
          {registered && (
            <div className="space-y-4 mt-4">
              {posts.slice(2).map((post, i) => (
                <PostCard key={i} post={post} index={i + 2} blurred={false} />
              ))}
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-6 text-center mt-8">
                <Check size={24} className="text-emerald-400 mx-auto mb-3" />
                <h3 className="text-white font-bold mb-1">Cuenta creada con éxito</h3>
                <p className="text-slate-400 text-sm mb-4">
                  Accede a tu panel para generar nuevos calendarios, editar publicaciones y mucho más.
                </p>
                <a
                  href="/"
                  className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-6 py-3 rounded-xl transition-colors"
                >
                  Ir a mi panel <ArrowRight size={14} />
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Fixed bottom CTA (only when gate is active) */}
        {!registered && (
          <div className="fixed bottom-0 left-0 right-0 z-20 bg-slate-950/90 backdrop-blur-xl border-t border-slate-800/60 p-4">
            <div className="max-w-2xl mx-auto flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold truncate">
                  Las 30 publicaciones están listas
                </p>
                <p className="text-slate-500 text-xs">7 días gratis · sin compromiso</p>
              </div>
              <button
                onClick={handleRegisterOpen}
                className="flex-shrink-0 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm px-5 py-3 rounded-xl transition-all duration-200 flex items-center gap-1.5"
              >
                Desbloquear <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Hero + Form (combined to reduce steps on mobile)
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-[#0a0f0a] flex flex-col">
      {/* Example modal */}
      {showExample && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 sm:p-6"
          onClick={() => setShowExample(false)}
        >
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" />
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-700/60 rounded-2xl overflow-hidden shadow-2xl">
            <div className="h-[2px] bg-gradient-to-r from-emerald-500 to-teal-400" />
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold">Ejemplo de publicación</h3>
                <button onClick={() => setShowExample(false)} className="text-slate-500 hover:text-slate-300">
                  <ChevronDown size={18} />
                </button>
              </div>
              <div className="rounded-xl border border-slate-700/50 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-emerald-400 uppercase tracking-widest">Lunes</span>
                </div>
                <h4 className="font-bold text-white mb-2">¿Sabías que...?</h4>
                <p className="text-slate-400 text-sm leading-relaxed mb-3">
                  En Madrid, los restaurantes que cuidan su presencia online reciben hasta 3 veces más reservas. En La
                  Trattoria lo sabemos y trabajamos cada día para ofrecerte lo mejor. ¡Ven a conocernos!
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {['#sabiasque', '#negociolocal', '#restaurante', '#madrid'].map((h) => (
                    <span key={h} className="text-[11px] text-emerald-500/70 font-medium bg-emerald-500/8 px-2 py-0.5 rounded-full">
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-slate-500 text-xs text-center mt-4">
                Así son las 30 publicaciones que generamos para tu negocio
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---- Hero section ---- */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-10 pb-6 sm:pt-16 sm:pb-10">
        <div className="w-full max-w-xl">
          {/* Social proof pill */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/20 text-emerald-400 text-xs font-medium px-4 py-2 rounded-full">
              <div className="flex items-center gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} size={10} fill="currentColor" className="text-amber-400" />
                ))}
              </div>
              Ya utilizada por negocios locales para ahorrar horas cada semana
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-[clamp(28px,6vw,48px)] font-extrabold text-white text-center leading-[1.12] tracking-tight mb-4">
            La IA crea un mes completo de contenido para tu negocio{' '}
            <span className="text-emerald-400">en menos de un minuto.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-slate-400 text-center text-base sm:text-lg leading-relaxed mb-3 max-w-lg mx-auto">
            Publicaciones para Google Business Profile, Facebook e Instagram adaptadas a tu negocio,
            ciudad y sector.{' '}
            <span className="text-slate-300">Sin escribir una sola línea.</span>
          </p>

          {/* Benefits row */}
          <div className="flex items-center justify-center gap-4 sm:gap-6 mb-8 flex-wrap">
            {[
              { icon: Clock, label: 'Ahorra horas cada semana' },
              { icon: Zap, label: 'Listo en 5 segundos' },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-1.5 text-slate-500 text-xs">
                <Icon size={13} className="text-emerald-500" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          {/* ---- Form ---- */}
          <form onSubmit={handleGenerate} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={business}
                onChange={(e) => setBusiness(e.target.value)}
                placeholder="Nombre de tu negocio"
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-4 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60 transition-colors"
              />
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ciudad"
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-4 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/60 transition-colors"
              />
            </div>

            <div className="relative">
              <select
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full appearance-none bg-slate-900/80 border border-slate-700/60 rounded-xl px-4 py-4 text-sm text-white outline-none focus:border-emerald-500/60 transition-colors cursor-pointer"
                style={{ color: category ? 'white' : 'rgb(75 85 99)' }}
              >
                <option value="" disabled style={{ color: 'rgb(75 85 99)' }}>
                  Categoría de tu negocio
                </option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} style={{ color: 'white', background: '#0f172a' }}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-4 rounded-xl text-sm transition-all duration-200 hover:-translate-y-0.5 shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              <Zap size={16} fill="currentColor" />
              Generar contenido con IA
            </button>
          </form>

          {/* Secondary action */}
          <div className="flex justify-center mt-4">
            <button
              onClick={() => setShowExample(true)}
              className="text-slate-500 hover:text-slate-300 text-xs underline underline-offset-4 transition-colors"
            >
              Ver ejemplo
            </button>
          </div>

          {/* Trust micro-copy */}
          <p className="text-center text-slate-600 text-[11px] mt-5">
            Sin tarjeta de crédito · Gratis durante 7 días
          </p>
        </div>
      </div>

      {/* Bottom fixed CTA (visible on mobile while scrolling) */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 z-20 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/60 px-4 py-3">
        <button
          type="button"
          onClick={() => {
            document.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            if (!business || !city || !category) {
              document.querySelector<HTMLInputElement>('input[placeholder="Nombre de tu negocio"]')?.focus();
            }
          }}
          className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
        >
          <Zap size={15} fill="currentColor" />
          Generar mi contenido gratis
        </button>
      </div>
    </div>
  );
}
