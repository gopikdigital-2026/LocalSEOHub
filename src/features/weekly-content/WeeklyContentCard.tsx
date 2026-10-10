import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Copy, Loader2, PenLine, RefreshCw, Sparkles, X, Calendar, Building2 } from 'lucide-react';
import { useBusiness } from '../business-memory/BusinessContext';
import { useBilling } from '../billing/BillingContext';
import { useI18n } from '../../lib/i18n';
import { WEEKLY_COPY, type WeeklyCopy } from './copy';
import { MAX_CONTENT_CHARS, hasDraft, missingProfileFields, remainingVersions, validateEdit, weekRange, type WeeklyDraft } from './model';
import { useWeeklyContent } from './useWeeklyContent';

const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none';
const btnPrimary = 'inline-flex items-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3.5 py-2 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 transition-colors disabled:opacity-60 disabled:pointer-events-none';

function Notice({ tone, children, onClose, closeLabel }: { tone: 'error' | 'info'; children: React.ReactNode; onClose?: () => void; closeLabel?: string }) {
  const look = tone === 'error'
    ? 'border-v2-error-200 bg-v2-error-50 text-v2-error-600'
    : 'border-v2-primary-200 bg-v2-primary-50 text-v2-primary-700';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-v2-lg border px-3 py-2.5 text-v2-xs leading-relaxed ${look}`}>
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
      {onClose && <button onClick={onClose} aria-label={closeLabel} className="opacity-70 hover:opacity-100"><X size={13} /></button>}
    </div>
  );
}

function Editor({ draft, t, onSave, onDone }: {
  draft: WeeklyDraft; t: WeeklyCopy;
  onSave: (text: string) => Promise<'saved' | 'conflict' | 'error'>;
  onDone: (reload: boolean) => void;
}) {
  const [text, setText] = useState(draft.content);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<'error' | 'conflict' | 'empty' | 'too_long' | null>(null);
  const dirty = text !== draft.content;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const submit = async () => {
    const invalid = validateEdit(text);
    if (invalid) { setProblem(invalid); return; }
    if (!dirty) { onDone(false); return; }
    setSaving(true);
    setProblem(null);
    const result = await onSave(text);
    setSaving(false);
    if (result === 'saved') onDone(false);
    else setProblem(result);
  };

  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor="weekly-content-editor">{t.editLabel}</label>
      <textarea
        id="weekly-content-editor"
        value={text}
        onChange={(e) => { setText(e.target.value); setProblem(null); }}
        maxLength={MAX_CONTENT_CHARS}
        rows={8}
        className="w-full rounded-v2-lg border border-v2-border bg-white px-3.5 py-3 text-v2-sm leading-relaxed text-v2-text-primary focus:border-v2-primary-400 focus:outline-none focus:ring-2 focus:ring-v2-primary-500/20 resize-y"
      />
      <div className="flex items-center justify-between text-v2-xs text-v2-text-tertiary">
        <span className={dirty ? 'text-v2-warning-600 font-medium' : ''}>{dirty ? t.unsaved : ''}</span>
        <span>{t.chars(text.length, MAX_CONTENT_CHARS)}</span>
      </div>
      {problem === 'error' && <Notice tone="error">{t.saveError}</Notice>}
      {problem === 'empty' && <Notice tone="error">{t.emptyEdit}</Notice>}
      {problem === 'too_long' && <Notice tone="error">{t.tooLong}</Notice>}
      {problem === 'conflict' && (
        <Notice tone="error">
          <p>{t.conflict}</p>
          <button onClick={() => onDone(true)} className="mt-1.5 font-semibold underline underline-offset-2">{t.loadLatest}</button>
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {saving ? t.saving : t.save}
        </button>
        <button onClick={() => onDone(false)} disabled={saving} className={btnSecondary}>{t.cancel}</button>
      </div>
    </div>
  );
}

export default function WeeklyContentCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { lang } = useI18n();
  const t = WEEKLY_COPY[lang];
  const { businessId, currentBusiness } = useBusiness();
  const { hasPremium } = useBilling();
  const { week, draft, phase, generating, genError, clearGenError, reload, generate, save, recordCopy } = useWeeklyContent(businessId, lang);
  const [editing, setEditing] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = setTimeout(() => setCopyState('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copyState]);

  const locale = lang === 'en' ? 'en-GB' : 'es-ES';
  const { from, to } = weekRange(week);
  const fmt = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  const missing = missingProfileFields(currentBusiness);
  const available = hasDraft(draft);
  const remaining = remainingVersions(draft);
  const locked = hasPremium === false;

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

  const onAnother = () => {
    if (available && draft.edited_at && !confirmReplace) { setConfirmReplace(true); return; }
    setConfirmReplace(false);
    void generate();
  };

  const onSave = async (text: string) => {
    const result = await save(text);
    return result === 'error' ? 'error' : result.status;
  };

  const body = (() => {
    if (!businessId || phase === 'loading') {
      return <div className="h-24 rounded-v2-lg bg-v2-neutral-50 animate-pulse" aria-hidden="true" />;
    }
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
      if (missing.length) {
        return (
          <div className="rounded-v2-lg border border-v2-warning-200 bg-v2-warning-50 p-4">
            <div className="flex items-start gap-2.5">
              <Building2 size={16} className="text-v2-warning-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-v2-sm font-semibold text-v2-text-primary">{t.incompleteTitle}</p>
                <p className="text-v2-xs text-v2-text-secondary mt-1 leading-relaxed">{t.incompleteText}</p>
                <button onClick={() => onNavigate('/negocio')} className={`${btnPrimary} mt-3`}>{t.incompleteCta}</button>
              </div>
            </div>
          </div>
        );
      }
      if (locked) return <p className="text-v2-xs text-v2-text-secondary leading-relaxed">{t.lockedText}</p>;
      return (
        <div className="space-y-2.5">
          <button onClick={() => void generate()} className={btnPrimary}><Sparkles size={13} /> {t.prepare}</button>
          <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{t.prepareNote}</p>
        </div>
      );
    }
    if (editing) {
      return <Editor draft={draft} t={t} onSave={onSave} onDone={(again) => { setEditing(false); if (again) void reload(); }} />;
    }
    return (
      <div className="space-y-3">
        <div className={`relative rounded-v2-lg border border-v2-border-light bg-v2-neutral-50/60 px-4 py-3.5 transition-opacity ${generating ? 'opacity-50' : ''}`}>
          <p data-testid="weekly-content-text" className="whitespace-pre-wrap break-words text-v2-sm leading-relaxed text-v2-text-primary">{draft.content}</p>
          {generating && (
            <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-v2-xs font-medium text-v2-text-secondary">
              <Loader2 size={14} className="animate-spin text-v2-primary-500" /> {t.preparing}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 text-v2-xs text-v2-text-tertiary" aria-live="polite">
            <Check size={12} className="text-v2-success-500" />
            {copyState === 'copied' ? t.copiedOnce : draft.edited_at ? t.editedSaved : t.saved}
          </span>
          <div className="flex flex-wrap gap-2">
            <button onClick={onCopy} disabled={generating} className={btnPrimary} aria-label={t.copy}>
              {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />} {copyState === 'copied' ? t.copied : t.copy}
            </button>
            <button onClick={() => { setConfirmReplace(false); setEditing(true); }} disabled={generating} className={btnSecondary}>
              <PenLine size={13} /> {t.edit}
            </button>
            {remaining > 0 && !locked && missing.length === 0 && (
              <button onClick={onAnother} disabled={generating} className={btnSecondary}>
                <RefreshCw size={13} /> {t.another} <span className="text-v2-text-tertiary">({t.remaining(remaining)})</span>
              </button>
            )}
          </div>
        </div>
        {copyState === 'error' && <Notice tone="error" onClose={() => setCopyState('idle')} closeLabel={t.close}>{t.copyError}</Notice>}
        {confirmReplace && (
          <Notice tone="info">
            <p>{t.replaceEdited}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={onAnother} className={btnPrimary}>{t.replaceYes}</button>
              <button onClick={() => setConfirmReplace(false)} className={btnSecondary}>{t.replaceNo}</button>
            </div>
          </Notice>
        )}
        {remaining === 0 && <p className="text-v2-xs text-v2-text-tertiary">{t.limitInfo}</p>}
      </div>
    );
  })();

  return (
    <section data-testid="weekly-content-card" className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6 shadow-v2-xs">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-v2-primary-500" />
            <h2 className="text-v2-base font-semibold text-v2-text-primary">{t.title}</h2>
          </div>
          <p className="text-v2-xs text-v2-text-secondary mt-1 leading-relaxed">{t.intro}</p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-v2-xs text-v2-text-tertiary"><Calendar size={12} /> {t.week(fmt(from), fmt(to))}</span>
          {available && <span className="rounded-full border border-v2-border-light bg-v2-neutral-50 px-2.5 py-0.5 text-v2-xs font-medium text-v2-text-secondary">{t.draft}</span>}
        </div>
      </div>
      {genError && (
        <div className="mb-3">
          <Notice tone="error" onClose={clearGenError} closeLabel={t.close}>
            <p>{t.errors[genError]}</p>
            {genError === 'profile_incomplete' && (
              <button onClick={() => onNavigate('/negocio')} className="mt-1.5 font-semibold underline underline-offset-2">{t.incompleteCta}</button>
            )}
          </Notice>
        </div>
      )}
      {body}
    </section>
  );
}
