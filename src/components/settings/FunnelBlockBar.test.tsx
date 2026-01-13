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
    render(
      <FunnelBlockBar
        inFeedStats={mockInFeedStats}
        poolStats={mockPoolStats}
      />
    )

    // 检查右侧池的汇总数字是否显示
    expect(screen.getByText('100')).toBeInTheDocument()
  })

  it('应该为每个文章显示一个块', () => {
    const { container } = render(
      <FunnelBlockBar
        inFeedStats={mockInFeedStats}
        poolStats={mockPoolStats}
      />
    )

    // 查找所有块元素
    const blocks = container.querySelectorAll('div.w-1\\.5.h-1\\.5')
    // inFeedStats.rssArticles = 50，应该有 50 个块
    expect(blocks.length).toBe(50)
  })

  it('应该在 hover 时显示源内和池内数据对比', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <FunnelBlockBar
        inFeedStats={mockInFeedStats}
        poolStats={mockPoolStats}
      />
    )

    // 找到第一个块组（待分析 - raw）
    const blockGroups = container.querySelectorAll('div.flex.gap-px')
    const firstBlockGroup = blockGroups[0]

    // hover 第一个块组
    await user.hover(firstBlockGroup)

    // tooltip 应该显示
    expect(screen.getByText('待分析')).toBeInTheDocument()
    expect(screen.getByText('源: 5 | 池: 5')).toBeInTheDocument()
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

    // 应该显示 10 个块
    const blocks = container.querySelectorAll('div.w-1\\.5.h-1\\.5')
    expect(blocks.length).toBe(10)
  })
})
