import type { BusinessAction } from '../actions/types';
import type { BusinessRecord } from '../business-memory/businessRecord';

export type ImprovementKind = 'business_description' | 'service_description' | 'faq';
export type ImprovementMode = 'create' | 'improve';

export const MAX_GENERATIONS = 3;
export const MAX_ATTEMPTS = 6;
export const MONTHLY_REQUESTS = 40;
export const MAX_CONTENT_CHARS = 2000;
export const MIN_SOURCE_CHARS = 40;
export const MAX_SOURCE_CHARS = 1500;

// Must match COMPATIBLE_RULES in the business-improvement edge function (checked by tests).
export const COMPATIBLE_RULES: Record<string, ImprovementKind> = {
  optimize_services_keywords: 'business_description',
  improve_service_description: 'service_description',
  write_faq_answers: 'faq',
};

export const supportsImprove = (kind: ImprovementKind) => kind !== 'faq';

const stripControl = (s: string) =>
  Array.from(s, (ch) => { const c = ch.charCodeAt(0); return c < 32 || c === 127 ? ' ' : ch; }).join('');

export const normalizeKeyPart = (s: string) =>
  stripControl(s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 100);

export interface ImprovementTarget {
  kind: ImprovementKind;
  semanticKey: string;
  service: string | null;
}

export function improvementTarget(action: Pick<BusinessAction, 'ruleId' | 'metadata'>): ImprovementTarget | null {
  const kind = COMPATIBLE_RULES[action.ruleId];
  if (!kind) return null;
  if (kind !== 'service_description') return { kind, semanticKey: action.ruleId, service: null };
  const evidence = (action.metadata as { evidence?: { service?: unknown } } | null)?.evidence;
  const raw = typeof evidence?.service === 'string' ? stripControl(evidence.service).replace(/\s+/g, ' ').trim().slice(0, 80) : '';
  const part = normalizeKeyPart(raw);
  return part ? { kind, semanticKey: `${action.ruleId}:${part}`, service: raw } : null;
}

export const isOpenAction = (a: Pick<BusinessAction, 'status'>) => a.status === 'PENDING' || a.status === 'IN_PROGRESS';

export const offersImprovement = (a: Pick<BusinessAction, 'ruleId' | 'metadata' | 'status'>) =>
  isOpenAction(a) && improvementTarget(a) !== null;

export interface ImprovementDraft {
  id: string;
  business_id: string;
  semantic_key: string;
  kind: ImprovementKind;
  mode: ImprovementMode;
  lang: 'es' | 'en';
  content: string;
  source_text: string;
  versions: string[];
  generations: number;
  attempts: number;
  generated_at: string | null;
  edited_at: string | null;
  copied_at: string | null;
  updated_at: string;
}

export type ImprovementErrorCode =
  | 'profile_incomplete' | 'service_not_declared' | 'incompatible_action' | 'action_closed' | 'edited_conflict'
  | 'limit_reached' | 'attempts_exhausted' | 'global_limit' | 'in_progress' | 'ai_unavailable' | 'generation_failed'
  | 'premium_required' | 'rate_limited' | 'unauthorized' | 'invalid_request' | 'not_found' | 'unavailable' | 'load_failed';

export class ImprovementError extends Error {
  constructor(public code: ImprovementErrorCode) {
    super(code);
    this.name = 'ImprovementError';
  }
}

export type ProfileField = 'name' | 'category' | 'city' | 'services';

type Facts = Pick<BusinessRecord, 'name' | 'category' | 'city' | 'services'>;

export function missingFor(kind: ImprovementKind, mode: ImprovementMode, b: Facts | null): ProfileField[] {
  if (!b) return ['name'];
  const missing: ProfileField[] = [];
  if (!b.name.trim()) missing.push('name');
  if (mode === 'improve') return missing;
  if (!b.category.trim()) missing.push('category');
  if (!b.city.trim()) missing.push('city');
  if (kind !== 'service_description' && !b.services.some((s) => s.trim())) missing.push('services');
  return missing;
}

export const serviceStillDeclared = (b: Facts | null, service: string | null) =>
  !service || Boolean(b?.services.some((s) => normalizeKeyPart(s) === normalizeKeyPart(service)));

export const hasDraft = (d: ImprovementDraft | null): d is ImprovementDraft => Boolean(d && d.generations > 0 && d.content.trim());

export const remainingVersions = (d: ImprovementDraft | null) =>
  Math.max(0, Math.min(MAX_GENERATIONS - (d?.generations ?? 0), MAX_ATTEMPTS - (d?.attempts ?? 0)));

export function validateEdit(text: string): 'empty' | 'too_long' | null {
  if (!text.trim()) return 'empty';
  if (text.length > MAX_CONTENT_CHARS) return 'too_long';
  return null;
}

export function validateSource(text: string): 'too_short' | 'too_long' | null {
  const t = text.trim();
  if (t.length < MIN_SOURCE_CHARS) return 'too_short';
  if (t.length > MAX_SOURCE_CHARS) return 'too_long';
  return null;
}

export function monthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
