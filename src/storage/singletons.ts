/**
 * 单例表访问辅助函数
 * 
 * Phase 7: 数据库优化 - 强化单例表约束
 * 
 * 本文件为 userProfile 和 settings 单例表提供封装访问，
 * 防止直接操作数据库导致的错误（如重复创建、错误的ID等）
 * 
 * @module storage/singletons
 */

import { db } from './db/index'
import type { UserProfile } from '@/types/profile'
import type { UserSettings } from '@/types/config'
import { logger } from '@/utils/logger'
import { Topic } from '@/core/profile/topics'

const singletonsLogger = logger.withTag('Singletons')

/**
 * 单例表 ID 常量
 */
export const SINGLETON_IDS = {
  USER_PROFILE: 'singleton',
  USER_SETTINGS: 'singleton'
} as const

/**
 * 创建默认用户画像
 */
function createDefaultProfile(): UserProfile {
  const now = Date.now()
  
  return {
    id: SINGLETON_IDS.USER_PROFILE,
    topics: {
      technology: 0,
      science: 0,
      business: 0,
      design: 0,
      arts: 0,
      health: 0,
      sports: 0,
      entertainment: 0,
      news: 0,
      education: 0,
      other: 0
    },
    keywords: [],
    domains: [],
    totalPages: 0,
    lastUpdated: now,
    version: 1
  }
}

/**
 * 创建默认用户设置
 */
function createDefaultSettings(): UserSettings {
  return {
    id: SINGLETON_IDS.USER_SETTINGS,
    dwellTime: {
      mode: 'fixed',
      fixedThreshold: 30,
      minThreshold: 15,
      maxThreshold: 120,
      calculatedThreshold: 30
    },
    exclusionRules: {
      autoExcludeIntranet: true,
      autoExcludeSensitive: true,
      customDomains: []
    },
    dataRetention: {
      rawVisitsDays: 90,
      statisticsDays: 365
    }
  }
}

// ============================================================================
// 用户画像单例访问
// ============================================================================

/**
 * 获取用户画像（自动创建默认画像）
 * 
 * @returns 用户画像对象
 */
export async function getUserProfile(): Promise<UserProfile> {
  let profile = await db.userProfile.get(SINGLETON_IDS.USER_PROFILE)
  
  if (!profile) {
    singletonsLogger.info('用户画像不存在，创建默认画像')
    profile = createDefaultProfile()
    await db.userProfile.put(profile)
  }
  
  return profile
}

/**
 * 更新用户画像
 * 
 * @param updates - 要更新的字段（部分更新）
 */
export async function updateUserProfile(
  updates: Partial<Omit<UserProfile, 'id'>>
): Promise<void> {
  const currentProfile = await getUserProfile()
  
  const updatedProfile: UserProfile = {
    ...currentProfile,
    ...updates,
    id: SINGLETON_IDS.USER_PROFILE,  // 强制保持正确的 ID
    lastUpdated: Date.now()  // 自动更新时间戳
  }
  
  await db.userProfile.put(updatedProfile)
  singletonsLogger.debug('用户画像已更新')
}

/**
 * 保存完整的用户画像（替换）
 * 
 * @param profile - 新的完整画像对象
 */
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  // 强制使用正确的 ID
  const profileToSave: UserProfile = {
    ...profile,
    id: SINGLETON_IDS.USER_PROFILE,
    lastUpdated: Date.now()
  }
  
  await db.userProfile.put(profileToSave)
  singletonsLogger.debug('用户画像已保存')
}

/**
 * 删除用户画像
 * 
 * 注意：删除后下次调用 getUserProfile() 会自动创建默认画像
 */
export async function deleteUserProfile(): Promise<void> {
  await db.userProfile.delete(SINGLETON_IDS.USER_PROFILE)
  singletonsLogger.info('用户画像已删除')
}

/**
 * 检查用户画像是否存在
 */
export async function hasUserProfile(): Promise<boolean> {
  const profile = await db.userProfile.get(SINGLETON_IDS.USER_PROFILE)
  return profile !== undefined
}

// ============================================================================
// 用户设置单例访问
// ============================================================================

/**
 * 获取用户设置（自动创建默认设置）
 * 
 * @returns 用户设置对象
 */
export async function getUserSettings(): Promise<UserSettings> {
  let settings = await db.settings.get(SINGLETON_IDS.USER_SETTINGS)
  
  if (!settings) {
    singletonsLogger.info('用户设置不存在，创建默认设置')
    settings = createDefaultSettings()
    await db.settings.put(settings)
  }
  
  return settings
}

/**
 * 更新用户设置
 * 
 * @param updates - 要更新的字段（部分更新）
 */
export async function updateUserSettings(
  updates: Partial<Omit<UserSettings, 'id'>>
): Promise<void> {
  const currentSettings = await getUserSettings()
  
  const updatedSettings: UserSettings = {
    ...currentSettings,
    ...updates,
    id: SINGLETON_IDS.USER_SETTINGS  // 强制保持正确的 ID
  }
  
  await db.settings.put(updatedSettings)
  singletonsLogger.debug('用户设置已更新')
}

/**
 * 保存完整的用户设置（替换）
 * 
 * @param settings - 新的完整设置对象
 */
export async function saveUserSettings(settings: UserSettings): Promise<void> {
  // 强制使用正确的 ID
  const settingsToSave: UserSettings = {
    ...settings,
    id: SINGLETON_IDS.USER_SETTINGS
  }
  
  await db.settings.put(settingsToSave)
  singletonsLogger.debug('用户设置已保存')
}

/**
 * 删除用户设置
 * 
 * 注意：删除后下次调用 getUserSettings() 会自动创建默认设置
 */
export async function deleteUserSettings(): Promise<void> {
  await db.settings.delete(SINGLETON_IDS.USER_SETTINGS)
  singletonsLogger.info('用户设置已删除')
}

/**
 * 检查用户设置是否存在
 */
export async function hasUserSettings(): Promise<boolean> {
  const settings = await db.settings.get(SINGLETON_IDS.USER_SETTINGS)
  return settings !== undefined
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 重置所有单例数据（恢复默认）
 * 
 * 用于用户请求重置或测试环境清理
 */
export async function resetAllSingletons(): Promise<void> {
  singletonsLogger.info('重置所有单例数据')
  
  await db.userProfile.put(createDefaultProfile())
  await db.settings.put(createDefaultSettings())
  
  singletonsLogger.info('✅ 单例数据已重置为默认值')
}

/**
 * 导出单例数据（用于备份）
 */
export async function exportSingletonData(): Promise<{
  profile: UserProfile | null
  settings: UserSettings | null
}> {
  const profile = await db.userProfile.get(SINGLETON_IDS.USER_PROFILE)
  const settings = await db.settings.get(SINGLETON_IDS.USER_SETTINGS)
  
  return {
    profile: profile || null,
    settings: settings || null
  }
}

/**
 * 导入单例数据（用于恢复）
 * 
 * @param data - 导出的单例数据
 */
export async function importSingletonData(data: {
  profile?: UserProfile | null
  settings?: UserSettings | null
}): Promise<void> {
  if (data.profile) {
    await saveUserProfile(data.profile)
    singletonsLogger.info('用户画像已导入')
  }
  
  if (data.settings) {
    await saveUserSettings(data.settings)
    singletonsLogger.info('用户设置已导入')
  }
}
