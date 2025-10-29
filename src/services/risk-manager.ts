import { TradingPlan } from "../types/trading";
import { ConfigManager } from "./config-manager";

export interface PriceToleranceCheck {
  entryPrice: number;
  currentPrice: number;
  priceDifference: number; // Percentage difference (absolute value for backward compatibility)
  directionalPriceDifference: number; // Signed percentage difference (positive: price up, negative: price down)
  tolerance: number; // Tolerance threshold in percentage
  withinTolerance: boolean; // Within tolerance based on absolute difference
  shouldExecute: boolean; // Final execution decision considering direction
  favorableForExecution: boolean; // Whether price movement is favorable for execution
  side?: "BUY" | "SELL"; // Position side for directional consideration
  reason: string;
}

export interface RiskAssessment {
  isValid: boolean;
  riskScore: number;
  warnings: string[];
  maxLoss: number;
  suggestedPositionSize: number;
  priceTolerance?: PriceToleranceCheck;
}

export class RiskManager {
  private configManager: ConfigManager;

  constructor(configManager?: ConfigManager) {
    this.configManager = configManager || new ConfigManager();
  }

  assessRisk(tradingPlan: TradingPlan): RiskAssessment {
    // Basic risk assessment logic
    const riskScore = this.calculateRiskScore(tradingPlan);
    const warnings = this.generateWarnings(tradingPlan, riskScore);

    return {
      isValid: riskScore <= 100, // Risk score threshold
      riskScore,
      warnings,
      maxLoss: tradingPlan.quantity * 1000, // Simplified calculation
      suggestedPositionSize: tradingPlan.quantity
    };
  }

  /**
   * 计算价格差异百分比（带符号）
   * @param entryPrice 入场价格
   * @param currentPrice 当前价格
   * @returns 有符号百分比差异（正数表示价格上涨，负数表示价格下跌）
   */
  calculateDirectionalPriceDifference(entryPrice: number, currentPrice: number): number {
    if (entryPrice <= 0) {
      throw new Error('Entry price must be greater than 0');
    }
    return ((currentPrice - entryPrice) / entryPrice) * 100;
  }

  /**
   * 计算价格差异百分比（绝对值，向后兼容）
   * @param entryPrice 入场价格
   * @param currentPrice 当前价格
   * @returns 绝对值百分比差异
   */
  calculatePriceDifference(entryPrice: number, currentPrice: number): number {
    return Math.abs(this.calculateDirectionalPriceDifference(entryPrice, currentPrice));
  }

  /**
   * 检查价格是否在容忍范围内（带方向性判断）
   */
  checkPriceTolerance(
    entryPrice: number,
    currentPrice: number,
    side?: "BUY" | "SELL",
    symbol?: string,
    customTolerance?: number
  ): PriceToleranceCheck {
    const tolerance = customTolerance || this.configManager.getPriceTolerance(symbol);
    const priceDifference = this.calculatePriceDifference(entryPrice, currentPrice);
    const directionalPriceDifference = this.calculateDirectionalPriceDifference(entryPrice, currentPrice);
    const withinTolerance = priceDifference <= tolerance;

    // 判断价格移动是否有利于执行
    let favorableForExecution = false;
    if (side) {
      if (side === "BUY") {
        // 多头仓位：当前价格低于或等于入场价格时有利
        favorableForExecution = directionalPriceDifference <= 0;
      } else {
        // 空头仓位：当前价格高于或等于入场价格时有利
        favorableForExecution = directionalPriceDifference >= 0;
      }
    }

    // 执行决策：在容忍度范围内，或者在容忍度外但价格移动有利
    const shouldExecute = withinTolerance || favorableForExecution;

    // 生成详细原因说明
    let reason = "";
    if (favorableForExecution && !withinTolerance) {
      reason = `Price moved ${side === "BUY" ? "down" : "up"} by ${Math.abs(directionalPriceDifference).toFixed(2)}% which is favorable for ${side} position (exceeds tolerance ${tolerance}%)`;
    } else if (withinTolerance) {
      reason = `Price difference ${priceDifference.toFixed(2)}% is within tolerance ${tolerance}%`;
    } else {
      reason = `Price difference ${priceDifference.toFixed(2)}% exceeds tolerance ${tolerance}% and price movement is unfavorable for ${side} position`;
    }

    return {
      entryPrice,
      currentPrice,
      priceDifference,
      directionalPriceDifference,
      tolerance,
      withinTolerance,
      shouldExecute,
      favorableForExecution,
      side,
      reason
    };
  }

  /**
   * 向后兼容的方法（不带方向性判断）
   */
  checkPriceToleranceLegacy(
    entryPrice: number,
    currentPrice: number,
    symbol?: string,
    customTolerance?: number
  ): PriceToleranceCheck {
    const tolerance = customTolerance || this.configManager.getPriceTolerance(symbol);
    const priceDifference = this.calculatePriceDifference(entryPrice, currentPrice);
    const directionalPriceDifference = this.calculateDirectionalPriceDifference(entryPrice, currentPrice);
    const withinTolerance = priceDifference <= tolerance;

    return {
      entryPrice,
      currentPrice,
      priceDifference,
      directionalPriceDifference,
      tolerance,
      withinTolerance,
      shouldExecute: withinTolerance,
      favorableForExecution: false, // 向后兼容，不使用方向性判断
      reason: withinTolerance
        ? `Price difference ${priceDifference.toFixed(2)}% is within tolerance ${tolerance}%`
        : `Price difference ${priceDifference.toFixed(2)}% exceeds tolerance ${tolerance}%`
    };
  }

  /**
   * 包含价格容忍度检查的风险评估（向后兼容，不使用方向性判断）
   */
  assessRiskWithPriceTolerance(
    tradingPlan: TradingPlan,
    entryPrice: number,
    currentPrice: number,
    symbol?: string,
    customTolerance?: number
  ): RiskAssessment {
    // Get basic risk assessment
    const basicAssessment = this.assessRisk(tradingPlan);

    // Add price tolerance check (using legacy method for backward compatibility)
    const priceTolerance = this.checkPriceToleranceLegacy(entryPrice, currentPrice, symbol, customTolerance);

    // Combine warnings
    const combinedWarnings = [...basicAssessment.warnings];
    if (!priceTolerance.withinTolerance) {
      combinedWarnings.push(`Price tolerance check failed: ${priceTolerance.reason}`);
    }

    return {
      ...basicAssessment,
      warnings: combinedWarnings,
      priceTolerance,
      isValid: basicAssessment.isValid && priceTolerance.withinTolerance
    };
  }

  /**
   * 包含方向性价格容忍度检查的风险评估
   */
  assessRiskWithDirectionalPriceTolerance(
    tradingPlan: TradingPlan,
    entryPrice: number,
    currentPrice: number,
    side: "BUY" | "SELL",
    symbol?: string,
    customTolerance?: number
  ): RiskAssessment {
    // Get basic risk assessment
    const basicAssessment = this.assessRisk(tradingPlan);

    // Add directional price tolerance check
    const priceTolerance = this.checkPriceTolerance(entryPrice, currentPrice, side, symbol, customTolerance);

    // Combine warnings
    const combinedWarnings = [...basicAssessment.warnings];
    if (!priceTolerance.shouldExecute) {
      combinedWarnings.push(`Price tolerance check failed: ${priceTolerance.reason}`);
    }

    return {
      ...basicAssessment,
      warnings: combinedWarnings,
      priceTolerance,
      isValid: basicAssessment.isValid && priceTolerance.shouldExecute
    };
  }

  /**
   * 获取配置管理器
   */
  getConfigManager(): ConfigManager {
    return this.configManager;
  }

  private calculateRiskScore(tradingPlan: TradingPlan): number {
    // Simple risk scoring based on leverage and quantity
    const leverageRisk = tradingPlan.leverage * 10;
    const baseScore = 20;
    return Math.min(baseScore + leverageRisk, 100);
  }

  private generateWarnings(tradingPlan: TradingPlan, riskScore: number): string[] {
    const warnings: string[] = [];

    if (tradingPlan.leverage > 20) {
      warnings.push("High leverage detected");
    }

    if (riskScore > 80) {
      warnings.push("High risk score");
    }

    return warnings;
  }
}
