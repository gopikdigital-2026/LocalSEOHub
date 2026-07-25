import { useState } from 'react';
import type { Recommendation } from '../../domain/types';
import type { ExecutionState } from './types';
import { Button } from '../../components/ui';
import {
  WorkspaceLayout,
  RecommendationSummary,
  PreparedContentBlock,
  CompletionCard,
  DiffBlock,
} from './components';
import { advanceExecution } from './engine';
import { demoReviews, demoPostDraft, demoProfileOptimizations, demoContentIdeas } from './demoWorkspaceData';
import {
  trackWorkspaceComplete,
  trackContentCopy,
  trackContentEdit,
} from '../../services/analytics/v2Analytics';
import {
  Check,
  Copy,
  Star,
  MessageSquare,
  Send,
} from 'lucide-react';

// ─── Review Workspace ───────────────────────────────────────────────────────

interface WorkspaceProps {
  recommendation: Recommendation;
  executionState: ExecutionState;
  onStateChange: (state: ExecutionState) => void;
  onBack: () => void;
}

export function ReviewWorkspace({ recommendation, executionState, onStateChange, onBack }: WorkspaceProps) {
  const [respondedIds, setRespondedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedResponses, setEditedResponses] = useState<Record<string, string>>({});

  const isCompleted = executionState.status === 'completed' || executionState.status === 'verified';

  if (isCompleted) {
    return (
      <WorkspaceLayout
        recommendation={recommendation}
        executionState={executionState}
        sidebar={<RecommendationSummary recommendation={recommendation} />}
        onBack={onBack}
        onComplete={() => {}}
      >
        <CompletionCard
          title="Resenas respondidas"
          message="Has respondido las resenas pendientes. Esto mejora la confianza de nuevos clientes y senala actividad a Google."
          onBack={onBack}
        />
      </WorkspaceLayout>
    );
  }

  function handleRespond(reviewId: string) {
    setRespondedIds((prev) => [...prev, reviewId]);
    if (respondedIds.length + 1 >= demoReviews.length) {
      handleComplete();
    }
  }

  function handleComplete() {
    const newState = advanceExecution(
      advanceExecution(executionState, 'running'),
      'completed'
    );
    onStateChange(newState);
    trackWorkspaceComplete(recommendation.id);
  }

  function handleEdit(reviewId: string, value: string) {
    setEditedResponses((prev) => ({ ...prev, [reviewId]: value }));
    trackContentEdit();
  }

  return (
    <WorkspaceLayout
      recommendation={recommendation}
      executionState={executionState}
      sidebar={<RecommendationSummary recommendation={recommendation} />}
      onBack={onBack}
      onComplete={handleComplete}
    >
      <div className="space-y-4">
        {demoReviews.map((review) => {
          const isResponded = respondedIds.includes(review.id);
          const isEditing = editingId === review.id;
          const response = editedResponses[review.id] ?? review.suggestedResponse;

          return (
            <div
              key={review.id}
              className={`rounded-v2-xl border bg-white p-5 transition-all ${
                isResponded ? 'border-v2-success-200 opacity-60' : 'border-v2-border-light'
              }`}
            >
              {/* Review header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-v2-sm font-semibold text-v2-text-primary">{review.author}</p>
                  <p className="text-v2-xs text-v2-text-tertiary">{review.date}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      size={12}
                      className={i < review.rating ? 'text-v2-warning-400 fill-v2-warning-400' : 'text-v2-neutral-200'}
                    />
                  ))}
                </div>
              </div>

              {/* Review text */}
              <p className="text-v2-sm text-v2-text-secondary leading-relaxed mb-4">
                "{review.text}"
              </p>

              {/* Response section */}
              {!isResponded && (
                <div className="pt-4 border-t border-v2-border-light space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-v2-xs font-medium text-v2-text-tertiary flex items-center gap-1.5">
                      <MessageSquare size={12} />
                      Respuesta sugerida
                    </p>
                    <button
                      onClick={() => setEditingId(isEditing ? null : review.id)}
                      className="text-v2-xs text-v2-primary-600 hover:text-v2-primary-700 font-medium"
                    >
                      {isEditing ? 'Vista previa' : 'Editar'}
                    </button>
                  </div>

                  {isEditing ? (
                    <textarea
                      value={response}
                      onChange={(e) => handleEdit(review.id, e.target.value)}
                      className="w-full rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-3 text-v2-sm
                        text-v2-text-primary leading-relaxed focus:outline-none focus:border-v2-primary-500
                        focus:ring-2 focus:ring-v2-primary-500/10 resize-y min-h-[80px] transition-all"
                    />
                  ) : (
                    <p className="text-v2-sm text-v2-text-secondary leading-relaxed bg-v2-neutral-50 rounded-v2-lg px-4 py-3">
                      {response}
                    </p>
                  )}

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => handleRespond(review.id)} icon={<Send size={13} />}>
                      Enviar respuesta
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(response);
                        trackContentCopy();
                      }}
                      icon={<Copy size={13} />}
                    >
                      Copiar
                    </Button>
                  </div>
                </div>
              )}

              {isResponded && (
                <div className="flex items-center gap-2 pt-3 border-t border-v2-success-200/50">
                  <Check size={14} className="text-v2-success-500" />
                  <span className="text-v2-xs font-medium text-v2-success-600">Respondida</span>
                </div>
              )}
            </div>
          );
        })}

        {/* Complete all button */}
        <div className="hidden lg:block pt-4">
          <Button onClick={handleComplete} icon={<Check size={16} />}>
            Marcar todas como respondidas
          </Button>
        </div>
      </div>
    </WorkspaceLayout>
  );
}

// ─── Post Workspace ─────────────────────────────────────────────────────────

export function PostWorkspace({ recommendation, executionState, onStateChange, onBack }: WorkspaceProps) {
  const [published, setPublished] = useState(false);
  const isCompleted = executionState.status === 'completed' || executionState.status === 'verified';

  if (isCompleted || published) {
    return (
      <WorkspaceLayout
        recommendation={recommendation}
        executionState={executionState}
        sidebar={<RecommendationSummary recommendation={recommendation} />}
        onBack={onBack}
        onComplete={() => {}}
      >
        <CompletionCard
          title="Publicacion lista"
          message="El contenido esta preparado. Publicalo en tu perfil de Google Business para mantener tu perfil activo y visible."
          onBack={onBack}
        />
      </WorkspaceLayout>
    );
  }

  function handlePublish() {
    const newState = advanceExecution(
      advanceExecution(executionState, 'running'),
      'completed'
    );
    onStateChange(newState);
    setPublished(true);
    trackWorkspaceComplete(recommendation.id);
  }

  return (
    <WorkspaceLayout
      recommendation={recommendation}
      executionState={executionState}
      sidebar={<RecommendationSummary recommendation={recommendation} />}
      onBack={onBack}
      onComplete={handlePublish}
    >
      <div className="space-y-5">
        <PreparedContentBlock
          title="Titulo de la publicacion"
          content={demoPostDraft.title}
          onCopy={() => trackContentCopy()}
        />
        <PreparedContentBlock
          title="Contenido"
          content={demoPostDraft.body}
          onCopy={() => trackContentCopy()}
        />
        {demoPostDraft.callToAction && (
          <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
            <p className="text-v2-xs font-medium text-v2-text-tertiary mb-2">Llamada a la accion</p>
            <p className="text-v2-sm font-semibold text-v2-primary-600">{demoPostDraft.callToAction}</p>
          </div>
        )}
        <div className="hidden lg:block pt-4">
          <Button onClick={handlePublish} icon={<Check size={16} />}>
            Marcar como publicada
          </Button>
        </div>
      </div>
    </WorkspaceLayout>
  );
}

// ─── Profile Workspace ──────────────────────────────────────────────────────

export function ProfileWorkspace({ recommendation, executionState, onStateChange, onBack }: WorkspaceProps) {
  const [acceptedFields, setAcceptedFields] = useState<string[]>([]);
  const isCompleted = executionState.status === 'completed' || executionState.status === 'verified';

  if (isCompleted) {
    return (
      <WorkspaceLayout
        recommendation={recommendation}
        executionState={executionState}
        sidebar={<RecommendationSummary recommendation={recommendation} />}
        onBack={onBack}
        onComplete={() => {}}
      >
        <CompletionCard
          title="Perfil optimizado"
          message="Los cambios propuestos estan listos para aplicar en tu perfil de Google Business. La optimizacion ayudara a mejorar tu posicionamiento local."
          onBack={onBack}
        />
      </WorkspaceLayout>
    );
  }

  function handleAccept(field: string) {
    setAcceptedFields((prev) => [...prev, field]);
  }

  function handleComplete() {
    const newState = advanceExecution(
      advanceExecution(executionState, 'running'),
      'completed'
    );
    onStateChange(newState);
    trackWorkspaceComplete(recommendation.id);
  }

  return (
    <WorkspaceLayout
      recommendation={recommendation}
      executionState={executionState}
      sidebar={<RecommendationSummary recommendation={recommendation} />}
      onBack={onBack}
      onComplete={handleComplete}
    >
      <div className="space-y-5">
        {demoProfileOptimizations.map((opt) => (
          <div key={opt.field}>
            <DiffBlock label={opt.field} current={opt.current} proposed={opt.proposed} />
            {!acceptedFields.includes(opt.field) ? (
              <div className="mt-3 flex gap-2">
                <Button size="sm" onClick={() => handleAccept(opt.field)} icon={<Check size={13} />}>
                  Aceptar cambio
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  navigator.clipboard.writeText(opt.proposed);
                  trackContentCopy();
                }} icon={<Copy size={13} />}>
                  Copiar
                </Button>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <Check size={14} className="text-v2-success-500" />
                <span className="text-v2-xs font-medium text-v2-success-600">Aceptado</span>
              </div>
            )}
          </div>
        ))}
        <div className="hidden lg:block pt-4">
          <Button onClick={handleComplete} icon={<Check size={16} />}>
            Aplicar cambios al perfil
          </Button>
        </div>
      </div>
    </WorkspaceLayout>
  );
}

// ─── Content Workspace ──────────────────────────────────────────────────────

export function ContentWorkspace({ recommendation, executionState, onStateChange, onBack }: WorkspaceProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isCompleted = executionState.status === 'completed' || executionState.status === 'verified';

  if (isCompleted) {
    return (
      <WorkspaceLayout
        recommendation={recommendation}
        executionState={executionState}
        sidebar={<RecommendationSummary recommendation={recommendation} />}
        onBack={onBack}
        onComplete={() => {}}
      >
        <CompletionCard
          title="Contenido preparado"
          message="El contenido esta listo para publicar. Mantener una cadencia de publicacion constante mejora tu visibilidad online."
          onBack={onBack}
        />
      </WorkspaceLayout>
    );
  }

  function handleComplete() {
    const newState = advanceExecution(
      advanceExecution(executionState, 'running'),
      'completed'
    );
    onStateChange(newState);
    trackWorkspaceComplete(recommendation.id);
  }

  const selected = demoContentIdeas.find((c) => c.id === selectedId);

  return (
    <WorkspaceLayout
      recommendation={recommendation}
      executionState={executionState}
      sidebar={<RecommendationSummary recommendation={recommendation} />}
      onBack={onBack}
      onComplete={handleComplete}
    >
      <div className="space-y-5">
        {!selected ? (
          <>
            <p className="text-v2-sm text-v2-text-secondary">
              Selecciona una idea de contenido para desarrollar:
            </p>
            {demoContentIdeas.map((idea) => (
              <button
                key={idea.id}
                onClick={() => setSelectedId(idea.id)}
                className="w-full text-left rounded-v2-xl border border-v2-border-light bg-white p-5 hover:border-v2-primary-200 transition-all"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-v2-sm font-semibold text-v2-text-primary">{idea.title}</h3>
                  <span className="text-v2-xs text-v2-text-tertiary">{idea.type}</span>
                </div>
                <p className="text-v2-xs text-v2-text-tertiary">~{idea.estimatedWords} palabras</p>
              </button>
            ))}
          </>
        ) : (
          <>
            <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
              <h3 className="text-v2-base font-semibold text-v2-text-primary mb-1">{selected.title}</h3>
              <p className="text-v2-xs text-v2-text-tertiary mb-4">{selected.type} - ~{selected.estimatedWords} palabras</p>
              <p className="text-v2-xs font-medium text-v2-text-tertiary uppercase tracking-wider mb-3">Estructura</p>
              <ol className="space-y-2">
                {selected.outline.map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="text-v2-xs font-semibold text-v2-primary-500 mt-0.5">{i + 1}</span>
                    <span className="text-v2-sm text-v2-text-secondary">{item}</span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="hidden lg:block pt-2">
              <Button onClick={handleComplete} icon={<Check size={16} />}>
                Marcar como completado
              </Button>
            </div>
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
