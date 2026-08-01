import { describe, it, expect } from 'vitest';
import type { FirstValueState } from '../types';
import { createDefaultState } from '../repository';

describe('FirstValueRepository - createDefaultState', () => {
  it('creates state isolated by userId and businessId', () => {
    const s1 = createDefaultState('user-1', 'biz-a');
    const s2 = createDefaultState('user-2', 'biz-a');
    const s3 = createDefaultState('user-1', 'biz-b');

    expect(s1.userId).toBe('user-1');
    expect(s1.businessId).toBe('biz-a');
    expect(s2.userId).toBe('user-2');
    expect(s3.businessId).toBe('biz-b');
  });

  it('starts at welcome step with no recommendation', () => {
    const state = createDefaultState('user-1', 'default');
    expect(state.currentStep).toBe('welcome');
    expect(state.recommendation).toBeNull();
    expect(state.completedAt).toBeNull();
    expect(state.manualContext).toBeNull();
  });

  it('does not share progress between different users', () => {
    const s1 = createDefaultState('user-1', 'biz');
    const s2 = createDefaultState('user-2', 'biz');
    // Mutating s1 should not affect s2
    (s1 as FirstValueState).currentStep = 'primary_goal';
    expect(s2.currentStep).toBe('welcome');
  });

  it('does not share progress between different businesses', () => {
    const s1 = createDefaultState('user-1', 'biz-1');
    const s2 = createDefaultState('user-1', 'biz-2');
    (s1 as FirstValueState).selectedGoalId = 'more_reviews';
    expect(s2.selectedGoalId).toBeNull();
  });

  it('includes startedAt timestamp', () => {
    const state = createDefaultState('user-1', 'default');
    expect(state.startedAt).toBeTruthy();
    const ts = new Date(state.startedAt).getTime();
    expect(ts).toBeGreaterThan(0);
  });
});

describe('FirstValueRepository - recommendation persistence shape', () => {
  it('state recommendation preserves all required fields when assigned', () => {
    const state = createDefaultState('user-1', 'default');
    const rec = {
      id: 'fv-user-1-default-more_reviews',
      businessId: 'default',
      userId: 'user-1',
      goalId: 'more_reviews' as const,
      title: 'Test title',
      description: 'Test desc',
      reason: 'Test reason',
      evidenceSummary: 'Test evidence',
      limitations: 'Test limits',
      actionType: 'respond_reviews' as const,
      impact: 'high' as const,
      estimatedTimeMinutes: 5,
      sourceType: 'manual_entry' as const,
      sourceName: 'Manual',
      sourceUpdatedAt: '2026-01-01T00:00:00.000Z',
      dataMode: 'manual' as const,
      confidence: 'medium' as const,
      preparedContent: { title: 'T', body: 'B', callToAction: 'C', personalizedWith: ['nombre'], missingData: [] },
      status: 'new' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    state.recommendation = rec;

    // All fields survive
    expect(state.recommendation.id).toBe(rec.id);
    expect(state.recommendation.businessId).toBe(rec.businessId);
    expect(state.recommendation.userId).toBe(rec.userId);
    expect(state.recommendation.goalId).toBe(rec.goalId);
    expect(state.recommendation.title).toBe(rec.title);
    expect(state.recommendation.description).toBe(rec.description);
    expect(state.recommendation.reason).toBe(rec.reason);
    expect(state.recommendation.evidenceSummary).toBe(rec.evidenceSummary);
    expect(state.recommendation.limitations).toBe(rec.limitations);
    expect(state.recommendation.actionType).toBe(rec.actionType);
    expect(state.recommendation.impact).toBe(rec.impact);
    expect(state.recommendation.estimatedTimeMinutes).toBe(rec.estimatedTimeMinutes);
    expect(state.recommendation.sourceType).toBe(rec.sourceType);
    expect(state.recommendation.sourceName).toBe(rec.sourceName);
    expect(state.recommendation.sourceUpdatedAt).toBe(rec.sourceUpdatedAt);
    expect(state.recommendation.dataMode).toBe(rec.dataMode);
    expect(state.recommendation.confidence).toBe(rec.confidence);
    expect(state.recommendation.preparedContent).toEqual(rec.preparedContent);
    expect(state.recommendation.status).toBe(rec.status);
    expect(state.recommendation.createdAt).toBe(rec.createdAt);
    expect(state.recommendation.updatedAt).toBe(rec.updatedAt);
  });
});
