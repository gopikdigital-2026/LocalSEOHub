import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { demoRecommendations } from '../../app-v2/demo/demoData';
import { createExecutionState, advanceExecution, resolveWorkspaceId } from './engine';
import { ReviewWorkspace, PostWorkspace, ProfileWorkspace, ContentWorkspace } from './workspaces';
import { trackWorkspaceOpen, trackWorkspaceClose } from '../../services/analytics/v2Analytics';
import type { ExecutionState } from './types';
import { LoadingState, ErrorState } from '../../components/ui';

export default function ExecutionPage() {
  const { recommendationId } = useParams<{ recommendationId: string }>();
  const navigate = useNavigate();

  const recommendation = demoRecommendations.find((r) => r.id === recommendationId);

  const [executionState, setExecutionState] = useState<ExecutionState | null>(null);

  useEffect(() => {
    if (recommendation) {
      const state = advanceExecution(createExecutionState(recommendation), 'ready');
      setExecutionState(state);
      trackWorkspaceOpen(recommendation.id, resolveWorkspaceId(recommendation.actionType));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recommendation?.id]);

  function handleBack() {
    if (recommendation) trackWorkspaceClose(recommendation.id);
    navigate('/app-v2/hoy');
  }

  function handleStateChange(newState: ExecutionState) {
    setExecutionState(newState);
  }

  if (!recommendation) {
    return (
      <ErrorState
        message="No se encontro la recomendacion solicitada."
        onRetry={() => navigate('/app-v2/hoy')}
      />
    );
  }

  if (!executionState) {
    return <LoadingState />;
  }

  const workspaceId = resolveWorkspaceId(recommendation.actionType);

  const props = {
    recommendation,
    executionState,
    onStateChange: handleStateChange,
    onBack: handleBack,
  };

  switch (workspaceId) {
    case 'review':
      return <ReviewWorkspace {...props} />;
    case 'post':
      return <PostWorkspace {...props} />;
    case 'profile':
      return <ProfileWorkspace {...props} />;
    case 'content':
      return <ContentWorkspace {...props} />;
    default:
      return <ContentWorkspace {...props} />;
  }
}
