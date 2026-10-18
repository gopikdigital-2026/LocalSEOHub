import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, CheckCircle2, Compass, Info } from 'lucide-react';
import { ACTION_COPY } from '../action-layer/copy';
import { TODAY_COPY } from './copy';
import type { TodayAction } from './model';

interface Props {
  actions: TodayAction[];
  lang: 'es' | 'en';
}

const primaryBtn = 'inline-flex items-center gap-1.5 rounded-v2-lg bg-v2-primary-600 px-3 py-1.5 text-v2-xs font-semibold text-white hover:bg-v2-primary-700 transition-colors';
const secondaryBtn = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light px-3 py-1.5 text-v2-xs font-medium text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors';

export default function TodayPriorities({ actions, lang }: Props) {
  const t = TODAY_COPY[lang];
  const ac = ACTION_COPY[lang];

  return (
    <section className="v2-card" aria-label={t.heading} data-testid="today-priorities">
      <div className="flex items-center gap-2 mb-1">
        <Compass size={16} className="text-v2-primary-500" />
        <h2 className="text-v2-base font-semibold text-v2-text-primary">{t.heading}</h2>
      </div>
      <p className="text-v2-xs text-v2-text-tertiary mb-5 leading-relaxed">{t.subtitle}</p>

      {actions.length === 0 ? (
        <div className="flex flex-col items-center py-6 text-center" data-testid="today-priorities-empty">
          <CheckCircle2 size={28} className="text-v2-success-400 mb-3" />
          <p className="text-v2-sm font-semibold text-v2-text-primary">{t.emptyTitle}</p>
          <p className="text-v2-xs text-v2-text-tertiary mt-1 max-w-sm leading-relaxed">{t.emptyText}</p>
          <Link to="/herramientas" className={`${secondaryBtn} mt-4`}>{t.emptyCta}</Link>
        </div>
      ) : (
        <ol className="space-y-3">
          {actions.map((a, idx) => {
            const text = ac.actions[a.key];
            const primary = idx === 0;
            return (
              <li
                key={a.key}
                data-testid="today-priority"
                data-key={a.key}
                className={`p-4 rounded-v2-xl border transition-all duration-200 ${primary
                  ? 'border-v2-primary-200 bg-v2-primary-50/40'
                  : 'border-v2-border-light hover:border-v2-primary-200 hover:bg-v2-primary-50/30'}`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className={`shrink-0 w-8 h-8 rounded-full border flex items-center justify-center ${primary
                    ? 'bg-v2-primary-600 border-v2-primary-600' : 'bg-v2-neutral-100 border-v2-neutral-200'}`}>
                    <span className={`text-v2-xs font-bold ${primary ? 'text-white' : 'text-v2-text-secondary'}`}>{idx + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      {primary && (
                        <span data-testid="today-start-here" className="inline-flex items-center rounded-full border border-v2-primary-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-v2-primary-700">
                          {t.startHere}
                        </span>
                      )}
                      {a.sourceTools.length > 1 && (
                        <span data-testid="today-sources" className="text-[11px] text-v2-text-tertiary">
                          {t.detectedIn}: {a.sourceTools.map((s) => t.tools[s]).join(' · ')}
                        </span>
                      )}
                    </div>
                    <h3 className="text-v2-sm font-semibold text-v2-text-primary">{t.titles[a.key]}</h3>
                    <p className="text-v2-xs text-v2-text-secondary mt-1 leading-relaxed">
                      <span className="font-semibold text-v2-text-primary">{ac.whyLabel}: </span>{text.why}
                    </p>
                    <p className="text-v2-xs text-v2-text-secondary mt-1 leading-relaxed">
                      <span className="font-semibold text-v2-text-primary">{ac.nextLabel}: </span>{text.next}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-3">
                      <Link to={a.destination} data-testid="today-priority-cta" className={primary ? primaryBtn : secondaryBtn}>
                        {t.cta} <ArrowRight size={12} />
                      </Link>
                      {a.supporting && (
                        <span className="text-[11px] text-v2-text-tertiary">
                          {ac.supportingLabel}:{' '}
                          <Link to={a.supporting.route} data-testid="today-priority-supporting" className="inline-flex items-center gap-0.5 font-medium text-v2-text-secondary hover:text-v2-primary-600 transition-colors">
                            {ac.supporting[a.supporting.tool]} <ArrowUpRight size={11} />
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
      )}

      {actions.length > 0 && (
        <p className="flex flex-wrap items-start gap-1.5 mt-4 text-[11px] text-v2-text-tertiary leading-relaxed">
          <Info size={12} className="shrink-0 mt-0.5" /> {t.footer}{' '}
          <Link to="/herramientas" className="font-medium text-v2-text-secondary hover:text-v2-primary-600 transition-colors">{t.footerCta}</Link>
        </p>
      )}
    </section>
  );
}
