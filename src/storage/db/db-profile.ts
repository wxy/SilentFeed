/**
 * 数据库用户画像管理模块
 * 
 * 负责用户画像的 CRUD 操作
 */

import type { UserProfile } from "@/types/profile"
import { db } from './index'

/**
 * 保存或更新用户画像
 * 
 * @param profile - 用户画像
 */
export async function saveUserProfile(profile: UserProfile): Promise<void> {
  await db.userProfile.put(profile)
}

/**
 * 获取用户画像
 * 
 * @returns 用户画像（如果不存在则返回 null）
 */
export async function getUserProfile(): Promise<UserProfile | null> {
  const profile = await db.userProfile.get('singleton')
  return profile || null
}

/**
 * 删除用户画像
 */
export async function deleteUserProfile(): Promise<void> {
  await db.userProfile.delete('singleton')
}
