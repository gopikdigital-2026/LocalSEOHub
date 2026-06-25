import {
  MapPin, Zap, TrendingUp, Shield, Star, Check, ArrowRight, Sparkles,
  Eye, Globe, Target, Calendar, MapPinned, ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { useI18n } from '../lib/i18n';
import { PrivacyModal, TermsModal, ContactModal, type LegalModal } from './LegalModals';
import { LogoIcon } from './Logo';

interface LandingPageProps {
  onLoginClick: () => void;
  onSubscribeClick: () => void;
  scrollToPricing?: boolean;
}

export default function LandingPage({ onLoginClick, onSubscribeClick }: LandingPageProps) {
  const { t } = useI18n();
  const [legalModal, setLegalModal] = useState<LegalModal>(null);

  const BENEFITS = [
    { icon: <MapPin size={20} />,    title: t('landing_f1_title'), desc: t('landing_f1_desc') },
    { icon: <TrendingUp size={20} />, title: t('landing_f2_title'), desc: t('landing_f2_desc') },
    { icon: <Zap size={20} />,        title: t('landing_f3_title'), desc: t('landing_f3_desc') },
    { icon: <Shield size={20} />,     title: t('landing_f4_title'), desc: t('landing_f4_desc') },
  ];

  const TOOLS = [
    { icon: <Sparkles size={22} />, title: t('landing_tool_1_title'), desc: t('landing_tool_1_desc'), badge: 'Core' },
    { icon: <MapPinned size={22} />, title: t('landing_tool_2_title'), desc: t('landing_tool_2_desc'), badge: 'Maps' },
    { icon: <Eye size={22} />,       title: t('landing_tool_3_title'), desc: t('landing_tool_3_desc'), badge: 'Twin' },
    { icon: <Target size={22} />,    title: t('landing_tool_4_title'), desc: t('landing_tool_4_desc'), badge: 'Radar' },
    { icon: <Globe size={22} />,     title: t('landing_tool_5_title'), desc: t('landing_tool_5_desc'), badge: 'GEO' },
    { icon: <Calendar size={22} />,  title: t('landing_tool_6_title'), desc: t('landing_tool_6_desc'), badge: 'Plan' },
  ];

  const STEPS = [
    { num: '01', title: t('landing_step_1_title'), desc: t('landing_step_1_desc') },
    { num: '02', title: t('landing_step_2_title'), desc: t('landing_step_2_desc') },
    { num: '03', title: t('landing_step_3_title'), desc: t('landing_step_3_desc') },
  ];

  const TESTIMONIALS = [
    { name: 'Marta G.',  city: 'Toledo',   business: 'Cerámica artesanal',    text: 'En 2 semanas tripliqué las visitas a mi tienda de Etsy. No sabía nada de SEO.', stars: 5 },
    { name: 'Carlos R.', city: 'Valencia', business: 'Reparación de móviles', text: 'Mi Google Business aparece ahora en el top 3 de Valencia. El escáner de Maps es una pasada.', stars: 5 },
    { name: 'Laura M.',  city: 'Sevilla',  business: 'Floristería online',     text: 'Genera en 30 segundos lo que antes me costaba horas escribir. Vale cada euro.', stars: 5 },
  ];

  const FEATURES = [
    t('landing_feature_1'),
    t('landing_feature_2'),
    t('landing_feature_3'),
    t('landing_feature_4'),
    t('landing_feature_5'),
    t('landing_feature_6'),
    t('landing_feature_7'),
    t('landing_feature_8'),
    t('landing_feature_9'),
    t('landing_feature_10'),
    t('landing_feature_11'),
  ];

  const PLATFORMS = ['Etsy', 'Shopify', 'Amazon', 'Google Business', 'Wallapop', 'Vinted', 'eBay', 'Instagram', 'TripAdvisor', 'Booking.com', 'WooCommerce', 'Doctoralia', 'Habitissimo', 'Treatwell', 'Facebook Marketplace', 'Web propia'];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* ── Hero ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute top-20 left-1/4 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-48 h-48 bg-emerald-600/4 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto px-6 pt-20 pb-24 text-center relative">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 text-xs font-medium text-emerald-400 mb-8">
            <Sparkles size={12} />
            {t('landing_badge')}
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6 tracking-tight">
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              {t('landing_hero_title')}
            </span>
          </h1>

          <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('landing_hero_desc')}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={onLoginClick}
              className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all duration-300
                bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                text-slate-950 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0"
            >
              {t('landing_cta_start')}
              <ArrowRight size={18} />
            </button>
            <p className="text-xs text-slate-600">{t('landing_cta_cancel')}</p>
          </div>

          <div className="flex items-center justify-center gap-6 mt-12 flex-wrap">
            <div className="flex items-center gap-1.5">
              {[...Array(5)].map((_, i) => (
                <Star key={i} size={14} className="text-amber-400 fill-amber-400" />
              ))}
              <span className="text-slate-400 text-sm ml-1">{t('landing_rating')}</span>
            </div>
            <div className="w-px h-4 bg-slate-700" />
            <span className="text-slate-400 text-sm">{t('landing_social_proof')}</span>
            <div className="w-px h-4 bg-slate-700 hidden sm:block" />
            <span className="text-slate-400 text-sm hidden sm:block">{t('landing_available')}</span>
          </div>
        </div>
      </section>

      {/* ── Platform strip ───────────────────────────────────── */}
      <section className="border-y border-slate-800/60 py-5 overflow-hidden">
        <div className="max-w-5xl mx-auto px-6">
          <p className="text-center text-xs text-slate-600 uppercase tracking-widest font-medium mb-4">Compatible con</p>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {PLATFORMS.map((p) => (
              <span key={p} className="text-slate-600 text-sm font-medium hover:text-slate-400 transition-colors">{p}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ─────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            {t('landing_features_title')}
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            {t('landing_features_sub')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="group rounded-2xl bg-slate-900/60 border border-slate-800/60 p-6 hover:border-emerald-500/20 hover:bg-slate-900/80 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-4 group-hover:bg-emerald-500/15 transition-colors">
                {b.icon}
              </div>
              <h3 className="font-semibold text-white mb-2">{b.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 6 Tools ──────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            {t('landing_tools_title')}
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            {t('landing_tools_sub')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TOOLS.map((tool) => (
            <div
              key={tool.title}
              className="group rounded-2xl bg-slate-900/60 border border-slate-800/60 p-6 hover:border-emerald-500/25 hover:bg-slate-900/90 transition-all duration-300 flex flex-col"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/15 transition-colors shrink-0">
                  {tool.icon}
                </div>
                <span className="text-xs font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/15 rounded-full px-2.5 py-0.5">
                  {tool.badge}
                </span>
              </div>
              <h3 className="font-semibold text-white mb-2 text-sm">{tool.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed flex-1">{tool.desc}</p>
              <div className="mt-4 flex items-center gap-1 text-emerald-500 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                <span>Incluido en el plan</span>
                <ChevronRight size={12} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            {t('landing_howto_title')}
          </h2>
          <p className="text-slate-400 max-w-lg mx-auto">
            {t('landing_howto_sub')}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 relative">
          <div className="hidden sm:block absolute top-8 left-[calc(16.66%+1rem)] right-[calc(16.66%+1rem)] h-px bg-gradient-to-r from-emerald-500/20 via-teal-500/20 to-emerald-500/20" />
          {STEPS.map((step, i) => (
            <div key={step.num} className="relative flex flex-col items-center text-center p-6">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold mb-4 z-10
                ${i === 1
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/30'
                  : 'bg-slate-900 border-2 border-slate-700 text-emerald-400'}`}
              >
                {step.num}
              </div>
              <h3 className="font-semibold text-white mb-2 text-sm">{step.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Testimonials ─────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold text-white mb-2">{t('landing_testimonials_title')}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {TESTIMONIALS.map((item) => (
            <div key={item.name} className="rounded-2xl bg-slate-900/60 border border-slate-800/60 p-5 space-y-3">
              <div className="flex gap-0.5">
                {[...Array(item.stars)].map((_, i) => (
                  <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
                ))}
              </div>
              <p className="text-slate-300 text-sm leading-relaxed">"{item.text}"</p>
              <div className="pt-1 border-t border-slate-800">
                <p className="text-white text-xs font-semibold">{item.name}</p>
                <p className="text-slate-500 text-xs">{item.business} · {item.city}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────── */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">{t('landing_pricing_title')}</h2>
          <p className="text-slate-400">{t('landing_pricing_sub')}</p>
        </div>

        <div className="flex justify-center">
          <div className="relative w-full max-w-md">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
              <span className="bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-bold px-4 py-1 rounded-full shadow-lg shadow-emerald-500/30">
                {t('landing_plan_badge')}
              </span>
            </div>

            <div className="rounded-2xl bg-slate-900 border-2 border-emerald-500/40 p-8 shadow-2xl shadow-emerald-500/10">
              <div className="text-center mb-6">
                <p className="text-slate-400 text-sm font-medium mb-2">{t('landing_plan_name')}</p>
                <div className="flex items-end justify-center gap-1">
                  <span className="text-5xl font-bold text-white">9.99</span>
                  <span className="text-slate-400 mb-2">€/mes</span>
                </div>
                <div className="inline-flex items-center gap-1.5 mt-2 bg-emerald-500/15 border border-emerald-500/25 rounded-full px-3 py-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-emerald-400 text-xs font-semibold">7 días gratis incluidos</span>
                </div>
                <p className="text-slate-500 text-xs mt-2">{t('landing_plan_billing')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-8">
                {FEATURES.map((feature) => (
                  <div key={feature} className="flex items-start gap-2.5 text-xs text-slate-300">
                    <div className="w-4 h-4 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={9} className="text-emerald-400" />
                    </div>
                    {feature}
                  </div>
                ))}
              </div>

              <button
                onClick={onSubscribeClick}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-sm transition-all duration-300
                  bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
                  text-slate-950 shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
              >
                <Sparkles size={15} />
                {t('landing_plan_cta')}
              </button>

              <p className="text-center text-xs text-slate-600 mt-3">
                {t('landing_plan_secure')}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20 p-10 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">
            {t('landing_bottom_title')}
          </h2>
          <p className="text-slate-400 mb-8 max-w-lg mx-auto">
            {t('landing_bottom_desc')}
          </p>
          <button
            onClick={onLoginClick}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all duration-300
              bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400
              text-slate-950 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5"
          >
            {t('landing_bottom_cta')}
            <ArrowRight size={18} />
          </button>
          <p className="text-xs text-slate-600 mt-4">{t('landing_cta_cancel')}</p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/50 py-6">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <LogoIcon size={22} />
            <span className="text-xs text-slate-600 font-medium">LocalSEO<span className="text-emerald-600">Hub</span></span>
          </div>
          <p className="text-xs text-slate-700">{t('landing_footer')}</p>
          <div className="flex items-center gap-4">
            <button onClick={() => setLegalModal('privacy')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              {t('footer_privacy')}
            </button>
            <button onClick={() => setLegalModal('terms')} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
              {t('footer_terms')}
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
