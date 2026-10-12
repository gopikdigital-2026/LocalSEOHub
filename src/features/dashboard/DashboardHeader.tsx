import { Bell, Calendar } from 'lucide-react';
import { useI18n } from '../../lib/i18n';
import { dayPartFor } from '../user-identity/personalName';
import { usePersonalName } from '../user-identity/usePersonalName';

const GREETING_KEYS = {
  morning: 'mc_greeting_morning',
  afternoon: 'mc_greeting_afternoon',
  evening: 'mc_greeting_evening',
} as const;

export default function DashboardHeader() {
  const { t, lang } = useI18n();
  const { name, loading } = usePersonalName();
  const now = new Date();
  const greeting = t(GREETING_KEYS[dayPartFor(now.getHours())]);
  const date = now.toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  let heading = greeting;
  if (name) heading = `${greeting}, ${name}`;
  else if (!loading) heading = `${greeting}, ${t('identity_welcome')}`;

  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
          {heading}
        </h1>
        <p className="flex items-center gap-2 text-v2-sm text-v2-text-secondary capitalize">
          <Calendar size={14} className="text-v2-text-tertiary" />
          {date}
        </p>
      </div>

      <button
        className="v2-btn-icon relative self-start sm:self-center"
        aria-label={t('identity_notifications')}
      >
        <Bell size={18} />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-v2-error-500 ring-2 ring-white" />
      </button>
    </header>
  );
}
