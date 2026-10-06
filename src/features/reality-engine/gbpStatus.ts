export const LOCATIONS_UNAVAILABLE_MSG =
  'No hemos podido obtener las ubicaciones de Google Business Profile. Tu cuenta no se ha conectado a ningún negocio y no mostraremos datos hasta que podamos leer una ubicación real. Vuelve a intentarlo desde Fuentes más tarde.';

// Accepts only identifiers returned by Google ("locations/123" or "accounts/x/locations/123"), never a synthetic placeholder.
export function isRealLocationName(name: string): boolean {
  return /^(accounts\/[^/]+\/)?locations\/[^/]+$/.test(name) && !name.endsWith('/locations/default');
}
