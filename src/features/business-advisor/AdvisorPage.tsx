import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowRight, Building2, Check, Copy, Info, Lightbulb, Loader2, MapPin, MessageCircle,
  RotateCcw, Send, Sparkles, Store, Target, User,
} from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { useBusiness } from '../business-memory/BusinessContext';
import type { GoalId } from '../business-memory/types';
import { goalLabel } from '../activation/milestones';
import { COPY, type AdvisorCopy } from './copy';
import {
  AdvisorError, MAX_QUESTION_CHARS, answerToText, askAdvisor, loadAdvisorUsage,
  type AdvisorAnswer, type AdvisorErrorCode, type AdvisorUsage, type ChatTurn,
} from './repository';

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-v2-lg bg-v2-primary-600 px-4 py-2.5 text-v2-sm font-semibold text-white hover:bg-v2-primary-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none';
const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none';
const label = 'text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary';

function ContextItem({ icon, name, value, empty }: { icon: ReactNode; name: string; value: string; empty: string }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <span className="w-8 h-8 shrink-0 rounded-v2-md bg-white border border-v2-border-light text-v2-primary-600 flex items-center justify-center">{icon}</span>
      <div className="min-w-0">
        <p className={label}>{name}</p>
        <p className={`text-v2-sm truncate ${value ? 'text-v2-text-primary font-medium' : 'text-v2-warning-600'}`}>{value || empty}</p>
      </div>
    </div>
  );
}

function AnswerCard({ answer, t }: { answer: AdvisorAnswer; t: AdvisorCopy }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(answerToText(answer));
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="flex gap-3 animate-[fadeIn_200ms_ease-out]">
      <span className="w-8 h-8 shrink-0 rounded-full bg-v2-primary-600 text-white flex items-center justify-center"><Sparkles size={14} /></span>
      <div className="min-w-0 flex-1 rounded-v2-xl border border-v2-border-light bg-white p-4 space-y-4">
        <p className="text-v2-sm text-v2-text-primary leading-relaxed">{answer.answer}</p>

        {answer.first_step && (
          <div className="rounded-v2-lg border border-v2-primary-100 bg-v2-primary-50/60 px-3 py-2.5">
            <p className={`${label} text-v2-primary-700`}>{t.firstStep}</p>
            <p className="mt-0.5 text-v2-sm font-medium text-v2-text-primary leading-relaxed">{answer.first_step}</p>
          </div>
        )}

        {answer.actions.length > 0 && (
          <div>
            <p className={label}>{t.actions}</p>
            <ol className="mt-2 space-y-2">
              {answer.actions.map((a, i) => (
                <li key={`${i}-${a.title}`} className="rounded-v2-lg border border-v2-border-light px-3 py-2.5">
                  <span className="inline-block rounded-full bg-v2-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-v2-text-secondary">
                    {t.priority(i + 1)}
                  </span>
                  <p className="mt-1 text-v2-sm font-semibold text-v2-text-primary leading-snug">{a.title}</p>
                  {a.detail && <p className="mt-0.5 text-v2-xs text-v2-text-secondary leading-relaxed">{a.detail}</p>}
                </li>
              ))}
            </ol>
          </div>
        )}

        {answer.why && (
          <div>
            <p className={label}>{t.why}</p>
            <p className="mt-0.5 text-v2-sm text-v2-text-secondary leading-relaxed">{answer.why}</p>
          </div>
        )}

        {answer.next_step && (
          <p className="flex items-start gap-2 text-v2-sm text-v2-text-primary">
            <ArrowRight size={15} className="mt-0.5 shrink-0 text-v2-primary-600" />
            <span><span className="font-semibold">{t.nextStep}: </span>{answer.next_step}</span>
          </p>
        )}

        {answer.data_note && (
          <p className="flex items-start gap-2 rounded-v2-md bg-v2-neutral-50 px-3 py-2 text-v2-xs text-v2-text-secondary leading-relaxed">
            <Info size={13} className="mt-0.5 shrink-0 text-v2-text-tertiary" />
            <span><span className="font-medium">{t.dataNote}: </span>{answer.data_note}</span>
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-v2-border-light pt-3">
          <p className="text-[11px] text-v2-text-tertiary">{t.disclaimer}</p>
          <button type="button" onClick={() => void onCopy()} className={btnSecondary}>
            {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
            {copyState === 'copied' ? t.copied : t.copy}
          </button>
        </div>
        {copyState === 'failed' && <p className="text-[11px] text-v2-error-600">{t.copyFailed}</p>}
      </div>
    </div>
  );
}

export default function AdvisorPage() {
  const { lang } = useI18n();
  const t = lang === 'en' ? COPY.en : COPY.es;
  const navigate = useNavigate();
  const { currentBusiness, loading: businessLoading, error: businessError } = useBusiness();

  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<AdvisorErrorCode | null>(null);
  const [usage, setUsage] = useState<AdvisorUsage | null>(null);
  const [usageFailed, setUsageFailed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const refreshUsage = useCallback(async () => {
    const u = await loadAdvisorUsage();
    setUsage(u);
    setUsageFailed(u === null);
  }, []);

  useEffect(() => { void refreshUsage(); }, [refreshUsage]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [turns, asking]);

  const name = currentBusiness?.name?.trim() ?? '';
  const category = currentBusiness?.category?.trim() ?? '';
  const city = currentBusiness?.city?.trim() ?? '';
  const goal = goalLabel((currentBusiness?.primary_goal as GoalId | null) ?? null, lang) ?? '';
  const missingSome = !name || !category || !city || !goal;
  const noContext = !name && !category;
  const remaining = usage ? Math.max(0, Math.min(usage.limit - usage.used, usage.globalLimit - usage.globalUsed)) : null;
  const atLimit = remaining === 0;
  const trimmed = question.trim();
  const tooLong = trimmed.length > MAX_QUESTION_CHARS;
  const canSend = !!currentBusiness && !asking && !!trimmed && !tooLong && !atLimit && !noContext;

  const send = async () => {
    if (!currentBusiness || !canSend) return;
    const history = turns;
    setTurns([...history, { role: 'user', content: trimmed }]);
    setQuestion('');
    setAsking(true);
    setError(null);
    try {
      const answer = await askAdvisor({ businessId: currentBusiness.id, question: trimmed, history, lang });
      setTurns((prev) => [...prev, { role: 'assistant', answer }]);
    } catch (e) {
      setTurns(history);
      setQuestion(trimmed);
      setError(e instanceof AdvisorError ? e.code : 'unavailable');
    } finally {
      setAsking(false);
      void refreshUsage();
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  const pickQuestion = (q: string) => {
    setQuestion(q);
    setError(null);
    inputRef.current?.focus();
  };

  const resetChat = () => {
    setTurns([]);
    setError(null);
    setQuestion('');
  };

  if (businessLoading) {
    return (
      <div className="flex items-center gap-2 text-v2-sm text-v2-text-secondary py-12 justify-center">
        <Loader2 size={16} className="animate-spin" /> {t.loading}
      </div>
    );
  }

  const quick = (
    <div className="flex flex-wrap gap-2">
      {t.quickQuestions.map((q) => (
        <button
          key={q}
          type="button"
          data-testid="advisor-quick"
          onClick={() => pickQuestion(q)}
          disabled={asking}
          className="inline-flex items-center gap-1.5 rounded-full border border-v2-border-light bg-white px-3 py-1.5 text-v2-xs text-v2-text-secondary hover:border-v2-primary-300 hover:bg-v2-primary-50 hover:text-v2-primary-700 transition-colors disabled:opacity-50"
        >
          <Lightbulb size={12} className="text-v2-primary-500" /> {q}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <Link to="/herramientas" className="inline-flex items-center gap-1 text-v2-xs font-medium text-v2-text-tertiary hover:text-v2-primary-600 transition-colors">
          <ArrowLeft size={13} /> {t.back}
        </Link>
        <div className="mt-3 flex items-start gap-3">
          <div className="w-11 h-11 shrink-0 rounded-v2-lg bg-v2-primary-600 text-white flex items-center justify-center shadow-sm">
            <MessageCircle size={20} />
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
          <aside className="lg:col-span-2 space-y-5 rounded-v2-xl border border-v2-border-light bg-white p-5 lg:sticky lg:top-6">
            <div className="rounded-v2-lg border border-v2-primary-100 bg-v2-primary-50/60 p-4">
              <p className="flex items-start gap-2 text-v2-xs text-v2-text-secondary leading-relaxed">
                <Info size={14} className="text-v2-primary-600 mt-0.5 shrink-0" /> {t.contextTitle}
              </p>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                <ContextItem icon={<Store size={14} />} name={t.business} value={name} empty={t.notSet} />
                <ContextItem icon={<Building2 size={14} />} name={t.activity} value={category} empty={t.notSet} />
                <ContextItem icon={<MapPin size={14} />} name={t.city} value={city} empty={t.notSet} />
                <ContextItem icon={<Target size={14} />} name={t.goal} value={goal} empty={t.notSet} />
              </div>
              {missingSome ? (
                <div className="mt-3 rounded-v2-md border border-v2-warning-200 bg-v2-warning-50 px-3 py-2">
                  <p className="text-v2-xs text-v2-warning-700">{noContext ? t.errors.profile_incomplete : t.missingNote}</p>
                  <button type="button" onClick={() => navigate('/negocio')} className={`${btnSecondary} mt-2`}>{t.goToBusiness}</button>
                </div>
              ) : (
                <Link to="/negocio" className="mt-3 inline-block text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700">{t.editBusiness}</Link>
              )}
            </div>

            <div className="rounded-v2-lg border border-v2-border-light px-4 py-3">
              {usage && remaining !== null ? (
                <>
                  <p data-testid="advisor-usage" className={`text-v2-sm font-semibold ${atLimit ? 'text-v2-error-600' : 'text-v2-text-primary'}`}>
                    {t.usage(usage.used, usage.limit)}
                  </p>
                  <p className="mt-0.5 text-v2-xs text-v2-text-secondary">{t.remaining(remaining)}</p>
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
              <p className="mt-2 text-[11px] text-v2-text-tertiary">{t.costNote}</p>
            </div>

            {turns.length > 0 && (
              <div>
                <p className="text-v2-sm font-semibold text-v2-text-primary">{t.quickTitle}</p>
                <div className="mt-2.5">{quick}</div>
              </div>
            )}
          </aside>

          <section className="lg:col-span-3 rounded-v2-xl border border-v2-border-light bg-v2-neutral-50/50 flex flex-col min-h-[520px]">
            <div className="flex-1 p-5 space-y-5" aria-live="polite">
              {turns.length === 0 && !asking ? (
                <div className="flex flex-col items-center justify-center text-center px-4 py-10">
                  <div className="w-12 h-12 rounded-full bg-v2-primary-50 text-v2-primary-600 flex items-center justify-center">
                    <Sparkles size={20} />
                  </div>
                  <p className="mt-3 text-v2-base font-semibold text-v2-text-primary">{t.emptyTitle}</p>
                  <p className="mt-1 max-w-md text-v2-sm text-v2-text-secondary leading-relaxed">{t.emptyBody}</p>
                  <div className="mt-5 flex justify-center">{quick}</div>
                </div>
              ) : (
                turns.map((turn, i) =>
                  turn.role === 'user' ? (
                    <div key={i} className="flex justify-end gap-3">
                      <p className="max-w-[85%] rounded-v2-xl rounded-tr-sm bg-v2-primary-600 px-4 py-2.5 text-v2-sm text-white leading-relaxed whitespace-pre-line">
                        <span className="sr-only">{t.you}: </span>{turn.content}
                      </p>
                      <span className="w-8 h-8 shrink-0 rounded-full bg-white border border-v2-border-light text-v2-text-secondary flex items-center justify-center"><User size={14} /></span>
                    </div>
                  ) : (
                    <AnswerCard key={i} answer={turn.answer} t={t} />
                  ),
                )
              )}

              {asking && (
                <div className="flex gap-3">
                  <span className="w-8 h-8 shrink-0 rounded-full bg-v2-primary-600 text-white flex items-center justify-center"><Sparkles size={14} /></span>
                  <div className="flex-1 rounded-v2-xl border border-v2-border-light bg-white p-4">
                    <p className="flex items-center gap-2 text-v2-xs text-v2-text-secondary"><Loader2 size={13} className="animate-spin" /> {t.thinking}</p>
                    <div className="mt-3 space-y-2 animate-pulse">
                      <div className="h-3 w-full rounded bg-v2-neutral-100" />
                      <div className="h-3 w-5/6 rounded bg-v2-neutral-100" />
                      <div className="h-3 w-2/3 rounded bg-v2-neutral-100" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="border-t border-v2-border-light bg-white p-4 rounded-b-v2-xl">
              {error && (
                <div className="mb-3 flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-3 py-2.5">
                  <AlertCircle size={15} className="mt-0.5 shrink-0 text-v2-error-600" />
                  <div className="text-v2-xs text-v2-error-600">
                    <p>{t.errors[error]}</p>
                    {error === 'profile_incomplete' && (
                      <button type="button" onClick={() => navigate('/negocio')} className={`${btnSecondary} mt-2`}>{t.goToBusiness}</button>
                    )}
                    {error === 'premium_required' && (
                      <button type="button" onClick={() => navigate('/facturacion')} className={`${btnSecondary} mt-2`}>{t.premiumCta}</button>
                    )}
                    {error === 'history_too_long' && (
                      <button type="button" onClick={resetChat} className={`${btnSecondary} mt-2`}>{t.newChat}</button>
                    )}
                  </div>
                </div>
              )}
              <label htmlFor="advisor-question" className="text-v2-sm font-semibold text-v2-text-primary">{t.inputLabel}</label>
              <div className="mt-2 flex items-end gap-2">
                <textarea
                  id="advisor-question"
                  ref={inputRef}
                  rows={2}
                  value={question}
                  maxLength={MAX_QUESTION_CHARS}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={t.placeholder}
                  className="flex-1 resize-none rounded-v2-lg border border-v2-border-light bg-white px-3 py-2.5 text-v2-sm text-v2-text-primary placeholder:text-v2-text-tertiary focus:border-v2-primary-400 focus:outline-none focus:ring-2 focus:ring-v2-primary-100 transition-colors"
                />
                <button type="button" onClick={() => void send()} disabled={!canSend} className={btnPrimary} aria-label={t.send}>
                  {asking ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  <span className="hidden sm:inline">{asking ? t.sending : t.send}</span>
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-v2-text-tertiary">{t.sessionNote}</span>
                <span className="flex items-center gap-3">
                  {turns.length > 0 && (
                    <button type="button" onClick={resetChat} disabled={asking} className="inline-flex items-center gap-1 font-medium text-v2-text-secondary hover:text-v2-primary-600 transition-colors disabled:opacity-50">
                      <RotateCcw size={11} /> {t.newChat}
                    </button>
                  )}
                  <span className={tooLong ? 'text-v2-error-600' : 'text-v2-text-tertiary'}>{t.count(trimmed.length, MAX_QUESTION_CHARS)}</span>
                </span>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
