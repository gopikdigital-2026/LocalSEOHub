import { useEffect, useState } from 'react';
import { Building2, Check, ClipboardCheck, Copy, Loader2, PenLine, RefreshCw, Sparkles, Wand2 } from 'lucide-react';
import { useBusiness } from '../business-memory/BusinessContext';
import { useBilling } from '../billing/BillingContext';
import { useI18n } from '../../lib/i18n';
import type { BusinessAction } from '../actions/types';
import { IMPROVEMENT_COPY, type PanelState } from './copy';
import { ImprovementEditor, Notice, btnPrimary, btnSecondary } from './ImprovementEditor';
import {
  MAX_ATTEMPTS, MAX_GENERATIONS, MAX_SOURCE_CHARS, MIN_SOURCE_CHARS, MONTHLY_REQUESTS, hasDraft, improvementTarget,
  isOpenAction, missingFor, remainingVersions, serviceStillDeclared, supportsImprove, validateSource, type ImprovementMode,
} from './model';
import { useImprovement } from './useImprovement';

const GENERAL_SOURCES = new Set(['GENERAL_BEST_PRACTICE', 'GOAL_BASED']);

export default function ImprovementPanel({ action, onNavigate }: { action: BusinessAction; onNavigate: (path: string) => void }) {
  const target = improvementTarget(action);
  if (!target) return null;
  return <Panel action={action} target={target} onNavigate={onNavigate} />;
}

function Panel({ action, target, onNavigate }: {
  action: BusinessAction; target: NonNullable<ReturnType<typeof improvementTarget>>; onNavigate: (path: string) => void;
}) {
  const { lang } = useI18n();
  const t = IMPROVEMENT_COPY[lang];
  const { currentBusiness } = useBusiness();
  const { hasPremium } = useBilling();
  const { draft, usage, phase, generating, genError, clearGenError, reload, generate, save, recordCopy } =
    useImprovement(action.businessId, action.id, target.semanticKey, lang);
  const [mode, setMode] = useState<ImprovementMode>('create');
  const [source, setSource] = useState('');
  const [sourceProblem, setSourceProblem] = useState<'too_short' | 'too_long' | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = setTimeout(() => setCopyState('idle'), 6000);
    return () => clearTimeout(timer);
  }, [copyState]);

  const business = currentBusiness?.id === action.businessId ? currentBusiness : null;
  const open = isOpenAction(action);
  const attemptsUsed = draft?.attempts ?? 0;
  const available = hasDraft(draft);
  const remaining = remainingVersions(draft);
  const locked = hasPremium === false;
  const globalReached = usage !== null && usage >= MONTHLY_REQUESTS;
  const serviceOk = serviceStillDeclared(business, target.service);
  const missing = missingFor(target.kind, mode, business);
  const canImprove = supportsImprove(target.kind);

  if (!open && !available && phase !== 'loading') return null;

  const fieldNames = missing.map((f) => t.fields[f]).join(', ');
  const used = [t.fields.name, t.fields.category, t.fields.city];
  if (target.kind !== 'service_description' || (business?.services.length ?? 0) > 0) used.push(t.fields.services);
  if (business?.target_audience?.trim()) used.push(t.fields.audience);
  if (mode === 'improve') used.push(t.fields.source);

  const state: PanelState = (() => {
    if (generating) return 'preparing';
    if (editing) return saving ? 'saving' : 'editing';
    if (genError === 'global_limit' || genError === 'monthly_limit' || genError === 'limit_reached' || genError === 'attempts_exhausted') return 'limit';
    if (genError || phase === 'load_error') return 'error';
    if (available) return draft.edited_at ? 'saved' : 'available';
    if (locked) return 'locked';
    if (globalReached || attemptsUsed >= MAX_ATTEMPTS) return 'limit';
    if (missing.length || !serviceOk) return 'incomplete';
    return 'empty';
  })();

  const startGeneration = (allowOverwrite: boolean) => {
    if (mode === 'improve') {
      const problem = validateSource(source);
      setSourceProblem(problem);
      if (problem) return;
    }
    setConfirmReplace(false);
    void generate(mode, source, allowOverwrite);
  };

  const onAnother = () => {
    if (available && draft.edited_at && !confirmReplace) { setConfirmReplace(true); return; }
    startGeneration(Boolean(available && draft.edited_at));
  };

  const onCopy = async () => {
    if (!available) return;
    try {
      await navigator.clipboard.writeText(draft.content);
      setCopyState('copied');
      void recordCopy();
    } catch {
      setCopyState('error');
    }
  };

  const onSave = async (text: string) => {
    const result = await save(text);
    return result === 'error' ? 'error' : result.status;
  };

  const canGenerate = open && !locked && !globalReached && serviceOk && missing.length === 0;

  const modeChooser = canImprove && open && !locked && (
    <fieldset className="space-y-2.5">
      <legend className="text-v2-xs font-semibold text-v2-text-primary mb-1.5">{t.modeLabel}</legend>
      <div className="flex flex-col sm:flex-row gap-2">
        {(['create', 'improve'] as const).map((m) => (
          <label key={m} className={`flex-1 cursor-pointer rounded-v2-lg border px-3 py-2.5 text-v2-xs transition-colors ${mode === m ? 'border-v2-primary-400 bg-v2-primary-50 text-v2-primary-700 font-medium' : 'border-v2-border-light text-v2-text-secondary hover:border-v2-primary-200'}`}>
            <input type="radio" name={`improve-mode-${action.id}`} value={m} checked={mode === m} onChange={() => { setMode(m); setSourceProblem(null); }} className="sr-only" />
            {m === 'create' ? t.modeCreate : t.modeImprove}
          </label>
        ))}
      </div>
      {mode === 'improve' && (
        <div className="space-y-1.5">
          <label htmlFor={`improve-source-${action.id}`} className="text-v2-xs font-medium text-v2-text-primary">{t.sourceLabel}</label>
          <textarea
            id={`improve-source-${action.id}`}
            value={source}
            onChange={(e) => { setSource(e.target.value); setSourceProblem(null); }}
            maxLength={MAX_SOURCE_CHARS}
            rows={5}
            className="w-full rounded-v2-lg border border-v2-border bg-white px-3.5 py-3 text-v2-sm leading-relaxed text-v2-text-primary focus:border-v2-primary-400 focus:outline-none focus:ring-2 focus:ring-v2-primary-500/20 resize-y"
          />
          <p className="text-v2-xs text-v2-text-tertiary">{t.sourceHint(MIN_SOURCE_CHARS, MAX_SOURCE_CHARS)} · {t.chars(source.trim().length, MAX_SOURCE_CHARS)}</p>
          {sourceProblem && <Notice tone="error">{sourceProblem === 'too_short' ? t.sourceShort(MIN_SOURCE_CHARS) : t.sourceLong}</Notice>}
        </div>
      )}
    </fieldset>
  );

  const body = (() => {
    if (phase === 'loading') return <div className="h-24 rounded-v2-lg bg-v2-neutral-50 animate-pulse" aria-hidden="true" />;
    if (phase === 'load_error') {
      return (
        <Notice tone="error">
          <p>{t.loadError}</p>
          <button onClick={() => void reload()} className="mt-1.5 inline-flex items-center gap-1 font-semibold underline underline-offset-2"><RefreshCw size={11} /> {t.retry}</button>
        </Notice>
      );
    }
    if (generating && !available) {
      return (
        <div role="status" className="flex items-center gap-2.5 rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-6 text-v2-sm text-v2-text-secondary">
          <Loader2 size={16} className="animate-spin text-v2-primary-500" /> {t.preparing}
        </div>
      );
    }
    if (!available) {
      if (locked) return <p className="text-v2-xs text-v2-text-secondary leading-relaxed">{t.lockedText}</p>;
      if (!serviceOk) return <IncompleteBox text={t.serviceGone} cta={t.incompleteCta} title={t.incompleteTitle} onClick={() => onNavigate('/negocio')} />;
      if (attemptsUsed >= MAX_ATTEMPTS) return <p role="status" className="text-v2-xs text-v2-text-secondary leading-relaxed">{t.attemptsNoDraft}</p>;
      if (globalReached) return <p role="status" className="text-v2-xs text-v2-text-secondary leading-relaxed">{t.errors.global_limit}</p>;
      return (
        <div className="space-y-4">
          {modeChooser}
          {missing.length > 0 ? (
            <IncompleteBox title={t.incompleteTitle} text={t.incompleteText(fieldNames)} cta={t.incompleteCta} onClick={() => onNavigate('/negocio')} />
          ) : (
            <div className="space-y-2.5">
              <button onClick={() => startGeneration(false)} disabled={!canGenerate} className={btnPrimary}><Wand2 size={13} /> {t.prepare}</button>
              <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{t.prepareNote}</p>
            </div>
          )}
        </div>
      );
    }
    if (editing) {
      return (
        <ImprovementEditor
          draft={draft} t={t} onSave={onSave} onSavingChange={setSaving}
          onDone={(again) => { setEditing(false); if (again) void reload(); }}
        />
      );
    }
    return (
      <div className="space-y-3">
        <p className="inline-flex items-center gap-1.5 rounded-full border border-v2-warning-200 bg-v2-warning-50 px-2.5 py-0.5 text-v2-xs font-medium text-v2-warning-700">
          <ClipboardCheck size={12} /> {t.pending}
        </p>
        <div className={`relative rounded-v2-lg border border-v2-border-light bg-v2-neutral-50/60 px-4 py-3.5 transition-opacity ${generating ? 'opacity-50' : ''}`}>
          <p data-testid="improvement-text" className="whitespace-pre-wrap break-words text-v2-sm leading-relaxed text-v2-text-primary">{draft.content}</p>
          {generating && (
            <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-v2-xs font-medium text-v2-text-secondary">
              <Loader2 size={14} className="animate-spin text-v2-primary-500" /> {t.preparing}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-v2-xs text-v2-text-tertiary">
            <Check size={12} className="text-v2-success-500" /> {draft.edited_at ? t.editedSaved : t.saved}
          </span>
          <div className="flex flex-wrap gap-2">
            <button onClick={onCopy} disabled={generating} className={btnPrimary}>
              {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />} {copyState === 'copied' ? t.copied : t.copy}
            </button>
            <button onClick={() => { setConfirmReplace(false); setEditing(true); }} disabled={generating} className={btnSecondary}>
              <PenLine size={13} /> {t.edit}
            </button>
            {remaining > 0 && canGenerate && (
              <button onClick={onAnother} disabled={generating} className={btnSecondary}>
                <RefreshCw size={13} /> {t.another} <span className="text-v2-text-tertiary">({t.remaining(remaining)})</span>
              </button>
            )}
          </div>
        </div>
        <div aria-live="polite">
          {copyState === 'copied' && <Notice tone="info">{t.copiedNote}</Notice>}
        </div>
        {copyState === 'error' && <Notice tone="error" onClose={() => setCopyState('idle')} closeLabel={t.close}>{t.copyError}</Notice>}
        {remaining > 0 && canGenerate && !generating && modeChooser}
        {confirmReplace && (
          <Notice tone="info">
            <p>{t.replaceEdited}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={onAnother} className={btnPrimary}>{t.replaceYes}</button>
              <button onClick={() => setConfirmReplace(false)} className={btnSecondary}>{t.replaceNo}</button>
            </div>
          </Notice>
        )}
        {remaining === 0 && (
          <p className="text-v2-xs text-v2-text-tertiary">{draft.generations >= MAX_GENERATIONS ? t.limitInfo : t.attemptsInfo}</p>
        )}
        {draft.versions.length > 1 && (
          <details className="group rounded-v2-lg border border-v2-border-light px-3.5 py-2.5">
            <summary className="cursor-pointer text-v2-xs font-medium text-v2-text-secondary hover:text-v2-primary-600">{t.versions(draft.versions.length)}</summary>
            <ol className="mt-3 space-y-3">
              {draft.versions.map((v, i) => (
                <li key={i} className="rounded-v2-md bg-v2-neutral-50 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-v2-xs font-semibold text-v2-text-primary">{t.versionN(i + 1)}</span>
                    {v === draft.content
                      ? <span className="text-v2-xs text-v2-success-600">{t.current}</span>
                      : <button onClick={() => void save(v)} disabled={generating} className="text-v2-xs font-medium text-v2-primary-600 hover:underline">{t.useVersion}</button>}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-v2-xs leading-relaxed text-v2-text-secondary">{v}</p>
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    );
  })();

  return (
    <section data-testid="improvement-panel" aria-labelledby={`improvement-title-${action.id}`} className="rounded-v2-xl border border-v2-primary-100 bg-white p-5 sm:p-6 shadow-v2-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-v2-primary-500" />
            <h2 id={`improvement-title-${action.id}`} className="text-v2-base font-semibold text-v2-text-primary">{t.title}</h2>
          </div>
          <p className="text-v2-xs text-v2-text-secondary mt-1 leading-relaxed">{t.intro[target.kind]}</p>
          {target.service && <p className="text-v2-xs font-medium text-v2-text-primary mt-1.5">{t.service(target.service)}</p>}
        </div>
        <span className="rounded-full border border-v2-border-light bg-v2-neutral-50 px-2.5 py-0.5 text-v2-xs font-medium text-v2-text-secondary" aria-label={`${t.stateLabel}: ${t.states[state]}`}>
          {t.states[state]}
        </span>
      </div>
      <div className="mb-4 space-y-1 text-v2-xs text-v2-text-tertiary leading-relaxed">
        <p>{t.basedOn} {used.join(', ')}.</p>
        {GENERAL_SOURCES.has(action.sourceType) && <p>{t.generalNote}</p>}
      </div>
      {genError && (
        <div className="mb-3">
          <Notice tone="error" onClose={clearGenError} closeLabel={t.close}>
            <p>{t.errors[genError]}</p>
            {(genError === 'profile_incomplete' || genError === 'service_not_declared') && (
              <button onClick={() => onNavigate('/negocio')} className="mt-1.5 font-semibold underline underline-offset-2">{t.incompleteCta}</button>
            )}
            {genError === 'edited_conflict' && (
              <button onClick={() => startGeneration(true)} className="mt-1.5 font-semibold underline underline-offset-2">{t.replaceYes}</button>
            )}
          </Notice>
        </div>
      )}
      {body}
      {usage !== null && !locked && <p className="mt-4 text-v2-xs text-v2-text-tertiary">{t.usage(usage, MONTHLY_REQUESTS)}</p>}
    </section>
  );
}

function IncompleteBox({ title, text, cta, onClick }: { title: string; text: string; cta: string; onClick: () => void }) {
  return (
    <div className="rounded-v2-lg border border-v2-warning-200 bg-v2-warning-50 p-4">
      <div className="flex items-start gap-2.5">
        <Building2 size={16} className="text-v2-warning-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-v2-sm font-semibold text-v2-text-primary">{title}</p>
          <p className="text-v2-xs text-v2-text-secondary mt-1 leading-relaxed">{text}</p>
          <button onClick={onClick} className={`${btnPrimary} mt-3`}>{cta}</button>
        </div>
      </div>
    </div>
  );
}
