import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Ban, Building2, Check, Eye, Globe, Info, Minus, ShieldCheck, Sparkles } from 'lucide-react';
import type { RadarCopy } from './copy';
import type { RadarComparison, RadarRow, RowStatus } from './engine';
import type { CompetitorAnalysis } from './types';

const card = 'rounded-v2-xl border border-v2-border-light bg-white';
const label = 'text-[11px] font-medium uppercase tracking-wide text-v2-text-tertiary';

const STATUS_STYLE: Record<RowStatus, { chip: string; Icon: typeof Check }> = {
  available: { chip: 'bg-v2-success-50 text-v2-success-700 border-v2-success-200', Icon: Check },
  opportunity: { chip: 'bg-v2-warning-50 text-v2-warning-700 border-v2-warning-200', Icon: AlertTriangle },
  unchecked: { chip: 'bg-v2-neutral-100 text-v2-text-secondary border-v2-border-light', Icon: Minus },
};

const BOOLEAN_ROWS = new Set(['https', 'viewport', 'local_schema', 'map']);

function yoursText(row: RadarRow, t: RadarCopy): string {
  const v = row.yours.value;
  if (row.id === 'gbp') return v === 'connected' || v === 'connected_no_data' ? t.gbp[v] : t.gbp.none;
  if (row.yours.provenance === 'unchecked') {
    return ['name', 'services', 'services_match', 'city', 'phone', 'website'].includes(row.id) ? t.notDefined : t.notMeasuredHere;
  }
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function theirsText(row: RadarRow, t: RadarCopy): string {
  const v = row.theirs.value;
  if (row.id === 'gbp') return t.cannotCheck;
  if (row.id === 'services_match' && Array.isArray(v) && v.length === 0) return t.noServiceMatch;
  if (row.id === 'words' && typeof v === 'number') return v > 0 ? t.words(v) : t.notDetected;
  if (row.id === 'https') return v ? t.yes : t.no;
  if (BOOLEAN_ROWS.has(row.id)) return v ? t.yes : t.notDetected;
  if (Array.isArray(v)) return v.length ? v.join(' · ') : t.notDetected;
  return v === null || v === '' ? t.notDetected : String(v);
}

function StatusChip({ status, t }: { status: RowStatus; t: RadarCopy }) {
  const { chip, Icon } = STATUS_STYLE[status];
  return (
    <span title={t.statusHelp[status]} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${chip}`}>
      <Icon size={11} /> {t.status[status]}
    </span>
  );
}

function Side({ title, text, provenance, muted }: { title: string; text: string; provenance: string; muted: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-v2-text-tertiary lg:hidden">{title}</p>
      <p className={`text-v2-sm break-words line-clamp-3 ${muted ? 'text-v2-text-tertiary' : 'text-v2-text-primary'}`}>{text}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-v2-text-tertiary mt-0.5">{provenance}</p>
    </div>
  );
}

export function RadarResults({ comparison, analysis, t, dateLabel }: { comparison: RadarComparison; analysis: CompetitorAnalysis; t: RadarCopy; dateLabel: string | null }) {
  const { own, competitor, counts } = comparison;
  const f = analysis.fetch;

  return (
    <div className="space-y-6">
      <section className={`${card} p-5 sm:p-6`} data-testid="radar-summary">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 md:items-center">
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 shrink-0 rounded-v2-lg bg-v2-primary-50 text-v2-primary-600 flex items-center justify-center"><Building2 size={18} /></span>
            <div className="min-w-0">
              <p className={label}>{t.yourBusiness}</p>
              <p className="text-v2-base font-semibold text-v2-text-primary truncate">{own.name || t.notDefined}</p>
              <p className="text-v2-xs text-v2-text-secondary">{[own.activity, own.city].filter(Boolean).join(' · ') || t.notDefined}</p>
              <p className="text-v2-xs text-v2-text-tertiary">{t.servicesCount(own.services.length)}</p>
            </div>
          </div>
          <span className="hidden md:block text-v2-xs font-semibold text-v2-text-tertiary uppercase">{t.vs}</span>
          <div className="flex items-start gap-3">
            <span className="w-10 h-10 shrink-0 rounded-v2-lg bg-v2-neutral-100 text-v2-text-secondary flex items-center justify-center"><Globe size={18} /></span>
            <div className="min-w-0">
              <p className={label}>{t.competitor}</p>
              <p className="text-v2-base font-semibold text-v2-text-primary truncate">{competitor.label}</p>
              <p className="text-v2-xs text-v2-text-secondary truncate">{competitor.domain}</p>
              {dateLabel && <p className="text-v2-xs text-v2-text-tertiary">{t.observedOn(dateLabel)}</p>}
            </div>
          </div>
        </div>
        <div className="mt-5 pt-4 border-t border-v2-border-light flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-v2-xs font-medium text-v2-text-secondary inline-flex items-center gap-1.5"><Eye size={13} /> {t.observedKicker}: {t.counts(counts.observed, counts.differences, counts.opportunities)}</p>
          <p className="text-v2-xs text-v2-text-tertiary">{t.noScore}</p>
        </div>
      </section>

      <section className="space-y-3" data-testid="radar-comparison">
        <div>
          <h2 className="text-v2-lg font-semibold text-v2-text-primary">{t.observedKicker}</h2>
          <p className="text-v2-xs text-v2-text-secondary mt-0.5 max-w-3xl">{t.comparisonIntro}</p>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {comparison.blocks.map((block) => (
            <div key={block.id} className={`${card} overflow-hidden`} data-testid={`radar-block-${block.id}`}>
              <div className="px-4 sm:px-5 py-3 bg-v2-neutral-50 border-b border-v2-border-light hidden lg:grid grid-cols-[minmax(0,180px)_1fr_1fr_auto] gap-4">
                <p className={`${label} text-v2-text-primary`}>{t.blocks[block.id]}</p>
                <p className={label}>{t.yourBusiness}</p>
                <p className={label}>{t.competitor}</p>
                <span className="w-24" />
              </div>
              <p className={`${label} text-v2-text-primary px-4 py-3 bg-v2-neutral-50 border-b border-v2-border-light lg:hidden`}>{t.blocks[block.id]}</p>
              <ul className="divide-y divide-v2-border-light">
                {block.rows.map((row) => (
                  <li key={row.id} className="px-4 sm:px-5 py-3 grid grid-cols-1 lg:grid-cols-[minmax(0,180px)_1fr_1fr_auto] gap-2 lg:gap-4 lg:items-start hover:bg-v2-neutral-50/60 transition-colors">
                    <div className="flex items-center justify-between gap-2 lg:block">
                      <p className="text-v2-sm font-medium text-v2-text-primary">{t.rows[row.id]}</p>
                      <span className="lg:hidden"><StatusChip status={row.status} t={t} /></span>
                    </div>
                    <Side title={t.yourBusiness} text={yoursText(row, t)} provenance={t.ownProv[row.yours.provenance]} muted={row.yours.provenance === 'unchecked'} />
                    <Side title={t.competitor} text={theirsText(row, t)} provenance={t.theirProv[row.theirs.provenance]} muted={row.theirs.provenance === 'unchecked'} />
                    <span className="hidden lg:flex w-24 justify-end"><StatusChip status={row.status} t={t} /></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className={`${card} p-5 sm:p-6`} data-testid="radar-opportunities">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-v2-warning-600" />
          <h2 className="text-v2-lg font-semibold text-v2-text-primary">{t.opportunitiesTitle}</h2>
        </div>
        <p className="text-v2-xs text-v2-text-secondary mt-0.5">{t.opportunitiesIntro}</p>
        {comparison.opportunities.length === 0 ? (
          <p className="mt-4 text-v2-sm text-v2-text-secondary">{t.noOpportunities}</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {comparison.opportunities.map((o, i) => {
              const c = t.opportunities[o.id];
              return (
                <li key={o.id} className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-v2-lg border border-v2-border-light p-4 hover:border-v2-warning-200 transition-colors">
                  <span className="w-7 h-7 shrink-0 rounded-full bg-v2-warning-50 text-v2-warning-700 text-v2-xs font-semibold flex items-center justify-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-v2-sm font-semibold text-v2-text-primary">{c.title(o.detail)}</p>
                    <p className="text-v2-xs text-v2-text-secondary mt-0.5">{c.body(o.detail)}</p>
                  </div>
                  <Link to={o.cta} className="inline-flex items-center gap-1 text-v2-xs font-semibold text-v2-primary-600 hover:text-v2-primary-700 self-start sm:self-center whitespace-nowrap">
                    {c.cta} <ArrowRight size={13} />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className={`${card} p-5`} data-testid="radar-checked">
          <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-v2-success-600" /><h2 className="text-v2-base font-semibold text-v2-text-primary">{t.checkedTitle}</h2></div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-v2-xs">
            <dt className="text-v2-text-tertiary">{t.checked.domain}</dt><dd className="text-v2-text-primary break-all">{f.domain}</dd>
            <dt className="text-v2-text-tertiary">{t.checked.https}</dt><dd className="text-v2-text-primary">{f.https ? t.yes : t.no}</dd>
            <dt className="text-v2-text-tertiary">{t.checked.redirected}</dt><dd className="text-v2-text-primary">{f.redirected ? t.yes : t.no}</dd>
            <dt className="text-v2-text-tertiary">{t.checked.status}</dt><dd className="text-v2-text-primary">{f.httpStatus}</dd>
            <dt className="text-v2-text-tertiary">{t.checked.contentType}</dt><dd className="text-v2-text-primary">{f.contentType}</dd>
            <dt className="text-v2-text-tertiary">{t.checked.size}</dt><dd className="text-v2-text-primary">{t.kb(f.bytes)}</dd>
            <dt className="text-v2-text-tertiary">{t.checked.time}</dt><dd className="text-v2-text-primary">{t.seconds(f.durationMs)}</dd>
          </dl>
          <p className="mt-3 text-v2-xs text-v2-text-tertiary inline-flex items-start gap-1.5"><Info size={12} className="mt-0.5 shrink-0" /> {t.costNote}</p>
        </section>
        <section className={`${card} p-5`} data-testid="radar-not-measured">
          <div className="flex items-center gap-2"><Ban size={16} className="text-v2-text-tertiary" /><h2 className="text-v2-base font-semibold text-v2-text-primary">{t.notMeasuredTitle}</h2></div>
          <p className="mt-2 text-v2-sm font-medium text-v2-text-primary">{t.notMeasuredShort}</p>
          <ul className="mt-2 space-y-1">
            {t.notMeasuredList.map((item) => (
              <li key={item} className="text-v2-xs text-v2-text-secondary flex items-center gap-1.5"><Minus size={11} className="text-v2-text-tertiary" /> {item}</li>
            ))}
          </ul>
          <p className="mt-3 text-v2-xs text-v2-text-tertiary">{t.notMeasuredNote}</p>
        </section>
      </div>
    </div>
  );
}
