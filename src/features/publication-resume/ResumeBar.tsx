import { AlertTriangle, ArrowRight, Clock, FileImage, Loader2, PencilLine, Repeat } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { usePublicationResume } from './context';
import { STAGE_TEXT, RESUME } from './copy';
import type { ResumeCandidate } from './model';

const formatDate = (iso: string, lang: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(lang === 'en' ? 'en-GB' : 'es-ES', { dateStyle: 'medium', timeStyle: 'short' });
};

export default function ResumeBar() {
  const { state, publication, stage, open, close } = usePublicationResume();
  const { lang } = useI18n();
  const t = (k: keyof typeof RESUME) => RESUME[k][lang];

  if (state.status === 'loading') {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <Loader2 className="w-4 h-4 animate-spin" aria-hidden />{t('loading')}
      </p>
    );
  }

  if (state.status === 'unavailable' || state.status === 'other_business') {
    return (
      <div role="alert" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-start gap-2 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
          {state.status === 'unavailable' ? t('unavailable') : t('otherBusiness')}
        </p>
        <button type="button" onClick={() => close(true)} className={BTN_SECONDARY}>{t('backToList')}</button>
      </div>
    );
  }

  if (state.status === 'ready' && publication && stage) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-800">{t('current')}</p>
          <p className="text-sm font-medium text-slate-900">{t('stage')}: {STAGE_TEXT[stage][lang]}</p>
          <p className="truncate font-mono text-xs text-slate-600">{publication.id}</p>
        </div>
        <button type="button" onClick={() => close()} className={BTN_SECONDARY}>
          <Repeat className="w-4 h-4" aria-hidden />{t('switch')}
        </button>
      </div>
    );
  }

  if (state.status !== 'none' || state.candidates.length === 0) return null;

  return (
    <section aria-label="resume-chooser" className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="space-y-1">
        <h2 className="font-semibold text-slate-900">{t('chooserTitle')}</h2>
        <p className="text-xs text-slate-600">{t('chooserIntro')}</p>
      </div>
      <ul className="divide-y divide-slate-100">
        {state.candidates.map((c) => <CandidateRow key={c.id} candidate={c} lang={lang} onOpen={open} />)}
      </ul>
    </section>
  );
}

function CandidateRow({ candidate, lang, onOpen }: { candidate: ResumeCandidate; lang: 'es' | 'en'; onOpen: (id: string) => void }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500" aria-hidden>
        <FileImage className="w-5 h-5" />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium text-slate-900">{STAGE_TEXT[candidate.stage][lang]}</p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" aria-hidden />{RESUME.lastModified[lang]}: {formatDate(candidate.lastModified, lang)}
          </span>
          {candidate.edited && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-800">
              <PencilLine className="w-3.5 h-3.5" aria-hidden />{RESUME.edited[lang]}
            </span>
          )}
        </p>
      </div>
      <button type="button" onClick={() => onOpen(candidate.id)} className={BTN}>
        {RESUME.continue[lang]}<ArrowRight className="w-4 h-4" aria-hidden />
      </button>
    </li>
  );
}

const BTN = 'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';
const BTN_SECONDARY = 'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';
