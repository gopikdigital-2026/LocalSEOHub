import { useState, useEffect, useCallback } from 'react';
import { MapPin, Globe, Unlink, AlertCircle, CheckCircle2, Loader2, Clock, ChevronDown, ChevronUp, X } from 'lucide-react';
import type { ConnectedSource, SyncEvent, SourceType, ManualEntryData } from './types';
import { SOURCE_REGISTRY, getSourceEntry } from './registry';
import { loadSources, loadSyncEvents } from './repositories';
import { connectWebsite, saveManualEntry, disconnectSource, startGBPConnection, formatRelativeTime } from './engine';
import { DataStatusBanner, SourceCard } from './SourceCard';
import { isActive, sourceDisplayStatus } from './sourceStatus';
import type { GBPStartResult } from './engine';
import { useBusiness } from '../business-memory/BusinessContext';
import { useI18n } from '../../lib/i18n';
import { useActions } from '../actions/ActionsContext';
import { PROFILE_LIMITS, isValidWebsite, normalizeWebsite } from '../business-memory/profileValidation';

// ─── Main SourceManager page ────────────────────────────────────────────────

export default function SourceManager() {
  const { businessId, currentBusiness, updateBusiness, loading: businessLoading, error: businessError } = useBusiness();
  const { lang } = useI18n();
  const { ensureFresh } = useActions();
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
    if (businessLoading) return;
    if (!businessId) {
      setError(businessError ?? 'No se pudo cargar tu negocio');
      setLoading(false);
      return;
    }
    try {
      const [s, e] = await Promise.all([loadSources(businessId), loadSyncEvents(30)]);
      setSources(s);
      setEvents(e);
      setError(null);
    } catch (err) {
      console.error('sources load failed', err);
      setError(lang === 'en' ? 'We could not load your sources. Please try again.' : 'No pudimos cargar tus fuentes. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }, [businessId, businessLoading, businessError, lang]);

  const refreshAll = useCallback(async () => {
    await refresh();
    await ensureFresh();
  }, [refresh, ensureFresh]);

  useEffect(() => { refresh(); }, [refresh]);

  const getSource = (type: SourceType) => sources.find(s => s.source_type === type);

  const cards = SOURCE_REGISTRY.map(entry => ({
    entry,
    source: getSource(entry.id),
    status: sourceDisplayStatus(entry, getSource(entry.id), entry.dependsOn ? getSource(entry.dependsOn) : undefined),
  }));
  const activeCount = cards.filter(c => isActive(c.status)).length;
  const hasChecked = cards.some(c => !c.entry.dependsOn && (c.status === 'verified' || c.status === 'analyzed'));
  const hasDeclared = cards.some(c => c.status === 'declared');

  // The URL the owner analysed is their website; record it in the profile when none was declared yet.
  const handleWebsiteAnalyzed = async (url: string) => {
    setWebsiteModal(false);
    if (currentBusiness && !currentBusiness.website?.trim()) {
      try {
        // Saving the profile already triggers a recommendation sync with the new record.
        await updateBusiness({ website: url });
        await refresh();
        return;
      } catch (err) {
        console.error('website save to profile failed', err);
      }
    }
    await refreshAll();
  };

  const handleDisconnect = async (source: ConnectedSource) => {
    const question = lang === 'en'
      ? 'Disconnecting this source removes its stored data. Continue?'
      : 'Desconectar esta fuente eliminará los datos guardados de ella. ¿Continuar?';
    if (!confirm(question)) return;
    setBusySource(source.source_type as SourceType);
    try {
      await disconnectSource(source.id, source.source_type as SourceType);
      await refreshAll();
    } catch { /* refresh will show the error */ }
    setBusySource(null);
  };

  const [gbpNotConfigured, setGbpNotConfigured] = useState(false);

  const handleGBPConnect = async () => {
    if (!businessId) return;
    setBusySource('google_business');
    const result: GBPStartResult = await startGBPConnection(businessId);
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
          {lang === 'en' ? 'Data sources' : 'Fuentes de datos'}
        </h1>
        <p className="text-v2-sm text-v2-text-secondary mt-1">
          {lang === 'en'
            ? 'Connecting Google Business Profile lets us verify your data and offer more precise recommendations.'
            : 'Conectar Google Business Profile permite verificar datos y ofrecer recomendaciones más precisas.'}
        </p>
        <p className="text-v2-xs text-v2-text-tertiary mt-1">
          {lang === 'en'
            ? 'It is recommended, not required: you already receive actions based on your business details.'
            : 'Es recomendable, no obligatorio: ya recibes acciones basadas en los datos de tu negocio.'}
        </p>
      </div>

      {/* Data status indicator */}
      <DataStatusBanner
        activeCount={activeCount}
        hasChecked={hasChecked}
        hasDeclared={hasDeclared}
        lang={lang}
      />

      {/* GBP not configured notice */}
      {gbpNotConfigured && (
        <div className="flex items-start gap-3 p-4 rounded-v2-xl bg-v2-warning-50 border border-v2-warning-200">
          <MapPin size={16} className="text-v2-warning-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-v2-xs font-semibold text-v2-warning-700">
              {lang === 'en' ? 'The Google Business Profile connection is not available yet.' : 'La conexión con Google Business Profile todavía no está disponible.'}
            </p>
            <p className="text-v2-xs text-v2-warning-600 mt-1">
              {lang === 'en'
                ? 'Meanwhile you can analyse your website or fill in the manual entry.'
                : 'Mientras tanto puedes analizar tu web o completar la entrada manual.'}
            </p>
          </div>
          <button onClick={() => setGbpNotConfigured(false)} className="ml-auto shrink-0" aria-label={lang === 'en' ? 'Close' : 'Cerrar'}>
            <X size={14} className="text-v2-warning-400" />
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div role="alert" className="flex items-start gap-3 p-4 rounded-v2-xl bg-v2-error-50 border border-v2-error-200">
          <AlertCircle size={16} className="text-v2-error-500 mt-0.5 shrink-0" />
          <p className="text-v2-xs text-v2-error-600">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto shrink-0" aria-label={lang === 'en' ? 'Close' : 'Cerrar'}>
            <X size={14} className="text-v2-error-400" />
          </button>
        </div>
      )}

      {/* Source cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map(({ entry, source, status }) => (
          <SourceCard
            key={entry.id}
            entry={entry}
            source={source}
            status={status}
            busy={busySource === entry.id}
            lang={lang}
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
            {lang === 'en' ? 'Sync history' : 'Historial de sincronización'}
          </span>
          {historyOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {historyOpen && (
          <div className="border-t border-v2-border px-4 pb-4">
            {events.length === 0 ? (
              <p className="text-v2-xs text-v2-text-tertiary py-6 text-center">
                {lang === 'en' ? 'No sync events yet.' : 'Todavía no hay eventos de sincronización.'}
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
      {websiteModal && businessId && (
        <WebsiteModal
          businessId={businessId}
          initialUrl={(getSource('website')?.metadata.analysis as { url?: string } | undefined)?.url ?? currentBusiness?.website ?? ''}
          onClose={() => setWebsiteModal(false)}
          onSuccess={(url) => { void handleWebsiteAnalyzed(url); }}
        />
      )}

      {/* Manual entry modal */}
      {manualModal && businessId && (
        <ManualEntryModal
          businessId={businessId}
          existingData={(getSource('manual')?.metadata ?? {}) as Partial<ManualEntryData>}
          onClose={() => setManualModal(false)}
          onSuccess={() => { setManualModal(false); void refreshAll(); }}
        />
      )}
    </div>
  );
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

function WebsiteModal({ businessId, initialUrl, onClose, onSuccess }: { businessId: string; initialUrl: string; onClose: () => void; onSuccess: (url: string) => void }) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedUrl = normalizeWebsite(url);
    if (!normalizedUrl) { setError('Introduce la dirección de tu web.'); return; }
    if (normalizedUrl.length > PROFILE_LIMITS.website || !isValidWebsite(normalizedUrl)) {
      setError('Escribe una dirección web válida, por ejemplo https://tunegocio.es');
      return;
    }

    setLoading(true);
    setError('');

    const result = await connectWebsite(normalizedUrl, businessId);

    if (result.success) {
      onSuccess(normalizedUrl);
    } else {
      setError(result.error ?? 'No pudimos analizar la web. Comprueba la dirección e inténtalo de nuevo.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="absolute inset-0 bg-v2-neutral-900/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-white rounded-v2-2xl shadow-v2-xl border border-v2-border p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-v2-lg font-bold text-v2-text-primary">Analizar tu web</h2>
          <button onClick={onClose} className="v2-btn-icon" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <p className="text-v2-xs text-v2-text-secondary mb-4">
          Revisamos tu página principal tal como está publicada ahora. Si corriges algo, vuelve a analizarla para que se actualicen tus recomendaciones. Si aún no tienes web guardada en Mi negocio, la guardaremos allí.
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

function ManualEntryModal({ businessId, existingData, onClose, onSuccess }: {
  businessId: string;
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
      await saveManualEntry(form as unknown as Record<string, string>, businessId);
      onSuccess();
    } catch (err) {
      console.error('manual entry save failed', err);
      setError('No pudimos guardar los datos. Inténtalo de nuevo.');
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
          Completa la informacion que quieras para mejorar las recomendaciones. Las recomendaciones basadas en estos datos se marcan como «Basado en la información de tu negocio»: son datos que nos indicas y no los verificamos.
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
                  maxLength={2000}
                  className="v2-input mt-1.5 resize-none"
                />
              ) : (
                <input
                  type="text"
                  value={form[field.key]}
                  onChange={(e) => setForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  maxLength={300}
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
