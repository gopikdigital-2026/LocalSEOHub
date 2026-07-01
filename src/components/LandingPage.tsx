import {
  MapPin, Zap, TrendingUp, Shield, Star, Check, ArrowRight, Sparkles,
  Eye, Globe, Target, Calendar, MapPinned, ChevronRight, X, HelpCircle,
  Clock, Users, Award, BarChart3, Flame, BadgeCheck, ChevronDown, Lock,
} from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { PrivacyModal, TermsModal, ContactModal, type LegalModal } from './LegalModals';
import { LogoIcon } from './Logo';
import { supabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { track } from '../lib/analytics';

interface LandingPageProps {
  onLoginClick: () => void;
  onSubscribeClick: () => void;
  scrollToPricing?: boolean;
}

const PLATFORMS = [
  'Etsy', 'Shopify', 'Amazon', 'Google Business', 'Wallapop',
  'Vinted', 'eBay', 'Instagram', 'TripAdvisor', 'Booking.com',
  'WooCommerce', 'Doctoralia', 'Habitissimo', 'Treatwell', 'Facebook Marketplace', 'Web propia',
];

const TOOL_META = [
  { icon: <Sparkles size={22} />, badge: 'Core', color: 'from-emerald-500/10 to-teal-500/5', border: 'border-emerald-500/20', iconBg: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' },
  { icon: <MapPinned size={22} />, badge: 'Maps', color: 'from-blue-500/10 to-sky-500/5', border: 'border-blue-500/20', iconBg: 'bg-blue-500/10 border-blue-500/20 text-blue-400' },
  { icon: <Eye size={22} />, badge: 'Twin', color: 'from-cyan-500/10 to-sky-500/5', border: 'border-cyan-500/20', iconBg: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400' },
  { icon: <Target size={22} />, badge: 'Radar', color: 'from-orange-500/10 to-amber-500/5', border: 'border-orange-500/20', iconBg: 'bg-orange-500/10 border-orange-500/20 text-orange-400' },
  { icon: <Globe size={22} />, badge: 'GEO', color: 'from-teal-500/10 to-cyan-500/5', border: 'border-teal-500/20', iconBg: 'bg-teal-500/10 border-teal-500/20 text-teal-400' },
  { icon: <Calendar size={22} />, badge: 'Plan', color: 'from-rose-500/10 to-pink-500/5', border: 'border-rose-500/20', iconBg: 'bg-rose-500/10 border-rose-500/20 text-rose-400' },
] as const;

const TESTIMONIAL_META = [
  { name: 'Marta G.', city: 'Toledo', business: 'Cerámica artesanal', stars: 5, initials: 'MG', color: 'from-emerald-500 to-teal-600' },
  { name: 'Carlos R.', city: 'Valencia', business: 'Reparación de móviles', stars: 5, initials: 'CR', color: 'from-blue-500 to-cyan-600' },
  { name: 'Laura M.', city: 'Sevilla', business: 'Floristería online', stars: 5, initials: 'LM', color: 'from-rose-500 to-pink-600' },
] as const;

function GoogleIconSm() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

type ScanPhase = 'idle' | 'scanning' | 'result';
type WidgetTab = 'maps' | 'seo';

const SEO_PLATFORMS_PRODUCTO = [
  'Etsy', 'Shopify', 'WooCommerce', 'Amazon', 'eBay', 'Wallapop', 'Vinted', 'Facebook Marketplace',
];

const SEO_PLATFORMS_SERVICIO = [
  'Google Business', 'Web propia / Blog SEO', 'Instagram / Facebook',
  'Booking.com', 'Doctoralia', 'TripAdvisor', 'Habitissimo', 'Treatwell',
];

type SeoTipo = 'producto' | 'servicio';

function GateOverlay({
  title,
  subtitle,
  onGoogle,
  onEmail,
  loading,
  context,
}: {
  title: string;
  subtitle: string;
  onGoogle: () => void;
  onEmail: () => void;
  loading: boolean;
  context: string;
}) {
  const { t, lang } = useI18n();
  useEffect(() => { track('gate_shown', { context }); }, [context]);
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-5 rounded-xl"
      style={{ background: 'linear-gradient(to bottom, rgba(12,20,38,0.3), rgba(8,14,28,0.97))' }}
    >
      <div className="text-center mb-1">
        <div className="w-9 h-9 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mx-auto mb-2">
          <Lock size={14} className="text-emerald-400" />
        </div>
        <p className="text-white text-sm font-extrabold mb-1">{title}</p>
        <p className="text-slate-400 text-[11px] leading-relaxed max-w-[220px]">{subtitle}</p>
      </div>

      {/* Google — primary CTA */}
      <button
        onClick={() => { track('gate_register_click', { context, method: 'google' }); onGoogle(); }}
        disabled={loading}
        className="w-full max-w-[240px] flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl font-bold text-sm transition-all duration-200
          bg-white text-slate-900 hover:bg-slate-50 shadow-xl shadow-black/40 hover:-translate-y-0.5 active:translate-y-0
          disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <svg className="animate-spin w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : <GoogleIconSm />}
        {loading ? t('widget_redirecting') : (lang === 'en' ? 'Register free with Google' : 'Registrarme gratis con Google')}
      </button>

      {/* Email — secondary, still visible */}
      <button
        onClick={() => { track('gate_register_click', { context, method: 'email' }); onEmail(); }}
        className="w-full max-w-[240px] flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold
          border border-slate-700/60 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 hover:text-white transition-all duration-200"
      >
        {lang === 'en' ? 'Register with email' : 'Registrarme con email'}
      </button>

      <p className="text-[10px] text-slate-600 text-center mt-0.5">
        {lang === 'en' ? '7 days free · no credit card' : '7 días gratis · sin tarjeta'}
      </p>
    </div>
  );
}

function ScannerWidget({ onLoginClick }: { onLoginClick: () => void }) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<WidgetTab>('maps');
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [googleLoading, setGoogleLoading] = useState(false);

  // Maps tab — pre-filled so the CTA is active from the first second
  const [business, setBusiness] = useState(lang === 'en' ? 'Smith Dental Clinic' : 'Clínica Dental Pérez');
  const [city, setCity] = useState(lang === 'en' ? 'London' : 'Madrid');
  const [score] = useState(() => Math.floor(38 + Math.random() * 22));

  // SEO tab — pre-filled with a realistic example
  const [product, setProduct] = useState(lang === 'en' ? 'teeth whitening' : 'blanqueamiento dental');
  const [seoCity, setSeoCity] = useState(lang === 'en' ? 'London' : 'Madrid');
  const [tipo, setTipo] = useState<SeoTipo>('servicio');
  const [platform, setPlatform] = useState('Google Business');

  const platformOptions = tipo === 'producto' ? SEO_PLATFORMS_PRODUCTO : SEO_PLATFORMS_SERVICIO;

  const handleTipoChange = (tipo_new: SeoTipo) => {
    setTipo(tipo_new);
    setPlatform(tipo_new === 'producto' ? SEO_PLATFORMS_PRODUCTO[0] : SEO_PLATFORMS_SERVICIO[0]);
  };

  const switchTab = (tab_new: WidgetTab) => {
    track('widget_tab_switch', { tab: tab_new });
    setTab(tab_new);
    setPhase('idle');
  };

  // Track whether the user has manually interacted (to avoid double-trigger)
  const userActed = useRef(false);

  const handleScan = (auto = false) => {
    const trigger = tab === 'maps' ? business : product;
    if (!trigger.trim()) return;
    if (!auto) userActed.current = true;
    track('widget_scan_start', { tab, auto, query: trigger, ...(tab === 'seo' ? { tipo, platform } : { city }) });
    setPhase('scanning');
    setTimeout(() => {
      setPhase('result');
      track('widget_scan_result', { tab, auto, ...(tab === 'seo' ? { tipo, platform } : {}) });
    }, 2800);
  };

  // Auto-run demo after 2s so users see the product working without having to click
  useEffect(() => {
    const t = setTimeout(() => {
      if (!userActed.current) handleScan(true);
    }, 2000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleAuth = async () => {
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: 'select_account' } },
    });
    if (error) setGoogleLoading(false);
  };

  // Maps derived content
  const displayName = business.trim() || (lang === 'es' ? 'Tu negocio' : 'Your business');
  const displayCity = city.trim();
  const locPrep = lang === 'es' ? 'en' : 'in';
  const mapsTitle = lang === 'es'
    ? `${displayName}${displayCity ? ` en ${displayCity}` : ''} — Abierto hoy | Atención personalizada`
    : `${displayName}${displayCity ? ` in ${displayCity}` : ''} — Open today | Personalized service`;
  const mapsDesc = lang === 'es'
    ? `¿Buscas ${displayName.toLowerCase()}${displayCity ? ` en ${displayCity}` : ''}? Somos especialistas con más de 10 años de experiencia. Ofrecemos atención personalizada, resultados garantizados y el mejor servicio${displayCity ? ` en ${displayCity}` : ' de la zona'}.`
    : `Looking for ${displayName.toLowerCase()}${displayCity ? ` in ${displayCity}` : ''}? We are specialists with over 10 years of experience. We offer personalized service, guaranteed results and the best service${displayCity ? ` in ${displayCity}` : ' in the area'}.`;
  const nearMeStr = lang === 'es' ? 'cerca de mí' : 'near me';
  const mapsKeywords = lang === 'es'
    ? [
        `${displayName.toLowerCase()} ${displayCity || 'cerca de mí'}`,
        `mejor ${displayName.toLowerCase()} ${displayCity || 'local'}`,
        `${displayName.toLowerCase()} barato${displayCity ? ` ${displayCity}` : ''}`,
        `${displayName.toLowerCase()} opiniones`,
        `${displayName.toLowerCase()} reserva online`,
        `${displayName.toLowerCase()} precio`,
      ]
    : [
        `${displayName.toLowerCase()} ${displayCity || 'near me'}`,
        `best ${displayName.toLowerCase()} ${displayCity || 'local'}`,
        `cheap ${displayName.toLowerCase()}${displayCity ? ` ${displayCity}` : ''}`,
        `${displayName.toLowerCase()} reviews`,
        `${displayName.toLowerCase()} book online`,
        `${displayName.toLowerCase()} price`,
      ];

  // SEO derived content
  const displayProduct = product.trim() || (tipo === 'producto' ? (lang === 'es' ? 'tu producto' : 'your product') : (lang === 'es' ? 'tu servicio' : 'your service'));
  const displaySeoCity = seoCity.trim();
  const isServicio = tipo === 'servicio';
  const seoTitle = lang === 'es'
    ? (isServicio
        ? `${displayProduct}${displaySeoCity ? ` en ${displaySeoCity}` : ''} | ${platform} — Expertos locales · Reserva online`
        : `${displayProduct}${displaySeoCity ? ` en ${displaySeoCity}` : ''} | ${platform} — Mejor precio · Envío rápido`)
    : (isServicio
        ? `${displayProduct}${displaySeoCity ? ` in ${displaySeoCity}` : ''} | ${platform} — Local experts · Book online`
        : `${displayProduct}${displaySeoCity ? ` in ${displaySeoCity}` : ''} | ${platform} — Best price · Fast delivery`);
  const seoDesc = lang === 'es'
    ? (isServicio
        ? `¿Necesitas ${displayProduct.toLowerCase()}${displaySeoCity ? ` en ${displaySeoCity}` : ''}? Somos especialistas con años de experiencia. Atención personalizada, presupuesto sin compromiso y resultados garantizados. Llámanos o reserva online ahora.`
        : `Descubre ${displayProduct.toLowerCase()}${displaySeoCity ? ` en ${displaySeoCity}` : ''} al mejor precio. Calidad garantizada, valoraciones reales y entrega rápida. Encuentra tu ${displayProduct.toLowerCase()} ideal con las mejores especificaciones del mercado.`)
    : (isServicio
        ? `Do you need ${displayProduct.toLowerCase()}${displaySeoCity ? ` in ${displaySeoCity}` : ''}? We are specialists with years of experience. Personalized service, free quote and guaranteed results. Call us or book online now.`
        : `Discover ${displayProduct.toLowerCase()}${displaySeoCity ? ` in ${displaySeoCity}` : ''} at the best price. Guaranteed quality, real ratings and fast delivery. Find your ideal ${displayProduct.toLowerCase()} with the best specifications on the market.`);
  const seoTagsVisible = lang === 'es'
    ? (isServicio
        ? [`${displayProduct.toLowerCase()}${displaySeoCity ? ` ${displaySeoCity}` : ''}`, `${displayProduct.toLowerCase()} profesional`, `${displayProduct.toLowerCase()} precio`]
        : [`${displayProduct.toLowerCase()}${displaySeoCity ? ` ${displaySeoCity}` : ''}`, `comprar ${displayProduct.toLowerCase()} online`, `${displayProduct.toLowerCase()} precio`])
    : (isServicio
        ? [`${displayProduct.toLowerCase()}${displaySeoCity ? ` ${displaySeoCity}` : ''}`, `professional ${displayProduct.toLowerCase()}`, `${displayProduct.toLowerCase()} price`]
        : [`${displayProduct.toLowerCase()}${displaySeoCity ? ` ${displaySeoCity}` : ''}`, `buy ${displayProduct.toLowerCase()} online`, `${displayProduct.toLowerCase()} price`]);
  const seoTagsBlurred = lang === 'es'
    ? (isServicio
        ? [`mejor ${displayProduct.toLowerCase()} ${displaySeoCity || 'cerca de mí'}`, `${displayProduct.toLowerCase()} barato`, `${displayProduct.toLowerCase()} opiniones`, `contratar ${displayProduct.toLowerCase()}`, `${displayProduct.toLowerCase()} urgente`]
        : [`${displayProduct.toLowerCase()} barato`, `mejor ${displayProduct.toLowerCase()}`, `${displayProduct.toLowerCase()} oferta`, `${displayProduct.toLowerCase()} ${platform.toLowerCase()}`, `${displayProduct.toLowerCase()} envío gratis`])
    : (isServicio
        ? [`best ${displayProduct.toLowerCase()} ${displaySeoCity || 'near me'}`, `cheap ${displayProduct.toLowerCase()}`, `${displayProduct.toLowerCase()} reviews`, `hire ${displayProduct.toLowerCase()}`, `urgent ${displayProduct.toLowerCase()}`]
        : [`cheap ${displayProduct.toLowerCase()}`, `best ${displayProduct.toLowerCase()}`, `${displayProduct.toLowerCase()} deals`, `${displayProduct.toLowerCase()} on ${platform}`, `free shipping ${displayProduct.toLowerCase()}`]);

  const INPUT_CLS = 'w-full bg-slate-950/70 border border-slate-700/50 rounded-xl px-4 py-3.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all duration-200 focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20';
  const scanDisabled = tab === 'maps' ? !business.trim() : !product.trim();

  return (
    <div className="max-w-2xl mx-auto mb-3">
      {/* glass-card gives the same 3D panel look as the app interface */}
      <div className="glass-card rounded-2xl">
        <div className="h-[2px] rounded-t-2xl bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />

        <div className="p-6">

          {/* ── Tab switcher (only in idle) ── */}
          {phase === 'idle' && (
            <div className="flex items-center gap-1 bg-slate-950/50 rounded-xl p-1 mb-5 border border-white/5">
              {(['maps', 'seo'] as WidgetTab[]).map((tab_id) => (
                <button
                  key={tab_id}
                  onClick={() => switchTab(tab_id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    tab === tab_id
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {tab_id === 'maps' ? <MapPinned size={12} /> : <Sparkles size={12} />}
                  <span className="hidden sm:inline">
                    {tab_id === 'maps' ? t('widget_tab_maps') : t('widget_tab_seo')}
                  </span>
                  <span className="sm:hidden">{tab_id === 'maps' ? 'Maps' : 'SEO'}</span>
                </button>
              ))}
            </div>
          )}

          {/* ══ MAPS TAB ══ */}
          {tab === 'maps' && (
            <>
              {phase === 'idle' && (
                <>
                  <div className="flex items-center justify-between gap-2.5 mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                        <MapPinned size={14} className="text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-white text-sm font-bold leading-tight">{t('widget_maps_heading')}</p>
                        <p className="text-slate-500 text-[11px]">{t('widget_maps_subheading')}</p>
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/25 text-amber-400">
                      {lang === 'en' ? 'EXAMPLE' : 'EJEMPLO'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                    <input
                      type="text"
                      value={business}
                      onChange={(e) => setBusiness(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                      placeholder={t('widget_maps_ph_biz')}
                      className={INPUT_CLS}
                    />
                    <div className="relative">
                      <MapPin size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                        placeholder={t('widget_maps_ph_city')}
                        className={`${INPUT_CLS} pl-9`}
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => handleScan()}
                    disabled={scanDisabled}
                    className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base transition-all duration-300
                      bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                      text-slate-950 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/45 hover:-translate-y-0.5 active:translate-y-0
                      disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none
                      animate-pulse-once"
                  >
                    <Zap size={16} fill="currentColor" />
                    {t('widget_maps_btn')}
                  </button>
                  <p className="text-center text-[11px] text-slate-500 mt-3">
                    {lang === 'en'
                      ? 'Click to see the result — then use your own data'
                      : 'Haz clic para ver el resultado — luego usa tus datos'}
                  </p>
                </>
              )}

              {phase === 'scanning' && (
                <div className="py-8 flex flex-col items-center gap-6">
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <div className="absolute inset-0 rounded-full"
                      style={{ background: 'conic-gradient(from 0deg, rgba(16,185,129,0.20), transparent 55%)', animation: 'radarSweep 1.8s linear infinite' }} />
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="absolute rounded-full border border-emerald-400/40"
                        style={{ width: `${44 + i * 22}px`, height: `${44 + i * 22}px`, animation: 'radarRing 2s ease-out infinite', animationDelay: `${i * 0.55}s` }} />
                    ))}
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-500/40 z-10">
                      <MapPinned size={17} className="text-slate-950" />
                    </div>
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-white font-bold text-sm">{t('widget_scanning_title')}</p>
                    <p className="text-slate-500 text-xs">
                      {lang === 'es'
                        ? `Escaneando "${displayName}"${displayCity ? ` en ${displayCity}` : ''} · Comparando con competidores`
                        : `Scanning "${displayName}"${displayCity ? ` in ${displayCity}` : ''} · Comparing with competitors`}
                    </p>
                  </div>
                  <div className="w-full max-w-xs bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                      style={{ animation: 'scanProgress 3s ease-out forwards' }} />
                  </div>
                </div>
              )}

              {phase === 'result' && (
                <div className="space-y-3">
                  {/* Score — always visible, creates urgency */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">{t('widget_result_analysis')}</p>
                      <p className="text-white font-bold text-sm leading-tight">{displayName}{displayCity ? ` · ${displayCity}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-extrabold text-amber-400 leading-none">{score}%</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{t('widget_result_optimized')}</div>
                    </div>
                  </div>
                  <div className="w-full bg-slate-800/60 rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${score}%`, background: 'linear-gradient(to right, #f59e0b, #fbbf24)' }} />
                  </div>
                  <p className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span>{lang === 'es' ? `Tu ficha está infraoptimizada. Los competidores capturan ${100 - score}% más llamadas y visitas.` : `Your profile is under-optimized. Competitors capture ${100 - score}% more calls and visits.`}</span>
                  </p>

                  {/* Title + Description + Keywords — all gated */}
                  <div className="relative rounded-xl overflow-hidden">
                    <div className="blur-sm select-none pointer-events-none space-y-3 pb-1">
                      <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3.5">
                        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mb-1.5">{t('widget_seo_title_lbl')}</p>
                        <p className="text-white text-sm font-medium leading-snug">{mapsTitle}</p>
                      </div>
                      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">{t('widget_desc_lbl')}</p>
                        <p className="text-slate-300 text-xs leading-relaxed">{mapsDesc}</p>
                      </div>
                      <div className="p-3.5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2.5">{t('widget_keywords_lbl')}</p>
                        <div className="flex flex-wrap gap-2">
                          {mapsKeywords.map((kw, i) => (
                            <span key={i} className="text-[11px] bg-teal-500/15 border border-teal-500/20 text-teal-300 rounded-full px-3 py-1">{kw}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <GateOverlay
                      title={t('widget_gate_maps_title')}
                      subtitle={t('widget_gate_maps_sub')}
                      onGoogle={handleGoogleAuth}
                      onEmail={onLoginClick}
                      loading={googleLoading}
                      context="maps"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══ SEO TAB ══ */}
          {tab === 'seo' && (
            <>
              {phase === 'idle' && (
                <>
                  <div className="flex items-center justify-between gap-2.5 mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0">
                        <Sparkles size={14} className="text-teal-400" />
                      </div>
                    <div>
                      <p className="text-white text-sm font-bold leading-tight">{t('widget_seo_heading')}</p>
                      <p className="text-slate-500 text-[11px]">{t('widget_seo_subheading')}</p>
                    </div>
                    </div>
                    <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-md bg-amber-500/15 border border-amber-500/25 text-amber-400">
                      {lang === 'en' ? 'EXAMPLE' : 'EJEMPLO'}
                    </span>
                  </div>

                  {/* Tipo de negocio toggle */}
                  <div className="mb-4">
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">{t('widget_tipo_lbl')}</p>
                    <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-800/80 rounded-xl p-1 w-fit">
                      {(['producto', 'servicio'] as SeoTipo[]).map((tipoOpt) => (
                        <button
                          key={tipoOpt}
                          type="button"
                          onClick={() => handleTipoChange(tipoOpt)}
                          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 capitalize ${
                            tipo === tipoOpt
                              ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {tipoOpt === 'producto' ? t('dash_tipo_producto') : t('dash_tipo_servicio')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    <input
                      type="text"
                      value={product}
                      onChange={(e) => setProduct(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                      placeholder={tipo === 'producto' ? t('widget_seo_ph_prod') : t('widget_seo_ph_serv')}
                      className={INPUT_CLS}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="relative">
                        <MapPin size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                        <input
                          type="text"
                          value={seoCity}
                          onChange={(e) => setSeoCity(e.target.value)}
                          placeholder={t('widget_seo_ph_city')}
                          className={`${INPUT_CLS} pl-9`}
                        />
                      </div>
                      <select
                        value={platform}
                        onChange={(e) => setPlatform(e.target.value)}
                        className="w-full bg-slate-950/70 border border-slate-700/50 rounded-xl px-4 py-3.5 text-sm text-slate-100 outline-none transition-all duration-200 focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/20 appearance-none cursor-pointer"
                      >
                        {platformOptions.map((p) => (
                          <option key={p} value={p} className="bg-slate-900">{p}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => handleScan()}
                    disabled={scanDisabled}
                    className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base transition-all duration-300
                      bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400
                      text-slate-950 shadow-xl shadow-teal-500/30 hover:shadow-teal-500/45 hover:-translate-y-0.5 active:translate-y-0
                      disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none
                      animate-pulse-once"
                  >
                    <Sparkles size={16} />
                    {t('widget_seo_btn')}
                  </button>
                  <p className="text-center text-[11px] text-slate-500 mt-3">
                    {lang === 'en'
                      ? 'Click to see the result — then use your own data'
                      : 'Haz clic para ver el resultado — luego usa tus datos'}
                  </p>
                </>
              )}

              {phase === 'scanning' && (
                <div className="py-8 flex flex-col items-center gap-6">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="absolute rounded-full border border-teal-400/30"
                        style={{ width: `${28 + i * 18}px`, height: `${28 + i * 18}px`, animation: 'radarRing 2.2s ease-out infinite', animationDelay: `${i * 0.45}s` }} />
                    ))}
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-teal-500/40 z-10">
                      <Sparkles size={20} className="text-slate-950" />
                    </div>
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-white font-bold text-sm">{t('widget_seo_scanning')}</p>
                    <p className="text-slate-500 text-xs">{lang === 'es' ? `Optimizando "${displayProduct}" (${tipo}) para ${platform}${displaySeoCity ? ` en ${displaySeoCity}` : ''}` : `Optimizing "${displayProduct}" (${tipo}) for ${platform}${displaySeoCity ? ` in ${displaySeoCity}` : ''}`}</p>
                  </div>
                  <div className="w-full max-w-xs bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full"
                      style={{ animation: 'scanProgress 3s ease-out forwards' }} />
                  </div>
                </div>
              )}

              {phase === 'result' && (
                <div className="space-y-3">
                  {/* Header — always visible */}
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0">
                      <Sparkles size={12} className="text-teal-400" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{t('widget_seo_result_lbl')}</p>
                      <p className="text-white font-bold text-sm leading-tight">{displayProduct}{displaySeoCity ? ` · ${displaySeoCity}` : ''} · {platform}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-teal-400/80 flex items-center gap-1.5">
                    <span>✅</span>
                    <span>{lang === 'es' ? 'Análisis completado. Desbloquea el contenido completo para aplicarlo.' : 'Analysis complete. Unlock the full content to apply it.'}</span>
                  </p>

                  {/* All SEO content gated */}
                  <div className="relative rounded-xl overflow-hidden">
                    <div className="blur-sm select-none pointer-events-none space-y-3 pb-1">
                      <div className="rounded-xl bg-teal-500/5 border border-teal-500/15 p-3.5">
                        <p className="text-[10px] text-teal-400 font-bold uppercase tracking-wider mb-1.5">{t('widget_seo_opt_title')}</p>
                        <p className="text-white text-sm font-medium leading-snug">{seoTitle}</p>
                      </div>
                      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">{t('widget_desc_lbl')}</p>
                        <p className="text-slate-300 text-xs leading-relaxed">{seoDesc}</p>
                      </div>
                      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">
                          {lang === 'es' ? `Etiquetas · Alt text · Plan de contenido` : `Tags · Alt text · Content plan`}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {[...seoTagsVisible, ...seoTagsBlurred].map((tag, i) => (
                            <span key={i} className="text-[11px] bg-teal-500/15 border border-teal-500/20 text-teal-300 rounded-full px-3 py-1">{tag}</span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <GateOverlay
                      title={t('widget_gate_seo_title')}
                      subtitle={t('widget_gate_seo_sub')}
                      onGoogle={handleGoogleAuth}
                      onEmail={onLoginClick}
                      loading={googleLoading}
                      context="seo"
                    />
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  );
}

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/70 transition-colors overflow-hidden"
    >
      <div className="flex items-center justify-between gap-4 px-5 py-4">
        <span className="text-sm font-semibold text-white">{q}</span>
        <div className={`shrink-0 w-5 h-5 rounded-full border border-slate-700 flex items-center justify-center transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          <ChevronDown size={11} className="text-slate-400" />
        </div>
      </div>
      {open && (
        <div className="px-5 pb-4 border-t border-slate-800/60">
          <p className="text-slate-400 text-sm leading-relaxed pt-3">{a}</p>
        </div>
      )}
    </button>
  );
}

function ProductMockup() {
  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 to-teal-500/5 rounded-3xl blur-2xl scale-95" />
      <div className="relative rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/50 overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800 bg-slate-950">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-amber-500/60" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
          </div>
          <div className="flex-1 mx-3 h-5 rounded-md bg-slate-800 flex items-center px-3">
            <span className="text-slate-600 text-[10px]">localseohub.io</span>
          </div>
        </div>
        <div className="p-5 grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <div className="h-2 w-20 rounded bg-slate-700/60" />
              <div className="h-9 rounded-lg border border-slate-700/60 bg-slate-800/80 flex items-center px-3 gap-2">
                <div className="w-3 h-3 rounded-sm bg-emerald-500/40" />
                <div className="h-1.5 w-28 rounded bg-slate-600/60" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-14 rounded bg-slate-700/60" />
              <div className="h-9 rounded-lg border border-slate-700/60 bg-slate-800/80 flex items-center px-3 gap-2">
                <MapPin size={12} className="text-slate-600" />
                <div className="h-1.5 w-16 rounded bg-slate-600/60" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="h-2 w-24 rounded bg-slate-700/60" />
              <div className="h-9 rounded-lg border border-slate-700/60 bg-slate-800/80 flex items-center px-3 gap-2">
                <div className="h-1.5 w-20 rounded bg-slate-600/60" />
              </div>
            </div>
            <button className="w-full h-9 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 flex items-center justify-center gap-2 mt-1">
              <Sparkles size={13} className="text-slate-950" />
              <span className="text-slate-950 text-xs font-bold">Generar SEO</span>
            </button>
          </div>
          <div className="space-y-2.5">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <div className="h-1.5 w-10 rounded bg-emerald-500/40" />
              </div>
              <div className="h-1.5 w-full rounded bg-slate-600/50" />
              <div className="h-1.5 w-4/5 rounded bg-slate-600/40" />
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
                <div className="h-1.5 w-14 rounded bg-slate-600/50" />
              </div>
              <div className="h-1.5 w-full rounded bg-slate-600/40" />
              <div className="h-1.5 w-full rounded bg-slate-600/40" />
              <div className="h-1.5 w-3/4 rounded bg-slate-600/30" />
            </div>
            <div className="rounded-lg border border-slate-700/50 bg-slate-800/50 p-3 space-y-2">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                <div className="h-1.5 w-10 rounded bg-slate-600/50" />
              </div>
              <div className="flex flex-wrap gap-1">
                {[40, 28, 36, 22, 32, 24].map((w, i) => (
                  <div key={i} className="h-5 rounded-full bg-emerald-500/15 border border-emerald-500/20" style={{ width: `${w}px` }} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-500 font-medium">Generado en 3.2 seg</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="h-1.5 w-16 rounded bg-emerald-500/25" />
            <div className="h-5 w-14 rounded-md bg-emerald-500/20 border border-emerald-500/20 flex items-center justify-center">
              <span className="text-[9px] text-emerald-400 font-semibold">Copiar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({ onLoginClick }: LandingPageProps) {
  const [legalModal, setLegalModal] = useState<LegalModal>(null);
  const { t, lang } = useI18n();

  useEffect(() => { track('page_view', { page: 'landing' }); }, []);

  const PAIN_POINTS = [t('landing_pain_1'), t('landing_pain_2'), t('landing_pain_3'), t('landing_pain_4'), t('landing_pain_5')];

  const TOOLS = TOOL_META.map((m, i) => ({
    ...m,
    title: t(`landing_tool_${i + 1}_title` as Parameters<typeof t>[0]),
    desc: t(`landing_tool_${i + 1}_desc` as Parameters<typeof t>[0]),
  }));

  const TESTIMONIALS = TESTIMONIAL_META.map((m, i) => ({
    ...m,
    text: t(`landing_t${i + 1}_text` as Parameters<typeof t>[0]),
    metric: t(`landing_t${i + 1}_metric` as Parameters<typeof t>[0]),
  }));

  const FAQS = [
    { q: t('landing_faq1_q'), a: t('landing_faq1_a') },
    { q: t('landing_faq2_q'), a: t('landing_faq2_a') },
    { q: t('landing_faq3_q'), a: t('landing_faq3_a') },
    { q: t('landing_faq4_q'), a: t('landing_faq4_a') },
    { q: t('landing_faq5_q'), a: t('landing_faq5_a') },
  ];

  const COMPARISON_ROWS = [
    { label: t('landing_comp_row1_label'), bad: t('landing_comp_row1_bad'), good: t('landing_comp_row1_good') },
    { label: t('landing_comp_row2_label'), bad: t('landing_comp_row2_bad'), good: t('landing_comp_row2_good') },
    { label: t('landing_comp_row3_label'), bad: t('landing_comp_row3_bad'), good: t('landing_comp_row3_good') },
    { label: t('landing_comp_row4_label'), bad: t('landing_comp_row4_bad'), good: t('landing_comp_row4_good') },
    { label: t('landing_comp_row5_label'), bad: t('landing_comp_row5_bad'), good: t('landing_comp_row5_good') },
    { label: t('landing_comp_row6_label'), bad: t('landing_comp_row6_bad'), good: t('landing_comp_row6_good') },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── HERO ──────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-emerald-500/6 rounded-full blur-3xl" />
          <div className="absolute top-32 left-1/4 w-72 h-72 bg-teal-500/4 rounded-full blur-3xl" />
          <div className="absolute top-20 right-1/4 w-56 h-56 bg-emerald-600/3 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto px-6 pt-16 pb-10 relative">
          {/* Urgency badge */}
          <div className="flex justify-center mb-7">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-400">
              <Flame size={12} className="text-orange-400" />
              <span>{t('landing_urgency')}</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold text-white leading-[1.1] mb-5 tracking-tight text-center">
            {t('landing_hero_title1')}{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              {t('landing_hero_title2')}
            </span>
          </h1>

          <p className="text-center text-slate-400 text-base sm:text-lg max-w-2xl mx-auto mb-7 leading-relaxed">
            {t('landing_hero_desc2')}
          </p>

          {/* Sub bullets */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6 mb-9 text-sm text-slate-300">
            {[t('landing_bullet_1'), t('landing_bullet_2'), t('landing_bullet_3')].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <BadgeCheck size={14} className="text-emerald-400 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          {/* Scanner widget */}
          <div className="relative">
            <div className="flex justify-center mb-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                <ChevronDown size={14} className="animate-bounce" />
                <span>{lang === 'en' ? 'Try it now — no account needed' : 'Pruébalo ahora — sin registro'}</span>
                <ChevronDown size={14} className="animate-bounce" />
              </div>
            </div>
            <ScannerWidget onLoginClick={onLoginClick} />
          </div>

          <p className="text-center text-xs text-slate-600 mb-8">
            {t('landing_have_account')}{' '}
            <button onClick={onLoginClick} className="text-emerald-500 hover:text-emerald-400 transition-colors font-medium">
              {t('landing_sign_in_link')}
            </button>
          </p>

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-slate-500 mb-14">
            <div className="flex items-center gap-1.5">
              <Shield size={11} className="text-emerald-500" />
              <span>{t('landing_trust_1')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-teal-500" />
              <span>{t('landing_trust_2')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users size={11} className="text-emerald-400" />
              <span>{t('landing_trust_3')}</span>
            </div>
          </div>

          <ProductMockup />
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────────────── */}
      <section className="border-y border-slate-800/60 py-8 mt-10">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            {[
              { value: '16+', label: t('landing_stat_1'), icon: <Globe size={16} className="text-teal-400" /> },
              { value: '< 60 seg', label: t('landing_stat_2'), icon: <Clock size={16} className="text-blue-400" /> },
              { value: '6', label: t('landing_stat_3'), icon: <Sparkles size={16} className="text-emerald-400" /> },
              { value: '4.2h', label: t('landing_stat_4'), icon: <BarChart3 size={16} className="text-amber-400" /> },
            ].map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-1.5 mb-0.5">{s.icon}</div>
                <span className="text-2xl font-bold text-white">{s.value}</span>
                <span className="text-xs text-slate-500">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLATFORM STRIP ─────────────────────────────────────────── */}
      <section className="py-8 overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs text-slate-600 uppercase tracking-widest font-semibold mb-5">{t('landing_compat')}</p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2.5">
            {PLATFORMS.map((p) => (
              <span key={p} className="text-slate-600 text-sm font-medium hover:text-slate-400 transition-colors cursor-default">{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── PAIN POINTS ────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="rounded-2xl border border-red-500/10 bg-red-500/3 p-8">
          <div className="text-center mb-7">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-red-400 bg-red-500/10 border border-red-500/15 rounded-full px-3 py-1 mb-3">
              <X size={11} /> {t('landing_pain_badge')}
            </div>
            <h2 className="text-2xl font-bold text-white">{t('landing_pain_title')}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {PAIN_POINTS.map((p) => (
              <div key={p} className="flex items-start gap-3 bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/60">
                <div className="w-5 h-5 rounded-full bg-red-500/15 border border-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <X size={9} className="text-red-400" />
                </div>
                <p className="text-slate-400 text-xs leading-relaxed">{p}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-7">
            <p className="text-slate-400 text-sm mb-4">{t('landing_pain_resolved')}</p>
            <button
              onClick={onLoginClick}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm
                bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                text-slate-950 shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5 transition-all duration-300"
            >
              {t('landing_start_free')} <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* ── 6 TOOLS ────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/20 rounded-full px-3 py-1 mb-3">
            <Award size={11} /> {t('landing_tools_badge')}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">{t('landing_tools_title2')}</h2>
          <p className="text-slate-400 max-w-xl mx-auto text-sm">{t('landing_tools_sub2')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {TOOLS.map((tool) => (
            <div
              key={tool.title}
              className={`group rounded-2xl bg-gradient-to-br ${tool.color} border ${tool.border} p-6 hover:scale-[1.02] transition-all duration-300 flex flex-col`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`w-11 h-11 rounded-xl border flex items-center justify-center shrink-0 ${tool.iconBg}`}>
                  {tool.icon}
                </div>
                <span className={`text-[10px] font-bold rounded-full px-2.5 py-1 border ${tool.iconBg} opacity-80`}>
                  {tool.badge}
                </span>
              </div>
              <h3 className="font-semibold text-white mb-2 text-sm leading-tight">{tool.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed flex-1">{tool.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-emerald-500 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                <Check size={11} /> {t('landing_included')}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">{t('landing_howto_title')}</h2>
          <p className="text-slate-400 text-sm">{t('landing_howto_sub')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative">
          <div className="hidden sm:block absolute top-8 left-[calc(16.66%+1rem)] right-[calc(16.66%+1rem)] h-px bg-gradient-to-r from-emerald-500/20 via-teal-500/30 to-emerald-500/20" />
          {[
            {
              num: '01', title: t('landing_howto_s1_title'),
              desc: t('landing_howto_s1_desc'),
              icon: <MapPin size={20} />,
            },
            {
              num: '02', title: t('landing_howto_s2_title'),
              desc: t('landing_howto_s2_desc'),
              icon: <Sparkles size={20} />,
              highlight: true,
            },
            {
              num: '03', title: t('landing_howto_s3_title'),
              desc: t('landing_howto_s3_desc'),
              icon: <TrendingUp size={20} />,
            },
          ].map((step) => (
            <div key={step.num} className="relative flex flex-col items-center text-center p-6">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 z-10 transition-transform duration-300 hover:scale-110
                ${step.highlight
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-slate-950 shadow-xl shadow-emerald-500/30'
                  : 'bg-slate-900 border-2 border-slate-700 text-emerald-400'}`}
              >
                {step.highlight ? step.icon : <span className="text-xl font-bold text-emerald-400">{step.num}</span>}
              </div>
              <h3 className="font-bold text-white mb-2 text-sm">{step.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── COMPARISON TABLE ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 mb-3">
            <BarChart3 size={11} /> {t('landing_comp_badge')}
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">{t('landing_comp_title')}</h2>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">{t('landing_comp_sub')}</p>
        </div>

        <div className="rounded-2xl border border-slate-800/80 overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-3 text-xs font-bold uppercase tracking-wider">
            <div className="px-5 py-3.5 text-slate-500 bg-slate-900/80 border-b border-slate-800" />
            <div className="px-5 py-3.5 text-slate-500 bg-slate-900/80 border-b border-slate-800 border-l border-slate-800 text-center">{t('landing_comp_col_bad')}</div>
            <div className="px-5 py-3.5 text-emerald-400 bg-emerald-500/8 border-b border-emerald-500/20 border-l border-emerald-500/20 text-center">LocalSEOHub</div>
          </div>
          {COMPARISON_ROWS.map((row, i) => (
            <div key={row.label} className={`grid grid-cols-3 text-sm ${i < COMPARISON_ROWS.length - 1 ? 'border-b border-slate-800/60' : ''}`}>
              <div className="px-5 py-4 text-slate-300 font-medium bg-slate-900/40">{row.label}</div>
              <div className="px-5 py-4 text-slate-500 bg-slate-900/20 border-l border-slate-800 flex items-center gap-2">
                <X size={13} className="text-red-500/70 shrink-0" />
                {row.bad}
              </div>
              <div className="px-5 py-4 text-emerald-400 bg-emerald-500/5 border-l border-emerald-500/15 flex items-center gap-2 font-medium">
                <Check size={13} className="text-emerald-500 shrink-0" />
                {row.good}
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-8">
          <button
            onClick={onLoginClick}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-sm transition-all duration-300
              bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
              text-slate-950 shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5"
          >
            <Zap size={15} fill="currentColor" />
            {t('landing_comp_try')}
            <ArrowRight size={15} />
          </button>
        </div>
      </section>

      {/* ── TESTIMONIALS ───────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-0.5 mb-2">
            {[...Array(5)].map((_, i) => <Star key={i} size={16} className="text-amber-400 fill-amber-400" />)}
          </div>
          <h2 className="text-2xl font-bold text-white mb-1">{t('landing_testimonials_title')}</h2>
          <p className="text-slate-500 text-sm">{t('landing_testimonials_sub')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {TESTIMONIALS.map((item) => (
            <div key={item.name} className="rounded-2xl bg-slate-900/70 border border-slate-800/80 p-5 flex flex-col gap-3 hover:border-emerald-500/20 transition-colors">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center shrink-0`}>
                  <span className="text-white text-xs font-bold">{item.initials}</span>
                </div>
                <div>
                  <p className="text-white text-xs font-bold">{item.name}</p>
                  <p className="text-slate-500 text-[11px]">{item.business} · {item.city}</p>
                </div>
                <div className="ml-auto flex items-center gap-0.5">
                  {[...Array(item.stars)].map((_, i) => (
                    <Star key={i} size={10} className="text-amber-400 fill-amber-400" />
                  ))}
                </div>
              </div>
              <p className="text-slate-300 text-sm leading-relaxed flex-1">"{item.text}"</p>
              <div className="pt-2 border-t border-slate-800">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-1.5 inline-flex">
                  <p className="text-emerald-400 text-[10px] font-bold">{item.metric}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-800/60 border border-slate-700/60 rounded-full px-3 py-1 mb-3">
            <HelpCircle size={11} /> {t('landing_faq_badge')}
          </div>
          <h2 className="text-2xl font-bold text-white">{t('landing_faq_title')}</h2>
        </div>
        <div className="space-y-2">
          {FAQS.map((faq) => (
            <FAQItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/12 via-teal-500/8 to-slate-900" />
          <div className="absolute inset-0 border border-emerald-500/20 rounded-2xl" />
          <div className="relative p-10 sm:p-14 text-center">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-400 mb-5">
              <Flame size={11} className="text-orange-400" /> {t('landing_final_badge')}
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4 leading-tight">
              {t('landing_final_title1')}<br className="hidden sm:block" />
              <span className="text-emerald-400"> {t('landing_final_title2')}</span>
            </h2>
            <p className="text-slate-400 mb-6 max-w-lg mx-auto text-sm leading-relaxed">
              {t('landing_final_desc')}
            </p>

            {/* Price anchor */}
            <div className="inline-flex items-center gap-3 bg-slate-900/60 border border-slate-700/60 rounded-2xl px-6 py-3 mb-7">
              <div className="text-left">
                <p className="text-slate-500 text-[11px] font-medium uppercase tracking-wide">{t('landing_final_plan')}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">{t('landing_final_price')}</span>
                  <span className="text-slate-400 text-sm">{t('landing_final_per_mo')}</span>
                </div>
              </div>
              <div className="w-px h-10 bg-slate-700" />
              <div className="text-left">
                <p className="text-emerald-400 text-xs font-bold">{t('landing_final_free')}</p>
                <p className="text-slate-500 text-[11px]">{t('landing_final_no_card')}</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={onLoginClick}
                className="inline-flex items-center justify-center gap-2.5 px-10 py-4 rounded-xl font-bold text-base transition-all duration-300
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
              >
                <Zap size={17} fill="currentColor" />
                {t('landing_final_cta')}
                <ArrowRight size={16} />
              </button>
            </div>
            <p className="text-xs text-slate-600 mt-4 flex items-center justify-center gap-1.5">
              <Shield size={10} /> {t('landing_final_trust')}
            </p>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/50 py-7">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <LogoIcon size={22} />
            <span className="text-xs text-slate-600 font-medium">LocalSEO<span className="text-emerald-600">Hub</span></span>
          </div>
          <p className="text-xs text-slate-700">{t('landing_footer_cr')}</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setLegalModal('privacy')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              {t('landing_footer_priv')}
            </button>
            <button onClick={() => setLegalModal('terms')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              {t('landing_footer_terms2')}
            </button>
            <button onClick={() => setLegalModal('contact')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              {t('footer_contact')}
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
