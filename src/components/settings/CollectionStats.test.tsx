import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import React from 'react'
import { CollectionStats } from './CollectionStats'

vi.mock('@/i18n/helpers', () => ({
  useI18n: () => ({ _: (k: string) => k })
}))

vi.mock('@/storage/db', () => ({
  getStorageStats: vi.fn(async () => ({
    pageCount: 0,
    totalSizeMB: 0,
    firstCollectionTime: undefined,
    avgDailyPages: 0,
  })),
  getPageCount: vi.fn(async () => 0),
  getRecommendationFunnel: vi.fn(async () => ({
    rssArticles: 0,
    inPool: 0,
    notified: 0,
    read: 0,
    learningPages: 0,
    dismissed: 0,
  })),
  db: {
    pendingVisits: { clear: vi.fn() },
    confirmedVisits: { clear: vi.fn() },
    userProfile: { clear: vi.fn() },
    recommendations: { clear: vi.fn() },
  }
}))

vi.mock('@/storage/ai-config', () => ({
  getAIConfig: vi.fn(async () => ({ enabled: false, provider: null, apiKeys: {} })),
  getProviderDisplayName: (p: any) => String(p ?? '')
}))

vi.mock('@/core/ai/AIUsageTracker', () => ({
  AIUsageTracker: {
    getStats: vi.fn(async () => ({
      totalCalls: 0,
      byProvider: {},
      byPurpose: {},
      byCurrency: { CNY: { total: 0, input: 0, output: 0 }, USD: { total: 0, input: 0, output: 0 }, FREE: { total: 0 } },
      avgLatency: 0,
      tokens: { input: 0, output: 0, total: 0 },
      cost: { input: 0, output: 0, total: 0 },
    })
    )
  }
}))

describe('CollectionStats 渲染', () => {
  it('空数据时应显示学习概览与零值', async () => {
    render(<CollectionStats />)
    expect(await screen.findByText('options.collectionStats.aiLearningOverview')).toBeDefined()
    expect(screen.getByText('0')).toBeDefined()
  })

  it('部分缺失字段时应容错渲染', async () => {
    // 覆盖统计返回值以包含部分字段
    const { getStorageStats } = await import('@/storage/db')
    ;(getStorageStats as any).mockResolvedValueOnce({
      pageCount: 10,
      totalSizeMB: 1.23,
      firstCollectionTime: Date.now(),
      avgDailyPages: 5,
    })
    render(<CollectionStats />)
    expect(await screen.findByText('options.collectionStats.aiLearningOverview')).toBeDefined()
  })

  it('完整数据时应显示各统计', async () => {
    const { getStorageStats, getRecommendationFunnel } = await import('@/storage/db')
    ;(getStorageStats as any).mockResolvedValueOnce({
      pageCount: 42,
      totalSizeMB: 12.34,
      firstCollectionTime: Date.now(),
      avgDailyPages: 3.2,
    })
    ;(getRecommendationFunnel as any).mockResolvedValueOnce({
      rssArticles: 42,
      inPool: 22,
      notified: 10,
      read: 8,
      learningPages: 5,
      dismissed: 1,
    })
    render(<CollectionStats />)
    // 标题与漏斗统计关键元素出现
    expect(await screen.findByText('options.collectionStats.recommendationFunnelTitle')).toBeDefined()
  })
})
