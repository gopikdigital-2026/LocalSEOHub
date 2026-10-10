import { useMemo, useState } from 'react';
import { ChevronDown, MessagesSquare, RefreshCw } from 'lucide-react';
import { useBusiness } from '../business-memory/BusinessContext';
import { useBilling } from '../billing/BillingContext';
import { useI18n } from '../../lib/i18n';
import { Notice } from '../improvement/ImprovementEditor';
import { REPLIES_COPY } from './copy';
import { REPLY_CATEGORIES, factsFrom, replyView, type ReplyCategory } from './model';
import { ReplyItem } from './ReplyItem';
import { usePreparedReplies } from './usePreparedReplies';

export default function PreparedRepliesCard({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { lang } = useI18n();
  const t = REPLIES_COPY[lang];
  const { businessId, currentBusiness } = useBusiness();
  const { hasPremium } = useBilling();
  const { replies, details, phase, reload, save, updateDetails } = usePreparedReplies(businessId, lang);
  const [expanded, setExpanded] = useState(false);
  const [openCategory, setOpenCategory] = useState<ReplyCategory | null>(null);

  const facts = useMemo(() => factsFrom(currentBusiness, details), [currentBusiness, details]);
  const views = useMemo(
    () => REPLY_CATEGORIES.map((c) => ({ category: c, view: replyView(c, facts, lang, replies[c] ?? null) })),
    [facts, lang, replies],
  );
  const savedCount = views.filter((v) => v.view.kind === 'saved').length;
  const canWrite = hasPremium === true;
  const locked = hasPremium === false;
  const ready = Boolean(businessId) && phase === 'ready';

  return (
    <section data-testid="prepared-replies-card" className="rounded-v2-xl border border-v2-border-light bg-white p-5 sm:p-6 shadow-v2-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <MessagesSquare size={16} className="text-v2-primary-500" />
            <h2 className="text-v2-base font-semibold text-v2-text-primary">{t.title}</h2>
          </div>
          <p className="text-v2-xs text-v2-text-secondary mt-1 leading-relaxed">{t.intro}</p>
        </div>
        {ready && (
          <span className="rounded-full border border-v2-border-light bg-v2-neutral-50 px-2.5 py-0.5 text-v2-xs font-medium text-v2-text-secondary">
            {t.savedSummary(savedCount, REPLY_CATEGORIES.length)}
          </span>
        )}
      </div>

      <div className="mt-4">
        {!businessId || phase === 'loading' ? (
          <div className="h-10 rounded-v2-lg bg-v2-neutral-50 animate-pulse" aria-hidden="true" />
        ) : phase === 'load_error' ? (
          <Notice tone="error">
            <p>{t.loadError}</p>
            <button onClick={() => void reload()} className="mt-1.5 inline-flex items-center gap-1 font-semibold underline underline-offset-2"><RefreshCw size={11} /> {t.retry}</button>
          </Notice>
        ) : (
          <>
            <button
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls="prepared-replies-list"
              className="inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-semibold text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors"
            >
              {expanded ? t.hideAll : t.showAll}
              <ChevronDown size={14} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </button>
            {expanded && (
              <div className="mt-3 space-y-3">
                {locked && <p className="text-v2-xs text-v2-text-secondary leading-relaxed">{t.lockedIntro}</p>}
                <ul id="prepared-replies-list" className="space-y-2">
                  {views.map(({ category, view }) => (
                    <ReplyItem
                      key={`${lang}-${category}`}
                      category={category}
                      view={view}
                      t={t}
                      open={openCategory === category}
                      canWrite={canWrite}
                      locked={locked}
                      address={details?.address ?? ''}
                      bookingMethod={details?.booking_method ?? null}
                      onToggle={() => setOpenCategory((c) => (c === category ? null : category))}
                      onSave={(content, origin, fingerprint) => save({ category, content, origin, fingerprint })}
                      onSaveAddress={(address) => updateDetails({ address })}
                      onSaveBooking={(booking_method) => updateDetails({ booking_method })}
                      onReload={() => void reload()}
                      onNavigate={onNavigate}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
