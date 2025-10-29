import { RiskManager } from '../services/risk-manager';
import { TradingPlan } from '../types/trading';

describe('RiskManager', () => {
  it('should create RiskManager instance', () => {
    const riskManager = new RiskManager();
    expect(riskManager).toBeInstanceOf(RiskManager);
  });

  it('should validate trading plan within risk limits', () => {
    const riskManager = new RiskManager();

    const tradingPlan: TradingPlan = {
      id: 'test-plan-1',
      symbol: 'BTCUSDT',
      side: 'BUY',
      type: 'MARKET',
      quantity: 0.001,
      leverage: 10,
      timestamp: Date.now()
    };

    const riskAssessment = riskManager.assessRisk(tradingPlan);

    expect(riskAssessment.isValid).toBe(true);
    expect(riskAssessment.riskScore).toBeGreaterThan(0);
  });

  describe('Price Tolerance', () => {
    it('should calculate price difference correctly', () => {
      const riskManager = new RiskManager();

      // Test 1% price increase
      const diff1 = riskManager.calculatePriceDifference(100, 101);
      expect(diff1).toBeCloseTo(1.0, 2);

      // Test 1% price decrease
      const diff2 = riskManager.calculatePriceDifference(100, 99);
      expect(diff2).toBeCloseTo(1.0, 2);

      // Test no price difference
      const diff3 = riskManager.calculatePriceDifference(100, 100);
      expect(diff3).toBe(0);
    });

    it('should calculate directional price difference correctly', () => {
      const riskManager = new RiskManager();

      // Test 1% price increase (positive)
      const diff1 = riskManager.calculateDirectionalPriceDifference(100, 101);
      expect(diff1).toBeCloseTo(1.0, 2);

      // Test 1% price decrease (negative)
      const diff2 = riskManager.calculateDirectionalPriceDifference(100, 99);
      expect(diff2).toBeCloseTo(-1.0, 2);

      // Test no price difference
      const diff3 = riskManager.calculateDirectionalPriceDifference(100, 100);
      expect(diff3).toBe(0);
    });

    it('should throw error for invalid entry price in directional calculation', () => {
      const riskManager = new RiskManager();

      // Test zero entry price
      expect(() => riskManager.calculateDirectionalPriceDifference(0, 100))
        .toThrow('Entry price must be greater than 0');

      // Test negative entry price
      expect(() => riskManager.calculateDirectionalPriceDifference(-100, 100))
        .toThrow('Entry price must be greater than 0');
    });

    it('should check price tolerance within threshold', () => {
      const riskManager = new RiskManager();

      // Within tolerance (0.3% difference)
      const result1 = riskManager.checkPriceTolerance(100, 100.3, undefined, undefined, 0.5);
      expect(result1.withinTolerance).toBe(true);
      expect(result1.shouldExecute).toBe(true);

      // Exactly at tolerance (0.5% difference)
      const result2 = riskManager.checkPriceTolerance(100, 100.5, undefined, undefined, 0.5);
      expect(result2.withinTolerance).toBe(true);
      expect(result2.shouldExecute).toBe(true);
    });

    it('should check price tolerance outside threshold', () => {
      const riskManager = new RiskManager();

      // Outside tolerance (1% difference)
      const result1 = riskManager.checkPriceTolerance(100, 101, undefined, undefined, 0.5);
      expect(result1.withinTolerance).toBe(false);
      expect(result1.shouldExecute).toBe(false);

      // Outside tolerance (0.8% difference)
      const result2 = riskManager.checkPriceTolerance(100, 99.2, undefined, undefined, 0.5);
      expect(result2.withinTolerance).toBe(false);
      expect(result2.shouldExecute).toBe(false);
    });

    describe('Directional Price Tolerance', () => {
      it('should allow execution for BUY positions when price moves down favorably', () => {
        const riskManager = new RiskManager();

        // BUY position: price moved down 1% (favorable)
        const result = riskManager.checkPriceTolerance(100, 99, "BUY", undefined, 0.5);

        expect(result.withinTolerance).toBe(false); // 1% > 0.5% tolerance
        expect(result.favorableForExecution).toBe(true); // Price down is good for BUY
        expect(result.shouldExecute).toBe(true); // Should execute due to favorable movement
        expect(result.directionalPriceDifference).toBeCloseTo(-1.0, 2);
        expect(result.reason).toContain("moved down");
        expect(result.reason).toContain("favorable for BUY position");
      });

      it('should allow execution for SELL positions when price moves up favorably', () => {
        const riskManager = new RiskManager();

        // SELL position: price moved up 1% (favorable)
        const result = riskManager.checkPriceTolerance(100, 101, "SELL", undefined, 0.5);

        expect(result.withinTolerance).toBe(false); // 1% > 0.5% tolerance
        expect(result.favorableForExecution).toBe(true); // Price up is good for SELL
        expect(result.shouldExecute).toBe(true); // Should execute due to favorable movement
        expect(result.directionalPriceDifference).toBeCloseTo(1.0, 2);
        expect(result.reason).toContain("moved up");
        expect(result.reason).toContain("favorable for SELL position");
      });

      it('should block execution for BUY positions when price moves up unfavorably', () => {
        const riskManager = new RiskManager();

        // BUY position: price moved up 1% (unfavorable)
        const result = riskManager.checkPriceTolerance(100, 101, "BUY", undefined, 0.5);

        expect(result.withinTolerance).toBe(false); // 1% > 0.5% tolerance
        expect(result.favorableForExecution).toBe(false); // Price up is bad for BUY
        expect(result.shouldExecute).toBe(false); // Should not execute
        expect(result.directionalPriceDifference).toBeCloseTo(1.0, 2);
        expect(result.reason).toContain("unfavorable for BUY position");
      });

      it('should block execution for SELL positions when price moves down unfavorably', () => {
        const riskManager = new RiskManager();

        // SELL position: price moved down 1% (unfavorable)
        const result = riskManager.checkPriceTolerance(100, 99, "SELL", undefined, 0.5);

        expect(result.withinTolerance).toBe(false); // 1% > 0.5% tolerance
        expect(result.favorableForExecution).toBe(false); // Price down is bad for SELL
        expect(result.shouldExecute).toBe(false); // Should not execute
        expect(result.directionalPriceDifference).toBeCloseTo(-1.0, 2);
        expect(result.reason).toContain("unfavorable for SELL position");
      });

      it('should allow execution when price movement is within tolerance regardless of direction', () => {
        const riskManager = new RiskManager();

        // BUY position: price moved up 0.3% (within tolerance)
        const result1 = riskManager.checkPriceTolerance(100, 100.3, "BUY", undefined, 0.5);
        expect(result1.withinTolerance).toBe(true);
        expect(result1.shouldExecute).toBe(true);
        expect(result1.reason).toContain("within tolerance");

        // SELL position: price moved down 0.3% (within tolerance)
        const result2 = riskManager.checkPriceTolerance(100, 99.7, "SELL", undefined, 0.5);
        expect(result2.withinTolerance).toBe(true);
        expect(result2.shouldExecute).toBe(true);
        expect(result2.reason).toContain("within tolerance");
      });

      it('should handle edge cases where price equals entry price', () => {
        const riskManager = new RiskManager();

        // BUY position: price equals entry price
        const result1 = riskManager.checkPriceTolerance(100, 100, "BUY", undefined, 0.5);
        expect(result1.directionalPriceDifference).toBe(0);
        expect(result1.shouldExecute).toBe(true);

        // SELL position: price equals entry price
        const result2 = riskManager.checkPriceTolerance(100, 100, "SELL", undefined, 0.5);
        expect(result2.directionalPriceDifference).toBe(0);
        expect(result2.shouldExecute).toBe(true);
      });
    });

    it('should include price tolerance in risk assessment', () => {
      const riskManager = new RiskManager();

      const tradingPlan: TradingPlan = {
        id: 'test-price-tolerance',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.001,
        leverage: 10,
        timestamp: Date.now()
      };

      // Test with price tolerance check
      const currentPrice = 101; // 1% above entry price
      const entryPrice = 100;

      const riskAssessment = riskManager.assessRiskWithPriceTolerance(
        tradingPlan,
        entryPrice,
        currentPrice,
        'BTCUSDT',
        0.5
      );

      expect(riskAssessment.priceTolerance).toBeDefined();
      expect(riskAssessment.priceTolerance?.withinTolerance).toBe(false);
      expect(riskAssessment.priceTolerance?.shouldExecute).toBe(false);
      expect(riskAssessment.priceTolerance?.priceDifference).toBeCloseTo(1.0, 2);
    });

    it('should include directional price tolerance in risk assessment', () => {
      const riskManager = new RiskManager();

      const tradingPlan: TradingPlan = {
        id: 'test-directional-price-tolerance',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.001,
        leverage: 10,
        timestamp: Date.now()
      };

      // Test with favorable price movement for BUY position (price down)
      const currentPrice = 99; // 1% below entry price (favorable)
      const entryPrice = 100;

      const riskAssessment = riskManager.assessRiskWithDirectionalPriceTolerance(
        tradingPlan,
        entryPrice,
        currentPrice,
        'BUY',
        'BTCUSDT',
        0.5
      );

      expect(riskAssessment.priceTolerance).toBeDefined();
      expect(riskAssessment.priceTolerance?.withinTolerance).toBe(false); // 1% > 0.5% tolerance
      expect(riskAssessment.priceTolerance?.shouldExecute).toBe(true); // Should execute due to favorable movement
      expect(riskAssessment.priceTolerance?.favorableForExecution).toBe(true);
      expect(riskAssessment.priceTolerance?.directionalPriceDifference).toBeCloseTo(-1.0, 2);
      expect(riskAssessment.isValid).toBe(true); // Should be valid due to favorable execution
    });

    it('should reject risk assessment when directional price tolerance fails', () => {
      const riskManager = new RiskManager();

      const tradingPlan: TradingPlan = {
        id: 'test-directional-tolerance-fail',
        symbol: 'BTCUSDT',
        side: 'BUY',
        type: 'MARKET',
        quantity: 0.001,
        leverage: 10,
        timestamp: Date.now()
      };

      // Test with unfavorable price movement for BUY position (price up)
      const currentPrice = 101; // 1% above entry price (unfavorable)
      const entryPrice = 100;

      const riskAssessment = riskManager.assessRiskWithDirectionalPriceTolerance(
        tradingPlan,
        entryPrice,
        currentPrice,
        'BUY',
        'BTCUSDT',
        0.5
      );

      expect(riskAssessment.priceTolerance).toBeDefined();
      expect(riskAssessment.priceTolerance?.withinTolerance).toBe(false);
      expect(riskAssessment.priceTolerance?.shouldExecute).toBe(false); // Should not execute
      expect(riskAssessment.priceTolerance?.favorableForExecution).toBe(false);
      expect(riskAssessment.priceTolerance?.directionalPriceDifference).toBeCloseTo(1.0, 2);
      expect(riskAssessment.isValid).toBe(false); // Should be invalid due to failed execution
      expect(riskAssessment.warnings.some(warning =>
        warning.includes('Price tolerance check failed')
      )).toBe(true);
    });
  });
});