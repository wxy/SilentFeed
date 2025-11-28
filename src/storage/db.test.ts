/**
 * 数据库核心功能测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { 
  db, 
  initializeDatabase, 
  getSettings, 
  updateSettings, 
  getPageCount
} from './db'
import type { ConfirmedVisit } from "@/types/database"

describe('设置管理', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  it('应该能获取设置', async () => {
    const settings = await getSettings()
    
    expect(settings.id).toBe('singleton')
    expect(settings.dwellTime).toBeDefined()
    expect(settings.exclusionRules).toBeDefined()
    expect(settings.dataRetention).toBeDefined()
  })

  it('应该能更新设置', async () => {
    await updateSettings({
      dwellTime: {
        mode: 'fixed',
        fixedThreshold: 45,
        minThreshold: 15,
        maxThreshold: 120,
        calculatedThreshold: 45
      }
    })
    
    const updated = await getSettings()
    expect(updated.dwellTime.mode).toBe('fixed')
    expect(updated.dwellTime.fixedThreshold).toBe(45)
  })

  it('应该能更新部分设置', async () => {
    const original = await getSettings()
    
    await updateSettings({
      exclusionRules: {
        ...original.exclusionRules,
        customDomains: ['example.com', 'test.com']
      }
    })
    
    const updated = await getSettings()
    expect(updated.exclusionRules.customDomains).toEqual(['example.com', 'test.com'])
    // 其他设置不变
    expect(updated.dwellTime.mode).toBe(original.dwellTime.mode)
  })
})

describe('页面计数', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  it('初始页面计数应该为 0', async () => {
    const count = await getPageCount()
    expect(count).toBe(0)
  })

  it('添加访问记录后应该正确计数', async () => {
    // 添加测试数据
    const visit: ConfirmedVisit = {
      id: 'test-1',
      url: 'https://example.com',
      title: 'Test Page',
      domain: 'example.com',
      meta: null,
      contentSummary: null,
      analysis: {
        keywords: ['test'],
        topics: ['technology'],
        language: 'en'
      },
      duration: 60,
      interactionCount: 5,
      visitTime: Date.now(),
      status: 'qualified',
      contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
      analysisRetainUntil: -1
    }
    
    await db.confirmedVisits.add(visit)
    
    const count = await getPageCount()
    expect(count).toBe(1)
  })

  it('应该能添加多个访问记录', async () => {
    const visits: ConfirmedVisit[] = [
      {
        id: 'test-1',
        url: 'https://example.com/1',
        title: 'Page 1',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: ['test'], topics: ['technology'], language: 'en' },
        duration: 60,
        interactionCount: 5,
        visitTime: Date.now(),
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      },
      {
        id: 'test-2',
        url: 'https://example.com/2',
        title: 'Page 2',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: ['test'], topics: ['design'], language: 'en' },
        duration: 90,
        interactionCount: 10,
        visitTime: Date.now(),
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }
    ]
    
    await db.confirmedVisits.bulkAdd(visits)
    
    const count = await getPageCount()
    expect(count).toBe(2)
  })
})

describe('数据库索引', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    await initializeDatabase()
  })

  afterEach(async () => {
    await db.close()
  })

  it('应该能按域名查询', async () => {
    const visits: ConfirmedVisit[] = [
      {
        id: 'test-1',
        url: 'https://example.com/1',
        title: 'Page 1',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: [], topics: [], language: 'en' },
        duration: 60,
        interactionCount: 5,
        visitTime: Date.now(),
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      },
      {
        id: 'test-2',
        url: 'https://another.com/1',
        title: 'Page 2',
        domain: 'another.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: [], topics: [], language: 'en' },
        duration: 90,
        interactionCount: 10,
        visitTime: Date.now(),
        status: 'qualified',
        contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }
    ]
    
    await db.confirmedVisits.bulkAdd(visits)
    
    const exampleVisits = await db.confirmedVisits
      .where('domain')
      .equals('example.com')
      .toArray()
    
    expect(exampleVisits).toHaveLength(1)
    expect(exampleVisits[0].domain).toBe('example.com')
  })

  it('应该能按时间排序查询', async () => {
    const now = Date.now()
    const visits: ConfirmedVisit[] = [
      {
        id: 'test-1',
        url: 'https://example.com/1',
        title: 'Old Page',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: [], topics: [], language: 'en' },
        duration: 60,
        interactionCount: 5,
        visitTime: now - 1000,
        status: 'qualified',
        contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      },
      {
        id: 'test-2',
        url: 'https://example.com/2',
        title: 'New Page',
        domain: 'example.com',
        meta: null,
        contentSummary: null,
        analysis: { keywords: [], topics: [], language: 'en' },
        duration: 90,
        interactionCount: 10,
        visitTime: now,
        status: 'qualified',
        contentRetainUntil: now + 90 * 24 * 60 * 60 * 1000,
        analysisRetainUntil: -1
      }
    ]
    
    await db.confirmedVisits.bulkAdd(visits)
    
    const sortedVisits = await db.confirmedVisits
      .orderBy('visitTime')
      .reverse()
      .toArray()
    
    expect(sortedVisits[0].title).toBe('New Page')
    expect(sortedVisits[1].title).toBe('Old Page')
  })
})
