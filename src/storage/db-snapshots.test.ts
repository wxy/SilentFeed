/**
 * 兴趣快照管理测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, initializeDatabase } from './db'
import { Topic } from "@/core/profile/topics"

describe('兴趣快照管理', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('saveInterestSnapshot & getInterestHistory', () => {
    it('应该保存并获取兴趣快照', async () => {
      const { saveInterestSnapshot, getInterestHistory } = await import('./db')
      
      const snapshot = {
        id: 'snapshot-1',
        timestamp: Date.now(),
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.8,
        primaryLevel: 'absolute' as const,
        topics: {
          [Topic.TECHNOLOGY]: 0.8,
          [Topic.DESIGN]: 0.2,
        },
        topKeywords: [
          { word: 'react', weight: 0.9 },
        ],
        basedOnPages: 100,
        trigger: 'manual' as const,
        changeNote: '首次建立画像',
      }

      await saveInterestSnapshot(snapshot)
      
      const history = await getInterestHistory(10)
      expect(history).toHaveLength(1)
      expect(history[0].primaryTopic).toBe(Topic.TECHNOLOGY)
    })

    it('应该按时间倒序返回快照', async () => {
      const { saveInterestSnapshot, getInterestHistory } = await import('./db')
      
      const now = Date.now()
      
      await saveInterestSnapshot({
        id: 'snapshot-1',
        timestamp: now - 2000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.8,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 50,
        trigger: 'manual' as const,
      })

      await saveInterestSnapshot({
        id: 'snapshot-2',
        timestamp: now,
        primaryTopic: Topic.DESIGN,
        primaryScore: 0.9,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 100,
        trigger: 'primary_change' as const,
      })

      const history = await getInterestHistory(10)
      expect(history).toHaveLength(2)
      expect(history[0].id).toBe('snapshot-2') // 最新的在前
      expect(history[1].id).toBe('snapshot-1')
    })
  })

  describe('getPrimaryTopicChanges', () => {
    it('应该只返回主导兴趣变化的快照', async () => {
      const { saveInterestSnapshot, getPrimaryTopicChanges } = await import('./db')
      
      await saveInterestSnapshot({
        id: 'snapshot-1',
        timestamp: Date.now() - 3000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.8,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 50,
        trigger: 'manual' as const,
      })

      await saveInterestSnapshot({
        id: 'snapshot-2',
        timestamp: Date.now() - 2000,
        primaryTopic: Topic.DESIGN,
        primaryScore: 0.9,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 100,
        trigger: 'primary_change' as const,
      })

      await saveInterestSnapshot({
        id: 'snapshot-3',
        timestamp: Date.now(),
        primaryTopic: Topic.DESIGN,
        primaryScore: 0.85,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 150,
        trigger: 'manual' as const,
      })

      const changes = await getPrimaryTopicChanges(10)
      
      // 只应该返回 primary_change 触发的快照
      expect(changes).toHaveLength(1)
      expect(changes[0].trigger).toBe('primary_change')
    })
  })

  describe('getTopicHistory', () => {
    it('应该返回特定主题的快照历史', async () => {
      const { saveInterestSnapshot, getTopicHistory } = await import('./db')
      
      await saveInterestSnapshot({
        id: 'snapshot-1',
        timestamp: Date.now() - 2000,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.8,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 50,
        trigger: 'manual' as const,
      })

      await saveInterestSnapshot({
        id: 'snapshot-2',
        timestamp: Date.now(),
        primaryTopic: Topic.DESIGN,
        primaryScore: 0.9,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 100,
        trigger: 'manual' as const,
      })

      const techHistory = await getTopicHistory(Topic.TECHNOLOGY, 10)
      expect(techHistory).toHaveLength(1)
      expect(techHistory[0].primaryTopic).toBe(Topic.TECHNOLOGY)
    })
  })

  describe('cleanOldSnapshots', () => {
    it('应该删除超过指定月数的快照', async () => {
      const { saveInterestSnapshot, getInterestHistory, cleanOldSnapshots } = await import('./db')
      
      const now = Date.now()
      const sevenMonthsAgo = now - 7 * 30 * 24 * 60 * 60 * 1000
      
      // 添加旧快照
      await saveInterestSnapshot({
        id: 'old-snapshot',
        timestamp: sevenMonthsAgo,
        primaryTopic: Topic.TECHNOLOGY,
        primaryScore: 0.8,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 50,
        trigger: 'manual' as const,
      })

      // 添加新快照
      await saveInterestSnapshot({
        id: 'new-snapshot',
        timestamp: now,
        primaryTopic: Topic.DESIGN,
        primaryScore: 0.9,
        primaryLevel: 'absolute' as const,
        topics: {},
        topKeywords: [],
        basedOnPages: 100,
        trigger: 'manual' as const,
      })

      const beforeClean = await getInterestHistory(100)
      expect(beforeClean).toHaveLength(2)
      
      const deleted = await cleanOldSnapshots(6)
      expect(deleted).toBe(1)
      
      const afterClean = await getInterestHistory(100)
      expect(afterClean).toHaveLength(1)
      expect(afterClean[0].id).toBe('new-snapshot')
    })
  })
})
