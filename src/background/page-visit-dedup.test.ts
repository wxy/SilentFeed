/**
 * 页面访问去重测试
 * Phase 12.8: 时间窗口去重机制
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/storage/db'
import type { ConfirmedVisit } from '@/types/database'

describe('页面访问去重', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('30分钟窗口去重', () => {
    it('应该在30分钟内合并相同 URL 的访问', async () => {
      const baseTime = Date.now()
      const url = 'https://example.com/article'

      // 第一次访问
      const visit1: ConfirmedVisit = {
        id: 'visit-1',
        url,
        title: '测试文章',
        domain: 'example.com',
        visitTime: baseTime,
        duration: 60, // 1分钟
        interactionCount: 5,
        analysis: {
          keywords: ['测试'],
          topics: ['technology'],
          language: 'zh'
        },
        meta: null,
        contentSummary: null,
        status: 'qualified',
        contentRetainUntil: baseTime + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }

      await db.confirmedVisits.add(visit1)

      // 10分钟后第二次访问（在30分钟窗口内）
      const tenMinutesLater = baseTime + 10 * 60 * 1000
      
      // 查找最近30分钟内的访问
      const windowStart = tenMinutesLater - 30 * 60 * 1000
      const recentVisit = await db.confirmedVisits
        .where('[url+visitTime]')
        .between([url, windowStart], [url, tenMinutesLater])
        .reverse()
        .first()

      expect(recentVisit).toBeDefined()
      expect(recentVisit?.id).toBe('visit-1')

      // 更新记录
      await db.confirmedVisits.update(recentVisit!.id, {
        visitTime: tenMinutesLater,
        duration: recentVisit!.duration + 45,
        interactionCount: recentVisit!.interactionCount + 3
      })

      // 验证更新
      const updated = await db.confirmedVisits.get('visit-1')
      expect(updated?.visitTime).toBe(tenMinutesLater)
      expect(updated?.duration).toBe(105) // 60 + 45
      expect(updated?.interactionCount).toBe(8) // 5 + 3

      // 验证数据库中只有一条记录
      const count = await db.confirmedVisits.count()
      expect(count).toBe(1)
    })

    it('应该在30分钟后创建新记录', async () => {
      const baseTime = Date.now()
      const url = 'https://example.com/article'

      // 第一次访问
      const visit1: ConfirmedVisit = {
        id: 'visit-1',
        url,
        title: '测试文章',
        domain: 'example.com',
        visitTime: baseTime,
        duration: 60,
        interactionCount: 5,
        analysis: {
          keywords: ['测试'],
          topics: ['technology'],
          language: 'zh'
        },
        meta: null,
        contentSummary: null,
        status: 'qualified',
        contentRetainUntil: baseTime + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }

      await db.confirmedVisits.add(visit1)

      // 35分钟后第二次访问（超出30分钟窗口）
      const laterTime = baseTime + 35 * 60 * 1000
      
      // 查找最近30分钟内的访问
      const windowStart = laterTime - 30 * 60 * 1000
      const recentVisit = await db.confirmedVisits
        .where('[url+visitTime]')
        .between([url, windowStart], [url, laterTime])
        .reverse()
        .first()

      // 应该找不到（超出窗口）
      expect(recentVisit).toBeUndefined()

      // 创建新记录
      const visit2: ConfirmedVisit = {
        id: 'visit-2',
        url,
        title: '测试文章',
        domain: 'example.com',
        visitTime: laterTime,
        duration: 45,
        interactionCount: 3,
        analysis: {
          keywords: ['测试'],
          topics: ['technology'],
          language: 'zh'
        },
        meta: null,
        contentSummary: null,
        status: 'qualified',
        contentRetainUntil: laterTime + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }

      await db.confirmedVisits.add(visit2)

      // 验证数据库中有两条记录
      const count = await db.confirmedVisits.count()
      expect(count).toBe(2)

      // 验证两条记录都存在
      const all = await db.confirmedVisits.toArray()
      expect(all).toHaveLength(2)
      expect(all.map(v => v.id).sort()).toEqual(['visit-1', 'visit-2'])
    })

    it('应该正确处理不同 URL 的访问', async () => {
      const baseTime = Date.now()

      // 访问不同的页面
      const visit1: ConfirmedVisit = {
        id: 'visit-1',
        url: 'https://example.com/article1',
        title: '文章1',
        domain: 'example.com',
        visitTime: baseTime,
        duration: 60,
        interactionCount: 5,
        analysis: {
          keywords: ['测试'],
          topics: ['technology'],
          language: 'zh'
        },
        meta: null,
        contentSummary: null,
        status: 'qualified',
        contentRetainUntil: baseTime + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }

      const visit2: ConfirmedVisit = {
        id: 'visit-2',
        url: 'https://example.com/article2',
        title: '文章2',
        domain: 'example.com',
        visitTime: baseTime + 5 * 60 * 1000, // 5分钟后
        duration: 45,
        interactionCount: 3,
        analysis: {
          keywords: ['测试'],
          topics: ['technology'],
          language: 'zh'
        },
        meta: null,
        contentSummary: null,
        status: 'qualified',
        contentRetainUntil: baseTime + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }

      await db.confirmedVisits.add(visit1)
      await db.confirmedVisits.add(visit2)

      // 验证数据库中有两条记录
      const count = await db.confirmedVisits.count()
      expect(count).toBe(2)
    })

    it('应该在窗口边界正确工作（29分59秒）', async () => {
      const baseTime = Date.now()
      const url = 'https://example.com/article'

      // 第一次访问
      const visit1: ConfirmedVisit = {
        id: 'visit-1',
        url,
        title: '测试文章',
        domain: 'example.com',
        visitTime: baseTime,
        duration: 60,
        interactionCount: 5,
        analysis: {
          keywords: ['测试'],
          topics: ['technology'],
          language: 'zh'
        },
        meta: null,
        contentSummary: null,
        status: 'qualified',
        contentRetainUntil: baseTime + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }

      await db.confirmedVisits.add(visit1)

      // 29分59秒后（刚好在窗口内）
      const almostThirtyMin = baseTime + (30 * 60 - 1) * 1000
      
      const windowStart = almostThirtyMin - 30 * 60 * 1000
      const recentVisit = await db.confirmedVisits
        .where('[url+visitTime]')
        .between([url, windowStart], [url, almostThirtyMin])
        .reverse()
        .first()

      // 应该找到
      expect(recentVisit).toBeDefined()
      expect(recentVisit?.id).toBe('visit-1')
    })

    it('应该在窗口边界正确工作（30分01秒）', async () => {
      const baseTime = Date.now()
      const url = 'https://example.com/article'

      // 第一次访问
      const visit1: ConfirmedVisit = {
        id: 'visit-1',
        url,
        title: '测试文章',
        domain: 'example.com',
        visitTime: baseTime,
        duration: 60,
        interactionCount: 5,
        analysis: {
          keywords: ['测试'],
          topics: ['technology'],
          language: 'zh'
        },
        meta: null,
        contentSummary: null,
        status: 'qualified',
        contentRetainUntil: baseTime + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }

      await db.confirmedVisits.add(visit1)

      // 30分01秒后（刚好超出窗口）
      const justOverThirtyMin = baseTime + (30 * 60 + 1) * 1000
      
      const windowStart = justOverThirtyMin - 30 * 60 * 1000
      const recentVisit = await db.confirmedVisits
        .where('[url+visitTime]')
        .between([url, windowStart], [url, justOverThirtyMin])
        .reverse()
        .first()

      // 应该找不到
      expect(recentVisit).toBeUndefined()
    })
  })

  describe('URL 索引性能', () => {
    it('应该能快速查询相同 URL 的访问记录', async () => {
      const baseTime = Date.now()
      const testUrl = 'https://example.com/target'

      // 添加100条不同的访问记录
      const visits: ConfirmedVisit[] = []
      for (let i = 0; i < 100; i++) {
        visits.push({
          id: `visit-${i}`,
          url: i === 50 ? testUrl : `https://example.com/article${i}`,
          title: `文章${i}`,
          domain: 'example.com',
          visitTime: baseTime + i * 60 * 1000,
          duration: 60,
          interactionCount: 5,
          analysis: {
            keywords: ['测试'],
            topics: ['technology'],
            language: 'zh'
          },
          meta: null,
          contentSummary: null,
          status: 'qualified',
          contentRetainUntil: baseTime + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        })
      }

      await db.confirmedVisits.bulkAdd(visits)

      // 测试查询性能
      const startTime = performance.now()
      
      const targetTime = baseTime + 60 * 60 * 1000
      const windowStart = targetTime - 30 * 60 * 1000
      const result = await db.confirmedVisits
        .where('[url+visitTime]')
        .between([testUrl, windowStart], [testUrl, targetTime])
        .reverse()
        .first()

      const endTime = performance.now()
      const queryTime = endTime - startTime

      expect(result).toBeDefined()
      expect(result?.id).toBe('visit-50')
      
      // 查询应该很快（<10ms）
      expect(queryTime).toBeLessThan(10)
    })
  })
})
