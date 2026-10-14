import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, Building2, Check, Copy, FileText, Globe, Loader2, MapPin, RefreshCw, Share2,
  Sparkles, Store, Wrench, Info,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useBusiness } from '../business-memory/BusinessContext';
import { COPY } from './copy';
import {
  MAX_TOPIC_CHARS, SEO_FORMATS, SeoError, generateSeo, loadSeoUsage,
  type SeoErrorCode, type SeoFormat, type SeoResult, type SeoUsage,
} from './repository';

const FORMAT_ICONS: Record<SeoFormat, ReactNode> = {
  google_post: <MapPin size={16} />,
  web_text: <Globe size={16} />,
  social_post: <Share2 size={16} />,
  service_description: <Wrench size={16} />,
};

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-v2-lg bg-v2-primary-600 px-4 py-2.5 text-v2-sm font-semibold text-white hover:bg-v2-primary-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none';
const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none';

function resultToText(r: SeoResult): string {
  return [r.title, r.content, r.cta, r.hashtags.join(' ')].filter(Boolean).join('\n\n');
}

function ContextItem({ icon, label, value, empty }: { icon: ReactNode; label: string; value: string; empty: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-8 h-8 shrink-0 rounded-v2-md bg-white border border-v2-border-light text-v2-primary-600 flex items-center justify-center">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary">{label}</p>
        <p className={`text-v2-sm truncate ${value ? 'text-v2-text-primary font-medium' : 'text-v2-warning-600'}`}>{value || empty}</p>
      </div>
    </div>
  );
}

export default function SeoGeneratorPage() {
  const { lang } = useI18n();
  const t = lang === 'en' ? COPY.en : COPY.es;
  const navigate = useNavigate();
  const { currentBusiness, loading: businessLoading, error: businessError } = useBusiness();

  const [format, setFormat] = useState<SeoFormat>('google_post');
  const [topic, setTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<SeoResult | null>(null);
  const [error, setError] = useState<SeoErrorCode | null>(null);
  const [usage, setUsage] = useState<SeoUsage | null>(null);
  const [usageFailed, setUsageFailed] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const refreshUsage = useCallback(async () => {
    const u = await loadSeoUsage();
    setUsage(u);
    setUsageFailed(u === null);
  }, []);

  useEffect(() => { void refreshUsage(); }, [refreshUsage]);

  const name = currentBusiness?.name?.trim() ?? '';
  const category = currentBusiness?.category?.trim() ?? '';
  const city = currentBusiness?.city?.trim() ?? '';
  const missingBasics = !name || !category || !city;
  const atLimit = usage !== null && (usage.used >= usage.limit || usage.globalUsed >= usage.globalLimit);
  const topicTooLong = topic.trim().length > MAX_TOPIC_CHARS;

  const generate = async () => {
    if (!currentBusiness || generating) return;
    setGenerating(true);
    setError(null);
    setCopyState('idle');
    try {
      const r = await generateSeo({ businessId: currentBusiness.id, format, topic, lang });
      setResult(r);
    } catch (e) {
      setError(e instanceof SeoError ? e.code : 'unavailable');
    } finally {
      setGenerating(false);
      void refreshUsage();
    }
  };

  const onCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(resultToText(result));
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
    }
  };

  if (businessLoading) {
    return (
      <div className="flex items-center gap-2 text-v2-sm text-v2-text-secondary py-12 justify-center">
        <Loader2 size={16} className="animate-spin" /> {t.loading}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to="/herramientas" className="inline-flex items-center gap-1 text-v2-xs font-medium text-v2-text-tertiary hover:text-v2-primary-600 transition-colors">
          <ArrowLeft size={13} /> {t.back}
        </Link>
        <div className="mt-3 flex items-start gap-3">
          <div className="w-11 h-11 shrink-0 rounded-v2-lg bg-v2-primary-600 text-white flex items-center justify-center shadow-sm">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{t.title}</h1>
            <p className="text-v2-sm text-v2-text-secondary mt-1">{t.subtitle}</p>
          </div>
        </div>
      </div>

      {!currentBusiness || businessError ? (
        <div className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3 text-v2-sm text-v2-error-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {t.noBusiness}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          <section className="lg:col-span-2 space-y-5 rounded-v2-xl border border-v2-border-light bg-white p-5">
            <div className="rounded-v2-lg border border-v2-primary-100 bg-v2-primary-50/60 p-4">
              <p className="flex items-start gap-2 text-v2-xs text-v2-text-secondary leading-relaxed">
                <Info size={14} className="text-v2-primary-600 mt-0.5 shrink-0" /> {t.contextTitle}
              </p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-3">
                <ContextItem icon={<Store size={14} />} label={t.business} value={name} empty={t.notSet} />
                <ContextItem icon={<Building2 size={14} />} label={t.activity} value={category} empty={t.notSet} />
                <ContextItem icon={<MapPin size={14} />} label={t.city} value={city} empty={t.notSet} />
              </div>
              {missingBasics ? (
                <div className="mt-3 rounded-v2-md border border-v2-warning-200 bg-v2-warning-50 px-3 py-2">
                  <p className="text-v2-xs text-v2-warning-700">{t.missingNote}</p>
                  <button type="button" onClick={() => navigate('/negocio')} className={`${btnSecondary} mt-2`}>{t.goToBusiness}</button>
                </div>
              ) : (
                <Link to="/negocio" className="mt-3 inline-block text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700">{t.editBusiness}</Link>
              )}
            </div>

            <fieldset>
              <legend className="text-v2-sm font-semibold text-v2-text-primary">{t.formatLabel}</legend>
              <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-2" role="radiogroup">
                {SEO_FORMATS.map((f) => {
                  const active = f === format;
                  return (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-testid="seo-format"
                      onClick={() => setFormat(f)}
                      className={`flex items-start gap-2.5 rounded-v2-lg border p-3 text-left transition-all duration-150 ${active
                        ? 'border-v2-primary-500 bg-v2-primary-50 ring-1 ring-v2-primary-500'
                        : 'border-v2-border-light bg-white hover:border-v2-primary-200'}`}
                    >
                      <span className={`mt-0.5 shrink-0 ${active ? 'text-v2-primary-600' : 'text-v2-text-tertiary'}`}>{FORMAT_ICONS[f]}</span>
                      <span className="min-w-0">
                        <span className="block text-v2-sm font-medium text-v2-text-primary leading-snug">{t.formats[f].label}</span>
                        <span className="block text-[11px] text-v2-text-tertiary mt-0.5">{t.formats[f].hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <label htmlFor="seo-topic" className="text-v2-sm font-semibold text-v2-text-primary">{t.topicLabel}</label>
                <span className="text-[11px] text-v2-text-tertiary">{t.topicOptional}</span>
              </div>
              <textarea
                id="seo-topic"
                rows={3}
                value={topic}
                maxLength={MAX_TOPIC_CHARS}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={t.topicPlaceholder}
                className="mt-2 w-full resize-none rounded-v2-lg border border-v2-border-light bg-white px-3 py-2.5 text-v2-sm text-v2-text-primary placeholder:text-v2-text-tertiary focus:border-v2-primary-400 focus:outline-none focus:ring-2 focus:ring-v2-primary-100 transition-colors"
              />
              <p className={`mt-1 text-right text-[11px] ${topicTooLong ? 'text-v2-error-600' : 'text-v2-text-tertiary'}`}>
                {t.topicCount(topic.trim().length, MAX_TOPIC_CHARS)}
              </p>
            </div>

            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => void generate()}
                disabled={generating || missingBasics || atLimit || topicTooLong}
                className={`${btnPrimary} w-full`}
              >
                {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                {generating ? t.generating : t.generate}
              </button>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-v2-text-tertiary">{t.costNote}</span>
                {usage ? (
                  <span data-testid="seo-usage" className={`font-medium ${atLimit ? 'text-v2-error-600' : 'text-v2-text-secondary'}`}>
                    {t.usage(usage.used, usage.limit)}
                  </span>
                ) : usageFailed ? (
                  <span className="text-v2-text-tertiary">{t.usageUnavailable}</span>
                ) : null}
              </div>
            </div>
          </section>

          <section className="lg:col-span-3 rounded-v2-xl border border-v2-border-light bg-white p-5 min-h-[320px] flex flex-col" aria-live="polite">
            {error && (
              <div className="mb-4 flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3">
                <AlertCircle size={16} className="mt-0.5 shrink-0 text-v2-error-600" />
                <div className="text-v2-sm text-v2-error-600">
                  <p>{t.errors[error]}</p>
                  {error === 'profile_incomplete' && (
                    <button type="button" onClick={() => navigate('/negocio')} className={`${btnSecondary} mt-2`}>{t.goToBusiness}</button>
                  )}
                  {error === 'premium_required' && (
                    <button type="button" onClick={() => navigate('/facturacion')} className={`${btnSecondary} mt-2`}>{t.premiumCta}</button>
                  )}
                </div>
              </div>
            )}

            {generating && !result ? (
              <div className="flex-1 space-y-3 animate-pulse" aria-label={t.generating}>
                <div className="h-5 w-2/3 rounded bg-v2-neutral-100" />
                <div className="h-3 w-full rounded bg-v2-neutral-100" />
                <div className="h-3 w-11/12 rounded bg-v2-neutral-100" />
                <div className="h-3 w-4/5 rounded bg-v2-neutral-100" />
                <div className="h-3 w-3/5 rounded bg-v2-neutral-100" />
              </div>
            ) : result ? (
              <div className={`flex-1 flex flex-col transition-opacity duration-200 ${generating ? 'opacity-50' : 'opacity-100'}`}>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-v2-base font-semibold text-v2-text-primary">{t.resultTitle}</h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-v2-primary-50 px-2 py-0.5 text-[11px] font-medium text-v2-primary-700">
                    {FORMAT_ICONS[format]} {t.formats[format].label}
                  </span>
                </div>

                {result.title && (
                  <div className="mt-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary">{t.suggestedTitle}</p>
                    <p className="mt-1 text-v2-lg font-semibold text-v2-text-primary leading-tight">{result.title}</p>
                  </div>
                )}

                <div className="mt-4 whitespace-pre-line text-v2-sm text-v2-text-primary leading-relaxed">{result.content}</div>

                {result.cta && (
                  <div className="mt-4 rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-3 py-2">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary">{t.cta}</p>
                    <p className="mt-0.5 text-v2-sm font-medium text-v2-text-primary">{result.cta}</p>
                  </div>
                )}

                {result.hashtags.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary">{t.hashtags}</p>
                    <p className="mt-1 text-v2-sm text-v2-primary-700">{result.hashtags.join(' ')}</p>
                  </div>
                )}

                {result.keywords.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary">{t.keywords}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {result.keywords.map((k) => (
                        <span key={k} className="rounded-full border border-v2-border-light bg-white px-2.5 py-0.5 text-[11px] text-v2-text-secondary">{k}</span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-5 flex items-center gap-1.5 text-[11px] text-v2-text-tertiary">
                  <Info size={12} /> {t.disclaimer}
                </p>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-v2-border-light pt-4">
                  <button type="button" onClick={() => void onCopy()} disabled={generating} className={btnSecondary}>
                    {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
                    {copyState === 'copied' ? t.copied : t.copy}
                  </button>
                  <button
                    type="button"
                    onClick={() => void generate()}
                    disabled={generating || missingBasics || atLimit || topicTooLong}
                    className={btnSecondary}
                  >
                    {generating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} {t.another}
                  </button>
                </div>
                {copyState === 'failed' && <p className="mt-2 text-[11px] text-v2-error-600">{t.copyFailed}</p>}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-10">
                <div className="w-12 h-12 rounded-full bg-v2-primary-50 text-v2-primary-600 flex items-center justify-center">
                  <Sparkles size={20} />
                </div>
                <p className="mt-3 text-v2-sm font-semibold text-v2-text-primary">{t.emptyTitle}</p>
                <p className="mt-1 max-w-sm text-v2-xs text-v2-text-secondary leading-relaxed">{t.emptyBody}</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
