import type { ConfidenceLevel, DataMode } from '../../domain/types';

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
  impact: 'high' | 'medium' | 'low';
  estimatedMinutes: number;
  source: string;
  confidence: ConfidenceLevel;
  dataMode: DataMode;
  actionType: string;
  ctaLabel: string;
}
