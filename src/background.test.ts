/**
 * Background Service Worker 测试
 * 
 * 测试消息处理和数据库操作
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from './storage/db'
import type { ConfirmedVisit } from '@/types/database'

describe('Background 消息处理', () => {
  beforeEach(async () => {
    // 清空数据库
    await db.confirmedVisits.clear()
    await db.recommendations.clear()
  })

  describe('SAVE_PAGE_VISIT 消息', () => {
    it('应该能保存来自 Content Script 的页面访问数据', async () => {
      // 构造访问数据
      const visitData: ConfirmedVisit = {
        id: crypto.randomUUID(),
        url: 'https://example.com',
        title: '测试页面',
        domain: 'example.com',
        visitTime: Date.now(),
        duration: 35,
        interactionCount: 5,
        source: 'organic',
        meta: null,
        contentSummary: null,
        analysis: {
          keywords: ['测试', '示例'],
          topics: ['technology'],
          language: 'zh'
        },
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }

      // 保存到数据库（模拟 Background 的操作）
      await db.confirmedVisits.add(visitData)

      // 验证数据已保存
      const count = await db.confirmedVisits.count()
      expect(count).toBe(1)

      const saved = await db.confirmedVisits.get(visitData.id)
      expect(saved).toBeDefined()
      expect(saved?.url).toBe('https://example.com')
      expect(saved?.title).toBe('测试页面')
      expect(saved?.duration).toBe(35)
      expect(saved?.source).toBe('organic')
    })

    it('应该能保存多个页面访问', async () => {
      const visits: ConfirmedVisit[] = [
        {
          id: '1',
          url: 'https://example1.com',
          title: '页面1',
          domain: 'example1.com',
          visitTime: Date.now() - 2000,
          duration: 30,
          interactionCount: 3,
          source: 'organic',
          meta: null,
          contentSummary: null,
          analysis: { keywords: [], topics: [], language: 'zh' },
          status: 'qualified',
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        {
          id: '2',
          url: 'https://example2.com',
          title: '页面2',
          domain: 'example2.com',
          visitTime: Date.now() - 1000,
          duration: 45,
          interactionCount: 7,
          source: 'search',
          meta: null,
          contentSummary: null,
          analysis: { keywords: [], topics: [], language: 'zh' },
          status: 'qualified',
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ]

      await db.confirmedVisits.bulkAdd(visits)

      const count = await db.confirmedVisits.count()
      expect(count).toBe(2)
    })

    it('应该能按域名查询访问记录', async () => {
      await db.confirmedVisits.bulkAdd([
        {
          id: '1',
          url: 'https://github.com/user/repo1',
          title: 'Repo 1',
          domain: 'github.com',
          visitTime: Date.now(),
          duration: 30,
          interactionCount: 3,
          source: 'organic',
          meta: null,
          contentSummary: null,
          analysis: { keywords: [], topics: [], language: 'zh' },
          status: 'qualified',
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        {
          id: '2',
          url: 'https://github.com/user/repo2',
          title: 'Repo 2',
          domain: 'github.com',
          visitTime: Date.now(),
          duration: 45,
          interactionCount: 5,
          source: 'organic',
          meta: null,
          contentSummary: null,
          analysis: { keywords: [], topics: [], language: 'zh' },
          status: 'qualified',
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        {
          id: '3',
          url: 'https://example.com',
          title: 'Example',
          domain: 'example.com',
          visitTime: Date.now(),
          duration: 60,
          interactionCount: 10,
          source: 'organic',
          meta: null,
          contentSummary: null,
          analysis: { keywords: [], topics: [], language: 'zh' },
          status: 'qualified',
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ])

      // 查询 github.com 的访问记录
      const githubVisits = await db.confirmedVisits
        .where('domain')
        .equals('github.com')
        .toArray()

      expect(githubVisits).toHaveLength(2)
      expect(githubVisits.every(v => v.domain === 'github.com')).toBe(true)
    })

    it('应该能按时间排序查询', async () => {
      const now = Date.now()
      await db.confirmedVisits.bulkAdd([
        {
          id: '1',
          url: 'https://example.com/1',
          title: '页面1',
          domain: 'example.com',
          visitTime: now - 3000, // 最旧
          duration: 30,
          interactionCount: 3,
          source: 'organic',
          meta: null,
          contentSummary: null,
          analysis: { keywords: [], topics: [], language: 'zh' },
          status: 'qualified',
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        {
          id: '2',
          url: 'https://example.com/2',
          title: '页面2',
          domain: 'example.com',
          visitTime: now - 1000, // 最新
          duration: 45,
          interactionCount: 5,
          source: 'organic',
          meta: null,
          contentSummary: null,
          analysis: { keywords: [], topics: [], language: 'zh' },
          status: 'qualified',
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        },
        {
          id: '3',
          url: 'https://example.com/3',
          title: '页面3',
          domain: 'example.com',
          visitTime: now - 2000, // 中间
          duration: 60,
          interactionCount: 10,
          source: 'organic',
          meta: null,
          contentSummary: null,
          analysis: { keywords: [], topics: [], language: 'zh' },
          status: 'qualified',
          contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
          analysisRetainUntil: -1
        }
      ])

      // 按时间倒序查询（最新在前）
      const visits = await db.confirmedVisits
        .orderBy('visitTime')
        .reverse()
        .toArray()

      expect(visits[0].id).toBe('2') // 最新
      expect(visits[1].id).toBe('3') // 中间
      expect(visits[2].id).toBe('1') // 最旧
    })
  })

  describe('数据完整性', () => {
    it('应该拒绝重复的 ID', async () => {
      const visit: ConfirmedVisit = {
        id: 'duplicate-id',
        url: 'https://example.com',
        title: '测试',
        domain: 'example.com',
        visitTime: Date.now(),
        duration: 30,
        interactionCount: 3,
        source: 'organic',
        meta: null,
        contentSummary: null,
        analysis: { keywords: [], topics: [], language: 'zh' },
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }

      await db.confirmedVisits.add(visit)

      // 尝试添加相同 ID 应该失败
      await expect(
        db.confirmedVisits.add({ ...visit })
      ).rejects.toThrow()
    })
  })
})
