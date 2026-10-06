import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FlaskConical, Plug } from 'lucide-react';
import { Button } from './ui';
import { trackEmptyStateViewed } from '../services/analytics/v2Analytics';
import { ORIGIN_LABELS, type DataOrigin } from '../domain/dataIntegrity';

export function DemoModeBanner({ onExit, message }: { onExit?: () => void; message?: string }) {
  return (
    <div data-testid="demo-mode-banner" role="note" className="flex items-start gap-3 rounded-v2-xl border border-v2-warning-200 bg-v2-warning-50 px-4 py-3">
      <FlaskConical size={16} className="text-v2-warning-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-v2-xs font-bold uppercase tracking-wider text-v2-warning-700">Modo demostración</p>
        <p className="text-v2-xs text-v2-warning-700 mt-0.5 leading-relaxed">
          {message ?? 'Estos datos son de ejemplo y no pertenecen a tu negocio. Nada de lo que hagas aquí cuenta como progreso real.'}
        </p>
      </div>
      {onExit && (
        <button onClick={onExit} className="text-v2-xs font-semibold text-v2-warning-700 hover:opacity-80 underline underline-offset-2 shrink-0">
          Salir del ejemplo
        </button>
      )}
    </div>
  );
}

interface NoDataStateProps {
  surface: string;
  icon?: React.ReactNode;
  title: string;
  description: string;
  onShowExample?: () => void;
  exampleLabel?: string;
  primaryLabel?: string;
  primaryTo?: string;
}

export function NoDataState({
  surface,
  icon,
  title,
  description,
  onShowExample,
  exampleLabel = 'Ver ejemplo',
  primaryLabel = 'Ir a Fuentes',
  primaryTo = '/fuentes',
}: NoDataStateProps) {
  const navigate = useNavigate();
  useEffect(() => { trackEmptyStateViewed(surface); }, [surface]);

  return (
    <div data-testid="no-data-state" className="rounded-v2-xl border border-dashed border-v2-border-light bg-white flex flex-col items-center text-center py-12 px-6">
      <div className="w-12 h-12 rounded-v2-xl bg-v2-neutral-100 border border-v2-border-light flex items-center justify-center text-v2-neutral-500 mb-4">
        {icon ?? <Plug size={20} />}
      </div>
      <h3 className="text-v2-base font-semibold text-v2-text-primary mb-1">{title}</h3>
      <p className="text-v2-sm text-v2-text-tertiary max-w-md mb-6 leading-relaxed">{description}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button size="sm" onClick={() => navigate(primaryTo)}>{primaryLabel}</Button>
        {onShowExample && (
          <Button size="sm" variant="ghost" onClick={onShowExample} icon={<Eye size={13} />}>{exampleLabel}</Button>
        )}
      </div>
    </div>
  );
}

const ORIGIN_STYLES: Record<DataOrigin, string> = {
  real: 'bg-v2-success-50 text-v2-success-700 border-v2-success-200',
  user_provided: 'bg-v2-primary-50 text-v2-primary-700 border-v2-primary-200',
  estimated: 'bg-v2-neutral-100 text-v2-text-secondary border-v2-border-light',
  general: 'bg-v2-neutral-100 text-v2-text-secondary border-v2-border-light',
  demo: 'bg-v2-warning-50 text-v2-warning-700 border-v2-warning-200',
  unavailable: 'bg-v2-neutral-50 text-v2-text-tertiary border-v2-border-light',
};

export function OriginLabel({ origin }: { origin: DataOrigin }) {
  return (
    <span data-origin={origin} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${ORIGIN_STYLES[origin]}`}>
      {ORIGIN_LABELS[origin]}
    </span>
  );
}
