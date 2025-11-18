/**
 * 单例表访问测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { db } from './db'
import {
  SINGLETON_IDS,
  getUserProfile,
  updateUserProfile,
  saveUserProfile,
  deleteUserProfile,
  hasUserProfile,
  getUserSettings,
  updateUserSettings,
  saveUserSettings,
  deleteUserSettings,
  hasUserSettings,
  resetAllSingletons,
  exportSingletonData,
  importSingletonData
} from './singletons'
import type { UserProfile } from '@/types/profile'
import type { UserSettings } from '@/types/config'

describe('单例表访问 - 用户画像', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('getUserProfile', () => {
    it('应该在画像不存在时创建默认画像', async () => {
      const profile = await getUserProfile()
      
      expect(profile).toBeDefined()
      expect(profile.id).toBe(SINGLETON_IDS.USER_PROFILE)
      expect(profile.topics).toBeDefined()
      expect(profile.keywords).toEqual([])
      expect(profile.domains).toEqual([])
      expect(profile.totalPages).toBe(0)
      expect(profile.version).toBe(1)
    })

    it('应该返回已存在的画像', async () => {
      const testProfile: UserProfile = {
        id: SINGLETON_IDS.USER_PROFILE,
        topics: { technology: 0.5, science: 0.3, business: 0, design: 0, arts: 0, health: 0, sports: 0, entertainment: 0, news: 0, education: 0, other: 0.2 },
        keywords: [{ word: 'test', weight: 1.0 }],
        domains: [],
        totalPages: 100,
        lastUpdated: Date.now(),
        version: 1
      }
      
      await db.userProfile.put(testProfile)
      
      const profile = await getUserProfile()
      expect(profile.id).toBe(SINGLETON_IDS.USER_PROFILE)
      expect(profile.totalPages).toBe(100)
      expect(profile.keywords).toHaveLength(1)
    })
  })

  describe('updateUserProfile', () => {
    it('应该部分更新画像并保持正确的ID', async () => {
      // 先创建默认画像
      await getUserProfile()
      
      // 部分更新
      await updateUserProfile({
        totalPages: 50,
        topics: { technology: 0.8, science: 0, business: 0, design: 0, arts: 0, health: 0, sports: 0, entertainment: 0, news: 0, education: 0, other: 0.2 }
      })
      
      const profile = await getUserProfile()
      expect(profile.id).toBe(SINGLETON_IDS.USER_PROFILE)
      expect(profile.totalPages).toBe(50)
      expect(profile.topics.technology).toBe(0.8)
    })

    it('应该自动更新 lastUpdated 时间戳', async () => {
      await getUserProfile()
      
      const beforeTime = Date.now()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      await updateUserProfile({ totalPages: 10 })
      
      const profile = await getUserProfile()
      expect(profile.lastUpdated).toBeGreaterThanOrEqual(beforeTime)
    })
  })

  describe('saveUserProfile', () => {
    it('应该保存完整画像并强制正确的ID', async () => {
      const newProfile: UserProfile = {
        id: 'wrong-id' as any,  // 故意使用错误的 ID
        topics: { technology: 0.9, science: 0, business: 0, design: 0, arts: 0, health: 0, sports: 0, entertainment: 0, news: 0, education: 0, other: 0.1 },
        keywords: [{ word: 'ai', weight: 0.9 }],
        domains: [],
        totalPages: 200,
        lastUpdated: 0,
        version: 2
      }
      
      await saveUserProfile(newProfile)
      
      const profile = await getUserProfile()
      expect(profile.id).toBe(SINGLETON_IDS.USER_PROFILE)  // ID 被强制纠正
      expect(profile.totalPages).toBe(200)
      expect(profile.version).toBe(2)
    })
  })

  describe('deleteUserProfile', () => {
    it('应该删除画像', async () => {
      await getUserProfile()  // 创建画像
      
      const hasBefore = await hasUserProfile()
      expect(hasBefore).toBe(true)
      
      await deleteUserProfile()
      
      const hasAfter = await hasUserProfile()
      expect(hasAfter).toBe(false)
    })

    it('删除后 getUserProfile 应该自动创建新的默认画像', async () => {
      await getUserProfile()
      await deleteUserProfile()
      
      const newProfile = await getUserProfile()
      expect(newProfile.totalPages).toBe(0)
      expect(newProfile.keywords).toEqual([])
    })
  })

  describe('hasUserProfile', () => {
    it('应该正确检测画像是否存在', async () => {
      const hasBefore = await hasUserProfile()
      expect(hasBefore).toBe(false)
      
      await getUserProfile()
      
      const hasAfter = await hasUserProfile()
      expect(hasAfter).toBe(true)
    })
  })
})

describe('单例表访问 - 用户设置', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('getUserSettings', () => {
    it('应该在设置不存在时创建默认设置', async () => {
      const settings = await getUserSettings()
      
      expect(settings).toBeDefined()
      expect(settings.id).toBe(SINGLETON_IDS.USER_SETTINGS)
      expect(settings.dwellTime.mode).toBe('fixed')
      expect(settings.dwellTime.fixedThreshold).toBe(30)
      expect(settings.exclusionRules.autoExcludeIntranet).toBe(true)
    })

    it('应该返回已存在的设置', async () => {
      const testSettings: UserSettings = {
        id: SINGLETON_IDS.USER_SETTINGS,
        dwellTime: {
          mode: 'fixed',
          fixedThreshold: 60,
          minThreshold: 30,
          maxThreshold: 180,
          calculatedThreshold: 60
        },
        exclusionRules: {
          autoExcludeIntranet: false,
          autoExcludeSensitive: false,
          customDomains: ['example.com']
        },
        dataRetention: {
          rawVisitsDays: 30,
          statisticsDays: 180
        }
      }
      
      await db.settings.put(testSettings)
      
      const settings = await getUserSettings()
      expect(settings.dwellTime.fixedThreshold).toBe(60)
      expect(settings.exclusionRules.customDomains).toEqual(['example.com'])
    })
  })

  describe('updateUserSettings', () => {
    it('应该部分更新设置并保持正确的ID', async () => {
      await getUserSettings()
      
      await updateUserSettings({
        dwellTime: {
          mode: 'fixed',
          fixedThreshold: 45,
          minThreshold: 15,
          maxThreshold: 120,
          calculatedThreshold: 45
        }
      })
      
      const settings = await getUserSettings()
      expect(settings.id).toBe(SINGLETON_IDS.USER_SETTINGS)
      expect(settings.dwellTime.fixedThreshold).toBe(45)
    })
  })

  describe('saveUserSettings', () => {
    it('应该保存完整设置并强制正确的ID', async () => {
      const newSettings: UserSettings = {
        id: 'wrong-id' as any,
        dwellTime: {
          mode: 'fixed',
          fixedThreshold: 90,
          minThreshold: 45,
          maxThreshold: 240,
          calculatedThreshold: 90
        },
        exclusionRules: {
          autoExcludeIntranet: true,
          autoExcludeSensitive: true,
          customDomains: []
        },
        dataRetention: {
          rawVisitsDays: 60,
          statisticsDays: 720
        }
      }
      
      await saveUserSettings(newSettings)
      
      const settings = await getUserSettings()
      expect(settings.id).toBe(SINGLETON_IDS.USER_SETTINGS)
      expect(settings.dwellTime.fixedThreshold).toBe(90)
    })
  })

  describe('deleteUserSettings', () => {
    it('应该删除设置', async () => {
      await getUserSettings()
      
      const hasBefore = await hasUserSettings()
      expect(hasBefore).toBe(true)
      
      await deleteUserSettings()
      
      const hasAfter = await hasUserSettings()
      expect(hasAfter).toBe(false)
    })

    it('删除后 getUserSettings 应该自动创建新的默认设置', async () => {
      await getUserSettings()
      await deleteUserSettings()
      
      const newSettings = await getUserSettings()
      expect(newSettings.dwellTime.fixedThreshold).toBe(30)
    })
  })

  describe('hasUserSettings', () => {
    it('应该正确检测设置是否存在', async () => {
      const hasBefore = await hasUserSettings()
      expect(hasBefore).toBe(false)
      
      await getUserSettings()
      
      const hasAfter = await hasUserSettings()
      expect(hasAfter).toBe(true)
    })
  })
})

describe('单例表访问 - 工具函数', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.close()
  })

  describe('resetAllSingletons', () => {
    it('应该重置所有单例为默认值', async () => {
      // 修改画像和设置
      await updateUserProfile({ totalPages: 100 })
      await updateUserSettings({
        dwellTime: {
          mode: 'fixed',
          fixedThreshold: 60,
          minThreshold: 15,
          maxThreshold: 120,
          calculatedThreshold: 60
        }
      })
      
      // 重置
      await resetAllSingletons()
      
      // 验证
      const profile = await getUserProfile()
      const settings = await getUserSettings()
      
      expect(profile.totalPages).toBe(0)
      expect(settings.dwellTime.fixedThreshold).toBe(30)
    })
  })

  describe('exportSingletonData & importSingletonData', () => {
    it('应该导出和导入单例数据', async () => {
      // 创建自定义数据
      await updateUserProfile({ totalPages: 500 })
      await updateUserSettings({
        dwellTime: {
          mode: 'fixed',
          fixedThreshold: 75,
          minThreshold: 15,
          maxThreshold: 120,
          calculatedThreshold: 75
        }
      })
      
      // 导出
      const exported = await exportSingletonData()
      expect(exported.profile?.totalPages).toBe(500)
      expect(exported.settings?.dwellTime.fixedThreshold).toBe(75)
      
      // 重置
      await resetAllSingletons()
      
      // 导入
      await importSingletonData(exported)
      
      // 验证
      const profile = await getUserProfile()
      const settings = await getUserSettings()
      
      expect(profile.totalPages).toBe(500)
      expect(settings.dwellTime.fixedThreshold).toBe(75)
    })

    it('应该处理空数据导入', async () => {
      await importSingletonData({})
      
      // 不应抛出错误
      const profile = await getUserProfile()
      expect(profile).toBeDefined()
    })

    it('应该处理 null 数据导入', async () => {
      await importSingletonData({
        profile: null,
        settings: null
      })
      
      // 不应抛出错误
      const settings = await getUserSettings()
      expect(settings).toBeDefined()
    })
  })
})
