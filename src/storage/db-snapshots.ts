/**
 * 数据库兴趣快照管理模块
 * 
 * 负责兴趣快照的 CRUD 操作
 */

import type { InterestSnapshot } from "@/types/profile"
import { db } from './db'

/**
 * 保存兴趣快照
 * 
 * @param snapshot - 兴趣快照
 */
export async function saveInterestSnapshot(snapshot: InterestSnapshot): Promise<void> {
  await db.interestSnapshots.put(snapshot)
}

/**
 * 获取兴趣快照历史
 * 
 * @param limit - 限制数量（默认50）
 * @returns 按时间倒序的快照列表
 */
export async function getInterestHistory(limit: number = 50): Promise<InterestSnapshot[]> {
  return await db.interestSnapshots
    .orderBy('timestamp')
    .reverse()
    .limit(limit)
    .toArray()
}

/**
 * 获取主导兴趣变化历史
 * 
 * @param limit - 限制数量（默认20）
 * @returns 只包含主导兴趣变化的快照
 */
export async function getPrimaryTopicChanges(limit: number = 20): Promise<InterestSnapshot[]> {
  return await db.interestSnapshots
    .where('trigger')
    .equals('primary_change')
    .reverse()
    .limit(limit)
    .toArray()
}

/**
 * 获取指定主导兴趣的历史快照
 * 
 * @param primaryTopic - 主导兴趣类型
 * @param limit - 限制数量（默认10）
 */
export async function getTopicHistory(primaryTopic: string, limit: number = 10): Promise<InterestSnapshot[]> {
  return await db.interestSnapshots
    .where('[primaryTopic+timestamp]')
    .between([primaryTopic, 0], [primaryTopic, Date.now()])
    .reverse()
    .limit(limit)
    .toArray()
}

/**
 * 清理旧快照（保留最近N个月）
 * 
 * @param monthsToKeep - 保留月数（默认6个月）
 */
export async function cleanOldSnapshots(monthsToKeep: number = 6): Promise<number> {
  const cutoffTime = Date.now() - monthsToKeep * 30 * 24 * 60 * 60 * 1000
  
  const oldSnapshots = await db.interestSnapshots
    .where('timestamp')
    .below(cutoffTime)
    .toArray()
  
  if (oldSnapshots.length > 0) {
    await db.interestSnapshots
      .where('timestamp')
      .below(cutoffTime)
      .delete()
  }
  
  return oldSnapshots.length
}
