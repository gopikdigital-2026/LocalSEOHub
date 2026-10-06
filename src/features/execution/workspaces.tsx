import { useState } from 'react';
import type { Recommendation } from '../../domain/types';
import type { ExecutionState } from './types';
import { Button } from '../../components/ui';
import { DemoModeBanner, NoDataState, OriginLabel } from '../../components/DataIntegrity';
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
  trackDemoViewed,
} from '../../services/analytics/v2Analytics';
import {
  Check,
  Copy,
  Star,
  MessageSquare,
  PenLine,
  Store,
  Lightbulb,
} from 'lucide-react';

// ─── Shared ─────────────────────────────────────────────────────────────────

interface WorkspaceProps {
  recommendation: Recommendation;
  executionState: ExecutionState;
  onStateChange: (state: ExecutionState) => void;
  onBack: () => void;
}

function useDemoToggle(surface: string) {
  const [showDemo, setShowDemo] = useState(false);
  return {
    showDemo,
    openDemo: () => { setShowDemo(true); trackDemoViewed(surface); },
    closeDemo: () => setShowDemo(false),
  };
}

function useCompletion({ recommendation, executionState, onStateChange }: WorkspaceProps) {
  return () => {
    onStateChange(advanceExecution(advanceExecution(executionState, 'running'), 'completed'));
    trackWorkspaceComplete(recommendation.id);
  };
}

function ManualCompletionHint({ onComplete, label }: { onComplete: () => void; label: string }) {
  return (
    <div className="hidden lg:block pt-4">
      <Button onClick={onComplete} icon={<Check size={16} />}>{label}</Button>
      <p className="text-v2-xs text-v2-text-tertiary mt-2">Si ya lo has hecho por tu cuenta directamente en Google, puedes marcarlo como completado.</p>
    </div>
  );
}

function isDone(state: ExecutionState) {
  return state.status === 'completed' || state.status === 'verified';
}

// ─── Review Workspace ───────────────────────────────────────────────────────

export function ReviewWorkspace(props: WorkspaceProps) {
  const { recommendation, executionState, onBack } = props;
  const { showDemo, openDemo, closeDemo } = useDemoToggle('workspace_reviews');
  const handleComplete = useCompletion(props);
  const sidebar = <RecommendationSummary recommendation={recommendation} />;

  if (isDone(executionState)) {
    return (
      <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack}>
        <CompletionCard title="Resenas respondidas" message="Has respondido las resenas pendientes. Esto mejora la confianza de nuevos clientes y senala actividad a Google." onBack={onBack} />
      </WorkspaceLayout>
    );
  }

  if (!showDemo) {
    return (
      <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack} onComplete={handleComplete}>
        <NoDataState
          surface="workspace_reviews"
          icon={<Star size={20} />}
          title="Todavía no tenemos tus reseñas"
          description="Para preparar respuestas necesitamos leer las reseñas reales de tu Perfil de Empresa en Google. Conecta Google Business Profile en Fuentes y aparecerán aquí."
          onShowExample={openDemo}
        />
        <ManualCompletionHint onComplete={handleComplete} label="Ya he respondido mis reseñas" />
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack}>
      <div className="space-y-4">
        <DemoModeBanner onExit={closeDemo} message="Estas reseñas son inventadas para que veas cómo funciona. No son de tu negocio." />
        <DemoReviewList />
      </div>
    </WorkspaceLayout>
  );
}

function DemoReviewList() {
  const [respondedIds, setRespondedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editedResponses, setEditedResponses] = useState<Record<string, string>>({});

  return (
    <>
      {demoReviews.map((review) => {
        const isResponded = respondedIds.includes(review.id);
        const isEditing = editingId === review.id;
        const response = editedResponses[review.id] ?? review.suggestedResponse;

        return (
          <div key={review.id} className={`rounded-v2-xl border bg-white p-5 transition-all ${isResponded ? 'border-v2-success-200 opacity-60' : 'border-v2-border-light'}`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-v2-sm font-semibold text-v2-text-primary">{review.author}</p>
                  <OriginLabel origin="demo" />
                </div>
                <p className="text-v2-xs text-v2-text-tertiary">{review.date}</p>
              </div>
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={12} className={i < review.rating ? 'text-v2-warning-400 fill-v2-warning-400' : 'text-v2-neutral-200'} />
                ))}
              </div>
            </div>

            <p className="text-v2-sm text-v2-text-secondary leading-relaxed mb-4">"{review.text}"</p>

            {!isResponded ? (
              <div className="pt-4 border-t border-v2-border-light space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-v2-xs font-medium text-v2-text-tertiary flex items-center gap-1.5">
                    <MessageSquare size={12} /> Respuesta sugerida
                  </p>
                  <button onClick={() => setEditingId(isEditing ? null : review.id)} className="text-v2-xs text-v2-primary-600 hover:text-v2-primary-700 font-medium">
                    {isEditing ? 'Vista previa' : 'Editar'}
                  </button>
                </div>

                {isEditing ? (
                  <textarea value={response} onChange={(e) => { setEditedResponses((prev) => ({ ...prev, [review.id]: e.target.value })); trackContentEdit(); }} className="w-full rounded-v2-lg border border-v2-border-light bg-v2-neutral-50 px-4 py-3 text-v2-sm text-v2-text-primary leading-relaxed focus:outline-none focus:border-v2-primary-500 focus:ring-2 focus:ring-v2-primary-500/10 resize-y min-h-[80px] transition-all" />
                ) : (
                  <p className="text-v2-sm text-v2-text-secondary leading-relaxed bg-v2-neutral-50 rounded-v2-lg px-4 py-3">{response}</p>
                )}

                <Button size="sm" variant="ghost" onClick={() => { setRespondedIds((prev) => [...prev, review.id]); }} icon={<Check size={13} />}>Probar a marcar como respondida</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-3 border-t border-v2-success-200/50">
                <Check size={14} className="text-v2-success-500" />
                <span className="text-v2-xs font-medium text-v2-success-600">Respondida (ejemplo)</span>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

// ─── Post Workspace ─────────────────────────────────────────────────────────

export function PostWorkspace(props: WorkspaceProps) {
  const { recommendation, executionState, onBack } = props;
  const { showDemo, openDemo, closeDemo } = useDemoToggle('workspace_post');
  const handleComplete = useCompletion(props);
  const sidebar = <RecommendationSummary recommendation={recommendation} />;

  if (isDone(executionState)) {
    return (
      <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack}>
        <CompletionCard title="Publicacion lista" message="Has marcado la publicacion como hecha. Mantener tu perfil activo ayuda a que Google lo muestre a mas clientes." onBack={onBack} />
      </WorkspaceLayout>
    );
  }

  if (!showDemo) {
    return (
      <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack} onComplete={handleComplete}>
        <NoDataState
          surface="workspace_post"
          icon={<PenLine size={20} />}
          title="Genera tu primera publicación"
          description="Todavía no hay ninguna publicación preparada para tu negocio. Completa la información de tu negocio para que podamos redactarla a partir de datos reales y no de un texto genérico."
          primaryLabel="Completar mi negocio"
          primaryTo="/negocio"
          onShowExample={openDemo}
          exampleLabel="Ver publicación de ejemplo"
        />
        <ManualCompletionHint onComplete={handleComplete} label="Ya he publicado por mi cuenta" />
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack}>
      <div className="space-y-5">
        <DemoModeBanner onExit={closeDemo} message="Esta publicación es un ejemplo genérico. No está escrita para tu negocio." />
        <PreparedContentBlock title="Titulo de la publicacion (ejemplo)" content={demoPostDraft.title} onCopy={() => trackContentCopy()} />
        <PreparedContentBlock title="Contenido (ejemplo)" content={demoPostDraft.body} onCopy={() => trackContentCopy()} />
        {demoPostDraft.callToAction && (
          <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
            <p className="text-v2-xs font-medium text-v2-text-tertiary mb-2">Llamada a la accion (ejemplo)</p>
            <p className="text-v2-sm font-semibold text-v2-primary-600">{demoPostDraft.callToAction}</p>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}

// ─── Profile Workspace ──────────────────────────────────────────────────────

export function ProfileWorkspace(props: WorkspaceProps) {
  const { recommendation, executionState, onBack } = props;
  const { showDemo, openDemo, closeDemo } = useDemoToggle('workspace_profile');
  const handleComplete = useCompletion(props);
  const sidebar = <RecommendationSummary recommendation={recommendation} />;

  if (isDone(executionState)) {
    return (
      <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack}>
        <CompletionCard title="Perfil revisado" message="Has marcado la revision de tu perfil como hecha. Un perfil completo ayuda a que Google entienda mejor tu negocio." onBack={onBack} />
      </WorkspaceLayout>
    );
  }

  if (!showDemo) {
    return (
      <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack} onComplete={handleComplete}>
        <NoDataState
          surface="workspace_profile"
          icon={<Store size={20} />}
          title="Necesitamos datos de tu Perfil de Empresa para analizar este apartado."
          description="Sin conectar tu Perfil de Empresa de Google no podemos saber qué tienes ahora en descripción, categorías o atributos, así que no te mostraremos problemas que no hemos comprobado."
          onShowExample={openDemo}
        />
        <ManualCompletionHint onComplete={handleComplete} label="Ya he revisado mi perfil" />
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack}>
      <div className="space-y-5">
        <DemoModeBanner onExit={closeDemo} message="Estos valores actuales y propuestos son de ejemplo. No se han leído de tu perfil." />
        {demoProfileOptimizations.map((opt) => (
          <div key={opt.field}>
            <div className="mb-2"><OriginLabel origin="general" /></div>
            <DiffBlock label={opt.field} current={opt.current} proposed={opt.proposed} />
            <div className="mt-3">
              <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(opt.proposed); trackContentCopy(); }} icon={<Copy size={13} />}>Copiar texto de ejemplo</Button>
            </div>
          </div>
        ))}
      </div>
    </WorkspaceLayout>
  );
}

// ─── Content Workspace ──────────────────────────────────────────────────────

export function ContentWorkspace(props: WorkspaceProps) {
  const { recommendation, executionState, onBack } = props;
  const { showDemo, openDemo, closeDemo } = useDemoToggle('workspace_content');
  const handleComplete = useCompletion(props);
  const sidebar = <RecommendationSummary recommendation={recommendation} />;

  if (isDone(executionState)) {
    return (
      <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack}>
        <CompletionCard title="Contenido preparado" message="Has marcado el contenido como hecho. Publicar con regularidad ayuda a mantener tu visibilidad online." onBack={onBack} />
      </WorkspaceLayout>
    );
  }

  if (!showDemo) {
    return (
      <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack} onComplete={handleComplete}>
        <NoDataState
          surface="workspace_content"
          icon={<Lightbulb size={20} />}
          title="Aún no hay ideas de contenido para tu negocio"
          description="Para proponerte ideas útiles necesitamos conocer tu negocio: qué ofreces, dónde y a quién. Complétalo y las ideas se basarán en esa información."
          primaryLabel="Completar mi negocio"
          primaryTo="/negocio"
          onShowExample={openDemo}
          exampleLabel="Ver ideas de ejemplo"
        />
        <ManualCompletionHint onComplete={handleComplete} label="Ya he preparado mi contenido" />
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout recommendation={recommendation} executionState={executionState} sidebar={sidebar} onBack={onBack}>
      <div className="space-y-5">
        <DemoModeBanner onExit={closeDemo} message="Estas ideas son genéricas, no están adaptadas a tu negocio." />
        <DemoContentIdeas />
      </div>
    </WorkspaceLayout>
  );
}

function DemoContentIdeas() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = demoContentIdeas.find((c) => c.id === selectedId);

  if (!selected) {
    return (
      <>
        <p className="text-v2-sm text-v2-text-secondary">Selecciona una idea de ejemplo para ver su estructura:</p>
        {demoContentIdeas.map((idea) => (
          <button key={idea.id} onClick={() => setSelectedId(idea.id)} className="w-full text-left rounded-v2-xl border border-v2-border-light bg-white p-5 hover:border-v2-primary-200 transition-all">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-v2-sm font-semibold text-v2-text-primary">{idea.title}</h3>
              <span className="text-v2-xs text-v2-text-tertiary">{idea.type}</span>
            </div>
            <p className="text-v2-xs text-v2-text-tertiary">~{idea.estimatedWords} palabras</p>
          </button>
        ))}
      </>
    );
  }

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
      <button onClick={() => setSelectedId(null)} className="text-v2-xs text-v2-primary-600 font-medium mb-3">Volver a las ideas</button>
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
  );
}
