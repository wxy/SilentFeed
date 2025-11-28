/**
 * 数据库设置管理模块
 * 
 * 负责用户设置的读写操作
 */

import type { UserSettings } from "@/types/config"
import { db } from './index'

/**
 * 获取用户设置
 */
export async function getSettings(): Promise<UserSettings> {
  const settings = await db.settings.get('singleton')
  if (!settings) {
    throw new Error('设置不存在，请先初始化数据库')
  }
  return settings
}

/**
 * 更新用户设置
 */
export async function updateSettings(
  updates: Partial<Omit<UserSettings, 'id'>>
): Promise<void> {
  await db.settings.update('singleton', updates)
}

/**
 * 辅助函数：获取页面计数
 * 
 * 用于判断冷启动阶段
 */
export async function getPageCount(): Promise<number> {
  try {
    // 确保数据库已打开
    if (!db.isOpen()) {
      await db.open()
    }
    
    return await db.confirmedVisits.count()
  } catch (error) {
    // 数据库未初始化或出错时返回 0
    return 0
  }
}
