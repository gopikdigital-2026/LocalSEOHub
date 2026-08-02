import type { ConfidenceLevel, DataMode } from '../../domain/types';

export type ConnectionStatus = 'connected' | 'pending' | 'not_connected';

export interface ConnectionEntry {
  id: string;
  label: string;
  status: ConnectionStatus;
  lastSync: string | null;
}

export interface QuickStatItem {
  id: string;
  label: string;
  value: string | null;
  source: string | null;
  updatedAt: string | null;
  confidence: ConfidenceLevel | null;
}

export interface DashboardBusinessState {
  exists: boolean;
  name: string;
  category: string;
  city: string;
  website: string;
  connections: ConnectionEntry[];
  lastGlobalSync: string | null;
}

export type DashboardLoadState = 'loading' | 'ready' | 'empty' | 'error';

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
