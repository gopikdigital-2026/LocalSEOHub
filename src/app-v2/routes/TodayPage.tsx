import { lazy, Suspense } from 'react';
import DashboardSkeleton from '../../features/dashboard-v4/DashboardSkeleton';

const DashboardV4Page = lazy(() => import('../../features/dashboard-v4/DashboardV4Page'));

export default function TodayPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardV4Page />
    </Suspense>
  );
}
