import { useState, useEffect, useCallback } from 'react';
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
  Lock,
  Loader2,
  Bookmark,
  BookmarkCheck,
  History,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useSubscription } from './hooks/useSubscription';
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

interface SavedItem {
  id: string;
  product: string;
  city: string;
  platform: string;
  title: string;
  description: string;
  tags: string[];
  created_at: string;
}

const PREVIEW_STORAGE_KEY = 'localseo_saved_preview';

function loadPreviewSaved(): SavedItem[] {
  try {
    return JSON.parse(localStorage.getItem(PREVIEW_STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function savePreviewItem(item: SavedItem) {
  const items = loadPreviewSaved();
  localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify([item, ...items]));
}

function deletePreviewItem(id: string) {
  const items = loadPreviewSaved().filter((i) => i.id !== id);
  localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(items));
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-seo`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ product, city, platform, keywords }),
      signal: controller.signal,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error ?? 'Error desconocido del servidor');
    }
    return data as SEOResult;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado. Por favor, inténtalo de nuevo.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function createCheckoutSession(accessToken: string): Promise<string | null> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      price_id: import.meta.env.VITE_STRIPE_PRICE_ID,
      success_url: `${window.location.origin}/?payment=success`,
      cancel_url: `${window.location.origin}/?payment=canceled`,
      mode: 'subscription',
    }),
  });
  const data = await res.json();
  return data?.url ?? null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
        bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white border border-slate-600 hover:border-slate-500"
    >
      {state === 'copied' ? (
        <>
          <Check size={12} className="text-emerald-400" />
          <span className="text-emerald-400">¡Copiado!</span>
        </>
      ) : state === 'error' ? (
        <>
          <AlertCircle size={12} className="text-red-400" />
          <span className="text-red-400">Error al copiar</span>
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

// ─── Subscription gate banner ─────────────────────────────────────────────────

function SubscriptionGate({ onSubscribe, isLoading }: { onSubscribe: () => void; isLoading: boolean }) {
  return (
    <div className="rounded-2xl bg-slate-900/70 border border-emerald-500/20 p-8 flex flex-col items-center text-center gap-5 min-h-[400px] justify-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
        <Lock size={22} className="text-emerald-400" />
      </div>
      <div>
        <p className="text-white font-semibold text-base mb-1">Activa tu suscripción para generar</p>
        <p className="text-slate-400 text-sm max-w-xs mx-auto">
          Accede a generaciones ilimitadas de contenido SEO local por solo 9.99€/mes.
        </p>
      </div>
      <button
        onClick={onSubscribe}
        disabled={isLoading}
        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all duration-300
          bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
          text-slate-950 shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
      >
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
        {isLoading ? 'Redirigiendo a pago...' : 'Suscribirse al Plan Pro — 9.99€/mes'}
      </button>
    </div>
  );
}

// ─── Saved Texts ─────────────────────────────────────────────────────────────

function SavedTexts({ previewMode }: { previewMode: boolean }) {
  const { session } = useAuth();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    if (previewMode) {
      setItems(loadPreviewSaved());
      setLoading(false);
      return;
    }
    if (!session) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('saved_seo_results')
      .select('id, product, city, platform, title, description, tags, created_at')
      .order('created_at', { ascending: false });
    if (!error && data) setItems(data as SavedItem[]);
    setLoading(false);
  }, [previewMode, session]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    if (previewMode) {
      deletePreviewItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    } else {
      await supabase.from('saved_seo_results').delete().eq('id', id);
      setItems((prev) => prev.filter((i) => i.id !== id));
    }
    setDeletingId(null);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div>
      <div className="border-b border-slate-800/50 mb-8 pb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
            Mis Textos <span className="text-emerald-400">Guardados</span>
          </h1>
          <p className="text-slate-400 text-sm">
            Historial de contenido SEO que has guardado para usar más tarde.
          </p>
        </div>
        {items.length > 0 && (
          <span className="text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-400 rounded-full px-3 py-1 self-center">
            {items.length} {items.length === 1 ? 'texto' : 'textos'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <svg className="animate-spin w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl bg-slate-900/40 border border-slate-800/40 border-dashed p-16 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-center">
            <Bookmark size={24} className="text-slate-600" />
          </div>
          <div>
            <p className="text-slate-400 font-medium text-sm">Aun no has guardado ningun texto</p>
            <p className="text-slate-600 text-xs mt-1">Genera contenido SEO y pulsa "Guardar en el Historial".</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl bg-slate-900/70 border border-slate-800/60 overflow-hidden transition-all duration-200 hover:border-slate-700/80"
            >
              {/* Header row */}
              <div className="flex items-center gap-3 px-5 py-4">
                <button
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                    <BookmarkCheck size={14} className="text-emerald-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-100 font-semibold text-sm truncate">{item.product}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.city && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <MapPin size={10} /> {item.city}
                        </span>
                      )}
                      {item.platform && (
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          {PLATFORM_ICONS[item.platform] ?? null} {item.platform}
                        </span>
                      )}
                      <span className="text-xs text-slate-600">{formatDate(item.created_at)}</span>
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className={`text-slate-600 shrink-0 transition-transform duration-200 ${expanded === item.id ? 'rotate-90' : ''}`}
                  />
                </button>
                <button
                  onClick={() => handleDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-600 hover:text-red-400
                    hover:bg-red-400/10 transition-colors shrink-0 disabled:opacity-40"
                >
                  {deletingId === item.id
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Trash2 size={13} />}
                </button>
              </div>

              {/* Expanded content */}
              {expanded === item.id && (
                <div className="border-t border-slate-800/60 px-5 py-5 space-y-4">
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Titulo</p>
                    <p className="text-slate-100 text-sm font-medium leading-relaxed">{item.title}</p>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Descripcion</p>
                    <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{item.description}</p>
                  </div>
                  {item.tags.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-xs bg-slate-700/60 border border-slate-600/50 text-slate-300 rounded-lg px-2.5 py-1"
                          >
                            <span className="text-emerald-500/60">#</span>{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({
  isActive,
  onSubscribe,
  checkoutLoading,
  previewMode = false,
}: {
  isActive: boolean;
  onSubscribe: () => void;
  checkoutLoading: boolean;
  previewMode?: boolean;
}) {
  const { session } = useAuth();
  const [tab, setTab] = useState<'generator' | 'saved'>('generator');
  const [product, setProduct] = useState('');
  const [city, setCity] = useState('');
  const [platform, setPlatform] = useState<Platform>('');
  const [keywords, setKeywords] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SEOResult | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [apiError, setApiError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!product.trim()) return;
    if (!isActive) {
      onSubscribe();
      return;
    }
    if (!previewMode && !session?.access_token) return;
    setIsLoading(true);
    setHasGenerated(true);
    setResult(null);
    setApiError('');
    setSavedId(null);
    try {
      let data: SEOResult;
      if (previewMode) {
        await new Promise((r) => setTimeout(r, 1200));
        const plat = platform || 'Etsy';
        const loc = city || 'tu ciudad';
        data = {
          title: `${product} artesanal en ${loc} — ${plat} | Envío rápido`,
          description: `¿Buscas ${product.toLowerCase()} en ${loc}? Encuentra en nuestra tienda de ${plat} los mejores ${product.toLowerCase()} elaborados con materiales de calidad superior.\n\nEnvío en 24-48h a toda España. Fabricación local en ${loc}. Ideal como regalo o uso personal. ¡Pide el tuyo hoy y recíbelo esta semana!\n\nVisítanos en ${plat} y descubre nuestra colección completa.`,
          tags: [
            `${product} ${loc}`,
            `${product} artesanal`,
            `${product} ${plat.toLowerCase()}`,
            `comprar ${product}`,
            `${product} local`,
            `tienda ${loc}`,
            `${product} calidad`,
            `regalo ${product}`,
            `envío rápido`,
            `hecho a mano`,
          ],
        };
      } else {
        data = await callGenerateSEO(product, city, platform, keywords, session!.access_token);
      }
      setResult(data);
    } catch (err) {
      setApiError(err instanceof Error ? err.message : 'Error al generar el contenido');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result || isSaving) return;
    setIsSaving(true);
    const newId = crypto.randomUUID();
    const item: SavedItem = {
      id: newId,
      product,
      city,
      platform,
      title: result.title,
      description: result.description,
      tags: result.tags,
      created_at: new Date().toISOString(),
    };
    try {
      if (previewMode) {
        savePreviewItem(item);
        setSavedId(newId);
      } else {
        const { data, error } = await supabase
          .from('saved_seo_results')
          .insert({ product, city, platform, title: result.title, description: result.description, tags: result.tags })
          .select('id')
          .single();
        if (!error && data) setSavedId(data.id);
      }
    } catch {
      // silent — the icon simply won't change
    } finally {
      setIsSaving(false);
    }
  };

  const canGenerate = product.trim().length > 0;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Tabs */}
      <div className="flex gap-1 mb-8 bg-slate-900/60 border border-slate-800/60 rounded-2xl p-1 w-fit">
        <button
          onClick={() => setTab('generator')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${tab === 'generator'
              ? 'bg-slate-800 text-white shadow-md'
              : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Sparkles size={14} />
          Generador
        </button>
        <button
          onClick={() => setTab('saved')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${tab === 'saved'
              ? 'bg-slate-800 text-white shadow-md'
              : 'text-slate-500 hover:text-slate-300'}`}
        >
          <History size={14} />
          Mis Textos Guardados
        </button>
      </div>

      {tab === 'saved' ? (
        <div>
          <SavedTexts previewMode={previewMode} />
        </div>
      ) : (
      <>
      {/* Page header */}
      <div className="border-b border-slate-800/50 mb-8 pb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
          Genera contenido SEO local{' '}
          <span className="text-emerald-400">optimizado con IA</span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base max-w-xl">
          Crea títulos, descripciones y etiquetas para posicionarte en tu ciudad y plataforma en segundos.
        </p>
        {!isActive && (
          <div className="mt-3 inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-amber-400">
            <Lock size={11} />
            Suscripción requerida para generar contenido
          </div>
        )}
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
            disabled={(!canGenerate && isActive) || (isActive && isLoading)}
            className={`w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl font-semibold text-sm
              transition-all duration-300 shadow-lg
              ${!isActive
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-amber-500/25 hover:shadow-amber-500/40 hover:-translate-y-0.5 active:translate-y-0'
                : canGenerate && !isLoading
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              }`}
          >
            {!isActive ? (
              <>
                {checkoutLoading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                {checkoutLoading ? 'Redirigiendo a pago...' : 'Suscribirse para Generar — 9.99€/mes'}
              </>
            ) : isLoading ? (
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

          {isActive && !canGenerate && (
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
          {!isActive ? (
            <SubscriptionGate onSubscribe={onSubscribe} isLoading={checkoutLoading} />
          ) : !hasGenerated ? (
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
                <div className="flex items-center justify-between gap-3 pt-1">
                  <p className="text-xs text-slate-600 px-1">
                    Contenido generado por IA. Revisa y personaliza antes de publicar.
                  </p>
                  <button
                    onClick={handleSave}
                    disabled={isSaving || !!savedId}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold shrink-0
                      transition-all duration-200 border
                      ${savedId
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 cursor-default'
                        : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-emerald-500/40 hover:text-emerald-300 hover:bg-slate-800'
                      } disabled:opacity-60`}
                  >
                    {isSaving
                      ? <Loader2 size={13} className="animate-spin" />
                      : savedId
                        ? <BookmarkCheck size={13} />
                        : <Bookmark size={13} />}
                    {savedId ? 'Guardado' : 'Guardar en el Historial'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </>
      )}
    </main>
  );
}

// ─── Pricing card ─────────────────────────────────────────────────────────────

function PricingCard({ onSubscribe, isLoading }: { onSubscribe: () => void; isLoading: boolean }) {
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
      <button
        onClick={onSubscribe}
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm
          bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
          text-slate-950 shadow-lg shadow-emerald-500/20 transition-all duration-300 hover:-translate-y-0.5
          disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
      >
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : null}
        {isLoading ? 'Redirigiendo a pago...' : 'Suscribirse al Plan Pro'}
      </button>
    </div>
  );
}

// ─── Payment success banner ───────────────────────────────────────────────────

function SuccessBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4">
      <div className="bg-emerald-500 text-slate-950 rounded-2xl px-5 py-4 shadow-xl shadow-emerald-500/30 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-950/20 flex items-center justify-center shrink-0">
            <Check size={16} className="text-slate-950" />
          </div>
          <div>
            <p className="font-bold text-sm">Suscripción activada</p>
            <p className="text-slate-950/70 text-xs">Ya puedes generar contenido SEO ilimitado.</p>
          </div>
        </div>
        <button onClick={onDismiss} className="text-slate-950/60 hover:text-slate-950 text-xs font-medium">
          Cerrar
        </button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

// Set to true while building to skip auth and preview the dashboard directly
const DEV_PREVIEW = true;

export default function App() {
  const { user, session, loading, signOut } = useAuth();
  const { isActive, loadingSubscription, refresh } = useSubscription(user);
  const [showLogin, setShowLogin] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);

  // Handle Stripe redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      setShowSuccessBanner(true);
      window.history.replaceState({}, '', '/');
      // Poll until subscription is active (webhook may take a few seconds)
      const interval = setInterval(async () => {
        await refresh();
      }, 2500);
      setTimeout(() => clearInterval(interval), 20000);
    } else if (params.get('payment') === 'canceled') {
      setShowPricing(true);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  const startCheckout = useCallback(async () => {
    if (!session?.access_token) {
      setShowLogin(true);
      return;
    }
    setCheckoutLoading(true);
    try {
      const url = await createCheckoutSession(session.access_token);
      if (url) {
        window.location.href = url;
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setCheckoutLoading(false);
    }
  }, [session]);

  const handlePricingClick = () => setShowPricing(true);

  if (!DEV_PREVIEW && (loading || (user && loadingSubscription))) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <svg className="animate-spin w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (!DEV_PREVIEW && !user) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Navbar
          user={null}
          onLoginClick={() => setShowLogin(true)}
          onPricingClick={handlePricingClick}
          onSignOut={signOut}
        />
        <LandingPage
          onLoginClick={() => setShowLogin(true)}
          onSubscribeClick={() => setShowLogin(true)}
          scrollToPricing={showPricing}
        />
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {showSuccessBanner && <SuccessBanner onDismiss={() => setShowSuccessBanner(false)} />}

      <Navbar
        user={user}
        onLoginClick={() => setShowLogin(true)}
        onPricingClick={handlePricingClick}
        onSignOut={signOut}
      />

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
            {isActive ? (
              <div className="rounded-2xl bg-slate-900 border-2 border-emerald-500/40 p-8 text-center shadow-2xl">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                  <Check size={24} className="text-emerald-400" />
                </div>
                <p className="text-white font-bold text-lg mb-1">Plan Pro activo</p>
                <p className="text-slate-400 text-sm">Ya tienes acceso a todas las funcionalidades.</p>
                <button
                  onClick={() => setShowPricing(false)}
                  className="mt-6 w-full py-3 rounded-xl font-semibold text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <PricingCard onSubscribe={() => { setShowPricing(false); startCheckout(); }} isLoading={checkoutLoading} />
            )}
          </div>
        </div>
      )}

      <Dashboard isActive={DEV_PREVIEW || isActive} onSubscribe={startCheckout} checkoutLoading={checkoutLoading} previewMode={DEV_PREVIEW} />

      <footer className="border-t border-slate-800/50 mt-16 py-6">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between flex-wrap gap-3">
          <span className="text-xs text-slate-600 font-medium">LocalSEO<span className="text-emerald-600">Hub</span></span>
          <p className="text-xs text-slate-700">Potenciado por inteligencia artificial · localseohub.io</p>
        </div>
      </footer>
    </div>
  );
}
