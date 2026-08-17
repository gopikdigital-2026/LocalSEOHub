import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, MapPin, CheckCircle2, ChevronRight } from 'lucide-react';
import {
  getStoredOAuthState,
  clearStoredOAuthState,
  completeGBPConnection,
  selectGBPLocation,
} from '../../features/reality-engine/engine';
import { supabase } from '../../lib/supabase';

type Phase = 'validating' | 'select_account' | 'loading_locations' | 'select_location' | 'syncing' | 'done' | 'error';

interface Account { id: string; name: string }
interface Location { name: string; title: string }

export default function GBPCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('validating');
  const [error, setError] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');

  const handleError = useCallback((msg: string) => {
    setError(msg);
    setPhase('error');
    clearStoredOAuthState();
  }, []);

  // Step 1: Validate state + exchange code
  useEffect(() => {
    if (phase !== 'validating') return;

    if (!code || !stateParam) {
      handleError('Faltan parametros de autorizacion. Vuelve a intentar la conexion desde Fuentes.');
      return;
    }

    const storedState = getStoredOAuthState();
    if (!storedState || storedState !== stateParam) {
      handleError('La verificacion de seguridad ha fallado (state no coincide). Vuelve a iniciar la conexion.');
      return;
    }

    clearStoredOAuthState();

    completeGBPConnection(code, stateParam).then(result => {
      if (!result.success) {
        handleError(result.error ?? 'Error al completar la autorizacion');
        return;
      }
      if (result.accounts && result.accounts.length > 0) {
        setAccounts(result.accounts);
        if (result.accounts.length === 1) {
          handleSelectAccount(result.accounts[0]);
        } else {
          setPhase('select_account');
        }
      } else {
        handleError('No se encontraron cuentas de Google Business Profile asociadas.');
      }
    });
  }, [phase, code, stateParam, handleError]);

  // Step 2: Load locations for selected account
  const handleSelectAccount = async (account: Account) => {
    setSelectedAccount(account);
    setPhase('loading_locations');

    try {
      const { data, error: fnError } = await supabase.functions.invoke('gbp-list-locations', {
        body: { accountId: account.id },
      });

      if (fnError || !data?.locations) {
        // If no location listing available, let user proceed with account as location
        setLocations([{ name: `${account.id}/locations/default`, title: account.name }]);
        setPhase('select_location');
        return;
      }

      const locs = (data.locations as Location[]);
      if (locs.length === 0) {
        handleError('No se encontraron ubicaciones en esta cuenta. Verifica que tu negocio este registrado en Google Business Profile.');
        return;
      }

      setLocations(locs);
      if (locs.length === 1) {
        handleSelectLocation(account.id, locs[0]);
      } else {
        setPhase('select_location');
      }
    } catch {
      // Fallback: use account as single location
      setLocations([{ name: `${account.id}/locations/default`, title: account.name }]);
      setPhase('select_location');
    }
  };

  // Step 3: Sync selected location
  const handleSelectLocation = async (accountId: string, location: Location) => {
    setPhase('syncing');
    const result = await selectGBPLocation(accountId, location.name, location.title);
    if (result.success) {
      setPhase('done');
    } else {
      handleError(result.error ?? 'Error durante la sincronizacion');
    }
  };

  return (
    <div className="min-h-screen bg-v2-bg-primary font-v2 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-v2-2xl border border-v2-border shadow-v2-lg p-6 sm:p-8">

        {/* ── Validating / Loading ── */}
        {(phase === 'validating' || phase === 'loading_locations' || phase === 'syncing') && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-v2-primary-600 mx-auto mb-4" />
            <p className="text-v2-sm font-semibold text-v2-text-primary">
              {phase === 'validating' && 'Verificando autorizacion...'}
              {phase === 'loading_locations' && 'Cargando ubicaciones...'}
              {phase === 'syncing' && 'Sincronizando datos del negocio...'}
            </p>
            <p className="text-v2-xs text-v2-text-tertiary mt-2">
              Esto puede tardar unos segundos.
            </p>
          </div>
        )}

        {/* ── Select account ── */}
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
                  onClick={() => handleSelectAccount(account)}
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
          </div>
        )}

        {/* ── Select location ── */}
        {phase === 'select_location' && selectedAccount && (
          <div>
            <h2 className="text-v2-lg font-bold text-v2-text-primary mb-1">Selecciona tu negocio</h2>
            <p className="text-v2-xs text-v2-text-secondary mb-5">
              Elige la ubicacion que quieres sincronizar.
            </p>
            <div className="space-y-2">
              {locations.map(loc => (
                <button
                  key={loc.name}
                  onClick={() => handleSelectLocation(selectedAccount.id, loc)}
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
          </div>
        )}

        {/* ── Done ── */}
        {phase === 'done' && (
          <div className="text-center py-8">
            <div className="w-14 h-14 rounded-full bg-v2-success-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-7 h-7 text-v2-success-600" />
            </div>
            <h2 className="text-v2-lg font-bold text-v2-text-primary mb-2">
              Google Business Profile conectado
            </h2>
            <p className="text-v2-xs text-v2-text-secondary mb-6">
              Tus datos han sido sincronizados correctamente.
            </p>
            <button
              onClick={() => navigate('/fuentes')}
              className="v2-btn-primary px-6 py-2.5 text-v2-sm font-semibold"
            >
              Volver a Fuentes
            </button>
          </div>
        )}

        {/* ── Error ── */}
        {phase === 'error' && (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-v2-error-50 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-v2-error-500" />
            </div>
            <h2 className="text-v2-lg font-bold text-v2-text-primary mb-2">
              No se pudo conectar
            </h2>
            <p className="text-v2-xs text-v2-text-secondary mb-6 max-w-sm mx-auto">
              {error}
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => navigate('/fuentes')}
                className="px-5 py-2.5 rounded-v2-lg text-v2-sm font-semibold border border-v2-border
                  text-v2-text-secondary hover:bg-v2-neutral-50 transition-colors"
              >
                Volver a Fuentes
              </button>
              <button
                onClick={() => navigate('/fuentes')}
                className="v2-btn-primary px-5 py-2.5 text-v2-sm font-semibold"
              >
                Reintentar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
