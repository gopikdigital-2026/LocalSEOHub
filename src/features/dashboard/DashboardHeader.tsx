import { Bell, Calendar } from 'lucide-react';

interface DashboardHeaderProps {
  businessName: string;
  ownerName?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 7) return 'Buenas noches';
  if (hour < 13) return 'Buenos dias';
  if (hour < 20) return 'Buenas tardes';
  return 'Buenas noches';
}

function getFormattedDate(): string {
  return new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export default function DashboardHeader({ businessName, ownerName }: DashboardHeaderProps) {
  const greeting = getGreeting();
  const date = getFormattedDate();
  const displayName = ownerName || businessName;

  return (
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
          {greeting}, {displayName}
        </h1>
        <p className="flex items-center gap-2 text-v2-sm text-v2-text-secondary capitalize">
          <Calendar size={14} className="text-v2-text-tertiary" />
          {date}
        </p>
      </div>

      <button
        className="v2-btn-icon relative self-start sm:self-center"
        aria-label="Notificaciones"
      >
        <Bell size={18} />
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-v2-error-500 ring-2 ring-white" />
      </button>
    </header>
  );
}
