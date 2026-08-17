import { useState, useEffect, useCallback } from 'react';
import { MapPin, Globe, Star, Search, BarChart2, PenLine, RefreshCw, Unlink, AlertCircle, CheckCircle2, Loader2, Clock, ExternalLink, ChevronDown, ChevronUp, Wifi, WifiOff, X } from 'lucide-react';
import type { ConnectedSource, SyncEvent, SourceType, ManualEntryData } from './types';
import { SOURCE_REGISTRY, getSourceEntry } from './registry';
import { loadSources, loadSyncEvents } from './repositories';
import { connectWebsite, saveManualEntry, disconnectSource, startGBPConnection, formatRelativeTime } from './engine';
import type { GBPStartResult } from './engine';

const ICON_MAP: Record<string, React.ElementType> = {
  'map-pin': MapPin,
  'globe': Globe,
  'star': Star,
  'search': Search,
  'bar-chart-2': BarChart2,
  'pen-line': PenLine,
};

// ─── Main SourceManager page ────────────────────────────────────────────────

export default function SourceManager() {
  const [sources, setSources] = useState<ConnectedSource[]>([]);
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [websiteModal, setWebsiteModal] = useState(false);
  const [manualModal, setManualModal] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Working state for async operations
  const [busySource, setBusySource] = useState<SourceType | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [s, e] = await Promise.all([loadSources(), loadSyncEvents(30)]);
      setSources(s);
      setEvents(e);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar fuentes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const getSource = (type: SourceType) => sources.find(s => s.source_type === type);

  const connectedCount = sources.filter(s => s.status === 'connected').length;
  const hasVerified = sources.some(s => s.status === 'connected' && s.source_type !== 'manual');
  const hasManual = sources.some(s => s.status === 'connected' && s.source_type === 'manual');

  const handleDisconnect = async (source: ConnectedSource) => {
    if (!confirm('Desconectar esta fuente eliminara los datos asociados. Continuar?')) return;
    setBusySource(source.source_type as SourceType);
    try {
      await disconnectSource(source.id, source.source_type as SourceType);
      await refresh();
    } catch { /* refresh will show the error */ }
    setBusySource(null);
  };

  const [gbpNotConfigured, setGbpNotConfigured] = useState(false);

  const handleGBPConnect = async () => {
    setBusySource('google_business');
    const result: GBPStartResult = await startGBPConnection();
    if (result.status === 'not_configured') {
      setGbpNotConfigured(true);
      setBusySource(null);
      return;
    }
    if (result.status === 'error') {
      setError(result.message);
      setBusySource(null);
      return;
    }
    window.location.href = result.url;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-v2-text-tertiary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8 pb-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-v2-2xl sm:text-v2-3xl font-bold text-v2-text-primary tracking-tight">
          Fuentes de datos
        </h1>
        <p className="text-v2-sm text-v2-text-secondary mt-1">
          Conecta tus cuentas para obtener recomendaciones basadas en datos reales.
        </p>
      </div>

      {/* Data status indicator */}
      <DataStatusBanner
        connectedCount={connectedCount}
        hasVerified={hasVerified}
        hasManual={hasManual}
      />

      {/* GBP not configured notice */}
      {gbpNotConfigured && (
        <div className="flex items-start gap-3 p-4 rounded-v2-xl bg-v2-warning-50 border border-v2-warning-200">
          <MapPin size={16} className="text-v2-warning-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-v2-xs font-semibold text-v2-warning-700">
              La conexion con Google Business esta pendiente de configuracion.
            </p>
            <p className="text-v2-xs text-v2-warning-600 mt-1">
              Estamos preparando la integracion. Mientras tanto, puedes conectar tu sitio web o completar la entrada manual.
            </p>
          </div>
          <button onClick={() => setGbpNotConfigured(false)} className="ml-auto shrink-0">
            <X size={14} className="text-v2-warning-400" />
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-3 p-4 rounded-v2-xl bg-v2-error-50 border border-v2-error-200">
          <AlertCircle size={16} className="text-v2-error-500 mt-0.5 shrink-0" />
          <p className="text-v2-xs text-v2-error-600">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto shrink-0">
            <X size={14} className="text-v2-error-400" />
          </button>
        </div>
      )}

      {/* Source cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {SOURCE_REGISTRY.map(entry => (
          <SourceCard
            key={entry.id}
            entry={entry}
            source={getSource(entry.id)}
            busy={busySource === entry.id}
            gbpConnected={!!getSource('google_business')}
            onConnect={() => {
              if (entry.id === 'google_business') handleGBPConnect();
              else if (entry.id === 'website') setWebsiteModal(true);
              else if (entry.id === 'manual') setManualModal(true);
            }}
            onDisconnect={(s) => handleDisconnect(s)}
          />
        ))}
      </div>

      {/* Sync history */}
      <div className="rounded-v2-xl border border-v2-border bg-white">
        <button
          onClick={() => setHistoryOpen(!historyOpen)}
          className="w-full flex items-center justify-between p-4 text-v2-sm font-semibold text-v2-text-primary hover:bg-v2-neutral-50 transition-colors rounded-v2-xl"
        >
          <span className="flex items-center gap-2">
            <Clock size={15} className="text-v2-text-tertiary" />
            Historial de sincronizacion
          </span>
          {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {historyOpen && (
          <div className="border-t border-v2-border px-4 pb-4">
            {events.length === 0 ? (
              <p className="text-v2-xs text-v2-text-tertiary py-6 text-center">
                No hay eventos de sincronizacion todavia.
              </p>
            ) : (
              <div className="divide-y divide-v2-border">
                {events.map(ev => (
                  <SyncEventRow key={ev.id} event={ev} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Website modal */}
      {websiteModal && (
        <WebsiteModal
          onClose={() => setWebsiteModal(false)}
          onSuccess={() => { setWebsiteModal(false); refresh(); }}
        />
      )}

      {/* Manual entry modal */}
      {manualModal && (
        <ManualEntryModal
          existingData={(getSource('manual')?.metadata ?? {}) as Partial<ManualEntryData>}
          onClose={() => setManualModal(false)}
          onSuccess={() => { setManualModal(false); refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Data status banner ─────────────────────────────────────────────────────

function DataStatusBanner({ connectedCount, hasVerified, hasManual }: {
  connectedCount: number;
  hasVerified: boolean;
  hasManual: boolean;
}) {
  let message: string;
  let variant: 'success' | 'info' | 'warning';

  if (hasVerified) {
    message = 'Datos suficientes para recomendaciones verificadas.';
    variant = 'success';
  } else if (hasManual) {
    message = 'Datos manuales disponibles. Conecta Google Business Profile para obtener recomendaciones verificadas.';
    variant = 'info';
  } else if (connectedCount > 0) {
    message = 'Datos estimados disponibles. Conecta mas fuentes para mejorar la precision.';
    variant = 'info';
  } else {
    message = 'Conecta Google Business Profile para obtener recomendaciones verificadas.';
    variant = 'warning';
  }

  const styles = {
    success: 'bg-v2-success-50 border-v2-success-200 text-v2-success-700',
    info: 'bg-blue-50 border-blue-200 text-blue-700',
    warning: 'bg-v2-warning-50 border-v2-warning-200 text-v2-warning-700',
  };

  const Icon = variant === 'success' ? Wifi : variant === 'info' ? Wifi : WifiOff;

  return (
    <div className={`flex items-center gap-3 p-4 rounded-v2-xl border ${styles[variant]}`}>
      <Icon size={16} className="shrink-0" />
      <div>
        <p className="text-v2-xs font-semibold">Estado de los datos</p>
        <p className="text-v2-xs mt-0.5 opacity-80">{message}</p>
      </div>
      <div className="ml-auto text-right shrink-0">
        <div className="text-v2-xs font-bold">{connectedCount}</div>
        <div className="text-[10px] opacity-60">conectadas</div>
      </div>
    </div>
  );
}

// ─── Source card ─────────────────────────────────────────────────────────────

function SourceCard({ entry, source, busy, gbpConnected, onConnect, onDisconnect }: {
  entry: typeof SOURCE_REGISTRY[number];
  source: ConnectedSource | undefined;
  busy: boolean;
  gbpConnected: boolean;
  onConnect: () => void;
  onDisconnect: (s: ConnectedSource) => void;
}) {
  const IconComp = ICON_MAP[entry.icon] ?? Globe;
  const status = source?.status ?? 'disconnected';

  const needsGBP = entry.dependsOn === 'google_business' && !gbpConnected;

  return (
    <div className={`rounded-v2-xl border bg-white p-4 sm:p-5 transition-shadow hover:shadow-v2-sm ${
      status === 'connected' ? 'border-v2-success-200' :
      status === 'error' ? 'border-v2-error-200' :
      'border-v2-border'
    }`}>
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-v2-lg flex items-center justify-center shrink-0 ${
          status === 'connected' ? 'bg-v2-success-50 text-v2-success-600' :
          status === 'error' ? 'bg-v2-error-50 text-v2-error-500' :
          'bg-v2-neutral-100 text-v2-text-tertiary'
        }`}>
          <IconComp size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-v2-sm font-semibold text-v2-text-primary truncate">{entry.name}</h3>
          <StatusBadge status={status} comingSoon={entry.comingSoon} />
        </div>
      </div>

      <p className="text-v2-xs text-v2-text-tertiary mb-4 leading-relaxed">
        {entry.description}
      </p>

      {/* Error message */}
      {source?.last_error && status === 'error' && (
        <div className="flex items-start gap-2 mb-3 p-2.5 rounded-v2-lg bg-v2-error-50">
          <AlertCircle size={13} className="text-v2-error-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-v2-error-600 leading-relaxed">{source.last_error}</p>
        </div>
      )}

      {/* Last sync */}
      {source?.last_sync_at && (
        <p className="text-[11px] text-v2-text-tertiary mb-3 flex items-center gap-1.5">
          <RefreshCw size={11} />
          Ultima sync: {formatRelativeTime(source.last_sync_at)}
        </p>
      )}

      {/* Dependency notice */}
      {needsGBP && !entry.comingSoon && (
        <p className="text-[11px] text-v2-warning-600 bg-v2-warning-50 p-2 rounded-v2-lg mb-3">
          Conecta Google Business Profile para activar esta fuente.
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {entry.comingSoon ? (
          <span className="text-v2-xs text-v2-text-tertiary italic">
            Disponible en la siguiente integracion
          </span>
        ) : status === 'disconnected' || status === 'permissions_required' ? (
          <button
            onClick={onConnect}
            disabled={busy || needsGBP}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-v2-lg text-v2-xs font-semibold
              bg-v2-primary-600 text-white hover:bg-v2-primary-700 disabled:opacity-50
              disabled:cursor-not-allowed transition-colors"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ExternalLink size={13} />}
            {status === 'permissions_required' ? 'Resolver permisos' : 'Conectar'}
          </button>
        ) : status === 'connecting' || status === 'syncing' ? (
          <span className="flex items-center gap-1.5 text-v2-xs text-v2-text-secondary">
            <Loader2 size={13} className="animate-spin" />
            {status === 'connecting' ? 'Conectando...' : 'Sincronizando...'}
          </span>
        ) : status === 'error' ? (
          <button
            onClick={onConnect}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-v2-lg text-v2-xs font-semibold
              bg-v2-error-50 text-v2-error-600 hover:bg-v2-error-100 transition-colors"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            Reconectar
          </button>
        ) : (
          <span className="flex items-center gap-1 text-v2-xs text-v2-success-600 font-medium">
            <CheckCircle2 size={13} />
            Conectada
          </span>
        )}

        {source && status === 'connected' && (
          <button
            onClick={() => onDisconnect(source)}
            disabled={busy}
            className="ml-auto p-1.5 rounded-v2-md text-v2-text-tertiary hover:text-v2-error-500
              hover:bg-v2-error-50 transition-colors"
            title="Desconectar"
          >
            <Unlink size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status, comingSoon }: { status: string; comingSoon: boolean }) {
  if (comingSoon) {
    return <span className="inline-block text-[10px] font-medium text-v2-text-tertiary bg-v2-neutral-100 px-1.5 py-0.5 rounded-v2-md mt-0.5">Proximamente</span>;
  }
  const config: Record<string, { label: string; cls: string }> = {
    connected: { label: 'Conectada', cls: 'bg-v2-success-50 text-v2-success-700' },
    connecting: { label: 'Conectando', cls: 'bg-blue-50 text-blue-700' },
    syncing: { label: 'Sincronizando', cls: 'bg-blue-50 text-blue-700' },
    error: { label: 'Error', cls: 'bg-v2-error-50 text-v2-error-600' },
    permissions_required: { label: 'Permisos', cls: 'bg-v2-warning-50 text-v2-warning-700' },
    disconnected: { label: 'Sin conectar', cls: 'bg-v2-neutral-100 text-v2-text-tertiary' },
  };
  const c = config[status] ?? config.disconnected;
  return <span className={`inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-v2-md mt-0.5 ${c.cls}`}>{c.label}</span>;
}

// ─── Sync event row ─────────────────────────────────────────────────────────

function SyncEventRow({ event }: { event: SyncEvent }) {
  const isError = event.event_type.includes('failed');
  const isDisconnect = event.event_type === 'source_disconnected';
  const sourceName = getSourceEntry(event.source_type)?.name ?? event.source_type;

  return (
    <div className="flex items-start gap-3 py-3">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
        isError ? 'bg-v2-error-100 text-v2-error-500' :
        isDisconnect ? 'bg-v2-neutral-100 text-v2-text-tertiary' :
        'bg-v2-success-50 text-v2-success-600'
      }`}>
        {isError ? <AlertCircle size={11} /> : isDisconnect ? <Unlink size={11} /> : <CheckCircle2 size={11} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-v2-xs text-v2-text-primary font-medium">
          {sourceName}
        </p>
        <p className="text-[11px] text-v2-text-tertiary mt-0.5">
          {event.message ?? event.event_type.replace(/_/g, ' ')}
        </p>
      </div>
      <span className="text-[10px] text-v2-text-tertiary shrink-0 mt-0.5">
        {formatRelativeTime(event.created_at)}
      </span>
    </div>
  );
}

// ─── Website modal ──────────────────────────────────────────────────────────

function WebsiteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validate = (u: string): string | null => {
    if (!u.trim()) return 'Introduce una URL';
    try {
      const parsed = new URL(u.startsWith('http') ? u : `https://${u}`);
      if (!parsed.hostname.includes('.')) return 'Dominio no valido';
      return null;
    } catch {
      return 'URL no valida';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(url);
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    setError('');

    const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
    const result = await connectWebsite(normalizedUrl);

    if (result.success) {
      onSuccess();
    } else {
      setError(result.error ?? 'Error al analizar el sitio');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-v2-neutral-900/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-white rounded-v2-2xl shadow-v2-xl border border-v2-border p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-v2-lg font-bold text-v2-text-primary">Conectar sitio web</h2>
          <button onClick={onClose} className="v2-btn-icon"><X size={18} /></button>
        </div>

        <p className="text-v2-xs text-v2-text-secondary mb-4">
          Introduce la URL de tu sitio web para analizar su estado SEO basico.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="v2-label">URL del sitio web</label>
            <div className="relative mt-1.5">
              <Globe size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-v2-text-tertiary" />
              <input
                type="text"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setError(''); }}
                placeholder="ejemplo.com"
                className="v2-input pl-10"
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-v2-lg bg-v2-error-50 border border-v2-error-200">
              <AlertCircle size={13} className="text-v2-error-500 mt-0.5 shrink-0" />
              <p className="text-v2-xs text-v2-error-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full v2-btn-primary py-2.5 text-v2-sm font-semibold flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Analizando...
              </>
            ) : (
              'Analizar sitio web'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Manual entry modal ─────────────────────────────────────────────────────

const MANUAL_FIELDS: { key: keyof ManualEntryData; label: string; placeholder: string; multiline?: boolean }[] = [
  { key: 'services', label: 'Servicios principales', placeholder: 'Describe los servicios que ofreces...', multiline: true },
  { key: 'targetAudience', label: 'Publico objetivo', placeholder: 'A quien van dirigidos tus servicios...', multiline: true },
  { key: 'differentiators', label: 'Diferenciadores', placeholder: 'Que te hace diferente de la competencia...', multiline: true },
  { key: 'promotions', label: 'Promociones actuales', placeholder: 'Ofertas o descuentos vigentes...' },
  { key: 'faqs', label: 'Preguntas frecuentes', placeholder: 'Preguntas que te hacen habitualmente...', multiline: true },
  { key: 'communicationTone', label: 'Tono de comunicacion', placeholder: 'Profesional, cercano, formal, informal...' },
];

function ManualEntryModal({ existingData, onClose, onSuccess }: {
  existingData: Partial<ManualEntryData>;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState<ManualEntryData>({
    services: existingData.services ?? '',
    targetAudience: existingData.targetAudience ?? '',
    differentiators: existingData.differentiators ?? '',
    promotions: existingData.promotions ?? '',
    faqs: existingData.faqs ?? '',
    communicationTone: existingData.communicationTone ?? '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const filled = Object.values(form).filter(v => v.trim()).length;
    if (filled === 0) { setError('Completa al menos un campo'); return; }

    setLoading(true);
    setError('');
    try {
      await saveManualEntry(form as unknown as Record<string, string>);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-v2-neutral-900/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white rounded-v2-2xl shadow-v2-xl border border-v2-border p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-v2-lg font-bold text-v2-text-primary">Entrada manual</h2>
          <button onClick={onClose} className="v2-btn-icon"><X size={18} /></button>
        </div>

        <p className="text-v2-xs text-v2-text-secondary mb-5">
          Completa la informacion que quieras para mejorar las recomendaciones.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {MANUAL_FIELDS.map(field => (
            <div key={field.key}>
              <label className="v2-label">{field.label}</label>
              {field.multiline ? (
                <textarea
                  value={form[field.key]}
                  onChange={(e) => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  rows={3}
                  className="v2-input mt-1.5 resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={form[field.key]}
                  onChange={(e) => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="v2-input mt-1.5"
                />
              )}
            </div>
          ))}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-v2-lg bg-v2-error-50 border border-v2-error-200">
              <AlertCircle size={13} className="text-v2-error-500 mt-0.5 shrink-0" />
              <p className="text-v2-xs text-v2-error-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full v2-btn-primary py-2.5 text-v2-sm font-semibold flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Guardando...
              </>
            ) : (
              'Guardar informacion'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
