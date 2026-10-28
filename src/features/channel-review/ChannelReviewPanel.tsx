import { useEffect, useState } from 'react';
import { AlertTriangle, Check, CircleDot, Loader2, RefreshCw, RotateCcw, Save } from 'lucide-react';
import { useBusiness } from '../business-memory/BusinessContext';
import { useI18n, type Lang } from '../../lib/i18n';
import { listDrafts } from '../publications/repository';
import type { Publication } from '../publications/types';
import { countChars, isDirty, isEdited, readiness, textIssue } from './model';
import { getReviewDraft, saveChannelDrafts } from './repository';
import { CHANNEL_LIMITS, ReviewError, type Channel, type ChannelChange, type ReviewDraft } from './types';
import { CHANNEL_NAME, INTERNAL_NOTICE, ISSUE_TEXT, NOTHING_PUBLISHED, REVIEW, REVIEW_ERROR_TEXT } from './copy';

type Ready = Extract<Publication, { status: 'proposals_ready' }>;
type Busy = 'load' | 'save' | `restore-${Channel}` | null;
type Texts = Record<Channel, string>;

const CHANNELS: readonly Channel[] = ['facebook', 'instagram'];

function latestReady(pubs: Publication[]): Ready | null {
  const ready = pubs.filter((p): p is Ready => p.status === 'proposals_ready');
  ready.sort((a, b) => b.proposals.generatedAt.localeCompare(a.proposals.generatedAt));
  return ready[0] ?? null;
}

const savedText = (d: ReviewDraft, c: Channel) => (c === 'facebook' ? d.facebookText : d.instagramText);
const generatedText = (d: ReviewDraft, c: Channel) => (c === 'facebook' ? d.facebookGenerated : d.instagramGenerated);
const textsOf = (d: ReviewDraft): Texts => ({ facebook: d.facebookText, instagram: d.instagramText });

export default function ChannelReviewPanel() {
  const { currentBusiness } = useBusiness();
  const { lang } = useI18n();
  const [pub, setPub] = useState<Ready | null>(null);
  const [draft, setDraft] = useState<ReviewDraft | null>(null);
  const [local, setLocal] = useState<Texts>({ facebook: '', instagram: '' });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<{ text: string; stale: boolean } | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const t = (k: keyof typeof REVIEW) => REVIEW[k][lang];

  const dirty = (c: Channel) => !!draft && isDirty(local[c], savedText(draft, c));
  const anyDirty = !!draft && CHANNELS.some(dirty);

  useEffect(() => {
    if (!anyDirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [anyDirty]);

  if (!currentBusiness) return null;
  const businessId = currentBusiness.id;

  const fail = (e: unknown) => {
    const err = e instanceof ReviewError ? e : new ReviewError('internal_error');
    const base = REVIEW_ERROR_TEXT[err.code][lang];
    setError({ text: err.reason ? `${base} ${ISSUE_TEXT[err.reason][lang]}` : base, stale: err.code === 'stale_draft' || err.code === 'busy' });
  };

  const load = async () => {
    if (busy) return;
    if (anyDirty && !window.confirm(t('leaveWarning'))) return;
    setBusy('load');
    setError(null);
    setJustSaved(false);
    try {
      const latest = latestReady(await listDrafts(businessId));
      const next = latest ? await getReviewDraft(latest.id) : null;
      setPub(latest);
      setDraft(next);
      if (next) setLocal(textsOf(next));
    } catch (e) {
      fail(e);
    } finally {
      setLoaded(true);
      setBusy(null);
    }
  };

  const persist = async (kind: Busy, facebook: ChannelChange, instagram: ChannelChange, after: (d: ReviewDraft) => Texts) => {
    if (!draft || busy) return;
    setBusy(kind);
    setError(null);
    setJustSaved(false);
    try {
      const next = await saveChannelDrafts(draft, facebook, instagram);
      setDraft(next);
      setLocal(after(next));
      setJustSaved(true);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  };

  const save = () => {
    const change = (c: Channel): ChannelChange => (dirty(c) ? { kind: 'text', text: local[c] } : { kind: 'keep' });
    void persist('save', change('facebook'), change('instagram'), textsOf);
  };

  const restore = (c: Channel) => {
    if (dirty(c) && !window.confirm(t('restoreConfirm'))) return;
    const pick = (x: Channel): ChannelChange => (x === c ? { kind: 'restore' } : { kind: 'keep' });
    void persist(`restore-${c}`, pick('facebook'), pick('instagram'), (next) => ({ ...local, [c]: savedText(next, c) }));
  };

  const current = draft && pub && draft.sourceGenerationId === pub.proposals.generationId ? draft : null;
  const state = readiness(current, pub?.proposals.generationId ?? null);
  const localValid = CHANNELS.every((c) => textIssue(local[c], c) === null);

  return (
    <section className="bg-slate-100 font-v2 overflow-x-hidden" aria-label="channel-review">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-12">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">{t('title')}</h2>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{INTERNAL_NOTICE}</p>
          <p className="text-xs text-slate-600">{t('intro')} {NOTHING_PUBLISHED[lang]}</p>
          <button type="button" onClick={load} disabled={!!busy} className={BTN_SECONDARY}>
            {busy === 'load' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCw className="w-4 h-4" aria-hidden />}
            {busy === 'load' ? t('loading') : draft ? t('reload') : t('load')}
          </button>
          {loaded && !current && busy !== 'load' && !error && <p className="text-sm text-slate-600">{t('empty')}</p>}
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
            <div className="space-y-2">
              <p>{error.text}</p>
              {error.stale && <button type="button" onClick={load} disabled={!!busy} className={BTN_SMALL}>{t('reload')}</button>}
            </div>
          </div>
        )}

        {current && (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              {CHANNELS.map((c) => (
                <ChannelEditor
                  key={c}
                  channel={c}
                  lang={lang}
                  value={local[c]}
                  edited={isEdited(local[c], generatedText(current, c))}
                  dirty={dirty(c)}
                  canRestore={isEdited(savedText(current, c), generatedText(current, c)) || dirty(c)}
                  disabled={!!busy}
                  restoring={busy === `restore-${c}`}
                  onChange={(v) => { setLocal((prev) => ({ ...prev, [c]: v })); setJustSaved(false); }}
                  onRestore={() => restore(c)}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
              <button type="button" onClick={save} disabled={!!busy || !anyDirty || !localValid} aria-busy={busy === 'save'} className={BTN}>
                {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
                {busy === 'save' ? t('saving') : t('save')}
              </button>
              <span role="status" className={`inline-flex items-center gap-1.5 text-sm font-medium ${anyDirty ? 'text-amber-700' : 'text-emerald-700'}`}>
                {anyDirty ? <CircleDot className="w-4 h-4" aria-hidden /> : <Check className="w-4 h-4" aria-hidden />}
                {anyDirty ? t('unsaved') : t('saved')}
              </span>
            </div>

            {justSaved && !anyDirty && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-1 text-sm text-emerald-900">
                <p className="inline-flex items-center gap-1.5 font-semibold"><Check className="w-4 h-4" aria-hidden />{t('savedTitle')}</p>
                {CHANNELS.map((c) => (
                  <p key={c}>{CHANNEL_NAME[c]}: {isEdited(savedText(current, c), generatedText(current, c)) ? t('edited') : t('generated')}</p>
                ))}
              </div>
            )}

            <dl className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
              <dt>{t('status')}</dt>
              <dd className="font-medium text-slate-900">{state === 'ready' ? (anyDirty ? t('reviewing') : t('ready')) : t('notReady')}</dd>
              <dt>{t('version')}</dt><dd>{current.version}</dd>
            </dl>
            <p className="text-sm font-medium text-slate-700">{NOTHING_PUBLISHED[lang]}</p>
          </>
        )}
      </div>
    </section>
  );
}

interface EditorProps {
  channel: Channel;
  lang: Lang;
  value: string;
  edited: boolean;
  dirty: boolean;
  canRestore: boolean;
  disabled: boolean;
  restoring: boolean;
  onChange: (value: string) => void;
  onRestore: () => void;
}

function ChannelEditor({ channel, lang, value, edited, dirty, canRestore, disabled, restoring, onChange, onRestore }: EditorProps) {
  const count = countChars(value);
  const max = CHANNEL_LIMITS[channel];
  const issue = textIssue(value, channel);
  const id = `review-${channel}`;
  const counterTone = count > max ? 'text-red-700' : count > max * 0.9 ? 'text-amber-700' : 'text-slate-500';
  return (
    <div className={`rounded-xl border bg-white p-4 space-y-2 transition-colors ${issue ? 'border-red-300' : dirty ? 'border-amber-300' : 'border-slate-200'}`}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="font-semibold text-slate-900">{CHANNEL_NAME[channel]}</label>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${edited ? 'bg-sky-50 text-sky-800' : 'bg-slate-100 text-slate-700'}`}>
          {edited ? REVIEW.edited[lang] : REVIEW.generated[lang]}
        </span>
      </div>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={9}
        aria-invalid={!!issue}
        aria-describedby={`${id}-count${issue ? ` ${id}-issue` : ''}`}
        className="w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200"
      />
      <div className="flex items-center justify-between gap-2">
        <span id={`${id}-count`} className={`text-xs tabular-nums ${counterTone}`}>{count} / {max}</span>
        <button type="button" onClick={onRestore} disabled={disabled || !canRestore} className={BTN_SMALL}>
          {restoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
          {REVIEW.restore[lang]}
        </button>
      </div>
      {issue && <p id={`${id}-issue`} className="text-xs text-red-700">{ISSUE_TEXT[issue][lang]}</p>}
    </div>
  );
}

const BTN = 'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_SECONDARY = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_SMALL = 'inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50';
