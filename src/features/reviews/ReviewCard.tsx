import { useState } from 'react';
import { AlertCircle, Check, CheckCircle2, Copy, Loader2, MessageSquareReply, RefreshCw, Sparkles, Star, X } from 'lucide-react';
import type { ReviewsCopy } from './copy';
import type { Review } from './repository';

const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-v2-lg bg-v2-primary-600 px-3.5 py-2 text-v2-sm font-semibold text-white hover:bg-v2-primary-700 active:scale-[0.99] transition-all disabled:opacity-60 disabled:pointer-events-none';
const btnSecondary = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none';

export interface DraftState {
  text: string | null;
  loading: boolean;
  error: string | null;
}

interface Props {
  review: Review;
  t: ReviewsCopy;
  lang: 'es' | 'en';
  draft: DraftState | undefined;
  canDraft: boolean;
  onDraft(): void;
  onEdit(text: string): void;
  onDiscard(): void;
}

function formatDate(iso: string | null, lang: 'es' | 'en'): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
}

function Stars({ value, t }: { value: number | null; t: ReviewsCopy }) {
  if (value === null) return <span className="text-v2-xs text-v2-text-tertiary">{t.noRating}</span>;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={t.stars(value)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={14} className={i <= value ? 'fill-v2-warning-400 text-v2-warning-400' : 'text-v2-neutral-300'} />
      ))}
    </span>
  );
}

export default function ReviewCard({ review, t, lang, draft, canDraft, onDraft, onEdit, onDiscard }: Props) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const answered = review.ownerReply !== null;
  const date = formatDate(review.createTime, lang);
  const replyDate = formatDate(review.ownerReply?.updateTime ?? null, lang);

  const copy = async () => {
    if (!draft?.text) return;
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <li data-testid="review-card" data-answered={answered} className="rounded-v2-xl border border-v2-border-light bg-white p-5 transition-shadow hover:shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-v2-sm font-semibold truncate ${review.reviewerName ? 'text-v2-text-primary' : 'text-v2-text-tertiary'}`}>
            {review.reviewerName ?? t.noName}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Stars value={review.starRating} t={t} />
            {date && <span className="text-v2-xs text-v2-text-tertiary">{date}</span>}
          </div>
        </div>
        {answered ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-v2-success-50 px-2 py-0.5 text-[11px] font-medium text-v2-success-700">
            <CheckCircle2 size={11} /> {t.statusAnswered}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-v2-warning-50 px-2 py-0.5 text-[11px] font-medium text-v2-warning-700">
            <AlertCircle size={11} /> {t.unanswered}
          </span>
        )}
      </div>

      {review.comment ? (
        <p className="mt-3 text-v2-sm text-v2-text-primary leading-relaxed whitespace-pre-line">{review.comment}</p>
      ) : (
        <p className="mt-3 text-v2-sm italic text-v2-text-tertiary">{t.noComment}</p>
      )}

      {review.ownerReply && (
        <div className="mt-3 rounded-v2-lg border-l-2 border-v2-primary-300 bg-v2-neutral-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary">
            <MessageSquareReply size={12} /> {t.ownerReply}{replyDate ? ` · ${replyDate}` : ''}
          </p>
          <p className="mt-1 text-v2-sm text-v2-text-secondary leading-relaxed whitespace-pre-line">{review.ownerReply.comment}</p>
        </div>
      )}

      {draft?.text != null ? (
        <div data-testid="review-draft" className="mt-4 rounded-v2-lg border border-v2-primary-100 bg-v2-primary-50/50 p-3.5 animate-[fadeIn_200ms_ease-out]">
          <label htmlFor={`draft-${review.reviewId}`} className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-v2-primary-700">
            <Sparkles size={12} /> {t.draftLabel}
          </label>
          <textarea
            id={`draft-${review.reviewId}`}
            value={draft.text}
            onChange={(e) => onEdit(e.target.value)}
            rows={4}
            maxLength={1000}
            className="mt-2 w-full resize-y rounded-v2-lg border border-v2-border-light bg-white px-3 py-2.5 text-v2-sm text-v2-text-primary leading-relaxed focus:border-v2-primary-400 focus:outline-none focus:ring-2 focus:ring-v2-primary-100"
          />
          <p className="mt-1.5 text-[11px] text-v2-text-tertiary">{answered ? `${t.draftNote} ${t.altNote}` : t.draftNote}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" data-testid="review-copy" onClick={() => void copy()} disabled={!draft.text.trim()} className={btnPrimary}>
              {copyState === 'copied' ? <Check size={14} /> : <Copy size={14} />}
              {copyState === 'copied' ? t.copied : t.copy}
            </button>
            <button type="button" onClick={onDraft} disabled={draft.loading || !canDraft} className={btnSecondary}>
              {draft.loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {draft.loading ? t.drafting : t.regenerate}
            </button>
            <button type="button" onClick={onDiscard} disabled={draft.loading} className={btnSecondary}>
              <X size={13} /> {t.discard}
            </button>
          </div>
          {copyState === 'failed' && <p className="mt-2 text-[11px] text-v2-error-600">{t.copyFailed}</p>}
        </div>
      ) : (
        <div className="mt-4">
          <button type="button" data-testid="review-draft-cta" onClick={onDraft} disabled={draft?.loading || !canDraft} className={answered ? btnSecondary : btnPrimary}>
            {draft?.loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {draft?.loading ? t.drafting : answered ? t.altDraftCta : t.draftCta}
          </button>
        </div>
      )}
      {draft?.error && (
        <p className="mt-2 flex items-start gap-1.5 text-v2-xs text-v2-error-600"><AlertCircle size={13} className="mt-0.5 shrink-0" /> {draft.error}</p>
      )}
    </li>
  );
}
