/**
 * 推荐理由格式化工具测试
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { formatRecommendationReason, getReasonPlainText } from './formatReason'
import type { ReasonData } from '@/types/recommendation-reason'

// Mock 翻译函数
const mockTranslations: Record<string, string> = {
  'recommendation.reason.unknown': 'Unknown reason',
  'recommendation.reason.topicMatch': 'Highly relevant to "{{topics}}" topics',
  'recommendation.reason.interestMatch': 'Based on your interests in "{{interests}}"',
  'recommendation.reason.highQuality': 'High-quality content',
  'recommendation.reason.browsingHistory': 'Based on browsing history',
  'recommendation.reason.trending': 'Trending',
  'recommendation.reason.coldStart': 'Recommended based on subscription preferences',
  'recommendation.reason.topicSeparator': ', ',
  'recommendation.reason.template': '{{baseReason}}, {{sourceLabel}} {{matchPercent}}% match',
  'recommendation.source.algorithm': 'Algorithm',
  'recommendation.source.reasoningAI': 'Reasoning AI',
  'recommendation.source.smartAI': 'Smart AI',
  'recommendation.source.ai': 'AI',
  'recommendation.source.chromeAI': 'Chrome AI'
}

function mockT(key: string, options?: any): string {
  let result = mockTranslations[key] || key
  
  if (options) {
    Object.entries(options).forEach(([key, value]) => {
      result = result.replace(`{{${key}}}`, String(value))
    })
  }
  
  return result
}

// 类型断言帮助
const t = mockT as any

describe('formatRecommendationReason', () => {
  describe('处理 undefined/null', () => {
    it('应该返回默认文本', () => {
      const result = formatRecommendationReason(undefined, t)
      expect(result).toBe('Unknown reason')
    })
  })

  describe('处理字符串（旧版本数据）', () => {
    it('应该直接返回字符串', () => {
      const oldReason = '与您关注的"技术"主题高度相关，AI智能推荐匹配度85%'
      const result = formatRecommendationReason(oldReason, t)
      expect(result).toBe(oldReason)
    })

    it('应该处理空字符串为无理由', () => {
      const result = formatRecommendationReason('', t)
      expect(result).toBe('Unknown reason')
    })
  })

  describe('处理结构化数据 - 主题匹配', () => {
    it('应该格式化单个主题', () => {
      const reasonData: ReasonData = {
        type: 'topic-match',
        provider: 'deepseek',
        score: 0.85,
        topics: ['Technology']
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('Highly relevant to "Technology" topics')
      expect(result).toContain('Smart AI')
      expect(result).toContain('85% match')
    })

    it('应该格式化多个主题', () => {
      const reasonData: ReasonData = {
        type: 'topic-match',
        provider: 'openai',
        score: 0.92,
        topics: ['Technology', 'AI', 'Programming']
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('Technology, AI, Programming')
      expect(result).toContain('AI 92% match')
    })

    it('应该使用推理 AI 标签', () => {
      const reasonData: ReasonData = {
        type: 'topic-match',
        provider: 'deepseek',
        isReasoning: true,
        score: 0.88,
        topics: ['Science']
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('Reasoning AI')
    })
  })

  describe('处理结构化数据 - 兴趣匹配', () => {
    it('应该格式化兴趣列表', () => {
      const reasonData: ReasonData = {
        type: 'interest-match',
        provider: 'anthropic',
        score: 0.78,
        interests: ['Machine Learning', 'Deep Learning']
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('Based on your interests in "Machine Learning, Deep Learning"')
      expect(result).toContain('AI 78% match')
    })

    it('应该处理空兴趣列表', () => {
      const reasonData: ReasonData = {
        type: 'interest-match',
        provider: 'keyword',
        score: 0.65,
        interests: []
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('High-quality content')
    })
  })

  describe('处理结构化数据 - 高质量内容', () => {
    it('应该使用高质量标签', () => {
      const reasonData: ReasonData = {
        type: 'high-quality',
        provider: 'keyword',
        score: 0.70
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('High-quality content')
      expect(result).toContain('Algorithm')
      expect(result).toContain('70% match')
    })
  })

  describe('处理结构化数据 - 其他类型', () => {
    it('应该处理浏览历史类型', () => {
      const reasonData: ReasonData = {
        type: 'browsing-history',
        provider: 'chrome-ai',
        score: 0.82
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('Based on browsing history')
      expect(result).toContain('Chrome AI')
    })

    it('应该处理热门推荐类型', () => {
      const reasonData: ReasonData = {
        type: 'trending',
        provider: 'keyword',
        score: 0.75
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('Trending')
      expect(result).toContain('Algorithm')
    })

    it('应该处理冷启动推荐类型', () => {
      const reasonData: ReasonData = {
        type: 'cold-start',
        provider: 'keyword',
        score: 0.65
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('Recommended based on subscription preferences')
      expect(result).toContain('Algorithm')
    })

    it('应该处理冷启动推荐带自定义 mainReason', () => {
      const reasonData: ReasonData = {
        type: 'cold-start',
        provider: 'keyword',
        score: 0.72,
        params: {
          mainReason: 'Matches your tech subscriptions'
        }
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('Matches your tech subscriptions')
    })
  })

  describe('边界情况', () => {
    it('应该处理 0 分数', () => {
      const reasonData: ReasonData = {
        type: 'high-quality',
        provider: 'keyword',
        score: 0
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('0% match')
    })

    it('应该处理 100% 分数', () => {
      const reasonData: ReasonData = {
        type: 'topic-match',
        provider: 'deepseek',
        score: 1.0,
        topics: ['Perfect Match']
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('100% match')
    })

    it('应该四舍五入分数', () => {
      const reasonData: ReasonData = {
        type: 'topic-match',
        provider: 'openai',
        score: 0.856,
        topics: ['Test']
      }

      const result = formatRecommendationReason(reasonData, t)
      expect(result).toContain('86% match')
    })
  })
})

describe('getReasonPlainText', () => {
  it('应该移除 HTML 标签', () => {
    const reasonData: ReasonData = {
      type: 'topic-match',
      provider: 'deepseek',
      score: 0.85,
      topics: ['<b>Technology</b>']
    }

    const result = getReasonPlainText(reasonData, t)
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
  })

  it('应该处理旧版本字符串', () => {
    const oldReason = '与您关注的<strong>"技术"</strong>主题高度相关'
    const result = getReasonPlainText(oldReason, t)
    expect(result).not.toContain('<strong>')
    expect(result).toContain('"技术"')
  })

  it('应该处理 undefined', () => {
    const result = getReasonPlainText(undefined, t)
    expect(result).toBe('Unknown reason')
  })
})
