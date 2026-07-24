import React, { useState } from 'react';
import { CheckCircle2, HelpCircle, FlaskConical, Info, X, Clock, Database } from 'lucide-react';
import type { ConfidenceLevel, DataSourceType } from '../../domain/types';

// ─── DataStatusBadge ────────────────────────────────────────────────────────

interface DataStatusBadgeProps {
  confidence: ConfidenceLevel;
  className?: string;
}

const confidenceConfig: Record<ConfidenceLevel, { icon: React.ReactNode; label: string; style: string }> = {
  verified: {
    icon: <CheckCircle2 size={12} />,
    label: 'Dato verificado',
    style: 'bg-v2-success-50 text-v2-success-600 border-v2-success-200',
  },
  estimated: {
    icon: <HelpCircle size={12} />,
    label: 'Estimacion',
    style: 'bg-v2-warning-50 text-v2-warning-600 border-v2-warning-200',
  },
  demo: {
    icon: <FlaskConical size={12} />,
    label: 'Ejemplo demostrativo',
    style: 'bg-v2-neutral-100 text-v2-neutral-600 border-v2-neutral-200',
  },
};

export function DataStatusBadge({ confidence, className = '' }: DataStatusBadgeProps) {
  const config = confidenceConfig[confidence];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-v2-xs font-medium rounded-full border ${config.style} ${className}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

// ─── DataSourceInfo ─────────────────────────────────────────────────────────

interface DataSourceInfoProps {
  source: string;
  sourceType: DataSourceType;
  updatedAt: string | null;
  confidence: ConfidenceLevel;
  explanation?: string;
}

const sourceTypeLabels: Record<DataSourceType, string> = {
  google_business: 'Google Business Profile',
  website: 'Sitio web',
  reviews: 'Resenas',
  manual: 'Entrada manual',
  social: 'Redes sociales',
  internal: 'Analisis interno',
};

function formatDate(iso: string | null): string {
  if (!iso) return 'Sin datos todavia';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function DataSourceInfo({ source, sourceType, updatedAt, confidence, explanation }: DataSourceInfoProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 text-v2-xs text-v2-text-tertiary hover:text-v2-text-secondary transition-colors"
        aria-label="Ver informacion de la fuente"
      >
        <Info size={13} />
        <span className="underline underline-offset-2 decoration-dotted">Fuente</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 z-40 w-72 bg-white rounded-v2-xl border border-v2-border-light shadow-v2-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-v2-xs font-semibold text-v2-text-primary uppercase tracking-wide">Informacion de la fuente</span>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-v2-neutral-100 text-v2-neutral-400">
                <X size={14} />
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="flex items-start gap-2.5">
                <Database size={14} className="text-v2-neutral-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-v2-xs text-v2-text-tertiary">Fuente</p>
                  <p className="text-v2-sm text-v2-text-primary font-medium">{source}</p>
                  <p className="text-v2-xs text-v2-text-tertiary">{sourceTypeLabels[sourceType]}</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Clock size={14} className="text-v2-neutral-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-v2-xs text-v2-text-tertiary">Ultima actualizacion</p>
                  <p className="text-v2-sm text-v2-text-primary font-medium">{formatDate(updatedAt)}</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 shrink-0">
                  <DataStatusBadge confidence={confidence} />
                </div>
              </div>

              {explanation && (
                <div className="pt-2 border-t border-v2-border-light">
                  <p className="text-v2-xs text-v2-text-secondary leading-relaxed">{explanation}</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
