import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { ImprovementCopy } from './copy';
import { MAX_CONTENT_CHARS, validateEdit, type ImprovementDraft } from './model';

export const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none';
export const btnPrimary = 'inline-flex items-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3.5 py-2 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 transition-colors disabled:opacity-60 disabled:pointer-events-none';

export function Notice({ tone, children, onClose, closeLabel }: { tone: 'error' | 'info'; children: React.ReactNode; onClose?: () => void; closeLabel?: string }) {
  const look = tone === 'error'
    ? 'border-v2-error-200 bg-v2-error-50 text-v2-error-600'
    : 'border-v2-primary-200 bg-v2-primary-50 text-v2-primary-700';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex items-start gap-2 rounded-v2-lg border px-3 py-2.5 text-v2-xs leading-relaxed ${look}`}>
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
      {onClose && <button onClick={onClose} aria-label={closeLabel} className="opacity-70 hover:opacity-100">×</button>}
    </div>
  );
}

export function ImprovementEditor({ draft, t, onSave, onDone, onSavingChange }: {
  draft: ImprovementDraft; t: ImprovementCopy;
  onSave: (text: string) => Promise<'saved' | 'conflict' | 'error'>;
  onDone: (reload: boolean) => void;
  onSavingChange: (saving: boolean) => void;
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
    onSavingChange(true);
    setProblem(null);
    const result = await onSave(text);
    setSaving(false);
    onSavingChange(false);
    if (result === 'saved') onDone(false);
    else setProblem(result);
  };

  return (
    <div className="space-y-3">
      <label className="sr-only" htmlFor={`improvement-editor-${draft.id}`}>{t.editLabel}</label>
      <textarea
        id={`improvement-editor-${draft.id}`}
        value={text}
        onChange={(e) => { setText(e.target.value); setProblem(null); }}
        maxLength={MAX_CONTENT_CHARS}
        rows={9}
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
