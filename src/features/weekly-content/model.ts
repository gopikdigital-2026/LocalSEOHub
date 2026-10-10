import { weekStart } from '../actions/engine';
import type { BusinessRecord } from '../business-memory/businessRecord';

export const MAX_GENERATIONS = 3;
export const MAX_CONTENT_CHARS = 2200;

export interface WeeklyDraft {
  id: string;
  business_id: string;
  week_start: string;
  lang: 'es' | 'en';
  content: string;
  generations: number;
  generated_at: string | null;
  edited_at: string | null;
  copied_at: string | null;
  updated_at: string;
}

export type WeeklyContentErrorCode =
  | 'profile_incomplete' | 'limit_reached' | 'in_progress' | 'ai_unavailable' | 'generation_failed'
  | 'premium_required' | 'rate_limited' | 'unauthorized' | 'invalid_week' | 'unavailable' | 'load_failed';

export class WeeklyContentError extends Error {
  constructor(public code: WeeklyContentErrorCode) {
    super(code);
    this.name = 'WeeklyContentError';
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

export function weekKey(now: Date = new Date()): string {
  const d = weekStart(now);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function weekRange(key: string): { from: Date; to: Date } {
  const [y, m, d] = key.split('-').map(Number);
  const from = new Date(y, m - 1, d);
  return { from, to: new Date(y, m - 1, d + 6) };
}

export type ProfileField = 'name' | 'category' | 'city' | 'services';

export function missingProfileFields(b: Pick<BusinessRecord, 'name' | 'category' | 'city' | 'services'> | null): ProfileField[] {
  if (!b) return ['name', 'category', 'city', 'services'];
  const missing: ProfileField[] = [];
  if (!b.name.trim()) missing.push('name');
  if (!b.category.trim()) missing.push('category');
  if (!b.city.trim()) missing.push('city');
  if (!b.services.some((s) => s.trim())) missing.push('services');
  return missing;
}

export const hasDraft = (d: WeeklyDraft | null): d is WeeklyDraft => Boolean(d && d.generations > 0 && d.content.trim());
export const remainingVersions = (d: WeeklyDraft | null) => Math.max(0, MAX_GENERATIONS - (d?.generations ?? 0));

export function validateEdit(text: string): 'empty' | 'too_long' | null {
  if (!text.trim()) return 'empty';
  if (text.length > MAX_CONTENT_CHARS) return 'too_long';
  return null;
}
