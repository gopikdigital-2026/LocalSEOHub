import { Clock, Facebook, Instagram } from 'lucide-react';
import { Badge } from '../../../components/ui';
import type { PlatformCardView } from './viewModel';

const ICON = { facebook: Facebook, instagram: Instagram };

function PlatformCard({ card }: { card: PlatformCardView }) {
  const Icon = ICON[card.platform];
  return (
    <article
      data-testid="social-platform-card"
      data-platform={card.platform}
      data-status={card.status.key}
      className="rounded-v2-xl border border-v2-border-light bg-white p-5 shadow-v2-sm transition-shadow hover:shadow-v2-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 rounded-v2-lg bg-v2-neutral-100 text-v2-text-secondary flex items-center justify-center">
            <Icon size={18} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-v2-base font-semibold text-v2-text-primary leading-tight">{card.name}</h3>
            {card.account && <p className="text-v2-xs text-v2-text-tertiary truncate mt-0.5">{card.account}</p>}
          </div>
        </div>
        <Badge variant={card.status.tone} dot>{card.status.label}</Badge>
      </div>

      {(card.activity || card.postsAnalysed || card.historyBuilding) && (
        <div className="mt-4 space-y-2 border-t border-v2-border-light pt-4 text-v2-sm">
          {card.activity && (
            <div>
              <p className="font-medium text-v2-text-primary">{card.activity.label}</p>
              {card.activity.detail && <p className="text-v2-xs text-v2-text-tertiary mt-0.5">{card.activity.detail}</p>}
            </div>
          )}
          {card.postsAnalysed && <p className="text-v2-text-secondary">{card.postsAnalysed}</p>}
          {card.historyBuilding && <p className="text-v2-xs text-v2-text-tertiary">{card.historyBuilding}</p>}
        </div>
      )}

      {card.updated && (
        <p className="mt-4 flex items-center gap-1.5 text-v2-xs text-v2-text-tertiary">
          <Clock size={12} aria-hidden="true" />
          {card.updated.dateTime
            ? <time dateTime={card.updated.dateTime} title={card.updated.absolute}>{card.updated.label}</time>
            : card.updated.label}
        </p>
      )}
    </article>
  );
}

export default function PlatformOverview({ title, cards }: { title: string; cards: PlatformCardView[] }) {
  return (
    <section aria-labelledby="social-overview-title">
      <h2 id="social-overview-title" className="text-v2-lg font-semibold text-v2-text-primary mb-3">{title}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((c) => <PlatformCard key={c.platform} card={c} />)}
      </div>
    </section>
  );
}
