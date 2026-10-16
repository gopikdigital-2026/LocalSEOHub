import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, CalendarCheck, Check, Copy, FileText, Frown, HelpCircle, Info, Lightbulb, Loader2, Lock,
  MessagesSquare, PenLine, RefreshCw, Repeat, Scale, ShieldAlert, Shuffle, Sparkles, Tag, User, Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useBusiness } from '../business-memory/BusinessContext';
import { useBilling } from '../billing/BillingContext';
import { COPY, type SimulatorCopy } from './copy';
import {
  MAX_CUSTOM_CHARS, MIN_CUSTOM_CHARS, SCENARIOS, SimulatorError, loadSimulatorUsage, runSimulation, simulationToText,
  type Scenario, type Simulation, type SimulatorErrorCode, type SimulatorUsage,
} from './repository';

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-v2-lg bg-v2-primary-600 px-4 py-2.5 text-v2-sm font-semibold text-white hover:bg-v2-primary-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none';
const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none';
const label = 'text-[11px] font-semibold uppercase tracking-wide';

const ICONS: Record<Scenario, LucideIcon> = {
  general_inquiry: HelpCircle,
  price_request: Tag,
  price_objection: Scale,
  quote_request: FileText,
  undecided: Shuffle,
  booking: CalendarCheck,
  service_inquiry: Wrench,
  unhappy_customer: Frown,
  follow_up: Repeat,
  custom: PenLine,
};

function ResultCard({ sim, t }: { sim: Simulation; t: SimulatorCopy }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(simulationToText(sim, { customer: t.customerLabel, response: t.responseLabel }));
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div data-testid="voice-result" className="space-y-5 animate-[fadeIn_200ms_ease-out]">
      <div className="flex gap-3">
        <span className="w-8 h-8 shrink-0 rounded-full bg-v2-neutral-200 text-v2-text-secondary flex items-center justify-center"><User size={14} /></span>
        <div className="max-w-[90%]">
          <p className={`${label} text-v2-text-tertiary`}>{t.customerLabel}</p>
          <p className="mt-1 rounded-v2-xl rounded-tl-sm border border-dashed border-v2-border-light bg-white px-4 py-3 text-v2-sm text-v2-text-primary leading-relaxed">
            {sim.customer}
          </p>
        </div>
      </div>

      <div className="flex flex-row-reverse gap-3">
        <span className="w-8 h-8 shrink-0 rounded-full bg-v2-primary-600 text-white flex items-center justify-center"><Sparkles size={14} /></span>
        <div className="max-w-[90%] text-right">
          <p className={`${label} text-v2-primary-700`}>{t.responseLabel}</p>
          <p className="mt-1 rounded-v2-xl rounded-tr-sm border border-v2-primary-100 bg-v2-primary-50 px-4 py-3 text-left text-v2-sm text-v2-text-primary leading-relaxed">
            {sim.recommendedResponse}
          </p>
          <div className="mt-2 flex justify-end">
            <button type="button" onClick={() => void onCopy()} className={btnSecondary}>
              {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
              {copyState === 'copied' ? t.copied : t.copy}
            </button>
          </div>
          {copyState === 'failed' && <p className="mt-1 text-[11px] text-v2-error-600">{t.copyFailed}</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-v2-lg border border-v2-border-light bg-white p-4">
          <p className={`${label} text-v2-text-tertiary`}>{t.whyLabel}</p>
          <ul className="mt-2 space-y-1.5">
            {sim.whyItWorks.map((w, i) => (
              <li key={`${i}-${w}`} className="flex items-start gap-2 text-v2-sm text-v2-text-secondary leading-relaxed">
                <Check size={14} className="mt-0.5 shrink-0 text-v2-success-600" /> {w}
              </li>
            ))}
          </ul>
        </div>
        {sim.tip && (
          <div className="rounded-v2-lg border border-v2-warning-200 bg-v2-warning-50 p-4">
            <p className={`${label} text-v2-warning-700`}>{t.tipLabel}</p>
            <p className="mt-2 flex items-start gap-2 text-v2-sm text-v2-text-primary leading-relaxed">
              <Lightbulb size={14} className="mt-0.5 shrink-0 text-v2-warning-600" /> {sim.tip}
            </p>
          </div>
        )}
      </div>

      {sim.factsUsed.length > 0 && (
        <div>
          <p className={`${label} text-v2-text-tertiary`}>{t.factsLabel}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {sim.factsUsed.map((k) => (
              <span key={k} className="rounded-full bg-v2-neutral-100 px-2.5 py-1 text-[11px] font-medium text-v2-text-secondary">{t.facts[k]}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function VoiceSimulatorPage() {
  const { lang } = useI18n();
  const t = lang === 'en' ? COPY.en : COPY.es;
  const navigate = useNavigate();
  const { currentBusiness, loading: businessLoading, error: businessError } = useBusiness();
  const { hasPremium } = useBilling();

  const [scenario, setScenario] = useState<Scenario>('general_inquiry');
  const [customText, setCustomText] = useState('');
  const [result, setResult] = useState<Simulation | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<SimulatorErrorCode | null>(null);
  const [usage, setUsage] = useState<SimulatorUsage | null>(null);
  const [usageFailed, setUsageFailed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);

  const refreshUsage = useCallback(async () => {
    const u = await loadSimulatorUsage();
    setUsage(u);
    setUsageFailed(u === null);
  }, []);

  useEffect(() => {
    if (hasPremium) void refreshUsage();
  }, [refreshUsage, hasPremium]);

  const noContext = !currentBusiness?.name?.trim() && !currentBusiness?.category?.trim();
  const missingDetails = !currentBusiness?.services?.length || !currentBusiness?.schedule?.trim();
  const remaining = usage ? Math.max(0, Math.min(usage.limit - usage.used, usage.globalLimit - usage.globalUsed)) : null;
  const atLimit = remaining === 0;
  const trimmed = customText.trim();
  const tooLong = trimmed.length > MAX_CUSTOM_CHARS;
  const customMissing = scenario === 'custom' && trimmed.length < MIN_CUSTOM_CHARS;
  const canRun = !!hasPremium && !!currentBusiness && !running && !atLimit && !noContext && !tooLong && !customMissing;

  const generate = async () => {
    if (!currentBusiness || !canRun || inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    setError(null);
    try {
      const sim = await runSimulation({ businessId: currentBusiness.id, scenario, customText: trimmed, lang });
      setResult(sim);
      window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      setError(e instanceof SimulatorError ? e.code : 'unavailable');
    } finally {
      inFlight.current = false;
      setRunning(false);
      void refreshUsage();
    }
  };

  const pickExample = (ex: { text: string; scenario: Scenario }) => {
    setScenario(ex.scenario);
    setCustomText(ex.text);
    setError(null);
    inputRef.current?.focus();
  };

  if (businessLoading) {
    return (
      <div className="flex items-center gap-2 text-v2-sm text-v2-text-secondary py-12 justify-center">
        <Loader2 size={16} className="animate-spin" /> {t.loading}
      </div>
    );
  }

  const header = (
    <div>
      <Link to="/herramientas" className="inline-flex items-center gap-1 text-v2-xs font-medium text-v2-text-tertiary hover:text-v2-primary-600 transition-colors">
        <ArrowLeft size={13} /> {t.back}
      </Link>
      <div className="mt-3 flex items-start gap-3">
        <div className="w-11 h-11 shrink-0 rounded-v2-lg bg-v2-primary-600 text-white flex items-center justify-center shadow-sm">
          <MessagesSquare size={20} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{t.title}</h1>
            <span data-testid="voice-badge" className="inline-flex items-center gap-1 rounded-full border border-v2-primary-200 bg-v2-primary-50 px-2.5 py-0.5 text-[11px] font-semibold text-v2-primary-700">
              <Sparkles size={11} /> {t.badge}
            </span>
          </div>
          <p className="text-v2-sm text-v2-text-secondary mt-1">{t.subtitle}</p>
        </div>
      </div>
    </div>
  );

  if (hasPremium === null) {
    return <div className="space-y-6">{header}<p className="text-v2-sm text-v2-text-secondary">{t.billingUnknown}</p></div>;
  }

  if (!hasPremium) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-v2-xl border border-v2-border-light bg-white p-6 flex flex-col sm:flex-row sm:items-center gap-4" data-testid="voice-premium-gate">
          <span className="w-10 h-10 shrink-0 rounded-full bg-v2-neutral-100 text-v2-text-secondary flex items-center justify-center"><Lock size={18} /></span>
          <div className="flex-1">
            <p className="text-v2-base font-semibold text-v2-text-primary">{t.premiumTitle}</p>
            <p className="text-v2-sm text-v2-text-secondary mt-0.5">{t.premiumBody}</p>
          </div>
          <Link to="/facturacion" className={btnPrimary}>{t.premiumCta}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}

      {!currentBusiness || businessError ? (
        <div className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3 text-v2-sm text-v2-error-600">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {t.noBusiness}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          <section className="lg:col-span-2 space-y-5 rounded-v2-xl border border-v2-border-light bg-white p-5">
            <p className="text-v2-sm text-v2-text-secondary leading-relaxed">{t.intro}</p>

            <div>
              <p className="text-v2-sm font-semibold text-v2-text-primary">{t.scenarioTitle}</p>
              <div role="radiogroup" aria-label={t.scenarioTitle} className="mt-2.5 grid grid-cols-2 gap-2">
                {SCENARIOS.map((s) => {
                  const Icon = ICONS[s];
                  const active = s === scenario;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      data-testid="voice-scenario"
                      onClick={() => { setScenario(s); setError(null); }}
                      disabled={running}
                      className={`flex items-start gap-2 rounded-v2-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                        active ? 'border-v2-primary-400 bg-v2-primary-50 ring-1 ring-v2-primary-200' : 'border-v2-border-light bg-white hover:border-v2-primary-200 hover:bg-v2-neutral-50'
                      }`}
                    >
                      <Icon size={15} className={`mt-0.5 shrink-0 ${active ? 'text-v2-primary-600' : 'text-v2-text-tertiary'}`} />
                      <span className="min-w-0">
                        <span className={`block text-v2-xs font-semibold leading-snug ${active ? 'text-v2-primary-700' : 'text-v2-text-primary'}`}>{t.scenarios[s].label}</span>
                        <span className="block text-[11px] text-v2-text-tertiary leading-snug">{t.scenarios[s].hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor="voice-custom" className="text-v2-sm font-semibold text-v2-text-primary">
                {scenario === 'custom' ? t.customLabel : t.customLabelOptional}
              </label>
              <textarea
                id="voice-custom"
                ref={inputRef}
                rows={3}
                value={customText}
                maxLength={MAX_CUSTOM_CHARS}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder={t.placeholder}
                className="mt-2 w-full resize-none rounded-v2-lg border border-v2-border-light bg-white px-3 py-2.5 text-v2-sm text-v2-text-primary placeholder:text-v2-text-tertiary focus:border-v2-primary-400 focus:outline-none focus:ring-2 focus:ring-v2-primary-100 transition-colors"
              />
              <div className="mt-1 flex items-start justify-between gap-3 text-[11px]">
                <span className="flex items-start gap-1 text-v2-text-tertiary"><ShieldAlert size={12} className="mt-px shrink-0" /> {t.privacy}</span>
                <span className={tooLong ? 'text-v2-error-600' : 'text-v2-text-tertiary'}>{t.count(trimmed.length, MAX_CUSTOM_CHARS)}</span>
              </div>
            </div>

            <div>
              <p className="text-v2-xs font-medium text-v2-text-secondary">{t.examplesTitle}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {t.examples.map((ex) => (
                  <button
                    key={ex.text}
                    type="button"
                    data-testid="voice-example"
                    onClick={() => pickExample(ex)}
                    disabled={running}
                    className="inline-flex items-center gap-1.5 rounded-full border border-v2-border-light bg-white px-3 py-1.5 text-v2-xs text-v2-text-secondary hover:border-v2-primary-300 hover:bg-v2-primary-50 hover:text-v2-primary-700 transition-colors disabled:opacity-50"
                  >
                    <Lightbulb size={12} className="text-v2-primary-500" /> {ex.text}
                  </button>
                ))}
              </div>
            </div>

            {(noContext || missingDetails) && (
              <div className="rounded-v2-md border border-v2-warning-200 bg-v2-warning-50 px-3 py-2">
                <p className="text-v2-xs text-v2-warning-700">{noContext ? t.errors.profile_incomplete : t.missingNote}</p>
                <button type="button" onClick={() => navigate('/negocio')} className={`${btnSecondary} mt-2`}>{t.goToBusiness}</button>
              </div>
            )}

            <div className="rounded-v2-lg border border-v2-border-light px-4 py-3">
              {usage && remaining !== null ? (
                <>
                  <p data-testid="voice-usage" className={`text-v2-sm font-semibold ${atLimit ? 'text-v2-error-600' : 'text-v2-text-primary'}`}>
                    {t.usage(usage.used, usage.limit)}
                  </p>
                  <p className="mt-0.5 text-v2-xs text-v2-text-secondary">{atLimit ? t.limitReached : t.remaining(remaining)}</p>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-v2-neutral-100">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${atLimit ? 'bg-v2-error-500' : 'bg-v2-primary-500'}`}
                      style={{ width: `${Math.min(100, usage.limit ? (usage.used / usage.limit) * 100 : 100)}%` }}
                    />
                  </div>
                </>
              ) : usageFailed ? (
                <p className="text-v2-xs text-v2-text-tertiary">{t.usageUnavailable}</p>
              ) : (
                <div className="h-9 animate-pulse rounded bg-v2-neutral-100" />
              )}
            </div>

            <button type="button" data-testid="voice-generate" onClick={() => void generate()} disabled={!canRun} className={`${btnPrimary} w-full`}>
              {running ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {running ? t.generating : t.generate}
            </button>
          </section>

          <section ref={resultRef} className="lg:col-span-3 rounded-v2-xl border border-v2-border-light bg-v2-neutral-50/60 p-5 min-h-[420px] flex flex-col" aria-live="polite">
            <p className="flex items-start gap-2 rounded-v2-md border border-v2-border-light bg-white px-3 py-2 text-[11px] text-v2-text-secondary leading-relaxed">
              <Info size={13} className="mt-px shrink-0 text-v2-primary-600" /> {t.disclaimer}
            </p>

            {error && (
              <div className="mt-4 flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-3 py-2.5">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-v2-error-600" />
                <div className="text-v2-xs text-v2-error-600">
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

            <div className="mt-5 flex-1">
              {running ? (
                <div className="space-y-4 animate-pulse" data-testid="voice-loading">
                  <div className="h-16 w-4/5 rounded-v2-xl bg-white border border-v2-border-light" />
                  <div className="ml-auto h-24 w-4/5 rounded-v2-xl bg-v2-primary-50 border border-v2-primary-100" />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="h-20 rounded-v2-lg bg-white border border-v2-border-light" />
                    <div className="h-20 rounded-v2-lg bg-white border border-v2-border-light" />
                  </div>
                </div>
              ) : result ? (
                <ResultCard sim={result} t={t} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center px-4 py-10">
                  <div className="w-12 h-12 rounded-full bg-v2-primary-50 text-v2-primary-600 flex items-center justify-center">
                    <MessagesSquare size={20} />
                  </div>
                  <p className="mt-3 text-v2-base font-semibold text-v2-text-primary">{t.emptyTitle}</p>
                  <p className="mt-1 max-w-sm text-v2-sm text-v2-text-secondary leading-relaxed">{t.emptyBody}</p>
                </div>
              )}
            </div>

            {result && !running && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-v2-border-light pt-4">
                <p className="text-[11px] text-v2-text-tertiary">{t.notSaved} {t.regenerateNote}</p>
                <button type="button" data-testid="voice-regenerate" onClick={() => void generate()} disabled={!canRun} className={btnSecondary}>
                  <RefreshCw size={13} /> {t.regenerate}
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
