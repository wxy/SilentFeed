import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { FunnelBlockBar } from './FunnelBlockBar'
import type { FeedFunnelStats } from '@/storage/db'

// Mock i18n
vi.mock('@/i18n/helpers', () => ({
  useI18n: () => ({
    _: (key: string) => {
      const translations: Record<string, string> = {
        'options.rssManager.status.raw': '待分析',
        'options.rssManager.status.stale': '已过时',
        'options.rssManager.status.prescreenedOut': '初筛淘汰',
        'options.rssManager.status.analyzedNotQualified': '分析未达标',
        'options.rssManager.status.currentCandidate': '候选池',
        'options.rssManager.status.currentRecommended': '推荐池',
        'options.rssManager.status.exited': '已退出'
      }
      return translations[key] || key
    }
  })
}))

describe('FunnelBlockBar Component', () => {
  const mockInFeedStats: FeedFunnelStats = {
    feedId: 'test-feed-1',
    feedTitle: 'Test Feed',
    // 漏斗层
    rssArticles: 50,
    analyzed: 40,
    candidate: 15,
    recommended: 10,
    // 当前状态
    raw: 5,
    stale: 5,
    prescreenedOut: 5,
    analyzedNotQualified: 10,
    currentCandidate: 15,
    currentRecommended: 10,
    exited: 5,
    // 退出统计
    exitStats: {
      total: 5,
      read: 2,
      saved: 1,
      disliked: 1,
      unread: 1,
      replaced: 0,
      expired: 0,
      staleExit: 0,
      other: 0
    }
  }

  const mockPoolStats: FeedFunnelStats = {
    feedId: 'test-feed-1',
    feedTitle: 'Test Feed',
    // 漏斗层
    rssArticles: 100,
    analyzed: 80,
    candidate: 30,
    recommended: 20,
    // 当前状态
    raw: 5,
    stale: 10,
    prescreenedOut: 5,
    analyzedNotQualified: 20,
    currentCandidate: 30,
    currentRecommended: 20,
    exited: 10,
    // 退出统计
    exitStats: {
      total: 10,
      read: 5,
      saved: 2,
      disliked: 1,
      unread: 2,
      replaced: 0,
      expired: 0,
      staleExit: 0,
      other: 0
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('应该渲染块进度条组件', () => {
    const { container } = render(
      <FunnelBlockBar
        inFeedStats={mockInFeedStats}
        poolStats={mockPoolStats}
      />
    )

    // 检查左侧方块是否存在（源数据）
    const leftBlocks = container.querySelectorAll('.flex-1 .w-2.h-2')
    // 应该等于各分类总和: 5+5+5+10+15+10+5 = 55
    expect(leftBlocks.length).toBe(55)
    
    // 检查右侧方块容器是否存在（池数据）
    const rightBlocks = container.querySelectorAll('.w-2\\.5.h-2\\.5')
    expect(rightBlocks.length).toBeGreaterThan(0)
  })

  it('应该只显示非零数据的分类', () => {
    const sparseStats: FeedFunnelStats = {
      feedId: 'test-feed-1',
      feedTitle: 'Test Feed',
      rssArticles: 20,
      analyzed: 15,
      candidate: 10,
      recommended: 5,
      raw: 0,
      stale: 5,
      prescreenedOut: 0,
      analyzedNotQualified: 10,
      currentCandidate: 5,
      currentRecommended: 0,
      exited: 0,
      exitStats: {
        total: 0,
        read: 0,
        saved: 0,
        disliked: 0,
        unread: 0,
        replaced: 0,
        expired: 0,
        staleExit: 0,
        other: 0
      }
    }

    const { container } = render(
      <FunnelBlockBar
        inFeedStats={sparseStats}
        poolStats={mockPoolStats}
      />
    )

    // 左侧方块应该只显示有数据的分类（总共 20 个方块）
    const leftBlocks = container.querySelectorAll('.flex-1 .w-2.h-2')
    expect(leftBlocks.length).toBe(20)
  })

  it('应该在 hover 时显示源内数据提示', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <FunnelBlockBar
        inFeedStats={mockInFeedStats}
        poolStats={mockPoolStats}
      />
    )

    // 找到左侧的第一个方块组
    const blockGroups = container.querySelectorAll('.flex-1 > div > div')
    const firstGroup = blockGroups[0]

    if (firstGroup) {
      // hover 第一个方块组
      await user.hover(firstGroup)

      // tooltip 应该显示源数据
      expect(screen.getByText(/源:/)).toBeInTheDocument()
    }
  })

  it('应该在 hover 时显示池内数据提示', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <FunnelBlockBar
        inFeedStats={mockInFeedStats}
        poolStats={mockPoolStats}
      />
    )

    // 找到右侧的方块
    const poolBlocks = container.querySelectorAll('.w-2\\.5.h-2\\.5')
    const firstBlock = poolBlocks[0]?.parentElement

    if (firstBlock) {
      // hover 第一个方块
      await user.hover(firstBlock)

      // tooltip 应该显示池数据
      expect(screen.getByText(/池:/)).toBeInTheDocument()
    }
  })

  it('应该为少量文章显示清晰的块', () => {
    const smallStats: FeedFunnelStats = {
      feedId: 'test-feed-1',
      feedTitle: 'Test Feed',
      rssArticles: 10,
      analyzed: 8,
      candidate: 3,
      recommended: 2,
      raw: 1,
      stale: 1,
      prescreenedOut: 1,
      analyzedNotQualified: 2,
      currentCandidate: 3,
      currentRecommended: 2,
      exited: 1,
      exitStats: {
        total: 1,
        read: 1,
        saved: 0,
        disliked: 0,
        unread: 0,
        replaced: 0,
        expired: 0,
        staleExit: 0,
        other: 0
      }
    }

    const { container } = render(
      <FunnelBlockBar
        inFeedStats={smallStats}
        poolStats={smallStats}
      />
    )

    // 左侧应该有 11 个方块(raw:1 + currentCandidate:5 + currentRecommended:5 = 11)
    const leftBlocks = container.querySelectorAll('.flex-1 .w-2.h-2')
    expect(leftBlocks.length).toBe(11)
    
    // 右侧应该有方块显示池数据
    const rightBlocks = container.querySelectorAll('.w-2\\.5.h-2\\.5')
    expect(rightBlocks.length).toBeGreaterThan(0)
  })
})
