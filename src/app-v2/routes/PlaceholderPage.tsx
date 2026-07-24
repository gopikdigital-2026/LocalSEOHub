import { useEffect } from 'react';
import { EmptyState } from '../../components/ui';
import { trackAppView } from '../../services/analytics/v2Analytics';
import { Construction } from 'lucide-react';
import { useLocation } from 'react-router-dom';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  const location = useLocation();

  useEffect(() => {
    trackAppView(location.pathname);
  }, [location.pathname]);

  return (
    <div className="py-12">
      <EmptyState
        icon={<Construction size={24} />}
        title={title}
        description={`${description} Esta seccion se activara en proximos sprints.`}
      />
    </div>
  );
}
