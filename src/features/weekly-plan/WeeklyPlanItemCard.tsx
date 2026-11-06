import { ArrowRight, Check, Clock, X } from 'lucide-react';
import { PRIORITY_LABELS, ctaLabel, type ActionLang } from '../actions/engine';
import type { ActionPriority, BusinessAction } from '../actions/types';
import ImprovementHint from '../improvement/ImprovementHint';
import { offersImprovement } from '../improvement/model';
import { WEEKLY_PLAN_COPY } from './copy';
import type { WeeklyItemState, WeeklyPlanItem } from './model';
import { WEEKLY_PAGE_COPY } from './pageCopy';

export interface ItemHandlers {
  onOpen(a: BusinessAction): void;
  onPrepare(a: BusinessAction): void;
  onComplete(a: BusinessAction): void;
  onDismiss(a: BusinessAction): void;
}

const PRIORITY_TONE: Record<ActionPriority, string> = {
  HIGH: 'text-v2-error-600 bg-v2-error-50 border-v2-error-200',
  MEDIUM: 'text-v2-warning-700 bg-v2-warning-50 border-v2-warning-200',
  LOW: 'text-v2-neutral-600 bg-v2-neutral-50 border-v2-neutral-200',
};

const STATE_TONE: Record<WeeklyItemState, string> = {
  pending: 'text-v2-neutral-600 bg-v2-neutral-50 border-v2-neutral-200',
  in_progress: 'text-v2-primary-700 bg-v2-primary-50 border-v2-primary-200',
  executed: 'text-v2-success-700 bg-v2-success-50 border-v2-success-200',
  data_completed: 'text-v2-secondary-700 bg-v2-secondary-50 border-v2-secondary-200',
  dismissed: 'text-v2-neutral-500 bg-v2-neutral-50 border-v2-neutral-200',
  outdated: 'text-v2-neutral-500 bg-v2-neutral-50 border-v2-neutral-200',
};

interface Props extends ItemHandlers {
  item: WeeklyPlanItem;
  lang: ActionLang;
  rank?: number;
  busy: boolean;
  readOnly: boolean;
}

export default function WeeklyPlanItemCard({ item, lang, rank, busy, readOnly, onOpen, onPrepare, onComplete, onDismiss }: Props) {
  const c = WEEKLY_PAGE_COPY[lang];
  const open = item.state === 'pending' || item.state === 'in_progress';
  const titleId = `weekly-item-${item.action.id}`;
  return (
    <article
      aria-labelledby={titleId}
      data-testid="weekly-item"
      data-state={item.state}
      className="rounded-v2-xl border border-v2-border-light bg-white p-4 sm:p-5 transition-colors hover:border-v2-primary-200"
    >
      <div className="flex items-start gap-3">
        {rank !== undefined && (
          <span aria-hidden="true" className="w-8 h-8 shrink-0 rounded-v2-lg bg-v2-primary-50 text-v2-primary-700 text-v2-sm font-semibold flex items-center justify-center">
            {rank}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 id={titleId} className="text-v2-sm font-semibold text-v2-text-primary">{item.title}</h3>
            <span data-testid="item-state" className={`text-v2-xs font-medium border rounded-full px-2 py-0.5 ${STATE_TONE[item.state]}`}>
              {c.states[item.state]}
            </span>
          </div>
          <p className="text-v2-xs text-v2-text-secondary leading-relaxed">
            <span className="font-semibold text-v2-text-primary">{c.why}: </span>{item.why}
          </p>
          <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-v2-xs text-v2-text-tertiary">
            <div className="flex items-center gap-1">
              <dt className="sr-only">{c.priority}</dt>
              <dd className={`font-medium border rounded-full px-2 py-0.5 ${PRIORITY_TONE[item.priority]}`}>
                {c.priority}: {PRIORITY_LABELS[lang][item.priority]}
              </dd>
            </div>
            <div className="flex items-center gap-1" data-origin={item.origin}>
              <dt>{c.source}:</dt>
              <dd data-testid="item-source" className="text-v2-text-secondary">{item.sourceLabel}</dd>
            </div>
            {item.effort && (
              <div className="flex items-center gap-1">
                <dt className="sr-only">{c.effort}</dt>
                <dd data-testid="item-effort" className="flex items-center gap-1">
                  <Clock size={11} aria-hidden="true" /> {WEEKLY_PLAN_COPY[lang].effortEstimate(item.effort.minutes)}
                </dd>
              </div>
            )}
          </dl>
          {open && (
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 mt-4">
              <button
                type="button"
                disabled={busy}
                onClick={() => onOpen(item.action)}
                className="inline-flex items-center justify-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3 py-2 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 disabled:opacity-50 transition-colors"
              >
                {readOnly ? c.view : ctaLabel(item.action, lang)} <ArrowRight size={12} aria-hidden="true" />
              </button>
              {item.canMarkDone && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onComplete(item.action)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-v2-lg border border-v2-border-light px-3 py-2 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-success-300 hover:text-v2-success-700 disabled:opacity-50 transition-colors"
                >
                  <Check size={12} aria-hidden="true" /> {c.markDone}
                </button>
              )}
              {!readOnly && !item.canMarkDone && <span className="text-v2-xs text-v2-text-tertiary">{c.autoClose}</span>}
              {item.canDismiss && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDismiss(item.action)}
                  className="sm:ml-auto inline-flex items-center justify-center gap-1.5 rounded-v2-lg px-3 py-2 text-v2-xs font-medium text-v2-text-tertiary hover:text-v2-text-primary hover:bg-v2-neutral-100 disabled:opacity-50 transition-colors"
                >
                  <X size={12} aria-hidden="true" /> {c.dismiss}
                </button>
              )}
            </div>
          )}
          {open && !readOnly && offersImprovement(item.action) && <ImprovementHint lang={lang} onClick={() => onPrepare(item.action)} />}
        </div>
      </div>
    </article>
  );
}
