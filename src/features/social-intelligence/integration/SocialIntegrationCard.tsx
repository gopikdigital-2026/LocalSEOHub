import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Share2 } from 'lucide-react';
import type { Lang } from '../../../lib/i18n';
import type { SocialFindingsReport } from '../findings/types';
import { loadSocialData } from '../ui/repository';
import { analyseSocialData } from '../ui/viewModel';
import { SOCIAL_INTEGRATION_COPY } from './copy';
import { projectSocialIntegration, type SocialConsumer } from './projection';

// Reads only stored data; any failure simply hides the card.
function useSocialReport(businessId: string | null): SocialFindingsReport | null {
  const [report, setReport] = useState<SocialFindingsReport | null>(null);
  useEffect(() => {
    setReport(null);
    if (!businessId) return;
    let active = true;
    loadSocialData(businessId)
      .then((data) => { if (active) setReport(analyseSocialData(data, new Date()).findings); })
      .catch(() => { if (active) setReport(null); });
    return () => { active = false; };
  }, [businessId]);
  return report;
}

interface Props {
  consumer: SocialConsumer;
  businessId: string | null;
  lang: Lang;
}

export default function SocialIntegrationCard({ consumer, businessId, lang }: Props) {
  const report = useSocialReport(businessId);
  const item = useMemo(() => (report ? projectSocialIntegration(report, lang)[consumer] : null), [report, lang, consumer]);
  if (!item) return null;
  const copy = SOCIAL_INTEGRATION_COPY[lang];
  const headingId = `social-integration-${consumer}`;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="social-integration"
      data-social-id={item.id}
      className="rounded-v2-xl border border-v2-border-light bg-white p-4 sm:p-5 transition-colors hover:border-v2-primary-200"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-v2-lg bg-v2-secondary-50 text-v2-secondary-600 flex items-center justify-center shrink-0">
          <Share2 size={16} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 id={headingId} className="text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider mb-1">{copy.heading}</h2>
          <p className="text-v2-sm font-semibold text-v2-text-primary leading-snug break-words">{item.message}</p>
          <p className="text-v2-xs text-v2-text-tertiary mt-1">{item.sourceLabel}</p>
          <Link
            to={item.destination}
            className="inline-flex items-center gap-1.5 mt-3 rounded-v2-lg border border-v2-border-light px-3 py-1.5 text-v2-xs font-semibold text-v2-primary-700 hover:border-v2-primary-300 hover:bg-v2-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-v2-primary-400 transition-colors"
          >
            {copy.cta} <ArrowRight size={12} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
