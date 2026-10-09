import { MapPin, Globe, Star, Search, BarChart2, PenLine, RefreshCw, Unlink, AlertCircle, CheckCircle2, Loader2, ExternalLink, Wifi, WifiOff, Info } from 'lucide-react';
import type { ConnectedSource, SourceRegistryEntry } from './types';
import { formatRelativeTime } from './engine';
import { STATUS_LABELS, type SourceDisplayStatus } from './sourceStatus';

type Lang = 'es' | 'en';

const ICON_MAP: Record<string, React.ElementType> = {
  'map-pin': MapPin,
  'globe': Globe,
  'star': Star,
  'search': Search,
  'bar-chart-2': BarChart2,
  'pen-line': PenLine,
};

const COPY = {
  es: {
    statusTitle: 'Estado de los datos',
    active: 'activas',
    verified: 'Tienes datos comprobados (Google o tu web). Las recomendaciones indican en qué se basa cada una.',
    manual: 'Trabajamos con los datos que nos has indicado. Analiza tu web o conecta Google para añadir datos comprobados.',
    none: 'Aún no hay fuentes activas. Puedes analizar tu web o completar la entrada manual sin conectar Google.',
    lastSync: 'Última actualización',
    connect: 'Conectar',
    analyze: 'Analizar',
    reanalyze: 'Volver a analizar',
    edit: 'Editar datos',
    retry: 'Reintentar',
    permissions: 'Resolver permisos',
    disconnect: 'Desconectar',
    comingSoon: 'Esta integración aún no existe. No mostramos datos de ella.',
    dependsPending: 'Se activa automáticamente al conectar Google Business Profile.',
    dependsUnavailable: 'No disponible mientras la conexión con Google Business Profile tenga un error. Revísala en su tarjeta.',
    reviewCount: (n: number) => `${n} reseñas en tu ficha de Google`,
  },
  en: {
    statusTitle: 'Data status',
    active: 'active',
    verified: 'You have checked data (Google or your website). Each recommendation shows what it is based on.',
    manual: 'We are working with the information you gave us. Analyse your website or connect Google to add checked data.',
    none: 'No active sources yet. You can analyse your website or fill in the manual entry without connecting Google.',
    lastSync: 'Last updated',
    connect: 'Connect',
    analyze: 'Analyse',
    reanalyze: 'Analyse again',
    edit: 'Edit details',
    retry: 'Try again',
    permissions: 'Fix permissions',
    disconnect: 'Disconnect',
    comingSoon: 'This integration does not exist yet. We show no data from it.',
    dependsPending: 'Turns on automatically when Google Business Profile is connected.',
    dependsUnavailable: 'Unavailable while the Google Business Profile connection has an error. Check it on its card.',
    reviewCount: (n: number) => `${n} reviews on your Google listing`,
  },
};

export function DataStatusBanner({ activeCount, hasChecked, hasDeclared, lang }: {
  activeCount: number;
  hasChecked: boolean;
  hasDeclared: boolean;
  lang: Lang;
}) {
  const t = COPY[lang];
  const variant = hasChecked ? 'success' : hasDeclared ? 'info' : 'warning';
  const message = hasChecked ? t.verified : hasDeclared ? t.manual : t.none;
  const styles = {
    success: 'bg-v2-success-50 border-v2-success-200 text-v2-success-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    warning: 'bg-v2-warning-50 border-v2-warning-200 text-v2-warning-700',
  };
  const Icon = variant === 'warning' ? WifiOff : Wifi;

  return (
    <div className={`flex items-center gap-3 p-4 rounded-v2-xl border ${styles[variant]}`}>
      <Icon size={16} className="shrink-0" />
      <div>
        <p className="text-v2-xs font-semibold">{t.statusTitle}</p>
        <p className="text-v2-xs mt-0.5 opacity-80">{message}</p>
      </div>
      <div className="ml-auto text-right shrink-0">
        <div className="text-v2-xs font-bold">{activeCount}</div>
        <div className="text-[10px] opacity-60">{t.active}</div>
      </div>
    </div>
  );
}

const BADGE_STYLES: Record<SourceDisplayStatus, string> = {
  verified: 'bg-v2-success-50 text-v2-success-700',
  analyzed: 'bg-v2-success-50 text-v2-success-700',
  declared: 'bg-v2-primary-50 text-v2-primary-700',
  pending: 'bg-v2-neutral-100 text-v2-text-tertiary',
  in_progress: 'bg-blue-50 text-blue-700',
  permissions: 'bg-v2-warning-50 text-v2-warning-700',
  error: 'bg-v2-error-50 text-v2-error-600',
  unavailable: 'bg-v2-warning-50 text-v2-warning-700',
  coming_soon: 'bg-v2-neutral-100 text-v2-text-tertiary',
};

function StatusBadge({ status, lang }: { status: SourceDisplayStatus; lang: Lang }) {
  return (
    <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-v2-md mt-0.5 ${BADGE_STYLES[status]}`}>
      {STATUS_LABELS[lang][status]}
    </span>
  );
}

const primaryBtn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-v2-lg text-v2-xs font-semibold bg-v2-primary-600 text-white hover:bg-v2-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const secondaryBtn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-v2-lg text-v2-xs font-semibold border border-v2-border text-v2-text-secondary hover:bg-v2-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors';
const errorBtn = 'flex items-center gap-1.5 px-3 py-1.5 rounded-v2-lg text-v2-xs font-semibold bg-v2-error-50 text-v2-error-600 hover:bg-v2-error-100 disabled:opacity-50 transition-colors';

export function SourceCard({ entry, source, status, busy, lang, onConnect, onDisconnect }: {
  entry: SourceRegistryEntry;
  source: ConnectedSource | undefined;
  status: SourceDisplayStatus;
  busy: boolean;
  lang: Lang;
  onConnect: () => void;
  onDisconnect: (s: ConnectedSource) => void;
}) {
  const t = COPY[lang];
  const IconComp = ICON_MAP[entry.icon] ?? Globe;
  const dependent = !!entry.dependsOn;
  const positive = status === 'verified' || status === 'analyzed' || status === 'declared';
  const negative = status === 'error';
  const reviewCount = dependent && status === 'verified' && typeof source?.metadata.reviewCount === 'number'
    ? source.metadata.reviewCount
    : null;
  const spinner = busy ? <Loader2 size={13} className="animate-spin" /> : null;

  let action: React.ReactNode = null;
  if (status === 'coming_soon') {
    action = <span className="text-v2-xs text-v2-text-tertiary italic">{t.comingSoon}</span>;
  } else if (dependent) {
    if (status === 'pending' || status === 'unavailable') {
      action = (
        <p className="flex items-start gap-1.5 text-[11px] text-v2-text-secondary">
          <Info size={12} className="mt-0.5 shrink-0" />
          {status === 'pending' ? t.dependsPending : t.dependsUnavailable}
        </p>
      );
    }
  } else if (status === 'pending' || status === 'permissions') {
    const label = status === 'permissions' ? t.permissions : entry.id === 'website' ? t.analyze : entry.id === 'manual' ? t.edit : t.connect;
    action = <button onClick={onConnect} disabled={busy} className={primaryBtn}>{spinner ?? <ExternalLink size={13} />}{label}</button>;
  } else if (status === 'in_progress') {
    action = <span className="flex items-center gap-1.5 text-v2-xs text-v2-text-secondary"><Loader2 size={13} className="animate-spin" />{STATUS_LABELS[lang].in_progress}</span>;
  } else if (status === 'error') {
    action = <button onClick={onConnect} disabled={busy} className={errorBtn}>{spinner ?? <RefreshCw size={13} />}{t.retry}</button>;
  } else if (entry.id === 'website' || entry.id === 'manual') {
    action = (
      <button onClick={onConnect} disabled={busy} className={secondaryBtn}>
        {spinner ?? <RefreshCw size={13} />}{entry.id === 'website' ? t.reanalyze : t.edit}
      </button>
    );
  } else {
    action = <span className="flex items-center gap-1 text-v2-xs text-v2-success-600 font-medium"><CheckCircle2 size={13} />{STATUS_LABELS[lang][status]}</span>;
  }

  return (
    <div className={`rounded-v2-xl border bg-white p-4 sm:p-5 transition-shadow hover:shadow-v2-sm ${
      positive ? 'border-v2-success-200' : negative ? 'border-v2-error-200' : 'border-v2-border'
    }`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-v2-lg flex items-center justify-center shrink-0 ${
          positive ? 'bg-v2-success-50 text-v2-success-600' : negative ? 'bg-v2-error-50 text-v2-error-500' : 'bg-v2-neutral-100 text-v2-text-tertiary'
        }`}>
          <IconComp size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-v2-sm font-semibold text-v2-text-primary truncate">{lang === 'en' ? entry.nameEn : entry.name}</h3>
          <StatusBadge status={status} lang={lang} />
        </div>
      </div>

      <p className="text-v2-xs text-v2-text-tertiary mb-4 leading-relaxed">
        {lang === 'en' ? entry.descriptionEn : entry.description}
      </p>

      {source?.last_error && status === 'error' && (
        <div className="flex items-start gap-2 mb-3 p-2.5 rounded-v2-lg bg-v2-error-50">
          <AlertCircle size={13} className="text-v2-error-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-v2-error-600 leading-relaxed">{source.last_error}</p>
        </div>
      )}

      {reviewCount !== null && (
        <p className="text-[11px] text-v2-text-secondary mb-3 flex items-center gap-1.5">
          <Star size={11} />
          {t.reviewCount(reviewCount)}
        </p>
      )}

      {positive && source?.last_sync_at && (
        <p className="text-[11px] text-v2-text-tertiary mb-3 flex items-center gap-1.5">
          <RefreshCw size={11} />
          {t.lastSync}: {formatRelativeTime(source.last_sync_at)}
        </p>
      )}

      <div className="flex items-center gap-2">
        {action}
        {source && positive && !dependent && (
          <button
            onClick={() => onDisconnect(source)}
            disabled={busy}
            className="ml-auto p-1.5 rounded-v2-md text-v2-text-tertiary hover:text-v2-error-500 hover:bg-v2-error-50 transition-colors"
            title={t.disconnect}
            aria-label={t.disconnect}
          >
            <Unlink size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
