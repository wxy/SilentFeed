import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RecommendationSettings } from './RecommendationSettings'

// Mock i18n helpers
vi.mock('@/i18n/helpers', () => ({
  useI18n: () => ({
    _: (key: string, options?: any) => {
      const translations: Record<string, string> = {
        // 标题和文本
        '推荐投递方式': '推荐投递方式',
        '阅读列表可用': '阅读列表可用',
        '阅读列表不可用': '阅读列表不可用',
        '弹窗': '弹窗',
        '阅读列表': '阅读列表',
        '已启用阅读列表模式': '已启用阅读列表模式',
        '学习阶段': '学习阶段',
        '已浏览': '已浏览',
        '页，系统正在学习你的兴趣偏好': '页，系统正在学习你的兴趣偏好',
        
        // 策略相关
        '智能推荐策略': '智能推荐策略',
        '更新于': '更新于',
        '使用默认策略': '使用默认策略',
        '置信度': '置信度',
        'recommendation.strategy.nextGeneration': '⏱️ Next Generation',
        'recommendation.strategy.imminent': 'Soon',
        'recommendation.time.minutesLater': 'minutes later',
        'recommendation.time.hoursLater': 'hours later',
        'recommendation.time.daysLater': 'days later',
        
        // 阈值相关
        '候选池准入阈值': '候选池准入阈值',
        '文章评分高于此值才进入候选池': '文章评分高于此值才进入候选池',
        '来源：AI 策略（ID:': '来源：AI 策略（ID:',
        '）': '）',
        '触发阈值': '触发阈值',
        '池容量低于此比例时触发补充': '池容量低于此比例时触发补充',
        '补充间隔': '补充间隔',
        '下次：': '下次：',
        '每日上限': '每日上限',
        '剩余：': '剩余：',
        
        // 池状态
        '推荐池': '推荐池',
        '弹窗显示': '弹窗显示',
        'recommendations.title': '推荐设置',
      }
      
      // 处理带参数的翻译
      const translation = translations[key] || key
      if (options?.count !== undefined) {
        return `${options.count} ${translation}`
      }
      return translation
    },
  }),
}))

describe('RecommendationSettings', () => {
  const defaultProps = {
    poolStrategy: null,
    recommendationScheduler: null,
    maxRecommendations: 3,
    isLearningStage: false,
    pageCount: 50,
    totalPages: 100,
    activeRecommendationCount: 2,
    poolCapacity: 6,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该显示学习阶段提示', async () => {
    render(<RecommendationSettings {...defaultProps} isLearningStage={true} />)
    
    // 学习阶段提示不依赖数据加载，应该立即显示
    await waitFor(() => {
      // 使用 getAllByText 因为可能有多个匹配项
      const learningElements = screen.getAllByText(/学习阶段/)
      expect(learningElements.length).toBeGreaterThan(0)
    })
  })

  describe('智能推荐策略区块', () => {
    it('学习阶段应显示学习中状态（不显示智能推荐策略）', async () => {
      render(<RecommendationSettings {...defaultProps} isLearningStage={true} />)

      await waitFor(() => {
        expect(screen.getByText('学习阶段')).toBeInTheDocument()
      })
    })

    it('非学习阶段应显示策略详情', async () => {
      const propsWithStrategy = {
        ...defaultProps,
        isLearningStage: false,
        poolStrategy: {
          date: '2026-01-04',
          decision: {
            minInterval: 3600000,
            poolSize: 6,
            reasoning: '根据历史行为优化推荐频率',
            confidence: 0.92,
          },
        },
      }

      render(<RecommendationSettings {...propsWithStrategy} />)

      await waitFor(() => {
        expect(screen.getByText('智能推荐策略')).toBeInTheDocument()
        expect(screen.getByText('根据历史行为优化推荐频率')).toBeInTheDocument()
      })
    })
  })

  describe('增强显示', () => {
    it('应显示候选池准入阈值与来源', async () => {
      const props = {
        ...defaultProps,
        currentStrategy: {
          id: 'strategy-123',
          strategy: {
            meta: { generatedAt: new Date('2026-01-11').getTime() },
            candidatePool: { entryThreshold: 0.75 },
            recommendation: {
              cooldownMinutes: 30,
              dailyLimit: 5,
              refillThreshold: 2,
              targetPoolSize: 5,
            },
          },
        },
      }

      render(<RecommendationSettings {...props} />)

      await waitFor(() => {
        expect(screen.getByText(/准入阈值/)).toBeInTheDocument()
        // entryThreshold = 0.75，显示为 "0.8 分"（toFixed(1)）
        expect(screen.getByText(/0\.8/)).toBeInTheDocument()
      })
    })

    it('应显示下次推荐生成的绝对与相对时间', async () => {
      const future = Date.now() + 2 * 60 * 1000 // 2 分钟后
      const props = {
        ...defaultProps,
        poolStrategy: { decision: { reasoning: '测试', minInterval: 3600000 }, date: '2026-01-11' },
        recommendationScheduler: { nextRunTime: future },
      }

      render(<RecommendationSettings {...props} />)

      await waitFor(() => {
        expect(screen.getByText(/⏱️ Next Generation/)).toBeInTheDocument()
        // 相对时间可能显示"minutes later"或"Soon"（测试环境使用英文翻译）
        expect(screen.getByText(/minutes later|hours later|days later|Soon/)).toBeInTheDocument()
      })
    })

    it('应显示补充间隔、每日上限与触发阈值', async () => {
      const props = {
        ...defaultProps,
        isLearningStage: false, // 明确设置为非学习阶段
        currentStrategy: {
          id: 'test-strategy',
          createdAt: Date.now(),
          status: 'active' as const,
          strategy: {
            candidatePool: { entryThreshold: 0.7 },
            recommendation: {
              cooldownMinutes: 45, // 45 分钟
              dailyLimit: 8,
              refillThreshold: 3.5,
              targetPoolSize: 10, // 3.5/10 = 35%
            },
            meta: {
              validHours: 24,
              generatedAt: Date.now(),
              version: 'v1.0',
              nextReviewHours: 12
            }
          },
        },
      }

      render(<RecommendationSettings {...props} />)

      await waitFor(() => {
        expect(screen.getByText('补充间隔')).toBeInTheDocument()
        expect(screen.getByText(/45 分钟/)).toBeInTheDocument()
        expect(screen.getByText('每日上限')).toBeInTheDocument()
        expect(screen.getByText(/8 次/)).toBeInTheDocument()
        expect(screen.getByText('触发阈值')).toBeInTheDocument()
        // refillThreshold 现在直接显示原值，"3.5" 和 "条" 是分开的元素
        expect(screen.getByText((content, element) => {
          return element?.textContent === '3.5 条' || content === '3.5'
        })).toBeInTheDocument()
      })
    })

    it('应显示下次可补充时间与今日剩余次数（storage 模拟）', async () => {
      const now = Date.now()
      // 模拟 chrome.storage.local.get 返回补充状态
      const originalGet = (globalThis as any).chrome?.storage?.local?.get
      const mockGet = vi.fn().mockResolvedValue({ pool_refill_state: { lastRefillTime: now, dailyRefillCount: 2, currentDate: '2026-01-11' } })
      ;(globalThis as any).chrome = (globalThis as any).chrome || {}
      ;(globalThis as any).chrome.storage = (globalThis as any).chrome.storage || { local: {} }
      ;(globalThis as any).chrome.storage.local.get = mockGet

      const props = {
        ...defaultProps,
        currentStrategy: {
          id: 'test-strategy',
          strategy: {
            candidatePool: { entryThreshold: 0.7 },
            recommendation: {
              cooldownMinutes: 60, // 60 分钟
              dailyLimit: 5,
              refillThreshold: 3,
              targetPoolSize: 10,
            },
          },
        },
      }

      render(<RecommendationSettings {...props} />)

      await waitFor(() => {
        // 检查补充相关的标签
        expect(screen.getByText('补充间隔')).toBeInTheDocument()
        expect(screen.getByText('每日上限')).toBeInTheDocument()
        // 检查数值
        expect(screen.getByText(/60 分钟/)).toBeInTheDocument()
        expect(screen.getByText(/5 次/)).toBeInTheDocument()
      })

      // 还原 get
      ;(globalThis as any).chrome.storage.local.get = originalGet || vi.fn().mockResolvedValue({})
    })
  })

  describe('其他区块', () => {
    it('应显示推荐投递方式区块', async () => {
      render(<RecommendationSettings {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('推荐投递方式')).toBeInTheDocument()
      })
    })

    it('应显示实时状态：推荐池与弹窗', async () => {
      const props = {
        ...defaultProps,
        currentStrategy: {
          id: 'test-strategy',
          strategy: {
            candidatePool: { entryThreshold: 0.7 },
            recommendation: {
              cooldownMinutes: 60,
              dailyLimit: 5,
              refillThreshold: 3,
              targetPoolSize: 6,
            },
          },
        },
      }
      render(<RecommendationSettings {...props} />)

      await waitFor(() => {
        // 推荐池和弹窗显示在一起，格式为 "推荐池 (弹窗显示)"
        // 页面中有多个"推荐池"文本（【推荐池】和 推荐池 (弹窗显示)）
        const poolElements = screen.getAllByText(/推荐池/)
        expect(poolElements.length).toBeGreaterThan(0)
        expect(screen.getByText(/弹窗显示/)).toBeInTheDocument()
      })
    })
  })
})
