import { MapPin, Zap, TrendingUp, Shield, Star, Check, ArrowRight, Sparkles } from 'lucide-react';
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

  const TESTIMONIALS = [
    { name: 'Marta G.',  city: 'Toledo',   business: 'Cerámica artesanal',    text: 'En 2 semanas tripli​qué las visitas a mi tienda de Etsy. No sabía nada de SEO.', stars: 5 },
    { name: 'Carlos R.', city: 'Valencia', business: 'Reparación de móviles', text: 'Mi Google Business aparece ahora en el top 3 de Valencia. Increíble herramienta.', stars: 5 },
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
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-emerald-500/5 rounded-full blur-3xl" />
          <div className="absolute top-20 left-1/4 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl" />
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

      {/* Benefits */}
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

      {/* Testimonials */}
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

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">{t('landing_pricing_title')}</h2>
          <p className="text-slate-400">{t('landing_pricing_sub')}</p>
        </div>

        <div className="flex justify-center">
          <div className="relative w-full max-w-sm">
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
                  <span className="text-slate-400 mb-2">{t('landing_plan_price').replace('9,99 ', '').replace('9.99/', '/').replace('€/mes','€/mes').replace('€/mo','€/mo')}</span>
                </div>
                <p className="text-slate-500 text-xs mt-1">{t('landing_plan_billing')}</p>
              </div>

              <ul className="space-y-3 mb-8">
                {FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm text-slate-300">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={11} className="text-emerald-400" />
                    </div>
                    {feature}
                  </li>
                ))}
              </ul>

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

      {/* Final CTA */}
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
        </div>
      </section>

      {/* Footer */}
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
