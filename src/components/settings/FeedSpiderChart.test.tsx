/**
 * FeedSpiderChart 测试
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeedSpiderChart } from './FeedSpiderChart'
import type { FeedStats } from '@/storage/db/db-feeds-stats'

// Mock i18n
vi.mock('@/i18n/helpers', () => ({
  useI18n: () => ({
    _: (key: string, params?: Record<string, any>) => {
      // 简单的模拟翻译
      const translations: Record<string, string> = {
        'options.collectionStats.feedSpiderNoData': '暂无数据',
        'options.collectionStats.feedSpiderTotalArticles': '文章总数',
        'options.collectionStats.feedSpiderRecommended': '推荐总数',
        'options.collectionStats.feedSpiderDisliked': '不想读',
        'options.collectionStats.feedSpiderRead': '已阅读',
        'options.collectionStats.feedSpiderTooltipTitle': `订阅源: ${params?.feedTitle || ''}`,
        'options.collectionStats.feedSpiderTooltipTotal': `文章总数: ${params?.count || 0}`,
        'options.collectionStats.feedSpiderTooltipRecommended': `推荐: ${params?.count || 0}`,
        'options.collectionStats.feedSpiderTooltipRead': `已读: ${params?.count || 0}`,
        'options.collectionStats.feedSpiderTooltipDisliked': `不想读: ${params?.count || 0}`
      }
      return translations[key] || key
    }
  })
}))

// Mock db-feeds-stats
vi.mock('@/storage/db/db-feeds-stats', () => ({
  arrangeSymmetrically: (stats: FeedStats[]) => stats,
  normalizeLogarithmic: (value: number, max: number) => 
    max > 0 ? Math.log1p(value) / Math.log1p(max) : 0
}))

describe('FeedSpiderChart', () => {
  const mockStats: FeedStats[] = [
    {
      feedId: 'feed1',
      feedTitle: 'Tech Blog',
      feedUrl: 'https://example.com/feed',
      totalArticles: 100,
      recommendedCount: 30,
      readCount: 20,
      dislikedCount: 10
    },
    {
      feedId: 'feed2',
      feedTitle: 'News Site',
      feedUrl: 'https://news.com/feed',
      totalArticles: 80,
      recommendedCount: 25,
      readCount: 15,
      dislikedCount: 5
    },
    {
      feedId: 'feed3',
      feedTitle: 'Developer Blog',
      feedUrl: 'https://dev.com/feed',
      totalArticles: 60,
      recommendedCount: 20,
      readCount: 10,
      dislikedCount: 3
    }
  ]

  it('应该渲染空状态', () => {
    render(<FeedSpiderChart stats={[]} />)
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
  })

  it('应该渲染蛛网图', () => {
    const { container } = render(<FeedSpiderChart stats={mockStats} />)
    
    // 检查 SVG 元素
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    
    // 检查网格线
    const gridGroup = container.querySelector('.spider-grid')
    expect(gridGroup).toBeInTheDocument()
  })

  it('应该使用默认尺寸', () => {
    const { container } = render(<FeedSpiderChart stats={mockStats} />)
    
    const svg = container.querySelector('svg')
    // 组件内部使用固定尺寸 800x500
    expect(svg).toHaveAttribute('width', '800')
    expect(svg).toHaveAttribute('height', '500')
  })

  it('应该渲染数据层', () => {
    const { container } = render(<FeedSpiderChart stats={mockStats} />)
    
    // 检查是否有 4 个数据层（文章总数、推荐、不想读、已读）
    const paths = container.querySelectorAll('path[fill-opacity]')
    expect(paths.length).toBeGreaterThanOrEqual(4)
  })

  it('应该在 showLabels=true 时显示标签', () => {
    const { container } = render(
      <FeedSpiderChart stats={mockStats} showLabels={true} />
    )
    
    // 检查标签组
    const labelsGroup = container.querySelector('.spider-labels')
    expect(labelsGroup).toBeInTheDocument()
    
    // 检查是否有文本元素
    const labels = labelsGroup?.querySelectorAll('text')
    expect(labels?.length).toBeGreaterThan(0)
  })

  it('应该在 showLabels=false 时隐藏标签', () => {
    const { container } = render(
      <FeedSpiderChart stats={mockStats} showLabels={false} />
    )
    
    const labelsGroup = container.querySelector('.spider-labels')
    expect(labelsGroup).not.toBeInTheDocument()
  })

  it('应该处理单个订阅源', () => {
    const singleStat = [mockStats[0]]
    const { container } = render(<FeedSpiderChart stats={singleStat} />)
    
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('应该使用对数归一化处理大数值', () => {
    const largeStats: FeedStats[] = [
      {
        feedId: 'feed1',
        feedTitle: 'Large Feed',
        feedUrl: 'https://large.com/feed',
        totalArticles: 10000,
        recommendedCount: 3000,
        readCount: 2000,
        dislikedCount: 1000
      }
    ]
    
    const { container } = render(<FeedSpiderChart stats={largeStats} />)
    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })
})
