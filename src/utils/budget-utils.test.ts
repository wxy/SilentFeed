/**
 * AI 预算检查工具测试
 * Phase 12.4: Provider 级别预算控制（多货币独立预算）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { canMakeAICall, getProviderBudgetStatus, getAllProvidersBudgetStatus, shouldDowngradeToKeyword } from './budget-utils'
import * as aiConfig from '@/storage/ai-config'
import { AIUsageTracker } from '@/core/ai/AIUsageTracker'
import type { AIConfig } from '@/storage/ai-config'
import type { AIUsageStats } from '@/types/ai-usage'

// Mock 模块
vi.mock('@/storage/ai-config')
vi.mock('@/core/ai/AIUsageTracker')

describe('budget-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('canMakeAICall', () => {
    it('应该在预算充足时允许调用', async () => {
      // 配置：OpenAI 预算 $10
      vi.mocked(aiConfig.getAIConfig).mockResolvedValue({
        providerBudgets: {
          openai: 10
        },
        providers: {
          openai: {
            apiKey: 'test-key',
            model: 'gpt-5-mini'
          }
        }
      } as any)

      // OpenAI 已用 $3
      vi.mocked(AIUsageTracker.getStats).mockResolvedValue({
        byCurrency: {
          USD: { total: 3 },
          CNY: { total: 0 },
          FREE: { total: 0 }
        }
      } as AIUsageStats)

      const result = await canMakeAICall('openai', 0.5)

      expect(result.allowed).toBe(true)
      expect(result.reason).toBeUndefined()
      expect(result.budget).toEqual({
        limit: 10,
        used: 3,
        remaining: 7,
        usageRate: 0.3,
        isExceeded: false,
        currency: 'USD'
      })
    })

    it('应该在 provider 预算超限时拒绝调用', async () => {
      vi.mocked(aiConfig.getAIConfig).mockResolvedValue({
        providerBudgets: {
          openai: 3
        },
        providers: {
          openai: {
            apiKey: 'test-key',
            model: 'gpt-5-mini'
          }
        }
      } as any)

      // OpenAI 已用 $2.8，再调用 $0.5 会超过 $3 预算
      vi.mocked(AIUsageTracker.getStats).mockResolvedValue({
        byCurrency: {
          USD: { total: 2.8 },
          CNY: { total: 0 },
          FREE: { total: 0 }
        }
      } as AIUsageStats)

      const result = await canMakeAICall('openai', 0.5)

      expect(result.allowed).toBe(false)
      expect(result.reason).toBe('budget-exceeded')
      expect(result.budget.isExceeded).toBe(true)
    })

    it('应该在未配置预算时允许调用', async () => {
      vi.mocked(aiConfig.getAIConfig).mockResolvedValue({
        providerBudgets: {}, // 未配置 OpenAI 预算
        providers: {
          openai: {
            apiKey: 'test-key',
            model: 'gpt-5-mini'
          }
        }
      } as any)

      vi.mocked(AIUsageTracker.getStats).mockResolvedValue({
        byCurrency: {
          USD: { total: 100 }, // 已用很多但没有限制
          CNY: { total: 0 },
          FREE: { total: 0 }
        }
      } as AIUsageStats)

      const result = await canMakeAICall('openai', 0.5)

      expect(result.allowed).toBe(true) // 未配置预算 = 不限制
      expect(result.budget.limit).toBe(0)
    })

    it('应该正确计算使用率', async () => {
      vi.mocked(aiConfig.getAIConfig).mockResolvedValue({
        providerBudgets: {
          openai: 10
        },
        providers: {
          openai: {
            apiKey: 'test-key',
            model: 'gpt-5-mini'
          }
        }
      } as any)

      vi.mocked(AIUsageTracker.getStats).mockResolvedValue({
        byCurrency: {
          USD: { total: 7.5 },
          CNY: { total: 0 },
          FREE: { total: 0 }
        }
      } as AIUsageStats)

      const result = await canMakeAICall('openai', 0)

      expect(result.allowed).toBe(true)
      expect(result.budget.usageRate).toBe(0.75) // 7.5/10
    })

    it('应该在错误时返回允许调用（保守处理）', async () => {
      vi.mocked(aiConfig.getAIConfig).mockRejectedValue(new Error('配置加载失败'))

      const result = await canMakeAICall('openai', 0)

      expect(result.allowed).toBe(true) // 错误时保守处理
    })

    it('应该支持 DeepSeek CNY 预算', async () => {
      vi.mocked(aiConfig.getAIConfig).mockResolvedValue({
        providerBudgets: {
          deepseek: 50 // ¥50 CNY
        },
        providers: {
          deepseek: {
            apiKey: 'test-key',
            model: 'deepseek-chat'
          }
        }
      } as any)

      vi.mocked(AIUsageTracker.getStats).mockResolvedValue({
        byCurrency: {
          USD: { total: 0 },
          CNY: { total: 30 },
          FREE: { total: 0 }
        }
      } as AIUsageStats)

      const result = await canMakeAICall('deepseek', 5)

      expect(result.allowed).toBe(true)
      expect(result.budget).toEqual({
        limit: 50,
        used: 30,
        remaining: 20,
        usageRate: 0.6,
        isExceeded: false,
        currency: 'CNY'
      })
    })
  })

  describe('getProviderBudgetStatus', () => {
    it('应该返回当前预算状态（不考虑预估成本）', async () => {
      vi.mocked(aiConfig.getAIConfig).mockResolvedValue({
        providerBudgets: {
          openai: 10
        },
        providers: {
          openai: {
            apiKey: 'test-key',
            model: 'gpt-5-mini'
          }
        }
      } as any)

      vi.mocked(AIUsageTracker.getStats).mockResolvedValue({
        byCurrency: {
          USD: { total: 4 },
          CNY: { total: 0 },
          FREE: { total: 0 }
        }
      } as AIUsageStats)

      const result = await getProviderBudgetStatus('openai')

      expect(result.allowed).toBe(true)
      expect(result.budget.used).toBe(4)
    })
  })

  describe('getAllProvidersBudgetStatus', () => {
    it('应该返回所有已配置 provider 的预算状态', async () => {
      vi.mocked(aiConfig.getAIConfig).mockResolvedValue({
        providerBudgets: {
          openai: 10,
          deepseek: 50
        },
        providers: {
          openai: {
            apiKey: 'test-key',
            model: 'gpt-5-mini'
          },
          deepseek: {
            apiKey: 'test-key',
            model: 'deepseek-chat'
          }
        }
      } as any)

      vi.mocked(AIUsageTracker.getStats).mockImplementation(async (query) => {
        if (query?.provider === 'openai') {
          return {
            byCurrency: {
              USD: { total: 5 },
              CNY: { total: 0 },
              FREE: { total: 0 }
            }
          } as AIUsageStats
        }
        if (query?.provider === 'deepseek') {
          return {
            byCurrency: {
              USD: { total: 0 },
              CNY: { total: 30 },
              FREE: { total: 0 }
            }
          } as AIUsageStats
        }
        return {
          byCurrency: {
            USD: { total: 5 },
            CNY: { total: 30 },
            FREE: { total: 0 }
          }
        } as AIUsageStats
      })

      const result = await getAllProvidersBudgetStatus()

      expect(Object.keys(result)).toEqual(['openai', 'deepseek'])
      expect(result.openai.budget.used).toBe(5)
      expect(result.openai.budget.currency).toBe('USD')
      expect(result.deepseek.budget.used).toBe(30)
      expect(result.deepseek.budget.currency).toBe('CNY')
    })
  })

  describe('shouldDowngradeToKeyword', () => {
    it('应该在 provider 预算 >= 80% 时建议降级', async () => {
      vi.mocked(aiConfig.getAIConfig).mockResolvedValue({
        providerBudgets: {
          openai: 10
        },
        providers: {
          openai: {
            apiKey: 'test-key',
            model: 'gpt-5-mini'
          }
        }
      } as any)

      vi.mocked(AIUsageTracker.getStats).mockResolvedValue({
        byCurrency: {
          USD: { total: 8.5 }, // 85%
          CNY: { total: 0 },
          FREE: { total: 0 }
        }
      } as AIUsageStats)

      const result = await shouldDowngradeToKeyword('openai')

      expect(result).toBe(true)
    })

    it('应该在预算充足时不建议降级', async () => {
      vi.mocked(aiConfig.getAIConfig).mockResolvedValue({
        providerBudgets: {
          openai: 10
        },
        providers: {
          openai: {
            apiKey: 'test-key',
            model: 'gpt-5-mini'
          }
        }
      } as any)

      vi.mocked(AIUsageTracker.getStats).mockResolvedValue({
        byCurrency: {
          USD: { total: 4 }, // 40%
          CNY: { total: 0 },
          FREE: { total: 0 }
        }
      } as AIUsageStats)

      const result = await shouldDowngradeToKeyword('openai')

      expect(result).toBe(false)
    })
  })
})
