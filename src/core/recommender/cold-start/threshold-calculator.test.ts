/**
 * 动态冷启动阈值计算器测试
 */

import { describe, it, expect } from 'vitest'
import { 
  getDynamicThreshold, 
  shouldUseColdStartStrategy,
  getStrategyDescription 
} from './threshold-calculator'
import { LEARNING_COMPLETE_PAGES } from '@/constants/progress'
import type { DiscoveredFeed } from '@/types/rss'

describe('getDynamicThreshold', () => {
  it('应该返回基础阈值当无订阅源时', () => {
    const threshold = getDynamicThreshold([])
    expect(threshold).toBe(LEARNING_COMPLETE_PAGES)
  })

  it('应该根据导入源减少阈值', () => {
    const feeds: DiscoveredFeed[] = [
      createFeed('f1', 'imported'),
      createFeed('f2', 'imported'),
      createFeed('f3', 'imported')
    ]
    
    const threshold = getDynamicThreshold(feeds)
    
    // 3 个导入源，每个减少 8 页 = 减少 24 页
    expect(threshold).toBe(LEARNING_COMPLETE_PAGES - 24)
  })

  it('应该根据手动订阅减少阈值', () => {
    const feeds: DiscoveredFeed[] = [
      createFeed('f1', 'manual'),
      createFeed('f2', 'manual')
    ]
    
    const threshold = getDynamicThreshold(feeds)
    
    // 2 个手动订阅，每个减少 5 页 = 减少 10 页
    expect(threshold).toBe(LEARNING_COMPLETE_PAGES - 10)
  })

  it('应该根据发现源减少阈值（保守）', () => {
    const feeds: DiscoveredFeed[] = [
      createFeed('f1', 'discovered'),
      createFeed('f2', 'discovered'),
      createFeed('f3', 'discovered'),
      createFeed('f4', 'discovered')
    ]
    
    const threshold = getDynamicThreshold(feeds)
    
    // 4 个发现源，每个减少 2 页 = 减少 8 页
    expect(threshold).toBe(LEARNING_COMPLETE_PAGES - 8)
  })

  it('应该混合计算不同来源', () => {
    const feeds: DiscoveredFeed[] = [
      createFeed('f1', 'imported'),   // -8
      createFeed('f2', 'manual'),     // -5
      createFeed('f3', 'discovered')  // -2
    ]
    
    const threshold = getDynamicThreshold(feeds)
    
    expect(threshold).toBe(LEARNING_COMPLETE_PAGES - 15) // 8 + 5 + 2 = 15
  })

  it('应该不低于最小阈值', () => {
    // 创建大量导入源
    const feeds: DiscoveredFeed[] = Array.from({ length: 20 }, (_, i) => 
      createFeed(`f${i}`, 'imported')
    )
    
    const threshold = getDynamicThreshold(feeds)
    
    // 20 * 8 = 160 > 100，但不应低于最小阈值 10
    expect(threshold).toBe(10)
  })

  it('应该只统计已订阅的活跃源', () => {
    const feeds: DiscoveredFeed[] = [
      createFeed('f1', 'imported'),
      createFeed('f2', 'imported', 'ignored'),       // 被忽略
      createFeed('f3', 'imported', 'subscribed', false) // 非活跃
    ]
    
    const threshold = getDynamicThreshold(feeds)
    
    // 只有 1 个有效源
    expect(threshold).toBe(LEARNING_COMPLETE_PAGES - 8)
  })
})

describe('shouldUseColdStartStrategy', () => {
  it('应该在超过有效阈值时不使用冷启动', () => {
    const feeds = [
      createFeed('f1', 'imported'),
      createFeed('f2', 'imported'),
      createFeed('f3', 'imported')
    ]
    
    const effectiveThreshold = getDynamicThreshold(feeds) // 100 - 24 = 76
    
    const decision = shouldUseColdStartStrategy(
      effectiveThreshold + 10, // 超过阈值
      feeds,
      50 // 足够的文章
    )
    
    expect(decision.useColdStart).toBe(false)
    expect(decision.confidence).toBe(1.0)
  })

  it('应该在订阅源不足时不使用冷启动', () => {
    const feeds = [
      createFeed('f1', 'imported'),
      createFeed('f2', 'imported')
    ]
    
    const decision = shouldUseColdStartStrategy(
      10, // 低于阈值
      feeds,
      50
    )
    
    expect(decision.useColdStart).toBe(false)
    expect(decision.reason).toContain('订阅源数量不足')
  })

  it('应该在文章不足时不使用冷启动', () => {
    const feeds = [
      createFeed('f1', 'imported'),
      createFeed('f2', 'imported'),
      createFeed('f3', 'imported')
    ]
    
    const decision = shouldUseColdStartStrategy(
      10, // 低于阈值
      feeds,
      5   // 文章不足
    )
    
    expect(decision.useColdStart).toBe(false)
    expect(decision.reason).toContain('已分析文章不足')
  })

  it('应该在条件满足时启用冷启动', () => {
    const feeds = [
      createFeed('f1', 'imported'),
      createFeed('f2', 'imported'),
      createFeed('f3', 'manual')
    ]
    
    const decision = shouldUseColdStartStrategy(
      10, // 低于阈值
      feeds,
      20  // 足够的文章
    )
    
    expect(decision.useColdStart).toBe(true)
    expect(decision.confidence).toBeGreaterThan(0.5)
    expect(decision.reason).toContain('导入源')
  })

  it('应该根据导入比例计算置信度', () => {
    // 全部是导入源
    const allImported = [
      createFeed('f1', 'imported'),
      createFeed('f2', 'imported'),
      createFeed('f3', 'imported')
    ]
    
    const decisionAllImported = shouldUseColdStartStrategy(10, allImported, 20)
    
    // 全部是发现源
    const allDiscovered = [
      createFeed('f1', 'discovered'),
      createFeed('f2', 'discovered'),
      createFeed('f3', 'discovered')
    ]
    
    const decisionAllDiscovered = shouldUseColdStartStrategy(10, allDiscovered, 20)
    
    // 导入源应该有更高的置信度
    expect(decisionAllImported.confidence).toBeGreaterThan(decisionAllDiscovered.confidence)
  })
})

describe('getStrategyDescription', () => {
  it('应该返回正常推荐描述', () => {
    const decision = {
      useColdStart: false,
      effectiveThreshold: 100,
      baseThreshold: 100,
      reason: '用户画像已建立',
      confidence: 1.0
    }
    
    const desc = getStrategyDescription(decision)
    
    expect(desc.title).toBe('个性化推荐')
    expect(desc.icon).toBe('normal')
  })

  it('应该返回学习阶段描述', () => {
    const decision = {
      useColdStart: false,
      effectiveThreshold: 100,
      baseThreshold: 100,
      reason: '订阅源数量不足',
      confidence: 0.3
    }
    
    const desc = getStrategyDescription(decision)
    
    expect(desc.title).toBe('学习阶段')
    expect(desc.icon).toBe('learning')
  })

  it('应该返回冷启动描述', () => {
    const decision = {
      useColdStart: true,
      effectiveThreshold: 76,
      baseThreshold: 100,
      reason: '基于导入源启用冷启动',
      confidence: 0.8
    }
    
    const desc = getStrategyDescription(decision)
    
    expect(desc.title).toBe('智能冷启动')
    expect(desc.icon).toBe('cold-start')
  })
})

// 辅助函数
function createFeed(
  id: string, 
  source: 'imported' | 'manual' | 'discovered',
  status: 'subscribed' | 'ignored' = 'subscribed',
  isActive = true
): DiscoveredFeed {
  return {
    id,
    url: `http://example.com/${id}`,
    title: `Feed ${id}`,
    discoveredFrom: 'test',
    discoveredAt: Date.now(),
    status,
    subscriptionSource: source,
    isActive,
    articleCount: 0,
    recommendedCount: 0,
    unreadCount: 0
  }
}
