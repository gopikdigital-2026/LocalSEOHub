import {
  MapPin, Zap, TrendingUp, Shield, Star, Check, ArrowRight, Sparkles,
  Eye, Globe, Target, Calendar, MapPinned, ChevronRight, X, HelpCircle,
  Users, Award, BarChart3, Flame, BadgeCheck, ChevronDown, Lock, AlertCircle, ExternalLink, Mail,
  Clock,
} from 'lucide-react';
import type { FormEvent } from 'react';
import React, { useState, useEffect, useRef } from 'react';
import { PrivacyModal, TermsModal, ContactModal, type LegalModal } from './LegalModals';
import { LogoIcon } from './Logo';
import { supabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { track, storeGoogleIntent } from '../lib/analytics';
import { isInAppBrowser } from '../lib/socialWebView';

interface LandingPageProps {
  onLoginClick: (email?: string) => void;
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
  { name: 'Marta G.', city: 'Toledo', business: 'Peluquería Éclat', stars: 5, initials: 'MG', color: 'from-emerald-500 to-teal-600', photo: 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop' },
  { name: 'Carlos R.', city: 'Valencia', business: 'Clínica Dental Ruiz', stars: 5, initials: 'CR', color: 'from-blue-500 to-cyan-600', photo: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop' },
  { name: 'Laura M.', city: 'Sevilla', business: 'Restaurante La Plaza', stars: 5, initials: 'LM', color: 'from-rose-500 to-pink-600', photo: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop' },
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

function InlineGate({
  onGoogle,
  onLoginClick,
  googleLoading,
  context,
  googleError,
  lang,
  score,
}: {
  onGoogle: () => void;
  onLoginClick: (email?: string) => void;
  googleLoading: boolean;
  context: string;
  googleError?: string;
  lang: string;
  score?: number;
}) {
  const [email, setEmail] = React.useState('');
  const [submitted, setSubmitted] = React.useState(false);
  const ctaRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!ctaRef.current) return;
    const el = ctaRef.current;
    let fired = false;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !fired) {
        fired = true;
        track('gate_cta_visible', { context });
        observer.disconnect();
      }
    }, { threshold: 0.3 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [context]);

  const handleEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    track('gate_register_click', { context, method: 'email_inline' });
    setSubmitted(true);
    onLoginClick(email.trim());
  };

  const inApp = isInAppBrowser();
  const isLowScore = score !== undefined && score < 60;

  if (submitted) {
    return (
      <div className="mt-3 rounded-2xl p-5 text-center space-y-2"
        style={{ border: '1px solid rgba(16,185,129,0.28)', background: 'linear-gradient(160deg, rgba(16,185,129,0.09) 0%, rgba(8,14,26,0.99) 55%)' }}
      >
        <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mx-auto">
          <Check size={18} className="text-emerald-400" />
        </div>
        <p className="text-white font-bold text-sm">
          {lang === 'en' ? 'Opening your report...' : 'Abriendo tu informe...'}
        </p>
      </div>
    );
  }

  // Blurred teaser rows — shape of the data they'll see, names hidden
  const teaserRows = context === 'maps'
    ? [
        { rank: '#1', stars: '4.8', reviews: lang === 'en' ? '127 reviews' : '127 reseñas', gap: lang === 'en' ? '+89 vs you' : '+89 vs ti' },
        { rank: '#2', stars: '4.6', reviews: lang === 'en' ? '89 reviews' : '89 reseñas',  gap: lang === 'en' ? '+51 vs you' : '+51 vs ti' },
        { rank: '#3', stars: '4.3', reviews: lang === 'en' ? '54 reviews' : '54 reseñas',  gap: lang === 'en' ? '+16 vs you' : '+16 vs ti' },
      ]
    : [
        { rank: '#1', stars: '94', reviews: lang === 'en' ? '16 platforms' : '16 plataformas', gap: lang === 'en' ? '+31 keywords' : '+31 keywords' },
        { rank: '#2', stars: '87', reviews: lang === 'en' ? '12 platforms' : '12 plataformas', gap: lang === 'en' ? '+18 keywords' : '+18 keywords' },
        { rank: '#3', stars: '79', reviews: lang === 'en' ? '9 platforms' : '9 plataformas',  gap: lang === 'en' ? '+7 keywords' : '+7 keywords' },
      ];

  const scoreColor = isLowScore ? { ring: 'rgba(251,146,60,0.5)', bg: 'rgba(251,146,60,0.08)', text: 'text-orange-300', border: 'rgba(251,146,60,0.30)' }
                                : { ring: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.07)',  text: 'text-emerald-300', border: 'rgba(16,185,129,0.28)' };

  return (
    <div
      className="mt-3 rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${scoreColor.border}`, background: `linear-gradient(170deg, ${scoreColor.bg} 0%, rgba(8,14,26,0.99) 50%)` }}
    >
      {/* Gradient top accent */}
      <div className={`h-[2px] bg-gradient-to-r ${isLowScore ? 'from-orange-500 via-amber-400 to-yellow-500' : 'from-emerald-500 via-teal-400 to-cyan-500'}`} />

      <div className="p-4 space-y-3">

        {/* ── Score hero + headline ──────────────────────────────── */}
        <div className="flex items-center gap-3">
          {score !== undefined && (
            <div className="relative shrink-0">
              <svg width="52" height="52" viewBox="0 0 52 52" className="rotate-[-90deg]">
                <circle cx="26" cy="26" r="22" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="4" />
                <circle cx="26" cy="26" r="22" fill="none" stroke={isLowScore ? '#f97316' : '#10b981'} strokeWidth="4"
                  strokeDasharray={`${2 * Math.PI * 22 * score / 100} ${2 * Math.PI * 22}`}
                  strokeLinecap="round" />
              </svg>
              <span className={`absolute inset-0 flex items-center justify-center text-[13px] font-black ${scoreColor.text}`}>{score}</span>
            </div>
          )}
          <div>
            <p className="text-white font-extrabold text-[15px] leading-tight">
              {lang === 'en'
                ? (isLowScore ? 'Competitors are taking your customers' : 'Your full report is generated')
                : (isLowScore ? 'Tus competidores te quitan clientes' : 'Tu informe completo está generado')}
            </p>
            <p className={`text-[11px] mt-0.5 ${scoreColor.text}`}>
              {lang === 'en'
                ? (isLowScore ? `${score}/100 — see who and by how much` : `${score}/100 — see the full breakdown`)
                : (isLowScore ? `${score}/100 — ve quién y por cuánto` : `${score}/100 — ve el análisis completo`)}
            </p>
          </div>
        </div>

        {/* ── Blurred competitor preview ─────────────────────────── */}
        <div className="rounded-xl overflow-hidden border border-slate-700/40" style={{ background: 'rgba(15,23,42,0.6)' }}>
          <div className="px-3 py-1.5 border-b border-slate-700/40 flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500/70" />
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500/70" />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/70" />
            <span className="ml-1 text-[9px] text-slate-500 font-mono">
              {context === 'maps'
                ? (lang === 'en' ? 'google_maps_ranking.json' : 'ranking_google_maps.json')
                : (lang === 'en' ? 'seo_competitor_gap.json' : 'brecha_seo_competidores.json')}
            </span>
          </div>
          {teaserRows.map(({ rank, stars, reviews, gap }, i) => (
            <div key={i} className={`flex items-center gap-2 px-3 py-2 ${i < teaserRows.length - 1 ? 'border-b border-slate-700/30' : ''}`}>
              <span className={`text-[9px] font-black w-5 shrink-0 ${i === 0 ? 'text-amber-400' : 'text-slate-500'}`}>{rank}</span>
              {/* Blurred business name */}
              <span
                className="flex-1 text-[11px] text-slate-300 font-medium select-none truncate"
                style={{ filter: 'blur(4.5px)', userSelect: 'none' }}
              >
                {i === 0 ? 'Restaurante Casa Pepe' : i === 1 ? 'Bar La Terraza' : 'Cafeteria El Rincon'}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <Star size={9} className="text-amber-400 fill-amber-400" />
                <span className="text-[9px] text-slate-300 font-semibold">{stars}</span>
              </div>
              <span className="text-[9px] text-slate-500 shrink-0 hidden xs:block">{reviews}</span>
              <span className={`text-[9px] font-bold shrink-0 ${isLowScore ? 'text-red-400' : 'text-orange-400'}`}>{gap}</span>
            </div>
          ))}
          <div className="px-3 py-2 flex items-center justify-center gap-1.5 border-t border-slate-700/30" style={{ background: 'rgba(0,0,0,0.3)' }}>
            <Lock size={9} className="text-slate-500" />
            <span className="text-[9px] text-slate-500">
              {lang === 'en' ? 'Unlock to reveal competitor names + full analysis' : 'Desbloquea para ver los nombres y el análisis completo'}
            </span>
          </div>
        </div>

        {/* ── CTAs ───────────────────────────────────────────────── */}
        <div ref={ctaRef} className="space-y-2">
          {/* PRIMARY: Google (1 click) */}
          {!inApp ? (
            <button
              type="button"
              onClick={() => { track('gate_register_click', { context, method: 'google_inline' }); storeGoogleIntent(context); onGoogle(); }}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-[13px] transition-all duration-150
                bg-emerald-500 hover:bg-emerald-400 active:scale-[0.985] text-slate-950
                shadow-[0_4px_20px_rgba(16,185,129,0.35)]
                disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none"
            >
              {googleLoading ? (
                <svg className="animate-spin w-3.5 h-3.5 text-slate-800" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : <GoogleIconSm />}
              <span>
                {googleLoading
                  ? (lang === 'en' ? 'Redirecting...' : 'Redirigiendo...')
                  : (lang === 'en' ? 'Continue with Google (1 click)' : 'Continuar con Google (1 clic)')}
              </span>
            </button>
          ) : (
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => { track('gate_register_click', { context, method: 'email_inapp' }); onLoginClick(); }}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-[13px] transition-all duration-150
                bg-emerald-500 hover:bg-emerald-400 active:scale-[0.985] text-slate-950
                shadow-[0_4px_20px_rgba(16,185,129,0.35)] no-underline"
            >
              <ExternalLink size={13} />
              {lang === 'en' ? 'Open in browser to continue' : 'Abrir en navegador para continuar'}
            </a>
          )}

          {/* Divider */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[9px] text-slate-600 px-1">
              {lang === 'en' ? 'or sign up with email' : 'o regístrate con email'}
            </span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* SECONDARY: email form */}
          <form onSubmit={handleEmailSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Mail size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={lang === 'en' ? 'your@email.com' : 'tu@email.com'}
                className="w-full bg-slate-900/80 border border-slate-700/60 rounded-xl pl-9 pr-3 py-2.5 text-[13px] text-slate-100
                  placeholder-slate-600 outline-none transition-all duration-150
                  focus:border-slate-500/60 focus:ring-1 focus:ring-slate-500/15"
              />
            </div>
            <button
              type="submit"
              disabled={!email.trim()}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl font-semibold text-[12px] transition-all duration-150
                bg-slate-700/80 hover:bg-slate-600/80 border border-slate-600/60 text-slate-200 active:scale-[0.985]
                disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              <ArrowRight size={13} />
            </button>
          </form>

          {googleError && (
            <p className="text-[10px] text-red-400 text-center">{googleError}</p>
          )}

          {/* Trust + sign in */}
          <div className="flex items-center justify-center gap-3 pt-0.5">
            <span className="text-[9px] text-slate-600 flex items-center gap-0.5"><Shield size={8} />{lang === 'en' ? 'Free 7 days' : '7 días gratis'}</span>
            <span className="text-slate-700 text-[9px]">·</span>
            <span className="text-[9px] text-slate-600 flex items-center gap-0.5"><Shield size={8} />{lang === 'en' ? 'No card' : 'Sin tarjeta'}</span>
            <span className="text-slate-700 text-[9px]">·</span>
            <span className="text-[9px] text-slate-600">
              {lang === 'en' ? 'Already have an account?' : '¿Ya tienes cuenta?'}{' '}
              <button
                type="button"
                onClick={() => { track('gate_register_click', { context, method: 'login_link' }); onLoginClick(); }}
                className="text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {lang === 'en' ? 'Sign in' : 'Inicia sesión'}
              </button>
            </span>
          </div>
        </div>

      </div>
    </div>
  );
}

function OwnScanBanner({ tab, lang, onScan }: {
  tab: WidgetTab;
  lang: string;
  onScan: (name: string, city: string, type: WidgetTab) => void;
}) {
  const [scanType, setScanType] = useState<WidgetTab>(tab);
  const [name, setName] = useState('');

  useEffect(() => { track('own_scan_prompt_shown', { tab }); }, [tab]);

  const handleSubmit = () => {
    if (!name.trim()) return;
    track('own_scan_submitted', { tab: scanType });
    onScan(name.trim(), '', scanType);
  };

  // Blurred locked items shown to create urgency
  const lockedPreviews = lang === 'en' ? [
    { Icon: Globe, label: 'Advanced GEO labels', blurText: '9 structured GEO tags for your category and search radius' },
    { Icon: Target, label: 'Keyword optimisation', blurText: 'Top 8 keywords with volume and competition score for your niche' },
  ] : [
    { Icon: Globe, label: 'Etiquetas GEO avanzadas', blurText: '9 etiquetas GEO estructuradas para tu categoría y radio de búsqueda' },
    { Icon: Target, label: 'Optimización de keywords', blurText: '8 keywords principales con volumen y dificultad para tu nicho' },
  ];

  return (
    <div
      className="mt-3 rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(20,184,166,0.28)', background: 'linear-gradient(145deg, rgba(20,184,166,0.08) 0%, rgba(10,18,32,0.99) 55%)' }}
    >
      <div className="h-[2px] bg-gradient-to-r from-teal-500 via-emerald-400 to-cyan-500" />
      <div className="p-5">
        {/* Urgency hook */}
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/6 p-3.5 mb-4">
          <div className="flex items-center gap-2 mb-1.5">
            <div className="w-5 h-5 rounded-md bg-amber-500/20 border border-amber-500/25 flex items-center justify-center shrink-0">
              <AlertCircle size={11} className="text-amber-400" />
            </div>
            <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
              {lang === 'en' ? 'Competitors in your area are gaining ground' : 'Competidores en tu zona están ganando terreno'}
            </span>
          </div>
          <p className="text-amber-300/85 text-xs leading-relaxed pl-7">
            {lang === 'en'
              ? '3 local businesses similar to yours improved their ranking this week. Enter your name to see how you compare.'
              : '3 negocios de tu zona han mejorado su posicionamiento esta semana. Pon el tuyo para ver cómo estás frente a ellos.'}
          </p>
        </div>

        {/* Locked previews */}
        <div className="space-y-1.5 mb-4">
          {lockedPreviews.map(({ Icon, label, blurText }, i) => (
            <div key={i} className="rounded-xl border border-slate-700/35 bg-slate-800/25 p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-5 h-5 rounded-md bg-slate-700/50 flex items-center justify-center shrink-0">
                  <Icon size={10} className="text-slate-500" />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide flex-1">{label}</span>
                <Lock size={8} className="text-slate-600 shrink-0" />
              </div>
              <p className="text-[11px] text-slate-400 ml-7 blur-sm select-none pointer-events-none leading-relaxed">{blurText}</p>
            </div>
          ))}
        </div>

        {/* Heading */}
        <p className="text-white font-extrabold text-sm text-center mb-3">
          {lang === 'en' ? 'Analyse YOUR business — it\'s free:' : 'Analiza TU negocio — es gratis:'}
        </p>

        {/* Type toggle */}
        <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-700/50 rounded-xl p-1 mb-3">
          <button
            onClick={() => { setScanType('maps'); setName(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 ${
              scanType === 'maps'
                ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <MapPinned size={11} />
            {lang === 'en' ? 'Local business' : 'Negocio local'}
          </button>
          <button
            onClick={() => { setScanType('seo'); setName(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-200 ${
              scanType === 'seo'
                ? 'bg-teal-500/20 border border-teal-500/30 text-teal-300'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Sparkles size={11} />
            {lang === 'en' ? 'Product / Service' : 'Producto / Servicio'}
          </button>
        </div>

        {/* Form — single field, no city, no autoFocus */}
        <div className="space-y-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={scanType === 'maps'
              ? (lang === 'en' ? 'Your business name...' : 'Nombre de tu negocio...')
              : (lang === 'en' ? 'Your product or service...' : 'Tu producto o servicio...')}
            className="w-full bg-slate-800/90 border border-slate-600/80 rounded-xl px-4 py-3 text-sm text-slate-100
              placeholder-slate-500 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20 transition-all"
          />
          <button
            onClick={handleSubmit}
            disabled={!name.trim()}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm
              bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
              text-slate-950 shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0"
          >
            <Zap size={14} fill="currentColor" />
            {lang === 'en'
              ? (scanType === 'maps' ? 'Analyse my business →' : 'Analyse my product/service →')
              : (scanType === 'maps' ? 'Analizar mi negocio →' : 'Analizar mi producto/servicio →')}
          </button>
        </div>

        <p className="text-[10px] text-slate-600 text-center mt-3 flex items-center justify-center gap-1">
          <Shield size={9} />
          {lang === 'en' ? 'No account needed to start' : 'Sin cuenta para empezar'}
        </p>
      </div>
    </div>
  );
}

function ScannerWidget({ onLoginClick }: { onLoginClick: (email?: string) => void }) {
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<WidgetTab>('maps');
  const [phase, setPhase] = useState<ScanPhase>('idle');
  const [gateVisible, setGateVisible] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState('');

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
    setGateVisible(false);
    if (gateTimeoutRef.current) clearTimeout(gateTimeoutRef.current);
  };

  const userActed = useRef(false);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gateRef = useRef<HTMLDivElement | null>(null);
  const gateContextRef = useRef<string>('maps');

  const handleScan = (
    auto = false,
    overrideTab?: WidgetTab,
    overrideName?: string,
    overrideCity?: string
  ) => {
    const effectiveTab = overrideTab ?? tab;
    const trigger = effectiveTab === 'maps'
      ? (overrideName ?? business)
      : (overrideName ?? product);
    if (!trigger.trim()) return;
    if (!auto) userActed.current = true;
    // Cancel any in-flight scan result timeout before starting a new one.
    if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
    if (gateTimeoutRef.current) clearTimeout(gateTimeoutRef.current);
    setGateVisible(false);
    if (overrideTab) setTab(overrideTab);
    if (overrideName) {
      if (effectiveTab === 'maps') setBusiness(overrideName);
      else setProduct(overrideName);
    }
    if (overrideCity) {
      if (effectiveTab === 'maps') setCity(overrideCity);
      else setSeoCity(overrideCity);
    }
    track('widget_scan_start', {
      tab: effectiveTab,
      auto,
      query: trigger,
      ...(effectiveTab === 'seo' ? { tipo, platform } : { city: overrideCity ?? city }),
    });
    setPhase('scanning');
    scanTimeoutRef.current = setTimeout(() => {
      setPhase('result');
      track('widget_scan_result', { tab: effectiveTab, auto, ...(effectiveTab === 'seo' ? { tipo, platform } : {}) });
      // Gate shown after 8s delay — lets user absorb the result before asking to register
      gateTimeoutRef.current = setTimeout(() => {
        gateContextRef.current = effectiveTab;
        setGateVisible(true);
      }, 8000);
    }, 1800);
  };

  // Auto-run demo after 2s so users see the product working without having to click
  useEffect(() => {
    const t = setTimeout(() => {
      if (!userActed.current) handleScan(true);
    }, 2000);
    return () => {
      clearTimeout(t);
      // Clean up any pending scan result timeout on unmount.
      if (scanTimeoutRef.current) clearTimeout(scanTimeoutRef.current);
      if (gateTimeoutRef.current) clearTimeout(gateTimeoutRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire gate_shown only when the gate actually enters the viewport, then scroll it into view
  useEffect(() => {
    if (!gateVisible || !gateRef.current) return;
    const el = gateRef.current;
    let fired = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !fired) {
          fired = true;
          track('gate_shown', { context: gateContextRef.current, trigger: 'delayed_inline' });
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    // Scroll gate into view so users on long-scroll mobile actually see it
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return () => observer.disconnect();
  }, [gateVisible]);

  const handleGoogleAuth = async () => {
    if (isInAppBrowser()) {
      onLoginClick();
      return;
    }
    setGoogleLoading(true);
    setGoogleError('');
    storeGoogleIntent(gateContextRef.current);

    // Reset loading if the user navigates back without completing OAuth
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(fallbackTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    const onVisible = () => { if (!document.hidden) { cleanup(); setGoogleLoading(false); } };
    document.addEventListener('visibilitychange', onVisible);
    const fallbackTimer = setTimeout(() => { cleanup(); setGoogleLoading(false); }, 15000);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/`, queryParams: { prompt: 'select_account' } },
    });
    if (error) {
      cleanup();
      track('auth_error', { method: 'google', error: error.message });
      setGoogleLoading(false);
      setGoogleError(lang === 'en' ? 'Google not available right now. Try registering with email.' : 'Google no está disponible ahora. Regístrate con email.');
    }
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
    <>
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
                  {/* Score — always visible */}
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">{t('widget_result_analysis')}</p>
                      <p className="text-white font-bold text-sm leading-tight">{displayName}{displayCity ? ` · ${displayCity}` : ''}</p>
                    </div>
                    <div className="text-right shrink-0 min-w-[3.5rem]">
                      <div className="text-2xl font-extrabold text-amber-400 leading-tight tabular-nums">{score}%</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{t('widget_result_optimized')}</div>
                    </div>
                  </div>

                  {/* Try with own data */}
                  <button
                    onClick={() => { setPhase('idle'); setBusiness(''); setCity(''); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold
                      bg-emerald-500/15 border border-emerald-500/40 text-emerald-300
                      hover:bg-emerald-500/25 hover:border-emerald-400/60 hover:text-emerald-200
                      transition-all duration-200"
                  >
                    <ChevronRight size={14} className="rotate-180" />
                    {lang === 'en' ? 'Analyse my own business' : 'Analizar mi propio negocio'}
                  </button>
                  <div className="w-full bg-slate-800/60 rounded-full h-2 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${score}%`, background: 'linear-gradient(to right, #f59e0b, #fbbf24)' }} />
                  </div>
                  <p className="text-[11px] text-amber-400/80 flex items-center gap-1.5">
                    <AlertCircle size={11} className="text-amber-400 shrink-0" />
                    <span>{lang === 'es' ? `Tu ficha está infraoptimizada. Los competidores capturan ${100 - score}% más llamadas y visitas.` : `Your profile is under-optimized. Competitors capture ${100 - score}% more calls and visits.`}</span>
                  </p>

                  {/* Optimized title — always visible (proves value before gate) */}
                  <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider">{t('widget_seo_title_lbl')}</p>
                      <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide">
                        {lang === 'en' ? 'Free' : 'Gratis'}
                      </span>
                    </div>
                    <p className="text-white text-sm font-medium leading-snug">{mapsTitle}</p>
                  </div>

                  {/* Description + Keywords — always visible */}
                  <div className="space-y-3">
                    <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">{t('widget_desc_lbl')}</p>
                      <p className="text-slate-300 text-xs leading-relaxed">{mapsDesc}</p>
                    </div>
                    <div className="p-3.5 bg-slate-800/40 border border-slate-700/50 rounded-xl">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2.5">{t('widget_keywords_lbl')}</p>
                      <div className="flex flex-wrap gap-2">
                        {mapsKeywords.slice(0, 3).map((kw, i) => (
                          <span key={i} className="text-[11px] rounded-full px-3 py-1 bg-teal-500/15 border border-teal-500/20 text-teal-300">{kw}</span>
                        ))}
                        <span className="flex items-center gap-1.5 text-[11px] rounded-full px-3 py-1 bg-slate-700/60 border border-slate-600/50 text-slate-400">
                          <Lock size={9} />
                          {lang === 'en' ? `+${mapsKeywords.length - 3} more` : `+${mapsKeywords.length - 3} más`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Critical failure card */}
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/6 p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-md bg-amber-500/20 border border-amber-500/25 flex items-center justify-center shrink-0">
                        <AlertCircle size={11} className="text-amber-400" />
                      </div>
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                        {lang === 'en' ? 'Critical Failure Detected' : 'Fallo Crítico Detectado'}
                      </span>
                    </div>
                    <p className="text-amber-300/85 text-xs leading-relaxed pl-7">
                      {lang === 'en'
                        ? `Semantic schedule inconsistency: "${displayName}" has no special holiday hours. 68% of searches in your category happen outside standard business hours — you're invisible for those queries.`
                        : `Inconsistencia semántica de horarios: "${displayName}" no tiene horarios especiales para festivos. El 68% de las búsquedas en tu categoría ocurren fuera del horario estándar — eres invisible en esas consultas.`}
                    </p>
                  </div>

                  {/* Inline gate — shown after 9s delay to let user absorb results */}
                  {gateVisible && (
                  <div ref={gateRef}>
                  <InlineGate
                    onGoogle={handleGoogleAuth}
                    onLoginClick={onLoginClick}
                    googleLoading={googleLoading}
                    context="maps"
                    googleError={googleError}
                    lang={lang}
                    score={score}
                  />
                  </div>
                  )}
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

                  {/* Try with own data */}
                  <button
                    onClick={() => { setPhase('idle'); setShowGate(false); setGateDismissed(false); setProduct(''); setSeoCity(''); }}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold
                      bg-emerald-500/15 border border-emerald-500/40 text-emerald-300
                      hover:bg-emerald-500/25 hover:border-emerald-400/60 hover:text-emerald-200
                      transition-all duration-200"
                  >
                    <ChevronRight size={14} className="rotate-180" />
                    {lang === 'en' ? 'Analyse my own product/service' : 'Analizar mi propio producto/servicio'}
                  </button>
                  <p className="text-[11px] text-teal-400/80 flex items-center gap-1.5">
                    <BadgeCheck size={11} className="text-teal-400 shrink-0" />
                    <span>{lang === 'es' ? 'Análisis completado. Desbloquea el contenido completo para aplicarlo.' : 'Analysis complete. Unlock the full content to apply it.'}</span>
                  </p>

                  {/* SEO title — always visible (proves value before gate) */}
                  <div className="rounded-xl bg-teal-500/5 border border-teal-500/15 p-3.5">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] text-teal-400 font-bold uppercase tracking-wider">{t('widget_seo_opt_title')}</p>
                      <span className="text-[9px] bg-teal-500/15 border border-teal-500/25 text-teal-400 rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide">
                        {lang === 'en' ? 'Free' : 'Gratis'}
                      </span>
                    </div>
                    <p className="text-white text-sm font-medium leading-snug">{seoTitle}</p>
                  </div>

                  {/* Description + Tags — always visible */}
                  <div className="space-y-3">
                    <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">{t('widget_desc_lbl')}</p>
                      <p className="text-slate-300 text-xs leading-relaxed">{seoDesc}</p>
                    </div>
                    <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">
                        {lang === 'es' ? `Etiquetas · Alt text · Plan de contenido` : `Tags · Alt text · Content plan`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {seoTagsVisible.map((tag, i) => (
                          <span key={i} className="text-[11px] bg-teal-500/15 border border-teal-500/20 text-teal-300 rounded-full px-3 py-1">{tag}</span>
                        ))}
                        <span className="flex items-center gap-1.5 text-[11px] rounded-full px-3 py-1 bg-slate-700/60 border border-slate-600/50 text-slate-400">
                          <Lock size={9} />
                          {lang === 'en' ? `+${seoTagsBlurred.length} more` : `+${seoTagsBlurred.length} más`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Critical failure card */}
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/6 p-3.5">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-5 h-5 rounded-md bg-amber-500/20 border border-amber-500/25 flex items-center justify-center shrink-0">
                        <AlertCircle size={11} className="text-amber-400" />
                      </div>
                      <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                        {lang === 'en' ? 'Critical Failure Detected' : 'Fallo Crítico Detectado'}
                      </span>
                    </div>
                    <p className="text-amber-300/85 text-xs leading-relaxed pl-7">
                      {lang === 'en'
                        ? `No GEO semantic layer detected for "${displayProduct}". Your listing lacks structured schema that allows AI engines (ChatGPT, Gemini) to recommend you. Competitors with schema markup appear 3× more in AI-generated summaries.`
                        : `Capa semántica GEO ausente en "${displayProduct}". Tu ficha carece del schema estructurado que permite a los motores de IA (ChatGPT, Gemini) recomendarte. Los competidores con schema aparecen 3× más en resúmenes generados por IA.`}
                    </p>
                  </div>

                  {/* Inline gate — shown after 9s delay to let user absorb results */}
                  {gateVisible && (
                  <div ref={gateRef}>
                  <InlineGate
                    onGoogle={handleGoogleAuth}
                    onLoginClick={onLoginClick}
                    googleLoading={googleLoading}
                    context="seo"
                    googleError={googleError}
                    lang={lang}
                  />
                  </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
    </>
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
  const [isRadar, setIsRadar] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startInterval = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => setIsRadar(r => !r), 5000);
  };

  useEffect(() => {
    startInterval();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchTo = (radar: boolean) => {
    setIsRadar(radar);
    startInterval();
  };

  const isResult = true;

  const heatValues = [90,65,80,45,70,85,35,75,60,90,55,80,40,70,85,25,60,75,50,85,70,45,80,65,90];

  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/10 to-teal-500/5 rounded-3xl blur-2xl scale-95" />
      <div className="relative rounded-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/50 overflow-hidden">
        {/* Browser chrome */}
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

        {/* Tab bar */}
        <div className="flex border-b border-slate-800 bg-slate-950/40">
          {(['AI Digital Twin', 'Radar de Competencia'] as const).map((tab, i) => (
            <button
              key={tab}
              onClick={() => switchTo(i === 1)}
              className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all duration-300 ${
                (i === 0 && !isRadar) || (i === 1 && isRadar)
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-slate-600 hover:text-slate-400'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 min-h-[210px] relative overflow-hidden">

          {/* ── Twin: result ── */}
          {!isRadar && (
            <div className="grid grid-cols-2 gap-4 animate-fadeIn">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">Visibilidad Local</span>
                </div>
                <div className="grid grid-cols-5 gap-1 mb-3">
                  {heatValues.map((v, i) => (
                    <div key={i} className="h-5 rounded-sm transition-all duration-300" style={{
                      backgroundColor: v > 75 ? 'rgba(16,185,129,0.55)' : v > 50 ? 'rgba(251,191,36,0.45)' : 'rgba(239,68,68,0.35)',
                      animationDelay: `${i * 25}ms`,
                    }} />
                  ))}
                </div>
                <div className="flex items-center gap-2 text-[9px] text-slate-500">
                  <div className="w-2 h-2 rounded-sm bg-emerald-500/55" /> Dominante
                  <div className="w-2 h-2 rounded-sm bg-amber-400/45" /> Medio
                  <div className="w-2 h-2 rounded-sm bg-red-500/35" /> Invisible
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
                  <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wide">AI Sentiment</span>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
                  <p className="text-emerald-400 text-[10px] font-bold">Entidad destacada</p>
                  <p className="text-slate-400 text-[9px] mt-0.5">ChatGPT te menciona activamente</p>
                </div>
                {[{ name: 'ChatGPT', score: 87 }, { name: 'Gemini', score: 74 }, { name: 'Perplexity', score: 61 }].map(ai => (
                  <div key={ai.name} className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-500 w-16 shrink-0">{ai.name}</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-700"
                        style={{ width: `${ai.score}%` }} />
                    </div>
                    <span className="text-[9px] font-bold text-emerald-400">{ai.score}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Radar: result ── */}
          {isRadar && (
            <div className="animate-fadeIn">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wide">Posición vs. Competidores</span>
                <span className="text-[9px] bg-orange-500/10 border border-orange-500/20 text-orange-400 rounded-full px-2 py-0.5 font-semibold">Madrid</span>
              </div>
              <div className="space-y-2 mb-3">
                {[
                  { name: 'Competidor A', score: 82, bar: 'bg-red-500/65', you: false },
                  { name: 'Competidor B', score: 71, bar: 'bg-amber-500/55', you: false },
                  { name: 'Tu negocio',   score: 47, bar: 'bg-emerald-500', you: true  },
                  { name: 'Competidor C', score: 38, bar: 'bg-slate-600',   you: false },
                ].map(c => (
                  <div key={c.name} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${c.you ? 'bg-emerald-500/10 border border-emerald-500/20' : ''}`}>
                    <span className={`text-[10px] font-semibold w-24 shrink-0 ${c.you ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {c.name}{c.you ? ' ← Tú' : ''}
                    </span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${c.bar} transition-all duration-700`}
                        style={{ width: isResult ? `${c.score}%` : '0%' }} />
                    </div>
                    <span className={`text-[9px] font-bold w-6 text-right ${c.you ? 'text-emerald-400' : 'text-slate-500'}`}>{c.score}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-start gap-2 bg-amber-500/8 border border-amber-500/20 rounded-lg p-2.5">
                <AlertCircle size={11} className="text-amber-400 mt-0.5 shrink-0" />
                <p className="text-amber-400/90 text-[10px] font-medium leading-snug">2 competidores te superan · Análisis de brechas y keywords disponible</p>
              </div>
            </div>
          )}

        </div>

        {/* Status bar */}
        <div className="flex items-center gap-3 px-5 py-2.5 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-emerald-500 font-medium">
              {isRadar ? '3 competidores analizados · Brechas detectadas' : 'Gemelo digital activo · 2 zonas críticas'}
            </span>
          </div>
          <div className="ml-auto h-5 px-2 rounded-md bg-emerald-500/20 border border-emerald-500/20 flex items-center">
            <span className="text-[9px] text-emerald-400 font-semibold">Copiar informe</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// FEATURE SHOWROOM
// ─────────────────────────────────────────────────────────────

type ShowroomTab = 'radar' | 'twin' | 'keywords';

function FeatureShowroom({ onLoginClick }: { onLoginClick: () => void }) {
  const [active, setActive] = useState<ShowroomTab>('radar');

  const tabs: { id: ShowroomTab; label: string; icon: React.ReactNode; accent: string }[] = [
    { id: 'radar', label: 'Radar de Competencia GEO', icon: <Target size={14} />, accent: 'orange' },
    { id: 'twin',  label: 'AI Digital Twin',          icon: <Eye size={14} />,    accent: 'emerald' },
    { id: 'keywords', label: 'Optimizador de Keywords', icon: <Sparkles size={14} />, accent: 'teal' },
  ];

  const accentMap: Record<string, { tab: string; active: string; badge: string; bar: string }> = {
    orange:  { tab: 'hover:text-orange-300', active: 'text-orange-400 border-orange-400 bg-orange-500/10', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/25', bar: 'from-orange-500 to-amber-400' },
    emerald: { tab: 'hover:text-emerald-300', active: 'text-emerald-400 border-emerald-400 bg-emerald-500/10', badge: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25', bar: 'from-emerald-500 to-teal-400' },
    teal:    { tab: 'hover:text-teal-300', active: 'text-teal-400 border-teal-400 bg-teal-500/10', badge: 'bg-teal-500/15 text-teal-400 border-teal-500/25', bar: 'from-teal-500 to-cyan-400' },
  };

  return (
    <section className="max-w-5xl mx-auto px-6 py-14">
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 mb-3">
          <Zap size={11} fill="currentColor" /> Herramientas en acción
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Todo lo que necesitas para dominar tu zona local</h2>
        <p className="text-slate-400 text-sm max-w-xl mx-auto">Explora las tres herramientas principales de LocalSEOHub. Sin demos pregrabadas — así es como funciona de verdad.</p>
      </div>

      {/* Tab selector */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 mb-8 justify-center">
        {tabs.map((tab) => {
          const c = accentMap[tab.accent];
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200
                ${isActive ? c.active + ' border-current' : 'text-slate-500 border-slate-800 bg-slate-900/40 ' + c.tab}
              `}
            >
              {tab.icon}
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Panel */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 overflow-hidden shadow-2xl shadow-black/40">

        {/* ── RADAR PANEL ── */}
        {active === 'radar' && (
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0">
                <Target size={17} className="text-orange-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Radar de Competencia GEO</h3>
                <p className="text-slate-500 text-xs">Posición real vs. competidores en tu código postal</p>
              </div>
              <span className="ml-auto text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/25 rounded-full px-3 py-1">Madrid · 28004</span>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {/* Bar chart */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">Puntuación de visibilidad local</p>
                {[
                  { name: 'Peluquería Centro Madrid', score: 89, highlight: false, color: 'from-red-500 to-orange-400' },
                  { name: 'Estilo Urbano BCN',         score: 74, highlight: false, color: 'from-amber-500 to-yellow-400' },
                  { name: 'TU NEGOCIO',                score: 51, highlight: true,  color: 'from-emerald-500 to-teal-400' },
                  { name: 'Beauty & Co.',              score: 38, highlight: false, color: 'from-slate-600 to-slate-500' },
                  { name: 'Salón Miriam',              score: 22, highlight: false, color: 'from-slate-700 to-slate-600' },
                ].map((c) => (
                  <div key={c.name} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${c.highlight ? 'bg-emerald-500/10 border border-emerald-500/20' : ''}`}>
                    <span className={`text-[10px] font-semibold w-32 shrink-0 truncate ${c.highlight ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {c.highlight ? '→ ' : ''}{c.name}
                    </span>
                    <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${c.color} transition-all duration-700`} style={{ width: `${c.score}%` }} />
                    </div>
                    <span className={`text-[10px] font-bold w-6 text-right ${c.highlight ? 'text-emerald-400' : 'text-slate-600'}`}>{c.score}</span>
                  </div>
                ))}
              </div>
              {/* Insight cards */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">Brechas detectadas · 3 oportunidades</p>
                {[
                  { icon: <MapPin size={13} />, label: 'Cobertura geográfica', detail: 'Solo apareces en 2 de 8 zonas de búsqueda cercanas', color: 'text-orange-400', bg: 'bg-orange-500/8 border-orange-500/20' },
                  { icon: <Star size={13} />,   label: 'Reseñas recientes',     detail: 'Llevas 47 días sin recibir una reseña nueva', color: 'text-amber-400', bg: 'bg-amber-500/8 border-amber-500/20' },
                  { icon: <Globe size={13} />,  label: 'Palabras clave GEO',    detail: '4 keywords de alta intención sin posición en Maps', color: 'text-red-400', bg: 'bg-red-500/8 border-red-500/20' },
                ].map((item) => (
                  <div key={item.label} className={`rounded-xl border p-3.5 ${item.bg}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={item.color}>{item.icon}</span>
                      <span className={`text-[11px] font-bold ${item.color}`}>{item.label}</span>
                    </div>
                    <p className="text-slate-400 text-[10px] leading-snug pl-5">{item.detail}</p>
                  </div>
                ))}
                <button onClick={onLoginClick} className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-orange-500/80 to-amber-500/80 hover:from-orange-500 hover:to-amber-500 text-white text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2">
                  <Zap size={12} fill="currentColor" /> Ver mi Radar completo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── TWIN PANEL ── */}
        {active === 'twin' && (
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                <Eye size={17} className="text-emerald-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">AI Digital Twin</h3>
                <p className="text-slate-500 text-xs">Mapa de calor de visibilidad por zonas + presencia en IAs</p>
              </div>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-500 font-medium">Gemelo activo</span>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {/* Heat map */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Mapa de calor · Visibilidad local (5×5 km)</p>
                <div className="grid grid-cols-5 gap-1 mb-3">
                  {[90,65,80,45,70,85,35,75,60,90,55,80,40,70,85,25,60,75,50,85,70,45,80,65,90].map((v, i) => (
                    <div key={i} title={`Zona ${i+1}: ${v}%`} className="h-8 rounded-sm cursor-default transition-transform hover:scale-110" style={{
                      backgroundColor: v > 75 ? 'rgba(16,185,129,0.55)' : v > 50 ? 'rgba(251,191,36,0.45)' : 'rgba(239,68,68,0.35)',
                    }} />
                  ))}
                </div>
                <div className="flex items-center gap-3 text-[9px] text-slate-500">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500/55" />Dominante</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-amber-400/45" />Medio</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-500/35" />Invisible</span>
                </div>
              </div>
              {/* AI presence */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Presencia en IAs generativas</p>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 mb-4">
                  <p className="text-emerald-400 text-xs font-bold">Entidad destacada en ChatGPT</p>
                  <p className="text-slate-400 text-[10px] mt-0.5">Tu negocio aparece activamente en resultados de búsqueda conversacional</p>
                </div>
                {[{ name: 'ChatGPT', score: 87, color: 'from-emerald-500 to-teal-500' }, { name: 'Google Gemini', score: 74, color: 'from-blue-500 to-cyan-500' }, { name: 'Perplexity', score: 61, color: 'from-purple-500 to-violet-500' }, { name: 'Bing Copilot', score: 43, color: 'from-slate-500 to-slate-400' }].map((ai) => (
                  <div key={ai.name} className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 w-20 shrink-0">{ai.name}</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${ai.color}`} style={{ width: `${ai.score}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 w-8 text-right">{ai.score}%</span>
                  </div>
                ))}
                <button onClick={onLoginClick} className="w-full mt-3 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500/80 to-teal-500/80 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2">
                  <Zap size={12} fill="currentColor" /> Activar mi Gemelo Digital
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── KEYWORDS PANEL ── */}
        {active === 'keywords' && (
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/25 flex items-center justify-center shrink-0">
                <Sparkles size={17} className="text-teal-400" />
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">Optimizador de Palabras Clave</h3>
                <p className="text-slate-500 text-xs">Keywords de alta intención ordenadas por oportunidad real</p>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              {/* Keyword table */}
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Top keywords · Tu sector · Madrid</p>
                <div className="space-y-2">
                  {[
                    { kw: 'peluquería cerca de mí',       vol: '8.1K', pos: null,  opp: 'Alta', oppColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                    { kw: 'corte de pelo Madrid centro',  vol: '3.4K', pos: 12,    opp: 'Media', oppColor: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
                    { kw: 'mechas balayage Madrid',       vol: '2.9K', pos: null,  opp: 'Alta', oppColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                    { kw: 'peluquería económica Madrid',  vol: '1.8K', pos: 7,     opp: 'Baja', oppColor: 'text-slate-500 bg-slate-800/60 border-slate-700' },
                    { kw: 'tratamiento keratina Madrid',  vol: '1.2K', pos: null,  opp: 'Alta', oppColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
                  ].map((row) => (
                    <div key={row.kw} className="flex items-center gap-2 bg-slate-800/40 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-[11px] font-medium truncate">{row.kw}</p>
                        <p className="text-slate-600 text-[9px]">{row.vol}/mes · Pos. actual: {row.pos ?? 'sin posición'}</p>
                      </div>
                      <span className={`text-[9px] font-bold border rounded-full px-2 py-0.5 shrink-0 ${row.oppColor}`}>{row.opp}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Action recommendations */}
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Plan de acción generado por IA</p>
                {[
                  { step: '1', title: 'Añadir keyword a descripción GBP', impact: '+23% clics estimados', color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/20' },
                  { step: '2', title: 'Crear post GBP con keyword local', impact: '+15% visibilidad Maps', color: 'text-teal-400', bg: 'bg-teal-500/8 border-teal-500/20' },
                  { step: '3', title: 'Solicitar reseñas con término clave', impact: '+31% posición orgánica', color: 'text-blue-400', bg: 'bg-blue-500/8 border-blue-500/20' },
                ].map((action) => (
                  <div key={action.step} className={`rounded-xl border p-3.5 ${action.bg}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black shrink-0 ${action.color} bg-current/10`} style={{ background: 'rgba(255,255,255,0.07)' }}>
                        <span className={action.color}>{action.step}</span>
                      </div>
                      <span className={`text-[11px] font-bold ${action.color}`}>{action.title}</span>
                    </div>
                    <p className="text-slate-400 text-[10px] pl-7">{action.impact}</p>
                  </div>
                ))}
                <button onClick={onLoginClick} className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-teal-500/80 to-cyan-500/80 hover:from-teal-500 hover:to-cyan-500 text-white text-xs font-bold transition-all duration-200 flex items-center justify-center gap-2">
                  <Zap size={12} fill="currentColor" /> Ver mis keywords reales
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// CASE STUDY PLAYGROUND
// ─────────────────────────────────────────────────────────────

type PlaygroundTab = 'overview' | 'radar' | 'keywords' | 'plan';

function CaseStudyPlayground({ onLoginClick }: { onLoginClick: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<PlaygroundTab>('overview');

  const playgroundTabs: { id: PlaygroundTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',  label: 'Resumen',       icon: <BarChart3 size={12} /> },
    { id: 'radar',     label: 'Competidores',  icon: <Target size={12} /> },
    { id: 'keywords',  label: 'Keywords',      icon: <Sparkles size={12} /> },
    { id: 'plan',      label: 'Plan IA',        icon: <TrendingUp size={12} /> },
  ];

  return (
    <section className="max-w-5xl mx-auto px-6 py-14">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 mb-3">
          <Eye size={11} /> Ejemplo de análisis
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Mira cómo funciona la IA en un negocio real</h2>
        <p className="text-slate-400 text-sm max-w-xl mx-auto">Así se ve el informe que LocalSEOHub genera para <strong className="text-slate-200">Peluquería Éclat</strong> en Madrid — un ejemplo representativo del análisis real que recibirías para tu negocio.</p>
      </div>

      {/* Load trigger */}
      {!loaded ? (
        <div className="flex flex-col items-center gap-5">
          <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-8 max-w-lg w-full text-center">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center mx-auto mb-4">
              <Eye size={24} className="text-amber-400" />
            </div>
            <h3 className="text-white font-bold text-base mb-2">Ver ejemplo de análisis · Peluquería Éclat</h3>
            <p className="text-slate-500 text-xs mb-5 leading-relaxed">Explora una muestra del informe que LocalSEOHub genera: Radar GEO, Digital Twin, keywords de alta intención y plan de acción con IA.</p>
            <button
              onClick={() => setLoaded(true)}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-sm
                bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400
                text-slate-950 shadow-lg shadow-amber-500/20 hover:-translate-y-0.5 transition-all duration-300"
            >
              <Zap size={15} fill="currentColor" /> Cargar informe de ejemplo
            </button>
          </div>
          {/* Preview teaser grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-2xl opacity-60 pointer-events-none select-none blur-[1px]">
            {[
              { label: 'Puntuación GEO', value: '51/100', sub: '3 competidores por delante', color: 'text-amber-400' },
              { label: 'Keywords sin posición', value: '4', sub: 'alta intención · sin ranquear', color: 'text-red-400' },
              { label: 'Presencia ChatGPT', value: '87%', sub: 'entidad destacada', color: 'text-emerald-400' },
              { label: 'Acciones IA', value: '9', sub: 'priorizadas por impacto', color: 'text-teal-400' },
            ].map((m) => (
              <div key={m.label} className="rounded-xl bg-slate-900/60 border border-slate-800 p-3 text-center">
                <p className={`text-xl font-black ${m.color}`}>{m.value}</p>
                <p className="text-white text-[10px] font-bold mt-0.5">{m.label}</p>
                <p className="text-slate-600 text-[9px] mt-0.5">{m.sub}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-2xl shadow-black/40 overflow-hidden">
          {/* Report header */}
          <div className="bg-slate-950/80 border-b border-slate-800 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
                <span className="text-white text-sm font-black">PE</span>
              </div>
              <div>
                <p className="text-white font-bold text-sm">Peluquería Éclat</p>
                <p className="text-slate-500 text-xs">Calle Fuencarral 18, Madrid · Peluquería y estética</p>
              </div>
            </div>
            <div className="sm:ml-auto flex items-center gap-2">
              <span className="text-slate-500 text-[10px]">Ejemplo de análisis generado con IA</span>
            </div>
          </div>

          {/* Tab navigation */}
          <div className="flex border-b border-slate-800 bg-slate-950/40 overflow-x-auto">
            {playgroundTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-5 sm:p-6">

            {activeTab === 'overview' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Puntuación GEO', value: '51', max: '/100', color: 'text-amber-400', bg: 'bg-amber-500/8 border-amber-500/20' },
                    { label: 'Keywords sin pos.', value: '4', max: ' oportunidades', color: 'text-red-400', bg: 'bg-red-500/8 border-red-500/20' },
                    { label: 'Presencia ChatGPT', value: '87', max: '%', color: 'text-emerald-400', bg: 'bg-emerald-500/8 border-emerald-500/20' },
                    { label: 'Acciones IA', value: '9', max: ' priorizadas', color: 'text-teal-400', bg: 'bg-teal-500/8 border-teal-500/20' },
                  ].map((m) => (
                    <div key={m.label} className={`rounded-xl border p-4 text-center ${m.bg}`}>
                      <p className={`text-2xl font-black ${m.color}`}>{m.value}<span className="text-xs font-normal text-slate-500">{m.max}</span></p>
                      <p className="text-slate-400 text-[10px] mt-1">{m.label}</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/6 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle size={13} className="text-amber-400 shrink-0" />
                    <span className="text-amber-400 text-xs font-bold">3 fallos críticos detectados</span>
                  </div>
                  <ul className="space-y-1.5 pl-5">
                    {[
                      'Sin horarios especiales configurados para festivos — inconsistencia semántica detectada',
                      'Descripción de ficha no contiene ninguna keyword de alta intención',
                      'Ratio de respuesta a reseñas: 23% (recomendado &gt;80%)',
                    ].map((issue) => (
                      <li key={issue} className="text-amber-300/80 text-[11px] flex items-start gap-2">
                        <span className="text-amber-500 shrink-0 mt-0.5">·</span>
                        <span dangerouslySetInnerHTML={{ __html: issue }} />
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'radar' && (
              <div className="space-y-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Posición vs. competidores · Fuencarral · Madrid</p>
                {[
                  { name: 'Peluquería Centro Madrid', score: 89, color: 'from-red-500 to-orange-400' },
                  { name: 'Estilo Urbano BCN',         score: 74, color: 'from-amber-500 to-yellow-400' },
                  { name: 'Peluquería Éclat ← Tú',    score: 51, color: 'from-emerald-500 to-teal-400', you: true },
                  { name: 'Beauty & Co.',              score: 38, color: 'from-slate-600 to-slate-500' },
                  { name: 'Salón Miriam',              score: 22, color: 'from-slate-700 to-slate-600' },
                ].map((c) => (
                  <div key={c.name} className={`flex items-center gap-3 rounded-lg px-3 py-2 ${(c as { you?: boolean }).you ? 'bg-emerald-500/10 border border-emerald-500/20' : ''}`}>
                    <span className={`text-[10px] font-semibold w-40 shrink-0 truncate ${(c as { you?: boolean }).you ? 'text-emerald-400' : 'text-slate-500'}`}>{c.name}</span>
                    <div className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full bg-gradient-to-r ${c.color}`} style={{ width: `${c.score}%` }} />
                    </div>
                    <span className={`text-[10px] font-black w-6 text-right ${(c as { you?: boolean }).you ? 'text-emerald-400' : 'text-slate-600'}`}>{c.score}</span>
                  </div>
                ))}
                <div className="rounded-xl bg-slate-800/40 border border-slate-700/60 p-3.5 mt-2">
                  <p className="text-slate-400 text-xs"><span className="text-white font-bold">Insight:</span> Estás 38 puntos por debajo del líder. Las 3 principales brechas son cobertura geográfica, reseñas recientes y keywords GEO sin posición.</p>
                </div>
              </div>
            )}

            {activeTab === 'keywords' && (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Keywords relevantes · Sector peluquería · Madrid</p>
                {[
                  { kw: 'peluquería cerca de mí',       vol: '8.1K', pos: null, opp: 'Alta' },
                  { kw: 'corte de pelo Madrid centro',  vol: '3.4K', pos: 12,   opp: 'Media' },
                  { kw: 'mechas balayage Madrid',       vol: '2.9K', pos: null, opp: 'Alta' },
                  { kw: 'peluquería económica Madrid',  vol: '1.8K', pos: 7,    opp: 'Baja' },
                  { kw: 'tratamiento keratina Madrid',  vol: '1.2K', pos: null, opp: 'Alta' },
                  { kw: 'tinte raíces Madrid precio',   vol: '940',  pos: null, opp: 'Alta' },
                ].map((row) => {
                  const oppColor = row.opp === 'Alta' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    : row.opp === 'Media' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                    : 'text-slate-500 bg-slate-800/60 border-slate-700';
                  return (
                    <div key={row.kw} className="flex items-center gap-3 bg-slate-800/40 rounded-lg px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-[11px] font-medium truncate">{row.kw}</p>
                        <p className="text-slate-600 text-[9px]">{row.vol}/mes · {row.pos ? `Pos. ${row.pos}` : 'Sin posición'}</p>
                      </div>
                      <span className={`text-[9px] font-bold border rounded-full px-2 py-0.5 shrink-0 ${oppColor}`}>{row.opp}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {activeTab === 'plan' && (
              <div className="space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Plan de acción · Generado por IA · Ordenado por impacto</p>
                {[
                  { num: 1, title: 'Optimizar descripción GBP con 3 keywords de alta intención', impact: '+23% clics estimados', time: '15 min', color: 'emerald' },
                  { num: 2, title: 'Añadir horarios especiales de festivos y agosto',            impact: '+12% visibilidad Maps', time: '5 min',  color: 'teal' },
                  { num: 3, title: 'Crear 2 posts GBP con keywords geolocalizadas',              impact: '+18% impresiones', time: '30 min', color: 'blue' },
                  { num: 4, title: 'Campaña de solicitud de reseñas con término clave',          impact: '+31% posición orgánica', time: '20 min', color: 'amber' },
                  { num: 5, title: 'Corregir incoherencias en citas NAP de directorios',         impact: 'Eliminar fallo crítico', time: '45 min', color: 'orange' },
                ].map((action) => {
                  const colorMap: Record<string, string> = {
                    emerald: 'text-emerald-400 bg-emerald-500/8 border-emerald-500/20',
                    teal: 'text-teal-400 bg-teal-500/8 border-teal-500/20',
                    blue: 'text-blue-400 bg-blue-500/8 border-blue-500/20',
                    amber: 'text-amber-400 bg-amber-500/8 border-amber-500/20',
                    orange: 'text-orange-400 bg-orange-500/8 border-orange-500/20',
                  };
                  return (
                    <div key={action.num} className={`rounded-xl border p-3.5 flex items-start gap-3 ${colorMap[action.color]}`}>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 border ${colorMap[action.color]}`}>
                        {action.num}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-xs font-semibold leading-snug">{action.title}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <span className={`text-[10px] font-bold ${colorMap[action.color].split(' ')[0]}`}>{action.impact}</span>
                          <span className="text-slate-600 text-[9px]">· {action.time}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* Locked footer */}
          <div className="border-t border-slate-800 bg-slate-950/60 px-5 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock size={13} className="text-slate-500" />
              <p className="text-slate-500 text-xs">Análisis completo con datos reales · disponible con tu cuenta</p>
            </div>
            <button
              onClick={onLoginClick}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm
                bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                text-slate-950 shadow-lg shadow-emerald-500/20 hover:-translate-y-0.5 transition-all duration-300 shrink-0"
            >
              <Zap size={14} fill="currentColor" /> Analizar mi negocio gratis
            </button>
          </div>
        </div>
      )}
    </section>
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
        <div className="absolute inset-0 pointer-events-none hidden sm:block">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[600px] bg-emerald-500/6 rounded-full blur-3xl" />
          <div className="absolute top-32 left-1/4 w-72 h-72 bg-teal-500/4 rounded-full blur-3xl" />
          <div className="absolute top-20 right-1/4 w-56 h-56 bg-emerald-600/3 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto px-6 pt-12 pb-6 relative">
          {/* Audience badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-400 whitespace-nowrap">
              <Flame size={13} className="text-orange-400 shrink-0" />
              <span>Para negocios locales y agencias de marketing digital</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-[3.2rem] font-bold text-white leading-[1.1] mb-4 tracking-tight text-center">
            Tu próximo cliente ya te está buscando.{' '}
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              ¿Te encuentran a ti o a tu competencia?
            </span>
          </h1>

          <p className="text-center text-slate-400 text-base sm:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
            Introduce tu negocio abajo y mira en segundos cómo estás posicionado, qué hacen tus competidores y qué debes mejorar — sin registro ni tarjeta.
          </p>

          {/* Scanner widget — the hero IS the demo */}
          <ScannerWidget onLoginClick={onLoginClick} />

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-5 text-xs text-slate-500 mt-6 mb-12">
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

          {/* Dual audience value cards — visible after scanner, gives context for scrollers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-3xl mx-auto">
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                  <MapPin size={15} className="text-emerald-400" />
                </div>
                <p className="text-white font-bold text-sm">Tengo un negocio local</p>
              </div>
              <ul className="space-y-2">
                {[
                  'Sé exactamente en qué posición estás vs. tus competidores',
                  'Descubre por qué te buscan y no te encuentran',
                  'Recibe un plan de acción semanal generado por IA',
                  'Mejora tu presencia en Google Maps, ChatGPT y Gemini',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-slate-300 text-xs leading-relaxed">
                    <Check size={12} className="text-emerald-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                  <TrendingUp size={15} className="text-blue-400" />
                </div>
                <p className="text-white font-bold text-sm">Me dedico al marketing digital</p>
              </div>
              <ul className="space-y-2">
                {[
                  'Audita a todos tus clientes desde un solo panel',
                  'Genera informes de SEO local con un solo clic',
                  'Detecta oportunidades GEO que la competencia no ve',
                  'Multiplica resultados con IA — sin aumentar tu equipo',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-slate-300 text-xs leading-relaxed">
                    <Check size={12} className="text-blue-400 shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-center text-xs text-slate-600 mt-5">
            {t('landing_have_account')}{' '}
            <button onClick={onLoginClick} className="text-emerald-500 hover:text-emerald-400 transition-colors font-medium">
              {t('landing_sign_in_link')}
            </button>
          </p>
        </div>
      </section>

      {/* ── SOCIAL PROOF (right under hero) ───────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pt-10 pb-2">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-0.5 mb-2">
            {[...Array(5)].map((_, i) => <Star key={i} size={15} className="text-amber-400 fill-amber-400" />)}
          </div>
          <h2 className="text-xl font-bold text-white mb-1">{t('landing_testimonials_title')}</h2>
          <p className="text-slate-500 text-sm">{t('landing_testimonials_sub')}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {TESTIMONIALS.map((item) => (
            <div
              key={item.name}
              className="rounded-2xl bg-slate-900/70 border border-slate-800/80 p-6 flex flex-col gap-4
                hover:border-emerald-500/25 hover:bg-slate-900/90 transition-all duration-300"
            >
              <div className="flex items-center gap-0.5">
                {[...Array(item.stars)].map((_, i) => (
                  <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
                ))}
              </div>
              <p className="text-slate-200 text-sm leading-relaxed flex-1">"{item.text}"</p>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-2.5">
                <p className="text-emerald-400 text-xs font-bold">{item.metric}</p>
              </div>
              <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
                <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0">
                  <div className={`absolute inset-0 bg-gradient-to-br ${item.color} flex items-center justify-center`}>
                    <span className="text-white text-xs font-bold">{item.initials}</span>
                  </div>
                  <img
                    src={item.photo}
                    alt={item.name}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-bold">{item.name}</p>
                  <p className="text-slate-500 text-[11px] truncate">{item.business} · {item.city}</p>
                </div>
              </div>
            </div>
          ))}
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
              { value: '+4h', label: t('landing_stat_4'), icon: <BarChart3 size={16} className="text-amber-400" /> },
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
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/3 p-8">
          <div className="text-center mb-7">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 mb-3">
              <HelpCircle size={11} /> {t('landing_pain_badge')}
            </div>
            <h2 className="text-2xl font-bold text-white">{t('landing_pain_title')}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl mx-auto">
            {PAIN_POINTS.map((p) => (
              <div key={p} className="flex items-start gap-3 bg-slate-950/60 rounded-xl p-3.5 border border-slate-800/60">
                <div className="w-5 h-5 rounded-full bg-amber-500/15 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                  <AlertCircle size={9} className="text-amber-400" />
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

      {/* ── TESTIMONIALS (moved above — section kept for scroll anchor) ── */}

      {/* ── FEATURE SHOWROOM ───────────────────────────────────────── */}
      <FeatureShowroom onLoginClick={onLoginClick} />

      {/* ── CASE STUDY PLAYGROUND ──────────────────────────────────── */}
      <CaseStudyPlayground onLoginClick={onLoginClick} />

      {/* ── TRIAL CTA BANNER ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-6">
        <div className="relative rounded-2xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/15 via-teal-500/10 to-blue-500/10" />
          <div className="absolute inset-0 border border-emerald-500/25 rounded-2xl" />
          <div className="relative flex flex-col sm:flex-row items-center justify-between gap-6 p-7 sm:p-9">
            <div className="text-center sm:text-left">
              <div className="inline-flex items-center gap-2 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-3 py-1 mb-3 whitespace-nowrap">
                <Zap size={10} fill="currentColor" className="shrink-0" /> 7 días gratis · sin tarjeta
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">¿Quieres probarlo con tu propio negocio?</h2>
              <p className="text-slate-400 text-sm leading-relaxed max-w-md">
                Obtén <strong className="text-white">7 días de acceso premium gratis</strong> — sin tarjeta de crédito. Analiza tu negocio real, descubre tus competidores y recibe tu plan de acción personalizado.
              </p>
              <div className="flex flex-wrap gap-3 mt-4 justify-center sm:justify-start">
                {[
                  { icon: <Check size={11} />, label: 'Radar de Competencia GEO completo' },
                  { icon: <Check size={11} />, label: 'AI Digital Twin activo' },
                  { icon: <Check size={11} />, label: 'Plan de acción generado por IA' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-1.5 text-emerald-400 text-xs">
                    {item.icon} <span className="text-slate-300">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-center gap-3 shrink-0">
              <button
                onClick={onLoginClick}
                className="inline-flex items-center gap-2.5 px-8 py-4 rounded-xl font-bold text-base transition-all duration-300
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:-translate-y-0.5 whitespace-nowrap"
              >
                <Zap size={16} fill="currentColor" />
                Regístrate ahora — es gratis
                <ArrowRight size={15} />
              </button>
              <p className="text-slate-600 text-[11px] flex items-center gap-1.5">
                <Shield size={10} /> Sin tarjeta · cancela cuando quieras
              </p>
            </div>
          </div>
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
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-400 mb-5 whitespace-nowrap">
              <Flame size={12} className="text-orange-400 shrink-0" /> {t('landing_final_badge')}
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
                <p className="text-emerald-400 text-xs font-bold flex items-baseline gap-1">
                  <span className="text-base font-extrabold tabular-nums leading-none">7</span>
                  <span>{lang === 'es' ? 'días gratis' : 'days free'}</span>
                </p>
                <p className="text-slate-500 text-[11px]">
                  {lang === 'es' ? 'Sin tarjeta hasta el día ' : 'No card until day '}
                  <span className="font-bold text-slate-400 tabular-nums">8</span>
                </p>
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
