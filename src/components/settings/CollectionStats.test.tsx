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
    // 漏斗层（累计统计）
    rssArticles: 0,
    analyzed: 0,
    candidate: 0,
    recommended: 0,
    read: 0,
    // 右侧卡片（状态/动态指标）
    prescreenedOut: 0,
    raw: 0,
    analyzedNotQualified: 0,
    currentRecommendedPool: 0,
    recommendedPoolCapacity: 6,
    currentPopupCount: 0,
    popupCapacity: 3,
    exitStats: {
      total: 0,
      read: 0,
      saved: 0,
      disliked: 0,
      replaced: 0,
      expired: 0
    },
    learningPages: 0,
    // 兼容旧字段
    prescreened: 0,
    dismissed: 0,
  })),
  getFeedStats: vi.fn(async () => []),
  db: {
    pendingVisits: { clear: vi.fn() },
    confirmedVisits: { clear: vi.fn() },
    userProfile: { clear: vi.fn() },
    recommendations: { clear: vi.fn() },
  }
}))

vi.mock('@/storage/ai-config', () => ({
  getAIConfig: vi.fn(async () => ({
    providers: {},
    preferredRemoteProvider: "deepseek",
    preferredLocalProvider: "ollama",
    monthlyBudget: 5,
    local: {
      enabled: false,
      provider: "ollama",
      endpoint: "",
      model: ""
    }
  })),
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
    })),
    getDailyStats: vi.fn(async () => [])
  }
}))

describe('CollectionStats 渲染', () => {
  it('空数据时应显示学习概览与零值', async () => {
    render(<CollectionStats />)
    expect(await screen.findByText('options.collectionStats.aiLearningOverview')).toBeDefined()
    // 页面上可能有多个 '0'，使用 getAllByText 确认至少存在一个
    expect(screen.getAllByText('0').length).toBeGreaterThan(0)
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
      // 漏斗层（累计统计）
      rssArticles: 42,
      analyzed: 30,
      candidate: 25,
      recommended: 22,
      read: 8,
      // 右侧卡片（状态/动态指标）
      prescreenedOut: 5,
      raw: 7,
      analyzedNotQualified: 5,
      currentRecommendedPool: 4,
      recommendedPoolCapacity: 6,
      currentPopupCount: 2,
      popupCapacity: 3,
      exitStats: {
        total: 10,
        read: 5,
        saved: 2,
        disliked: 1,
        replaced: 1,
        expired: 1
      },
      learningPages: 5,
      // 兼容旧字段
      prescreened: 35,
      dismissed: 1,
    })
    render(<CollectionStats />)
    // 标题与漏斗统计关键元素出现
    expect(await screen.findByText('options.collectionStats.recommendationFunnelTitle')).toBeDefined()
  })
})
