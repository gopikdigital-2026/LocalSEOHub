import { useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { LoadingState } from '../../components/ui';
import { checkInternalAccess, type InternalAccess } from './repository';

export const INTERNAL_DENIED_REDIRECT = '/hoy';

interface Props {
  children: ReactNode;
  check?: () => Promise<InternalAccess>;
}

// Children are not mounted until the server confirms operator access.
export function InternalGuard({ children, check = checkInternalAccess }: Props) {
  const [access, setAccess] = useState<InternalAccess | 'checking'>('checking');

  useEffect(() => {
    let cancelled = false;
    check().then((result) => { if (!cancelled) setAccess(result); }, () => { if (!cancelled) setAccess('denied'); });
    return () => { cancelled = true; };
  }, [check]);

  if (access === 'checking') return <LoadingState />;
  if (access === 'denied') return <Navigate to={INTERNAL_DENIED_REDIRECT} replace />;
  return <>{children}</>;
}
