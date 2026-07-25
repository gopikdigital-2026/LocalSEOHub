import { lazy, Suspense } from 'react';
import { LoadingState } from '../../components/ui';

const DailyBriefingPage = lazy(() => import('../../features/daily-briefing/DailyBriefingPage'));

export default function TodayPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <DailyBriefingPage />
    </Suspense>
  );
}
