import { lazy, Suspense } from 'react';
import { LoadingState } from '../../components/ui';

const DashboardPage = lazy(() => import('../../features/dashboard/DashboardPage'));

export default function TodayPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[50vh]">
        <LoadingState />
      </div>
    }>
      <DashboardPage />
    </Suspense>
  );
}
