import type { Recommendation, ImpactLevel } from '../../domain/types';
import { personalizedScore } from '../business-memory/engine';
import { createLocalRepository } from '../business-memory/repository';
import type { BusinessMemoryState } from '../business-memory/types';

const IMPACT_WEIGHT: Record<ImpactLevel, number> = {
  high: 30,
  medium: 20,
  low: 10,
};

function urgencyScore(rec: Recommendation): number {
  if (rec.expiresAt) {
    const msLeft = new Date(rec.expiresAt).getTime() - Date.now();
    const daysLeft = msLeft / (1000 * 60 * 60 * 24);
    if (daysLeft <= 1) return 25;
    if (daysLeft <= 3) return 15;
    if (daysLeft <= 7) return 8;
  }
  if (rec.status === 'new') return 5;
  return 0;
}

function timeEfficiencyScore(rec: Recommendation): number {
  if (rec.estimatedTimeMinutes <= 10) return 15;
  if (rec.estimatedTimeMinutes <= 20) return 10;
  if (rec.estimatedTimeMinutes <= 30) return 5;
  return 0;
}

function computeBaseScore(rec: Recommendation): number {
  return (
    IMPACT_WEIGHT[rec.impact] +
    urgencyScore(rec) +
    timeEfficiencyScore(rec)
  );
}

function getMemoryState(): BusinessMemoryState {
  const repo = createLocalRepository();
  return repo.load();
}

function computePersonalizedScore(rec: Recommendation, memoryState: BusinessMemoryState): number {
  return computeBaseScore(rec) + personalizedScore(rec, memoryState);
}

export function prioritizeRecommendations(recs: Recommendation[]): Recommendation[] {
  const memoryState = getMemoryState();

  return [...recs]
    .filter((r) => r.status !== 'completed' && r.status !== 'dismissed' && r.status !== 'expired')
    .sort((a, b) => computePersonalizedScore(b, memoryState) - computePersonalizedScore(a, memoryState));
}

export function getDailyGoal(recs: Recommendation[]): Recommendation | null {
  const prioritized = prioritizeRecommendations(recs);
  return prioritized[0] ?? null;
}

export function getDailyActions(recs: Recommendation[], limit = 3): Recommendation[] {
  return prioritizeRecommendations(recs).slice(0, limit);
}
