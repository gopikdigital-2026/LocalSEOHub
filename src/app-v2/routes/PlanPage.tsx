import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { createFirstValueRepository } from '../../features/first-value/repository';
import { getGoalLabel } from '../../features/first-value/engine';
import { LoadingState } from '../../components/ui';
import type { FirstRecommendationData } from '../../features/first-value/types';
import type { GoalId } from '../../features/business-memory/types';
import {
  Target,
  Check,
  Clock,
  ArrowRight,
  Calendar,
  Info,
  AlertTriangle,
} from 'lucide-react';

interface PlanAction {
  id: string;
  title: string;
  description: string;
  impact: string;
  estimatedMinutes: number;
  confidence: string;
  dataMode: string;
  sourceName: string;
  status: 'completed' | 'pending';
  actionType: string;
}

function generateFollowUpActions(goalId: GoalId, completedAction: FirstRecommendationData | null): PlanAction[] {
  const actions: PlanAction[] = [];

  if (completedAction) {
    actions.push({
      id: completedAction.id,
      title: completedAction.title,
      description: completedAction.description,
      impact: completedAction.impact,
      estimatedMinutes: completedAction.estimatedTimeMinutes,
      confidence: completedAction.confidence,
      dataMode: completedAction.dataMode,
      sourceName: completedAction.sourceName,
      status: 'completed',
      actionType: completedAction.actionType,
    });
  }

  const pendingByGoal: Record<string, { title: string; description: string; actionType: string }[]> = {
    more_reviews: [
      { title: 'Conecta Google Business para ver tus resenas', description: 'Conectar tu perfil real permite obtener recomendaciones verificadas.', actionType: 'respond_reviews' },
      { title: 'Define una estrategia para pedir resenas', description: 'Prepara un mensaje para enviar a clientes satisfechos.', actionType: 'request_reviews' },
    ],
    better_reputation: [
      { title: 'Conecta Google Business para monitorizar resenas', description: 'Conectar tu perfil real permite obtener recomendaciones verificadas.', actionType: 'respond_reviews' },
      { title: 'Revisa y responde las resenas mas recientes', description: 'Cada respuesta mejora la percepcion de tu negocio.', actionType: 'respond_reviews' },
    ],
    more_web_visits: [
      { title: 'Publica una segunda actualizacion', description: 'La constancia es clave para mejorar la visibilidad.', actionType: 'publish_post' },
      { title: 'Revisa el titulo y descripcion de tu web', description: 'Un titulo claro mejora el posicionamiento en buscadores.', actionType: 'update_description' },
    ],
    better_local_seo: [
      { title: 'Completa todas las secciones de tu perfil', description: 'Un perfil completo aparece mas arriba en las busquedas.', actionType: 'optimize_profile' },
      { title: 'Anade fotos recientes del negocio', description: 'Los perfiles con fotos reciben mas visitas.', actionType: 'add_photos' },
    ],
    more_followers: [
      { title: 'Publica una segunda actualizacion', description: 'Publicar regularmente aumenta la audiencia.', actionType: 'publish_post' },
      { title: 'Crea un calendario de contenido sencillo', description: 'Un plan de 4 publicaciones mensuales es suficiente para empezar.', actionType: 'create_content' },
    ],
    more_calls: [
      { title: 'Verifica tu numero de telefono en Google', description: 'Un telefono visible y verificado genera mas llamadas.', actionType: 'optimize_profile' },
      { title: 'Anade horarios actualizados a tu perfil', description: 'Los clientes necesitan saber cuando pueden contactarte.', actionType: 'update_hours' },
    ],
    more_bookings: [
      { title: 'Configura un enlace de reservas en tu perfil', description: 'Facilita que los clientes puedan reservar directamente.', actionType: 'optimize_profile' },
      { title: 'Publica una oferta o promocion', description: 'Una promocion inicial puede generar las primeras reservas.', actionType: 'publish_post' },
    ],
  };

  const pending = pendingByGoal[goalId] ?? pendingByGoal.more_web_visits;

  pending.forEach((p, i) => {
    actions.push({
      id: `plan-${goalId}-${i}`,
      title: p.title,
      description: p.description,
      impact: i === 0 ? 'high' : 'medium',
      estimatedMinutes: i === 0 ? 5 : 4,
      confidence: 'low',
      dataMode: 'estimated',
      sourceName: 'Recomendacion estimada',
      status: 'pending',
      actionType: p.actionType,
    });
  });

  return actions;
}

export default function PlanPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const userId = session?.user?.id ?? '';
  const [actions, setActions] = useState<PlanAction[]>([]);
  const [goalId, setGoalId] = useState<GoalId | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }

    const repo = createFirstValueRepository(userId);
    repo.load().then((state) => {
      if (state?.selectedGoalId) {
        setGoalId(state.selectedGoalId);
        setActions(generateFollowUpActions(state.selectedGoalId, state.recommendation));
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return <LoadingState message="Cargando tu plan..." />;
  }

  const completed = actions.filter((a) => a.status === 'completed').length;
  const total = actions.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-v2-xl sm:text-v2-2xl font-bold text-v2-text-primary tracking-tight">Plan semanal</h1>
        {goalId && (
          <p className="text-v2-sm text-v2-text-secondary mt-1">
            Objetivo: <span className="font-medium text-v2-text-primary">{getGoalLabel(goalId)}</span>
          </p>
        )}
      </div>

      {/* Progress */}
      <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-v2-primary-500" />
            <span className="text-v2-sm font-semibold text-v2-text-primary">Progreso esta semana</span>
          </div>
          <span className="text-v2-xs text-v2-text-tertiary">{completed} de {total} acciones</span>
        </div>
        <div className="w-full h-2 rounded-full bg-v2-neutral-100 overflow-hidden">
          <div className="h-full rounded-full bg-v2-primary-500 transition-all duration-500" style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Transparency notice */}
      <div className="flex items-start gap-2 p-3 rounded-v2-lg bg-v2-warning-50/50 border border-v2-warning-200">
        <Info size={14} className="text-v2-warning-500 mt-0.5 shrink-0" />
        <p className="text-v2-xs text-v2-text-secondary">
          Las acciones pendientes son estimaciones basadas en tu objetivo y categoria. Conecta Google Business para obtener recomendaciones verificadas con datos reales.
        </p>
      </div>

      {/* Actions */}
      {actions.length === 0 ? (
        <div className="rounded-v2-xl border border-v2-border-light bg-white p-8 text-center">
          <Target size={32} className="text-v2-neutral-300 mx-auto mb-3" />
          <h2 className="text-v2-base font-semibold text-v2-text-primary mb-1">Aun no tienes un plan</h2>
          <p className="text-v2-sm text-v2-text-secondary mb-4">Completa la configuracion inicial para recibir tu primera recomendacion.</p>
          <button onClick={() => navigate('/app-v2/empezar')} className="inline-flex items-center gap-2 px-4 py-2 rounded-v2-lg bg-v2-primary-600 hover:bg-v2-primary-700 text-white text-v2-sm font-medium transition-colors">
            Empezar <ArrowRight size={14} />
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <div key={action.id} className={`rounded-v2-xl border bg-white p-5 transition-all ${action.status === 'completed' ? 'border-v2-success-200 bg-v2-success-50/20' : 'border-v2-border-light'}`}>
              <div className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-v2-lg flex items-center justify-center shrink-0 ${action.status === 'completed' ? 'bg-v2-success-100 text-v2-success-600' : 'bg-v2-neutral-100 text-v2-neutral-500'}`}>
                  {action.status === 'completed' ? <Check size={16} /> : <Target size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-v2-sm font-semibold text-v2-text-primary">{action.title}</h3>
                    {action.status === 'completed' && (
                      <span className="text-v2-xs font-medium text-v2-success-600 bg-v2-success-50 border border-v2-success-200 rounded-full px-2 py-0.5">Completada</span>
                    )}
                  </div>
                  <p className="text-v2-xs text-v2-text-tertiary leading-relaxed mb-2">{action.description}</p>
                  <div className="flex flex-wrap items-center gap-3 text-v2-xs text-v2-text-tertiary">
                    <span className="flex items-center gap-1"><Clock size={11} /> ~{action.estimatedMinutes} min</span>
                    <span className={`font-medium ${action.impact === 'high' ? 'text-v2-error-500' : action.impact === 'medium' ? 'text-v2-warning-500' : 'text-v2-neutral-500'}`}>
                      Impacto {action.impact === 'high' ? 'alto' : action.impact === 'medium' ? 'medio' : 'bajo'}
                    </span>
                    <span className="flex items-center gap-1"><AlertTriangle size={11} /> {action.dataMode === 'estimated' ? 'Estimacion' : action.dataMode === 'manual' ? 'Dato manual' : action.dataMode === 'demo' ? 'Demo' : 'Verificado'}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
