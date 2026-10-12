import { User } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { usePersonalName } from './usePersonalName';

export default function UserIdentity({ email }: { email?: string }) {
  const { name, loading } = usePersonalName();
  const { t } = useI18n();
  const label = loading ? '' : name ?? t('identity_account_fallback');

  return (
    <>
      <div className="w-9 h-9 rounded-full bg-v2-primary-100 flex items-center justify-center shrink-0">
        {name ? (
          <span className="text-v2-sm font-semibold text-v2-primary-700">{name[0].toLocaleUpperCase()}</span>
        ) : (
          <User size={16} className="text-v2-primary-700" aria-hidden="true" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-v2-sm font-medium text-v2-text-primary truncate min-h-[1.25rem]">{label}</p>
        {email && <p className="text-v2-xs text-v2-text-tertiary truncate">{email}</p>}
      </div>
    </>
  );
}
