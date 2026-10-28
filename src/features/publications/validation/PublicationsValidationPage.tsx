import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { Check, Copy, ImageUp, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useBusiness } from '../../business-memory/BusinessContext';
import { useI18n } from '../../../lib/i18n';
import { attachImage, createDraft, deleteDraft, generateProposals, getProposals } from '../repository';
import { usePublicationResume } from '../../publication-resume/context';
import ResumeBar from '../../publication-resume/ResumeBar';
import {
  PUBLICATION_GENERATIONS_LIMIT,
  PUBLICATION_LANGS,
  PublicationError,
  type Publication,
  type PublicationDiagnostic,
  type PublicationErrorCode,
  type PublicationGrounding,
  type PublicationLang,
  type PublicationMismatch,
  type PublicationProposal,
} from '../types';
import { ERROR_TEXT, ROLE_LABEL, UI } from './copy';

type Busy = 'upload' | 'generate' | 'delete' | null;

const codeOf = (e: unknown): PublicationErrorCode => (e instanceof PublicationError ? e.code : 'unavailable');

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true), () => {})}
      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded px-1"
    >
      {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
      {copied ? done : label}
    </button>
  );
}

export default function PublicationsValidationPage() {
  useNoIndex();
  const { currentBusiness, loading } = useBusiness();
  const { lang: appLang } = useI18n();
  const [lang, setLang] = useState<PublicationLang>(appLang);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const resume = usePublicationResume();
  const pub = resume.publication;
  const [proposals, setProposals] = useState<PublicationProposal[]>([]);
  const [grounding, setGrounding] = useState<PublicationGrounding | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<PublicationErrorCode | null>(null);
  const [mismatch, setMismatch] = useState<PublicationMismatch | null>(null);
  const [diagnostic, setDiagnostic] = useState<PublicationDiagnostic | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = (k: keyof typeof UI) => UI[k][appLang];

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pubId = pub?.id ?? null;
  const pubGeneration = pub?.proposals?.generationId ?? null;
  const pubLang = pub?.proposals?.lang ?? null;

  useEffect(() => {
    setGrounding(null);
    setMismatch(null);
    setDiagnostic(null);
    setElapsedMs(null);
    setError(null);
    if (pubId) return;
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  }, [pubId]);

  // The server is the source of truth: on resume, show the proposal set that is current for this publication.
  useEffect(() => {
    if (!pubId || !pubGeneration) {
      setProposals([]);
      return;
    }
    if (pubLang) setLang(pubLang);
    let active = true;
    getProposals(pubId).then(
      (list) => { if (active) setProposals(list.length === 3 && list[0].generationId === pubGeneration ? list : []); },
      () => { if (active) setError('unavailable'); },
    );
    return () => { active = false; };
  }, [pubId, pubGeneration, pubLang]);

  if (loading) return <Shell><p className="text-sm text-slate-600"><Loader2 className="inline w-4 h-4 animate-spin mr-2" aria-hidden />...</p></Shell>;
  if (!currentBusiness) return <Shell><p role="alert" className="text-sm text-red-700">{t('noBusiness')}</p></Shell>;
  const businessId = currentBusiness.id;

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setError(null);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const upload = async () => {
    if (!file || busy) return;
    setBusy('upload');
    setError(null);
    let draft: Publication | null = null;
    try {
      const target = pub ?? (draft = await createDraft(businessId));
      resume.adopt(await attachImage(target.id, file));
    } catch (e) {
      setError(codeOf(e));
      if (draft) await deleteDraft(draft.id).catch(() => {});
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    if (!pub || busy) return;
    setBusy('generate');
    setError(null);
    setMismatch(null);
    setDiagnostic(null);
    const started = performance.now();
    try {
      const out = await generateProposals(pub.id, lang);
      setProposals(out.proposals);
      setGrounding(out.grounding);
      setElapsedMs(Math.round(performance.now() - started));
      await resume.refresh();
    } catch (e) {
      setError(codeOf(e));
      if (e instanceof PublicationError) setDiagnostic(e.diagnostic ?? null);
      if (e instanceof PublicationError && e.code === 'business_image_mismatch') {
        setMismatch(e.mismatch ?? null);
        setProposals([]);
        setGrounding(null);
        setElapsedMs(Math.round(performance.now() - started));
      }
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!pub || busy) return;
    setBusy('delete');
    setError(null);
    try {
      await deleteDraft(pub.id);
      resume.close(true);
    } catch (e) {
      setError(codeOf(e));
    } finally {
      setBusy(null);
    }
  };

  const used = pub?.generationsUsed ?? 0;
  const limitReached = used >= PUBLICATION_GENERATIONS_LIMIT;

  return (
    <Shell>
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{t('internal')}</p>
        <p className="text-xs text-slate-600">{t('privacy')}</p>
        <p className="text-sm text-slate-700"><span className="font-medium">{t('business')}:</span> {currentBusiness.name}</p>
      </header>

      <ResumeBar />

      {(resume.state.status === 'none' || resume.state.status === 'ready') && (<>

      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="font-semibold text-slate-900">{t('step1')}</h2>
        <label className="block text-sm text-slate-700">
          {t('fileLabel')} <span className="text-slate-500">({t('constraints')})</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            onChange={onFile}
            disabled={!!pub?.image || !!busy}
            className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-white disabled:opacity-50"
          />
        </label>
        {preview && <img src={preview} alt="" className="max-h-80 w-auto max-w-full rounded-lg border border-slate-200 object-contain" />}
        {!pub?.image && (
          <button type="button" onClick={upload} disabled={!file || !!busy} className={BTN}>
            {busy === 'upload' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <ImageUp className="w-4 h-4" aria-hidden />}
            {busy === 'upload' ? t('uploading') : t('upload')}
          </button>
        )}
        {pub?.image && <p className="text-sm text-emerald-700 flex items-center gap-1"><Check className="w-4 h-4" aria-hidden />{t('uploaded')}</p>}
        {pub?.image && <p className="text-xs text-slate-500">{t('replaceHint')}</p>}
      </section>

      {pub?.image && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">{t('step2')}</h2>
          <fieldset className="flex gap-4" disabled={!!busy}>
            <legend className="text-sm text-slate-700 mb-1">{t('language')}</legend>
            {PUBLICATION_LANGS.map((l) => (
              <label key={l} className="flex items-center gap-2 text-sm">
                <input type="radio" name="lang" value={l} checked={lang === l} onChange={() => setLang(l)} />
                {l === 'es' ? 'Español' : 'English'}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={generate} disabled={!!busy || limitReached} aria-busy={busy === 'generate'} className={BTN}>
              {busy === 'generate' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Sparkles className="w-4 h-4" aria-hidden />}
              {proposals.length ? t('regenerate') : t('generate')}
            </button>
            <button type="button" onClick={remove} disabled={!!busy} className={BTN_SECONDARY}>
              {busy === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Trash2 className="w-4 h-4" aria-hidden />}
              {busy === 'delete' ? t('removing') : t('remove')}
            </button>
          </div>
          <p className="text-xs text-slate-600">{used} / {PUBLICATION_GENERATIONS_LIMIT}{limitReached ? ` — ${t('limitReached')}` : ''}</p>
          {busy === 'generate' && <p role="status" className="text-sm text-slate-600">{t('generating')}</p>}
        </section>
      )}

      {error && (
        <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-1">
          <p className={mismatch ? 'font-medium' : undefined}>{ERROR_TEXT[error][appLang]}</p>
          {error === 'business_image_mismatch' && mismatch && <p>{mismatch.message}</p>}
          {diagnostic && (
            <p className="text-xs font-mono text-red-800/80">
              {t('diagnostic')}: {diagnostic.code}{diagnostic.stage ? ` · ${diagnostic.stage}` : ''}
            </p>
          )}
        </div>
      )}

      {grounding && (grounding.observed.length > 0 || grounding.uncertain.length > 0) && (
        <section className="grid gap-3 sm:grid-cols-2">
          <List title={t('observed')} items={grounding.observed} />
          <List title={t('uncertain')} items={grounding.uncertain} />
        </section>
      )}

      {proposals.length === 3 && (
        <section className="space-y-3" aria-label="proposals">
          {proposals.map((p) => (
            <article key={p.id} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
              <h3 className="font-semibold text-slate-900">{ROLE_LABEL[p.role][appLang]}</h3>
              <Field label={t('body')} text={p.body} copy={t('copy')} copied={t('copied')} />
              <Field label={t('cta')} text={p.cta} copy={t('copy')} copied={t('copied')} />
            </article>
          ))}
        </section>
      )}

      {pub && (
        <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
          <h2 className="font-semibold text-slate-900 text-sm mb-2">{t('technical')}</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 break-all">
            <dt>status</dt><dd>{pub.status}</dd>
            <dt>image</dt><dd>{pub.image ? `${pub.image.mime} · ${pub.image.width}×${pub.image.height} · ${Math.round(pub.image.bytes / 1024)} KB` : '-'}</dd>
            <dt>generation</dt><dd>{used} / {PUBLICATION_GENERATIONS_LIMIT}</dd>
            {pub.proposals && <><dt>lang</dt><dd>{pub.proposals.lang}</dd></>}
            {pub.proposals && <><dt>generation_id</dt><dd>{pub.proposals.generationId}</dd></>}
            <dt>proposals</dt><dd>{proposals.length}</dd>
            {elapsedMs !== null && <><dt>elapsed</dt><dd>{(elapsedMs / 1000).toFixed(1)} s</dd></>}
          </dl>
        </section>
      )}
      </>)}
    </Shell>
  );
}

const BTN = 'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_SECONDARY = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50';

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-100 font-v2 overflow-x-hidden">
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">{children}</div>
    </main>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{title}</h3>
      {items.length ? (
        <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
      ) : <p className="text-sm text-slate-500">-</p>}
    </div>
  );
}

function Field({ label, text, copy, copied }: { label: string; text: string; copy: string; copied: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <CopyButton text={text} label={copy} done={copied} />
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">{text}</p>
    </div>
  );
}
