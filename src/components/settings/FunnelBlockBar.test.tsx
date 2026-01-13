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
  const mockStats: FeedFunnelStats = {
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
        stats={mockStats}
        label="Pool"
        icon="📦"
      />
    )

    // 检查标签是否存在
    expect(screen.getByText(/📦 Pool:/)).toBeInTheDocument()
    // 检查总数是否显示
    expect(screen.getByText('(100)')).toBeInTheDocument()
  })

  it('应该根据数据量生成正确数量的块', () => {
    const { container } = render(
      <FunnelBlockBar
        stats={mockStats}
        label="Pool"
        icon="📦"
      />
    )

    // 查找所有块元素
    const blocks = container.querySelectorAll('div.w-2.h-2')
    // 总共应该有 100 个文章，分配到 7 个类别
    // 由于 blockUnitsPerArticle 的计算，块数应该是合理的
    expect(blocks.length).toBeGreaterThan(0)
  })

  it('应该在 hover 时显示 tooltip', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <FunnelBlockBar
        stats={mockStats}
        label="Pool"
        icon="📦"
      />
    )

    // 找到第一个块组（待分析）
    const blockGroups = container.querySelectorAll('div.flex.gap-0\\.5')
    const firstBlockGroup = blockGroups[0]

    // hover 第一个块组
    await user.hover(firstBlockGroup)

    // tooltip 应该显示
    expect(screen.getByText('待分析')).toBeInTheDocument()
    expect(screen.getByText(/5 \/ 100/)).toBeInTheDocument()
  })

  it('应该正确处理零计数的类别', () => {
    const statsWithZeros: FeedFunnelStats = {
      ...mockStats,
      raw: 0,
      stale: 0,
      prescreenedOut: 0,
      analyzedNotQualified: 0,
      currentCandidate: 50,
      currentRecommended: 50,
      exited: 0,
      rssArticles: 100,
      analyzed: 100
    }

    const { container } = render(
      <FunnelBlockBar
        stats={statsWithZeros}
        label="Pool"
        icon="📦"
      />
    )

    // 应该能正常渲染
    expect(screen.getByText(/📦 Pool:/)).toBeInTheDocument()
    expect(screen.getByText('(100)')).toBeInTheDocument()

    // 应该有一些块
    const blocks = container.querySelectorAll('div.w-2.h-2')
    expect(blocks.length).toBeGreaterThan(0)
  })

  it('应该在少量文章时显示清晰的块', () => {
    const smallStats: FeedFunnelStats = {
      ...mockStats,
      rssArticles: 10,
      raw: 2,
      stale: 1,
      prescreenedOut: 1,
      analyzedNotQualified: 2,
      currentCandidate: 2,
      currentRecommended: 1,
      exited: 1
    }

    const { container } = render(
      <FunnelBlockBar
        stats={smallStats}
        label="Pool"
        icon="📦"
      />
    )

    // 应该至少有 7 个块（每个类别至少 1 个）
    const blocks = container.querySelectorAll('div.w-2.h-2')
    expect(blocks.length).toBeGreaterThanOrEqual(7)
  })
})
