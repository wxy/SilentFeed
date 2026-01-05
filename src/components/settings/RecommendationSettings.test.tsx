import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RecommendationSettings } from './RecommendationSettings'

// Mock i18n helpers
vi.mock('@/i18n/helpers', () => ({
  useI18n: () => ({
    _: (key: string) => {
      const translations: Record<string, string> = {
        'recommendations.title': '推荐设置',
      }
      return translations[key] || key
    },
  }),
}))

// Mock db-pool
const mockGetPoolStats = vi.fn()
vi.mock('@/storage/db/db-pool', () => ({
  getPoolStats: () => mockGetPoolStats(),
}))

// Mock db
vi.mock('@/storage/db', () => ({
  db: {
    recommendations: {
      filter: () => ({
        count: () => Promise.resolve(3),
      }),
    },
  },
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

  const mockPoolStats = {
    raw: 10,
    prescreenedOut: 5,
    analyzedNotQualified: 3,
    candidate: {
      count: 12,
      avgScore: 0.75,
    },
    recommended: {
      count: 4,
      avgAgeMs: 3600000,
      avgAgeDays: 0.04,
    },
    exited: {
      total: 15,
      byReason: {
        read: 8,
        disliked: 2,
        saved: 3,
        replaced: 1,
        expired: 1,
        quality_dropped: 0,
      },
    },
    activeTotal: 100,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetPoolStats.mockResolvedValue(mockPoolStats)
  })

  it('应该渲染加载状态', () => {
    mockGetPoolStats.mockImplementation(() => new Promise(() => {})) // 永不 resolve
    render(<RecommendationSettings {...defaultProps} />)
    // 使用 getAllByText 因为可能有多个加载中文本
    const loadingElements = screen.getAllByText('加载中...')
    expect(loadingElements.length).toBeGreaterThan(0)
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

  it('应该显示池状态统计', async () => {
    render(<RecommendationSettings {...defaultProps} />)

    await waitFor(() => {
      // 订阅源
      expect(screen.getByText('📡 订阅源')).toBeInTheDocument()
      // 待分析
      expect(screen.getByText('📥 待分析')).toBeInTheDocument()
    })
  })

  it('应该显示废弃块统计', async () => {
    render(<RecommendationSettings {...defaultProps} />)

    await waitFor(() => {
      // 初筛淘汰
      expect(screen.getByText('🚫 初筛淘汰')).toBeInTheDocument()
      // 未达标
      expect(screen.getByText('❌ 未达标')).toBeInTheDocument()
    })
  })

  it('应该显示候选池和推荐池', async () => {
    render(<RecommendationSettings {...defaultProps} />)

    await waitFor(() => {
      // 候选池
      expect(screen.getByText('✅ 候选池')).toBeInTheDocument()
      // 推荐池
      expect(screen.getByText('⭐ 推荐池')).toBeInTheDocument()
      // 推荐池数量
      expect(screen.getByText('4/6')).toBeInTheDocument()
    })
  })

  it('应该显示退出统计', async () => {
    render(<RecommendationSettings {...defaultProps} />)

    await waitFor(() => {
      // 退出统计标题
      expect(screen.getByText(/🔚 退出统计/)).toBeInTheDocument()
      
      // 各类退出原因
      expect(screen.getByText('📖 已读')).toBeInTheDocument()
      expect(screen.getByText('📑 稍后')).toBeInTheDocument()
      expect(screen.getByText('👎 不想')).toBeInTheDocument()
      expect(screen.getByText('🔄 替换')).toBeInTheDocument()
      expect(screen.getByText('⏰ 过期')).toBeInTheDocument()
    })
  })

  it('应该显示控制块', async () => {
    render(<RecommendationSettings {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('🤖 AI 初筛')).toBeInTheDocument()
      expect(screen.getByText(/🧠 AI分析/)).toBeInTheDocument()
      expect(screen.getByText(/⏱️ 冷却期/)).toBeInTheDocument()
    })
  })

  it('应该显示弹窗显示数量', async () => {
    render(<RecommendationSettings {...defaultProps} />)

    await waitFor(() => {
      expect(screen.getByText('📱 弹窗显示')).toBeInTheDocument()
      // 本地查询的活跃数量 / maxRecommendations
      expect(screen.getByText('3/3')).toBeInTheDocument()
    })
  })

  describe('策略参数解析', () => {
    it('应该正确显示策略参数', async () => {
      const propsWithStrategy = {
        ...defaultProps,
        poolStrategy: {
          date: '2026-01-04',
          decision: {
            minInterval: 1800000, // 30分钟
            poolSize: 8,
            reasoning: '基于用户活跃度调整',
            confidence: 0.85,
          },
          context: {},
        },
        recommendationScheduler: {
          currentIntervalMinutes: 5,
        },
      }

      render(<RecommendationSettings {...propsWithStrategy} />)

      await waitFor(() => {
        // 冷却期显示
        expect(screen.getByText(/冷却期 · 30分钟/)).toBeInTheDocument()
        // 分析间隔
        expect(screen.getByText(/AI分析 · 5分钟/)).toBeInTheDocument()
      })
    })

    it('应该显示默认策略参数', async () => {
      render(<RecommendationSettings {...defaultProps} />)

      await waitFor(() => {
        // 默认冷却期 60 分钟
        expect(screen.getByText(/冷却期 · 60分钟/)).toBeInTheDocument()
        // 默认分析间隔 1 分钟
        expect(screen.getByText(/AI分析 · 1分钟/)).toBeInTheDocument()
      })
    })
  })

  describe('智能推荐策略区块', () => {
    it('学习阶段应显示学习中状态', async () => {
      render(<RecommendationSettings {...defaultProps} isLearningStage={true} />)

      await waitFor(() => {
        // 智能推荐策略标题
        expect(screen.getByText('智能推荐策略')).toBeInTheDocument()
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

  describe('错误处理', () => {
    it('加载失败时应显示暂无数据', async () => {
      mockGetPoolStats.mockRejectedValue(new Error('加载失败'))

      render(<RecommendationSettings {...defaultProps} />)

      await waitFor(() => {
        expect(screen.getByText('暂无数据')).toBeInTheDocument()
      })
    })
  })
})
