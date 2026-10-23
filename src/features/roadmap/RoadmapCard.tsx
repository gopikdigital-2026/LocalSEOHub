import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CheckCircle2, Info, Route } from 'lucide-react';
import { ACTION_COPY } from '../action-layer/copy';
import { TODAY_COPY } from '../today-intelligence/copy';
import { ROADMAP_COPY } from './copy';
import type { RoadmapItem, RoadmapPhase } from './model';

interface Props {
  items: RoadmapItem[];
  lang: 'es' | 'en';
}

const PHASES: readonly RoadmapPhase[] = ['now', 'next', 'later'];

const primaryBtn = 'inline-flex items-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3 py-1.5 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 transition-colors';
const secondaryBtn = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light px-3 py-1.5 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors';

export default function RoadmapCard({ items, lang }: Props) {
  const r = ROADMAP_COPY[lang];
  const t = TODAY_COPY[lang];
  const ac = ACTION_COPY[lang];

  return (
    <section className="v2-card" aria-label={r.heading} data-testid="plan-roadmap">
      <div className="flex items-center gap-2 mb-1">
        <Route size={16} className="text-v2-primary-500" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary">{r.heading}</h2>
      </div>
      <p className="text-v2-xs text-v2-text-tertiary mb-5 leading-relaxed">{r.subtitle}</p>

      {items.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center" data-testid="plan-roadmap-empty">
          <CheckCircle2 size={28} className="text-v2-success-400 mb-3" />
          <p className="text-v2-sm font-semibold text-v2-text-primary">{r.emptyTitle}</p>
          <p className="text-v2-xs text-v2-text-tertiary mt-1 max-w-sm leading-relaxed">{r.emptyText}</p>
          <Link to="/herramientas" className={`${secondaryBtn} mt-4`}>{r.emptyCta}</Link>
        </div>
      ) : (
        <div className="space-y-5">
          {PHASES.map((phase) => {
            const group = items.filter((i) => i.phase === phase);
            if (group.length === 0) return null;
            return (
              <div key={phase} data-testid="roadmap-phase" data-phase={phase}>
                <div className="flex flex-wrap items-baseline gap-x-2 mb-2">
                  <h3 className="text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider">{r.phases[phase].title}</h3>
                  <span className="text-[11px] text-v2-text-tertiary">{r.phases[phase].hint}</span>
                </div>
                <ol className="space-y-2">
                  {group.map((item) => {
                    const text = ac.actions[item.key];
                    const first = item.position === 0;
                    const active = item.mission === 'IN_PROGRESS';
                    return (
                      <li
                        key={item.key}
                        data-testid="roadmap-item"
                        data-key={item.key}
                        className={`p-4 rounded-v2-xl border transition-all duration-200 ${first
                          ? 'border-v2-primary-200 bg-v2-primary-50/40'
                          : 'border-v2-border-light hover:border-v2-primary-200 hover:bg-v2-primary-50/30'}`}
                      >
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className={`shrink-0 w-8 h-8 rounded-full border flex items-center justify-center ${first
                            ? 'bg-v2-primary-600 border-v2-primary-600' : 'bg-v2-neutral-100 border-v2-neutral-200'}`}>
                            <span className={`text-v2-xs font-bold ${first ? 'text-white' : 'text-v2-text-secondary'}`}>{item.position + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <h4 className="text-v2-sm font-semibold text-v2-text-primary">{t.titles[item.key]}</h4>
                              {active && (
                                <span data-testid="roadmap-in-progress" className="inline-flex items-center rounded-full border border-v2-secondary-200 bg-v2-secondary-50 px-2 py-0.5 text-[10px] font-semibold text-v2-secondary-700">
                                  {r.inProgress}
                                </span>
                              )}
                            </div>
                            {item.sourceTools.length > 1 && (
                              <p data-testid="roadmap-sources" className="text-[11px] text-v2-text-tertiary mb-1">
                                {t.detectedIn}: {item.sourceTools.map((s) => t.tools[s]).join(' · ')}
                              </p>
                            )}
                            <p className="text-v2-xs text-v2-text-secondary leading-relaxed">
                              <span className="font-semibold text-v2-text-primary">{ac.whyLabel}: </span>{text.why}
                            </p>
                            <p className="text-v2-xs text-v2-text-secondary mt-1 leading-relaxed">
                              <span className="font-semibold text-v2-text-primary">{ac.nextLabel}: </span>{text.next}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
                              <Link to={item.destination} data-testid="roadmap-cta" className={first ? primaryBtn : secondaryBtn}>
                                {active ? r.continueCta : r.cta} <ArrowRight size={12} />
                              </Link>
                              {item.supporting && (
                                <span className="text-[11px] text-v2-text-tertiary">
                                  {ac.supportingLabel}:{' '}
                                  <Link to={item.supporting.route} data-testid="roadmap-supporting" className="inline-flex items-center gap-0.5 font-medium text-v2-text-secondary hover:text-v2-primary-600 transition-colors">
                                    {ac.supporting[item.supporting.tool]} <ArrowUpRight size={11} />
                                  </Link>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-1.5 mt-4 text-[11px] text-v2-text-tertiary leading-relaxed">
        <Info size={12} className="shrink-0 mt-0.5" /> {r.missionsNote}
      </p>
    </section>
  );
}
