/**
 * db-settings.ts 模块测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from './db'
import { getSettings, updateSettings, getPageCount } from './db-settings'

describe('db-settings', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    
    // 初始化设置
    await db.settings.add({
      id: 'singleton',
      aiConfig: {
        provider: 'none'
      },
      dwellTime: {
        mode: 'fixed',
        fixedThreshold: 30,
        minThreshold: 10,
        maxThreshold: 120,
        calculatedThreshold: 30
      },
      exclusionRules: {
        autoExcludeIntranet: true,
        autoExcludeSensitive: true,
        customDomains: []
      },
      dataRetention: {
        rawVisitsDays: 30,
        statisticsDays: 365
      },
      notifications: {
        enabled: false,
        dailyLimit: 5
      }
    })
  })

  afterEach(async () => {
    await db.delete()
  })

  describe('getSettings', () => {
    it('应该返回用户设置', async () => {
      const settings = await getSettings()
      
      expect(settings).toBeDefined()
      expect(settings.id).toBe('singleton')
      expect(settings.dwellTime.mode).toBe('fixed')
      expect(settings.notifications?.enabled).toBe(false)
    })

    it('设置不存在时应该抛出错误', async () => {
      await db.settings.clear()
      
      await expect(getSettings()).rejects.toThrow('设置不存在')
    })
  })

  describe('updateSettings', () => {
    it('应该更新用户设置', async () => {
      await updateSettings({ 
        notifications: { enabled: true, dailyLimit: 10 } 
      })
      
      const settings = await getSettings()
      expect(settings.notifications?.enabled).toBe(true)
      expect(settings.notifications?.dailyLimit).toBe(10)
    })

    it('应该只更新指定字段', async () => {
      await updateSettings({ 
        dataRetention: { rawVisitsDays: 60, statisticsDays: 365 } 
      })
      
      const settings = await getSettings()
      expect(settings.dataRetention.rawVisitsDays).toBe(60)
      expect(settings.dwellTime.mode).toBe('fixed') // 保持不变
    })
  })

  describe('getPageCount', () => {
    it('数据库为空时应该返回 0', async () => {
      const count = await getPageCount()
      expect(count).toBe(0)
    })

    it('应该返回正确的页面数量', async () => {
      const now = Date.now()
      await db.confirmedVisits.add({
        id: 'visit1',
        url: 'https://example.com',
        title: 'Example',
        domain: 'example.com',
        visitTime: now,
        duration: 60000,
        interactionCount: 5,
        meta: null,
        contentSummary: null,
        analysis: {
          keywords: ['test'],
          topics: ['tech'],
          language: 'zh'
        },
        status: 'qualified',
        contentRetainUntil: now + 30 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: now + 365 * 24 * 60 * 60 * 1000
      })

      const count = await getPageCount()
      expect(count).toBe(1)
    })

    it('数据库未打开时应该返回 0', async () => {
      await db.close()
      const count = await getPageCount()
      expect(count).toBe(0)
    })
  })
})
