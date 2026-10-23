import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock, ChevronDown, CloudOff, ExternalLink, FileText, Hourglass, Inbox, KeyRound, Link2Off, RefreshCw, ShieldAlert, Timer,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '../../../components/ui';
import type { SocialUiCopy } from './copy';
import type { AffectedPostView, AttentionCardView, AttentionIcon } from './viewModel';

const ICONS: Record<AttentionIcon, LucideIcon> = {
  text: FileText, calendar: CalendarClock, noContent: Inbox, stale: Hourglass, reauth: KeyRound, permission: ShieldAlert,
  notLinked: Link2Off, rateLimited: Timer, syncError: CloudOff, neverSynced: RefreshCw,
};

const TONE = {
  priority: { border: 'border-v2-warning-300', icon: 'bg-v2-warning-50 text-v2-warning-600', badge: 'warning' as const },
  review: { border: 'border-v2-primary-200', icon: 'bg-v2-primary-50 text-v2-primary-600', badge: 'default' as const },
  technical: { border: 'border-v2-border-light', icon: 'bg-v2-neutral-100 text-v2-text-secondary', badge: 'neutral' as const },
};

const ctaClass = 'inline-flex items-center gap-1.5 rounded-v2-lg border border-v2-border-light bg-white px-3 py-2 text-v2-xs font-semibold text-v2-text-secondary hover:border-v2-primary-300 hover:text-v2-primary-600 transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-primary-500/30';

function PostList({ id, posts, copy }: { id: string; posts: AffectedPostView[]; copy: SocialUiCopy }) {
  return (
    <ul id={id} aria-label={copy.postsListLabel} className="mt-3 divide-y divide-v2-border-light rounded-v2-lg border border-v2-border-light bg-v2-neutral-50">
      {posts.map((p) => (
        <li key={p.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-v2-sm text-v2-text-primary">
            {p.dateTime ? <time dateTime={p.dateTime}>{p.date}</time> : <span>{p.date}</span>}
            <span aria-hidden="true" className="text-v2-text-tertiary">·</span>
            <span className="text-v2-text-secondary">{p.type}</span>
          </div>
          {p.link ? (
            <a
              href={p.link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-v2-xs font-medium text-v2-primary-600 hover:text-v2-primary-700 hover:underline"
            >
              {p.link.label}
              <ExternalLink size={12} aria-hidden="true" />
              <span className="sr-only">{p.link.newTab}</span>
            </a>
          ) : (
            <span className="text-v2-xs text-v2-text-tertiary">{p.noLink}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

interface CardProps {
  card: AttentionCardView;
  copy: SocialUiCopy;
  refreshing: boolean;
  onRefresh(): void;
}

function AttentionCard({ card, copy, refreshing, onRefresh }: CardProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const Icon = ICONS[card.icon];
  const tone = TONE[card.tone];
  const cta = card.cta;
  return (
    <article
      data-testid="social-attention-card"
      data-topic={card.topic}
      className={`rounded-v2-xl border ${tone.border} bg-white p-5 shadow-v2-sm transition-shadow hover:shadow-v2-md`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 shrink-0 rounded-v2-lg flex items-center justify-center ${tone.icon}`}>
          <Icon size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={tone.badge}>{card.badge}</Badge>
            <span className="text-v2-xs font-medium text-v2-text-tertiary">{card.platformLabel}</span>
          </div>
          <h3 className="mt-2 text-v2-base font-semibold text-v2-text-primary leading-snug">{card.title}</h3>
          <p className="mt-1 text-v2-sm text-v2-text-secondary leading-relaxed">{card.body}</p>
          {card.why && (
            <p className="mt-2 text-v2-xs text-v2-text-tertiary leading-relaxed">
              <span className="font-semibold text-v2-text-secondary">{copy.why}</span> {card.why}
            </p>
          )}
          {card.notes.map((n) => <p key={n} className="mt-1 text-v2-xs text-v2-text-tertiary">{n}</p>)}

          {cta && (
            <div className="mt-4">
              {cta.kind === 'viewPosts' && (
                <button type="button" className={ctaClass} aria-expanded={open} aria-controls={listId} onClick={() => setOpen((v) => !v)}>
                  {open ? copy.hidePosts : copy.viewPosts}
                  <ChevronDown size={14} aria-hidden="true" className={`transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
                </button>
              )}
              {cta.kind === 'refresh' && (
                <button type="button" className={ctaClass} onClick={onRefresh} disabled={refreshing}>
                  <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} />
                  {refreshing ? copy.refreshState.refreshing : copy.refresh}
                </button>
              )}
              {cta.kind === 'sources' && <Link to="/fuentes" className={ctaClass}>{cta.label}</Link>}
            </div>
          )}
          {cta?.kind === 'viewPosts' && open && card.posts && <PostList id={listId} posts={card.posts} copy={copy} />}
        </div>
      </div>
    </article>
  );
}

interface SectionProps {
  copy: SocialUiCopy;
  cards: AttentionCardView[];
  refreshing: boolean;
  onRefresh(): void;
}

export default function AttentionSection({ copy, cards, refreshing, onRefresh }: SectionProps) {
  return (
    <section aria-labelledby="social-attention-title">
      <h2 id="social-attention-title" className="text-v2-lg font-semibold text-v2-text-primary mb-3">{copy.attentionTitle}</h2>
      {cards.length === 0 ? (
        <p className="rounded-v2-xl border border-dashed border-v2-border-light bg-white px-5 py-6 text-v2-sm text-v2-text-secondary">
          {copy.attentionEmpty}
        </p>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => <AttentionCard key={c.id} card={c} copy={copy} refreshing={refreshing} onRefresh={onRefresh} />)}
        </div>
      )}
    </section>
  );
}
