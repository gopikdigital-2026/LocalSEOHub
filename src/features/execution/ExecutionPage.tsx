import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createExecutionState, advanceExecution, resolveWorkspaceId } from './engine';
import { ReviewWorkspace, PostWorkspace, ProfileWorkspace, ContentWorkspace } from './workspaces';
import { trackWorkspaceOpen, trackWorkspaceClose, trackRecommendationViewed } from '../../services/analytics/v2Analytics';
import type { ExecutionState } from './types';
import { LoadingState, ErrorState } from '../../components/ui';
import { useActions } from '../actions/ActionsContext';
import { getAction } from '../actions/repository';
import { actionTarget, actionToRecommendation, canMarkDone, selectTodayActions } from '../actions/engine';
import { FirstSuccessNotice } from '../activation/ActivationNotices';
import { AlertTriangle, Info } from 'lucide-react';
import type { BusinessAction } from '../actions/types';
import { useI18n } from '../../lib/i18n';
import { PaywallNotice } from '../billing/BillingNotices';
import ImprovementPanel from '../improvement/ImprovementPanel';
import { improvementTarget } from '../improvement/model';

export default function ExecutionPage() {
  const { recommendationId } = useParams<{ recommendationId: string }>();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const { actions, complete, firstSuccess, clearFirstSuccess, locked } = useActions();
  const [saveError, setSaveError] = useState(false);
  const cached = actions.find((a) => a.id === recommendationId) ?? null;
  const [fetched, setFetched] = useState<BusinessAction | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [lookupFailed, setLookupFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const action = cached ?? fetched;

  useEffect(() => {
    if (cached || !recommendationId) { setLookupDone(true); return; }
    let active = true;
    setLookupDone(false);
    setLookupFailed(false);
    getAction(recommendationId)
      .then((a) => { if (active) setFetched(a); })
      .catch((err) => { console.error('action lookup failed', err); if (active) setLookupFailed(true); })
      .finally(() => { if (active) setLookupDone(true); });
    return () => { active = false; };
  }, [cached, recommendationId, attempt]);

  const recommendation = useMemo(() => (action ? actionToRecommendation(action, lang) : null), [action, lang]);
  const [executionState, setExecutionState] = useState<ExecutionState | null>(null);

  useEffect(() => {
    if (!recommendation || !action) return;
    const ready = advanceExecution(createExecutionState(recommendation), 'ready');
    setExecutionState(action.status === 'COMPLETED' ? advanceExecution(advanceExecution(ready, 'running'), 'completed') : ready);
    trackWorkspaceOpen(recommendation.id, resolveWorkspaceId(recommendation.actionType));
    trackRecommendationViewed(action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendation?.id]);

  function handleBack() {
    if (recommendation) trackWorkspaceClose(recommendation.id);
    navigate('/hoy');
  }

  if (!recommendation || !action) {
    if (!lookupDone) return <LoadingState />;
    if (lookupFailed) {
      return <ErrorState message={lang === 'en' ? "We couldn't load this action. Check your connection and try again." : 'No pudimos cargar esta acción. Revisa tu conexión e inténtalo de nuevo.'} onRetry={() => setAttempt((n) => n + 1)} />;
    }
    return <ErrorState message={lang === 'en' ? 'This action no longer exists or is not available.' : 'Esta acción ya no existe o no está disponible.'} onRetry={() => navigate('/hoy')} />;
  }

  if (!executionState) return <LoadingState />;

  const beforeCompletion = executionState;
  const selfAttestable = canMarkDone(action);
  const props = {
    recommendation,
    executionState,
    onStateChange: setExecutionState,
    onBack: handleBack,
    // The workspace marks itself done immediately; if the save fails we roll that back so nothing claims a false success.
    onCompleted: selfAttestable
      ? () => { complete(action).then(() => setSaveError(false)).catch(() => { setExecutionState(beforeCompletion); setSaveError(true); }); }
      : undefined,
    prepared: improvementTarget(action) ? <ImprovementPanel action={action} onNavigate={navigate} /> : undefined,
  };

  const next = selectTodayActions(actions.filter((a) => a.id !== action.id))[0] ?? null;
  const showSuccess = firstSuccess?.id === action.id;

  const workspace = (() => {
    switch (resolveWorkspaceId(recommendation.actionType)) {
      case 'review':
        return <ReviewWorkspace {...props} />;
      case 'post':
        return <PostWorkspace {...props} />;
      case 'profile':
        return <ProfileWorkspace {...props} />;
      default:
        return <ContentWorkspace {...props} />;
    }
  })();

  const resolvesWithData = !selfAttestable && action.status !== 'COMPLETED';

  if (!showSuccess && !saveError && !locked && !resolvesWithData) return workspace;

  return (
    <div className="space-y-5">
      {locked && <PaywallNotice surface="execution" />}
      {saveError && !locked && (
        <div role="alert" className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3">
          <AlertTriangle size={14} className="text-v2-error-500 mt-0.5 shrink-0" />
          <p className="text-v2-xs text-v2-error-600">
            {lang === 'en'
              ? "We couldn't save this action as completed. It is still pending; please try again."
              : 'No hemos podido guardar esta acción como completada. Sigue pendiente; inténtalo de nuevo.'}
          </p>
        </div>
      )}
      {resolvesWithData && (
        <div role="note" className="flex items-start gap-2.5 rounded-v2-lg border border-v2-primary-200 bg-v2-primary-50 px-4 py-3">
          <Info size={14} className="text-v2-primary-600 mt-0.5 shrink-0" />
          <p className="text-v2-xs text-v2-primary-700">
            {lang === 'en'
              ? 'This recommendation closes on its own once the missing information is saved in My business or Sources. It cannot be marked as done by hand.'
              : 'Esta recomendación se cierra sola cuando guardes el dato que falta en Mi negocio o en Fuentes. No se puede marcar como hecha a mano.'}
          </p>
        </div>
      )}
      {showSuccess && (
        <FirstSuccessNotice
          lang={lang}
          onNext={next ? () => { clearFirstSuccess(); navigate(actionTarget(next)); } : null}
          onBack={() => { clearFirstSuccess(); navigate('/hoy'); }}
        />
      )}
      {workspace}
    </div>
  );
}
