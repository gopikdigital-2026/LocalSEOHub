import { describe, it, expect } from 'vitest';
import { generateFirstRecommendation, getGoalLabel, computeTimeToFirstValue } from '../engine';
import type { RecommendationInput } from '../engine';
import type { SourceChoice, ManualContextData } from '../types';

function makeInput(overrides: Partial<RecommendationInput> = {}): RecommendationInput {
  return {
    userId: 'user-abc-123',
    businessId: 'default',
    business: { name: 'Clinica Dental Sonrie', category: 'Clinica dental', city: 'Madrid', website: '' },
    goalId: 'more_reviews',
    source: { type: 'manual_entry', sourceId: 'manual', websiteStatus: null, dataMode: 'manual', confidence: 'medium' },
    manualContext: null,
    ...overrides,
  };
}

describe('FirstValueEngine - generateFirstRecommendation', () => {
  it('generates a stable ID that does not change between calls', () => {
    const input = makeInput();
    const rec1 = generateFirstRecommendation(input);
    const rec2 = generateFirstRecommendation(input);
    expect(rec1.id).toBe(rec2.id);
  });

  it('does NOT use Date.now() in the ID', () => {
    const rec = generateFirstRecommendation(makeInput());
    expect(rec.id).not.toMatch(/\d{13}/);
  });

  it('includes all required transparency fields', () => {
    const rec = generateFirstRecommendation(makeInput());
    expect(rec.dataMode).toBeDefined();
    expect(rec.confidence).toBeDefined();
    expect(rec.evidenceSummary).toBeDefined();
    expect(rec.limitations).toBeDefined();
    expect(rec.sourceName).toBeDefined();
    expect(rec.sourceUpdatedAt).toBeDefined();
  });

  it('never claims to have detected or analyzed anything for manual source', () => {
    const rec = generateFirstRecommendation(makeInput({ source: { type: 'manual_entry', sourceId: 'manual', websiteStatus: null, dataMode: 'manual', confidence: 'medium' } }));
    const text = [rec.description, rec.reason, rec.limitations].join(' ');
    expect(text).not.toMatch(/hemos detectado/i);
    expect(text).not.toMatch(/no hemos encontrado/i);
    expect(text).not.toMatch(/tu web presenta/i);
    expect(text).not.toMatch(/tus competidores/i);
  });

  it('never claims to have detected anything for website_provided source', () => {
    const source: SourceChoice = { type: 'website_analysis', sourceId: 'website', websiteStatus: 'website_provided', dataMode: 'estimated', confidence: 'low' };
    const rec = generateFirstRecommendation(makeInput({ source, business: { name: 'Test', category: 'Peluqueria', city: 'Barcelona', website: 'https://test.com' } }));
    const text = [rec.description, rec.reason, rec.limitations].join(' ');
    expect(text).not.toMatch(/hemos detectado/i);
    expect(text).not.toMatch(/no hemos encontrado publicaciones/i);
  });

  it('marks website source as low confidence when not verified', () => {
    const source: SourceChoice = { type: 'website_analysis', sourceId: 'website', websiteStatus: 'website_provided', dataMode: 'estimated', confidence: 'low' };
    const rec = generateFirstRecommendation(makeInput({ source }));
    expect(rec.confidence).toBe('low');
    expect(rec.dataMode).toBe('estimated');
  });

  it('marks demo source as low confidence', () => {
    const source: SourceChoice = { type: 'demo', sourceId: 'manual', websiteStatus: null, dataMode: 'demo', confidence: 'low' };
    const rec = generateFirstRecommendation(makeInput({ source }));
    expect(rec.confidence).toBe('low');
    expect(rec.dataMode).toBe('demo');
  });

  it('marks manual source with context as medium confidence', () => {
    const ctx: ManualContextData = { mainService: 'Ortodoncia', clientType: 'Familias', mainChannel: 'Google', publishFrequency: 'Nunca', receivesReviews: 'Si', mainDifficulty: 'Tiempo', communicationTone: 'Profesional' };
    const rec = generateFirstRecommendation(makeInput({ manualContext: ctx }));
    expect(rec.confidence).toBe('medium');
    expect(rec.dataMode).toBe('manual');
  });

  it('personalizes content with business name and city', () => {
    const rec = generateFirstRecommendation(makeInput());
    expect(rec.preparedContent.body).toContain('Clinica Dental Sonrie');
    expect(rec.preparedContent.body).toContain('Madrid');
  });

  it('reports personalizedWith fields', () => {
    const rec = generateFirstRecommendation(makeInput());
    expect(rec.preparedContent.personalizedWith.length).toBeGreaterThan(0);
    expect(rec.preparedContent.personalizedWith).toContain('nombre del negocio');
  });

  it('reports missingData when manual context is null', () => {
    const rec = generateFirstRecommendation(makeInput({ manualContext: null }));
    // Should report at least one missing field
    expect(rec.preparedContent.missingData.length).toBeGreaterThan(0);
  });

  it('uses manual context data in content when provided', () => {
    const ctx: ManualContextData = { mainService: 'Blanqueamiento dental', clientType: 'Jovenes', mainChannel: 'Instagram', publishFrequency: 'Semanal', receivesReviews: 'Si', mainDifficulty: 'Competencia', communicationTone: 'Cercano' };
    const rec = generateFirstRecommendation(makeInput({ manualContext: ctx, goalId: 'more_web_visits' }));
    // Should include service or client data in the content
    const body = rec.preparedContent.body;
    expect(body.includes('Blanqueamiento dental') || body.includes('Jovenes')).toBe(true);
  });

  it('selects correct template based on goal', () => {
    const recReviews = generateFirstRecommendation(makeInput({ goalId: 'more_reviews' }));
    expect(recReviews.actionType).toBe('respond_reviews');

    const recSeo = generateFirstRecommendation(makeInput({ goalId: 'better_local_seo' }));
    expect(recSeo.actionType).toBe('publish_post');

    const recCalls = generateFirstRecommendation(makeInput({ goalId: 'more_calls' }));
    expect(recCalls.actionType).toBe('update_description');
  });

  it('two different users get different IDs', () => {
    const rec1 = generateFirstRecommendation(makeInput({ userId: 'user-aaa-111' }));
    const rec2 = generateFirstRecommendation(makeInput({ userId: 'user-bbb-222' }));
    expect(rec1.id).not.toBe(rec2.id);
  });

  it('two different businesses get different IDs', () => {
    const rec1 = generateFirstRecommendation(makeInput({ businessId: 'biz-1' }));
    const rec2 = generateFirstRecommendation(makeInput({ businessId: 'biz-2' }));
    expect(rec1.id).not.toBe(rec2.id);
  });

  it('website source limitations mention no real analysis', () => {
    const source: SourceChoice = { type: 'website_analysis', sourceId: 'website', websiteStatus: 'website_provided', dataMode: 'estimated', confidence: 'low' };
    const rec = generateFirstRecommendation(makeInput({ source }));
    expect(rec.limitations.toLowerCase()).toContain('no se ha realizado');
  });

  it('evidence summary includes business data', () => {
    const rec = generateFirstRecommendation(makeInput());
    expect(rec.evidenceSummary).toContain('Clinica Dental Sonrie');
    expect(rec.evidenceSummary).toContain('Madrid');
  });
});

describe('FirstValueEngine - helpers', () => {
  it('getGoalLabel returns a non-empty string for known goals', () => {
    expect(getGoalLabel('more_reviews')).toBeTruthy();
    expect(getGoalLabel('better_local_seo')).toBeTruthy();
  });

  it('computeTimeToFirstValue returns positive seconds', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const result = computeTimeToFirstValue(fiveMinAgo);
    expect(result).toBeGreaterThanOrEqual(290);
    expect(result).toBeLessThanOrEqual(310);
  });
});
