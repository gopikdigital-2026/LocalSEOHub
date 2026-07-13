import React, { useState, useRef, useEffect, useMemo, memo, type FormEvent } from 'react';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  MapPin, Zap, Shield, Star, Check, ArrowRight, Sparkles,
  Eye, Globe, Target, MapPinned, Lock, AlertCircle, ExternalLink,
  Mail, ChevronDown, Brain, FileText, BarChart3, Users, Award,
  BadgeCheck, Flame, TrendingUp, CheckCircle2, Building2, Mic,
  MessageSquare, Clock, Radar, ChevronRight, Search, Layers,
} from 'lucide-react';
import { PrivacyModal, TermsModal, ContactModal, type LegalModal } from './LegalModals';
import { LogoIcon } from './Logo';
import { useI18n } from '../lib/i18n';
import { track, storeGoogleIntent } from '../lib/analytics';
import { isInAppBrowser } from '../lib/socialWebView';

interface LandingPageProps {
  onLoginClick: (email?: string) => void;
  onSubscribeClick: () => void;
  scrollToPricing?: boolean;
}

// ─── Tool trial config ────────────────────────────────────────────────────────
type TrialToolId = 'seo' | 'maps' | 'twin' | 'radar' | 'advisor';
type DemoPhase = 'idle' | 'scanning' | 'result';
type TFn = (key: string) => string;

function getTrialTools(t: TFn): Array<{
  id: TrialToolId;
  label: string;
  shortLabel: string;
  IconComponent: React.ElementType;
  gradient: string;
  border: string;
  iconBg: string;
  ph1: string;
  ph2: string;
  btn: string;
  scanMsg: string;
}> {
  return [
    {
      id: 'seo',
      label: t('trial_seo_label'),
      shortLabel: 'SEO',
      IconComponent: FileText,
      gradient: 'from-emerald-500/15 to-teal-500/8',
      border: 'border-emerald-500/30',
      iconBg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
      ph1: t('trial_seo_ph1'),
      ph2: t('trial_seo_ph2'),
      btn: t('trial_seo_btn'),
      scanMsg: t('trial_seo_scan'),
    },
    {
      id: 'maps',
      label: t('trial_maps_label'),
      shortLabel: 'Maps',
      IconComponent: MapPinned,
      gradient: 'from-blue-500/15 to-sky-500/8',
      border: 'border-blue-500/30',
      iconBg: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
      ph1: t('trial_maps_ph1'),
      ph2: t('trial_maps_ph2'),
      btn: t('trial_maps_btn'),
      scanMsg: t('trial_maps_scan'),
    },
    {
      id: 'twin',
      label: t('trial_twin_label'),
      shortLabel: 'Twin',
      IconComponent: Eye,
      gradient: 'from-cyan-500/15 to-sky-500/8',
      border: 'border-cyan-500/30',
      iconBg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
      ph1: t('trial_twin_ph1'),
      ph2: t('trial_twin_ph2'),
      btn: t('trial_twin_btn'),
      scanMsg: t('trial_twin_scan'),
    },
    {
      id: 'radar',
      label: t('trial_radar_label'),
      shortLabel: 'Radar',
      IconComponent: Target,
      gradient: 'from-orange-500/15 to-amber-500/8',
      border: 'border-orange-500/30',
      iconBg: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
      ph1: t('trial_radar_ph1'),
      ph2: t('trial_radar_ph2'),
      btn: t('trial_radar_btn'),
      scanMsg: t('trial_radar_scan'),
    },
    {
      id: 'advisor',
      label: t('trial_advisor_label'),
      shortLabel: 'Advisor',
      IconComponent: Brain,
      gradient: 'from-rose-500/15 to-pink-500/8',
      border: 'border-rose-500/30',
      iconBg: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
      ph1: t('trial_advisor_ph1'),
      ph2: t('trial_advisor_ph2'),
      btn: t('trial_advisor_btn'),
      scanMsg: t('trial_advisor_scan'),
    },
  ];
}

function getToolsShowcase(t: TFn) {
  return [
    { icon: FileText,  name: t('ts_1_name'), desc: t('ts_1_desc'), badge: t('ts_1_badge'), color: 'emerald' },
    { icon: MapPinned, name: t('ts_2_name'), desc: t('ts_2_desc'), badge: t('ts_2_badge'), color: 'blue'    },
    { icon: Eye,       name: t('ts_3_name'), desc: t('ts_3_desc'), badge: t('ts_3_badge'), color: 'cyan'    },
    { icon: Target,    name: t('ts_4_name'), desc: t('ts_4_desc'), badge: t('ts_4_badge'), color: 'orange'  },
    { icon: Globe,     name: t('ts_5_name'), desc: t('ts_5_desc'), badge: t('ts_5_badge'), color: 'teal'    },
    { icon: Brain,     name: t('ts_6_name'), desc: t('ts_6_desc'), badge: t('ts_6_badge'), color: 'rose'    },
    { icon: Mic,       name: t('ts_7_name'), desc: t('ts_7_desc'), badge: t('ts_7_badge'), color: 'violet'  },
  ];
}


// ─── Google icon ──────────────────────────────────────────────────────────────
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

// ─── Registration gate ────────────────────────────────────────────────────────
// NOTE: Google button routes through onLoginClick (opens LoginModal) instead of
// calling signInWithOAuth directly. Direct OAuth had 0% completion rate — users
// were landing on Google consent but never returning. LoginModal is the proven path.
function RegistrationGate({
  onLoginClick,
  context,
  businessName,
  toolLabel,
}: {
  onLoginClick: (email?: string) => void;
  context: string;
  businessName?: string;
  toolLabel: string;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inApp = isInAppBrowser();

  useEffect(() => { track('gate_shown', { context, trigger: 'tool_result' }); }, [context]);

  const handleEmail = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    track('gate_register_click', { context, method: 'email_inline' });
    setSubmitted(true);
    onLoginClick(email.trim());
  };

  const handleGoogle = () => {
    track('gate_register_click', { context, method: 'google_modal' });
    storeGoogleIntent(context);
    onLoginClick(); // abre LoginModal — el flujo que sí completa
  };

  if (submitted) {
    return (
      <div className="rounded-2xl p-5 text-center space-y-2 border border-emerald-500/28"
        style={{ background: 'linear-gradient(160deg, rgba(16,185,129,0.09) 0%, rgba(8,14,26,0.99) 55%)' }}>
        <div className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mx-auto">
          <Check size={18} className="text-emerald-400" />
        </div>
        <p className="text-white font-bold text-sm">{t('gate_opening')}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-emerald-500/30"
      style={{ background: 'linear-gradient(170deg, rgba(16,185,129,0.08) 0%, rgba(8,14,26,0.99) 50%)' }}>
      <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />
      <div className="p-5 space-y-3">

        <div className="text-center space-y-1">
          <p className="text-white font-extrabold text-base leading-tight">
            {businessName
              ? `${t('gate_unlock_title').replace('{name}', businessName)}`
              : `${t('gate_unlock_title_generic').replace('{tool}', toolLabel)}`}
          </p>
          <p className="text-emerald-400 text-[12px]">
            {t('gate_register_sub')}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 py-1">
          {[t('gate_feature_1'), t('gate_feature_2'), t('gate_feature_3')].map((item) => (
            <div key={item} className="flex flex-col items-center gap-1 rounded-xl bg-slate-800/40 border border-slate-700/40 p-2">
              <Check size={11} className="text-emerald-400" />
              <span className="text-[10px] text-slate-400 text-center leading-tight">{item}</span>
            </div>
          ))}
        </div>

        <div className="space-y-2" onClick={() => track('gate_cta_visible', { context })}>

          {/* PRIMARY: email — es el método que convierte según los datos */}
          <form onSubmit={handleEmail} className="space-y-2">
            <div className="relative">
              <Mail size={13} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com — empieza gratis"
                className="w-full bg-slate-900/80 border border-slate-600/60 rounded-xl pl-10 pr-3 py-3 text-sm text-slate-100
                  placeholder-slate-600 outline-none transition-all focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20" />
            </div>
            <button type="submit" disabled={!email.trim()}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all duration-150
                bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                text-slate-950 shadow-[0_4px_20px_rgba(16,185,129,0.35)] hover:-translate-y-0.5 active:translate-y-0
                disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0">
              <ArrowRight size={14} />
              {t('gate_cta_view')}
            </button>
          </form>

          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[9px] text-slate-600 px-1">o</span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* SECONDARY: Google / in-app fallback */}
          {inApp ? (
            <a href={window.location.href} target="_blank" rel="noopener noreferrer"
              onClick={() => { track('gate_register_click', { context, method: 'inapp_open' }); }}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-[12px]
                border border-slate-700/60 hover:border-slate-600 text-slate-300 hover:bg-slate-800/40 transition-all no-underline">
              <ExternalLink size={12} />{t('gate_open_browser')}
            </a>
          ) : (
            <button type="button" onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl font-semibold text-[12px]
                border border-slate-700/60 hover:border-slate-600/80 text-slate-300 hover:bg-slate-800/40 transition-all">
              <GoogleIconSm />
              {t('gate_google')}
            </button>
          )}

          <div className="flex items-center justify-center gap-3 pt-0.5">
            <span className="text-[9px] text-slate-600 flex items-center gap-0.5"><Shield size={8} />{t('gate_7days')}</span>
            <span className="text-slate-700 text-[9px]">·</span>
            <span className="text-[9px] text-slate-600 flex items-center gap-0.5"><Shield size={8} />{t('gate_no_card')}</span>
            <span className="text-slate-700 text-[9px]">·</span>
            <span className="text-[9px] text-slate-600">
              {t('gate_have_account')}{' '}
              <button type="button" onClick={() => { track('gate_register_click', { context, method: 'login_link' }); onLoginClick(); }}
                className="text-emerald-400 hover:text-emerald-300 transition-colors">
                {t('gate_sign_in')}
              </button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tool demo result renderers ───────────────────────────────────────────────
function SeoResult({ input1, input2 }: { input1: string; input2: string }) {
  const biz = input1 || 'tu negocio';
  const city = input2 || 'tu ciudad';
  const title = `${biz} en ${city} — Expertos Locales · Reserva Online · Resultados Garantizados`;
  const desc = `¿Buscas ${biz.toLowerCase()} en ${city}? Somos especialistas con más de 10 años de experiencia. Ofrecemos atención personalizada, presupuesto sin compromiso y el mejor servicio de la zona.`;
  const kws = [`${biz.toLowerCase()} ${city}`, `mejor ${biz.toLowerCase()} ${city}`];
  const score = Math.floor(38 + Math.random() * 28);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Resultado generado</p>
        <span className="text-[9px] bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-full px-2 py-0.5 font-semibold uppercase">Gratis</span>
      </div>
      <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3.5">
        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mb-1.5">Título SEO optimizado</p>
        <p className="text-white text-sm font-medium leading-snug">{title}</p>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1.5">Descripción (vista previa)</p>
        <p className="text-slate-300 text-xs leading-relaxed">{desc}</p>
        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
          <Lock size={9} />
          <span>Versión SEO extendida + schema estructurado bloqueados</span>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Keywords</p>
        <div className="flex flex-wrap gap-2">
          {kws.map((k) => <span key={k} className="text-[11px] bg-teal-500/15 border border-teal-500/20 text-teal-300 rounded-full px-3 py-1">{k}</span>)}
          <span className="flex items-center gap-1 text-[11px] bg-slate-700/60 border border-slate-600/50 text-slate-400 rounded-full px-3 py-1"><Lock size={9} />+8 bloqueadas</span>
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/6 border border-amber-500/25">
        <AlertCircle size={14} className="text-amber-400 shrink-0" />
        <p className="text-amber-300/90 text-xs">Tu ficha actual tiene un score estimado de <strong>{score}/100</strong>. Con las optimizaciones completas puedes llegar a 85+.</p>
      </div>
    </div>
  );
}

function MapsResult({ input1, input2 }: { input1: string; input2: string }) {
  const biz = input1 || 'tu negocio';
  const city = input2 || 'tu ciudad';
  const score = Math.floor(32 + Math.random() * 30);
  const title = `${biz} en ${city} — Abierto hoy | Atención personalizada | Reserva online`;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-0.5">Puntuación de optimización</p>
          <p className="text-white font-bold text-sm">{biz} · {city}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-extrabold text-amber-400 tabular-nums">{score}/100</div>
          <div className="text-[10px] text-slate-500">Infraoptimizado</div>
        </div>
      </div>
      <div className="w-full bg-slate-800/60 rounded-full h-2.5 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-1000"
          style={{ width: `${score}%` }} />
      </div>
      <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3.5">
        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-wider mb-1.5">Título optimizado (gratis)</p>
        <p className="text-white text-sm font-medium leading-snug">{title}</p>
      </div>
      <div className="rounded-xl bg-amber-500/6 border border-amber-500/25 p-3.5">
        <p className="text-[10px] text-amber-400 font-bold uppercase tracking-wider mb-2">Fallos críticos detectados</p>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-amber-300/80">
            <AlertCircle size={10} className="text-amber-400 shrink-0" />
            <span>Sin horarios especiales para festivos (pierdes el 68% de búsquedas nocturnas)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock size={10} className="shrink-0" /><span className="blur-[3px] select-none">Descripción sin keywords semánticas locales</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock size={10} className="shrink-0" /><span className="blur-[3px] select-none">Sin schema de negocio estructurado</span>
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={9} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Competidores cercanos — bloqueado</p>
        </div>
        <div className="space-y-1.5">
          {['Competidor #1 en tu zona', 'Competidor #2 en tu zona'].map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[9px] font-black text-amber-400 w-4">#{i + 1}</span>
              <span className="text-[11px] text-slate-300 blur-[5px] select-none flex-1">{c}</span>
              <span className="text-[9px] text-red-400 font-bold">+{i === 0 ? 47 : 29} pts</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TwinResult({ input1, input2 }: { input1: string; input2: string }) {
  const biz = input1 || 'tu negocio';
  const cat = input2 || 'negocio local';
  const score = Math.floor(40 + Math.random() * 28);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider mb-0.5">Gemelo Digital creado</p>
          <p className="text-white font-bold text-sm">{biz} · {cat}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-extrabold text-cyan-400 tabular-nums">{score}/100</div>
          <div className="text-[10px] text-slate-500">Presencia digital</div>
        </div>
      </div>
      <div className="w-full bg-slate-800/60 rounded-full h-2 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-500 transition-all duration-1000"
          style={{ width: `${score}%` }} />
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2">Señales detectadas</p>
        <div className="space-y-2">
          {[
            { ok: true, label: 'Presencia en Google Maps: Activa' },
            { ok: true, label: 'Categoría principal: Correcta' },
            { ok: false, label: 'Keywords semánticas en descripción' },
          ].map(({ ok, label }, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {ok
                ? <BadgeCheck size={11} className="text-emerald-400 shrink-0" />
                : <AlertCircle size={11} className="text-amber-400 shrink-0" />}
              <span className={ok ? 'text-slate-300' : 'text-amber-300/80'}>{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock size={10} className="shrink-0" />
            <span className="blur-[3px] select-none">Schema estructurado: No detectado</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Lock size={10} className="shrink-0" />
            <span className="blur-[3px] select-none">Visibilidad en IA generativa: Sin datos</span>
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3">
        <div className="flex items-center gap-2">
          <Lock size={9} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Mapa de calor de visibilidad por zonas — bloqueado</p>
        </div>
        <div className="mt-2 grid grid-cols-5 gap-1">
          {[90, 45, 70, 20, 85, 35, 60, 80, 25, 55].map((v, i) => (
            <div key={i} className="h-6 rounded-sm opacity-30"
              style={{ background: `rgba(34,211,238,${v / 100})` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RadarResult({ input1, input2 }: { input1: string; input2: string }) {
  const biz = input1 || 'Tu negocio';
  const city = input2 || 'tu ciudad';
  const myScore = Math.floor(30 + Math.random() * 25);
  const comps = [
    { score: myScore + 42 + Math.floor(Math.random() * 10), reviews: 142 },
    { score: myScore + 28 + Math.floor(Math.random() * 8), reviews: 97 },
    { score: myScore + 15 + Math.floor(Math.random() * 6), reviews: 63 },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="text-center shrink-0">
          <div className="text-2xl font-extrabold text-orange-400 tabular-nums">{myScore}</div>
          <div className="text-[9px] text-slate-500">Tu score</div>
        </div>
        <div className="flex-1">
          <p className="text-white font-bold text-sm">{biz}</p>
          <p className="text-slate-500 text-[11px]">vs. 3 competidores en {city}</p>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5 space-y-2.5">
        {comps.map((c, i) => (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 blur-[4px] select-none">Competidor #{i + 1} en {city}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-red-400 font-bold">+{c.score - myScore} pts</span>
                <Star size={9} className="text-amber-400 fill-amber-400" />
                <span className="text-[9px] text-slate-400">{c.reviews}</span>
              </div>
            </div>
            <div className="w-full bg-slate-700/40 rounded-full h-1.5">
              <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400"
                style={{ width: `${Math.min(c.score, 100)}%` }} />
            </div>
          </div>
        ))}
        <div className="space-y-1 border-t border-slate-700/50 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-400">{biz} (tú)</span>
            <span className="text-[10px] text-slate-400 font-bold">{myScore}/100</span>
          </div>
          <div className="w-full bg-slate-700/40 rounded-full h-1.5">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
              style={{ width: `${myScore}%` }} />
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3">
        <div className="flex items-center gap-2">
          <Lock size={9} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Plan para superar al #1 en 30 días — bloqueado</p>
        </div>
        <div className="mt-2 space-y-1">
          {['Acción inmediata #1 para cerrar la brecha', 'Palabras clave que el #1 usa y tú no', 'Estrategia de reseñas semana a semana'].map((item) => (
            <p key={item} className="text-[11px] text-slate-500 blur-[3.5px] select-none">{item}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function AdvisorResult({ input1, input2 }: { input1: string; input2: string }) {
  const biz = input1 || 'tu negocio';
  const problem = input2 || 'captación de clientes';

  return (
    <div className="space-y-3">
      <p className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Consejo AI para {biz}</p>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3.5">
        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Análisis de tu situación</p>
        <p className="text-slate-300 text-xs leading-relaxed">
          Para un negocio como <strong className="text-white">{biz}</strong>, el mayor obstáculo en la captación suele ser la baja visibilidad local: apareces tarde en los resultados cuando un cliente potencial busca "{problem.toLowerCase()}" cerca de tu dirección. Esto se debe principalmente a una ficha de Google Business Profile incompleta y a la ausencia de señales semánticas locales…
        </p>
        <div className="mt-2 flex items-center gap-1.5">
          <Lock size={9} className="text-slate-500" />
          <span className="text-[10px] text-slate-500">Análisis completo (8 puntos más) bloqueado</span>
        </div>
      </div>
      <div className="rounded-xl bg-slate-800/40 border border-slate-700/50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Lock size={9} className="text-slate-500" />
          <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wide">Plan de acción en 5 pasos — bloqueado</p>
        </div>
        <div className="space-y-1">
          {['Quick win esta semana: optimizar ficha GBP', 'Conseguir 10 reseñas con plantilla incluida', 'Keywords locales prioritarias para tu categoría'].map((item) => (
            <p key={item} className="text-[11px] text-slate-500 blur-[3.5px] select-none">{item}</p>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-3 p-3 rounded-xl bg-rose-500/6 border border-rose-500/20">
        <AlertCircle size={14} className="text-rose-400 shrink-0" />
        <p className="text-rose-300/90 text-xs">Sin un plan estructurado, la mayoría de negocios locales pierden entre el 60% y el 80% de sus clientes potenciales ante competidores mejor posicionados.</p>
      </div>
    </div>
  );
}

// ─── Main tool trial widget ───────────────────────────────────────────────────
function ToolTrialSection({ onLoginClick, initialToolIdx }: { onLoginClick: (email?: string) => void; initialToolIdx?: number }) {
  const { t } = useI18n();
  const TRIAL_TOOLS = getTrialTools(t as TFn);
  const [activeTool, setActiveTool] = useState(initialToolIdx ?? 0);
  const [input1, setInput1] = useState('');
  const [input2, setInput2] = useState('');
  const [phase, setPhase] = useState<DemoPhase>('idle');
  const [showGate, setShowGate] = useState(false);
  const [lockedInput1, setLockedInput1] = useState('');
  const [lockedInput2, setLockedInput2] = useState('');
  const scanRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (initialToolIdx !== undefined) {
      if (scanRef.current) clearTimeout(scanRef.current);
      setActiveTool(initialToolIdx);
      setInput1('');
      setInput2('');
      setPhase('idle');
      setShowGate(false);
    }
  }, [initialToolIdx]);

  const tool = TRIAL_TOOLS[activeTool];

  const switchTool = (idx: number) => {
    if (scanRef.current) clearTimeout(scanRef.current);
    setActiveTool(idx);
    setInput1('');
    setInput2('');
    setPhase('idle');
    setShowGate(false);
  };

  const handleScan = () => {
    if (!input1.trim()) return;
    setLockedInput1(input1.trim());
    setLockedInput2(input2.trim());
    setPhase('scanning');
    setShowGate(false);
    track('widget_scan_start', { tool: tool.id, input: input1 });
    scanRef.current = setTimeout(() => {
      setPhase('result');
      setShowGate(true);
      track('widget_scan_result', { tool: tool.id });
    }, 1800);
  };

  useEffect(() => () => { if (scanRef.current) clearTimeout(scanRef.current); }, []);

  const INPUT_CLS = 'w-full bg-slate-950/70 border border-slate-700/50 rounded-xl px-4 py-3.5 text-sm text-slate-100 placeholder-slate-600 outline-none transition-all focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/20';

  return (
    <div className="max-w-2xl mx-auto">
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500" />

        {/* Tool picker */}
        <div className="px-5 pt-5 pb-3">
          <p className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold mb-3 text-center">
            {t('trial_pick')}
          </p>
          <div className="grid grid-cols-5 gap-1">
            {TRIAL_TOOLS.map((tool_item, i) => {
              const Icon = tool_item.IconComponent;
              const isActive = activeTool === i;
              return (
                <button key={tool_item.id} onClick={() => switchTool(i)}
                  className={`flex flex-col items-center gap-1.5 py-2.5 px-1 rounded-xl text-[10px] font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                      : 'text-slate-500 hover:text-slate-300 border border-transparent hover:bg-slate-800/40'
                  }`}>
                  <Icon size={14} className={isActive ? 'text-emerald-400' : 'text-slate-500'} />
                  <span className="hidden sm:block truncate w-full text-center">{tool_item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-5 pb-5">
          {/* Active tool header */}
          <div className="flex items-center gap-2.5 mb-4">
            <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${tool.iconBg}`}>
              <tool.IconComponent size={14} />
            </div>
            <div>
              <p className="text-white text-sm font-bold leading-tight">{tool.label}</p>
              <p className="text-slate-500 text-[11px]">{t('trial_free_label')}</p>
            </div>
          </div>

          {/* Idle — form */}
          {phase === 'idle' && (
            <div className="space-y-3">
              <input type="text" value={input1} onChange={(e) => setInput1(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                placeholder={tool.ph1} className={INPUT_CLS} />
              <input type="text" value={input2} onChange={(e) => setInput2(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleScan()}
                placeholder={tool.ph2} className={INPUT_CLS} />
              <button onClick={handleScan} disabled={!input1.trim()}
                className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base transition-all duration-300
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/45 hover:-translate-y-0.5 active:translate-y-0
                  disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0">
                <Zap size={16} fill="currentColor" />
                {tool.btn}
              </button>
              <p className="text-center text-[11px] text-slate-600 flex items-center justify-center gap-1">
                <Shield size={9} />Sin registro · Sin tarjeta · Resultado en segundos
              </p>
            </div>
          )}

          {/* Scanning */}
          {phase === 'scanning' && (
            <div className="py-10 flex flex-col items-center gap-5">
              <div className="relative w-24 h-24 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full"
                  style={{ background: 'conic-gradient(from 0deg, rgba(16,185,129,0.25), transparent 55%)', animation: 'radarSweep 1.8s linear infinite' }} />
                {[0, 1, 2].map((i) => (
                  <div key={i} className="absolute rounded-full border border-emerald-400/35"
                    style={{ width: `${40 + i * 20}px`, height: `${40 + i * 20}px`, animation: 'radarRing 2s ease-out infinite', animationDelay: `${i * 0.55}s` }} />
                ))}
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-xl shadow-emerald-500/40 z-10">
                  <tool.IconComponent size={18} className="text-slate-950" />
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-white font-bold text-sm">{tool.scanMsg}</p>
                <p className="text-slate-500 text-xs">Analizando: <span className="text-slate-300">"{lockedInput1}"</span></p>
              </div>
              <div className="w-full max-w-xs bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                  style={{ animation: 'scanProgress 2.5s ease-out forwards' }} />
              </div>
            </div>
          )}

          {/* Result */}
          {phase === 'result' && (
            <div className="space-y-3">
              <button onClick={() => { setPhase('idle'); setInput1(''); setInput2(''); setShowGate(false); }}
                className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors mb-1">
                <ChevronRight size={11} className="rotate-180" />
                {t('trial_analyze_other')}
              </button>

              {activeTool === 0 && <SeoResult input1={lockedInput1} input2={lockedInput2} />}
              {activeTool === 1 && <MapsResult input1={lockedInput1} input2={lockedInput2} />}
              {activeTool === 2 && <TwinResult input1={lockedInput1} input2={lockedInput2} />}
              {activeTool === 3 && <RadarResult input1={lockedInput1} input2={lockedInput2} />}
              {activeTool === 4 && <AdvisorResult input1={lockedInput1} input2={lockedInput2} />}

              {showGate && (
                <RegistrationGate
                  onLoginClick={onLoginClick}
                  context={tool.id}
                  businessName={lockedInput1 || undefined}
                  toolLabel={tool.label}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── FAQ accordion ────────────────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button onClick={() => setOpen((v) => !v)}
      className="w-full text-left rounded-xl border border-slate-800/80 bg-slate-900/40 hover:bg-slate-900/70 transition-colors overflow-hidden">
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

// ─── Color map for tool cards ─────────────────────────────────────────────────
const TOOL_COLORS: Record<string, { bg: string; border: string; icon: string; badge: string }> = {
  emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'text-emerald-400', badge: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400' },
  blue:    { bg: 'bg-blue-500/10',    border: 'border-blue-500/20',    icon: 'text-blue-400',    badge: 'bg-blue-500/15 border-blue-500/25 text-blue-400' },
  cyan:    { bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20',    icon: 'text-cyan-400',    badge: 'bg-cyan-500/15 border-cyan-500/25 text-cyan-400' },
  orange:  { bg: 'bg-orange-500/10',  border: 'border-orange-500/20',  icon: 'text-orange-400',  badge: 'bg-orange-500/15 border-orange-500/25 text-orange-400' },
  teal:    { bg: 'bg-teal-500/10',    border: 'border-teal-500/20',    icon: 'text-teal-400',    badge: 'bg-teal-500/15 border-teal-500/25 text-teal-400' },
  rose:    { bg: 'bg-rose-500/10',    border: 'border-rose-500/20',    icon: 'text-rose-400',    badge: 'bg-rose-500/15 border-rose-500/25 text-rose-400' },
  violet:  { bg: 'bg-violet-500/10',  border: 'border-violet-500/20',  icon: 'text-violet-400',  badge: 'bg-violet-500/15 border-violet-500/25 text-violet-400' },
};

// ─── Scroll-reveal hook ──────────────────────────────────────────────────────
function useReveal<T extends HTMLElement = HTMLDivElement>(threshold = 0.12) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return { ref, visible };
}

// ─── Animated counter ────────────────────────────────────────────────────────
function AnimatedCounter({ target, suffix = '', prefix = '', active }: {
  target: number; suffix?: string; prefix?: string; active: boolean;
}) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active) return;
    const dur = 1600;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(Math.round(e * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [active, target]);
  return <>{prefix}{val}{suffix}</>;
}

// ─── Hero dashboard preview ───────────────────────────────────────────────────
function HeroDashboard() {
  const [score, setScore] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let n = 0;
    const iv = setInterval(() => {
      n = Math.min(n + 1, 74);
      setScore(n);
      if (n >= 74) clearInterval(iv);
    }, 18);
    return () => clearInterval(iv);
  }, [ready]);

  const barColor = score < 40 ? '#ef4444' : score < 70 ? '#f59e0b' : '#10b981';

  return (
    <div className="relative float-dash">
      {/* Glow behind card */}
      <div className="absolute -inset-6 bg-emerald-500/8 rounded-3xl blur-2xl -z-10 pointer-events-none" />

      <div className="rounded-2xl overflow-hidden border border-slate-700/50 shadow-2xl shadow-black/60"
        style={{ background: 'linear-gradient(160deg, rgba(15,23,42,0.99) 0%, rgba(6,11,20,1) 100%)' }}>

        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60 bg-slate-900/70">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
          </div>
          <div className="flex-1 mx-3 bg-slate-800/70 rounded-md px-3 py-1 text-[10px] text-slate-500 font-mono text-center">
            localsenhub.io/dashboard
          </div>
          <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
          </span>
        </div>

        <div className="p-5 space-y-4">
          {/* Biz header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-sm">Peluquería López</p>
              <p className="text-slate-500 text-xs">Madrid · Peluquería</p>
            </div>
            <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-all duration-500 ${
              score >= 74
                ? 'bg-amber-500/15 border-amber-500/25 text-amber-400'
                : 'bg-slate-700/40 border-slate-600/30 text-slate-500'
            }`}>
              {score >= 74 ? 'Mejorable' : 'Analizando…'}
            </span>
          </div>

          {/* Score card */}
          <div className="rounded-xl bg-slate-800/60 border border-slate-700/40 p-4">
            <div className="flex items-end justify-between mb-3">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Visibilidad Local</p>
              <p className="text-3xl font-black tabular-nums text-white">
                {score}<span className="text-slate-600 text-base font-normal">/100</span>
              </p>
            </div>
            <div className="w-full h-2 bg-slate-700/60 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-none" style={{ width: `${score}%`, background: barColor }} />
            </div>
            <p className={`text-[10px] mt-2 flex items-center gap-1 font-medium transition-all duration-700 ${
              score >= 74 ? 'text-emerald-400 opacity-100' : 'opacity-0'
            }`}>
              <Sparkles size={9} />Con optimización IA: estimado 91/100
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { v: '+23%', label: 'Llamadas', tc: 'text-emerald-400' },
              { v: '+14%', label: 'Clics web', tc: 'text-sky-400' },
              { v: '+17%', label: 'Rutas', tc: 'text-violet-400' },
            ].map(({ v, label, tc }) => (
              <div key={label} className="rounded-xl bg-slate-800/40 border border-slate-700/30 p-3 text-center">
                <p className={`text-lg font-black ${tc} transition-all duration-500 ${score >= 74 ? 'opacity-100' : 'opacity-0'}`}>{v}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Actions list */}
          <div className="rounded-xl border border-slate-700/30 overflow-hidden">
            <div className="px-3 py-2.5 bg-slate-800/40 border-b border-slate-700/30">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Plan de acción IA</p>
            </div>
            {[
              { t: 'Optimizar descripción con keywords locales', p: 'Alta', dot: 'bg-red-400' },
              { t: 'Responder 3 reseñas sin contestar', p: 'Alta', dot: 'bg-red-400' },
              { t: 'Publicar actualización semanal', p: 'Media', dot: 'bg-amber-400' },
            ].map(({ t, p, dot }, i) => (
              <div key={t} className="flex items-center justify-between px-3 py-2.5 gap-2 border-b border-slate-800/30 last:border-0"
                style={{ opacity: score >= 74 ? 1 : 0, transform: score >= 74 ? 'none' : 'translateX(-6px)', transition: `opacity 0.4s ease ${0.5 + i * 0.12}s, transform 0.4s ease ${0.5 + i * 0.12}s` }}>
                <div className="flex items-center gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                  <span className="text-xs text-slate-300">{t}</span>
                </div>
                <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${p === 'Alta' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Floating badge */}
      <div className={`absolute -top-4 -right-4 z-10 bg-emerald-500 rounded-xl px-3.5 py-2 shadow-lg shadow-emerald-500/40 text-[11px] font-bold text-slate-950 flex items-center gap-1.5 transition-all duration-500 ${score >= 74 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
        <Sparkles size={11} />5 oportunidades detectadas
      </div>
    </div>
  );
}

// ─── Animation presets ───────────────────────────────────────────────────────
const FU   = { hidden: { opacity: 0, y: 20 },      show: { opacity: 1, y: 0,      transition: { duration: 0.5,  ease: [0.16,1,0.3,1] as const } } };
const FI   = { hidden: { opacity: 0 },              show: { opacity: 1,            transition: { duration: 0.4 } } };
const STAG = { show: { transition: { staggerChildren: 0.1 } } };
const HCARD= { y: -4, scale: 1.02, transition: { duration: 0.2 } };

const Rev = memo(function Rev({ children, delay = 0, stagger = false, className = '' }: {
  children: React.ReactNode; delay?: number; stagger?: boolean; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.12 });
  return (
    <motion.div ref={ref} variants={stagger ? STAG : FU}
      initial="hidden" animate={inView ? 'show' : 'hidden'}
      transition={{ delay }} className={className}>
      {children}
    </motion.div>
  );
});

// ─── Metric counter ───────────────────────────────────────────────────────────
function MetricCounter({ target, cls }: { target: number; cls: string }) {
  const ref   = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const dur = 1600, t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      setVal(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, target]);
  return <span ref={ref} className={cls}>+{val}%</span>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VISIBILITY CHECKER — Google Maps Visibility interactive hero
// ═══════════════════════════════════════════════════════════════════════════════

type VPhase = 'idle' | 'loading' | 'result';

interface VResult {
  name: string;
  overall: number;
  subs: { label: string; score: number; Icon: React.ElementType; clr: string }[];
  actions: { title: string; impact: 'Alto' | 'Medio'; time: string; diff: 'Fácil' | 'Medio' }[];
}

// Deterministic result from business name (replace this fn with real API call later)
function buildResult(name: string): VResult {
  const h = Array.from(name.toLowerCase()).reduce((a, c) => a + c.charCodeAt(0), 0);
  const j = (b: number, r: number) => Math.min(97, Math.max(28, b + (h % r) - Math.floor(r / 2)));
  return {
    name,
    overall: j(70, 30),
    subs: [
      { label: 'Google Business', score: j(76, 22), Icon: Globe,     clr: 'sky'     },
      { label: 'Reseñas',         score: j(62, 26), Icon: Star,      clr: 'amber'   },
      { label: 'Competidores',    score: j(52, 24), Icon: Target,    clr: 'orange'  },
      { label: 'SEO Técnico',     score: j(86, 16), Icon: BarChart3, clr: 'emerald' },
    ],
    actions: [
      { title: 'Añadir más fotos al perfil',              impact: 'Alto',  time: '15 min', diff: 'Fácil'  },
      { title: 'Responder reseñas pendientes',             impact: 'Alto',  time: '10 min', diff: 'Fácil'  },
      { title: 'Publicar una actualización semanal',       impact: 'Medio', time: '20 min', diff: 'Fácil'  },
      { title: 'Optimizar categorías principales',         impact: 'Alto',  time: '5 min',  diff: 'Fácil'  },
      { title: 'Mejorar descripción con keywords locales', impact: 'Alto',  time: '30 min', diff: 'Medio'  },
    ],
  };
}

const CLR: Record<string, { text: string; bg: string; bar: string; ring: string }> = {
  sky:     { text: 'text-sky-400',     bg: 'bg-sky-500/10',     bar: 'bg-sky-400',     ring: 'border-sky-500/25'     },
  amber:   { text: 'text-amber-400',   bg: 'bg-amber-500/10',   bar: 'bg-amber-400',   ring: 'border-amber-500/25'   },
  orange:  { text: 'text-orange-400',  bg: 'bg-orange-500/10',  bar: 'bg-orange-400',  ring: 'border-orange-500/25'  },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', bar: 'bg-emerald-400', ring: 'border-emerald-500/25' },
};

// ── Score ring (SVG circle) ──────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const [anim, setAnim] = useState(0);
  const R = 70, C = 2 * Math.PI * R;
  const color = score >= 80 ? '#10b981' : score >= 60 ? '#f59e0b' : '#ef4444';
  const tag   = score >= 80 ? 'Bueno'   : score >= 60 ? 'Mejorable' : 'Crítico';
  const tagC  = score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400';

  useEffect(() => {
    let n = 0;
    const iv = setInterval(() => {
      n = Math.min(n + 1, score);
      setAnim(n);
      if (n >= score) clearInterval(iv);
    }, 14);
    return () => clearInterval(iv);
  }, [score]);

  return (
    <div className="relative inline-flex items-center justify-center w-[168px] h-[168px]">
      <svg width={168} height={168} className="absolute inset-0 -rotate-90">
        <circle cx={84} cy={84} r={R} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={10} />
        <circle cx={84} cy={84} r={R} fill="none" stroke={color} strokeWidth={10}
          strokeDasharray={`${(anim / 100) * C} ${C}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 8px ${color}55)` }} />
      </svg>
      <div className="flex flex-col items-center justify-center z-10">
        <span className="text-[2.6rem] font-black text-white tabular-nums leading-none">{anim}</span>
        <span className="text-slate-600 text-xs">/100</span>
        <span className={`text-xs font-bold mt-1.5 ${tagC}`}>{tag}</span>
      </div>
    </div>
  );
}

// ── Sub-score card ────────────────────────────────────────────────────────────
function SubScoreCard({ label, score, Icon, clr }: { label: string; score: number; Icon: React.ElementType; clr: string }) {
  const [anim, setAnim] = useState(0);
  const c = CLR[clr] ?? CLR.emerald;
  useEffect(() => {
    let n = 0;
    const iv = setInterval(() => { n = Math.min(n + 1, score); setAnim(n); if (n >= score) clearInterval(iv); }, 18);
    return () => clearInterval(iv);
  }, [score]);
  return (
    <div className={`rounded-xl border ${c.ring} p-4 flex flex-col gap-3`}
      style={{ background: 'linear-gradient(145deg,rgba(15,23,42,0.92) 0%,rgba(8,14,26,0.97) 100%)' }}>
      <div className="flex items-center justify-between">
        <div className={`w-8 h-8 rounded-lg ${c.bg} flex items-center justify-center`}>
          <Icon size={14} className={c.text} />
        </div>
        <span className={`text-xl font-black tabular-nums ${c.text}`}>{anim}</span>
      </div>
      <div>
        <p className="text-slate-400 text-[11px] mb-1.5">{label}</p>
        <div className="w-full h-1.5 rounded-full bg-slate-800">
          <div className={`h-full rounded-full ${c.bar} transition-none`} style={{ width: `${anim}%` }} />
        </div>
      </div>
    </div>
  );
}

// ── Loading messages + stages ─────────────────────────────────────────────────
const LOAD_MSGS = [
  'Buscando ficha de Google…',
  'Verificando información del negocio…',
  'Analizando reseñas…',
  'Calculando Local Score…',
  'Buscando competidores en tu zona…',
  'Analizando categorías…',
  'Detectando oportunidades de crecimiento…',
  'Generando informe personalizado…',
];

// 3.5 s total — gives credibility without killing conversion
const LOAD_STAGES = [
  { pct:  0, msg: 0, ms:    0 },
  { pct: 15, msg: 1, ms:  450 },
  { pct: 30, msg: 2, ms:  900 },
  { pct: 48, msg: 3, ms: 1400 },
  { pct: 64, msg: 4, ms: 1900 },
  { pct: 78, msg: 5, ms: 2400 },
  { pct: 91, msg: 6, ms: 2900 },
  { pct:100, msg: 7, ms: 3350 },
];

// ── Main VisibilityChecker ────────────────────────────────────────────────────
function VisibilityChecker({ onUnlock, onPhaseChange }: { onUnlock: () => void; onPhaseChange?: (phase: VPhase) => void }) {
  const [phase,       setPhase]       = useState<VPhase>('idle');
  const [name,        setName]        = useState('');
  const [pct,         setPct]         = useState(0);
  const [msgI,        setMsgI]        = useState(0);
  const [result,      setResult]      = useState<VResult | null>(null);
  const [earlyResult, setEarlyResult] = useState<VResult | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const startTimeRef = useRef<number>(0);
  const pctRef       = useRef<number>(0);

  const changePhase = (next: VPhase) => {
    setPhase(next);
    onPhaseChange?.(next);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { inputRef.current?.focus(); return; }
    startTimeRef.current = Date.now();
    track('hero_analysis_start', { name: n });
    changePhase('loading');
    setPct(0); setMsgI(0);
    setEarlyResult(null);
  };

  useEffect(() => {
    if (phase !== 'loading') return;
    const ts = LOAD_STAGES.map(({ pct: p, msg: m, ms }) =>
      setTimeout(() => {
        setPct(p);
        pctRef.current = p;
        setMsgI(m);
        // At 64% show partial result — score + subs visible while bar finishes
        if (p >= 64 && !earlyResult) {
          setEarlyResult(buildResult(name.trim()));
        }
      }, ms)
    );
    const done = setTimeout(() => {
      const r = buildResult(name.trim());
      setResult(r);
      changePhase('result');
      track('analysis_completed', {
        name: name.trim(),
        duration_ms: Date.now() - startTimeRef.current,
      });
    }, 3500);
    return () => { ts.forEach(clearTimeout); clearTimeout(done); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, name]);

  // Track abandonment when user navigates away during loading
  useEffect(() => {
    if (phase !== 'loading') return;
    return () => {
      if (pctRef.current < 100) {
        track('analysis_abandoned', {
          name: name.trim(),
          progress_pct: pctRef.current,
          duration_ms: Date.now() - startTimeRef.current,
        });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const reset = () => {
    changePhase('idle');
    setPct(0); setMsgI(0); setResult(null); setEarlyResult(null);
    pctRef.current = 0;
  };

  return (
    <AnimatePresence mode="wait">

      {/* ═══════════════════════════════════════ IDLE: search form */}
      {phase === 'idle' && (
        <motion.section key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.35 }}
          className="relative min-h-[92vh] flex flex-col items-center justify-center px-5 pt-16 pb-40 sm:py-20 overflow-hidden">

          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[700px] bg-emerald-500/5 rounded-full blur-3xl" />
            <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-teal-500/3 rounded-full blur-3xl" />
          </div>

          <div className="relative w-full max-w-2xl mx-auto text-center">
            <motion.div initial="hidden" animate="show" variants={STAG} className="space-y-7">

              <motion.div variants={FI}>
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-4 py-1.5 text-xs font-semibold text-emerald-400">
                  <Sparkles size={11} className="text-orange-400" />
                  AI Growth Copilot · Google Maps Visibility Checker
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </span>
              </motion.div>

              <motion.h1 variants={FU}
                className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold text-white leading-[1.07] tracking-tight">
                ¿Cuántos clientes pierdes<br className="hidden sm:block" /> por no aparecer en{' '}
                <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  Google Maps?
                </span>
              </motion.h1>

              <motion.p variants={FU} className="text-slate-400 text-lg">
                Descúbrelo ahora. Gratis. Sin registro.
              </motion.p>

              {/* ── Search bar ── */}
              <motion.form onSubmit={handleSubmit} variants={FU}>
                <div className="flex flex-col sm:flex-row gap-2.5 p-2 rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-sm shadow-2xl shadow-black/40">
                  <div className="flex items-center gap-3 flex-1 px-4 py-2.5">
                    <MapPin size={18} className="text-emerald-400 shrink-0" />
                    <input ref={inputRef} value={name} onChange={(e) => setName(e.target.value)}
                      placeholder="Escribe el nombre de tu negocio..."
                      className="flex-1 bg-transparent text-white placeholder-slate-500 text-base focus:outline-none min-w-0"
                      aria-label="Nombre del negocio"
                      autoComplete="off"
                    />
                    {name && (
                      <button type="button" onClick={() => { setName(''); inputRef.current?.focus(); }}
                        className="text-slate-600 hover:text-slate-400 transition-colors text-sm leading-none px-1"
                        aria-label="Limpiar">✕</button>
                    )}
                  </div>
                  <motion.button type="submit" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    className="flex items-center justify-center gap-2.5 px-7 py-3.5 rounded-xl font-bold text-base
                      bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
                      shadow-lg shadow-emerald-500/30 shrink-0 whitespace-nowrap">
                    <Zap size={15} fill="currentColor" />
                    Analizar Gratis
                  </motion.button>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-1.5 mt-3.5 text-xs text-slate-600">
                  <span>Prueba con:</span>
                  {['Peluquería', 'Restaurante', 'Dentista', 'Fontanero', 'Clínica'].map((s, i, a) => (
                    <React.Fragment key={s}>
                      <button type="button" onClick={() => { setName(s); inputRef.current?.focus(); }}
                        className="text-slate-500 hover:text-emerald-400 transition-colors hover:underline underline-offset-2">
                        {s}
                      </button>
                      {i < a.length - 1 && <span className="text-slate-700">·</span>}
                    </React.Fragment>
                  ))}
                </div>
              </motion.form>

              {/* Trust trio */}
              <motion.div variants={FI} className="flex flex-col sm:flex-row sm:flex-wrap items-center justify-center gap-y-2 gap-x-6 pt-1">
                {[
                  { text: 'Informe gratuito' },
                  { text: 'Menos de 2 minutos' },
                  { text: 'Sin tarjeta de crédito' },
                ].map(({ text }) => (
                  <span key={text} className="flex items-center gap-1.5 text-sm text-slate-400">
                    <Check size={13} className="text-emerald-400" />{text}
                  </span>
                ))}
              </motion.div>
            </motion.div>
          </div>

          {/* Trust strip — desktop only; on mobile the trust trio + sticky CTA cover this */}
          <div className="absolute bottom-0 inset-x-0 border-t border-slate-800/40 bg-slate-900/30 hidden sm:block">
            <div className="max-w-4xl mx-auto px-5 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
              {[
                { icon: Shield,     text: 'Sin tarjeta de crédito' },
                { icon: Zap,        text: 'Resultados en 2 minutos' },
                { icon: Brain,      text: 'IA para negocios locales' },
                { icon: BadgeCheck, text: '7 días gratis incluidos' },
              ].map(({ icon: Icon, text }) => (
                <div key={text} className="flex items-center gap-2 text-sm text-slate-400">
                  <Icon size={13} className="text-emerald-400 shrink-0" />{text}
                </div>
              ))}
            </div>
          </div>
        </motion.section>
      )}

      {/* ═══════════════════════════════════════════ LOADING */}
      {phase === 'loading' && (
        <motion.section key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="relative min-h-screen flex flex-col items-center justify-center px-5 py-16 overflow-hidden">

          {/* Animated radar rings */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            {[0, 1, 2].map(i => (
              <motion.div key={i}
                className="absolute w-40 h-40 rounded-full border border-emerald-500/15"
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 3.5 + i * 0.7, opacity: 0 }}
                transition={{ duration: 4, repeat: Infinity, delay: i * 1.3, ease: 'easeOut' }} />
            ))}
            <div className="absolute w-3 h-3 rounded-full bg-emerald-400/40 blur-sm" />
          </div>

          {/* Subtle grid overlay */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.025]"
            style={{ backgroundImage: 'linear-gradient(rgba(16,185,129,1) 1px,transparent 1px),linear-gradient(90deg,rgba(16,185,129,1) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

          <div className="relative z-10 w-full max-w-md mx-auto space-y-10">

            {/* Icon + name */}
            <div className="text-center space-y-4">
              <div className="w-20 h-20 rounded-3xl bg-slate-900/80 border border-emerald-500/25 flex items-center justify-center mx-auto shadow-xl shadow-black/40">
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}>
                  <Radar size={32} className="text-emerald-400" />
                </motion.div>
              </div>
              <div>
                <p className="text-slate-400 text-sm">Analizando</p>
                <p className="text-white font-bold text-xl mt-1 px-4 break-words">"{name}"</p>
              </div>
            </div>

            {/* Progress */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <motion.span key={msgI} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-slate-300 font-medium">
                  {LOAD_MSGS[msgI]}
                </motion.span>
                <span className="text-slate-500 tabular-nums font-mono">{pct}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800/80 overflow-hidden">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  style={{ boxShadow: '0 0 12px rgba(16,185,129,0.45)' }} />
              </div>
            </div>

            {/* Checklist building up */}
            <div className="space-y-3 glass-card rounded-2xl p-5">
              {LOAD_MSGS.map((msg, i) => {
                if (i > msgI) return null;
                const done   = i < msgI;
                const active = i === msgI;
                return (
                  <motion.div key={msg} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                    className="flex items-center gap-3 text-sm">
                    {done
                      ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                      : <motion.div animate={{ opacity: [1, 0.35, 1] }} transition={{ duration: 1.1, repeat: Infinity }}
                          className="w-3.5 h-3.5 rounded-full border-2 border-emerald-500/70 shrink-0" />
                    }
                    <span className={done ? 'text-slate-500' : active ? 'text-slate-200 font-medium' : 'text-slate-500'}>
                      {msg}
                    </span>
                  </motion.div>
                );
              })}
            </div>

            {/* Partial result — score appears early while bar finishes */}
            {earlyResult && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.16,1,0.3,1] }}
                className="glass-card rounded-2xl p-5">
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-3">Vista previa — puntuación detectada</p>
                <div className="flex items-center gap-5">
                  <ScoreRing score={earlyResult.overall} />
                  <div className="flex-1 space-y-2">
                    {earlyResult.subs.slice(0, 2).map(({ label, score, Icon, clr }) => (
                      <SubScoreCard key={label} label={label} score={score} Icon={Icon} clr={clr} />
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

          </div>
        </motion.section>
      )}

      {/* ═══════════════════════════════════════════ RESULT */}
      {phase === 'result' && result && (
        <motion.section key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="relative px-5 py-16 pb-28 sm:pb-24 overflow-hidden">

          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/4 rounded-full blur-3xl" />
          </div>

          <div className="relative max-w-2xl mx-auto">

            {/* Back */}
            <button onClick={reset}
              className="flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-8 transition-colors group">
              <ChevronRight size={14} className="rotate-180 group-hover:-translate-x-0.5 transition-transform" />
              Analizar otro negocio
            </button>

            {/* Result card */}
            <motion.div initial={{ opacity: 0, y: 28, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: [0.16,1,0.3,1] }}
              className="rounded-3xl border border-slate-700/40 overflow-hidden"
              style={{ background: 'linear-gradient(160deg,rgba(14,22,38,0.98) 0%,rgba(7,12,20,1) 100%)' }}>

              {/* Card header */}
              <div className="px-7 pt-6 pb-5 border-b border-slate-800/50 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase tracking-[0.18em] font-semibold mb-1">Informe de Visibilidad</p>
                  <p className="text-white font-bold text-xl leading-snug">{result.name}</p>
                  <p className="text-slate-500 text-xs mt-0.5 flex items-center gap-1">
                    <MapPin size={10} />Google Maps · España
                  </p>
                </div>
                <span className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/25 text-amber-400 mt-1">
                  Mejorable
                </span>
              </div>

              <div className="p-7 space-y-8">

                {/* Score + subs */}
                <div className="flex flex-col sm:flex-row items-center gap-8">
                  <div className="flex flex-col items-center gap-2.5 shrink-0">
                    <ScoreRing score={result.overall} />
                    <div className="text-center">
                      <p className="text-white font-bold text-sm">Visibilidad Local</p>
                      <p className="text-slate-500 text-xs mt-0.5">4 factores analizados</p>
                    </div>
                  </div>
                  <div className="flex-1 grid grid-cols-2 gap-3 w-full">
                    {result.subs.map(({ label, score, Icon, clr }) => (
                      <SubScoreCard key={label} label={label} score={score} Icon={Icon} clr={clr} />
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div>
                  <p className="text-white font-bold text-base mb-4 flex items-center gap-2">
                    <Sparkles size={15} className="text-emerald-400" />
                    Tu Plan de Acción
                  </p>
                  <div className="space-y-2">
                    {result.actions.map(({ title, impact, time, diff }, i) => (
                      <motion.div key={title}
                        initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.2 + i * 0.08, duration: 0.35 }}
                        className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-700/30 bg-slate-800/30">
                        <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                        <span className="flex-1 text-slate-200 text-sm">{title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            impact === 'Alto' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                          }`}>{impact}</span>
                          <span className="text-[10px] text-slate-600 hidden sm:block">{time}</span>
                          <span className={`text-[10px] hidden sm:block ${diff === 'Fácil' ? 'text-emerald-400/60' : 'text-amber-400/60'}`}>{diff}</span>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Locked: full report CTA */}
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}
                  className="rounded-2xl border border-emerald-500/20 overflow-hidden relative">

                  {/* Blurred preview rows */}
                  <div className="px-6 pt-5 pb-2 space-y-2" aria-hidden="true">
                    {[
                      'Plan de contenido para los próximos 30 días',
                      'Análisis de 87 keywords locales',
                      'Estrategia de reseñas personalizada',
                      'Comparativa detallada con 3 competidores',
                    ].map((t) => (
                      <div key={t} className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-800/30">
                        <Lock size={13} className="text-slate-700 shrink-0" />
                        <span className="text-slate-500 text-sm select-none blur-[3px]">{t}</span>
                      </div>
                    ))}
                  </div>

                  {/* Gradient overlay */}
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent to-slate-950/80 pointer-events-none" />

                  {/* CTA box */}
                  <div className="px-6 pb-6 pt-4 relative z-10"
                    style={{ background: 'linear-gradient(160deg,rgba(16,185,129,0.08) 0%,rgba(8,14,26,0.99) 60%)' }}>
                    <div className="rounded-2xl border border-emerald-500/25 p-6 text-center space-y-4">
                      <div className="flex items-center justify-center gap-2.5 mb-1">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
                          <Lock size={14} className="text-emerald-400" />
                        </div>
                        <p className="text-white font-bold text-lg">Desbloquea el informe completo</p>
                      </div>
                      <p className="text-slate-400 text-sm max-w-sm mx-auto">
                        Accede a tu plan detallado con IA: keywords, estrategia de reseñas, comparativa de competidores y más.
                      </p>
                      <motion.button onClick={onUnlock} whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
                        className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base
                          bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
                          shadow-xl shadow-emerald-500/35 hover:shadow-emerald-500/55 transition-shadow">
                        <Zap size={16} fill="currentColor" />
                        Analizar mi negocio gratis — 7 días
                      </motion.button>
                      <p className="text-xs text-slate-500 flex items-center justify-center gap-1.5">
                        <Shield size={10} className="text-slate-600" />
                        Sin tarjeta · Cancela cuando quieras · 9,99€/mes después
                      </p>
                    </div>
                  </div>
                </motion.div>

              </div>
            </motion.div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

// ─── Primary CTA button ───────────────────────────────────────────────────────
const PrimaryBtn = memo(function PrimaryBtn({
  full = false, large = false, onClick,
}: { full?: boolean; large?: boolean; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <motion.button onClick={onClick} whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}
      className={`${full ? 'w-full' : ''} inline-flex items-center justify-center gap-2.5
        ${large ? 'px-10 py-5 text-lg' : 'px-8 py-4 text-base'} rounded-xl font-bold
        bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950
        shadow-xl shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-shadow duration-200`}>
      <Zap size={large ? 18 : 16} fill="currentColor" />
      {t('lp_cta_analyze')}
    </motion.button>
  );
});

// ─── Main landing page ─────────────────────────────────────────────────────────
export default function LandingPage({ onLoginClick, onSubscribeClick }: LandingPageProps) {
  const { t } = useI18n();
  const [legalModal, setLegalModal] = useState<LegalModal>(null);
  const [analysisPhase, setAnalysisPhase] = useState<VPhase>('idle');
  const pricingRef = useRef<HTMLDivElement>(null);
  const demoRef    = useRef<HTMLElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    track('page_view', {
      page: 'landing',
      path: window.location.pathname,
      referrer: document.referrer || null,
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
      utm_content: params.get('utm_content'),
      utm_term: params.get('utm_term'),
    });
  }, []);

  const STEPS = useMemo(() => [
    { n: '01', icon: Search,     title: t('landing_step_1_title'), desc: t('landing_step_1_desc') },
    { n: '02', icon: Sparkles,   title: t('landing_step_2_title'), desc: t('landing_step_2_desc') },
    { n: '03', icon: TrendingUp, title: t('landing_step_3_title'), desc: t('landing_step_3_desc') },
  ], [t]);

  const METRICS = useMemo(() => [
    { target: 38, label: t('landing_metric_calls'),   sub: t('landing_metric_calls_sub'),   color: 'emerald' as const, icon: Globe      },
    { target: 24, label: t('landing_metric_visits'),  sub: t('landing_metric_visits_sub'),  color: 'sky'     as const, icon: TrendingUp },
    { target: 17, label: t('landing_metric_routes'),  sub: t('landing_metric_routes_sub'),  color: 'violet'  as const, icon: MapPin     },
  ], [t]);

  const MCLS = useMemo(() => ({
    emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'border-emerald-500/20' },
    sky:     { text: 'text-sky-400',     bg: 'bg-sky-500/10',     ring: 'border-sky-500/20'     },
    violet:  { text: 'text-violet-400',  bg: 'bg-violet-500/10',  ring: 'border-violet-500/20'  },
  }), []);

  const testimonials = useMemo(() => [
    { name: t('t1_name'), role: t('t1_role'), city: t('t1_city'), stars: 5, metric: t('t1_metric'), text: t('t1_text'),
      photo: 'https://images.pexels.com/photos/1681010/pexels-photo-1681010.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop', initials: 'JM' },
    { name: t('t2_name'), role: t('t2_role'), city: t('t2_city'), stars: 5, metric: t('t2_metric'), text: t('t2_text'),
      photo: 'https://images.pexels.com/photos/1181690/pexels-photo-1181690.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop', initials: 'AC' },
    { name: t('t3_name'), role: t('t3_role'), city: t('t3_city'), stars: 5, metric: t('t3_metric'), text: t('t3_text'),
      photo: 'https://images.pexels.com/photos/614810/pexels-photo-614810.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop', initials: 'DR' },
    { name: t('t4_name'), role: t('t4_role'), city: t('t4_city'), stars: 5, metric: t('t4_metric'), text: t('t4_text'),
      photo: 'https://images.pexels.com/photos/1239291/pexels-photo-1239291.jpeg?auto=compress&cs=tinysrgb&w=80&h=80&dpr=1&fit=crop', initials: 'MI' },
  ], [t]);

  const faqs = useMemo(() => [
    { q: t('lp_faq1_q'), a: t('lp_faq1_a') },
    { q: t('lp_faq2_q'), a: t('lp_faq2_a') },
    { q: t('lp_faq3_q'), a: t('lp_faq3_a') },
    { q: t('lp_faq4_q'), a: t('lp_faq4_a') },
    { q: t('lp_faq5_q'), a: t('lp_faq5_a') },
  ], [t]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-x-hidden pb-20 sm:pb-0">

      {/* ════════════════════════════ INTERACTIVE HERO (VisibilityChecker) */}
      <VisibilityChecker onUnlock={onSubscribeClick} onPhaseChange={setAnalysisPhase} />

      {/* ══════════════════════════════════════════════ CÓMO FUNCIONA */}
      <section className="py-28 px-5 border-t border-slate-800/40">
        <div className="max-w-4xl mx-auto">
          <Rev className="text-center mb-16">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-[0.2em] mb-4">{t('lp_section_process')}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {t('lp_howto_title')}
            </h2>
            <p className="text-slate-400 text-base mt-3">{t('lp_howto_more')}</p>
          </Rev>

          <Rev stagger className="grid grid-cols-1 sm:grid-cols-3 gap-10 relative">
            <div className="hidden sm:block absolute top-8 left-[calc(16.66%+1.5rem)] right-[calc(16.66%+1.5rem)] h-px bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/20" />
            {STEPS.map(({ n, icon: Icon, title, desc }, i) => (
              <motion.div key={n} variants={FU} className="flex flex-col items-center text-center gap-5">
                <motion.div whileHover={{ scale: 1.08 }} className="relative">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center">
                    <Icon size={24} className="text-emerald-400" />
                  </div>
                  <span className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-emerald-500 text-slate-950 text-xs font-black flex items-center justify-center">
                    {i + 1}
                  </span>
                </motion.div>
                <div>
                  <p className="text-white font-bold text-lg mb-2">{title}</p>
                  <p className="text-slate-500 text-sm">{desc}</p>
                </div>
              </motion.div>
            ))}
          </Rev>

          <Rev delay={0.2} className="text-center mt-14">
            <PrimaryBtn onClick={onSubscribeClick} />
          </Rev>
        </div>
      </section>

      {/* ════════════════════════════════ DEMO INTERACTIVA */}
      <section ref={demoRef as React.RefObject<HTMLElement>} id="demo-section"
        className="py-28 px-5 bg-slate-900/30 border-y border-slate-800/40">
        <div className="max-w-5xl mx-auto">
          <Rev className="text-center mb-12">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-[0.2em] mb-4">{t('lp_demo_badge')}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
              {t('lp_demo_title')}
            </h2>
            <p className="text-slate-400 text-base max-w-md mx-auto">
              {t('lp_demo_sub')}
            </p>
          </Rev>
          <Rev>
            <ToolTrialSection onLoginClick={onLoginClick} />
          </Rev>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════ RESULTADOS */}
      <section className="py-28 px-5">
        <div className="max-w-5xl mx-auto">
          <Rev className="text-center mb-14">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-[0.2em] mb-4">{t('lp_results_badge')}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {t('lp_results_title')}
            </h2>
          </Rev>

          <Rev stagger className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {METRICS.map(({ target, label, sub, color, icon: Icon }) => {
              const c = MCLS[color];
              return (
                <motion.div key={label} variants={FU} whileHover={HCARD}
                  className={`rounded-2xl border ${c.ring} p-8 text-center cursor-default`}
                  style={{ background: 'linear-gradient(145deg,rgba(15,23,42,0.9) 0%,rgba(8,14,26,0.97) 100%)' }}>
                  <div className={`w-12 h-12 rounded-2xl ${c.bg} border ${c.ring} flex items-center justify-center mx-auto mb-5`}>
                    <Icon size={20} className={c.text} />
                  </div>
                  <MetricCounter target={target} cls={`text-5xl font-black mb-2 block ${c.text}`} />
                  <p className="text-white font-bold text-lg mb-1">{label}</p>
                  <p className="text-slate-500 text-sm leading-snug">{sub}</p>
                </motion.div>
              );
            })}
          </Rev>
        </div>
      </section>

      {/* ══════════════════════════════════════════════ TESTIMONIOS */}
      <section className="py-28 px-5 bg-slate-900/30 border-y border-slate-800/40">
        <div className="max-w-5xl mx-auto">
          <Rev className="text-center mb-14">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-[0.2em] mb-4">{t('lp_trust_badge')}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              {t('lp_trust_title')}
            </h2>
          </Rev>

          <Rev stagger className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {testimonials.map((testimonial, i) => (
              <motion.div key={i} variants={FU} whileHover={HCARD}
                className="rounded-2xl border border-slate-800/60 p-7 flex flex-col gap-5 cursor-default"
                style={{ background: 'linear-gradient(145deg,rgba(15,23,42,0.82) 0%,rgba(8,14,26,0.95) 100%)' }}>
                <div className="flex items-center justify-between">
                  <div className="flex gap-0.5">
                    {Array.from({ length: testimonial.stars }).map((_, j) => (
                      <Star key={j} size={13} className="text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-emerald-400">
                    {testimonial.metric}
                  </span>
                </div>
                <p className="text-slate-200 text-base leading-relaxed flex-1">"{testimonial.text}"</p>
                <div className="flex items-center gap-3.5 pt-4 border-t border-slate-800/50">
                  <img src={testimonial.photo} alt={testimonial.name} loading="lazy" width={40} height={40}
                    className="w-10 h-10 rounded-full object-cover border-2 border-slate-700/60" />
                  <div>
                    <p className="text-white font-bold text-sm">{testimonial.name}</p>
                    <p className="text-slate-500 text-xs">{testimonial.role} · {testimonial.city}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </Rev>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════ PRICING */}
      <section ref={pricingRef} id="pricing" className="py-28 px-5">
        <div className="max-w-sm mx-auto">
          <Rev className="text-center mb-10">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-[0.2em] mb-4">{t('lp_pricing_badge')}</p>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-3">
              {t('lp_pricing_title')}
            </h2>
            <p className="text-slate-400 text-base">{t('lp_pricing_sub')}</p>
          </Rev>

          <Rev>
            <motion.div whileHover={{ scale: 1.01, y: -2 }}
              className="rounded-2xl border border-emerald-500/25 overflow-hidden"
              style={{ background: 'linear-gradient(160deg,rgba(16,185,129,0.08) 0%,rgba(8,14,26,1) 60%)' }}>
              <div className="h-[2px] bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400" />
              <div className="p-8">
                <div className="flex items-end gap-2 mb-1">
                  <span className="text-5xl font-extrabold text-white">{t('lp_pricing_price')}</span>
                  <span className="text-slate-400 mb-2">{t('lp_pricing_per_mo')}</span>
                </div>
                <p className="text-slate-500 text-sm mb-7">{t('lp_pricing_plan_sub')}</p>
                <div className="space-y-2.5 mb-8">
                  {[
                    t('lp_pricing_f1'),
                    t('lp_pricing_f2'),
                    t('lp_pricing_f3'),
                    t('lp_pricing_f4'),
                    t('lp_pricing_f5'),
                    t('lp_pricing_f6'),
                  ].map((f) => (
                    <div key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                      <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />{f}
                    </div>
                  ))}
                </div>
                <PrimaryBtn onClick={onSubscribeClick} full />
                <p className="text-center text-xs text-slate-500 mt-3 flex items-center justify-center gap-1.5">
                  <Shield size={10} className="text-slate-600" />{t('lp_pricing_secure')}
                </p>
              </div>
            </motion.div>
          </Rev>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════ FAQ */}
      <section className="py-24 px-5 bg-slate-900/30 border-y border-slate-800/40">
        <div className="max-w-2xl mx-auto">
          <Rev className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-white tracking-tight">{t('lp_faq_title_new')}</h2>
          </Rev>
          <Rev className="space-y-2">
            {faqs.map((f, i) => <FAQItem key={i} q={f.q} a={f.a} />)}
          </Rev>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════ CTA FINAL */}
      <section className="py-32 px-5 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/30 to-slate-950" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-emerald-500/6 rounded-full blur-3xl" />
        </div>
        <div className="max-w-xl mx-auto text-center relative">
          <Rev className="space-y-7">
            <span className="inline-flex items-center gap-2 rounded-full bg-orange-500/10 border border-orange-500/25 px-4 py-2 text-xs font-semibold text-orange-400">
              <Flame size={12} />{t('lp_cta_badge')}
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white leading-[1.08] tracking-tight">
              {t('lp_cta_title')}
            </h2>
            <p className="text-slate-400 text-lg max-w-md mx-auto">
              {t('lp_cta_sub')}
            </p>
            <PrimaryBtn onClick={onSubscribeClick} large />
            <div className="flex items-center justify-center gap-6 pt-1">
              {[t('lp_cta_trust1'), t('lp_cta_trust2'), t('lp_cta_trust3')].map((item) => (
                <span key={item} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Check size={11} className="text-emerald-500" />{item}
                </span>
              ))}
            </div>
          </Rev>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════ FOOTER */}
      <footer className="border-t border-slate-800/50 py-10 px-5">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-2.5">
            <LogoIcon size={20} />
            <span className="text-white font-bold text-sm">LocalSEOHub.io</span>
            <span className="text-slate-700 text-xs">© 2026</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1">
            <button onClick={() => onLoginClick()}
              className="px-4 py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors">
              {t('lp_footer_login')}
            </button>
            <span className="text-slate-700">·</span>
            {([
              { label: t('lp_footer_privacy'), modal: 'privacy' as const },
              { label: t('lp_footer_terms'),   modal: 'terms'   as const },
              { label: t('lp_footer_contact'),  modal: 'contact' as const },
            ]).map(({ label, modal }, i, a) => (
              <React.Fragment key={label}>
                <button onClick={() => setLegalModal(modal)}
                  className="px-4 py-2 text-sm text-slate-500 hover:text-slate-300 transition-colors">
                  {label}
                </button>
                {i < a.length - 1 && <span className="text-slate-700">·</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      </footer>

      {/* ═══════════════════════════ MOBILE STICKY CTA — hidden during analysis */}
      {analysisPhase === 'idle' && (
      <div className="fixed bottom-0 inset-x-0 z-50 sm:hidden">
        <div className="px-4 pt-3 pb-5 bg-slate-950/96 backdrop-blur-md border-t border-slate-800/70">
          <motion.button onClick={onSubscribeClick} whileTap={{ scale: 0.97 }}
            className="w-full flex items-center justify-center gap-2.5 py-4 rounded-xl font-bold text-base
              bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 shadow-xl shadow-emerald-500/25">
            <Zap size={16} fill="currentColor" />
            {t('lp_cta_analyze')}
          </motion.button>
          <p className="text-center text-xs text-slate-500 mt-2">{t('lp_cta_mobile_sub')}</p>
        </div>
      </div>
      )}

      {legalModal === 'privacy' && <PrivacyModal onClose={() => setLegalModal(null)} />}
      {legalModal === 'terms'   && <TermsModal   onClose={() => setLegalModal(null)} />}
      {legalModal === 'contact' && <ContactModal onClose={() => setLegalModal(null)} />}
    </div>
  );
}
