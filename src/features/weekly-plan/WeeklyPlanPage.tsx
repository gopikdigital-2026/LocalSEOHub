import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarDays, ChevronDown, Info, Lock, Plug, RefreshCw, Target, X } from 'lucide-react';
import { LoadingState } from '../../components/ui';
import { useActions } from '../actions/ActionsContext';
import { actionTarget } from '../actions/engine';
import type { BusinessAction } from '../actions/types';
import { goalLabel } from '../activation/milestones';
import { useBilling } from '../billing/BillingContext';
import { PaywallNotice } from '../billing/BillingNotices';
import { PremiumRequiredError } from '../billing/model';
import { useBusiness } from '../business-memory/BusinessContext';
import { useI18n } from '../../lib/i18n';
import { WEEKLY_PLAN_COPY } from './copy';
import { buildWeeklyPlan, type WeeklyPlanItem } from './model';
import { WEEKLY_PAGE_COPY } from './pageCopy';
import WeeklyPlanItemCard from './WeeklyPlanItemCard';

function formatDay(date: Date, lang: 'es' | 'en') {
  return date.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { day: 'numeric', month: 'long' });
}

function StateCard({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-8 text-center">
      <div className="flex justify-center mb-3">{icon}</div>
      <h2 className="text-v2-base font-semibold text-v2-text-primary mb-1">{title}</h2>
      <p className="text-v2-sm text-v2-text-secondary mb-4">{text}</p>
      {children}
    </div>
  );
}

function ActivityGroup({ title, items, note }: { title: string; items: WeeklyPlanItem[]; note?: string }) {
  if (items.length === 0) return null;
  return (
    <div data-testid="activity-group" className="space-y-2">
      <h3 className="flex flex-wrap items-baseline gap-2 text-v2-xs font-semibold text-v2-text-secondary">
        {title} <span className="text-v2-text-tertiary font-medium">({items.length})</span>
        {note && <span className="text-v2-text-tertiary font-medium">· {note}</span>}
      </h3>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i.action.id} data-state={i.state} className="text-v2-sm text-v2-text-primary rounded-v2-lg bg-v2-neutral-50 px-3 py-2">{i.title}</li>
        ))}
      </ul>
    </div>
  );
}

export default function WeeklyPlanPage() {
  const { currentBusiness, loading: businessLoading } = useBusiness();
  const { hasPremium } = useBilling();
  const { lang } = useI18n();
  const c = WEEKLY_PAGE_COPY[lang];
  const base = WEEKLY_PLAN_COPY[lang];
  const navigate = useNavigate();
  const { actions, loading: actionsLoading, ready, error, ensureFresh, refresh, start, complete, dismiss, locked } = useActions();
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [showLater, setShowLater] = useState(false);

  useEffect(() => { ensureFresh(); }, [ensureFresh]);

  const businessId = currentBusiness?.id ?? null;
  const goal = currentBusiness?.primary_goal ?? null;
  const plan = useMemo(
    () => (businessId ? buildWeeklyPlan({ businessId, actions, lang, access: { hasPremium }, goal }) : null),
    [businessId, actions, lang, hasPremium, goal],
  );

  const awaitingFirstSync = Boolean(currentBusiness?.onboarding_completed) && !ready;
  const hasAny = plan !== null && (plan.focus.length + plan.progress.done + plan.dismissedThisWeek.length + plan.outdatedThisWeek.length) > 0;
  if (businessLoading || ((awaitingFirstSync || actionsLoading) && !hasAny)) return <LoadingState message={c.loading} />;

  if (!currentBusiness || !plan) {
    return (
      <StateCard icon={<Target size={32} className="text-v2-neutral-300" />} title={c.noBusinessTitle} text={c.noBusinessText}>
        <PrimaryLink onClick={() => navigate('/negocio')}>{c.completeProfile}</PrimaryLink>
      </StateCard>
    );
  }

  if (error && !hasAny) {
    return (
      <StateCard icon={<AlertTriangle size={32} className="text-v2-warning-500" />} title={c.errorTitle} text={c.errorText}>
        <PrimaryLink onClick={() => refresh()} icon={<RefreshCw size={14} aria-hidden="true" />}>{c.retry}</PrimaryLink>
      </StateCard>
    );
  }

  const profileIncomplete = !currentBusiness.onboarding_completed;
  if (profileIncomplete && !hasAny) {
    return (
      <StateCard icon={<Target size={32} className="text-v2-neutral-300" />} title={c.emptyTitle} text={c.emptyText}>
        <PrimaryLink onClick={() => navigate('/negocio')}>{c.completeProfile}</PrimaryLink>
      </StateCard>
    );
  }

  const run = async (a: BusinessAction, op: (a: BusinessAction) => Promise<void>, fallback: string) => {
    setActionError(null);
    setBusy((s) => new Set(s).add(a.id));
    try {
      await op(a);
      return true;
    } catch (err) {
      setActionError(err instanceof PremiumRequiredError ? c.locked : fallback);
      return false;
    } finally {
      setBusy((s) => { const next = new Set(s); next.delete(a.id); return next; });
    }
  };
  const handlers = {
    onOpen: async (a: BusinessAction) => {
      if (!plan.readOnly && a.status === 'PENDING' && !(await run(a, start, c.failStart))) return;
      navigate(actionTarget(a));
    },
    onPrepare: (a: BusinessAction) => navigate(`/ejecutar/${a.id}`),
    onComplete: (a: BusinessAction) => { void run(a, complete, c.failComplete); },
    onDismiss: (a: BusinessAction) => { void run(a, dismiss, c.failDismiss); },
  };
  const card = (item: WeeklyPlanItem, rank?: number) => (
    <WeeklyPlanItemCard key={item.action.id} item={item} lang={lang} rank={rank} busy={busy.has(item.action.id)} readOnly={plan.readOnly} {...handlers} />
  );

  const { done, pending, percent, addedThisWeek } = plan.progress;
  const lastDay = new Date(plan.week.to);
  lastDay.setDate(lastDay.getDate() - 1);
  const goalText = goalLabel(goal, lang);
  const missingSources = [...plan.focus, ...plan.later].some((i) => i.sourceType === 'SOURCE_REQUIRED');
  const activityCount = plan.executedThisWeek.length + plan.resolvedThisWeek.length + plan.dismissedThisWeek.length + plan.outdatedThisWeek.length;

  return (
    <div className="space-y-6" data-testid="weekly-plan-page">
      <header>
        <p className="flex items-center gap-1.5 text-v2-xs font-medium text-v2-primary-700">
          <CalendarDays size={14} aria-hidden="true" />
          <span data-testid="week-range">{c.weekOf(formatDay(plan.week.from, lang), formatDay(lastDay, lang))}</span>
        </p>
        <h1 className="mt-1 text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">{base.title}</h1>
        <p className="text-v2-sm text-v2-text-secondary mt-1 max-w-2xl">{c.purpose}</p>
        {goalText && <p className="text-v2-sm text-v2-text-secondary mt-1">{c.goal}: <span className="font-medium text-v2-text-primary">{goalText}</span></p>}
        <p className="text-v2-xs text-v2-text-tertiary mt-2">{base.timeZoneNote}</p>
      </header>

      {locked && <PaywallNotice surface="weekly_plan" />}
      {hasPremium === false && (
        <Notice icon={<Lock size={14} className="text-v2-neutral-500" aria-hidden="true" />} testId="read-only-note">{base.readOnlyNote}</Notice>
      )}
      {actionError && (
        <div role="alert" className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3">
          <AlertTriangle size={14} className="text-v2-error-500 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-v2-xs text-v2-error-600">{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} aria-label={c.close} className="text-v2-error-400 hover:text-v2-error-600"><X size={14} /></button>
        </div>
      )}
      {profileIncomplete && (
        <Notice icon={<Info size={14} className="text-v2-secondary-500" aria-hidden="true" />} testId="incomplete-profile" action={{ label: c.completeProfile, onClick: () => navigate('/negocio') }}>
          {c.incompleteProfile}
        </Notice>
      )}
      {missingSources && (
        <Notice icon={<Plug size={14} className="text-v2-secondary-500" aria-hidden="true" />} testId="missing-sources" action={{ label: c.connectSources, onClick: () => navigate('/fuentes') }}>
          {c.missingSources}
        </Notice>
      )}

      <section aria-labelledby="weekly-progress-title" className="rounded-v2-xl border border-v2-border-light bg-white p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-3">
          <h2 id="weekly-progress-title" className="text-v2-sm font-semibold text-v2-text-primary">{c.progressTitle}</h2>
          {percent !== null && <span data-testid="progress-count" className="text-v2-xs text-v2-text-tertiary">{c.progressCount(done, done + pending)}</span>}
        </div>
        {percent === null ? (
          <p data-testid="progress-empty" className="text-v2-sm text-v2-text-secondary">{c.progressEmpty}</p>
        ) : (
          <div className="flex items-center gap-3">
            <div role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-labelledby="weekly-progress-title" className="flex-1 h-2 rounded-full bg-v2-neutral-100 overflow-hidden">
              <div className="h-full rounded-full bg-v2-primary-500 transition-all duration-500" style={{ width: `${percent}%` }} />
            </div>
            <span data-testid="progress-percent" className="text-v2-sm font-semibold text-v2-text-primary tabular-nums">{percent}%</span>
          </div>
        )}
        <p className="mt-3 text-v2-xs text-v2-text-tertiary">{base.progressNote}</p>
        <p className="mt-1 text-v2-xs text-v2-text-tertiary">{c.progressChanges}</p>
        {addedThisWeek > 0 && <p data-testid="added-note" className="mt-1 text-v2-xs text-v2-text-tertiary">{base.addedNote(addedThisWeek)}</p>}
      </section>

      <section aria-labelledby="weekly-focus-title" className="space-y-3">
        <h2 id="weekly-focus-title" className="text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider">{c.focusTitle}</h2>
        {plan.focus.length === 0
          ? <p data-testid="focus-empty" className="text-v2-sm text-v2-text-secondary">{c.focusEmpty}</p>
          : <div data-testid="focus-list" className="space-y-3">{plan.focus.map((i, n) => card(i, n + 1))}</div>}
      </section>

      {plan.later.length > 0 && (
        <section className="space-y-3">
          <h2>
            <button
              type="button"
              aria-expanded={showLater}
              aria-controls="weekly-later-list"
              onClick={() => setShowLater((v) => !v)}
              className="inline-flex items-center gap-1.5 text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider hover:text-v2-text-primary transition-colors"
            >
              {c.laterTitle(plan.later.length)}
              <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${showLater ? 'rotate-180' : ''}`} />
            </button>
          </h2>
          {showLater && <div id="weekly-later-list" data-testid="later-list" className="space-y-3">{plan.later.map((i) => card(i))}</div>}
        </section>
      )}

      <section aria-labelledby="weekly-activity-title" className="rounded-v2-xl border border-v2-border-light bg-white p-5 space-y-4">
        <h2 id="weekly-activity-title" className="text-v2-sm font-semibold text-v2-text-primary">{c.activityTitle}</h2>
        {activityCount === 0 ? (
          <p data-testid="activity-empty" className="text-v2-sm text-v2-text-secondary">{c.activityEmpty}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <ActivityGroup title={c.executed} items={plan.executedThisWeek} />
            <ActivityGroup title={c.resolved} items={plan.resolvedThisWeek} />
            <ActivityGroup title={c.dismissed} items={plan.dismissedThisWeek} note={c.notCounted} />
            <ActivityGroup title={c.outdated} items={plan.outdatedThisWeek} note={c.notCounted} />
          </div>
        )}
      </section>
    </div>
  );
}

function PrimaryLink({ onClick, icon, children }: { onClick: () => void; icon?: ReactNode; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-2 px-4 py-2 rounded-v2-lg bg-v2-primary-600 hover:bg-v2-primary-700 text-white text-v2-sm font-medium transition-colors">
      {icon}{children}{!icon && <ArrowRight size={14} aria-hidden="true" />}
    </button>
  );
}

function Notice({ icon, testId, action, children }: { icon: ReactNode; testId: string; action?: { label: string; onClick: () => void }; children: ReactNode }) {
  return (
    <div data-testid={testId} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-v2-lg border border-v2-border-light bg-v2-secondary-50/50 px-4 py-3">
      <div className="flex items-start gap-2 flex-1">
        <span className="mt-0.5 shrink-0">{icon}</span>
        <p className="text-v2-xs text-v2-text-secondary">{children}</p>
      </div>
      {action && (
        <button type="button" onClick={action.onClick} className="self-start sm:self-auto text-v2-xs font-semibold text-v2-primary-700 hover:text-v2-primary-800 hover:underline">
          {action.label}
        </button>
      )}
    </div>
  );
}
