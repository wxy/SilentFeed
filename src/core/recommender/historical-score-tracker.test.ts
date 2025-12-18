/**
 * 历史评分追踪器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { db } from '@/storage/db'
import {
  getHistoricalScoreBaseline,
  passesHistoricalBaseline,
  filterByHistoricalBaseline,
  type HistoricalScoreConfig
} from './historical-score-tracker'

describe('HistoricalScoreTracker', () => {
  beforeEach(async () => {
    await db.recommendations.clear()
  })

  describe('getHistoricalScoreBaseline', () => {
    it('无历史数据时应返回 null', async () => {
      const baseline = await getHistoricalScoreBaseline()
      expect(baseline).toBeNull()
    })

    it('策略B（最近N条）: 应正确计算平均分', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 5000,
          score: 0.8,
          isRead: false
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '推荐 2',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 4000,
          score: 0.7,
          isRead: false
        },
        {
          id: '3',
          url: 'https://example.com/3',
          title: '推荐 3',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now - 3000,
          score: 0.6,
          isRead: false
        }
      ])
      
      const baseline = await getHistoricalScoreBaseline({
        strategy: 'recent',
        recentCount: 3
      })
      
      // 平均分 = (0.8 + 0.7 + 0.6) / 3 = 0.7
      expect(baseline).toBeCloseTo(0.7, 2)
    })

    it('策略A（当天）: 应只计算当天的推荐', async () => {
      const now = Date.now()
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '今天的推荐',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: todayStart.getTime() + 3600000, // 今天上午
          score: 0.8,
          isRead: false
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '昨天的推荐',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: todayStart.getTime() - 86400000, // 昨天
          score: 0.3,
          isRead: false
        }
      ])
      
      const baseline = await getHistoricalScoreBaseline({
        strategy: 'daily'
      })
      
      // 应该只计算今天的 0.8，但会被最大基准限制到 0.75
      expect(baseline).toBeCloseTo(0.75, 2)
    })

    it('应应用最低基准（minimumBaseline）', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '低分推荐',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now,
          score: 0.4, // 很低的分数
          isRead: false
        }
      ])
      
      const baseline = await getHistoricalScoreBaseline({
        minimumBaseline: 0.55
      })
      
      // 虽然平均分是 0.4，但应该返回最低基准 0.55
      expect(baseline).toBe(0.55)
    })

    it('禁用时应返回 null', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now,
          score: 0.8,
          isRead: false
        }
      ])
      
      const baseline = await getHistoricalScoreBaseline({
        enabled: false
      })
      
      expect(baseline).toBeNull()
    })
  })

  describe('passesHistoricalBaseline', () => {
    it('无历史数据时应放行', async () => {
      const passes = await passesHistoricalBaseline(0.5)
      expect(passes).toBe(true)
    })

    it('评分高于基准时应通过', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now,
          score: 0.7,
          isRead: false
        }
      ])
      
      const passes = await passesHistoricalBaseline(0.8) // 高于基准 0.7
      expect(passes).toBe(true)
    })

    it('评分等于基准时应通过', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now,
          score: 0.7,
          isRead: false
        }
      ])
      
      const passes = await passesHistoricalBaseline(0.7) // 等于基准
      expect(passes).toBe(true)
    })

    it('评分低于基准时应拒绝', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now,
          score: 0.7,
          isRead: false
        }
      ])
      
      const passes = await passesHistoricalBaseline(0.5) // 低于基准 0.7
      expect(passes).toBe(false)
    })
  })

  describe('filterByHistoricalBaseline', () => {
    it('无历史数据时应全部放行', async () => {
      const scores = [0.5, 0.6, 0.7, 0.8]
      const passedIndices = await filterByHistoricalBaseline(scores)
      
      expect(passedIndices).toEqual([0, 1, 2, 3])
    })

    it('应正确过滤低于基准的推荐', async () => {
      const now = Date.now()
      
      await db.recommendations.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '推荐 1',
          summary: '摘要',
          source: 'Source',
          sourceUrl: 'https://source.com',
          recommendedAt: now,
          score: 0.7,
          isRead: false
        }
      ])
      
      const scores = [0.5, 0.65, 0.7, 0.8, 0.6]
      const passedIndices = await filterByHistoricalBaseline(scores)
      
      // 基准是 0.7，应该只有索引 2 和 3 通过
      expect(passedIndices).toEqual([2, 3])
    })

    it('空数组时应返回空数组', async () => {
      const passedIndices = await filterByHistoricalBaseline([])
      expect(passedIndices).toEqual([])
    })
  })
})
