import React, { useState, useEffect, useCallback, ReactNode } from 'react';
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
  Download,
  FileDown,
  Square,
  CheckSquare,
  ImagePlus,
  X,
  Image,
  Calendar,
  Instagram,
  Video,
  Hash,
  Lightbulb,
  Zap,
  MapPinned,
  ExternalLink,
  CheckCircle2,
  Circle,
  ChevronDown,
  Building2,
  Phone,
  FileText,
  Clock,
  BrainCircuit,
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useSubscription } from './hooks/useSubscription';
import { supabase } from './lib/supabase';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import LoginModal from './components/LoginModal';

// ─── Types ───────────────────────────────────────────────────────────────────

type Platform = 'Etsy' | 'Shopify' | 'Amazon' | 'Google Business' | 'Wallapop' | 'Vinted' | 'eBay' | 'Facebook Marketplace' | 'WooCommerce' | '';

interface SEOResult {
  title: string;
  description: string;
  tags: string[];
  competitorKeywords?: string[];
  imageOptimization?: { filename: string; altText: string };
}

interface DayPlan {
  day: number;
  platform: string;
  hooks: string[];
  content_ideas: string[];
  local_hashtags: string[];
}

type DirecRelevancia = 'Alta' | 'Media' | 'Baja';
type DirecEstado = 'Pendiente' | 'Enviado';

interface NapData {
  nombre_negocio: string;
  direccion: string;
  telefono: string;
  descripcion: string;
  categoria_sugerida: string;
}

interface Directorio {
  id: string;
  nombre: string;
  url: string;
  relevancia: DirecRelevancia;
  estado: DirecEstado;
  categoria: string;
  razon?: string;
  nap?: NapData;
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

// ─── CSV Export ───────────────────────────────────────────────────────────────

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""').replace(/\n/g, ' ')}"`;
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportShopifyCSV(items: SavedItem[]) {
  const headers = [
    'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags',
    'Published', 'Option1 Name', 'Option1 Value',
    'Variant Price', 'Variant Requires Shipping', 'Variant Taxable',
    'Variant Inventory Tracker', 'Variant Inventory Qty',
    'Variant Inventory Policy', 'Variant Fulfillment Service',
  ];
  const rows = items.map((item) => {
    const handle = item.product.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const bodyHtml = `<p>${item.description.replace(/\n/g, '</p><p>')}</p>`;
    const tags = item.tags.join(', ');
    return [
      csvCell(handle),
      csvCell(item.title),
      csvCell(bodyHtml),
      csvCell(''),
      csvCell(''),
      csvCell(tags),
      csvCell('TRUE'),
      csvCell('Title'),
      csvCell('Default Title'),
      csvCell('0.00'),
      csvCell('TRUE'),
      csvCell('TRUE'),
      csvCell(''),
      csvCell('0'),
      csvCell('deny'),
      csvCell('manual'),
    ].join(',');
  });
  downloadCSV([headers.join(','), ...rows].join('\n'), 'shopify-products.csv');
}

function exportEtsyCSV(items: SavedItem[]) {
  const headers = [
    'TITLE', 'DESCRIPTION', 'TAGS', 'MATERIALS', 'SHOP_SECTION_ID',
    'PRICE', 'QUANTITY', 'SKU', 'TYPE', 'WHO_MADE', 'IS_SUPPLY', 'WHEN_MADE',
    'RECIPIENT', 'OCCASION',
  ];
  const rows = items.map((item) => {
    const tags = item.tags.slice(0, 13).map((t) => t.slice(0, 20)).join(',');
    return [
      csvCell(item.title.slice(0, 140)),
      csvCell(item.description.slice(0, 65535)),
      csvCell(tags),
      csvCell(''),
      csvCell(''),
      csvCell('0.00'),
      csvCell('1'),
      csvCell(''),
      csvCell('physical'),
      csvCell('i_did'),
      csvCell('FALSE'),
      csvCell('made_to_order'),
      csvCell(''),
      csvCell(''),
    ].join(',');
  });
  downloadCSV([headers.join(','), ...rows].join('\n'), 'etsy-listings.csv');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLATFORM_ICONS: Record<string, JSX.Element> = {
  Etsy: <ShoppingBag size={14} />,
  Shopify: <Globe size={14} />,
  Amazon: <TrendingUp size={14} />,
  'Google Business': <MapPin size={14} />,
  Wallapop: <Tag size={14} />,
  Vinted: <ShoppingBag size={14} />,
  eBay: <TrendingUp size={14} />,
  'Facebook Marketplace': <Globe size={14} />,
  WooCommerce: <Globe size={14} />,
};

async function callGenerateSEO(
  product: string,
  city: string,
  platform: string,
  keywords: string,
  accessToken: string,
  imageFile?: File | null
): Promise<SEOResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-seo`;

    let body: string;
    let imageBase64: string | undefined;

    if (imageFile) {
      imageBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });
    }

    body = JSON.stringify({
      product,
      city,
      platform,
      keywords,
      ...(imageBase64 ? { imageBase64, imageMimeType: imageFile!.type } : {}),
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body,
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

async function callGenerateContentPlan(
  product: string,
  city: string,
  platform: string,
  description: string,
  accessToken: string
): Promise<DayPlan[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-content-plan`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ product, city, platform, description }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? 'Error desconocido del servidor');
    return data.days as DayPlan[];
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError')
      throw new Error('La solicitud tardó demasiado. Inténtalo de nuevo.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAuditMapsProfile(
  businessName: string,
  category: string,
  description: string,
  hours: string,
  accessToken: string
): Promise<{ score: number; recommendations: AuditRec[] }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-maps-profile`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ businessName, category, description, hours }),
        signal: controller.signal,
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? 'Error del servidor');
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError')
      throw new Error('La solicitud tardó demasiado. Inténtalo de nuevo.');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function callScanDirectories(
  product: string,
  city: string,
  businessName: string,
  address: string,
  phone: string,
  accessToken: string
): Promise<Directorio[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scan-directories`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ product, city, businessName, address, phone }),
      signal: controller.signal,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error ?? 'Error desconocido del servidor');
    return (data.directorios as Directorio[]).map((d) => ({ ...d, estado: 'Pendiente' as DirecEstado }));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError')
      throw new Error('La solicitud tardó demasiado. Inténtalo de nuevo.');
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

function NapField({ label, icon, value }: { label: string; icon: ReactNode; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };
  return (
    <div className="space-y-1">
      <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
        {icon}{label}
      </span>
      <div className="flex items-center gap-2 rounded-lg bg-slate-900 border border-slate-800 px-3 py-2 group">
        <span className="flex-1 text-xs text-slate-200 font-mono leading-relaxed">{value}</span>
        <button
          onClick={copy}
          className={`shrink-0 transition-colors duration-200 ${copied ? 'text-emerald-400' : 'text-slate-600 hover:text-amber-400'}`}
          title="Copiar"
        >
          {copied ? <CheckCircle2 size={13} /> : <Copy size={13} />}
        </button>
      </div>
    </div>
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

type ExportFormat = 'shopify' | 'etsy';

function SavedTexts({ previewMode }: { previewMode: boolean }) {
  const { session } = useAuth();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<ExportFormat>('shopify');
  const [exportOpen, setExportOpen] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    if (previewMode) {
      setItems(loadPreviewSaved());
      setLoading(false);
      return;
    }
    if (!session) { setLoading(false); return; }
    const { data, error } = await supabase
      .from('saved_seo')
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
    } else {
      await supabase.from('saved_seo').delete().eq('id', id);
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
    setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
    setDeletingId(null);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleAll = () => {
    setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.id)));
  };

  const handleExport = () => {
    const toExport = items.filter((i) => selected.has(i.id));
    if (toExport.length === 0) return;
    if (exportFormat === 'shopify') exportShopifyCSV(toExport);
    else exportEtsyCSV(toExport);
    setExportOpen(false);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const allSelected = items.length > 0 && selected.size === items.length;
  const someSelected = selected.size > 0;

  return (
    <div>
      {/* Header */}
      <div className="border-b border-slate-800/50 mb-8 pb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
            Mis Textos <span className="text-emerald-400">Guardados</span>
          </h1>
          <p className="text-slate-400 text-sm">
            Historial de contenido SEO vinculado a tu cuenta. Selecciona textos para exportar.
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
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <button
              onClick={toggleAll}
              className="flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
            >
              {allSelected
                ? <CheckSquare size={14} className="text-emerald-400" />
                : <Square size={14} />}
              {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
            </button>

            {someSelected && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {selected.size} {selected.size === 1 ? 'seleccionado' : 'seleccionados'}
                </span>

                {/* Export dropdown */}
                <div className="relative">
                  <div className="flex items-center rounded-xl overflow-hidden border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
                    {/* Format selector */}
                    <div className="relative">
                      <select
                        value={exportFormat}
                        onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
                        className="appearance-none bg-slate-800 text-slate-300 text-xs font-semibold pl-3 pr-7 py-2.5
                          border-r border-emerald-500/20 outline-none cursor-pointer hover:bg-slate-700 transition-colors"
                      >
                        <option value="shopify">Shopify CSV</option>
                        <option value="etsy">Etsy CSV</option>
                      </select>
                      <ChevronRight size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none rotate-90" />
                    </div>
                    {/* Export button */}
                    <button
                      onClick={handleExport}
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400
                        text-slate-950 text-xs font-bold transition-colors"
                    >
                      <FileDown size={13} />
                      Exportar Seleccion a CSV
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* List */}
          <div className="space-y-3">
            {items.map((item) => {
              const isSelected = selected.has(item.id);
              return (
                <div
                  key={item.id}
                  className={`rounded-2xl border overflow-hidden transition-all duration-200
                    ${isSelected
                      ? 'bg-slate-900 border-emerald-500/30 shadow-md shadow-emerald-500/5'
                      : 'bg-slate-900/70 border-slate-800/60 hover:border-slate-700/80'}`}
                >
                  {/* Header row */}
                  <div className="flex items-center gap-3 px-4 py-4">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(item.id)}
                      className="shrink-0 text-slate-600 hover:text-emerald-400 transition-colors"
                    >
                      {isSelected
                        ? <CheckSquare size={16} className="text-emerald-400" />
                        : <Square size={16} />}
                    </button>

                    {/* Expand toggle */}
                    <button
                      onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                      className="flex-1 flex items-center gap-3 text-left min-w-0"
                    >
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors
                        ${isSelected
                          ? 'bg-emerald-500/15 border border-emerald-500/30'
                          : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
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

                    {/* Delete */}
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
              );
            })}
          </div>

          {/* Bottom export hint */}
          {!someSelected && (
            <p className="text-xs text-slate-600 text-center mt-6 flex items-center justify-center gap-1.5">
              <Download size={11} />
              Marca textos para habilitar la exportacion a CSV compatible con Shopify y Etsy
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── AI Digital Twin ──────────────────────────────────────────────────────────

type CategoryOption = 'basic' | 'optimized' | 'hyper';

const CATEGORY_OPTIONS: { value: CategoryOption; label: string }[] = [
  { value: 'basic',      label: 'Genérica Básica' },
  { value: 'optimized',  label: 'Optimizada con Facetas Secundarias' },
  { value: 'hyper',      label: 'Hiper-específica con Esquema 2026' },
];

const SENTIMENT_MAP: Record<CategoryOption, { low: string; mid: string; high: string }> = {
  basic: {
    low:  'El perfil tiene presencia digital mínima. Los motores de IA apenas rastrean señales relevantes de este negocio y lo excluyen de los resultados conversacionales.',
    mid:  'Visibilidad emergente. La IA detecta el negocio pero lo cataloga como genérico, sin diferenciadores claros frente a la competencia local.',
    high: 'Presencia sólida. Los LLMs incluyen el negocio en respuestas locales, aunque la categorización genérica limita la aparición en búsquedas de alta intención.',
  },
  optimized: {
    low:  'La optimización secundaria aún no tiene suficiente señal para destacar. Se necesita mayor volumen de actividad para que los motores de IA prioricen este perfil.',
    mid:  'Los motores de IA reconocen el perfil con facetas secundarias. El negocio empieza a aparecer en búsquedas de nicho con intención media-alta.',
    high: 'Excelente posicionamiento semántico. Los LLMs asocian el perfil con múltiples consultas relevantes y lo recomiendan en respuestas de alta especificidad.',
  },
  hyper: {
    low:  'El esquema 2026 está configurado pero sin suficiente actividad para generar tracción. Los datos estructurados existen, las señales aún son débiles.',
    mid:  'Señales de autoridad detectadas. El esquema hiper-específico posiciona el perfil como referencia local en su categoría principal ante los motores de IA.',
    high: 'Perfil de máxima autoridad. Los motores de IA conversacionales (ChatGPT, Gemini, Perplexity) citan este negocio como referencia prioritaria en su categoría y área geográfica.',
  },
};

function CircularProgress({ value, size = 180 }: { value: number; size?: number }) {
  const r = (size / 2) - 14;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;

  const color = value < 35 ? '#ef4444' : value < 65 ? '#f59e0b' : '#10b981';
  const glowColor = value < 35 ? 'rgba(239,68,68,0.3)' : value < 65 ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)';

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        {/* Track */}
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
        {/* Progress */}
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          filter="url(#glow)"
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1), stroke 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span
          className="font-bold tabular-nums"
          style={{ fontSize: size * 0.22, color, transition: 'color 0.4s ease', lineHeight: 1, filter: `drop-shadow(0 0 8px ${glowColor})` }}
        >
          {value}%
        </span>
        <span className="text-slate-500 font-medium" style={{ fontSize: size * 0.065 }}>AI VISIBILITY</span>
      </div>
    </div>
  );
}

function AiDigitalTwin() {
  const [reviewRate, setReviewRate] = useState(5);
  const [postFreq, setPostFreq] = useState(2);
  const [category, setCategory] = useState<CategoryOption>('basic');
  const [displayIndex, setDisplayIndex] = useState(0);

  const catMultiplier: Record<CategoryOption, number> = { basic: 0.55, optimized: 0.80, hyper: 1.0 };
  const rawIndex = Math.round(
    ((reviewRate / 30) * 40 + (postFreq / 7) * 25 + 35) * catMultiplier[category]
  );
  const visibilityIndex = Math.min(100, rawIndex);
  const projectedClients = Math.round(visibilityIndex * 3.4 + reviewRate * 2.1 + postFreq * 4.8);

  const sentimentLevel = visibilityIndex < 35 ? 'low' : visibilityIndex < 65 ? 'mid' : 'high';
  const sentiment = SENTIMENT_MAP[category][sentimentLevel];

  useEffect(() => {
    const diff = visibilityIndex - displayIndex;
    if (diff === 0) return;
    const step = diff > 0 ? 1 : -1;
    const timer = setTimeout(() => setDisplayIndex((v) => v + step), 12);
    return () => clearTimeout(timer);
  }, [visibilityIndex, displayIndex]);

  const sentimentColor =
    visibilityIndex < 35 ? { text: 'text-red-300', border: 'border-red-500/20', bg: 'bg-red-500/8', dot: 'bg-red-400', glow: 'shadow-red-500/10' } :
    visibilityIndex < 65 ? { text: 'text-amber-300', border: 'border-amber-500/20', bg: 'bg-amber-500/8', dot: 'bg-amber-400', glow: 'shadow-amber-500/10' } :
                           { text: 'text-emerald-300', border: 'border-emerald-500/20', bg: 'bg-emerald-500/8', dot: 'bg-emerald-400', glow: 'shadow-emerald-500/10' };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800/50 pb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
          AI Digital <span className="text-emerald-400">Twin</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-xl">
          Simula el impacto de tu estrategia digital y predice cómo te verán los motores de búsqueda de IA en tiempo real.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT — Control Panel */}
        <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-slate-900/80 to-slate-950/60 backdrop-blur-xl shadow-2xl p-7 space-y-8"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <BrainCircuit size={14} className="text-emerald-400" />
            </div>
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Panel de Control</h2>
          </div>

          {/* Slider: Review rate */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Velocidad de Reseñas Mensuales
              </label>
              <span className="text-sm font-bold text-white bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1 tabular-nums min-w-[3rem] text-center">
                {reviewRate}
              </span>
            </div>
            <div className="relative">
              <input
                type="range" min={0} max={30} value={reviewRate}
                onChange={(e) => setReviewRate(Number(e.target.value))}
                className="twin-slider w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #10b981 ${(reviewRate/30)*100}%, #1e293b ${(reviewRate/30)*100}%)`,
                }}
              />
              <div className="flex justify-between mt-1.5">
                <span className="text-xs text-slate-700">0</span>
                <span className="text-xs text-slate-700">30 / mes</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Bajo', val: 5, hint: '< 5/mes' },
                { label: 'Medio', val: 12, hint: '5-15/mes' },
                { label: 'Alto', val: 25, hint: '> 15/mes' },
              ].map((p) => (
                <button
                  key={p.val}
                  onClick={() => setReviewRate(p.val)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition-all duration-200 ${
                    reviewRate === p.val
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-800/40 border-slate-700/40 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {p.label}
                  <div className="text-[10px] font-normal opacity-60 mt-0.5">{p.hint}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Slider: Post frequency */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Frecuencia de Publicación Semanal
              </label>
              <span className="text-sm font-bold text-white bg-slate-800/80 border border-slate-700/60 rounded-lg px-2.5 py-1 tabular-nums min-w-[3rem] text-center">
                {postFreq}
              </span>
            </div>
            <div className="relative">
              <input
                type="range" min={0} max={7} value={postFreq}
                onChange={(e) => setPostFreq(Number(e.target.value))}
                className="twin-slider w-full h-2 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, #10b981 ${(postFreq/7)*100}%, #1e293b ${(postFreq/7)*100}%)`,
                }}
              />
              <div className="flex justify-between mt-1.5">
                <span className="text-xs text-slate-700">0</span>
                <span className="text-xs text-slate-700">7 / semana</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[0,1,3,7].map((v) => (
                <button
                  key={v}
                  onClick={() => setPostFreq(v)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition-all duration-200 ${
                    postFreq === v
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                      : 'bg-slate-800/40 border-slate-700/40 text-slate-500 hover:text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {v}x
                </button>
              ))}
            </div>
          </div>

          {/* Dropdown: Category */}
          <div className="space-y-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
              Optimización de Categorías de Búsqueda
            </label>
            <div className="relative">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryOption)}
                className="w-full bg-slate-800/80 border border-slate-700/60 rounded-xl px-4 py-3 pr-10 text-sm
                  text-slate-100 outline-none appearance-none cursor-pointer transition-all duration-200
                  focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            </div>
            <div className={`rounded-xl border px-4 py-3 text-xs leading-relaxed transition-all duration-300 ${
              category === 'basic'
                ? 'bg-slate-800/30 border-slate-700/40 text-slate-500'
                : category === 'optimized'
                ? 'bg-blue-500/8 border-blue-500/20 text-blue-400/80'
                : 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400/80'
            }`}>
              {category === 'basic' && 'Sin diferenciación semántica. Visibilidad general limitada.'}
              {category === 'optimized' && 'Facetas secundarias activas. Mejora el rastreo en búsquedas de nicho.'}
              {category === 'hyper' && 'Esquema estructurado 2026 activo. Máxima legibilidad para LLMs y modelos de IA conversacional.'}
            </div>
          </div>
        </div>

        {/* RIGHT — Simulation Viewer */}
        <div className="rounded-2xl border border-white/8 bg-gradient-to-br from-slate-900/80 to-slate-950/60 backdrop-blur-xl shadow-2xl p-7 flex flex-col gap-6"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
              <Zap size={14} className="text-emerald-400" />
            </div>
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Visor de Simulación</h2>
          </div>

          {/* Circular progress */}
          <div className="flex flex-col items-center gap-3 py-2">
            <CircularProgress value={displayIndex} size={192} />
            <div className="flex items-center gap-4 text-center">
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Nivel de Visibilidad</p>
                <p className={`text-xs font-bold px-3 py-1 rounded-full border transition-all duration-300 ${
                  displayIndex < 35
                    ? 'bg-red-500/15 border-red-500/25 text-red-300'
                    : displayIndex < 65
                    ? 'bg-amber-500/15 border-amber-500/25 text-amber-300'
                    : 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                }`}>
                  {displayIndex < 35 ? 'Invisible' : displayIndex < 65 ? 'Emergente' : 'Dominante'}
                </p>
              </div>
            </div>
          </div>

          {/* Projected clients card */}
          <div className="rounded-2xl border border-white/8 bg-slate-800/40 backdrop-blur-sm p-5 flex items-center gap-5"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)' }}>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <TrendingUp size={20} className="text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">Clientes Potenciales Proyectados</p>
              <div className="flex items-end gap-2">
                <span
                  className="text-3xl font-bold text-white tabular-nums"
                  style={{ transition: 'all 0.3s ease' }}
                >
                  {projectedClients.toLocaleString()}
                </span>
                <span className="text-slate-500 text-sm mb-1">/ mes</span>
              </div>
            </div>
            <div className="shrink-0">
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                projectedClients < 100 ? 'bg-red-400' : projectedClients < 300 ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
            </div>
          </div>

          {/* AI Sentiment box */}
          <div className={`rounded-2xl border p-5 flex flex-col gap-3 transition-all duration-500 ${sentimentColor.border} ${sentimentColor.bg}`}
            style={{ boxShadow: `0 4px 24px ${sentimentColor.glow.replace('shadow-', '').replace('/10', '')}` }}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${sentimentColor.dot}`} />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">AI Engine Search Sentiment</span>
            </div>
            <p className={`text-sm leading-relaxed font-medium transition-all duration-500 ${sentimentColor.text}`}>
              {sentiment}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1 rounded-full bg-slate-700/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    visibilityIndex < 35 ? 'bg-red-400' : visibilityIndex < 65 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${visibilityIndex}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 tabular-nums">{visibilityIndex}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Maps Scanner ─────────────────────────────────────────────────────────────

type ScanStatus = 'idle' | 'searching' | 'done';

interface AuditRec {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  optimized_text: string;
}

interface CheckItem {
  id: string;
  label: string;
  category: 'critical' | 'improvable' | 'optimized';
  checked: boolean;
}

const CHECKLIST_ITEMS: CheckItem[] = [
  { id: 'name',       label: 'Nombre del negocio correcto',         category: 'critical',   checked: false },
  { id: 'address',    label: 'Dirección verificada y completa',      category: 'critical',   checked: false },
  { id: 'phone',      label: 'Teléfono principal actualizado',       category: 'critical',   checked: false },
  { id: 'hours',      label: 'Horario de apertura configurado',      category: 'critical',   checked: false },
  { id: 'category',   label: 'Categoría principal bien definida',    category: 'critical',   checked: false },
  { id: 'website',    label: 'Web enlazada al perfil',               category: 'improvable', checked: false },
  { id: 'desc',       label: 'Descripción del negocio completa',     category: 'improvable', checked: false },
  { id: 'photos',     label: 'Más de 10 fotos publicadas',           category: 'improvable', checked: false },
  { id: 'reviews',    label: 'Al menos 5 reseñas respondidas',       category: 'improvable', checked: false },
  { id: 'posts',      label: 'Post publicado en los últimos 30 días',category: 'improvable', checked: false },
  { id: 'keywords',   label: 'Palabras clave en la descripción',     category: 'optimized',  checked: false },
  { id: 'qa',         label: 'Preguntas y respuestas activas',       category: 'optimized',  checked: false },
  { id: 'services',   label: 'Servicios/productos añadidos',         category: 'optimized',  checked: false },
  { id: 'attributes', label: 'Atributos del negocio configurados',   category: 'optimized',  checked: false },
];

function Speedometer({ score }: { score: number }) {
  const R = 90;
  const cx = 110;
  const cy = 110;
  const startAngle = 210;
  const endAngle = 330;
  const totalArc = 360 - startAngle + endAngle;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPoint = (angle: number) => ({
    x: cx + R * Math.cos(toRad(angle)),
    y: cy + R * Math.sin(toRad(angle)),
  });

  const describeArc = (start: number, end: number) => {
    const s = arcPoint(start);
    const e = arcPoint(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${R} ${R} 0 ${large} 1 ${e.x} ${e.y}`;
  };

  const scoreAngle = startAngle + (score / 100) * totalArc;

  const color =
    score < 40 ? '#ef4444' :
    score < 70 ? '#f59e0b' :
    '#10b981';

  const needleRad = toRad(scoreAngle);
  const needleTip = { x: cx + (R - 12) * Math.cos(needleRad), y: cy + (R - 12) * Math.sin(needleRad) };
  const needleBase1 = { x: cx + 8 * Math.cos(needleRad + Math.PI / 2), y: cy + 8 * Math.sin(needleRad + Math.PI / 2) };
  const needleBase2 = { x: cx + 8 * Math.cos(needleRad - Math.PI / 2), y: cy + 8 * Math.sin(needleRad - Math.PI / 2) };

  return (
    <svg viewBox="0 0 220 160" className="w-full max-w-[280px]">
      {/* Background track */}
      <path d={describeArc(startAngle, startAngle + totalArc)} fill="none" stroke="#1e293b" strokeWidth="14" strokeLinecap="round" />
      {/* Colored fill */}
      {score > 0 && (
        <path d={describeArc(startAngle, scoreAngle)} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
      )}
      {/* Tick marks */}
      {[0, 25, 50, 75, 100].map((v) => {
        const a = toRad(startAngle + (v / 100) * totalArc);
        const inner = { x: cx + (R - 20) * Math.cos(a), y: cy + (R - 20) * Math.sin(a) };
        const outer = { x: cx + (R - 8)  * Math.cos(a), y: cy + (R - 8)  * Math.sin(a) };
        return <line key={v} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#334155" strokeWidth="1.5" />;
      })}
      {/* Needle */}
      <polygon
        points={`${needleTip.x},${needleTip.y} ${needleBase1.x},${needleBase1.y} ${needleBase2.x},${needleBase2.y}`}
        fill={score > 0 ? color : '#475569'}
        opacity={0.9}
      />
      <circle cx={cx} cy={cy} r={6} fill={score > 0 ? color : '#475569'} />
      {/* Score text */}
      <text x={cx} y={cy + 28} textAnchor="middle" fill={score > 0 ? color : '#64748b'} fontSize="28" fontWeight="700" fontFamily="sans-serif">{score}</text>
      <text x={cx} y={cy + 43} textAnchor="middle" fill="#475569" fontSize="9" fontFamily="sans-serif">SALUD DE FICHA</text>
      {/* Labels */}
      <text x={arcPoint(startAngle).x - 2} y={arcPoint(startAngle).y + 14} textAnchor="middle" fill="#475569" fontSize="8" fontFamily="sans-serif">0</text>
      <text x={arcPoint(startAngle + totalArc).x + 2} y={arcPoint(startAngle + totalArc).y + 14} textAnchor="middle" fill="#475569" fontSize="8" fontFamily="sans-serif">100</text>
    </svg>
  );
}

function RecGroup({
  label, color, recs, copiedId, onCopy,
}: {
  label: string;
  color: 'red' | 'amber' | 'emerald';
  recs: AuditRec[];
  copiedId: string | null;
  onCopy: (rec: AuditRec) => void;
}) {
  const palette = {
    red:     { bg: 'bg-red-500/5',     header: 'text-red-400',     icon: 'text-red-500/60',     dot: 'bg-red-500' },
    amber:   { bg: 'bg-amber-500/5',   header: 'text-amber-400',   icon: 'text-amber-500/60',   dot: 'bg-amber-500' },
    emerald: { bg: 'bg-emerald-500/5', header: 'text-emerald-400', icon: 'text-emerald-500/60', dot: 'bg-emerald-500' },
  }[color];

  return (
    <div className={`px-5 py-4 ${palette.bg}`}>
      <p className={`text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5 ${palette.header}`}>
        <AlertCircle size={11} /> {label}
        <span className="ml-auto normal-case font-normal opacity-60">{recs.length} {recs.length === 1 ? 'tarea' : 'tareas'}</span>
      </p>
      <ul className="space-y-3">
        {recs.map((rec) => (
          <li key={rec.id} className="rounded-xl bg-slate-800/50 border border-slate-700/40 overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 border-b border-slate-700/30">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${palette.dot}`} />
                <span className="text-slate-200 text-xs font-semibold">{rec.title}</span>
              </div>
              <button
                onClick={() => onCopy(rec)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all duration-200 shrink-0 ${
                  copiedId === rec.id
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-slate-700/60 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-transparent'
                }`}
              >
                {copiedId === rec.id ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
              </button>
            </div>
            <p className="px-3 py-2.5 text-xs text-slate-400 leading-relaxed">{rec.optimized_text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MapsScanner({ previewMode }: { previewMode: boolean }) {
  const { session } = useAuth();
  const [businessName, setBusinessName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [hours, setHours] = useState('');
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [score, setScore] = useState(0);
  const [displayScore, setDisplayScore] = useState(0);
  const [recommendations, setRecommendations] = useState<AuditRec[]>([]);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const PREVIEW_RECS: AuditRec[] = [
    { id: 'r1', priority: 'high', title: 'Optimizar descripción con palabras clave', optimized_text: 'Peluquería López es tu salón de confianza en el corazón de Barcelona. Especializados en cortes modernos, coloración y tratamientos capilares para hombre y mujer. Más de 15 años cuidando el cabello de los barceloneses. Reserva tu cita hoy y descubre por qué somos la peluquería mejor valorada del Eixample. ¡Te esperamos en C/ Provença, 142!' },
    { id: 'r2', priority: 'high', title: 'Completar categorías secundarias', optimized_text: 'Categorías sugeridas: Peluquería, Salón de belleza, Barbería, Tratamiento capilar' },
    { id: 'r3', priority: 'medium', title: 'Añadir horario completo y festivos', optimized_text: 'Lunes a viernes: 9:00–20:00 · Sábado: 9:00–18:00 · Domingo: Cerrado · Festivos: Cerrado' },
    { id: 'r4', priority: 'medium', title: 'Incorporar servicios al perfil', optimized_text: 'Corte de cabello · Coloración · Balayage · Mechas · Tratamiento de queratina · Peinado para bodas · Alisado permanente · Corte masculino' },
    { id: 'r5', priority: 'low', title: 'Responder preguntas frecuentes', optimized_text: '¿Es necesario pedir cita? Sí, recomendamos reservar con antelación llamando al teléfono o por WhatsApp para garantizar tu horario preferido.' },
  ];

  const handleScan = async () => {
    if (!businessName.trim()) return;
    setStatus('searching');
    setScore(0);
    setDisplayScore(0);
    setRecommendations([]);
    setError('');

    try {
      let result: { score: number; recommendations: AuditRec[] };
      if (previewMode) {
        await new Promise((r) => setTimeout(r, 2000));
        result = { score: 62, recommendations: PREVIEW_RECS };
      } else {
        result = await callAuditMapsProfile(
          businessName, category, description, hours, session!.access_token
        );
      }
      setScore(result.score);
      setRecommendations(result.recommendations);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al analizar la ficha');
      setStatus('idle');
    }
  };

  useEffect(() => {
    if (status !== 'done') return;
    let current = 0;
    const step = Math.ceil(score / 50);
    const timer = setInterval(() => {
      current = Math.min(current + step, score);
      setDisplayScore(current);
      if (current >= score) clearInterval(timer);
    }, 25);
    return () => clearInterval(timer);
  }, [status, score]);

  const copyText = (rec: AuditRec) => {
    navigator.clipboard.writeText(rec.optimized_text).then(() => {
      setCopiedId(rec.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const highRecs   = recommendations.filter((r) => r.priority === 'high');
  const mediumRecs = recommendations.filter((r) => r.priority === 'medium');
  const lowRecs    = recommendations.filter((r) => r.priority === 'low');

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800/50 pb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
          Escáner de Ficha <span className="text-emerald-400">Google Maps</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-xl">
          Introduce los datos actuales de tu Google Business Profile. La IA auditará tu ficha y generará textos optimizados listos para copiar y pegar.
        </p>
      </div>

      {/* Input form */}
      <div className="rounded-2xl bg-slate-900/70 border border-slate-800/60 p-6 shadow-xl space-y-5 max-w-3xl">
        <div className="flex items-center gap-2 mb-1">
          <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#ea4335"/>
            <circle cx="12" cy="9" r="2.5" fill="white"/>
          </svg>
          <h2 className="font-semibold text-slate-200 text-sm">Datos actuales de tu ficha</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 size={11} className="text-slate-500" />
              Nombre del negocio <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder='Ej: Peluquería López Barcelona'
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                placeholder-slate-600 outline-none transition-all duration-200
                focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Tag size={11} className="text-slate-500" />
              Categoría principal
            </label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder='Ej: Peluquería, Restaurante, Fontanero...'
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                placeholder-slate-600 outline-none transition-all duration-200
                focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <FileText size={11} className="text-slate-500" />
            Descripción actual
            <span className="ml-1 text-slate-600 normal-case font-normal">(déjalo vacío si no tienes)</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder='Copia aquí tu descripción actual de Google Business Profile...'
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
              placeholder-slate-600 outline-none resize-none transition-all duration-200
              focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock size={11} className="text-slate-500" />
            Horario de apertura
            <span className="ml-1 text-slate-600 normal-case font-normal">(déjalo vacío si no está configurado)</span>
          </label>
          <input
            type="text"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder='Ej: Lun-Vie 9:00-20:00, Sáb 10:00-14:00, Dom cerrado'
            className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
              placeholder-slate-600 outline-none transition-all duration-200
              focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/10 focus:bg-slate-800"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertCircle size={13} className="shrink-0" />
            {error}
          </div>
        )}

        <button
          onClick={handleScan}
          disabled={status === 'searching' || !businessName.trim()}
          className="flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400
            text-slate-950 text-sm font-bold transition-all duration-200 shadow-md shadow-emerald-500/25
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status === 'searching' ? (
            <><Loader2 size={14} className="animate-spin" /> Analizando con IA...</>
          ) : (
            <><Search size={14} /> Auditar Ficha con IA</>
          )}
        </button>
      </div>

      {/* Results */}
      {status !== 'idle' && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Speedometer */}
          <div className="lg:col-span-2 rounded-2xl bg-slate-900/70 border border-slate-800/60 p-6 flex flex-col items-center justify-center gap-4 shadow-xl">
            {status === 'searching' ? (
              <div className="flex flex-col items-center gap-4 py-8">
                <svg className="animate-spin w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
                <p className="text-slate-400 text-sm font-medium">La IA está auditando tu ficha...</p>
              </div>
            ) : (
              <>
                <Speedometer score={displayScore} />
                <div className="text-center">
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-widest mb-2">Estado de la ficha</p>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                    displayScore < 40
                      ? 'bg-red-500/15 border-red-500/25 text-red-300'
                      : displayScore < 70
                      ? 'bg-amber-500/15 border-amber-500/25 text-amber-300'
                      : 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                  }`}>
                    {displayScore < 40 ? 'Ficha Deficiente' : displayScore < 70 ? 'Ficha Mejorable' : 'Ficha Optimizada'}
                  </span>
                </div>
                <div className="w-full bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 mb-0.5">Mejoras detectadas</p>
                  <p className="text-white font-bold text-lg">{recommendations.length} <span className="text-slate-500 font-normal text-sm">recomendaciones</span></p>
                </div>
              </>
            )}
          </div>

          {/* Recommendations checklist */}
          <div className="lg:col-span-3 rounded-2xl bg-slate-900/70 border border-slate-800/60 shadow-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800/60 flex items-center gap-2">
              <CheckSquare size={15} className="text-emerald-400" />
              <h3 className="text-sm font-semibold text-slate-200">Recomendaciones con texto optimizado</h3>
            </div>
            <div className="divide-y divide-slate-800/40 max-h-[560px] overflow-y-auto">
              {status === 'searching' ? (
                <div className="p-5 space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="space-y-2 animate-pulse">
                      <div className="h-4 bg-slate-800 rounded w-2/3" />
                      <div className="h-16 bg-slate-800/60 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {highRecs.length > 0 && (
                    <RecGroup label="Crítico" color="red" recs={highRecs} copiedId={copiedId} onCopy={copyText} />
                  )}
                  {mediumRecs.length > 0 && (
                    <RecGroup label="Mejorable" color="amber" recs={mediumRecs} copiedId={copiedId} onCopy={copyText} />
                  )}
                  {lowRecs.length > 0 && (
                    <RecGroup label="Optimizado" color="emerald" recs={lowRecs} copiedId={copiedId} onCopy={copyText} />
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Idle state */}
      {status === 'idle' && (
        <div className="rounded-2xl border border-dashed border-slate-800 p-16 flex flex-col items-center justify-center text-center gap-4 bg-slate-900/20">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center">
            <MapPinned size={24} className="text-slate-500" />
          </div>
          <div>
            <p className="text-slate-400 font-medium text-sm">Rellena los datos de tu ficha para comenzar</p>
            <p className="text-slate-600 text-xs mt-1">La IA analizará tu perfil y generará textos optimizados listos para copiar</p>
          </div>
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
  const [tab, setTab] = useState<'generator' | 'saved' | 'maps-scanner' | 'ai-twin'>('generator');
  const [product, setProduct] = useState('');
  const [city, setCity] = useState('');
  const [platform, setPlatform] = useState<Platform>('');
  const [keywords, setKeywords] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<SEOResult | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [apiError, setApiError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [contentPlan, setContentPlan] = useState<DayPlan[] | null>(null);
  const [isLoadingPlan, setIsLoadingPlan] = useState(false);
  const [planError, setPlanError] = useState('');
  const [directorios, setDirectorios] = useState<Directorio[] | null>(null);
  const [isScanningDirs, setIsScanningDirs] = useState(false);
  const [napBusinessName, setNapBusinessName] = useState('');
  const [napAddress, setNapAddress] = useState('');
  const [napPhone, setNapPhone] = useState('');
  const [expandedDirId, setExpandedDirId] = useState<string | null>(null);
  const [dirError, setDirError] = useState('');

  const handleImageFile = (file: File | null) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
  };

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
    setInsightsOpen(true);
    try {
      let data: SEOResult;
      if (previewMode) {
        await new Promise((r) => setTimeout(r, 1200));
        const plat = platform || 'Etsy';
        const loc = city || 'tu ciudad';
        const compKeywords: string[] = competitor.trim()
          ? [
              `alternativa a ${competitor.trim().split(/\s+/)[0]}`,
              `${product.toLowerCase()} mejor precio ${loc}`,
              `${product.toLowerCase()} sin intermediarios`,
            ]
          : [
              `${product.toLowerCase()} cerca de mi`,
              `${product.toLowerCase()} barato ${loc}`,
              `donde comprar ${product.toLowerCase()} ${loc}`,
            ];
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
          competitorKeywords: compKeywords,
          imageOptimization: imageFile ? {
            filename: [product, city, platform]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9\s]/g, '')
              .trim()
              .replace(/\s+/g, '-') + '.jpg',
            altText: [product, city && `en ${city}`, platform && `para ${platform}`]
              .filter(Boolean)
              .join(' ') + ' — artesanal, hecho a mano',
          } : undefined,
        };
      } else {
        data = await callGenerateSEO(product, city, platform, keywords, session!.access_token, imageFile);
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
          .from('saved_seo')
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

  const nbiz = napBusinessName || '[Nombre del negocio]';
  const nadr = napAddress || '[Calle], [Número], [CP] ' + (city || '[Ciudad]') + ', España';
  const ntel = napPhone || '+34 [teléfono]';
  const napDesc = `${nbiz} es un negocio local especializado en ${product} ubicado en ${city || '[Ciudad]'}. Ofrecemos ${product} de calidad con atención personalizada para nuestros clientes de ${city || '[Ciudad]'} y alrededores. Nos distinguimos por nuestro compromiso con la calidad y el servicio al cliente. Visítanos en ${nadr} o llámanos al ${ntel}. Somos tu mejor opción local para ${product} en ${city || '[Ciudad]'}. ¡Contáctanos hoy!`;

  const PREVIEW_DIRECTORIES: Directorio[] = [
    {
      id: 'gmb', nombre: 'Google Business Profile', url: 'https://business.google.com',
      relevancia: 'Alta', categoria: 'Buscadores', estado: 'Pendiente',
      razon: `Es el directorio más importante para aparecer en Google Maps y búsquedas locales de "${product} en ${city || '[ciudad]'}". Imprescindible.`,
      nap: { nombre_negocio: nbiz, direccion: nadr, telefono: ntel, descripcion: napDesc, categoria_sugerida: product },
    },
    {
      id: 'pa', nombre: 'Páginas Amarillas', url: 'https://www.paginasamarillas.es',
      relevancia: 'Alta', categoria: 'Directorios ES', estado: 'Pendiente',
      razon: `Directorio de referencia en España con alta autoridad de dominio. Clave para ${product} en mercados locales como ${city || '[ciudad]'}.`,
      nap: { nombre_negocio: nbiz, direccion: nadr, telefono: ntel, descripcion: napDesc, categoria_sugerida: product },
    },
    {
      id: 'yelp', nombre: 'Yelp España', url: 'https://biz.yelp.es',
      relevancia: 'Alta', categoria: 'Reseñas', estado: 'Pendiente',
      razon: `Plataforma de reseñas con fuerte impacto en decisiones de compra locales. Muy consultada en ciudades como ${city || '[ciudad]'}.`,
      nap: { nombre_negocio: nbiz, direccion: nadr, telefono: ntel, descripcion: napDesc, categoria_sugerida: product },
    },
    {
      id: 'bing', nombre: 'Bing Places', url: 'https://www.bingplaces.com',
      relevancia: 'Media', categoria: 'Buscadores', estado: 'Pendiente',
      razon: `Segundo buscador en cuota de mercado en España. Completar el perfil tarda 5 minutos y amplía la cobertura orgánica.`,
      nap: { nombre_negocio: nbiz, direccion: nadr, telefono: ntel, descripcion: napDesc, categoria_sugerida: product },
    },
    {
      id: 'einf', nombre: 'Einforma', url: 'https://www.einforma.com',
      relevancia: 'Media', categoria: 'Directorios ES', estado: 'Pendiente',
      razon: `Directorio empresarial español con alta visibilidad en búsquedas B2C y B2B de ${product} a nivel nacional.`,
      nap: { nombre_negocio: nbiz, direccion: nadr, telefono: ntel, descripcion: napDesc, categoria_sugerida: product },
    },
  ];

  const handleScanDirectories = async () => {
    setIsScanningDirs(true);
    setDirError('');
    setExpandedDirId(null);
    try {
      if (previewMode) {
        await new Promise((r) => setTimeout(r, 1400));
        setDirectorios(PREVIEW_DIRECTORIES);
      } else {
        const dirs = await callScanDirectories(
          product, city, napBusinessName, napAddress, napPhone, session!.access_token
        );
        setDirectorios(dirs);
      }
    } catch (err) {
      setDirError(err instanceof Error ? err.message : 'Error al escanear directorios');
    } finally {
      setIsScanningDirs(false);
    }
  };

  const toggleDirEstado = (id: string) => {
    setDirectorios((prev) =>
      prev
        ? prev.map((d) => d.id === id ? { ...d, estado: d.estado === 'Pendiente' ? 'Enviado' : 'Pendiente' } : d)
        : prev
    );
  };

  const canGenerate = product.trim().length > 0;

  const p = product || 'tu producto';
  const c = city || 'tu ciudad';
  const cSlug = (city || 'Local').replace(/\s/g, '');
  const pSlug = (product || 'Producto').replace(/\s/g, '');

  const PREVIEW_PLAN: DayPlan[] = [
    {
      day: 1, platform: 'Instagram',
      hooks: [
        `¿Sabías que cada ${p} que hacemos tarda horas en completarse? Te lo mostramos.`,
        `Nadie te ha enseñado cómo se hace un ${p} de verdad. Hasta hoy.`,
        `Esto es lo que pasa en nuestro taller antes de que recibas tu ${p}.`,
      ],
      content_ideas: [
        `Muestra el proceso de creación de ${p} desde el inicio en tu taller de ${c}.`,
        `Carrusel con fotos de cada etapa del proceso artesanal, explicando cada paso.`,
        `Reel de 30 segundos en time-lapse mostrando el trabajo completo de un pedido.`,
      ],
      local_hashtags: [`#${cSlug}ConsumoLocal`, `#${pSlug}Artesanal`, `#HechoEn${cSlug}`],
    },
    {
      day: 2, platform: 'TikTok',
      hooks: [
        `POV: Pediste un ${p} artesanal en ${c} y así llegó a tu puerta.`,
        `Antes vs Después: así transformamos la materia prima en ${p}.`,
        `Di que no es perfecto sin decir que no es perfecto. Spoiler: sí lo es.`,
      ],
      content_ideas: [
        `Vídeo "antes y después" del ${p} terminado, con música tendencia.`,
        `Unboxing del pedido desde la perspectiva del cliente, grabado por el equipo.`,
        `Transición rápida mostrando el material en bruto y el producto final terminado.`,
      ],
      local_hashtags: [`#${pSlug}${cSlug}`, `#HechoAMano`, `#ArtesaníaLocal`],
    },
    {
      day: 3, platform: 'Instagram',
      hooks: [
        `"No pensaba que encontraría algo así tan cerca de casa" — esto nos escribió un cliente.`,
        `La mejor reseña que hemos recibido este mes viene de ${c}.`,
        `Cuando un cliente de ${c} te deja sin palabras con su comentario.`,
      ],
      content_ideas: [
        `Carrusel con reseña real de un cliente de ${c} y foto del producto recibido.`,
        `Post de texto con cita literal del cliente + imagen del producto en su entorno.`,
        `Historia destacada con pantallazos de mensajes de clientes satisfechos de ${c}.`,
      ],
      local_hashtags: [`#Hecho${cSlug}`, `#CompraCercano`, `#${cSlug}Recomienda`],
    },
    {
      day: 4, platform: 'TikTok',
      hooks: [
        `Busqué "${p} en ${c}" y lo que encontré me sorprendió.`,
        `Respondiendo a los comentarios más frecuentes sobre ${p} en ${c}.`,
        `Lo que nadie te cuenta cuando buscas ${p} en internet.`,
      ],
      content_ideas: [
        `Reacciona a una búsqueda en Google de "${p} ${c}" mostrando los resultados reales.`,
        `Vídeo respondiendo las 3 preguntas más comunes que recibís sobre ${p}.`,
        `Dueto o stitch con un creador que habló de tu nicho, añadiendo tu perspectiva local.`,
      ],
      local_hashtags: [`#${cSlug}ShopLocal`, `#TendenciasLocal`, `#${pSlug}Online`],
    },
    {
      day: 5, platform: 'Instagram',
      hooks: [
        `Si vas a comprar ${p} esta semana, lee esto antes.`,
        `3 errores que comete casi todo el mundo al elegir ${p} por internet.`,
        `Esto es lo que diferencia un buen ${p} de uno mediocre. Hilo.`,
      ],
      content_ideas: [
        `Carrusel educativo: 3 errores al comprar ${p} online y cómo evitarlos.`,
        `Guía rápida en 5 pasos para elegir el mejor ${p} según tu necesidad.`,
        `Post comparativo mostrando diferencias de calidad con contexto local de ${c}.`,
      ],
      local_hashtags: [`#Consejos${pSlug}`, `#CompraBien`, `#${cSlug}Calidad`],
    },
    {
      day: 6, platform: 'TikTok',
      hooks: [
        `Lo que nadie te cuenta del trabajo detrás de un pedido artesanal de ${p}.`,
        `Así empieza nuestro día en el taller de ${c}. No es lo que imaginas.`,
        `Un día trabajando en ${c}: esto es lo que realmente hacemos.`,
      ],
      content_ideas: [
        `Vlog rápido de un día en el taller: desde la apertura hasta el envío del último pedido.`,
        `Vídeo mostrando las herramientas y materiales que usáis cada día para crear ${p}.`,
        `"Lo que me llevé de un día de trabajo" mostrando el producto terminado y el equipo.`,
      ],
      local_hashtags: [`#Emprendedor${cSlug}`, `#DetrasDelTaller`, `#VidaArtesana`],
    },
    {
      day: 7, platform: 'Instagram',
      hooks: [
        `Solo hoy, solo para vosotros. Nuevo lote de ${p} disponible. Link en bio.`,
        `Esta semana tenemos algo especial para los seguidores de ${c}. ¿Listo?`,
        `Últimas unidades del lote de ${p}. Cuando se acaben, se acaban.`,
      ],
      content_ideas: [
        `Oferta o lanzamiento semanal exclusivo para seguidores, con foto del producto nuevo.`,
        `Carrusel mostrando el nuevo lote de ${p} con detalles, colores y disponibilidad.`,
        `Story interactiva con encuesta sobre el próximo producto o diseño para ${c}.`,
      ],
      local_hashtags: [`#${pSlug}${cSlug}`, `#OfertaLocal`, `#NuevoLote${cSlug}`],
    },
  ];

  const handleGeneratePlan = async () => {
    setIsLoadingPlan(true);
    setPlanError('');
    setContentPlan(null);
    try {
      if (previewMode) {
        await new Promise((r) => setTimeout(r, 1400));
        setContentPlan(PREVIEW_PLAN);
      } else {
        const days = await callGenerateContentPlan(product, city, platform, result?.description ?? '', session!.access_token);
        setContentPlan(days);
      }
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Error al generar el calendario');
    } finally {
      setIsLoadingPlan(false);
    }
  };

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
        <button
          onClick={() => setTab('maps-scanner')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${tab === 'maps-scanner'
              ? 'bg-slate-800 text-white shadow-md'
              : 'text-slate-500 hover:text-slate-300'}`}
        >
          <MapPinned size={14} />
          Escáner de Ficha Maps
        </button>
        <button
          onClick={() => setTab('ai-twin')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200
            ${tab === 'ai-twin'
              ? 'bg-slate-800 text-white shadow-md'
              : 'text-slate-500 hover:text-slate-300'}`}
        >
          <BrainCircuit size={14} />
          AI Digital Twin
        </button>
      </div>

      {tab === 'saved' ? (
        <div>
          <SavedTexts previewMode={previewMode} />
        </div>
      ) : tab === 'maps-scanner' ? (
        <MapsScanner previewMode={previewMode} />
      ) : tab === 'ai-twin' ? (
        <AiDigitalTwin />
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

          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <ImagePlus size={11} className="text-slate-500" />
              Optimizar Imagen del Producto
              <span className="text-slate-600 normal-case font-normal">(Opcional)</span>
            </label>
            {imagePreview ? (
              <div className="relative rounded-xl overflow-hidden border border-slate-700/80 group">
                <img
                  src={imagePreview}
                  alt="Vista previa"
                  className="w-full h-40 object-cover"
                />
                <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button
                    onClick={removeImage}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/90 text-white text-xs font-semibold hover:bg-red-400 transition-colors shadow-lg"
                  >
                    <X size={13} />
                    Eliminar imagen
                  </button>
                </div>
                <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2 bg-slate-950/70 backdrop-blur-sm rounded-lg px-2.5 py-1.5">
                  <Image size={11} className="text-slate-400 shrink-0" />
                  <span className="text-xs text-slate-300 truncate">{imageFile?.name}</span>
                </div>
              </div>
            ) : (
              <label
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const file = e.dataTransfer.files[0];
                  if (file) handleImageFile(file);
                }}
                className={`flex flex-col items-center justify-center gap-3 w-full rounded-xl border-2 border-dashed
                  py-8 px-4 cursor-pointer transition-all duration-200
                  ${isDragging
                    ? 'border-emerald-500/60 bg-emerald-500/8 scale-[0.99]'
                    : 'border-slate-700/60 bg-slate-800/30 hover:border-slate-600/80 hover:bg-slate-800/50'}`}
              >
                <input
                  type="file"
                  accept="image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => handleImageFile(e.target.files?.[0] ?? null)}
                />
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors
                  ${isDragging ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-slate-700/60 border border-slate-600/50'}`}>
                  <ImagePlus size={18} className={isDragging ? 'text-emerald-400' : 'text-slate-500'} />
                </div>
                <div className="text-center">
                  <p className={`text-xs font-semibold transition-colors ${isDragging ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {isDragging ? 'Suelta la imagen aquí' : 'Arrastra una imagen o haz clic para subir'}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">JPEG o PNG — max. 10 MB</p>
                </div>
              </label>
            )}
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
                <option value="WooCommerce" className="bg-slate-900">WooCommerce</option>
                <option value="Amazon" className="bg-slate-900">Amazon</option>
                <option value="eBay" className="bg-slate-900">eBay</option>
                <option value="Wallapop" className="bg-slate-900">Wallapop</option>
                <option value="Vinted" className="bg-slate-900">Vinted</option>
                <option value="Facebook Marketplace" className="bg-slate-900">Facebook Marketplace</option>
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

          {/* Competitor */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Search size={11} className="text-slate-500" />
              Enlace o nombre de un competidor local
              <span className="text-slate-600 normal-case font-normal">(Opcional)</span>
            </label>
            <input
              type="text"
              value={competitor}
              onChange={(e) => setCompetitor(e.target.value)}
              placeholder="ej. TiendaRopaBarcelona, https://etsy.com/shop/micompetidor..."
              className="w-full bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-100
                placeholder-slate-500 outline-none transition-all duration-200
                focus:border-amber-500/40 focus:ring-2 focus:ring-amber-500/10 focus:bg-slate-800"
            />
            <p className="text-xs text-slate-600">
              La IA detectara oportunidades de posicionamiento frente a ese competidor.
            </p>
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
                Analizar Competencia y Generar SEO
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
                  Completa el formulario y pulsa "Analizar Competencia y Generar SEO"
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
              {/* Insights de la Competencia — collapsible */}
              {result?.competitorKeywords && result.competitorKeywords.length > 0 && (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 overflow-hidden">
                  <button
                    onClick={() => setInsightsOpen((o) => !o)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left group"
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                      <span>🎯</span>
                      Insights de la Competencia
                      <span className="text-xs font-normal text-amber-400/60 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
                        {result.competitorKeywords.length} oportunidades
                      </span>
                    </span>
                    <ChevronRight
                      size={14}
                      className={`text-amber-400/60 transition-transform duration-200 group-hover:text-amber-300 ${insightsOpen ? 'rotate-90' : ''}`}
                    />
                  </button>
                  {insightsOpen && (
                    <div className="border-t border-amber-500/15 px-4 py-4">
                      <p className="text-xs text-amber-400/70 mb-3">
                        Palabras clave de oportunidad detectadas frente a la competencia:
                      </p>
                      <ol className="space-y-2">
                        {result.competitorKeywords.map((kw, i) => (
                          <li key={kw} className="flex items-start gap-3">
                            <span className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                              {i + 1}
                            </span>
                            <span className="text-slate-200 text-sm font-medium">{kw}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              )}

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

              {/* Image Optimization */}
              {result?.imageOptimization && (
                <div className="rounded-2xl border border-slate-800/60 bg-slate-900/70 overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                    <div className="w-6 h-6 rounded-lg bg-slate-800 border border-slate-700/60 flex items-center justify-center">
                      <Image size={12} className="text-slate-400" />
                    </div>
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Optimización de Imagen</span>
                  </div>
                  <div className="p-4 space-y-4">
                    {/* Filename */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Nombre de archivo sugerido</p>
                      <div className="flex items-center gap-2 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2.5">
                        <code className="flex-1 text-xs text-emerald-300 font-mono truncate">
                          {result.imageOptimization.filename}
                        </code>
                        <CopyButton text={result.imageOptimization.filename} />
                      </div>
                      <p className="text-xs text-slate-600">Renombra tu archivo con este nombre antes de subirlo.</p>
                    </div>
                    {/* Alt text */}
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Texto Alternativo (Alt Text)</p>
                      <div className="flex items-start gap-2 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2.5">
                        <p className="flex-1 text-xs text-slate-200 leading-relaxed">{result.imageOptimization.altText}</p>
                        <CopyButton text={result.imageOptimization.altText} />
                      </div>
                      <p className="text-xs text-slate-600">Pégalo en el campo alt="" de tu imagen en la plataforma.</p>
                    </div>
                  </div>
                </div>
              )}

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

      {/* ── 7-Day Content Calendar ─────────────────────────────── */}
      {isActive && hasGenerated && (
        <div className="mt-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0">
                <Calendar size={16} className="text-violet-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">
                  Plan de Contenidos Local <span className="text-violet-400">(7 días)</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">Instagram y TikTok adaptados a tu producto y ciudad</p>
              </div>
            </div>
            <button
              onClick={handleGeneratePlan}
              disabled={isLoadingPlan}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 shrink-0
                ${isLoadingPlan
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 hover:-translate-y-0.5 active:translate-y-0'
                }`}
            >
              {isLoadingPlan ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Generando calendario...</>
              ) : (
                <><Calendar size={15} />{contentPlan ? 'Regenerar Calendario' : 'Generar Calendario de Contenido para Redes'}</>
              )}
            </button>
          </div>

          {planError && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
              <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-red-400 text-sm">{planError}</p>
            </div>
          )}

          {contentPlan && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {contentPlan.map((day) => {
                const isInsta = day.platform?.toLowerCase().includes('instagram');
                const isTikTok = day.platform?.toLowerCase().includes('tiktok');
                const colorClass = isInsta
                  ? 'from-pink-500/8 border-pink-500/20 hover:shadow-pink-500/10'
                  : isTikTok
                    ? 'from-cyan-500/8 border-cyan-500/20 hover:shadow-cyan-500/10'
                    : 'from-violet-500/8 border-violet-500/20 hover:shadow-violet-500/10';
                const badgeClass = isInsta
                  ? 'bg-pink-500/15 border-pink-500/25 text-pink-300'
                  : isTikTok
                    ? 'bg-cyan-500/15 border-cyan-500/25 text-cyan-300'
                    : 'bg-violet-500/15 border-violet-500/25 text-violet-300';
                const accentText = isInsta ? 'text-pink-400' : isTikTok ? 'text-cyan-400' : 'text-violet-400';
                const hashBgClass = isInsta
                  ? 'bg-pink-500/8 border-pink-500/15'
                  : isTikTok
                    ? 'bg-cyan-500/8 border-cyan-500/15'
                    : 'bg-violet-500/8 border-violet-500/15';
                const hashTextClass = isInsta ? 'text-pink-300' : isTikTok ? 'text-cyan-300' : 'text-violet-300';

                const hooks: string[] = Array.isArray(day.hooks) ? day.hooks
                  : typeof (day as unknown as { hook?: string }).hook === 'string'
                    ? [(day as unknown as { hook: string }).hook]
                    : [];
                const ideas: string[] = Array.isArray(day.content_ideas) ? day.content_ideas
                  : typeof (day as unknown as { content_idea?: string }).content_idea === 'string'
                    ? [(day as unknown as { content_idea: string }).content_idea]
                    : [];
                const tags: string[] = Array.isArray(day.local_hashtags)
                  ? day.local_hashtags
                  : typeof day.local_hashtags === 'string'
                    ? (day.local_hashtags as string).split(/[\s,]+/).filter(Boolean)
                    : [];

                return (
                  <div
                    key={day.day}
                    className={`rounded-2xl border bg-gradient-to-b to-slate-900/80 p-4 space-y-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${colorClass}`}
                  >
                    {/* Day + platform badge */}
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${accentText}`}>Día {day.day}</span>
                      <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                        {isInsta ? <Instagram size={10} /> : isTikTok ? <Video size={10} /> : <Globe size={10} />}
                        {day.platform}
                      </span>
                    </div>

                    {/* Hooks */}
                    {hooks.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Zap size={10} className="text-emerald-400 shrink-0" />
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ganchos</span>
                        </div>
                        <ol className="space-y-1.5">
                          {hooks.map((h, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-emerald-500 text-xs font-bold shrink-0 mt-0.5">{i + 1}.</span>
                              <p className="text-xs text-slate-200 leading-relaxed italic">"{h}"</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Content ideas */}
                    {ideas.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Lightbulb size={10} className="text-amber-400 shrink-0" />
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Ideas de contenido</span>
                        </div>
                        <ol className="space-y-1.5">
                          {ideas.map((idea, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-amber-500 text-xs font-bold shrink-0 mt-0.5">{i + 1}.</span>
                              <p className="text-xs text-slate-300 leading-relaxed">{idea}</p>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Divider */}
                    <div className="border-t border-slate-800" />

                    {/* Hashtags */}
                    {tags.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Hash size={10} className={accentText + ' shrink-0'} />
                          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Hashtags</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {tags.map((tag, i) => {
                            const normalized = tag.startsWith('#') ? tag : `#${tag}`;
                            return (
                              <div key={i} className={`flex items-center gap-1 rounded-lg px-2 py-1 border ${hashBgClass}`}>
                                <span className={`text-xs font-mono font-medium ${hashTextClass}`}>{normalized}</span>
                                <CopyButton text={normalized} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Citation & Directories Finder ─────────────────────── */}
      {isActive && hasGenerated && (
        <div className="mt-8 mb-4">
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center shrink-0">
                <MapPinned size={16} className="text-amber-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white leading-tight">
                  Buscador de Citaciones y{' '}
                  <span className="text-amber-400">Directorios Locales</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  La IA selecciona los 5 directorios óptimos para tu sector y formatea tus datos NAP
                </p>
              </div>
            </div>
            <button
              onClick={handleScanDirectories}
              disabled={isScanningDirs}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300 shrink-0
                ${isScanningDirs
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 hover:-translate-y-0.5 active:translate-y-0'
                }`}
            >
              {isScanningDirs ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Analizando directorios...</>
              ) : (
                <><MapPinned size={15} />{directorios ? 'Volver a escanear' : 'Escanear Directorios de Oportunidad'}</>
              )}
            </button>
          </div>

          {/* NAP inputs */}
          <div className="rounded-xl bg-slate-900/60 border border-slate-800 p-4 mb-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Building2 size={11} className="text-amber-400" />
              Datos NAP del negocio
              <span className="font-normal text-slate-600 normal-case tracking-normal ml-1">— se usan para formatear las fichas de registro</span>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Building2 size={10} className="shrink-0" />Nombre del negocio
                </label>
                <input
                  value={napBusinessName}
                  onChange={(e) => setNapBusinessName(e.target.value)}
                  placeholder="Ej: Taller Artesanal García"
                  className="w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <MapPin size={10} className="shrink-0" />Dirección completa
                </label>
                <input
                  value={napAddress}
                  onChange={(e) => setNapAddress(e.target.value)}
                  placeholder="Calle Mayor 5, 28001 Madrid"
                  className="w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                />
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Phone size={10} className="shrink-0" />Teléfono
                </label>
                <input
                  value={napPhone}
                  onChange={(e) => setNapPhone(e.target.value)}
                  placeholder="+34 600 000 000"
                  className="w-full bg-slate-800/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {dirError && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm">{dirError}</p>
            </div>
          )}

          {directorios && (
            <>
              {/* Progress bar */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${(directorios.filter((d) => d.estado === 'Enviado').length / directorios.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-semibold text-slate-400 shrink-0">
                  <span className="text-white">{directorios.filter((d) => d.estado === 'Enviado').length}</span>
                  /{directorios.length} enviados
                </span>
              </div>

              {/* Table */}
              <div className="rounded-2xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-900 border-b border-slate-800">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider w-8">#</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Nombre del Directorio</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Razón IA</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Relevancia</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">NAP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {directorios.map((dir, idx) => {
                      const relevColors: Record<DirecRelevancia, string> = {
                        Alta:  'bg-emerald-500/15 border-emerald-500/25 text-emerald-300',
                        Media: 'bg-amber-500/15 border-amber-500/25 text-amber-300',
                        Baja:  'bg-slate-700/60 border-slate-600 text-slate-400',
                      };
                      const sent = dir.estado === 'Enviado';
                      const expanded = expandedDirId === dir.id;

                      return (
                        <React.Fragment key={dir.id}>
                          <tr
                            className={`transition-colors duration-150 ${idx % 2 === 0 ? 'bg-slate-950/40' : 'bg-slate-900/30'} hover:bg-slate-800/30`}
                          >
                            <td className="px-4 py-3 text-xs text-slate-600 font-mono">{idx + 1}</td>

                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${sent ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                                  {dir.nombre}
                                </span>
                                <a
                                  href={dir.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-slate-600 hover:text-amber-400 transition-colors shrink-0"
                                >
                                  <ExternalLink size={11} />
                                </a>
                              </div>
                              <span className="text-xs text-slate-600 hidden sm:inline lg:hidden">{dir.categoria}</span>
                            </td>

                            <td className="px-4 py-3 hidden lg:table-cell max-w-xs">
                              <p className="text-xs text-slate-400 leading-relaxed line-clamp-2">{dir.razon ?? '—'}</p>
                            </td>

                            <td className="px-4 py-3 hidden sm:table-cell">
                              <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${relevColors[dir.relevancia]}`}>
                                {dir.relevancia}
                              </span>
                            </td>

                            <td className="px-4 py-3">
                              <button
                                onClick={() => toggleDirEstado(dir.id)}
                                className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all duration-200
                                  ${sent
                                    ? 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300 hover:bg-emerald-500/25'
                                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-amber-300'
                                  }`}
                              >
                                {sent ? <><CheckCircle2 size={11} />Enviado</> : <><Circle size={11} />Pendiente</>}
                              </button>
                            </td>

                            <td className="px-4 py-3 text-center">
                              {dir.nap ? (
                                <button
                                  onClick={() => setExpandedDirId(expanded ? null : dir.id)}
                                  className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all duration-200
                                    ${expanded
                                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-amber-300'
                                    }`}
                                  title="Ver datos NAP formateados"
                                >
                                  Ver NAP
                                  <ChevronDown size={11} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                                </button>
                              ) : (
                                <span className="text-slate-700 text-xs">—</span>
                              )}
                            </td>
                          </tr>

                          {/* NAP expansion row */}
                          {expanded && dir.nap && (
                            <tr key={`${dir.id}-nap`} className="bg-amber-500/4 border-b border-amber-500/10">
                              <td colSpan={6} className="px-4 py-4">
                                <div className="rounded-xl border border-amber-500/15 bg-slate-950/60 p-4 space-y-3">
                                  <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                    <Building2 size={11} />
                                    Datos NAP formateados para {dir.nombre}
                                    <span className="ml-1 font-normal text-slate-500 normal-case tracking-normal">— copia estos datos exactamente en el directorio</span>
                                  </p>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* Nombre */}
                                    <NapField label="Nombre del negocio" icon={<Building2 size={11} />} value={dir.nap.nombre_negocio} />
                                    {/* Dirección */}
                                    <NapField label="Dirección" icon={<MapPin size={11} />} value={dir.nap.direccion} />
                                    {/* Teléfono */}
                                    <NapField label="Teléfono" icon={<Phone size={11} />} value={dir.nap.telefono} />
                                    {/* Categoría sugerida */}
                                    <NapField label="Categoría sugerida" icon={<MapPinned size={11} />} value={dir.nap.categoria_sugerida} />
                                  </div>

                                  {/* Descripción */}
                                  <div className="space-y-1.5">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Descripción optimizada</span>
                                    <div className="relative group rounded-lg bg-slate-900 border border-slate-800 p-3 pr-10">
                                      <p className="text-xs text-slate-300 leading-relaxed">{dir.nap.descripcion}</p>
                                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <CopyButton text={dir.nap.descripcion} />
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
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
