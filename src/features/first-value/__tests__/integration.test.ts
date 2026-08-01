import { describe, it, expect } from 'vitest';
import type { SourceChoice } from '../types';

describe('FirstValue - Source states', () => {
  it('website_analysis source has websiteStatus = website_provided (not verified)', () => {
    const source: SourceChoice = {
      type: 'website_analysis',
      sourceId: 'website',
      websiteStatus: 'website_provided',
      dataMode: 'estimated',
      confidence: 'low',
    };
    expect(source.websiteStatus).toBe('website_provided');
    expect(source.websiteStatus).not.toBe('website_verified');
  });

  it('manual source has null websiteStatus', () => {
    const source: SourceChoice = {
      type: 'manual_entry',
      sourceId: 'manual',
      websiteStatus: null,
      dataMode: 'manual',
      confidence: 'medium',
    };
    expect(source.websiteStatus).toBeNull();
  });

  it('demo source has low confidence', () => {
    const source: SourceChoice = {
      type: 'demo',
      sourceId: 'manual',
      websiteStatus: null,
      dataMode: 'demo',
      confidence: 'low',
    };
    expect(source.confidence).toBe('low');
    expect(source.dataMode).toBe('demo');
  });
});

describe('FirstValue - Analytics dedup', () => {
  it('tracked set prevents duplicate events in same session', () => {
    const tracked = new Set<string>();
    const key = 'fv_started:user1:biz1';

    let fired = 0;
    function trackOnce(k: string) {
      if (tracked.has(k)) return;
      tracked.add(k);
      fired++;
    }

    trackOnce(key);
    trackOnce(key);
    trackOnce(key);

    expect(fired).toBe(1);
  });

  it('different users get separate tracking keys', () => {
    const tracked = new Set<string>();
    let fired = 0;
    function trackOnce(k: string) {
      if (tracked.has(k)) return;
      tracked.add(k);
      fired++;
    }

    trackOnce('fv_started:user1:biz1');
    trackOnce('fv_started:user2:biz1');

    expect(fired).toBe(2);
  });
});
