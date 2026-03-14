import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetEngine } from '../../src/engine/budget.js';

describe('BudgetEngine', () => {
  describe('unlimited budget', () => {
    let engine: BudgetEngine;

    beforeEach(() => {
      engine = new BudgetEngine('unlimited');
    });

    it('starts at zero cost', () => {
      expect(engine.totalCost).toBe(0);
    });

    it('never reports exceeded', () => {
      engine.addCost(1000);
      expect(engine.isExceeded()).toBe(false);
    });

    it('remaining is null', () => {
      expect(engine.remaining).toBeNull();
    });
  });

  describe('numeric budget cap', () => {
    let engine: BudgetEngine;

    beforeEach(() => {
      engine = new BudgetEngine('1.00');
    });

    it('tracks cumulative cost', () => {
      engine.addCost(0.25);
      engine.addCost(0.50);
      expect(engine.totalCost).toBeCloseTo(0.75);
    });

    it('is not exceeded before reaching cap', () => {
      engine.addCost(0.99);
      expect(engine.isExceeded()).toBe(false);
    });

    it('is exceeded when cost surpasses cap', () => {
      engine.addCost(0.50);
      engine.addCost(0.51);
      expect(engine.isExceeded()).toBe(true);
    });

    it('is not exceeded at exactly the cap', () => {
      engine.addCost(1.00);
      expect(engine.isExceeded()).toBe(false);
    });

    it('reports correct remaining amount', () => {
      engine.addCost(0.30);
      expect(engine.remaining).toBeCloseTo(0.70);
    });

    it('remaining floors at 0 when over budget', () => {
      engine.addCost(2.00);
      expect(engine.remaining).toBe(0);
    });
  });

  describe('estimateScenarioCost', () => {
    let engine: BudgetEngine;

    beforeEach(() => {
      engine = new BudgetEngine('unlimited');
    });

    it('estimates $0 for free models', () => {
      expect(engine.estimateScenarioCost(100_000, true)).toBe(0);
    });

    it('estimates $0 for free model with zero tokens', () => {
      expect(engine.estimateScenarioCost(0, true)).toBe(0);
    });

    it('estimates > $0 for paid models', () => {
      const cost = engine.estimateScenarioCost(100_000, false);
      expect(cost).toBeGreaterThan(0);
    });

    it('uses $0.15 per million tokens for paid models', () => {
      const cost = engine.estimateScenarioCost(1_000_000, false);
      expect(cost).toBeCloseTo(0.15);
    });

    it('scales linearly with token count', () => {
      const half = engine.estimateScenarioCost(500_000, false);
      const full = engine.estimateScenarioCost(1_000_000, false);
      expect(full).toBeCloseTo(half * 2);
    });

    it('returns $0 for zero tokens on paid model', () => {
      expect(engine.estimateScenarioCost(0, false)).toBe(0);
    });
  });

  describe('addCost accumulation', () => {
    it('accumulates many small costs', () => {
      const engine = new BudgetEngine('10.00');
      for (let i = 0; i < 100; i++) {
        engine.addCost(0.01);
      }
      expect(engine.totalCost).toBeCloseTo(1.0);
      expect(engine.isExceeded()).toBe(false);
    });

    it('parses decimal budget string correctly', () => {
      const engine = new BudgetEngine('0.50');
      engine.addCost(0.49);
      expect(engine.isExceeded()).toBe(false);
      engine.addCost(0.02);
      expect(engine.isExceeded()).toBe(true);
    });
  });
});
