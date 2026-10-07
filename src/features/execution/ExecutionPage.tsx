import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createExecutionState, advanceExecution, resolveWorkspaceId } from './engine';
import { ReviewWorkspace, PostWorkspace, ProfileWorkspace, ContentWorkspace } from './workspaces';
import { trackWorkspaceOpen, trackWorkspaceClose, trackRecommendationViewed } from '../../services/analytics/v2Analytics';
import type { ExecutionState } from './types';
import { LoadingState, ErrorState } from '../../components/ui';
import { useActions } from '../actions/ActionsContext';
import { getAction } from '../actions/repository';
import { actionTarget, actionToRecommendation, selectTodayActions } from '../actions/engine';
import { FirstSuccessNotice } from '../activation/ActivationNotices';
import { AlertTriangle } from 'lucide-react';
import type { BusinessAction } from '../actions/types';
import { useI18n } from '../../lib/i18n';

export default function ExecutionPage() {
  const { recommendationId } = useParams<{ recommendationId: string }>();
  const navigate = useNavigate();
  const { lang } = useI18n();
  const { actions, complete, firstSuccess, clearFirstSuccess } = useActions();
  const [saveError, setSaveError] = useState(false);
  const cached = actions.find((a) => a.id === recommendationId) ?? null;
  const [fetched, setFetched] = useState<BusinessAction | null>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const action = cached ?? fetched;

  useEffect(() => {
    if (cached || !recommendationId) { setLookupDone(true); return; }
    let active = true;
    getAction(recommendationId)
      .then((a) => { if (active) setFetched(a); })
      .catch(() => {})
      .finally(() => { if (active) setLookupDone(true); });
    return () => { active = false; };
  }, [cached, recommendationId]);

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
    return <ErrorState message="No se encontró la acción solicitada." onRetry={() => navigate('/hoy')} />;
  }

  if (!executionState) return <LoadingState />;

  const beforeCompletion = executionState;
  const props = {
    recommendation,
    executionState,
    onStateChange: setExecutionState,
    onBack: handleBack,
    // The workspace marks itself done immediately; if the save fails we roll that back so nothing claims a false success.
    onCompleted: () => { complete(action).then(() => setSaveError(false)).catch(() => { setExecutionState(beforeCompletion); setSaveError(true); }); },
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

  if (!showSuccess && !saveError) return workspace;

  return (
    <div className="space-y-5">
      {saveError && (
        <div role="alert" className="flex items-start gap-2.5 rounded-v2-lg border border-v2-error-200 bg-v2-error-50 px-4 py-3">
          <AlertTriangle size={14} className="text-v2-error-500 mt-0.5 shrink-0" />
          <p className="text-v2-xs text-v2-error-600">
            {lang === 'en'
              ? "We couldn't save this action as completed. It is still pending; please try again."
              : 'No hemos podido guardar esta acción como completada. Sigue pendiente; inténtalo de nuevo.'}
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
