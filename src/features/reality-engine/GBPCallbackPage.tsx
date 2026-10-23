import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, MapPin, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';
import {
  clearStoredOAuthState,
  selectGBPLocation,
  cancelGBPAttempt,
  startGBPConnection,
} from '../../features/reality-engine/engine';
import { supabase } from '../../lib/supabase';
import { useBusiness } from '../business-memory/BusinessContext';
import { LOCATIONS_UNAVAILABLE_MSG, gbpErrorMessage, isRealLocationName } from './gbpStatus';

type Phase = 'validating' | 'select_account' | 'loading_locations' | 'select_location' | 'syncing' | 'done' | 'error';

interface Account { id: string; name: string }
interface Location { name: string; title: string }

type CancelReason = 'USER_CANCELLED' | 'NO_LOCATIONS' | 'LOCATIONS_UNAVAILABLE';

export default function GBPCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { businessId, loading: businessLoading } = useBusiness();
  const [phase, setPhase] = useState<Phase>('validating');
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [retrying, setRetrying] = useState(false);
  const started = useRef(false);

  const accountsParam = searchParams.get('accounts');
  const errorParam = searchParams.get('error');

  const showError = useCallback((msg: string) => {
    setError(msg);
    setPhase('error');
    clearStoredOAuthState();
  }, []);

  // Failures detected in the browser after Google authorised: the server closes the attempt.
  const failAndEnd = useCallback(async (msg: string, reason: CancelReason) => {
    showError(msg);
    if (businessId) await cancelGBPAttempt(businessId, reason).catch(() => undefined);
  }, [businessId, showError]);

  const handleSelectLocation = useCallback(async (accountId: string, location: Location) => {
    if (!businessId) {
      showError(gbpErrorMessage(null));
      return;
    }
    setPhase('syncing');
    try {
      const result = await selectGBPLocation(accountId, location.name, location.title, businessId);
      if (result.success) {
        setPhase('done');
      } else {
        console.warn('[gbp-callback] sync failed:', result.code);
        showError(gbpErrorMessage(result.code));
      }
    } catch {
      showError(gbpErrorMessage(null));
    }
  }, [businessId, showError]);

  const handleSelectAccount = useCallback(async (account: Account) => {
    setSelectedAccount(account);
    setPhase('loading_locations');

    try {
      const { data, error: fnError } = await supabase.functions.invoke('gbp-list-locations', {
        body: { accountId: account.id, businessId },
      });

      if (fnError || !Array.isArray(data?.locations)) {
        console.warn('[gbp-callback] locations unavailable:', typeof data?.code === 'string' ? data.code : 'invalid response');
        await failAndEnd(
          data?.success === false && typeof data.message === 'string' ? data.message : LOCATIONS_UNAVAILABLE_MSG,
          'LOCATIONS_UNAVAILABLE',
        );
        return;
      }

      const locs = (data.locations as Location[]).filter((l) => typeof l?.name === 'string' && isRealLocationName(l.name));
      if (locs.length === 0) {
        await failAndEnd(gbpErrorMessage('NO_LOCATIONS'), 'NO_LOCATIONS');
        return;
      }

      setLocations(locs);
      if (locs.length === 1) {
        await handleSelectLocation(account.id, locs[0]);
      } else {
        setPhase('select_location');
      }
    } catch {
      await failAndEnd(LOCATIONS_UNAVAILABLE_MSG, 'LOCATIONS_UNAVAILABLE');
    }
  }, [businessId, failAndEnd, handleSelectLocation]);

  // The server already exchanged the code, stored credentials and fetched accounts (or ended the attempt).
  useEffect(() => {
    if (started.current || businessLoading) return;
    started.current = true;
    clearStoredOAuthState();

    if (errorParam) {
      console.warn('[gbp-callback] connection ended:', errorParam);
      showError(gbpErrorMessage(errorParam));
      return;
    }

    if (!businessId) {
      showError(gbpErrorMessage(null));
      return;
    }

    let parsed: Account[] = [];
    try {
      const raw: unknown = accountsParam ? JSON.parse(accountsParam) : null;
      parsed = Array.isArray(raw)
        ? raw.filter((a): a is Account => typeof a?.id === 'string' && typeof a?.name === 'string')
        : [];
    } catch {
      parsed = [];
    }

    if (parsed.length === 0) {
      void failAndEnd(gbpErrorMessage(null), 'USER_CANCELLED');
      return;
    }

    setAccounts(parsed);
    if (parsed.length === 1) void handleSelectAccount(parsed[0]);
    else setPhase('select_account');
  }, [accountsParam, errorParam, businessId, businessLoading, showError, failAndEnd, handleSelectAccount]);

  const handleRetry = async () => {
    if (!businessId) {
      navigate('/fuentes');
      return;
    }
    setRetrying(true);
    const result = await startGBPConnection(businessId);
    if (result.status === 'redirect') {
      window.location.href = result.url;
      return;
    }
    setRetrying(false);
    setError(result.status === 'not_configured' ? gbpErrorMessage('NOT_CONFIGURED') : gbpErrorMessage(null));
  };

  const handleCancel = async () => {
    if (businessId) await cancelGBPAttempt(businessId, 'USER_CANCELLED').catch(() => undefined);
    navigate('/fuentes');
  };

  const cancelLink = (
    <button
      onClick={handleCancel}
      className="mt-5 w-full text-center text-v2-xs font-medium text-v2-text-tertiary hover:text-v2-text-secondary transition-colors"
    >
      Cancelar y volver a Fuentes
    </button>
  );

  return (
    <div className="min-h-screen bg-v2-bg-primary font-v2 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-v2-2xl border border-v2-border shadow-v2-lg p-6 sm:p-8">

        {(phase === 'validating' || phase === 'loading_locations' || phase === 'syncing') && (
          <div className="text-center py-8" aria-live="polite">
            <Loader2 className="w-8 h-8 animate-spin text-v2-primary-600 mx-auto mb-4" />
            <p className="text-v2-sm font-semibold text-v2-text-primary">
              {phase === 'validating' && 'Procesando autorización...'}
              {phase === 'loading_locations' && 'Cargando tus fichas de Google...'}
              {phase === 'syncing' && 'Sincronizando los datos de tu negocio...'}
            </p>
            <p className="text-v2-xs text-v2-text-tertiary mt-2">
              Esto puede tardar unos segundos.
            </p>
          </div>
        )}

        {phase === 'select_account' && (
          <div>
            <h2 className="text-v2-lg font-bold text-v2-text-primary mb-1">Selecciona una cuenta</h2>
            <p className="text-v2-xs text-v2-text-secondary mb-5">
              Elige la cuenta de Google Business Profile que quieres conectar.
            </p>
            <div className="space-y-2">
              {accounts.map(account => (
                <button
                  key={account.id}
                  onClick={() => { void handleSelectAccount(account); }}
                  className="w-full flex items-center gap-3 p-4 rounded-v2-xl border border-v2-border
                    hover:border-v2-primary-300 hover:bg-v2-primary-50/50 transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-v2-lg bg-v2-primary-50 flex items-center justify-center shrink-0">
                    <MapPin size={16} className="text-v2-primary-600" />
                  </div>
                  <span className="text-v2-sm font-medium text-v2-text-primary flex-1">{account.name}</span>
                  <ChevronRight size={16} className="text-v2-text-tertiary group-hover:text-v2-primary-600 transition-colors" />
                </button>
              ))}
            </div>
            {cancelLink}
          </div>
        )}

        {phase === 'select_location' && selectedAccount && (
          <div>
            <h2 className="text-v2-lg font-bold text-v2-text-primary mb-1">Selecciona tu negocio</h2>
            <p className="text-v2-xs text-v2-text-secondary mb-5">
              Elige la ficha que quieres sincronizar.
            </p>
            <div className="space-y-2">
              {locations.map(loc => (
                <button
                  key={loc.name}
                  onClick={() => { void handleSelectLocation(selectedAccount.id, loc); }}
                  className="w-full flex items-center gap-3 p-4 rounded-v2-xl border border-v2-border
                    hover:border-v2-primary-300 hover:bg-v2-primary-50/50 transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-v2-lg bg-emerald-50 flex items-center justify-center shrink-0">
                    <MapPin size={16} className="text-emerald-600" />
                  </div>
                  <span className="text-v2-sm font-medium text-v2-text-primary flex-1">{loc.title}</span>
                  <ChevronRight size={16} className="text-v2-text-tertiary group-hover:text-v2-primary-600 transition-colors" />
                </button>
              ))}
            </div>
            {cancelLink}
          </div>
        )}

        {phase === 'done' && (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-v2-success-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-v2-success-600" />
            </div>
            <h2 className="text-v2-lg font-bold text-v2-text-primary mb-2">
              Google Business Profile conectado
            </h2>
            <p className="text-v2-xs text-v2-text-secondary mb-6">
              Google ha confirmado tu ficha y tus datos se han sincronizado.
            </p>
            <button
              onClick={() => navigate('/fuentes')}
              className="v2-btn-primary px-6 py-2.5 text-v2-sm font-semibold"
            >
              Volver a Fuentes
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="text-center py-6" role="alert">
            <div className="w-14 h-14 rounded-full bg-v2-error-50 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-v2-error-500" />
            </div>
            <h2 className="text-v2-lg font-bold text-v2-text-primary mb-2">
              No se pudo conectar
            </h2>
            <p className="text-v2-xs text-v2-text-secondary mb-6 max-w-sm mx-auto">
              {error}
            </p>
            <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-3">
              <button
                onClick={() => navigate('/fuentes')}
                className="w-full sm:w-auto px-5 py-2.5 rounded-v2-lg text-v2-sm font-semibold border border-v2-border
                  text-v2-text-secondary hover:bg-v2-neutral-50 transition-colors"
              >
                Volver a Fuentes
              </button>
              <button
                onClick={handleRetry}
                disabled={retrying}
                className="w-full sm:w-auto v2-btn-primary px-5 py-2.5 text-v2-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {retrying ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                Reintentar conexión
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
