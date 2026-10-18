import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { actionText, type ActionCopy } from './copy';
import type { ActionItem } from './model';

interface Props {
  item: ActionItem;
  c: ActionCopy;
  showWhy?: boolean;
  showUsedBy?: boolean;
}

export function ActionDetail({ item, c, showWhy = true, showUsedBy = false }: Props) {
  const { why, next } = actionText(c, item.tool, item.key);
  return (
    <div data-testid="action-detail" data-action={item.key} className="mt-1.5 space-y-1 text-v2-xs leading-relaxed">
      {showWhy && (
        <p className="text-v2-text-secondary"><span className="font-semibold text-v2-text-primary">{c.whyLabel}: </span>{why}</p>
      )}
      <p className="text-v2-text-secondary"><span className="font-semibold text-v2-text-primary">{c.nextLabel}: </span>{next}</p>
      {showUsedBy && item.usedBy.length > 0 && (
        <p data-testid="action-used-by" className="text-[11px] text-v2-text-tertiary">
          {c.usedByLabel}: {item.usedBy.map((u) => c.consumers[u]).join(' · ')}
        </p>
      )}
      {item.supporting && (
        <p className="text-[11px] text-v2-text-tertiary">
          {c.supportingLabel}:{' '}
          <Link to={item.supporting.route} data-testid="action-supporting" className="inline-flex items-center gap-0.5 font-medium text-v2-text-secondary hover:text-v2-primary-600 transition-colors">
            {c.supporting[item.supporting.tool]} <ArrowUpRight size={11} />
          </Link>
        </p>
      )}
    </div>
  );
}
