import { useState } from 'react';
import {
  Search,
  MapPin,
  ShoppingBag,
  Tag,
  Sparkles,
  Copy,
  Check,
  TrendingUp,
  Globe,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { supabase } from './lib/supabase';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import LoginModal from './components/LoginModal';

// ─── Types ───────────────────────────────────────────────────────────────────

type Platform = 'Etsy' | 'Shopify' | 'Amazon' | 'Google Business' | '';

interface SEOResult {
  title: string;
  description: string;
  tags: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, JSX.Element> = {
  Etsy: <ShoppingBag size={14} />,
  Shopify: <Globe size={14} />,
  Amazon: <TrendingUp size={14} />,
  'Google Business': <MapPin size={14} />,
};

async function callGenerateSEO(
  product: string,
  city: string,
  platform: string,
  keywords: string,
  accessToken: string
): Promise<SEOResult> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-seo`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ product, city, platform, keywords }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error ?? 'Error desconocido del servidor');
  }
  return data as SEOResult;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
        bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500"
    >
      {copied ? (
        <>
          <Check size={12} className="text-emerald-400" />
          <span className="text-emerald-400">Copiado</span>
        </>
      ) : (
        <>
          <Copy size={12} />
          Copiar
        </>
      )}
    </button>
  );
}

function SkeletonBlock({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-slate-700 rounded-md animate-pulse"
          style={{ width: i === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

function ResultSection({
  label,
  icon,
  children,
  isLoading,
}: {
  label: string;
  icon: JSX.Element;
  children: React.ReactNode;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-800/60 border border-slate-700/60 p-5 space-y-3">
      <div className="flex items-center gap-2 text-slate-400 text-xs font-semibold uppercase tracking-widest">
        <span className="text-emerald-400">{icon}</span>
        {label}
      </div>
      {isLoading ? <SkeletonBlock lines={label.includes('Descripción') ? 5 : 2} /> : children}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  const { session } = useAuth();
  const [product, setProduct] = useState('');
  const [city, setCity] = useState('');
  const [platform, setPlatform] = useState<Platform>('');
  const [keywords, setKeywords] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SEOResult | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleGenerate = async () => {
    if (!product.trim() || !session?.access_token) return;
    setIsLoading(true);
    setHasGenerated(true);
    setResult(null);
    setApiError('');
    try {
      const data = await callGenerateSEO(product, city, platform, keywords, session.access_token);
      setResult(data);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Error al generar el contenido');
    } finally {
      setIsLoading(false);
    }
  };

  const canGenerate = product.trim().length > 0;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Page header */}
      <div className="border-b border-slate-800/50 mb-8 pb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
          Genera contenido SEO local{' '}
          <span className="text-emerald-400">optimizado con IA</span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base max-w-xl">
          Crea títulos, descripciones y etiquetas para posicionarte en tu ciudad y plataforma en segundos.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-start">
        {/* LEFT — Form */}
        <div className="rounded-2xl bg-slate-900/70 border border-slate-800/60 p-6 shadow-xl space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <Search size={16} className="text-emerald-400" />
            <h2 className="font-semibold text-slate-200 text-sm">Parámetros de búsqueda</h2>
          </div>

          {/* Product */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Nombre del Producto o Servicio <span className="text-emerald-400">*</span>
            </label>
            <input
              type="text"
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="ej. Camisetas personalizadas, Reparación de móviles..."
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                placeholder-slate-500 outline-none transition-all duration-200
                focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
            />
          </div>

          {/* City */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin size={11} className="text-slate-500" />
              Ciudad / Región Objetivo
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="ej. Toledo, Madrid, Barcelona..."
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                placeholder-slate-500 outline-none transition-all duration-200
                focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
            />
          </div>

          {/* Platform */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag size={11} className="text-slate-500" />
              Plataforma
            </label>
            <div className="relative">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                  outline-none appearance-none cursor-pointer transition-all duration-200
                  focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
              >
                <option value="" className="bg-slate-900">Selecciona una plataforma...</option>
                <option value="Etsy" className="bg-slate-900">Etsy</option>
                <option value="Shopify" className="bg-slate-900">Shopify</option>
                <option value="Amazon" className="bg-slate-900">Amazon</option>
                <option value="Google Business" className="bg-slate-900">Google Business</option>
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            {platform && (
              <div className="flex items-center gap-1.5 mt-2">
                <span className="inline-flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full px-3 py-1 text-xs font-medium">
                  {PLATFORM_ICONS[platform]}
                  {platform}
                </span>
              </div>
            )}
          </div>

          {/* Keywords */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Tag size={11} className="text-slate-500" />
              Palabras clave o detalles adicionales
              <span className="text-slate-600 normal-case font-normal">(opcional)</span>
            </label>
            <textarea
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="ej. hecho a mano, envío 24h, regalo, económico, alta calidad..."
              rows={3}
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                placeholder-slate-500 outline-none resize-none transition-all duration-200
                focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
            />
          </div>

          {/* CTA */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || isLoading}
            className={`w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl font-semibold text-sm
              transition-all duration-300 shadow-lg
              ${canGenerate && !isLoading
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generando contenido SEO...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generar Contenido SEO
              </>
            )}
          </button>

          {!canGenerate && (
            <p className="text-xs text-slate-600 text-center -mt-1">
              Introduce un producto o servicio para continuar
            </p>
          )}
        </div>

        {/* RIGHT — Results */}
        <div className="space-y-4">
          {apiError && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3.5">
              <AlertCircle size={15} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-red-400 text-sm font-medium">Error al generar el contenido</p>
                <p className="text-red-400/70 text-xs mt-0.5">{apiError}</p>
              </div>
            </div>
          )}
          {!hasGenerated ? (
            <div className="rounded-2xl bg-slate-900/40 border border-slate-800/40 border-dashed p-12 flex flex-col items-center justify-center text-center gap-4 min-h-[400px]">
              <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center">
                <Sparkles size={24} className="text-slate-600" />
              </div>
              <div>
                <p className="text-slate-400 font-medium text-sm">Resultados SEO aparecerán aquí</p>
                <p className="text-slate-600 text-xs mt-1">
                  Completa el formulario y pulsa "Generar Contenido SEO"
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center mt-2">
                {['Título optimizado', 'Descripción local', 'Tags SEO'].map((item) => (
                  <span
                    key={item}
                    className="text-xs bg-slate-800/60 border border-slate-700/50 text-slate-500 rounded-full px-3 py-1"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <>
              <ResultSection label="Título Optimizado" icon={<TrendingUp size={13} />} isLoading={isLoading}>
                {result && (
                  <div className="space-y-3">
                    <p className="text-slate-100 text-sm leading-relaxed font-medium">{result.title}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{result.title.length} caracteres</span>
                      <CopyButton text={result.title} />
                    </div>
                  </div>
                )}
              </ResultSection>

              <ResultSection
                label="Descripción Completa con Palabras Clave Locales"
                icon={<Search size={13} />}
                isLoading={isLoading}
              >
                {result && (
                  <div className="space-y-3">
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{result.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{result.description.length} caracteres</span>
                      <CopyButton text={result.description} />
                    </div>
                  </div>
                )}
              </ResultSection>

              <ResultSection label="Etiquetas / Tags Recomendados" icon={<Tag size={13} />} isLoading={isLoading}>
                {result && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                      {result.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 text-xs bg-slate-700/60 border border-slate-600/50
                            text-slate-300 rounded-lg px-2.5 py-1 hover:border-emerald-500/40 hover:text-emerald-300
                            transition-colors cursor-default"
                        >
                          <span className="text-emerald-500/60">#</span>
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500">{result.tags.length} etiquetas</span>
                      <CopyButton text={result.tags.map((t) => `#${t}`).join(' ')} />
                    </div>
                  </div>
                )}
              </ResultSection>

              {result && (
                <p className="text-xs text-slate-600 text-center px-4">
                  Contenido generado por IA. Revisa y personaliza antes de publicar.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { user, loading, signOut } = useAuth();
  const [showLogin, setShowLogin] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  // While Supabase resolves the session, show a minimal loader
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  const handlePricingClick = () => {
    if (user) {
      setShowPricing(true);
    } else {
      setShowPricing(true);
    }
  };

  // Not logged in → show landing (or pricing section of it)
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Navbar
          user={null}
          onLoginClick={() => setShowLogin(true)}
          onPricingClick={handlePricingClick}
          onSignOut={signOut}
        />
        <LandingPage onLoginClick={() => setShowLogin(true)} scrollToPricing={showPricing} />
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </div>
    );
  }

  // Logged in → show dashboard
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Navbar
        user={user}
        onLoginClick={() => setShowLogin(true)}
        onPricingClick={handlePricingClick}
        onSignOut={signOut}
      />

      {/* Pricing overlay when requested */}
      {showPricing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setShowPricing(false)}
        >
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
          <div className="relative w-full max-w-sm">
            <button
              onClick={() => setShowPricing(false)}
              className="absolute -top-10 right-0 text-slate-400 hover:text-white text-sm flex items-center gap-1"
            >
              Cerrar
            </button>
            <PricingCard />
          </div>
        </div>
      )}

      <Dashboard />

      {/* Footer */}
      <footer className="border-t border-slate-800/50 mt-16 py-6">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs text-slate-600 font-medium">LocalSEO AI</span>
          <p className="text-xs text-slate-700">Potenciado por inteligencia artificial generativa</p>
        </div>
      </footer>
    </div>
  );
}

function PricingCard() {
  return (
    <div className="rounded-2xl bg-slate-900 border-2 border-emerald-500/40 p-8 shadow-2xl shadow-emerald-500/10">
      <div className="text-center mb-6">
        <span className="inline-block bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-bold px-4 py-1 rounded-full mb-4">
          MAS POPULAR
        </span>
        <p className="text-slate-400 text-sm font-medium mb-2">Plan Pro</p>
        <div className="flex items-end justify-center gap-1">
          <span className="text-5xl font-bold text-white">9.99</span>
          <span className="text-slate-400 mb-2">€/mes</span>
        </div>
        <p className="text-slate-500 text-xs mt-1">Cancela cuando quieras</p>
      </div>
      <ul className="space-y-3 mb-8">
        {[
          'Generaciones ilimitadas',
          'Optimización para 4 plataformas',
          'SEO localizado en toda España',
          'Títulos, descripciones y tags',
          'Soporte prioritario por email',
        ].map((f) => (
          <li key={f} className="flex items-center gap-3 text-sm text-slate-300">
            <Check size={13} className="text-emerald-400 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <button className="w-full py-3.5 rounded-xl font-bold text-sm
        bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
        text-slate-950 shadow-lg shadow-emerald-500/20 transition-all duration-300 hover:-translate-y-0.5">
        Suscribirse al Plan Pro
      </button>
    </div>
  );
}
