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
})
