/**
 * AI 预算检查服务
 * 
 * 功能：
 * 1. 检查当前月度费用是否超出预算
 * 2. 计算预算使用率和剩余额度
 * 3. 提供超预算降级建议
 */

import { AIUsageTracker } from './AIUsageTracker'
import { getAIConfig } from '@/storage/ai-config'
import { getCurrentMonthRange, getRemainingDaysInMonth } from '@/utils/date-utils'
import { logger } from '@/utils/logger'

const budgetLogger = logger.withTag('BudgetChecker')

/**
 * 预算状态
 */
export interface BudgetStatus {
  /** 月度预算上限（USD） */
  monthlyBudget: number
  /** 当前月已使用费用（CNY） */
  currentSpent: number
  /** 当前月已使用费用（USD），汇率按 7.0 */
  currentSpentUSD: number
  /** 预算使用率（0-1） */
  usageRatio: number
  /** 是否超预算 */
  isOverBudget: boolean
  /** 是否接近预算（>= 80%） */
  nearingBudget: boolean
  /** 剩余预算（USD） */
  remaining: number
  /** 本月剩余天数 */
  remainingDays: number
  /** 建议的每日预算（USD） */
  suggestedDailyBudget: number
}

/**
 * 预算检查器
 */
export class BudgetChecker {
  /** CNY 到 USD 汇率（简化处理，实际应该从配置读取） */
  private static readonly CNY_TO_USD_RATE = 1 / 7.0
  
  /**
   * 获取当前预算状态
   * 
   * @returns 预算状态
   */
  static async getBudgetStatus(): Promise<BudgetStatus> {
    try {
      // 1. 读取配置
      const config = await getAIConfig()
      const monthlyBudget = config.monthlyBudget || 5 // 默认 $5/月
      
      // 2. 获取本月费用（CNY）
      const currentSpentCNY = await AIUsageTracker.getCurrentMonthCost()
      const currentSpentUSD = currentSpentCNY * this.CNY_TO_USD_RATE
      
      // 3. 计算使用率
      const usageRatio = monthlyBudget > 0 ? currentSpentUSD / monthlyBudget : 0
      const isOverBudget = currentSpentUSD >= monthlyBudget
      const nearingBudget = usageRatio >= 0.8
      
      // 4. 计算剩余额度
      const remaining = Math.max(0, monthlyBudget - currentSpentUSD)
      const remainingDays = getRemainingDaysInMonth()
      const suggestedDailyBudget = remainingDays > 0 ? remaining / remainingDays : 0
      
      const status: BudgetStatus = {
        monthlyBudget,
        currentSpent: currentSpentCNY,
        currentSpentUSD,
        usageRatio,
        isOverBudget,
        nearingBudget,
        remaining,
        remainingDays,
        suggestedDailyBudget
      }
      
      if (isOverBudget) {
        budgetLogger.warn("⚠️ 月度预算已超支", {
          budget: `$${monthlyBudget}`,
          spent: `$${currentSpentUSD.toFixed(4)}`,
          over: `$${(currentSpentUSD - monthlyBudget).toFixed(4)}`
        })
      } else if (nearingBudget) {
        budgetLogger.info("📊 预算使用接近上限", {
          usage: `${(usageRatio * 100).toFixed(1)}%`,
          remaining: `$${remaining.toFixed(4)}`
        })
      }
      
      return status
    } catch (error) {
      budgetLogger.error("获取预算状态失败:", error)
      
      // 失败时返回默认状态（假设未超预算）
      return {
        monthlyBudget: 5,
        currentSpent: 0,
        currentSpentUSD: 0,
        usageRatio: 0,
        isOverBudget: false,
        nearingBudget: false,
        remaining: 5,
        remainingDays: getRemainingDaysInMonth(),
        suggestedDailyBudget: 0
      }
    }
  }
  
  /**
   * 检查是否可以执行 AI 调用
   * 
   * @param estimatedCostUSD - 预估费用（USD，可选）
   * @returns { allowed: 是否允许, reason: 拒绝原因 }
   */
  static async canMakeAICall(estimatedCostUSD: number = 0): Promise<{
    allowed: boolean
    reason?: string
  }> {
    const status = await this.getBudgetStatus()
    
    // 1. 已超预算 - 禁止
    if (status.isOverBudget) {
      return {
        allowed: false,
        reason: `Monthly budget ($${status.monthlyBudget}) exceeded. Current: $${status.currentSpentUSD.toFixed(4)}`
      }
    }
    
    // 2. 如果提供了预估费用，检查是否会超预算
    if (estimatedCostUSD > 0 && status.currentSpentUSD + estimatedCostUSD > status.monthlyBudget) {
      return {
        allowed: false,
        reason: `This call would exceed monthly budget. Estimated: +$${estimatedCostUSD.toFixed(4)}`
      }
    }
    
    // 3. 允许调用
    return { allowed: true }
  }
  
  /**
   * 获取降级建议
   * 
   * @returns 是否应该降级到本地/关键词模式
   */
  static async shouldDowngrade(): Promise<boolean> {
    const status = await this.getBudgetStatus()
    return status.isOverBudget
  }
  
  /**
   * 记录预算警告（用于 UI 提示）
   * 
   * @returns 警告消息（无警告时返回 null）
   */
  static async getBudgetWarning(): Promise<string | null> {
    const status = await this.getBudgetStatus()
    
    if (status.isOverBudget) {
      return `Monthly AI budget exceeded: $${status.currentSpentUSD.toFixed(2)} / $${status.monthlyBudget}. Downgrading to keyword-only mode.`
    }
    
    if (status.nearingBudget) {
      return `AI budget warning: ${(status.usageRatio * 100).toFixed(0)}% used ($${status.currentSpentUSD.toFixed(2)} / $${status.monthlyBudget})`
    }
    
    return null
  }
}
