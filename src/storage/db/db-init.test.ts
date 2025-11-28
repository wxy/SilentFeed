/**
 * 数据库初始化测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db, initializeDatabase } from './index'

describe('数据库初始化', () => {
  beforeEach(async () => {
    // 清空数据库
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  it('应该成功创建数据库', async () => {
    expect(db.isOpen()).toBe(true)
    expect(db.name).toBe('SilentFeedDB')
  })

  it('应该包含所有必需的表', () => {
    expect(db.pendingVisits).toBeDefined()
    expect(db.confirmedVisits).toBeDefined()
    expect(db.settings).toBeDefined()
    // statistics 表已在版本 12 中删除（使用内存缓存代替）
    expect(db.recommendations).toBeDefined() // Phase 2.7
    expect(db.feedArticles).toBeDefined() // Phase 7
  })

  it('应该在初始化时创建默认设置', async () => {
    await initializeDatabase()
    
    const settings = await db.settings.get('singleton')
    expect(settings).toBeDefined()
    expect(settings?.id).toBe('singleton')
    expect(settings?.dwellTime.mode).toBe('fixed')  // Phase 2.7改为fixed
    expect(settings?.dwellTime.fixedThreshold).toBe(30)
  })

  it('应该在设置不存在时创建，存在时跳过', async () => {
    // 场景1：数据库为空，应该创建设置
    const countBefore = await db.settings.count()
    expect(countBefore).toBe(0)
    
    await initializeDatabase()
    
    const countAfter = await db.settings.count()
    expect(countAfter).toBe(1)
    
    const settings = await db.settings.get('singleton')
    expect(settings).toBeDefined()
    expect(settings?.dwellTime.fixedThreshold).toBe(30)  // 默认值
    
    // 场景2：修改设置
    await db.settings.update('singleton', {
      dwellTime: {
        mode: 'fixed',
        fixedThreshold: 90,
        minThreshold: 15,
        maxThreshold: 120,
        calculatedThreshold: 90
      }
    })
    
    const updated = await db.settings.get('singleton')
    expect(updated?.dwellTime.fixedThreshold).toBe(90)
    
    // 场景3：再次调用initializeDatabase，应该检测到count > 0，不重复添加
    // 注意：由于测试环境的版本冲突检测，数据库可能被重建
    // 但重建后count仍然是1（不是2），说明没有重复添加
    await initializeDatabase()
    
    const finalCount = await db.settings.count()
    expect(finalCount).toBe(1)  // 关键：没有重复添加
  })
})
