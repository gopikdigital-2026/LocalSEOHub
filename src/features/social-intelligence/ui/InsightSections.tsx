import { CheckCircle2, Info, Layers } from 'lucide-react';
import type { SocialUiCopy } from './copy';
import type { CoverageView, KnownItemView } from './viewModel';

export function KnownSection({ copy, items }: { copy: SocialUiCopy; items: KnownItemView[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="social-known-title" className="rounded-v2-xl border border-v2-border-light bg-white p-5 shadow-v2-sm">
      <h2 id="social-known-title" className="text-v2-lg font-semibold text-v2-text-primary">{copy.knownTitle}</h2>
      <ul className="mt-3 space-y-3">
        {items.map((i) => (
          <li key={i.id} data-testid="social-known-item" className="flex items-start gap-2.5">
            <CheckCircle2 size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-v2-success-500" />
            <div>
              <h3 className="text-v2-sm font-semibold text-v2-text-primary">{i.title}</h3>
              <p className="text-v2-sm text-v2-text-secondary leading-relaxed">{i.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CoverageSection({ copy, coverage }: { copy: SocialUiCopy; coverage: CoverageView }) {
  if (!coverage.history && coverage.notes.length === 0) return null;
  return (
    <section aria-labelledby="social-coverage-title" className="rounded-v2-xl border border-v2-border-light bg-v2-neutral-50 p-5">
      <h2 id="social-coverage-title" className="text-v2-lg font-semibold text-v2-text-primary">{copy.coverageTitle}</h2>
      <div className="mt-3 space-y-3">
        {coverage.history && (
          <div data-testid="social-coverage-history" className="flex items-start gap-2.5">
            <Layers size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-v2-text-tertiary" />
            <div>
              <h3 className="text-v2-sm font-semibold text-v2-text-primary">
                {coverage.history.title}
                {coverage.history.platforms && <span className="ml-1.5 font-normal text-v2-text-tertiary">{coverage.history.platforms}</span>}
              </h3>
              <p className="text-v2-sm text-v2-text-secondary leading-relaxed">{coverage.history.body}</p>
              {coverage.history.wait && <p className="mt-1 text-v2-xs text-v2-text-tertiary">{coverage.history.wait}</p>}
            </div>
          </div>
        )}
        {coverage.notes.map((n) => (
          <p key={n} className="flex items-start gap-2.5 text-v2-sm text-v2-text-secondary leading-relaxed">
            <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-v2-text-tertiary" />
            {n}
          </p>
        ))}
      </div>
    </section>
  );
}
