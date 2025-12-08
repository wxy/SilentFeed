/**
 * AI 预算检查服务测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { BudgetChecker } from './BudgetChecker'
import { AIUsageTracker } from './AIUsageTracker'
import { getAIConfig } from '@/storage/ai-config'
import * as dateUtils from '@/utils/date-utils'

// Mock dependencies
vi.mock('./AIUsageTracker')
vi.mock('@/storage/ai-config')
vi.mock('@/utils/date-utils', async () => {
  const actual = await vi.importActual('@/utils/date-utils')
  return {
    ...actual,
    getRemainingDaysInMonth: vi.fn()
  }
})

describe('BudgetChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // 默认配置: $10/月预算
    vi.mocked(getAIConfig).mockResolvedValue({
      monthlyBudget: 10,
      selectedProvider: 'deepseek',
      selectedModel: 'deepseek-chat',
      apiKeys: {},
      enableReasoning: false,
      engineAssignment: {
        pageAnalysis: { type: 'remote' },
        profileGeneration: { type: 'remote' },
        recommendation: { type: 'remote' }
      }
    })
    
    // 默认剩余 15 天
    vi.mocked(dateUtils.getRemainingDaysInMonth).mockReturnValue(15)
  })
  
  describe('getBudgetStatus', () => {
    it('应该返回正常状态（未超预算）', async () => {
      // 本月消费 ¥35 = $5
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(35)
      
      const status = await BudgetChecker.getBudgetStatus()
      
      expect(status.monthlyBudget).toBe(10)
      expect(status.currentSpent).toBe(35)
      expect(status.currentSpentUSD).toBeCloseTo(5, 2)
      expect(status.usageRatio).toBeCloseTo(0.5, 2)
      expect(status.isOverBudget).toBe(false)
      expect(status.nearingBudget).toBe(false)
      expect(status.remaining).toBeCloseTo(5, 2)
      expect(status.remainingDays).toBe(15)
      expect(status.suggestedDailyBudget).toBeCloseTo(5 / 15, 3)
    })
    
    it('应该识别接近预算（>= 80%）', async () => {
      // 本月消费 ¥56 = $8 (80%)
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(56)
      
      const status = await BudgetChecker.getBudgetStatus()
      
      expect(status.usageRatio).toBeCloseTo(0.8, 2)
      expect(status.nearingBudget).toBe(true)
      expect(status.isOverBudget).toBe(false)
    })
    
    it('应该识别超预算', async () => {
      // 本月消费 ¥77 = $11 (110%)
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(77)
      
      const status = await BudgetChecker.getBudgetStatus()
      
      expect(status.currentSpentUSD).toBeCloseTo(11, 2)
      expect(status.usageRatio).toBeCloseTo(1.1, 2)
      expect(status.isOverBudget).toBe(true)
      expect(status.nearingBudget).toBe(true) // 超预算也算接近预算
      expect(status.remaining).toBe(0) // 不能为负
    })
    
    it('应该处理无预算配置（默认 $5）', async () => {
      vi.mocked(getAIConfig).mockResolvedValue({
        monthlyBudget: 0, // 未设置
        selectedProvider: 'deepseek',
        selectedModel: 'deepseek-chat',
        apiKeys: {},
        enableReasoning: false,
        engineAssignment: {
          pageAnalysis: { type: 'remote' },
          profileGeneration: { type: 'remote' },
          recommendation: { type: 'remote' }
        }
      })
      
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(21)
      
      const status = await BudgetChecker.getBudgetStatus()
      
      expect(status.monthlyBudget).toBe(5) // 使用默认值
      expect(status.currentSpentUSD).toBeCloseTo(3, 2)
    })
    
    it('应该处理月末（剩余0天）', async () => {
      vi.mocked(dateUtils.getRemainingDaysInMonth).mockReturnValue(0)
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(35)
      
      const status = await BudgetChecker.getBudgetStatus()
      
      expect(status.remainingDays).toBe(0)
      expect(status.suggestedDailyBudget).toBe(0)
    })
    
    it('应该处理查询失败（返回默认状态）', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockRejectedValue(new Error('DB error'))
      
      const status = await BudgetChecker.getBudgetStatus()
      
      // 应该返回安全的默认值
      expect(status.monthlyBudget).toBe(5)
      expect(status.currentSpent).toBe(0)
      expect(status.isOverBudget).toBe(false)
    })
  })
  
  describe('canMakeAICall', () => {
    it('应该允许正常情况下的调用', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(35) // $5
      
      const result = await BudgetChecker.canMakeAICall()
      
      expect(result.allowed).toBe(true)
      expect(result.reason).toBeUndefined()
    })
    
    it('应该拒绝超预算时的调用', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(77) // $11 > $10
      
      const result = await BudgetChecker.canMakeAICall()
      
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('exceeded')
    })
    
    it('应该检查预估费用是否会超预算', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(63) // $9
      
      // 预估费用 $2，总计会达到 $11 > $10
      const result = await BudgetChecker.canMakeAICall(2)
      
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('exceed monthly budget')
    })
    
    it('应该允许不会超预算的预估调用', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(35) // $5
      
      // 预估费用 $3，总计 $8 < $10
      const result = await BudgetChecker.canMakeAICall(3)
      
      expect(result.allowed).toBe(true)
    })
  })
  
  describe('shouldDowngrade', () => {
    it('应该在超预算时建议降级', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(77) // $11
      
      const shouldDowngrade = await BudgetChecker.shouldDowngrade()
      
      expect(shouldDowngrade).toBe(true)
    })
    
    it('应该在正常情况下不建议降级', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(35) // $5
      
      const shouldDowngrade = await BudgetChecker.shouldDowngrade()
      
      expect(shouldDowngrade).toBe(false)
    })
    
    it('应该在接近预算但未超出时不建议降级', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(63) // $9 (90%)
      
      const shouldDowngrade = await BudgetChecker.shouldDowngrade()
      
      expect(shouldDowngrade).toBe(false)
    })
  })
  
  describe('getBudgetWarning', () => {
    it('应该在正常情况下不返回警告', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(35) // $5 (50%)
      
      const warning = await BudgetChecker.getBudgetWarning()
      
      expect(warning).toBeNull()
    })
    
    it('应该在接近预算时返回警告', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(63) // $9 (90%)
      
      const warning = await BudgetChecker.getBudgetWarning()
      
      expect(warning).toContain('90%')
      expect(warning).toContain('$9')
    })
    
    it('应该在超预算时返回严重警告', async () => {
      vi.mocked(AIUsageTracker.getCurrentMonthCost).mockResolvedValue(77) // $11
      
      const warning = await BudgetChecker.getBudgetWarning()
      
      expect(warning).toContain('exceeded')
      expect(warning).toContain('Downgrading')
    })
  })
})
