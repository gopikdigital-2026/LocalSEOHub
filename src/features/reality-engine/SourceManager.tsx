import { useState, useCallback } from 'react';
import type { SourceId, SourceState, SyncEvent } from './types';
import { createRealityRepository } from './repositories';
import { connectSource, disconnectSource, syncSource, formatRelativeTime } from './engine';
import { Button } from '../../components/ui';
import {
  trackSourceConnected,
  trackSourceSync,
  trackSourceDisconnected,
  trackSourceError,
} from '../../services/analytics/v2Analytics';
import {
  Building2,
  Globe,
  MessageSquare,
  Search,
  BarChart2,
  PenTool,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Link2,
  Unlink,
  Wifi,
  WifiOff,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  Building2: <Building2 size={18} />,
  Globe: <Globe size={18} />,
  MessageSquare: <MessageSquare size={18} />,
  Search: <Search size={18} />,
  BarChart2: <BarChart2 size={18} />,
  PenTool: <PenTool size={18} />,
};

const repo = createRealityRepository();

// ─── Source Status Card ─────────────────────────────────────────────────────

interface SourceStatusCardProps {
  source: SourceState;
  onConnect: (id: SourceId) => void;
  onDisconnect: (id: SourceId) => void;
  onSync: (id: SourceId) => void;
  syncing: boolean;
}

function SourceStatusCard({ source, onConnect, onDisconnect, onSync, syncing }: SourceStatusCardProps) {
  const statusConfig = {
    connected: { label: 'Conectada', icon: <CheckCircle2 size={14} />, color: 'text-v2-success-500' },
    pending: { label: 'Pendiente', icon: <Clock size={14} />, color: 'text-v2-warning-500' },
    error: { label: 'Error', icon: <AlertCircle size={14} />, color: 'text-v2-error-500' },
    not_connected: { label: 'Sin conectar', icon: <WifiOff size={14} />, color: 'text-v2-neutral-400' },
  };

  const config = statusConfig[source.status];
  const isManual = source.id === 'manual';

  return (
    <div className={`rounded-v2-xl border bg-white p-5 transition-all ${source.connected ? 'border-v2-success-200/60' : 'border-v2-border-light hover:border-v2-primary-200'}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-v2-lg flex items-center justify-center ${source.connected ? 'bg-v2-success-50 text-v2-success-600' : 'bg-v2-neutral-50 text-v2-neutral-500'}`}>
            {ICON_MAP[source.icon] ?? <Wifi size={18} />}
          </div>
          <div>
            <h3 className="text-v2-sm font-semibold text-v2-text-primary">{source.name}</h3>
            <p className="text-v2-xs text-v2-text-tertiary">{source.description}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1 ${config.color}`}>
          {config.icon}
          <span className="text-v2-xs font-medium">{config.label}</span>
        </div>
      </div>

      {/* Sync info */}
      {source.connected && (
        <div className="flex items-center gap-4 mb-4 text-v2-xs text-v2-text-tertiary">
          <span className="flex items-center gap-1">
            <Clock size={11} /> {formatRelativeTime(source.lastSync)}
          </span>
          {source.nextSync && (
            <span className="flex items-center gap-1">
              <RefreshCw size={11} /> Prox: {formatRelativeTime(source.nextSync)}
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {source.lastError && (
        <div className="mb-4 p-3 rounded-v2-lg bg-v2-error-50/50 border border-v2-error-200/50">
          <p className="text-v2-xs text-v2-error-600">{source.lastError}</p>
        </div>
      )}

      {/* Actions */}
      {!isManual && (
        <div className="flex items-center gap-2">
          {!source.connected ? (
            <Button size="sm" onClick={() => onConnect(source.id)} icon={<Link2 size={13} />}>
              Conectar
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" onClick={() => onSync(source.id)} disabled={syncing} icon={<RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />}>
                {syncing ? 'Sincronizando...' : 'Sincronizar'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => onDisconnect(source.id)} icon={<Unlink size={13} />}>
                Desconectar
              </Button>
            </>
          )}
        </div>
      )}

      {isManual && (
        <div className="flex items-center gap-1.5 text-v2-xs text-v2-success-600 font-medium">
          <CheckCircle2 size={12} />
          Siempre disponible
        </div>
      )}
    </div>
  );
}

// ─── Sync History Panel ─────────────────────────────────────────────────────

function SyncHistoryPanel({ events }: { events: SyncEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="rounded-v2-xl border border-v2-border-light bg-white p-5">
      <h3 className="text-v2-sm font-semibold text-v2-text-primary mb-4">Historial de sincronizacion</h3>
      <div className="space-y-2.5 max-h-64 overflow-y-auto">
        {events.slice(0, 15).map((event) => (
          <div key={event.id} className="flex items-start gap-3">
            <div className="mt-0.5">
              {event.status === 'success' ? (
                <CheckCircle2 size={13} className="text-v2-success-500" />
              ) : event.status === 'error' ? (
                <AlertCircle size={13} className="text-v2-error-500" />
              ) : (
                <RefreshCw size={13} className="text-v2-neutral-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-v2-sm text-v2-text-primary">{event.message}</p>
              <p className="text-v2-xs text-v2-text-tertiary">{formatRelativeTime(event.timestamp)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Source Manager Page ────────────────────────────────────────────────────

export default function SourceManager() {
  const [state, setState] = useState(() => repo.load());
  const [syncingId, setSyncingId] = useState<SourceId | null>(null);

  const refresh = useCallback(() => setState(repo.load()), []);

  function handleConnect(sourceId: SourceId) {
    connectSource(repo, sourceId);
    trackSourceConnected(sourceId);
    refresh();
  }

  function handleDisconnect(sourceId: SourceId) {
    disconnectSource(repo, sourceId);
    trackSourceDisconnected(sourceId);
    refresh();
  }

  function handleSync(sourceId: SourceId) {
    setSyncingId(sourceId);
    setTimeout(() => {
      const event = syncSource(repo, sourceId);
      if (event.status === 'error') trackSourceError(sourceId);
      else trackSourceSync(sourceId);
      setSyncingId(null);
      refresh();
    }, 800);
  }

  const connectedCount = state.sources.filter((s) => s.connected).length;
  const totalCount = state.sources.length;

  return (
    <div className="space-y-6 sm:space-y-8 pb-8">
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
          Fuentes de datos
        </h1>
        <p className="text-v2-sm text-v2-text-secondary mt-2 leading-relaxed">
          Conecta tus fuentes para recibir recomendaciones basadas en datos reales.
        </p>
      </div>

      {/* Connection summary */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Wifi size={16} className={connectedCount > 0 ? 'text-v2-success-500' : 'text-v2-neutral-400'} />
          <span className="text-v2-sm font-semibold text-v2-text-primary">{connectedCount} de {totalCount} conectadas</span>
        </div>
        <div className="flex gap-1">
          {state.sources.map((s) => (
            <div key={s.id} className={`w-6 h-1.5 rounded-full ${s.connected ? 'bg-v2-success-400' : 'bg-v2-neutral-100'}`} />
          ))}
        </div>
      </div>

      {/* Source cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {state.sources.map((source) => (
          <SourceStatusCard
            key={source.id}
            source={source}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onSync={handleSync}
            syncing={syncingId === source.id}
          />
        ))}
      </div>

      {/* Sync history */}
      <SyncHistoryPanel events={state.syncHistory} />
    </div>
  );
}
