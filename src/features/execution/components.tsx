import { useState } from 'react';
import type { Recommendation, ImpactLevel, ConfidenceLevel } from '../../domain/types';
import type { ExecutionState, ExecutionHistoryEntry } from './types';
import { Button } from '../../components/ui';
import { DataStatusBadge } from '../../components/data-status';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Copy,
  Edit3,
  ChevronRight,
} from 'lucide-react';

// ─── WorkspaceLayout ────────────────────────────────────────────────────────

interface WorkspaceLayoutProps {
  recommendation: Recommendation;
  executionState: ExecutionState;
  sidebar: React.ReactNode;
  children: React.ReactNode;
  onBack: () => void;
  onComplete: () => void;
}

export function WorkspaceLayout({
  recommendation,
  executionState,
  sidebar,
  children,
  onBack,
  onComplete,
}: WorkspaceLayoutProps) {
  return (
    <div className="min-h-[calc(100vh-4rem)] lg:min-h-screen flex flex-col">
      {/* Header */}
      <WorkspaceHeader recommendation={recommendation} onBack={onBack} />

      {/* Content */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 lg:gap-8">
        {/* Left: Info / Sidebar */}
        <div className="w-full lg:w-80 xl:w-96 shrink-0 space-y-5 order-2 lg:order-1">
          {sidebar}
          <HistoryTimeline entries={executionState.history} />
        </div>

        {/* Right: Action area */}
        <div className="flex-1 order-1 lg:order-2">
          {children}
        </div>
      </div>

      {/* Mobile bottom action */}
      {executionState.status !== 'completed' && executionState.status !== 'verified' && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 p-4 bg-white border-t border-v2-border-light safe-area-pb z-20">
          <Button className="w-full" onClick={onComplete} icon={<Check size={16} />}>
            Marcar como completada
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── WorkspaceHeader ────────────────────────────────────────────────────────

function WorkspaceHeader({ recommendation, onBack }: { recommendation: Recommendation; onBack: () => void }) {
  return (
    <div className="flex items-center gap-4 mb-6 lg:mb-8">
      <button
        onClick={onBack}
        className="p-2 -ml-2 rounded-v2-lg hover:bg-v2-neutral-100 text-v2-neutral-500 transition-colors"
      >
        <ArrowLeft size={20} />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-v2-lg sm:text-v2-xl font-bold text-v2-text-primary truncate">
          {recommendation.title}
        </h1>
        <div className="flex items-center gap-3 mt-1">
          <ImpactLabel level={recommendation.impact} />
          <span className="text-v2-xs text-v2-text-tertiary flex items-center gap-1">
            <Clock size={11} />
            ~{recommendation.estimatedTimeMinutes} min
          </span>
        </div>
      </div>
      <DataStatusBadge confidence={recommendation.confidence} />
    </div>
  );
}

// ─── RecommendationSummary ──────────────────────────────────────────────────

export function RecommendationSummary({ recommendation }: { recommendation: Recommendation }) {
  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 space-y-4">
      <div>
        <p className="text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider mb-2">
          Por que es importante
        </p>
        <p className="text-v2-sm text-v2-text-secondary leading-relaxed">
          {recommendation.explanation}
        </p>
      </div>

      <div className="pt-3 border-t border-v2-border-light space-y-2">
        <InfoRow label="Fuente" value={recommendation.source} />
        <InfoRow label="Impacto" value={impactLabels[recommendation.impact]} />
        <InfoRow label="Tiempo" value={`~${recommendation.estimatedTimeMinutes} min`} />
        <InfoRow label="Confianza" value={confidenceLabels[recommendation.confidence]} />
      </div>
    </div>
  );
}

// ─── HistoryTimeline ────────────────────────────────────────────────────────

export function HistoryTimeline({ entries }: { entries: ExecutionHistoryEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
      <p className="text-v2-xs font-semibold text-v2-text-tertiary uppercase tracking-wider mb-4">
        Historial
      </p>
      <div className="space-y-3">
        {entries.map((entry, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className="mt-0.5">
              {i === entries.length - 1 ? (
                <CheckCircle2 size={14} className="text-v2-primary-500" />
              ) : (
                <Circle size={14} className="text-v2-neutral-300" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-v2-sm text-v2-text-primary">{entry.label}</p>
              <p className="text-v2-xs text-v2-text-tertiary">
                {new Date(entry.timestamp).toLocaleString('es-ES', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PreparedContentBlock ───────────────────────────────────────────────────

interface PreparedContentBlockProps {
  title: string;
  content: string;
  editable?: boolean;
  onCopy?: () => void;
}

export function PreparedContentBlock({ title, content, editable = true, onCopy }: PreparedContentBlockProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(content);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    onCopy?.();
  }

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-v2-sm font-semibold text-v2-text-primary">{title}</p>
        <div className="flex items-center gap-2">
          {editable && (
            <button
              onClick={() => setEditing(!editing)}
              className="p-1.5 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-400 transition-colors"
            >
              <Edit3 size={14} />
            </button>
          )}
          <button
            onClick={handleCopy}
            className="p-1.5 rounded-v2-md hover:bg-v2-neutral-100 text-v2-neutral-400 transition-colors"
          >
            {copied ? <Check size={14} className="text-v2-success-500" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {editing ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-3 text-v2-sm text-v2-text-primary
            leading-relaxed focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10
            resize-y min-h-[120px] transition-all"
        />
      ) : (
        <p className="text-v2-sm text-v2-text-secondary leading-relaxed whitespace-pre-wrap">
          {value}
        </p>
      )}
    </div>
  );
}

// ─── CompletionCard ─────────────────────────────────────────────────────────

interface CompletionCardProps {
  title: string;
  message: string;
  onBack: () => void;
}

export function CompletionCard({ title, message, onBack }: CompletionCardProps) {
  return (
    <div className="rounded-v2-xl border border-v2-success-200 bg-white p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-v2-success-50 border border-v2-success-200 flex items-center justify-center mx-auto mb-4">
        <Check size={24} className="text-v2-success-600" />
      </div>
      <h2 className="text-v2-lg font-bold text-v2-text-primary mb-2">{title}</h2>
      <p className="text-v2-sm text-v2-text-secondary mb-6 max-w-sm mx-auto leading-relaxed">
        {message}
      </p>
      <Button variant="secondary" onClick={onBack} icon={<ChevronRight size={14} />}>
        Volver al briefing
      </Button>
    </div>
  );
}

// ─── DiffBlock ──────────────────────────────────────────────────────────────

interface DiffBlockProps {
  label: string;
  current: string;
  proposed: string;
}

export function DiffBlock({ label, current, proposed }: DiffBlockProps) {
  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5 space-y-3">
      <p className="text-v2-sm font-semibold text-v2-text-primary">{label}</p>
      <div className="space-y-2">
        <div className="rounded-v2-lg bg-v2-error-50/50 border border-v2-error-200/50 px-4 py-3">
          <p className="text-v2-xs font-medium text-v2-error-600 mb-1">Actual</p>
          <p className="text-v2-sm text-v2-text-secondary leading-relaxed">{current}</p>
        </div>
        <div className="rounded-v2-lg bg-v2-success-50/50 border border-v2-success-200/50 px-4 py-3">
          <p className="text-v2-xs font-medium text-v2-success-600 mb-1">Propuesta</p>
          <p className="text-v2-sm text-v2-text-primary leading-relaxed">{proposed}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-v2-xs text-v2-text-tertiary">{label}</span>
      <span className="text-v2-xs font-medium text-v2-text-primary">{value}</span>
    </div>
  );
}

function ImpactLabel({ level }: { level: ImpactLevel }) {
  const colors = { high: 'text-v2-error-500', medium: 'text-v2-warning-500', low: 'text-v2-neutral-400' };
  return <span className={`text-v2-xs font-medium ${colors[level]}`}>{impactLabels[level]}</span>;
}

const impactLabels: Record<ImpactLevel, string> = {
  high: 'Alto impacto',
  medium: 'Impacto medio',
  low: 'Impacto bajo',
};

const confidenceLabels: Record<ConfidenceLevel, string> = {
  verified: 'Dato verificado',
  estimated: 'Estimacion',
  demo: 'Ejemplo demostrativo',
};
