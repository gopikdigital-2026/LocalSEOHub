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
  Star,
  ChevronDown,
  Building2,
  Phone,
  FileText,
  Clock,
  BrainCircuit,
  Radar,
  ShieldAlert,
  Activity,
  Eye,
  Swords,
  Bell,
  ChevronLeft,
  Target,
  Link,
  Plus,
  ScanSearch,
  ShieldCheck,
  BarChart2,
  Send,
  BookOpen,
  Newspaper,
  Award,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useSubscription } from './hooks/useSubscription';
import { supabase } from './lib/supabase';
import { useI18n } from './lib/i18n';
import { trackPageView, trackViewContent } from './lib/pixel';
import UrlAnalysisPanel from './components/UrlAnalysisPanel';
import Navbar from './components/Navbar';
import LandingPage from './components/LandingPage';
import LoginModal from './components/LoginModal';
import { PrivacyModal, TermsModal, ContactModal, type LegalModal } from './components/LegalModals';
import { LogoIcon } from './components/Logo';
import AdminDashboard from './components/AdminDashboard';
import AIBusinessAdvisor from './components/AIBusinessAdvisor';
import AiCampaignSandbox from './components/AiCampaignSandbox';
import SchemaCodePanel from './components/SchemaCodePanel';
import MapsScanner from './components/MapsScanner';

// ─── Types ───────────────────────────────────────────────────────────────────

type Platform = 'Etsy' | 'Shopify' | 'Amazon' | 'Google Business' | 'Wallapop' | 'Vinted' | 'eBay' | 'Facebook Marketplace' | 'WooCommerce' | 'Web propia / Blog' | 'Instagram / Facebook' | 'Booking.com' | 'Doctoralia' | 'TripAdvisor' | 'Habitissimo' | 'Treatwell' | '';
type Tipo = 'producto' | 'servicio';

interface SEOResult {
  title: string;
  description: string;
  tags: string[];
  competitorKeywords?: string[];
  imageOptimization?: { filename: string; altText: string };
  schema?: string;
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
  'Web propia / Blog': <Globe size={14} />,
  'Instagram / Facebook': <Globe size={14} />,
  'Booking.com': <MapPin size={14} />,
  Doctoralia: <MapPin size={14} />,
  TripAdvisor: <Star size={14} />,
  Habitissimo: <MapPin size={14} />,
  Treatwell: <Star size={14} />,
};

async function callGenerateSEO(
  product: string,
  city: string,
  platform: string,
  keywords: string,
  accessToken: string,
  tipo: Tipo,
  imageFile?: File | null,
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
      tipo,
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
    <div
      className="rounded-2xl p-6 space-y-3 transition-all duration-200"
      style={{ background: 'rgba(10,13,24,0.65)', border: '1px solid rgba(255,255,255,0.08)' }}
    >
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
    <div
      className="rounded-2xl p-10 flex flex-col items-center text-center gap-6 min-h-[440px] justify-center relative overflow-hidden"
      style={{ background: 'rgba(10,13,24,0.65)', border: '1px solid rgba(16,185,129,0.18)' }}
    >
      {/* Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/25 flex items-center justify-center shadow-xl shadow-emerald-500/10">
        <Sparkles size={26} className="text-emerald-400" />
      </div>

      <div className="relative">
        <p className="text-white font-extrabold text-lg mb-2 tracking-tight">Activa el Plan Pro para generar</p>
        <p className="text-slate-400 text-sm max-w-xs mx-auto leading-relaxed">
          Acceso completo a las 6 herramientas de IA por solo <span className="text-white font-semibold">9.99€/mes</span>. Cancela cuando quieras.
        </p>
      </div>

      <div className="relative grid grid-cols-2 gap-2 w-full max-w-xs">
        {['SEO Local ilimitado', 'Escáner Google Maps', 'Radar de competencia', 'GEO Audit IA'].map((f) => (
          <div key={f} className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2">
            <Check size={10} className="text-emerald-400 shrink-0" />
            {f}
          </div>
        ))}
      </div>

      <button
        onClick={onSubscribe}
        disabled={isLoading}
        className="relative flex items-center gap-2 px-8 py-3.5 rounded-full font-bold text-sm transition-all duration-300
          bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
          text-slate-950 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0
          disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
      >
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} fill="currentColor" />}
        {isLoading ? 'Redirigiendo...' : 'Activar Plan Pro — 9.99€/mes'}
      </button>
      <p className="relative text-xs text-slate-600">7 días gratis · Sin tarjeta hasta decidir</p>
    </div>
  );
}

// ─── Saved Texts ─────────────────────────────────────────────────────────────

type ExportFormat = 'shopify' | 'etsy';

function SavedTexts({ previewMode }: { previewMode: boolean }) {
  const { session } = useAuth();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportFormat, setExportFormat] = useState<ExportFormat>('shopify');
  const [exportOpen, setExportOpen] = useState(false);
  const [items, setItems] = useState<SavedItem[]>([]);

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
            {t('saved_desc')}
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

// ─── GEO Audit ───────────────────────────────────────────────────────────────

interface GeoFactor {
  name: string;
  score: number;
  status: 'ok' | 'warn' | 'bad';
  tip: string;
}

interface GeoScoreData {
  score: number;
  factors: GeoFactor[];
  topAction: string;
}

interface GeoAuditResult {
  simulatedResponse: string;
  businessName: string;
  score: GeoScoreData;
}

function highlightBusiness(text: string, name: string): React.ReactNode[] {
  if (!name) return [<span key="0">{text}</span>];
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    new RegExp(`^${escaped}$`, 'i').test(part)
      ? <mark key={i} className="bg-emerald-400/20 text-emerald-300 px-1 rounded font-semibold not-italic">{part}</mark>
      : <span key={i}>{part}</span>
  );
}

const GEO_FACTOR_ICONS: Record<string, React.ReactNode> = {
  'Autoridad de Reseñas':    <Star size={13} />,
  'Presencia en Directorios': <Globe size={13} />,
  'Coherencia NAP':           <MapPin size={13} />,
  'Contenido Estructurado':   <FileText size={13} />,
  'Señales de Entidad':       <BrainCircuit size={13} />,
  'Velocidad de Respuesta IA': <Zap size={13} />,
};

function GeoScoreBar({ value, animate }: { value: number; animate: boolean }) {
  const color = value >= 70 ? '#10b981' : value >= 40 ? '#f59e0b' : '#ef4444';
  const label = value >= 70 ? 'Buena' : value >= 40 ? 'Media' : 'Baja';
  const labelColor = value >= 70 ? 'text-emerald-400' : value >= 40 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-0.5">AI Search Visibility Score</p>
          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-white tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {animate ? value : 0}
            </span>
            <span className="text-xl font-bold text-slate-600">/100</span>
            <span className={`text-sm font-bold ${labelColor} ml-1`}>{label} Visibilidad</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-slate-600 font-mono">ChatGPT · Gemini · Perplexity</p>
          <p className="text-xs text-slate-700 font-mono">GEO Score v1.0</p>
        </div>
      </div>
      <div className="relative h-3 rounded-full bg-slate-800/80 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out"
          style={{ width: animate ? `${value}%` : '0%', background: `linear-gradient(to right, ${color}99, ${color})`, boxShadow: `0 0 12px ${color}60` }}
        />
        {[25, 50, 75].map(mark => (
          <div key={mark} className="absolute top-0 bottom-0 w-px bg-slate-700/60" style={{ left: `${mark}%` }} />
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-slate-700 font-mono px-0.5">
        <span>0</span><span>Bajo</span><span>Medio</span><span>Alto</span><span>100</span>
      </div>
    </div>
  );
}

function GeoFactorRow({ factor }: { factor: GeoFactor }) {
  const statusStyles = {
    ok:   { bar: 'bg-emerald-500', text: 'text-emerald-400', badge: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400' },
    warn: { bar: 'bg-amber-500',   text: 'text-amber-400',   badge: 'bg-amber-500/10 border-amber-500/25 text-amber-400' },
    bad:  { bar: 'bg-red-500',     text: 'text-red-400',     badge: 'bg-red-500/10 border-red-500/25 text-red-400' },
  };
  const s = statusStyles[factor.status];
  const statusLabel = { ok: 'Óptimo', warn: 'Mejorable', bad: 'Crítico' }[factor.status];

  return (
    <div className="group flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/20 transition-colors duration-150">
      <div className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${s.badge}`}>
        {GEO_FACTOR_ICONS[factor.name] ?? <Circle size={13} />}
      </div>
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-200">{factor.name}</p>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.badge}`}>{statusLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className={`h-full rounded-full ${s.bar} transition-all duration-700`} style={{ width: `${factor.score}%` }} />
          </div>
          <span className={`text-xs font-bold tabular-nums shrink-0 ${s.text}`}>{factor.score}</span>
        </div>
        <p className="text-xs text-slate-600 leading-snug">{factor.tip}</p>
      </div>
    </div>
  );
}

function ChatGptSimulator({ response, businessName, loading }: { response: string; businessName: string; loading: boolean }) {
  const { t } = useI18n();
  const isMentioned = businessName && response
    ? new RegExp(businessName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(response)
    : false;

  return (
    <div className="rounded-2xl border border-slate-700/50 bg-slate-950/70 overflow-hidden"
      style={{ boxShadow: '0 0 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
      {/* Browser chrome */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800/60 bg-slate-900/80">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-slate-700" />
          <div className="w-3 h-3 rounded-full bg-slate-700" />
          <div className="w-3 h-3 rounded-full bg-slate-700" />
        </div>
        <div className="flex-1 mx-3 flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-1.5 border border-slate-700/50">
          <Globe size={11} className="text-slate-500 shrink-0" />
          <span className="text-xs text-slate-500 font-mono">chatgpt.com</span>
          <Lock size={10} className="text-emerald-500/50 ml-auto shrink-0" />
        </div>
      </div>
      {/* ChatGPT UI */}
      <div className="p-6 space-y-5">
        {/* User message */}
        <div className="flex justify-end">
          <div className="max-w-xs bg-slate-700/60 border border-slate-600/40 rounded-2xl rounded-tr-sm px-4 py-3">
            <p className="text-sm text-slate-200">
              Recomiéndame un <span className="text-emerald-300 font-semibold">[sector]</span> en <span className="text-blue-300 font-semibold">[ciudad]</span> con buenas opciones
            </p>
          </div>
        </div>
        {/* AI response */}
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 border border-slate-600/60 flex items-center justify-center shrink-0 mt-0.5">
            <span className="text-xs font-black text-white">G</span>
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-slate-400 mb-2">ChatGPT</p>
            {loading ? (
              <div className="space-y-2">
                {[90, 75, 85, 60].map((w, i) => (
                  <div key={i} className="h-3.5 rounded-full bg-slate-800 animate-pulse" style={{ width: `${w}%`, animationDelay: `${i * 0.1}s` }} />
                ))}
                <div className="flex items-center gap-1.5 mt-3">
                  {[0, 0.2, 0.4].map((d, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-bounce" style={{ animationDelay: `${d}s` }} />
                  ))}
                  <span className="text-xs text-slate-600 ml-1">Generando respuesta...</span>
                </div>
              </div>
            ) : response ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-300 leading-relaxed">
                  {highlightBusiness(response, businessName)}
                </p>
                <div className={`flex items-start gap-2.5 rounded-xl px-4 py-3 border ${
                  isMentioned
                    ? 'bg-emerald-500/8 border-emerald-500/25'
                    : 'bg-amber-500/8 border-amber-500/20'
                }`}>
                  {isMentioned ? (
                    <>
                      <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-emerald-400">{t('geo_mentioned')}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{t('geo_mentioned_desc')}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-amber-400">{t('geo_not_mentioned')}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{t('geo_not_mentioned_desc')}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-600 italic">Lanza el análisis para ver cómo te presenta la IA.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Citation Conquest Panel ──────────────────────────────────────────────────

interface CitationSource {
  id: string;
  name: string;
  domain: string;
  type: 'blog' | 'directory' | 'ranking' | 'news';
  tag: string;
  description: string;
  authorityScore: number;
  monthlyVisitors: string;
}

const SECTOR_SOURCES: Record<string, CitationSource[]> = {
  restaurant: [
    { id: 'r1', name: 'Los 10 Mejores Restaurantes', domain: 'gastronomiahoy.es', type: 'ranking', tag: 'Top Lists', description: 'Ranking editorial mensual citado por ChatGPT y Perplexity para recomendaciones gastronómicas locales.', authorityScore: 91, monthlyVisitors: '380K' },
    { id: 'r2', name: 'Guía Foodie Local', domain: 'guiafoodie.com', type: 'blog', tag: 'Blog Nicho', description: 'Blog especializado en gastronomía local con alta frecuencia de citas en respuestas IA de restaurantes de zona.', authorityScore: 76, monthlyVisitors: '120K' },
    { id: 'r3', name: 'TripAdvisor Restaurantes', domain: 'tripadvisor.es', type: 'directory', tag: 'Directorio', description: 'Directorio de referencia obligatoria. Las IAs rastrean sus reseñas y puntuaciones para construir respuestas.', authorityScore: 98, monthlyVisitors: '12M' },
    { id: 'r4', name: 'Come y Calla Magazine', domain: 'comeyccalla.es', type: 'news', tag: 'Prensa Digital', description: 'Revista digital de tendencias gastronómicas. Artículos de "dónde comer en [ciudad]" con alta autoridad SEO.', authorityScore: 68, monthlyVisitors: '85K' },
  ],
  peluqueria: [
    { id: 'p1', name: 'Las Mejores Peluquerías', domain: 'bellezatop.es', type: 'ranking', tag: 'Top Lists', description: 'Lista de referencia citada por modelos IA al responder "mejores peluquerías de [ciudad]" o búsquedas de salón.', authorityScore: 84, monthlyVisitors: '210K' },
    { id: 'p2', name: 'Tendencias Pelo Blog', domain: 'tendenciaspelo.com', type: 'blog', tag: 'Blog Nicho', description: 'Blog de belleza y tendencias capilar con artículos "salones recomendados" que las IA procesan como fuente.', authorityScore: 71, monthlyVisitors: '95K' },
    { id: 'p3', name: 'Booksy Directorio', domain: 'booksy.com', type: 'directory', tag: 'Directorio', description: 'Plataforma de reservas con perfil de negocio indizado por modelos IA para recomendar profesionales cercanos.', authorityScore: 89, monthlyVisitors: '5M' },
    { id: 'p4', name: 'Look Magazine España', domain: 'lookmagazine.es', type: 'news', tag: 'Prensa Digital', description: 'Artículos "los mejores salones de belleza de 2024" con links que aumentan visibilidad en respuestas de IA.', authorityScore: 63, monthlyVisitors: '60K' },
  ],
  tienda: [
    { id: 't1', name: 'Directorio Comercio Local', domain: 'compralolocal.es', type: 'directory', tag: 'Directorio', description: 'Directorio especializado en comercio local de proximidad. Alta tasa de cita en búsquedas "comprar en [ciudad]".', authorityScore: 79, monthlyVisitors: '180K' },
    { id: 't2', name: 'Blog Consumidor Inteligente', domain: 'consumidorinteligente.com', type: 'blog', tag: 'Blog Nicho', description: 'Comparativas y guías de compra citadas por IA para recomendar tiendas especializadas en múltiples categorías.', authorityScore: 73, monthlyVisitors: '140K' },
    { id: 't3', name: 'Top Tiendas España', domain: 'toptiendas.es', type: 'ranking', tag: 'Top Lists', description: 'Rankings editoriales "mejores tiendas de [producto] en [ciudad]" con fuerte posicionamiento en IA generativa.', authorityScore: 85, monthlyVisitors: '290K' },
    { id: 't4', name: 'Retail Insider ES', domain: 'retailinsider.es', type: 'news', tag: 'Prensa Digital', description: 'Prensa especializada en retail. Sus artículos de "mejores locales" son fuente de entrenamiento IA.', authorityScore: 67, monthlyVisitors: '75K' },
  ],
  default: [
    { id: 'd1', name: 'Mejores Negocios Locales', domain: 'negocioslocales.es', type: 'ranking', tag: 'Top Lists', description: 'Portal editorial de rankings locales con alta tasa de cita en ChatGPT, Gemini y Perplexity para búsquedas de "mejor [negocio] en [ciudad]".', authorityScore: 83, monthlyVisitors: '320K' },
    { id: 'd2', name: 'Guía Local Interactiva', domain: 'guialocal.com', type: 'directory', tag: 'Directorio', description: 'Directorio geolocalizado de negocios. Listado activo aumenta probabilidad de ser citado por IA en respuestas de recomendación.', authorityScore: 77, monthlyVisitors: '260K' },
    { id: 'd3', name: 'Blog Expertos del Sector', domain: 'expertossector.es', type: 'blog', tag: 'Blog Nicho', description: 'Blog de autoridad de nicho con artículos "los mejores de [sector]" citados directamente como fuente en respuestas IA.', authorityScore: 69, monthlyVisitors: '88K' },
    { id: 'd4', name: 'Noticias Locales Digital', domain: 'noticiaslocales.es', type: 'news', tag: 'Prensa Digital', description: 'Prensa local digital con sección de negocios destacados. Los modelos de IA usan artículos de prensa como señales de autoridad.', authorityScore: 61, monthlyVisitors: '145K' },
    { id: 'd5', name: 'Yelp España', domain: 'yelp.es', type: 'directory', tag: 'Directorio', description: 'Plataforma de reseñas de referencia global. Presencia activa aumenta citas de IA en búsquedas de comparación y selección.', authorityScore: 94, monthlyVisitors: '8M' },
  ],
};

function getSectorKey(sector: string): keyof typeof SECTOR_SOURCES {
  const s = sector.toLowerCase();
  if (/restaur|bar |cafeter|gastro|comida|cocina|tapas|pizza/.test(s)) return 'restaurant';
  if (/pelucas|peluqu|barbería|barber|salón de bell|salon|belleza|estética|estetica/.test(s)) return 'peluqueria';
  if (/tienda|comercio|shop|boutique|moda|ropa|calzado|librería|farmac/.test(s)) return 'tienda';
  return 'default';
}

const SOURCE_TYPE_ICONS: Record<CitationSource['type'], React.ReactNode> = {
  blog: <BookOpen size={11} />,
  directory: <Globe size={11} />,
  ranking: <Award size={11} />,
  news: <Newspaper size={11} />,
};

const SOURCE_TYPE_COLORS: Record<CitationSource['type'], string> = {
  blog:      'text-sky-400 bg-sky-400/10 border-sky-400/25',
  directory: 'text-violet-400 bg-violet-400/10 border-violet-400/25',
  ranking:   'text-amber-400 bg-amber-400/10 border-amber-400/25',
  news:      'text-pink-400 bg-pink-400/10 border-pink-400/25',
};

function authorityBarColor(score: number) {
  if (score >= 85) return 'from-emerald-500 to-teal-400';
  if (score >= 70) return 'from-blue-500 to-cyan-400';
  if (score >= 50) return 'from-amber-500 to-yellow-400';
  return 'from-red-500 to-orange-400';
}

function authorityLabel(score: number) {
  if (score >= 85) return { text: 'Muy Alta', color: 'text-emerald-400' };
  if (score >= 70) return { text: 'Alta', color: 'text-blue-400' };
  if (score >= 50) return { text: 'Media', color: 'text-amber-400' };
  return { text: 'Baja', color: 'text-red-400' };
}

// ─── Lightweight Markdown renderer (bold, blockquotes, paragraphs) ───────────

function MarkdownPitch({ text }: { text: string }) {
  const renderInline = (line: string, key: number) => {
    const parts: React.ReactNode[] = [];
    const regex = /\*\*(.+?)\*\*/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(line)) !== null) {
      if (m.index > last) parts.push(line.slice(last, m.index));
      parts.push(<strong key={`b${key}-${m.index}`} className="text-white font-semibold">{m[1]}</strong>);
      last = m.index + m[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts;
  };

  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="border-l-2 border-amber-500/40 pl-3 text-slate-400 italic">
          {renderInline(line.slice(2), i)}
        </blockquote>
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(
        <p key={i} className="text-xs text-slate-300 leading-relaxed">
          {renderInline(line, i)}
        </p>
      );
    }
    i++;
  }

  return <div className="space-y-1">{elements}</div>;
}

function CitationConquestPanel({ sector, city, businessName, starProduct }: {
  sector: string;
  city: string;
  businessName: string;
  starProduct?: string;
}) {
  const key = getSectorKey(sector);
  const sources = SECTOR_SOURCES[key];
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [pitches, setPitches] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [animate, setAnimate] = useState(false);

  useEffect(() => { setTimeout(() => setAnimate(true), 80); }, []);

  const generatePitch = async (src: CitationSource) => {
    if (pitches[src.id]) { setExpanded(e => ({ ...e, [src.id]: !e[src.id] })); return; }
    setLoading(l => ({ ...l, [src.id]: true }));
    setErrors(e => ({ ...e, [src.id]: '' }));
    try {
      const res = await supabase.functions.invoke('generate-pitch', {
        body: {
          portalName: src.name,
          portalDomain: src.domain,
          portalType: src.type,
          businessName: businessName || 'Mi negocio',
          sector: sector || 'negocio local',
          city: city || 'tu ciudad',
          starProduct: starProduct || '',
        },
      });
      if (res.error) throw new Error(res.error.message);
      const pitch: string = res.data?.pitch ?? '';
      if (!pitch) throw new Error('Respuesta vacía de la IA');
      setPitches(p => ({ ...p, [src.id]: pitch }));
      setExpanded(e => ({ ...e, [src.id]: true }));
    } catch (err) {
      setErrors(e => ({ ...e, [src.id]: err instanceof Error ? err.message : 'Error desconocido' }));
    } finally {
      setLoading(l => ({ ...l, [src.id]: false }));
    }
  };

  const copyPitch = (id: string, text: string) => {
    // Strip markdown syntax for plain-text clipboard
    const plain = text.replace(/\*\*/g, '').replace(/^> /gm, '');
    navigator.clipboard.writeText(plain).then(() => {
      setCopied(c => ({ ...c, [id]: true }));
      setTimeout(() => setCopied(c => ({ ...c, [id]: false })), 2200);
    });
  };

  return (
    <div className={`space-y-4 transition-all duration-500 ${animate ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>

      {/* Section header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-xl bg-amber-500/12 border border-amber-500/25 flex items-center justify-center shrink-0">
              <Target size={14} className="text-amber-400" />
            </div>
            <h2 className="text-base font-bold text-white">
              AI Citation Conquest
              <span className="ml-2 text-amber-400">Fuentes Clave de la IA</span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 pl-9 leading-snug">
            Portales de referencia que ChatGPT, Perplexity y Gemini citan para recomendar negocios de tu sector.
            Infiltrarte en ellos impulsa tus apariciones en respuestas de IA.
          </p>
        </div>
        <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/25 bg-amber-500/8 text-[10px] font-bold text-amber-400 uppercase tracking-widest whitespace-nowrap">
          <Zap size={9} />
          {sources.length} fuentes
        </span>
      </div>

      {/* Sources list */}
      <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>

        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60 bg-slate-900/40">
          <Globe size={12} className="text-slate-500" />
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest flex-1">
            Portales de Referencia Citados por la IA
          </span>
          <span className="text-[10px] text-slate-600">Sector: {sector || 'negocio local'} · {city || 'tu ciudad'}</span>
        </div>

        <div className="divide-y divide-slate-800/50">
          {sources.map((src, i) => {
            const label = authorityLabel(src.authorityScore);
            const barColor = authorityBarColor(src.authorityScore);
            const isLoading = loading[src.id];
            const isExpanded = expanded[src.id];
            const pitch = pitches[src.id];
            const isCopied = copied[src.id];
            const pitchError = errors[src.id];

            return (
              <div
                key={src.id}
                className={`transition-all duration-500 delay-${i * 75}
                  ${animate ? 'opacity-100' : 'opacity-0'}`}
              >
                {/* Source row */}
                <div className="px-5 py-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className="w-8 h-8 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-400 shrink-0 mt-0.5">
                      {SOURCE_TYPE_ICONS[src.type]}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm text-white leading-snug">{src.name}</span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${SOURCE_TYPE_COLORS[src.type]}`}>
                          {SOURCE_TYPE_ICONS[src.type]}
                          {src.tag}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-600">
                        <ExternalLink size={9} />
                        <span className="font-mono">{src.domain}</span>
                        <span>·</span>
                        <span>{src.monthlyVisitors}/mes</span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed">{src.description}</p>
                    </div>
                  </div>

                  {/* Authority bar */}
                  <div className="space-y-1.5 pl-11">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-600 font-medium flex items-center gap-1">
                        <Activity size={9} />
                        Fuerza de Autoridad en IA
                      </span>
                      <span className={`font-bold ${label.color}`}>{label.text} · {src.authorityScore}/100</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-1000 ease-out`}
                        style={{ width: animate ? `${src.authorityScore}%` : '0%', transitionDelay: `${i * 120 + 300}ms` }}
                      />
                    </div>
                  </div>

                  {/* Action button */}
                  <div className="pl-11 space-y-2">
                    <button
                      onClick={() => generatePitch(src)}
                      disabled={isLoading}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 border
                        ${pitch && isExpanded
                          ? 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-300'
                          : 'bg-amber-500/10 border-amber-500/25 text-amber-400 hover:bg-amber-500/18 hover:border-amber-500/40'
                        }
                        disabled:opacity-60 disabled:cursor-not-allowed`}
                    >
                      {isLoading ? (
                        <><RefreshCw size={11} className="animate-spin" />Redactando con IA...</>
                      ) : pitch && isExpanded ? (
                        <><ChevronDown size={11} />Ocultar pitch</>
                      ) : pitch ? (
                        <><Send size={11} />Ver pitch generado</>
                      ) : (
                        <><Send size={11} />Generar Pitch de Infiltración</>
                      )}
                    </button>
                    {pitchError && (
                      <p className="flex items-center gap-1.5 text-[11px] text-red-400">
                        <AlertCircle size={10} />{pitchError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Pitch panel */}
                {pitch && isExpanded && (
                  <div className="mx-5 mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-amber-500/15 bg-amber-500/8">
                      <Send size={10} className="text-amber-400" />
                      <span className="text-[11px] font-bold text-amber-400 uppercase tracking-widest flex-1">
                        Pitch de Infiltración — Generado por IA
                      </span>
                      <button
                        onClick={() => copyPitch(src.id, pitch)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all border
                          ${isCopied
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-slate-200'
                          }`}
                      >
                        {isCopied ? <Check size={9} /> : <Copy size={9} />}
                        {isCopied ? 'Copiado' : 'Copiar al portapapeles'}
                      </button>
                    </div>
                    <div className="px-5 py-4">
                      <MarkdownPitch text={pitch} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GeoAuditPanel({ product, city }: { product: string; city: string }) {
  const { t } = useI18n();
  const [businessInput, setBusinessInput] = useState(product || '');
  const [cityInput, setCityInput] = useState(city || '');
  const [sectorInput, setSectorInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<GeoAuditResult | null>(null);
  const [scoreAnimate, setScoreAnimate] = useState(false);

  // Sync props when form changes
  useEffect(() => { if (product && !businessInput) setBusinessInput(product); }, [product]);
  useEffect(() => { if (city && !cityInput) setCityInput(city); }, [city]);

  const runAudit = async () => {
    if (!businessInput.trim()) { setError('Introduce el nombre de tu negocio'); return; }
    setError('');
    setLoading(true);
    setResult(null);
    setScoreAnimate(false);
    try {
      const res = await supabase.functions.invoke('generate-geo-audit', {
        body: {
          businessName: businessInput.trim(),
          sector: sectorInput.trim() || product.trim() || 'negocio local',
          city: cityInput.trim() || city || 'tu ciudad',
          description: descInput.trim(),
        },
      });
      if (res.error) throw new Error(res.error.message);
      setResult(res.data as GeoAuditResult);
      setTimeout(() => setScoreAnimate(true), 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const score = result?.score?.score ?? 0;
  const factors = result?.score?.factors ?? [];
  const topAction = result?.score?.topAction ?? '';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800/50 pb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
            GEO <span className="text-emerald-400">Audit</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-xl">
            {t('geo_desc')}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/25 bg-blue-500/8 shrink-0">
          <ScanSearch size={12} className="text-blue-400" />
          <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">GEO v1.0</span>
        </div>
      </div>

      {/* Config form */}
      <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 p-6"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
          <Building2 size={12} className="text-emerald-400" />
          {t('geo_section_data')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('geo_label_name')}</label>
            <input
              value={businessInput}
              onChange={e => setBusinessInput(e.target.value)}
              placeholder={t('geo_ph_name')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 text-sm text-slate-100
                placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('geo_label_city')}</label>
            <div className="relative">
              <MapPin size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                value={cityInput}
                onChange={e => setCityInput(e.target.value)}
                placeholder={t('dash_ph_city')}
                className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 text-sm text-slate-100
                  placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('geo_label_sector')}</label>
            <input
              value={sectorInput}
              onChange={e => setSectorInput(e.target.value)}
              placeholder={t('geo_ph_sector')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 text-sm text-slate-100
                placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('geo_label_desc')}</label>
            <input
              value={descInput}
              onChange={e => setDescInput(e.target.value)}
              placeholder={t('geo_ph_desc')}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800/70 border border-slate-700/60 text-sm text-slate-100
                placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
            />
          </div>
        </div>
        {error && (
          <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={11} />{error}</p>
        )}
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={runAudit}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-sm
              hover:bg-emerald-400 active:scale-95 transition-all duration-150
              disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100"
          >
            {loading ? (
              <><div className="w-4 h-4 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin" />{t('geo_btn_running')}</>
            ) : (
              <><ScanSearch size={15} />{t('geo_btn_run')}</>
            )}
          </button>
          {result && (
            <button
              onClick={() => { setResult(null); setScoreAnimate(false); }}
              className="px-4 py-2.5 rounded-xl border border-slate-700/60 bg-slate-800/50 text-sm text-slate-400
                hover:text-slate-200 hover:border-slate-600 transition-all duration-150"
            >
              {t('geo_btn_new')}
            </button>
          )}
        </div>
      </div>

      {/* Score section */}
      {(result || loading) && (
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          {/* Left: Score + factors */}
          <div className="xl:col-span-3 space-y-4">
            {/* Score card */}
            <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-6"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              {loading && !result ? (
                <div className="space-y-3">
                  <div className="h-4 w-48 rounded-full bg-slate-800 animate-pulse" />
                  <div className="h-12 w-32 rounded-xl bg-slate-800 animate-pulse" />
                  <div className="h-3 rounded-full bg-slate-800 animate-pulse" />
                </div>
              ) : result ? (
                <GeoScoreBar value={score} animate={scoreAnimate} />
              ) : null}
            </div>

            {/* Top action */}
            {result && topAction && (
              <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/6 px-5 py-4"
                style={{ boxShadow: '0 0 20px rgba(16,185,129,0.04)' }}>
                <Zap size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">{t('geo_top_action')}</p>
                  <p className="text-sm text-slate-300 leading-snug">{topAction}</p>
                </div>
              </div>
            )}

            {/* Factor breakdown */}
            {(result || loading) && (
              <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
                <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/60">
                  <Activity size={13} className="text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-widest">{t('geo_factors_title')}</h3>
                </div>
                {loading && !result ? (
                  <div className="divide-y divide-slate-800/40">
                    {[...Array(6)].map((_, i) => (
                      <div key={i} className="flex items-center gap-4 px-5 py-4">
                        <div className="w-7 h-7 rounded-lg bg-slate-800 animate-pulse" />
                        <div className="flex-1 space-y-2">
                          <div className="h-3 w-40 rounded-full bg-slate-800 animate-pulse" />
                          <div className="h-1.5 rounded-full bg-slate-800 animate-pulse" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/40">
                    {factors.map((f, i) => <GeoFactorRow key={i} factor={f} />)}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: ChatGPT simulator */}
          <div className="xl:col-span-2 space-y-4">
            <div className="flex items-center gap-2 px-1">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{t('geo_sim_live')}</p>
            </div>
            <ChatGptSimulator
              response={result?.simulatedResponse ?? ''}
              businessName={result?.businessName ?? businessInput}
              loading={loading}
            />
            {result && (
              <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 px-4 py-3.5 space-y-2">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('geo_improve_title')}</p>
                <ul className="space-y-1.5">
                  {[
                    t('geo_improve_1'),
                    t('geo_improve_2'),
                    t('geo_improve_3'),
                    t('geo_improve_4'),
                  ].map((tip, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                      <span className="text-emerald-500/60 mt-0.5 shrink-0">▸</span>
                      {tip}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AI Citation Conquest */}
      {result && !loading && (
        <CitationConquestPanel
          sector={sectorInput || product || 'negocio local'}
          city={cityInput || city || 'tu ciudad'}
          businessName={businessInput}
          starProduct={descInput}
        />
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 py-20 flex flex-col items-center gap-4 text-center px-6">
          <div className="w-16 h-16 rounded-2xl border border-slate-700/50 bg-slate-800/50 flex items-center justify-center">
            <ScanSearch size={28} className="text-slate-600" />
          </div>
          <div className="space-y-1.5">
            <p className="text-base font-semibold text-slate-400">{t('geo_empty_title')}</p>
            <p className="text-sm text-slate-600 max-w-sm">{t('geo_empty_desc')}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Radar de Competencia ─────────────────────────────────────────────────────

type ThreatLevel = 'high' | 'medium' | 'low';

interface Rival {
  id: string;
  name: string;
  category: string;
  threat: ThreatLevel;
  lastMove: string;
  lastMoveTime: string;
}

const RIVALS: Rival[] = [
  {
    id: 'r1',
    name: 'Clínica Dental Alfa',
    category: 'Odontología',
    threat: 'high',
    lastMove: 'Actualización masiva de palabras clave de geolocalización en su ficha',
    lastMoveTime: 'hace 4 horas',
  },
  {
    id: 'r2',
    name: 'FitPro Gym Plus',
    category: 'Fitness',
    threat: 'high',
    lastMove: '12 reseñas nuevas de 5 estrellas en las últimas 48h — posible campaña coordinada',
    lastMoveTime: 'hace 6 horas',
  },
  {
    id: 'r3',
    name: 'Peluquería Moderna Sol',
    category: 'Belleza',
    threat: 'medium',
    lastMove: 'Añadió servicios premium y actualizó lista de precios en el perfil',
    lastMoveTime: 'hace 1 día',
  },
  {
    id: 'r4',
    name: 'Centro Médico Salud 360',
    category: 'Salud',
    threat: 'medium',
    lastMove: 'Publicó 4 posts de Google en los últimos 3 días con imágenes profesionales',
    lastMoveTime: 'hace 2 días',
  },
  {
    id: 'r5',
    name: 'Restaurante La Terraza',
    category: 'Hostelería',
    threat: 'low',
    lastMove: 'Actualizó horario de apertura y añadió horario de festivos',
    lastMoveTime: 'hace 3 días',
  },
];

const LIVE_ALERTS = [
  { id: 'a1', icon: '⚠️', rival: 'Clínica Dental Alfa', action: 'ha actualizado sus palabras clave de geolocalización', time: 'hace 4 horas', threat: 'high' as ThreatLevel },
  { id: 'a2', icon: '🔴', rival: 'FitPro Gym Plus', action: 'ha recibido 12 nuevas reseñas de 5 estrellas en 48h', time: 'hace 6 horas', threat: 'high' as ThreatLevel },
  { id: 'a3', icon: '🟡', rival: 'Peluquería Moderna Sol', action: 'ha actualizado su lista de servicios y precios premium', time: 'hace 1 día', threat: 'medium' as ThreatLevel },
  { id: 'a4', icon: '🟡', rival: 'Centro Médico Salud 360', action: 'ha publicado 4 posts consecutivos con imágenes profesionales', time: 'hace 2 días', threat: 'medium' as ThreatLevel },
  { id: 'a5', icon: '🟢', rival: 'Restaurante La Terraza', action: 'ha actualizado su horario incluyendo festivos', time: 'hace 3 días', threat: 'low' as ThreatLevel },
  { id: 'a6', icon: '⚠️', rival: 'Clínica Dental Alfa', action: 'ha añadido 6 nuevas fotos del interior con geotags', time: 'hace 5 horas', threat: 'high' as ThreatLevel },
  { id: 'a7', icon: '🔴', rival: 'FitPro Gym Plus', action: 'ha publicado una oferta de captación con descuento del 30%', time: 'hace 9 horas', threat: 'high' as ThreatLevel },
];

function ThreatBadge({ level }: { level: ThreatLevel }) {
  const styles = {
    high:   'bg-red-500/15 border-red-500/30 text-red-300',
    medium: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    low:    'bg-emerald-500/15 border-emerald-500/30 text-emerald-300',
  };
  const labels = { high: 'Alto', medium: 'Medio', low: 'Bajo' };
  const dots = { high: 'bg-red-400', medium: 'bg-amber-400', low: 'bg-emerald-400' };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border ${styles[level]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dots[level]}`} />
      {labels[level]}
    </span>
  );
}

// Lightweight markdown renderer for GPT output
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  const parseinline = (raw: string): React.ReactNode => {
    const parts = raw.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, idx) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return <strong key={idx} className="text-slate-100 font-semibold">{p.slice(2,-2)}</strong>;
      }
      if (p.startsWith('`') && p.endsWith('`')) {
        return <code key={idx} className="text-emerald-300 bg-emerald-500/10 px-1.5 py-0.5 rounded text-xs font-mono">{p.slice(1,-1)}</code>;
      }
      return p;
    });
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { i++; continue; }

    if (/^#{1,3}\s/.test(trimmed)) {
      const level = trimmed.match(/^(#{1,3})/)?.[1].length ?? 1;
      const content = trimmed.replace(/^#{1,3}\s+/, '');
      const sizeClass = level === 1 ? 'text-base' : 'text-sm';
      elements.push(
        <h3 key={i} className={`${sizeClass} font-bold text-emerald-400 mt-5 mb-2 flex items-center gap-2`}>
          <span className="w-1 h-4 rounded-full bg-emerald-500/60 shrink-0" />
          {parseinline(content)}
        </h3>
      );
      i++; continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        const match = lines[i].trim().match(/^\d+\.\s+(.*)/);
        if (match) items.push(<li key={i} className="text-sm text-slate-300 leading-relaxed">{parseinline(match[1])}</li>);
        i++;
      }
      elements.push(<ol key={`ol-${i}`} className="list-decimal list-inside space-y-1.5 pl-1 mb-3">{items}</ol>);
      continue;
    }

    if (/^[-*]\s/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
        const match = lines[i].trim().match(/^[-*]\s+(.*)/);
        if (match) items.push(
          <li key={i} className="text-sm text-slate-300 leading-relaxed flex gap-2">
            <span className="text-emerald-500 mt-1 shrink-0">▸</span>
            <span>{parseinline(match[1])}</span>
          </li>
        );
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="space-y-1.5 mb-3">{items}</ul>);
      continue;
    }

    // blockquote-style template text
    if (trimmed.startsWith('>')) {
      const content = trimmed.replace(/^>\s*/, '');
      elements.push(
        <blockquote key={i} className="border-l-2 border-emerald-500/40 pl-4 py-2 my-2 bg-emerald-500/5 rounded-r-lg text-sm text-slate-300 italic leading-relaxed">
          {parseinline(content)}
        </blockquote>
      );
      i++; continue;
    }

    elements.push(<p key={i} className="text-sm text-slate-300 leading-relaxed mb-2">{parseinline(trimmed)}</p>);
    i++;
  }

  return <div className="space-y-0.5">{elements}</div>;
}

// ─── URL Competitor Analysis ──────────────────────────────────────────────────
// Components extracted to src/components/UrlAnalysisPanel.tsx



// ─── Random Environment Analysis ─────────────────────────────────────────────

const RANDOM_ENV_RIVALS: Rival[] = [
  { id: 'env1', name: 'Clínica Estética Central', category: 'Estética', threat: 'high', lastMove: 'Lanzó campaña de Google Ads con 8 nuevas extensiones de llamada', lastMoveTime: 'hace 2 horas' },
  { id: 'env2', name: 'Taller Mecánico Rápido', category: 'Automoción', threat: 'medium', lastMove: 'Subió 6 fotos nuevas al perfil de Google Business', lastMoveTime: 'hace 5 horas' },
  { id: 'env3', name: 'Óptica Visión Plus', category: 'Salud Visual', threat: 'low', lastMove: 'Actualizó horario de verano y descripción del perfil', lastMoveTime: 'hace 1 día' },
  { id: 'env4', name: 'Academia de Idiomas GlobalTalk', category: 'Educación', threat: 'medium', lastMove: 'Publicó post con oferta de matrícula gratuita en septiembre', lastMoveTime: 'hace 3 horas' },
  { id: 'env5', name: 'Farmacia Bienestar 24h', category: 'Salud', threat: 'high', lastMove: '15 reseñas nuevas de 5 estrellas en 72h — campaña coordinada', lastMoveTime: 'hace 1 hora' },
  { id: 'env6', name: 'Clínica Dental Familiar', category: 'Odontología', threat: 'medium', lastMove: 'Añadió nuevos servicios: blanqueamiento y ortodoncia invisible', lastMoveTime: 'hace 4 horas' },
];

function CompetitorRadar({ city }: { city: string }) {
  const { t } = useI18n();
  const [radarTab, setRadarTab] = useState<'local' | 'url'>('local');
  const [visibleAlerts, setVisibleAlerts] = useState(LIVE_ALERTS.slice(0, 3));
  const [alertIdx, setAlertIdx] = useState(3);
  const [scanAngle, setScanAngle] = useState(0);
  const [selectedRival, setSelectedRival] = useState<Rival | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aiContent, setAiContent] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [envRivals] = useState<Rival[]>(() => {
    const shuffled = [...RANDOM_ENV_RIVALS].sort(() => Math.random() - 0.5);
    return [...RIVALS, ...shuffled].slice(0, 6);
  });
  const feedRef = React.useRef<HTMLDivElement>(null);

  // Rotate scan line
  useEffect(() => {
    const timer = setInterval(() => setScanAngle((a) => (a + 1) % 360), 20);
    return () => clearInterval(timer);
  }, []);

  // Rolling alert feed
  useEffect(() => {
    const timer = setInterval(() => {
      setVisibleAlerts((prev) => {
        const next = LIVE_ALERTS[alertIdx % LIVE_ALERTS.length];
        return [next, ...prev].slice(0, 5);
      });
      setAlertIdx((i) => i + 1);
    }, 4000);
    return () => clearInterval(timer);
  }, [alertIdx]);

  const openDrawer = async (rival: Rival) => {
    setSelectedRival(rival);
    setDrawerOpen(true);
    setAiContent('');
    setAiError('');
    setAiLoading(true);
    try {
      const res = await supabase.functions.invoke('generate-countermeasure', {
        body: {
          city: city || 'tu ciudad',
          rivalName: rival.name,
          category: rival.category,
          lastMove: rival.lastMove,
          threatLevel: rival.threat,
        },
      });
      if (res.error) throw new Error(res.error.message);
      setAiContent(res.data?.content ?? '');
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Error al generar la contramedida.');
    } finally {
      setAiLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => { setSelectedRival(null); setAiContent(''); setAiError(''); }, 300);
  };

  const threatBorder = { high: 'border-red-500/50 text-red-300', medium: 'border-amber-500/50 text-amber-300', low: 'border-emerald-500/50 text-emerald-300' };
  const alertBg = { high: 'border-red-500/20 bg-red-500/5', medium: 'border-amber-500/20 bg-amber-500/5', low: 'border-emerald-500/20 bg-emerald-500/5' };

  return (
    <div className="space-y-8 relative">
      {/* Header */}
      <div className="border-b border-slate-800/50 pb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
            Radar de <span className="text-emerald-400">Competencia</span>
          </h1>
          <p className="text-slate-400 text-sm max-w-xl">
            {t('radar_desc')}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/8 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Live</span>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-900/80 border border-slate-800/60 w-fit"
        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
        <button
          onClick={() => setRadarTab('local')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
            ${radarTab === 'local'
              ? 'bg-slate-800 text-white shadow-md border border-slate-700/50'
              : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Radar size={13} />
          Entorno Local
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            radarTab === 'local' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800/60 text-slate-600'
          }`}>{envRivals.length}</span>
        </button>
        <button
          onClick={() => setRadarTab('url')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
            ${radarTab === 'url'
              ? 'bg-slate-800 text-white shadow-md border border-slate-700/50'
              : 'text-slate-500 hover:text-slate-300'}`}
        >
          <Link size={13} />
          Analizar URL
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            radarTab === 'url' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-800/60 text-slate-600'
          }`}>IA</span>
        </button>
      </div>

      {radarTab === 'url' ? (
        <UrlAnalysisPanel city={city} />
      ) : (
        <>
          {/* Top row: Mini-radar + Alert feed */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Radar visual */}
            <div className="rounded-2xl border border-emerald-900/50 bg-slate-950/80 p-5 flex flex-col items-center justify-center gap-4"
              style={{ boxShadow: '0 0 40px rgba(16,185,129,0.06), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <p className="text-xs font-bold text-emerald-500/70 uppercase tracking-widest self-start">Sector de Vigilancia</p>
              <div className="relative w-40 h-40">
                {[1,2,3,4].map((n) => (
                  <div key={n} className="absolute inset-0 rounded-full border border-emerald-900/60"
                    style={{ margin: `${(4-n)*20}px` }} />
                ))}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-full h-px bg-emerald-900/50" />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-px h-full bg-emerald-900/50" />
                </div>
                <div className="absolute inset-0 rounded-full overflow-hidden">
                  <div
                    className="absolute top-1/2 left-1/2 origin-left h-px"
                    style={{
                      background: 'linear-gradient(to right, rgba(16,185,129,0.7), transparent)',
                      transform: `rotate(${scanAngle}deg)`,
                      width: '50%',
                      boxShadow: '0 0 8px rgba(16,185,129,0.5)',
                    }}
                  />
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(from ${scanAngle}deg, rgba(16,185,129,0.08) 0deg, transparent 60deg)`,
                    }}
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                </div>
                {envRivals.map((r, i) => {
                  const angle = (i / envRivals.length) * 2 * Math.PI;
                  const dist = r.threat === 'high' ? 35 : r.threat === 'medium' ? 52 : 64;
                  const x = 50 + dist * Math.cos(angle);
                  const y = 50 + dist * Math.sin(angle);
                  return (
                    <div key={r.id}
                      className={`absolute w-2 h-2 rounded-full -translate-x-1/2 -translate-y-1/2 ${
                        r.threat === 'high' ? 'bg-red-400 shadow-[0_0_6px_rgba(239,68,68,0.8)]' :
                        r.threat === 'medium' ? 'bg-amber-400 shadow-[0_0_6px_rgba(245,158,11,0.8)]' :
                        'bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.6)]'
                      } animate-pulse`}
                      style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 0.4}s` }}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-2 w-full text-center">
                {(['high','medium','low'] as ThreatLevel[]).map((t) => (
                  <div key={t} className="space-y-0.5">
                    <p className="text-lg font-bold text-white">{envRivals.filter(r=>r.threat===t).length}</p>
                    <p className="text-[10px] text-slate-600 uppercase">{t==='high'?'Alto':t==='medium'?'Medio':'Bajo'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Alert feed */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60 bg-slate-900/80">
                <Bell size={13} className="text-emerald-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-widest">Feed de Alertas — Tiempo Real</span>
                <span className="ml-auto text-[10px] text-emerald-500/70 font-mono">SYS_MONITOR v2.4</span>
              </div>
              <div ref={feedRef} className="divide-y divide-slate-800/30">
                {visibleAlerts.map((alert, i) => (
                  <div
                    key={`${alert.id}-${i}`}
                    className={`flex items-start gap-3 px-5 py-3.5 border-l-2 transition-all duration-500 ${
                      i === 0 ? `${alertBg[alert.threat]} border-l-current animate-[fadeSlideIn_0.4s_ease]` : 'border-l-transparent'
                    }`}
                    style={i === 0 ? { borderLeftColor: alert.threat === 'high' ? '#f87171' : alert.threat === 'medium' ? '#fbbf24' : '#34d399' } : {}}
                  >
                    <span className="text-base shrink-0 mt-0.5">{alert.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 leading-snug">
                        <span className="font-semibold">{alert.rival}</span>
                        {' '}<span className="text-slate-400">{alert.action}</span>
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5 font-mono">{alert.time}</p>
                    </div>
                    <ThreatBadge level={alert.threat} />
                  </div>
                ))}
              </div>
              <div className="px-5 py-2.5 border-t border-slate-800/40 bg-slate-950/40 flex items-center gap-2">
                <Activity size={10} className="text-emerald-500/60" />
                <span className="text-[10px] text-slate-700 font-mono">Escaneando {envRivals.length} rivales activos · Próxima actualización en 4s</span>
              </div>
            </div>
          </div>

          {/* Competitor table */}
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/60 overflow-hidden"
            style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}>
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-800/60">
              <Target size={14} className="text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Rivales del Entorno</h3>
              <span className="ml-auto text-xs text-slate-600">{envRivals.length} objetivos monitorizados</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800/60">
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Rival Directo</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nivel de Amenaza</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-slate-500 uppercase tracking-widest">Último Movimiento Detectado</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-500 uppercase tracking-widest">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {envRivals.map((rival) => (
                    <tr key={rival.id}
                      className="group transition-colors duration-150 hover:bg-slate-800/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${threatBorder[rival.threat]}`}
                            style={{ background: 'rgba(15,23,42,0.8)' }}>
                            <Eye size={13} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-100">{rival.name}</p>
                            <p className="text-xs text-slate-600">{rival.category}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <ThreatBadge level={rival.threat} />
                      </td>
                      <td className="px-4 py-4">
                        <div>
                          <p className="text-sm text-slate-300 leading-snug max-w-sm">{rival.lastMove}</p>
                          <p className="text-xs text-slate-600 mt-1 font-mono">{rival.lastMoveTime}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => openDrawer(rival)}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold
                            bg-slate-800/60 border-slate-700/60 text-slate-300
                            hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-300
                            transition-all duration-200 group-hover:border-slate-600"
                        >
                          <Swords size={12} />
                          Ver Contramedida de IA
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Drawer overlay (Entorno Local) */}
      {(drawerOpen || selectedRival) && (
        <>
          <div
            className={`fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-40 transition-opacity duration-300 ${drawerOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeDrawer}
          />
          <div className={`fixed right-0 top-0 h-full w-full max-w-lg bg-slate-900 border-l border-slate-700/60 z-50 flex flex-col
            shadow-2xl transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
            style={{ boxShadow: '-8px 0 40px rgba(0,0,0,0.5)' }}>
            {selectedRival && (
              <>
                <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800/60 bg-slate-950/50 shrink-0">
                  <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${threatBorder[selectedRival.threat]}`}>
                    <ShieldAlert size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 font-mono uppercase tracking-widest mb-0.5">Contramedida de IA</p>
                    <p className="text-sm font-bold text-white truncate">{selectedRival.name}</p>
                  </div>
                  <button onClick={closeDrawer}
                    className="w-8 h-8 rounded-lg bg-slate-800/60 border border-slate-700/60 flex items-center justify-center
                      text-slate-400 hover:text-white hover:border-slate-600 transition-all duration-150 shrink-0">
                    <ChevronLeft size={16} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-800/50 border border-slate-700/40 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-100">{selectedRival.name}</p>
                      <p className="text-xs text-slate-500">{selectedRival.lastMove}</p>
                    </div>
                    <ThreatBadge level={selectedRival.threat} />
                  </div>
                  {aiLoading && (
                    <div className="flex flex-col items-center justify-center gap-4 py-12">
                      <div className="relative w-14 h-14">
                        <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20" />
                        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-400 animate-spin" />
                        <div className="absolute inset-2 rounded-full border border-emerald-500/10 border-t-emerald-500/40 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.2s' }} />
                      </div>
                      <div className="text-center space-y-1">
                        <p className="text-sm font-semibold text-slate-200">Analizando amenaza...</p>
                        <p className="text-xs text-slate-500">La IA está diseñando tu contramedida</p>
                      </div>
                    </div>
                  )}
                  {aiError && !aiLoading && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/8 px-5 py-4">
                      <p className="text-xs font-bold text-red-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
                        <AlertCircle size={11} /> Error
                      </p>
                      <p className="text-sm text-red-300">{aiError}</p>
                    </div>
                  )}
                  {aiContent && !aiLoading && (
                    <div className="rounded-xl border border-slate-700/40 bg-slate-800/30 px-5 py-5">
                      <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-1.5">
                        <BrainCircuit size={11} /> Contramedida Generada por IA
                      </p>
                      <SimpleMarkdown text={aiContent} />
                    </div>
                  )}
                </div>
                <div className="px-6 py-4 border-t border-slate-800/60 bg-slate-950/40 shrink-0">
                  <button
                    onClick={closeDrawer}
                    className="w-full py-2.5 rounded-xl bg-slate-800 border border-slate-700/60 text-sm font-semibold text-slate-300
                      hover:bg-slate-700 hover:text-white transition-all duration-150"
                  >
                    Cerrar Panel
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── AI Digital Twin ──────────────────────────────────────────────────────────

type CategoryOption = 'basic' | 'optimized' | 'hyper';

const CATEGORY_OPTIONS: { value: CategoryOption; label_key: string }[] = [
  { value: 'basic',     label_key: 'twin_cat_basic' },
  { value: 'optimized', label_key: 'twin_cat_optimized' },
  { value: 'hyper',     label_key: 'twin_cat_hyper' },
];


function CircularProgress({ value, size = 180 }: { value: number; size?: number }) {
  const r = (size / 2) - 14;
  const circ = 2 * Math.PI * r;
  const offset = circ - (value / 100) * circ;

  const color = value < 50 ? '#ef4444' : value <= 80 ? '#f59e0b' : '#10b981';
  const glowColor = value < 50 ? 'rgba(239,68,68,0.3)' : value <= 80 ? 'rgba(245,158,11,0.3)' : 'rgba(16,185,129,0.3)';

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

// ─── Local Heat Map ────────────────────────────────────────────────────────────

interface HeatPin {
  row: number;
  col: number;
  rank: number;       // 1-20+
  label: string;      // street label
  keyword: string;
}

type PinTier = 'top3' | 'top10' | 'invisible';

function pinTier(rank: number): PinTier {
  if (rank <= 3) return 'top3';
  if (rank <= 10) return 'top10';
  return 'invisible';
}

const GRID_LABELS = [
  ['NO', 'Norte', 'NE'],
  ['Oeste', 'Tu local', 'Este'],
  ['SO', 'Sur', 'SE'],
];

const KEYWORD_POOL = [
  'dentista cerca', 'mejor dentista', 'clínica dental',
  'dentista urgente', 'dentista económico', 'ortodoncia',
];

function buildPins(visibilityIndex: number, reviewRate: number): HeatPin[] {
  // Higher reviewRate = smaller distance penalty = green coverage extends further.
  // At reviewRate=0 : penaltyPerUnit = 9 → corners go invisible fast.
  // At reviewRate=30: penaltyPerUnit = 2 → coverage stays green at distance 2.
  const penaltyPerUnit = 9 - (reviewRate / 30) * 7;   // [9 → 2]

  const pins: HeatPin[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const isCenter = row === 1 && col === 1;
      // Manhattan distance from center cell (1,1)
      const dist = Math.abs(row - 1) + Math.abs(col - 1);

      // Base rank from global visibility (lower = better)
      const baseRank = Math.max(1, Math.round(20 - visibilityIndex * 0.18));

      // Geographic penalty: grows with distance, shrinks with more reviews
      const geopenalty = isCenter ? 0 : dist * penaltyPerUnit;

      // Small deterministic jitter per cell to avoid flat grid feel
      const jitter = isCenter ? 0 : Math.sin((row * 3 + col) * 7.3) * 1.5;

      const rank = Math.min(20, Math.max(1, Math.round(baseRank + geopenalty + jitter)));

      pins.push({
        row, col,
        rank,
        label: GRID_LABELS[row][col],
        keyword: KEYWORD_POOL[(row * 3 + col) % KEYWORD_POOL.length],
      });
    }
  }
  return pins;
}

const TIER_STYLES: Record<PinTier, { bg: string; border: string; text: string; dot: string; glow: string; labelKey: string; badge: string }> = {
  top3:      { bg: 'bg-emerald-500/20', border: 'border-emerald-400/60', text: 'text-emerald-300', dot: 'bg-emerald-400', glow: 'rgba(16,185,129,0.5)', labelKey: 'twin_tier_top3', badge: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' },
  top10:     { bg: 'bg-amber-500/20',   border: 'border-amber-400/60',   text: 'text-amber-300',   dot: 'bg-amber-400',   glow: 'rgba(245,158,11,0.5)',  labelKey: 'twin_tier_top10', badge: 'bg-amber-500/15 border-amber-500/30 text-amber-300' },
  invisible: { bg: 'bg-red-500/20',     border: 'border-red-400/60',     text: 'text-red-300',     dot: 'bg-red-400',     glow: 'rgba(239,68,68,0.5)',   labelKey: 'twin_tier_inv', badge: 'bg-red-500/15 border-red-500/30 text-red-300' },
};

const TIER_TIP_KEYS: Record<PinTier, string> = {
  top3:      'twin_tip_top3',
  top10:     'twin_tip_top10',
  invisible: 'twin_tip_inv',
};

function LocalHeatMap({ visibilityIndex, reviewRate }: { visibilityIndex: number; reviewRate: number }) {
  const { t } = useI18n();
  const [pins, setPins] = useState<HeatPin[]>(() => buildPins(visibilityIndex, reviewRate));
  const [selected, setSelected] = useState<HeatPin | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const prevVis = React.useRef(visibilityIndex);
  const prevRate = React.useRef(reviewRate);

  useEffect(() => {
    const visChanged = Math.abs(visibilityIndex - prevVis.current) >= 1;
    const rateChanged = reviewRate !== prevRate.current;
    if (visChanged || rateChanged) {
      prevVis.current = visibilityIndex;
      prevRate.current = reviewRate;
      const next = buildPins(visibilityIndex, reviewRate);
      setPins(next);
      setSelected(prev => prev
        ? next.find(p => p.row === prev.row && p.col === prev.col) ?? null
        : null
      );
    }
  }, [visibilityIndex, reviewRate]);

  const dominantTier = (): PinTier => {
    const counts = { top3: 0, top10: 0, invisible: 0 };
    pins.forEach(p => counts[pinTier(p.rank)]++);
    if (counts.top3 >= 5) return 'top3';
    if (counts.invisible >= 5) return 'invisible';
    return 'top10';
  };

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-gradient-to-br from-slate-900/80 to-slate-950/60 overflow-hidden"
      style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-800/60">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center">
            <MapPinned size={14} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest">{t('twin_heatmap_title')}</h2>
            <p className="text-xs text-slate-600 mt-0.5">{t('twin_heatmap_desc')}</p>
          </div>
        </div>
        <div className="flex items-center gap-5 shrink-0">
          {/* Coverage radius indicator */}
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-end gap-0.5">
              {[...Array(5)].map((_, i) => {
                const filled = i < Math.ceil((reviewRate / 30) * 5);
                const barColor = filled
                  ? (reviewRate >= 20 ? 'bg-emerald-400' : reviewRate >= 10 ? 'bg-amber-400' : 'bg-red-400')
                  : 'bg-slate-700';
                return (
                  <div key={i} className={`w-1.5 rounded-sm transition-all duration-300 ${barColor}`}
                    style={{ height: `${8 + i * 3}px` }} />
                );
              })}
            </div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('twin_heatmap_coverage')}</span>
          </div>
          <div className="flex items-center gap-4">
            {(['top3', 'top10', 'invisible'] as PinTier[]).map(tier => (
              <div key={tier} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${TIER_STYLES[tier].dot}`}
                  style={{ boxShadow: `0 0 6px ${TIER_STYLES[tier].glow}` }} />
                <span className="text-[10px] font-semibold text-slate-500">{t(TIER_STYLES[tier].labelKey as Parameters<typeof t>[0])}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Map canvas */}
        <div className="lg:col-span-3 space-y-3">
          {/* Compass rose + city center label */}
          <div className="relative rounded-2xl border border-slate-800/50 bg-slate-950/60 p-4 overflow-hidden"
            style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.3)' }}>
            {/* Background map grid lines */}
            <svg className="absolute inset-0 w-full h-full opacity-10 pointer-events-none" style={{ zIndex: 0 }}>
              <defs>
                <pattern id="mapgrid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#64748b" strokeWidth="0.5"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#mapgrid)" />
            </svg>

            {/* Compass */}
            <div className="absolute top-3 right-3 w-8 h-8 opacity-30 pointer-events-none" style={{ zIndex: 1 }}>
              <svg viewBox="0 0 32 32" className="w-full h-full">
                <circle cx="16" cy="16" r="14" fill="none" stroke="#64748b" strokeWidth="1"/>
                <text x="16" y="6" textAnchor="middle" fill="#94a3b8" fontSize="6" fontWeight="bold">N</text>
                <text x="26" y="18" textAnchor="middle" fill="#64748b" fontSize="5">E</text>
                <text x="6" y="18" textAnchor="middle" fill="#64748b" fontSize="5">O</text>
                <text x="16" y="28" textAnchor="middle" fill="#64748b" fontSize="5">S</text>
              </svg>
            </div>

            {/* Radius rings — color reflects review-rate coverage */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 1 }}>
              {[0.85, 0.6, 0.35].map((scale, i) => {
                // ring 2 (outer) = distance-2 coverage, ring 1 = distance-1, ring 0 = center
                const ringDist = 2 - i;   // 2, 1, 0
                const penaltyPerUnit = 9 - (reviewRate / 30) * 7;
                const worstRankAtRing = Math.round(20 - visibilityIndex * 0.18 + ringDist * penaltyPerUnit);
                const ringTier: PinTier = worstRankAtRing <= 3 ? 'top3' : worstRankAtRing <= 10 ? 'top10' : 'invisible';
                const ringColor = ringTier === 'top3' ? 'rgba(16,185,129,0.25)' : ringTier === 'top10' ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.15)';
                return (
                  <div key={i} className="absolute rounded-full border transition-all duration-500"
                    style={{
                      width: `${scale * 100}%`,
                      height: `${scale * 100}%`,
                      borderColor: ringColor,
                      boxShadow: `0 0 12px ${ringColor}`,
                    }} />
                );
              })}
            </div>

            {/* 3×3 pin grid */}
            <div className="relative grid grid-cols-3 gap-3" style={{ zIndex: 2 }}>
              {pins.map((pin) => {
                const tier = pinTier(pin.rank);
                const s = TIER_STYLES[tier];
                const isCenter = pin.row === 1 && pin.col === 1;
                const pinKey = `${pin.row}-${pin.col}`;
                const isSelected = selected?.row === pin.row && selected?.col === pin.col;
                const isHovered = hovered === pinKey;

                return (
                  <button
                    key={pinKey}
                    onClick={() => setSelected(isSelected ? null : pin)}
                    onMouseEnter={() => setHovered(pinKey)}
                    onMouseLeave={() => setHovered(null)}
                    className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200
                      ${isSelected
                        ? `${s.bg} ${s.border} scale-105`
                        : isHovered
                          ? 'bg-slate-800/60 border-slate-600/50 scale-102'
                          : 'bg-slate-900/40 border-slate-800/40 hover:bg-slate-800/40'
                      }`}
                    style={isSelected ? { boxShadow: `0 0 20px ${s.glow}40` } : {}}
                  >
                    {/* Pin icon */}
                    <div className="relative">
                      <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all duration-200
                        ${isSelected || isHovered ? `${s.bg} ${s.border}` : 'bg-slate-800/80 border-slate-700/60'}`}
                        style={isSelected ? { boxShadow: `0 0 12px ${s.glow}` } : {}}>
                        {isCenter ? (
                          <div className={`w-3 h-3 rounded-full ${s.dot} transition-colors duration-300`}
                            style={{ boxShadow: `0 0 8px ${s.glow}` }} />
                        ) : (
                          <MapPin size={13} className={`transition-colors duration-200 ${isSelected || isHovered ? s.text : 'text-slate-500'}`} />
                        )}
                      </div>
                      {/* Rank badge */}
                      <div className={`absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full border text-[8px] font-black flex items-center justify-center
                        transition-all duration-200 min-w-[18px] min-h-[18px]
                        ${isSelected ? s.badge : 'bg-slate-800 border-slate-700/60 text-slate-400'}`}>
                        #{pin.rank}
                      </div>
                    </div>
                    {/* Label */}
                    <span className={`text-[10px] font-semibold text-center leading-tight transition-colors duration-200 ${
                      isSelected ? s.text : isCenter ? 'text-slate-300' : 'text-slate-600'
                    }`}>
                      {pin.label}
                    </span>
                    {/* Tier dot */}
                    <div className={`w-1.5 h-1.5 rounded-full ${s.dot} transition-all duration-200`}
                      style={{ opacity: isSelected || isHovered ? 1 : 0.5, boxShadow: isSelected ? `0 0 6px ${s.glow}` : 'none' }} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            {(['top3', 'top10', 'invisible'] as PinTier[]).map(tier => {
              const count = pins.filter(p => pinTier(p.rank) === tier).length;
              const s = TIER_STYLES[tier];
              return (
                <div key={tier} className={`rounded-xl border px-3 py-2.5 text-center ${s.badge}`}>
                  <p className="text-xl font-black tabular-nums">{count}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{t(s.labelKey as Parameters<typeof t>[0])}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail panel */}
        <div className="lg:col-span-2 space-y-4">
          {selected ? (() => {
            const tier = pinTier(selected.rank);
            const s = TIER_STYLES[tier];
            const isCenter = selected.row === 1 && selected.col === 1;
            const dist = Math.abs(selected.row - 1) + Math.abs(selected.col - 1);
            // Visibility drop per distance unit decreases as reviewRate increases
            const dropPerUnit = 12 - (reviewRate / 30) * 9;  // [12 → 3]
            const visEst = Math.max(5, Math.min(98, Math.round(
              visibilityIndex - dist * dropPerUnit
            )));
            return (
              <div className="space-y-4">
                {/* Pin header */}
                <div className={`rounded-xl border px-4 py-4 ${s.badge}`}
                  style={{ boxShadow: `0 0 20px ${s.glow}20` }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-9 h-9 rounded-full border-2 ${s.border} ${s.bg} flex items-center justify-center shrink-0`}
                      style={{ boxShadow: `0 0 12px ${s.glow}` }}>
                      {isCenter
                        ? <div className={`w-3.5 h-3.5 rounded-full ${s.dot}`} style={{ boxShadow: `0 0 8px ${s.glow}` }} />
                        : <MapPin size={15} className={s.text} />}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Zona {selected.label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-base font-black tabular-nums ${s.text}`}>#{selected.rank}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${s.badge}`}>{t(s.labelKey as Parameters<typeof t>[0])}</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{t(TIER_TIP_KEYS[tier] as Parameters<typeof t>[0])}</p>
                </div>

                {/* Visibility bar */}
                <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 px-4 py-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('twin_vis_estimated')}</p>
                    <span className={`text-sm font-black tabular-nums ${s.text}`}>{visEst}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700 ${s.dot === 'bg-emerald-400' ? 'bg-emerald-500' : s.dot === 'bg-amber-400' ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${visEst}%` }} />
                  </div>
                </div>

                {/* Keyword trigger */}
                <div className="rounded-xl border border-slate-800/50 bg-slate-900/40 px-4 py-3.5 space-y-2">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('twin_sim_search')}</p>
                  <div className="flex items-center gap-2 bg-slate-800/60 rounded-lg px-3 py-2 border border-slate-700/50">
                    <Search size={11} className="text-slate-500 shrink-0" />
                    <span className="text-xs text-slate-300 font-mono">"{selected.keyword}"</span>
                  </div>
                  <p className="text-xs text-slate-600">
                    En esta zona, para esta búsqueda tu negocio aparece en posición <span className={`font-bold ${s.text}`}>#{selected.rank}</span>.
                  </p>
                </div>

                {/* Action tip */}
                {tier !== 'top3' && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-blue-500/20 bg-blue-500/6 px-4 py-3">
                    <Lightbulb size={13} className="text-blue-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {tier === 'top10' ? t('twin_action_tip_top10') : t('twin_action_tip_inv')}
                    </p>
                  </div>
                )}
              </div>
            );
          })() : (
            <div className="flex flex-col items-center justify-center gap-4 h-full py-10 text-center">
              <div className="w-14 h-14 rounded-2xl border border-slate-700/50 bg-slate-800/50 flex items-center justify-center">
                <MapPinned size={22} className="text-slate-600" />
              </div>
              <div className="space-y-1.5">
                <p className="text-sm font-semibold text-slate-500">{t('twin_heatmap_click')}</p>
                <p className="text-xs text-slate-700 max-w-[200px]">{t('twin_heatmap_click_desc')}</p>
              </div>
              <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-xs font-bold ${TIER_STYLES[dominantTier()].badge}`}>
                <div className={`w-2 h-2 rounded-full ${TIER_STYLES[dominantTier()].dot}`} />
                {t('twin_heatmap_dominant')}: {t(TIER_STYLES[dominantTier()].labelKey as Parameters<typeof t>[0])}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AiDigitalTwin() {
  const { t } = useI18n();
  const [reviewRate, setReviewRate] = useState(5);
  const [postFreq, setPostFreq] = useState(2);
  const [category, setCategory] = useState<CategoryOption>('basic');
  const [displayIndex, setDisplayIndex] = useState(0);

  const catBonus: Record<CategoryOption, number> = { basic: 0, optimized: 15, hyper: 25 };
  const visibilityIndex = Math.min(100, Math.round(40 + reviewRate * 1.5 + postFreq * 3 + catBonus[category]));
  const projectedClients = Math.round(visibilityIndex * 3.5);

  const sentiment =
    visibilityIndex < 50
      ? t('twin_s_invisible')
      : visibilityIndex <= 80
      ? t('twin_s_moderate')
      : t('twin_s_dominant');

  useEffect(() => {
    const diff = visibilityIndex - displayIndex;
    if (diff === 0) return;
    const step = diff > 0 ? 1 : -1;
    const timer = setTimeout(() => setDisplayIndex((v) => v + step), 12);
    return () => clearTimeout(timer);
  }, [visibilityIndex, displayIndex]);

  const sentimentColor =
    visibilityIndex < 50
      ? { text: 'text-red-300',     border: 'border-red-500/20',     bg: 'bg-red-500/8',     dot: 'bg-red-400',     fill: 'bg-red-400' }
      : visibilityIndex <= 80
      ? { text: 'text-amber-300',   border: 'border-amber-500/20',   bg: 'bg-amber-500/8',   dot: 'bg-amber-400',   fill: 'bg-amber-400' }
      : { text: 'text-emerald-300', border: 'border-emerald-500/20', bg: 'bg-emerald-500/8', dot: 'bg-emerald-400', fill: 'bg-emerald-400' };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="border-b border-slate-800/50 pb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">
          AI Digital <span className="text-emerald-400">Twin</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-xl">
          {t('twin_desc')}
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
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest">{t('twin_control')}</h2>
          </div>

          {/* Slider: Review rate */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {t('twin_slider_reviews')}
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
                { label: t('twin_reviews_low'), val: 5, hint: '< 5/mes' },
                { label: t('twin_reviews_mid'), val: 12, hint: '5-15/mes' },
                { label: t('twin_reviews_high'), val: 25, hint: '> 15/mes' },
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
                {t('twin_slider_posts')}
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
              {t('twin_category_label')}
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
                  <option key={opt.value} value={opt.value}>{t(opt.label_key as Parameters<typeof t>[0])}</option>
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
              {category === 'basic' && t('twin_cat_basic_hint')}
              {category === 'optimized' && t('twin_cat_optimized_hint')}
              {category === 'hyper' && t('twin_cat_hyper_hint')}
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
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest">{t('twin_viewer')}</h2>
          </div>

          {/* Circular progress */}
          <div className="flex flex-col items-center gap-3 py-2">
            <CircularProgress value={displayIndex} size={192} />
            <div className="flex items-center gap-4 text-center">
              <div className="space-y-0.5">
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{t('twin_level_label')}</p>
                <p className={`text-xs font-bold px-3 py-1 rounded-full border transition-all duration-300 ${
                  displayIndex < 50
                    ? 'bg-red-500/15 border-red-500/25 text-red-300'
                    : displayIndex <= 80
                    ? 'bg-amber-500/15 border-amber-500/25 text-amber-300'
                    : 'bg-emerald-500/15 border-emerald-500/25 text-emerald-300'
                }`}>
                  {displayIndex < 50 ? t('twin_level_invisible') : displayIndex <= 80 ? t('twin_level_emerging') : t('twin_level_dominant')}
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
              <p className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-0.5">{t('twin_projected')}</p>
              <div className="flex items-end gap-2">
                <span
                  className="text-3xl font-bold text-white tabular-nums"
                  style={{ transition: 'all 0.3s ease' }}
                >
                  {projectedClients.toLocaleString()}
                </span>
                <span className="text-slate-500 text-sm mb-1">{t('twin_per_month')}</span>
              </div>
            </div>
            <div className="shrink-0">
              <div className={`w-2 h-2 rounded-full animate-pulse ${
                projectedClients < 175 ? 'bg-red-400' : projectedClients < 280 ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
            </div>
          </div>

          {/* AI Sentiment box */}
          <div className={`rounded-2xl border p-5 flex flex-col gap-3 transition-all duration-500 ${sentimentColor.border} ${sentimentColor.bg}`}
            style={{ boxShadow: visibilityIndex < 50 ? '0 4px 24px rgba(239,68,68,0.1)' : visibilityIndex <= 80 ? '0 4px 24px rgba(245,158,11,0.1)' : '0 4px 24px rgba(16,185,129,0.1)' }}>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shrink-0 animate-pulse ${sentimentColor.dot}`} />
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{t('twin_sentiment_label')}</span>
            </div>
            <p className={`text-sm leading-relaxed font-medium transition-all duration-500 ${sentimentColor.text}`}>
              {sentiment}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1 rounded-full bg-slate-700/60 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${sentimentColor.fill}`}
                  style={{ width: `${visibilityIndex}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 tabular-nums">{visibilityIndex}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Local heat map */}
      <LocalHeatMap visibilityIndex={visibilityIndex} reviewRate={reviewRate} />

      {/* Campaign Sandbox */}
      <AiCampaignSandbox />
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
  const { t } = useI18n();
  const [tab, setTab] = useState<'generator' | 'saved' | 'maps-scanner' | 'ai-twin' | 'radar' | 'geo-audit' | 'ai-advisor'>('ai-advisor');
  const [product, setProduct] = useState('');
  const [city, setCity] = useState('');
  const [platform, setPlatform] = useState<Platform>('');
  const [tipo, setTipo] = useState<Tipo>('producto');
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
          schema: JSON.stringify({
            "@context": "https://schema.org",
            "@type": tipo === 'servicio' ? "LocalBusiness" : "Store",
            "name": `${product}${city ? ` — ${city}` : ''}`,
            "description": `${product} de calidad superior en ${city || 'España'}. Disponible en ${platform || 'nuestra tienda'}.`,
            "address": {
              "@type": "PostalAddress",
              "streetAddress": "",
              "addressLocality": city || "España",
              "addressRegion": "",
              "postalCode": "",
              "addressCountry": "ES"
            },
            "geo": { "@type": "GeoCoordinates", "latitude": "", "longitude": "" },
            "telephone": "",
            "url": "",
            "openingHours": [],
            "priceRange": "€€",
            "areaServed": city || "España",
            "hasOfferCatalog": { "@type": "OfferCatalog", "name": product },
            "sameAs": [],
          }, null, 2),
        };
      } else {
        data = await callGenerateSEO(product, city, platform, keywords, session!.access_token, tipo, imageFile);
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
      <div
        className="flex gap-1.5 mb-8 rounded-2xl p-1.5 w-full overflow-x-auto"
        style={{
          background: 'rgba(15,18,30,0.7)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.06)',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}
      >
        <button
          onClick={() => setTab('generator')}
          className={`flex items-center justify-start gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap shrink-0
            ${tab === 'generator'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          style={tab === 'generator' ? { boxShadow: '0 4px 16px rgba(16,185,129,0.3)' } : {}}
        >
          <Sparkles size={14} />
          {t('tab_generator')}
        </button>
        <button
          onClick={() => setTab('saved')}
          className={`flex items-center justify-start gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap shrink-0
            ${tab === 'saved'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          style={tab === 'saved' ? { boxShadow: '0 4px 16px rgba(16,185,129,0.3)' } : {}}
        >
          <History size={14} />
          {t('tab_saved')}
        </button>
        <button
          onClick={() => setTab('maps-scanner')}
          className={`flex items-center justify-start gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap shrink-0
            ${tab === 'maps-scanner'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          style={tab === 'maps-scanner' ? { boxShadow: '0 4px 16px rgba(16,185,129,0.3)' } : {}}
        >
          <MapPinned size={14} />
          {t('tab_maps')}
        </button>
        <button
          onClick={() => setTab('ai-twin')}
          className={`flex items-center justify-start gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap shrink-0
            ${tab === 'ai-twin'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          style={tab === 'ai-twin' ? { boxShadow: '0 4px 16px rgba(16,185,129,0.3)' } : {}}
        >
          <BrainCircuit size={14} />
          {t('tab_twin')}
        </button>
        <button
          onClick={() => setTab('radar')}
          className={`flex items-center justify-start gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap shrink-0
            ${tab === 'radar'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          style={tab === 'radar' ? { boxShadow: '0 4px 16px rgba(16,185,129,0.3)' } : {}}
        >
          <Radar size={14} />
          {t('tab_radar')}
        </button>
        <button
          onClick={() => setTab('geo-audit')}
          className={`flex items-center justify-start gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap shrink-0
            ${tab === 'geo-audit'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          style={tab === 'geo-audit' ? { boxShadow: '0 4px 16px rgba(16,185,129,0.3)' } : {}}
        >
          <ScanSearch size={14} />
          {t('tab_geo')}
        </button>
        <button
          onClick={() => setTab('ai-advisor')}
          className={`flex items-center justify-start gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-200 whitespace-nowrap shrink-0
            ${tab === 'ai-advisor'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}
          style={tab === 'ai-advisor' ? { boxShadow: '0 4px 16px rgba(16,185,129,0.3)' } : {}}
        >
          <BarChart2 size={14} />
          AI Advisor
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
      ) : tab === 'radar' ? (
        <CompetitorRadar city={city} />
      ) : tab === 'geo-audit' ? (
        <GeoAuditPanel product={product} city={city} />
      ) : tab === 'ai-advisor' ? (
        <AIBusinessAdvisor session={session!} previewMode={previewMode} />
      ) : (
      <>
      {/* Page header */}
      <div className="border-b border-white/5 mb-8 pb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-2 tracking-tight">
          {t('dash_title')}{' '}
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-blue-400 bg-clip-text text-transparent">{t('dash_title_highlight')}</span>
        </h1>
        <p className="text-slate-400 text-sm sm:text-base max-w-xl">
          {t('dash_desc')}
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
        <div
          className="rounded-2xl p-6 shadow-2xl shadow-black/40 space-y-5"
          style={{ background: 'rgba(10,13,24,0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
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
              className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-3.5 text-sm text-slate-100
                placeholder-slate-600 outline-none transition-all duration-200
                focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/15 focus:bg-slate-950/80"
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
              className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-3.5 text-sm text-slate-100
                placeholder-slate-600 outline-none transition-all duration-200
                focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/15 focus:bg-slate-950/80"
            />
          </div>

          {/* Tipo de negocio */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Tag size={11} className="text-slate-500" />
              Tipo de negocio
            </label>
            <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800/80 rounded-xl p-1 w-fit">
              {(['producto', 'servicio'] as Tipo[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => { setTipo(t); setPlatform(''); }}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 capitalize ${
                    tipo === t
                      ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {t === 'producto' ? 'Producto' : 'Servicio'}
                </button>
              ))}
            </div>
          </div>

          {/* Platform */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag size={11} className="text-slate-500" />
              {tipo === 'servicio' ? 'Canal de presencia' : 'Plataforma'}
            </label>
            <div className="relative">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
              className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-3.5 text-sm text-slate-100
                placeholder-slate-600 outline-none appearance-none cursor-pointer transition-all duration-200
                focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/15 focus:bg-slate-950/80"
              >
                {tipo === 'producto' ? (
                  <>
                    <option value="" className="bg-slate-900">Selecciona una plataforma...</option>
                    <option value="Etsy" className="bg-slate-900">Etsy</option>
                    <option value="Shopify" className="bg-slate-900">Shopify</option>
                    <option value="WooCommerce" className="bg-slate-900">WooCommerce</option>
                    <option value="Amazon" className="bg-slate-900">Amazon</option>
                    <option value="eBay" className="bg-slate-900">eBay</option>
                    <option value="Wallapop" className="bg-slate-900">Wallapop</option>
                    <option value="Vinted" className="bg-slate-900">Vinted</option>
                    <option value="Facebook Marketplace" className="bg-slate-900">Facebook Marketplace</option>
                  </>
                ) : (
                  <>
                    <option value="" className="bg-slate-900">Selecciona un canal...</option>
                    <option value="Google Business" className="bg-slate-900">Google Business (Ficha de empresa)</option>
                    <option value="Web propia / Blog" className="bg-slate-900">Web propia / Blog SEO</option>
                    <option value="Instagram / Facebook" className="bg-slate-900">Instagram / Facebook</option>
                    <option value="Booking.com" className="bg-slate-900">Booking.com</option>
                    <option value="Doctoralia" className="bg-slate-900">Doctoralia</option>
                    <option value="TripAdvisor" className="bg-slate-900">TripAdvisor</option>
                    <option value="Habitissimo" className="bg-slate-900">Habitissimo</option>
                    <option value="Treatwell" className="bg-slate-900">Treatwell</option>
                  </>
                )}
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
              className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-3.5 text-sm text-slate-100
                placeholder-slate-600 outline-none resize-none transition-all duration-200
                focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/15 focus:bg-slate-950/80"
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
              className="w-full bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-3.5 text-sm text-slate-100
                placeholder-slate-600 outline-none transition-all duration-200
                focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/15 focus:bg-slate-950/80"
            />
            <p className="text-xs text-slate-600">
              La IA detectara oportunidades de posicionamiento frente a ese competidor.
            </p>
          </div>

          {/* CTA — generate */}
          <button
            onClick={handleGenerate}
            disabled={(!canGenerate && isActive) || (isActive && isLoading)}
            className={`w-full flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-full font-semibold text-sm
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
            <div
              className="rounded-2xl border-dashed border border-white/8 p-12 flex flex-col items-center justify-center text-center gap-4 min-h-[400px]"
              style={{ background: 'rgba(10,13,24,0.4)' }}
            >
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

              {/* ── Schema JSON-LD code editor ─────────────────────── */}
              {result?.schema && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-slate-800/60" />
                    <span className="text-[10px] font-bold text-sky-400 uppercase tracking-widest px-2">
                      Código Estructurado · LocalBusiness Schema
                    </span>
                    <div className="flex-1 h-px bg-slate-800/60" />
                  </div>
                  <SchemaCodePanel schema={result.schema} />
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
    <div className="rounded-2xl bg-slate-900 border-2 border-emerald-500/40 p-8 shadow-2xl shadow-emerald-500/10 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-24 bg-emerald-500/8 rounded-full blur-3xl pointer-events-none" />
      <div className="relative text-center mb-6">
        <span className="inline-block bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-bold px-4 py-1 rounded-full mb-4">
          TODO INCLUIDO
        </span>
        <p className="text-slate-400 text-sm font-medium mb-2">Plan Pro</p>
        <div className="flex items-end justify-center gap-1">
          <span className="text-5xl font-bold text-white tracking-tight">9.99</span>
          <span className="text-slate-400 mb-2">€/mes</span>
        </div>
        <p className="text-slate-500 text-xs mt-1">7 días gratis · Cancela cuando quieras</p>
      </div>
      <ul className="space-y-2.5 mb-8 relative">
        {[
          'Generador SEO ilimitado (16+ plataformas)',
          'Escáner de Ficha Google Maps + Score',
          'AI Digital Twin — mapa de calor local',
          'Radar de Competencia en tiempo real',
          'GEO Audit — visibilidad en ChatGPT y Gemini',
          'Plan de contenido semanal con IA',
          'Escáner de directorios locales',
          'Exportación a CSV (Shopify, Etsy)',
          'Análisis de imagen con alt text automático',
          'Actualizaciones del motor IA incluidas',
        ].map((f) => (
          <li key={f} className="flex items-center gap-3 text-xs text-slate-300">
            <div className="w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Check size={9} className="text-emerald-400" />
            </div>
            {f}
          </li>
        ))}
      </ul>
      <button
        onClick={onSubscribe}
        disabled={isLoading}
        className="relative w-full flex items-center justify-center gap-2 py-3.5 rounded-full font-bold text-sm
          bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
          text-slate-950 shadow-lg shadow-emerald-500/25 transition-all duration-300 hover:-translate-y-0.5
          disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
      >
        {isLoading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} fill="currentColor" />}
        {isLoading ? 'Redirigiendo a pago...' : 'Activar Plan Pro'}
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

// ─── Admin denied toast ───────────────────────────────────────────────────────

function AdminDeniedToast({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 pointer-events-none">
      <div className="pointer-events-auto bg-slate-900 border border-slate-700/80 rounded-2xl px-5 py-3.5 shadow-2xl shadow-black/50 flex items-center justify-between gap-4 animate-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
            <Lock size={13} className="text-red-400" />
          </div>
          <p className="text-sm text-slate-300 font-medium">
            Acceso restringido a administradores.
          </p>
        </div>
        <button onClick={onDismiss} className="text-slate-600 hover:text-slate-400 transition-colors shrink-0">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Trial banner ─────────────────────────────────────────────────────────────

function TrialBanner({ daysLeft, onDismiss }: { daysLeft: number; onDismiss: () => void }) {
  const urgent = daysLeft <= 1;
  return (
    <div className={`border-b ${urgent ? 'border-amber-500/25 bg-amber-500/8' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 shrink-0`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${urgent ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span className={`text-xs font-bold uppercase tracking-wider ${urgent ? 'text-amber-400' : 'text-emerald-400'}`}>
              {urgent ? 'Prueba terminando' : 'Prueba gratuita'}
            </span>
          </div>
          <span className="text-slate-300 text-xs">
            {urgent
              ? 'Tu prueba termina hoy — activa el plan para no perder el acceso'
              : `Te quedan ${daysLeft} días de prueba gratuita · Activa el plan cuando quieras`}
          </span>
        </div>
        <button
          onClick={onDismiss}
          className="text-slate-600 hover:text-slate-400 text-xs transition-colors shrink-0"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
// v2.6

// Set to true while building to skip auth and preview the dashboard directly
const DEV_PREVIEW = false;


export default function App() {
  const { user, session, loading, signOut } = useAuth();
  const { isActive, status, trialDaysLeft, cancelAtPeriodEnd, currentPeriodEnd, loadingSubscription, refresh } = useSubscription(user);
  const [showLogin, setShowLogin] = useState(false);
  const [loginInitialMode, setLoginInitialMode] = useState<'login' | 'signup'>('login');
  // Initialized from sessionStorage so Google OAuth redirect restores the intent
  const [pendingCheckout, setPendingCheckout] = useState(() => {
    try { return sessionStorage.getItem('postAuthAction') === 'checkout'; } catch { return false; }
  });
  const [showPricing, setShowPricing] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [showTrialBanner, setShowTrialBanner] = useState(true);
  const [legalModal, setLegalModal] = useState<LegalModal>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [cancelDone, setCancelDone] = useState(false);
  const [showAdminDenied, setShowAdminDenied] = useState(false);

  const isAdminEmail = !!(import.meta.env.VITE_ADMIN_EMAIL && user?.email === import.meta.env.VITE_ADMIN_EMAIL);

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
    } else if (params.get('admin_denied') === '1') {
      setShowAdminDenied(true);
      window.history.replaceState({}, '', '/');
      setTimeout(() => setShowAdminDenied(false), 4000);
    }
  }, []);

  // Fire pixel events once auth state is resolved
  useEffect(() => {
    if (loading) return;
    if (user) {
      trackPageView();
    } else {
      trackViewContent({
        content_name: 'Landing Page',
        content_category: 'SEO Tool',
      });
    }
  }, [loading, user]);

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

  // Auto-checkout after sign-up / Google OAuth when user clicked "Start trial"
  // Waits for session.access_token to be ready to avoid stale-closure on startCheckout
  useEffect(() => {
    if (!pendingCheckout || !session?.access_token || loadingSubscription || isActive) return;
    setPendingCheckout(false);
    try { sessionStorage.removeItem('postAuthAction'); } catch { /* sandboxed */ }
    startCheckout();
  }, [pendingCheckout, session?.access_token, loadingSubscription, isActive, startCheckout]);

  const handlePricingClick = () => setShowPricing(true);

  const handleCancelSubscription = useCallback(async () => {
    if (!session?.access_token) return;
    setCancelLoading(true);
    setCancelError('');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-cancel-subscription`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Error desconocido');
      await refresh();
      setCancelDone(true);
    } catch (err: any) {
      setCancelError(err.message);
    } finally {
      setCancelLoading(false);
    }
  }, [session, refresh]);

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
    // If user navigates to /admin while logged out, show login modal directly
    if (window.location.pathname === '/admin') {
      return (
        <div className="min-h-screen bg-slate-950">
          <LoginModal onClose={() => window.history.back()} initialMode="login" />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-950">
        <Navbar
          user={null}
          onLoginClick={() => setShowLogin(true)}
          onPricingClick={handlePricingClick}
          onSignOut={signOut}
        />
        <LandingPage
          onLoginClick={() => { setLoginInitialMode('signup'); setShowLogin(true); }}
          onSubscribeClick={() => {
            try { sessionStorage.setItem('postAuthAction', 'checkout'); } catch { /* sandboxed */ }
            setPendingCheckout(true);
            setLoginInitialMode('signup');
            setShowLogin(true);
          }}
          scrollToPricing={showPricing}
        />
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} initialMode={loginInitialMode} />}
      </div>
    );
  }

  // Admin route — guarded: only the VITE_ADMIN_EMAIL user can access
  if (window.location.pathname === '/admin') {
    if (!isAdminEmail) {
      window.location.replace('/?admin_denied=1');
      return null;
    }
    return <AdminDashboard session={session} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {showSuccessBanner && <SuccessBanner onDismiss={() => setShowSuccessBanner(false)} />}
      {showAdminDenied && <AdminDeniedToast onDismiss={() => setShowAdminDenied(false)} />}
      {status === 'trialing' && trialDaysLeft !== null && showTrialBanner && (
        <TrialBanner daysLeft={trialDaysLeft} onDismiss={() => setShowTrialBanner(false)} />
      )}

      <Navbar
        user={user}
        onLoginClick={() => setShowLogin(true)}
        onPricingClick={handlePricingClick}
        onSignOut={signOut}
        isActive={DEV_PREVIEW || isActive}
        isAdmin={isAdminEmail}
        cancelAtPeriodEnd={cancelAtPeriodEnd}
        onCancelSubscription={() => { setCancelDone(false); setCancelError(''); setShowCancelModal(true); }}
      />

      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => !cancelLoading && setShowCancelModal(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700/60 p-6 shadow-2xl">
            {cancelDone ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
                  <Check size={20} className="text-emerald-400" />
                </div>
                <p className="text-white font-bold text-base mb-1">Suscripción cancelada</p>
                <p className="text-slate-400 text-sm mb-6">Tu acceso Pro continúa activo hasta el final del período de facturación.</p>
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="w-full py-3 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                    <AlertCircle size={18} className="text-amber-400" />
                  </div>
                  <h2 className="text-white font-bold text-base">Cancelar suscripción</h2>
                </div>
                <p className="text-slate-400 text-sm mb-3">
                  Si cancelas, perderás el acceso a todas las herramientas Pro al final del período de facturación actual.
                </p>
                {currentPeriodEnd && (
                  <div className="bg-slate-800/60 border border-slate-700/40 rounded-xl px-4 py-3 mb-4 text-sm">
                    <span className="text-slate-400">Tendrás acceso hasta el </span>
                    <span className="text-white font-semibold">
                      {currentPeriodEnd.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </span>
                  </div>
                )}
                {cancelError && (
                  <p className="text-red-400 text-xs mb-3">{cancelError}</p>
                )}
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleCancelSubscription}
                    disabled={cancelLoading}
                    className="w-full py-3 rounded-xl text-sm font-semibold bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {cancelLoading ? 'Cancelando...' : 'Sí, cancelar suscripción'}
                  </button>
                  <button
                    onClick={() => setShowCancelModal(false)}
                    disabled={cancelLoading}
                    className="w-full py-3 rounded-xl text-sm font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 transition-colors disabled:opacity-50"
                  >
                    Mantener suscripción
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LogoIcon size={22} />
            <span className="text-xs text-slate-600 font-medium">LocalSEO<span className="text-emerald-600">Hub</span></span>
          </div>
          <p className="text-xs text-slate-700">Potenciado por inteligencia artificial · localseohub.io</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setLegalModal('privacy')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Política de Privacidad
            </button>
            <button onClick={() => setLegalModal('terms')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Términos de Servicio
            </button>
            <button onClick={() => setLegalModal('contact')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              Contacto
            </button>
          </div>
        </div>
      </footer>

      {legalModal === 'privacy' && <PrivacyModal onClose={() => setLegalModal(null)} />}
      {legalModal === 'terms' && <TermsModal onClose={() => setLegalModal(null)} />}
      {legalModal === 'contact' && <ContactModal onClose={() => setLegalModal(null)} />}
    </div>
  );
}
