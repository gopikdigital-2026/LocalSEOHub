import type { DataOrigin } from '../../domain/dataIntegrity';

export type ConnectionStatus = 'connected' | 'pending' | 'not_connected';

export interface ConnectionEntry {
  id: string;
  label: string;
  status: ConnectionStatus;
  lastSync: string | null;
}

export interface DashboardAction {
  id: string;
  title: string;
  explanation: string;
  reason: string;
  value: string;
  impact: 'high' | 'medium' | 'low';
  priorityLabel: string;
  estimatedMinutes: number;
  origin: DataOrigin;
  ctaLabel: string;
  canMarkDone: boolean;
}
