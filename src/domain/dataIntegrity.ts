import type { Recommendation } from './types';

export type DataOrigin = 'real' | 'user_provided' | 'estimated' | 'general' | 'demo' | 'unavailable';

export const ORIGIN_LABELS: Record<DataOrigin, string> = {
  real: 'Basado en tus datos',
  user_provided: 'Basado en la información de tu negocio',
  estimated: 'Estimación',
  general: 'Recomendación general',
  demo: 'Ejemplo',
  unavailable: 'Sin datos',
};

type OriginInput = Pick<Recommendation, 'dataMode' | 'confidence'> & { sourceType?: Recommendation['sourceType'] };

// Demo recommendations are catalogue tips, not findings: they surface as "general", never as "real".
export function recommendationOrigin(rec: OriginInput): DataOrigin {
  if (rec.dataMode === 'demo' || rec.confidence === 'demo') return 'general';
  if (rec.dataMode === 'estimated' || rec.confidence === 'estimated') return 'estimated';
  if (rec.sourceType === 'manual') return 'user_provided';
  return 'real';
}

export function isFinding(rec: OriginInput): boolean {
  const origin = recommendationOrigin(rec);
  return origin === 'real' || origin === 'user_provided';
}
