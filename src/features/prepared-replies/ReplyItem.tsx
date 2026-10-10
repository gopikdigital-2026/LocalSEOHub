import { useEffect, useState } from 'react';
import { AlertCircle, Check, ChevronDown, Copy, Loader2, PenLine, RefreshCw } from 'lucide-react';
import { Notice, btnPrimary, btnSecondary } from '../improvement/ImprovementEditor';
import type { RepliesCopy } from './copy';
import { AddressForm, BookingForm } from './DetailsForms';
import {
  MAX_REPLY_CHARS, fixedInCard, originFor, validateReply,
  type BookingMethod, type ReplyCategory, type ReplyProblem, type ReplyView, type Suggestion,
} from './model';
import type { SaveStatus } from './usePreparedReplies';

export interface ReplyItemProps {
  category: ReplyCategory;
  view: ReplyView;
  t: RepliesCopy;
  open: boolean;
  canWrite: boolean;
  locked: boolean;
  address: string;
  bookingMethod: BookingMethod | null;
  onToggle: () => void;
  onSave: (content: string, origin: 'template' | 'edited', fingerprint: string) => Promise<SaveStatus>;
  onSaveAddress: (address: string | null) => Promise<SaveStatus>;
  onSaveBooking: (method: BookingMethod) => Promise<SaveStatus>;
  onReload: () => void;
  onNavigate: (path: string) => void;
}

interface EditSession { text: string; basis: string; refreshed: boolean }

function ReplyEditor({ id, label, session, suggestion, t, onSave, onDone, onReload }: {
  id: string; label: string; session: EditSession; suggestion: Suggestion | null; t: RepliesCopy;
  onSave: ReplyItemProps['onSave']; onDone: () => void; onReload: () => void;
}) {
  const [text, setText] = useState(session.text);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<ReplyProblem | Exclude<SaveStatus, 'saved'> | null>(null);
  const dirty = text !== session.text || session.refreshed;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const submit = async () => {
    const invalid = validateReply(text);
    if (invalid) { setProblem(invalid); return; }
    setSaving(true);
    setProblem(null);
    const origin = suggestion ? originFor(text, suggestion) : 'edited';
    const result = await onSave(text, origin, session.basis);
    setSaving(false);
    if (result === 'saved') onDone();
    else setProblem(result);
  };

  return (
    <div className="space-y-2.5">
      {session.refreshed && <Notice tone="info">{t.refreshNote}</Notice>}
      <label className="sr-only" htmlFor={id}>{label}</label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => { setText(e.target.value); setProblem(null); }}
        maxLength={MAX_REPLY_CHARS}
        rows={5}
        autoFocus
        className="w-full rounded-v2-lg border border-v2-border bg-white px-3.5 py-3 text-v2-sm leading-relaxed text-v2-text-primary focus:border-v2-primary-400 focus:outline-none focus:ring-2 focus:ring-v2-primary-500/20 resize-y"
      />
      <div className="flex items-center justify-between text-v2-xs text-v2-text-tertiary">
        <span className={dirty ? 'text-v2-warning-600 font-medium' : ''}>{dirty ? t.unsaved : ''}</span>
        <span>{t.chars(text.length, MAX_REPLY_CHARS)}</span>
      </div>
      {problem === 'conflict' ? (
        <Notice tone="error">
          <p>{t.conflict}</p>
          <button onClick={() => { onReload(); onDone(); }} className="mt-1.5 font-semibold underline underline-offset-2">{t.loadLatest}</button>
        </Notice>
      ) : problem && (
        <Notice tone="error">
          {problem === 'locked' ? t.lockedSave : problem === 'error' ? t.saveError : t.problems[problem]}
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={submit} disabled={saving} className={btnPrimary}>
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {saving ? t.saving : t.save}
        </button>
        <button onClick={onDone} disabled={saving} className={btnSecondary}>{t.cancel}</button>
      </div>
    </div>
  );
}

function statusChip(view: ReplyView, t: RepliesCopy) {
  if (view.kind === 'missing') return { label: t.status.missing, look: 'bg-v2-warning-50 text-v2-warning-700 border-v2-warning-200' };
  if (view.kind === 'suggested') return { label: t.status.suggested, look: 'bg-v2-primary-50 text-v2-primary-700 border-v2-primary-200' };
  if (view.stale) return { label: t.status.review, look: 'bg-v2-warning-50 text-v2-warning-700 border-v2-warning-200' };
  return {
    label: view.reply.origin === 'edited' ? t.status.edited : t.status.saved,
    look: 'bg-v2-success-50 text-v2-success-700 border-v2-success-200',
  };
}

export function ReplyItem(props: ReplyItemProps) {
  const { category, view, t, open, canWrite, locked, address, bookingMethod, onToggle, onSave, onSaveAddress, onSaveBooking, onReload, onNavigate } = props;
  const [session, setSession] = useState<EditSession | null>(null);
  const [changing, setChanging] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const question = t.questions[category];
  const panelId = `prepared-reply-${category}`;

  useEffect(() => {
    if (copyState !== 'copied') return;
    const timer = setTimeout(() => setCopyState('idle'), 2500);
    return () => clearTimeout(timer);
  }, [copyState]);

  useEffect(() => {
    if (!open) { setSession(null); setChanging(false); }
  }, [open]);

  const text = view.kind === 'saved' ? view.reply.content : view.kind === 'suggested' ? view.text : '';
  const suggestion: Suggestion | null = view.kind === 'saved' ? view.suggestion
    : view.kind === 'suggested' ? { status: 'ready', text: view.text, fingerprint: view.fingerprint } : null;

  // Copying only writes to the local clipboard; nothing is sent anywhere.
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState('copied');
    } catch {
      setCopyState('error');
    }
  };

  const chip = statusChip(view, t);
  const detailsDone = async (result: Promise<SaveStatus>) => {
    const status = await result;
    if (status === 'saved') setChanging(false);
    return status;
  };

  const detailsForm = (kind: 'address' | 'booking', cancellable: boolean) => kind === 'address' ? (
    <AddressForm
      id={`${panelId}-address`} initial={address} t={t} onReload={onReload}
      onSave={(a) => detailsDone(onSaveAddress(a))} onCancel={cancellable ? () => setChanging(false) : undefined}
    />
  ) : (
    <BookingForm
      name={`${panelId}-booking`} initial={bookingMethod} t={t} onReload={onReload}
      onSave={(m) => detailsDone(onSaveBooking(m))} onCancel={cancellable ? () => setChanging(false) : undefined}
    />
  );

  const changeKind = category === 'location' ? 'address' : category === 'booking' ? 'booking' : null;

  const body = (() => {
    if (session) {
      return (
        <ReplyEditor
          id={`${panelId}-editor`} label={t.editLabel(question)} session={session} suggestion={suggestion}
          t={t} onSave={onSave} onReload={onReload} onDone={() => setSession(null)}
        />
      );
    }
    if (changing && changeKind) return detailsForm(changeKind, true);

    if (view.kind === 'missing') {
      const inCard = view.missing.filter(fixedInCard);
      const inProfile = view.missing.filter((m) => !fixedInCard(m));
      return (
        <div className="space-y-3">
          <div className="rounded-v2-lg border border-v2-warning-200 bg-v2-warning-50 px-3.5 py-3">
            <p className="text-v2-xs font-semibold text-v2-text-primary">{t.missingTitle}</p>
            <ul className="mt-1.5 space-y-1">
              {view.missing.map((m) => (
                <li key={m} className="flex items-start gap-1.5 text-v2-xs text-v2-text-secondary leading-relaxed">
                  <AlertCircle size={12} className="mt-0.5 shrink-0 text-v2-warning-600" /> {t.missingFacts[m]}
                </li>
              ))}
            </ul>
          </div>
          {locked && <p className="text-v2-xs text-v2-text-secondary leading-relaxed">{t.lockedSave}</p>}
          {canWrite && inCard.map((m) => <div key={m}>{detailsForm(m === 'address' ? 'address' : 'booking', false)}</div>)}
          {inProfile.length > 0 && (
            <button onClick={() => onNavigate('/negocio')} className={btnSecondary}>{t.completeProfile}</button>
          )}
        </div>
      );
    }

    if (view.kind === 'suggested' && !canWrite) {
      return <p className="text-v2-xs text-v2-text-secondary leading-relaxed">{locked ? t.lockedSave : t.suggestedNote}</p>;
    }

    const stale = view.kind === 'saved' && view.stale;
    return (
      <div className="space-y-3">
        <div className="rounded-v2-lg border border-v2-border-light bg-v2-neutral-50/60 px-3.5 py-3">
          <p data-testid={`${panelId}-text`} className="whitespace-pre-wrap break-words text-v2-sm leading-relaxed text-v2-text-primary">{text}</p>
        </div>
        {view.kind === 'suggested' && <p className="text-v2-xs text-v2-text-tertiary leading-relaxed">{t.suggestedNote}</p>}
        {stale && (
          <div className="flex items-start gap-2 rounded-v2-lg border border-v2-warning-200 bg-v2-warning-50 px-3 py-2.5 text-v2-xs text-v2-warning-700 leading-relaxed">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <p>{view.suggestion.status === 'ready' ? t.staleNote : t.staleMissing}</p>
              {canWrite && view.suggestion.status === 'ready' && (
                <button
                  onClick={() => view.suggestion.status === 'ready' && setSession({ text: view.suggestion.text, basis: view.suggestion.fingerprint, refreshed: true })}
                  className="mt-1.5 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                >
                  <RefreshCw size={11} /> {t.refresh}
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={onCopy} className={btnPrimary}>
            {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />} {copyState === 'copied' ? t.copied : t.copy}
          </button>
          {canWrite && (
            <button
              onClick={() => setSession(view.kind === 'saved'
                ? { text: view.reply.content, basis: view.reply.source_fingerprint, refreshed: false }
                : { text: view.text, basis: view.fingerprint, refreshed: false })}
              className={btnSecondary}
            >
              <PenLine size={13} /> {t.edit}
            </button>
          )}
          {canWrite && view.kind === 'suggested' && (
            <SaveSuggestion t={t} onSave={() => onSave(view.text, 'template', view.fingerprint)} onReload={onReload} />
          )}
          {canWrite && changeKind && (
            <button onClick={() => setChanging(true)} className="text-v2-xs font-medium text-v2-text-tertiary underline underline-offset-2 hover:text-v2-primary-600">
              {changeKind === 'address' ? t.address.change : t.booking.change}
            </button>
          )}
        </div>
        <p aria-live="polite" className="text-v2-xs text-v2-success-700 min-h-[1rem]">{copyState === 'copied' ? t.copiedNote : ''}</p>
        {copyState === 'error' && <Notice tone="error" onClose={() => setCopyState('idle')} closeLabel={t.close}>{t.copyError}</Notice>}
      </div>
    );
  })();

  return (
    <li className="rounded-v2-lg border border-v2-border-light bg-white transition-shadow hover:shadow-v2-xs">
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span className="flex-1 min-w-0 text-v2-sm font-medium text-v2-text-primary">{question}</span>
        <span className={`hidden sm:inline-flex shrink-0 rounded-full border px-2 py-0.5 text-v2-xs font-medium ${chip.look}`}>{chip.label}</span>
        <ChevronDown size={16} className={`shrink-0 text-v2-text-tertiary transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      <span className={`sm:hidden mx-3.5 -mt-1.5 mb-2.5 inline-flex rounded-full border px-2 py-0.5 text-v2-xs font-medium ${chip.look}`}>{chip.label}</span>
      {open && <div id={panelId} className="border-t border-v2-border-light px-3.5 py-3.5">{body}</div>}
    </li>
  );
}

function SaveSuggestion({ t, onSave, onReload }: { t: RepliesCopy; onSave: () => Promise<SaveStatus>; onReload: () => void }) {
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<Exclude<SaveStatus, 'saved'> | null>(null);
  const submit = async () => {
    setSaving(true);
    setProblem(null);
    const result = await onSave();
    setSaving(false);
    if (result !== 'saved') setProblem(result);
  };
  return (
    <>
      <button onClick={submit} disabled={saving} className={btnSecondary}>
        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {saving ? t.saving : t.save}
      </button>
      {problem && (
        <div className="basis-full">
          <Notice tone="error">
            <p>{problem === 'conflict' ? t.conflict : problem === 'locked' ? t.lockedSave : t.saveError}</p>
            {problem === 'conflict' && <button onClick={onReload} className="mt-1.5 font-semibold underline underline-offset-2">{t.loadLatest}</button>}
          </Notice>
        </div>
      )}
    </>
  );
}
