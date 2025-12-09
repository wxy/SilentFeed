/**
 * AI 预算检查工具
 * Phase 12.4: Provider 级别预算控制（多货币独立预算）
 * 
 * 功能：
 * 1. 检查 provider 级别的预算使用情况
 * 2. 判断是否可以继续调用 AI
 * 3. 提供详细的预算状态信息
 * 
 * 货币说明：
 * - OpenAI: 使用美元（USD）
 * - DeepSeek: 使用人民币（CNY）
 * - 各 provider 使用各自的原生货币，不需要转换
 */

import { getAIConfig, type AIProviderType } from "@/storage/ai-config"
import { AIUsageTracker } from "@/core/ai/AIUsageTracker"
import { logger } from "./logger"

const budgetLogger = logger.withTag("BudgetChecker")

/**
 * Provider 货币映射
 */
const PROVIDER_CURRENCY: Record<AIProviderType, 'USD' | 'CNY'> = {
  openai: 'USD',
  deepseek: 'CNY'
}

/**
 * 预算状态信息
 */
export interface BudgetStatus {
  /** 预算限制（provider 原生货币） */
  limit: number
  /** 已使用金额（provider 原生货币） */
  used: number
  /** 剩余金额（provider 原生货币） */
  remaining: number
  /** 使用率（0-1） */
  usageRate: number
  /** 是否超出预算 */
  isExceeded: boolean
  /** 货币单位 */
  currency: 'USD' | 'CNY'
}

/**
 * AI 调用预算检查结果
 */
export interface BudgetCheckResult {
  /** 是否允许调用 */
  allowed: boolean
  
  /** 阻止原因（如果 allowed = false） */
  reason?: 
    | 'budget-exceeded'      // 预算已超限
    | 'no-budget-configured' // 未配置预算
  
  /** Provider 级别预算状态 */
  budget: BudgetStatus
}

/**
 * 获取当前自然月的预算使用情况（provider 原生货币）
 * 
 * @param provider - Provider 类型
 * @returns 本月已使用的金额（provider 原生货币）和货币单位
 */
export async function getCurrentMonthUsage(provider: AIProviderType): Promise<{ amount: number; currency: 'USD' | 'CNY' }> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  
  const stats = await AIUsageTracker.getStats({
    startTime: monthStart.getTime(),
    endTime: monthEnd.getTime(),
    provider,
    onlySuccess: true
  })
  
  // 返回该 provider 原生货币的使用金额和货币单位
  const currency = PROVIDER_CURRENCY[provider]
  return {
    amount: stats.byCurrency[currency].total,
    currency
  }
}

/**
 * 检查是否可以调用指定 provider 的 AI
 * 
 * @param provider - AI provider（openai, deepseek 等）
 * @param estimatedCost - 预估的调用成本（provider 原生货币），默认 0（仅检查当前状态）
 * @returns 预算检查结果
 */
export async function canMakeAICall(
  provider: AIProviderType,
  estimatedCost: number = 0
): Promise<BudgetCheckResult> {
  try {
    const config = await getAIConfig()
    
    // 获取 provider 级别预算配置（使用 provider 原生货币）
    const budgetLimit = config.providerBudgets?.[provider]
    const currency = PROVIDER_CURRENCY[provider]
    
    // 未配置预算 = 不限制
    if (!budgetLimit || budgetLimit <= 0) {
      budgetLogger.info(`${provider} 未配置预算限制`)
      return {
        allowed: true,
        budget: {
          limit: 0,
          used: 0,
          remaining: 0,
          usageRate: 0,
          isExceeded: false,
          currency
        }
      }
    }
    
    // 查询本月使用情况（provider 原生货币）
    const usageResult = await getCurrentMonthUsage(provider)
    const used = usageResult.amount
    const remaining = budgetLimit - used
    const usageRate = used / budgetLimit
    const isExceeded = (used + estimatedCost) >= budgetLimit
    
    const budget: BudgetStatus = {
      limit: budgetLimit,
      used,
      remaining: Math.max(0, remaining),
      usageRate: Math.min(1, usageRate),
      isExceeded,
      currency
    }
    
    // 判断是否允许调用
    const allowed = !isExceeded
    const reason = isExceeded ? 'budget-exceeded' as const : undefined
    
    // 日志输出
    if (!allowed) {
      const symbol = currency === 'USD' ? '$' : '¥'
      budgetLogger.warn(`🚫 预算超限 - ${provider}`, {
        budget: `${symbol}${used.toFixed(2)}/${symbol}${budgetLimit} ${currency}`,
        estimatedCost: `${symbol}${estimatedCost.toFixed(4)} ${currency}`
      })
    }
    
    return { allowed, reason, budget }
  } catch (error) {
    budgetLogger.error("检查预算时出错:", error)
    // 发生错误时保守处理 - 允许调用但记录错误
    return {
      allowed: true,
      budget: {
        limit: 0,
        used: 0,
        remaining: 0,
        usageRate: 0,
        isExceeded: false,
        currency: PROVIDER_CURRENCY[provider]
      }
    }
  }
}

/**
 * 获取指定 provider 的预算状态
 * 不考虑预估成本，仅返回当前状态
 * 
 * @param provider - AI provider
 * @returns 预算检查结果
 */
export async function getProviderBudgetStatus(provider: AIProviderType): Promise<BudgetCheckResult> {
  return canMakeAICall(provider, 0)
}

/**
 * 获取所有已配置 provider 的预算状态
 * 
 * @returns provider 预算状态映射表
 */
export async function getAllProvidersBudgetStatus(): Promise<Record<AIProviderType, BudgetCheckResult>> {
  const config = await getAIConfig()
  const providers = Object.keys(config.providers) as AIProviderType[]
  
  const results: Partial<Record<AIProviderType, BudgetCheckResult>> = {}
  
  for (const provider of providers) {
    results[provider] = await getProviderBudgetStatus(provider)
  }
  
  return results as Record<AIProviderType, BudgetCheckResult>
}

/**
 * 检查是否应该降级到关键词分析
 * 当 provider 预算接近上限（>=80%）时返回 true
 * 
 * @param provider - AI provider
 * @returns 是否应该降级
 */
export async function shouldDowngradeToKeyword(provider: AIProviderType): Promise<boolean> {
  const status = await getProviderBudgetStatus(provider)
  
  // Provider 预算 >= 80% 时建议降级
  return status.budget.usageRate >= 0.8
}
