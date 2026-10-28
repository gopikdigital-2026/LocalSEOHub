import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, Loader2, Wand2 } from 'lucide-react';
import { useBusiness } from '../business-memory/BusinessContext';
import { useI18n } from '../../lib/i18n';
import { getProposals } from '../publications/repository';
import { usePublicationResume } from '../publication-resume/context';
import { selectPublicationProposal } from '../publications/drafts/repository';
import { DraftError } from '../publications/drafts/types';
import type { Publication, PublicationProposal } from '../publications/types';
import { adaptPublication, getChannelDraft } from './repository';
import { ADAPTATIONS_PER_PUBLICATION, AdaptationError, type AdaptationResult, type ChannelDraft } from './types';
import { ADAPTATION_ERROR_TEXT, INTERNAL_NOTICE, LIMIT_SCOPE_TEXT, PANEL, ROLE_TEXT, SELECTION_ERROR_TEXT } from './copy';

type Busy = 'load' | 'select' | 'adapt' | null;
type Ready = Extract<Publication, { status: 'proposals_ready' }>;

const isReady = (p: Publication | null): p is Ready => p?.status === 'proposals_ready';

export default function ChannelAdaptationPanel() {
  const { currentBusiness } = useBusiness();
  const { lang } = useI18n();
  const { publication, refresh } = usePublicationResume();
  const [loaded, setLoaded] = useState(false);
  const [proposals, setProposals] = useState<PublicationProposal[]>([]);
  const [draft, setDraft] = useState<ChannelDraft | null>(null);
  const [result, setResult] = useState<AdaptationResult | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const t = (k: keyof typeof PANEL) => PANEL[k][lang];
  const pub = isReady(publication) && publication.businessId === currentBusiness?.id ? publication : null;
  const pubId = pub?.id ?? null;
  const generationId = pub?.proposals.generationId ?? null;

  const describe = (e: unknown): string => {
    if (e instanceof AdaptationError) {
      const base = ADAPTATION_ERROR_TEXT[e.code][lang];
      return e.scope ? `${base} ${LIMIT_SCOPE_TEXT[e.scope][lang]}` : base;
    }
    if (e instanceof DraftError) return SELECTION_ERROR_TEXT[e.code][lang];
    return ADAPTATION_ERROR_TEXT.unavailable[lang];
  };

  useEffect(() => {
    setProposals([]);
    setDraft(null);
    setResult(null);
    setError(null);
    setLoaded(false);
    setBusy(null);
    if (!pubId) return;
    let active = true;
    setBusy('load');
    Promise.all([getProposals(pubId), getChannelDraft(pubId)]).then(
      ([list, next]) => { if (active) { setProposals(list); setDraft(next); } },
      (e) => { if (active) setError(describe(e)); },
    ).finally(() => {
      if (active) { setLoaded(true); setBusy(null); }
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- describe only formats text for the current language
  }, [pubId, generationId]);

  if (!currentBusiness || !pub) return null;

  const choose = async (p: PublicationProposal) => {
    if (!pub || busy) return;
    setBusy('select');
    setError(null);
    try {
      await selectPublicationProposal(pub.id, p.position, p.generationId);
      setDraft(await getChannelDraft(pub.id));
      setResult(null);
      await refresh();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  };

  const adapt = async () => {
    if (!pub || !draft || busy) return;
    setBusy('adapt');
    setError(null);
    try {
      const out = await adaptPublication(pub.id, draft.version);
      setResult(out);
      setDraft(await getChannelDraft(pub.id));
      await refresh();
    } catch (e) {
      setError(describe(e));
    } finally {
      setBusy(null);
    }
  };

  const current = draft && pub && draft.sourceGenerationId === pub.proposals.generationId ? draft : null;
  const used = current?.adaptationsUsed ?? 0;
  const limitReached = used >= ADAPTATIONS_PER_PUBLICATION;
  const facebook = result?.facebook ?? current?.facebookText ?? null;
  const instagram = result?.instagram ?? current?.instagramText ?? null;

  return (
    <section className="bg-slate-100 font-v2 overflow-x-hidden" aria-label="channel-adaptation">
      <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="font-semibold text-slate-900">{t('title')}</h2>
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{INTERNAL_NOTICE}</p>
          <p className="text-xs text-slate-600">{t('privacy')}</p>
          {busy === 'load' && (
            <p role="status" className="inline-flex items-center gap-2 text-sm text-slate-600"><Loader2 className="w-4 h-4 animate-spin" aria-hidden />{t('loading')}</p>
          )}
          {loaded && proposals.length === 0 && !error && <p className="text-sm text-slate-600">{t('empty')}</p>}
        </div>

        {error && <p role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

        {pub && proposals.length === 3 && (
          <div className="space-y-3">
            {proposals.map((p) => {
              const chosen = current?.sourcePosition === p.position;
              return (
                <article
                  key={p.id}
                  className={`rounded-xl border bg-white p-4 space-y-3 transition-colors ${chosen ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-200'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-slate-900">{p.position}. {ROLE_TEXT[p.role][lang]}</h3>
                    {chosen ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><Check className="w-3.5 h-3.5" aria-hidden />{t('chosen')}</span>
                    ) : (
                      <button type="button" onClick={() => choose(p)} disabled={!!busy} className={BTN_SMALL}>{t('choose')}</button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{p.body}</p>
                  <p className="text-xs text-slate-600"><span className="font-medium">{t('cta')}:</span> {p.cta}</p>
                </article>
              );
            })}
            {busy === 'select' && <p role="status" className="text-sm text-slate-600">{t('selecting')}</p>}
          </div>
        )}

        {pub && proposals.length === 3 && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            {current ? (
              <>
                <Block title={`${t('original')} · ${ROLE_TEXT[current.sourceRole][lang]}`}>
                  <Field label={t('body')} text={current.sourceBody} copy={t('copy')} copied={t('copied')} />
                  <Field label={t('cta')} text={current.sourceCta} copy={t('copy')} copied={t('copied')} />
                </Block>
                <button type="button" onClick={adapt} disabled={!!busy || limitReached} aria-busy={busy === 'adapt'} className={BTN}>
                  {busy === 'adapt' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Wand2 className="w-4 h-4" aria-hidden />}
                  {t('adapt')}
                </button>
                {busy === 'adapt' && <p role="status" className="text-sm text-slate-600">{t('adapting')}</p>}
                {limitReached && <p className="text-xs text-amber-800">{t('limitReached')}</p>}
              </>
            ) : <p className="text-sm text-slate-600">{t('noSelection')}</p>}
          </div>
        )}

        {current && facebook && instagram && (
          <div className="grid gap-3 md:grid-cols-2">
            <Block title={t('facebook')}><Field label={t('body')} text={facebook} copy={t('copy')} copied={t('copied')} /></Block>
            <Block title={t('instagram')}><Field label={t('body')} text={instagram} copy={t('copy')} copied={t('copied')} /></Block>
          </div>
        )}

        {current && (
          <dl className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 break-all">
            <dt>{t('version')}</dt><dd>{current.version}</dd>
            <dt>{t('used')}</dt><dd>{used} / {ADAPTATIONS_PER_PUBLICATION}</dd>
            <dt>{t('adaptedAt')}</dt><dd>{current.adaptedAt ?? '-'}</dd>
            <dt>lang</dt><dd>{current.sourceLang}</dd>
          </dl>
        )}
      </div>
    </section>
  );
}

const BTN = 'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50';
const BTN_SMALL = 'rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50';

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, text, copy, copied }: { label: string; text: string; copy: string; copied: string }) {
  const [done, setDone] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(text).then(() => setDone(true), () => {})}
          className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded px-1"
        >
          {done ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
          {done ? copied : copy}
        </button>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">{text}</p>
    </div>
  );
}
