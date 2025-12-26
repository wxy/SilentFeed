/**
 * 页面访问处理模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from '@/storage/db'
import { checkDuplicate, processPageVisit, type PageVisitData } from './page-visit-handler'

describe('PageVisitHandler', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('checkDuplicate', () => {
    it('应该检测30分钟内的重复访问', async () => {
      const baseTime = Date.now()
      const url = 'https://example.com/article'

      // 添加第一次访问
      await db.confirmedVisits.add({
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
      })

      // 10分钟后检查
      const tenMinutesLater = baseTime + 10 * 60 * 1000
      const result = await checkDuplicate(url, tenMinutesLater)

      expect(result).toBeDefined()
      expect(result?.id).toBe('visit-1')
    })

    it('应该在30分钟后不检测为重复', async () => {
      const baseTime = Date.now()
      const url = 'https://example.com/article'

      await db.confirmedVisits.add({
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
      })

      // 35分钟后检查
      const laterTime = baseTime + 35 * 60 * 1000
      const result = await checkDuplicate(url, laterTime)

      expect(result).toBeNull()
    })
  })

  describe('processPageVisit', () => {
    it('应该处理新访问并返回分析结果', async () => {
      const pageData: PageVisitData = {
        url: 'https://example.com/test',
        title: '测试页面',
        domain: 'example.com',
        visitTime: Date.now(),
        duration: 15,
        interactionCount: 0,
        meta: {
          description: '测试描述'
        },
        content: '这是一篇关于技术的测试文章。'
      }

      const result = await processPageVisit(pageData)

      expect(result.success).toBe(true)
      expect(result.deduplicated).toBe(false)
      expect(result.analysis).toBeDefined()
      expect(result.analysis?.keywords).toBeDefined()
      expect(result.analysis?.topics).toBeDefined()
    })

    it('应该检测并合并重复访问', async () => {
      const baseTime = Date.now()
      const url = 'https://example.com/article'

      // 第一次访问
      await db.confirmedVisits.add({
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
      })

      // 10分钟后第二次访问
      const pageData: PageVisitData = {
        url,
        title: '测试文章',
        domain: 'example.com',
        visitTime: baseTime + 10 * 60 * 1000,
        duration: 30,
        interactionCount: 0,
        meta: null,
        content: '测试内容'
      }

      const result = await processPageVisit(pageData)

      expect(result.success).toBe(true)
      expect(result.deduplicated).toBe(true)
      expect(result.analysis).toBeUndefined() // 重复访问不返回分析

      // 验证数据库只有一条记录
      const count = await db.confirmedVisits.count()
      expect(count).toBe(1)

      // 验证停留时间已累加
      const updated = await db.confirmedVisits.get('visit-1')
      expect(updated?.duration).toBe(90) // 60 + 30
    })
  })
})
