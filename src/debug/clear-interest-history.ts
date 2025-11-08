/**
 * 清除兴趣演化历程数据
 * 
 * 调试工具：用于清除测试数据或重置演化历程
 * 
 * 使用方式：
 * 1. 打开浏览器控制台
 * 2. 运行 __clearInterestHistory()
 * 3. 确认清除所有演化历程数据
 */

import { db } from "@/storage/db"

/**
 * 清除所有兴趣演化快照
 * 
 * ⚠️ 警告：此操作不可恢复，将删除所有历史演化记录
 */
export async function clearInterestHistory(): Promise<void> {
  try {
    console.log("[Debug] 开始清除兴趣演化历程...")
    
    // 获取当前快照数量
    const count = await db.interestSnapshots.count()
    console.log(`[Debug] 当前共有 ${count} 个快照`)
    
    if (count === 0) {
      console.log("[Debug] ℹ️ 没有快照需要清除")
      return
    }
    
    // 清除所有快照
    await db.interestSnapshots.clear()
    
    // 验证清除成功
    const remainingCount = await db.interestSnapshots.count()
    
    if (remainingCount === 0) {
      console.log(`[Debug] ✅ 成功清除 ${count} 个兴趣演化快照`)
    } else {
      console.warn(`[Debug] ⚠️ 清除不完整，还剩 ${remainingCount} 个快照`)
    }
  } catch (error) {
    console.error("[Debug] ❌ 清除兴趣演化历程失败:", error)
    throw error
  }
}

/**
 * 清除指定时间之前的快照
 * 
 * @param beforeTimestamp - 清除此时间之前的快照
 */
export async function clearInterestHistoryBefore(beforeTimestamp: number): Promise<void> {
  try {
    console.log(`[Debug] 清除 ${new Date(beforeTimestamp).toLocaleString()} 之前的快照...`)
    
    // 获取符合条件的快照
    const snapshots = await db.interestSnapshots
      .where('timestamp')
      .below(beforeTimestamp)
      .toArray()
    
    console.log(`[Debug] 找到 ${snapshots.length} 个符合条件的快照`)
    
    if (snapshots.length === 0) {
      console.log("[Debug] ℹ️ 没有快照需要清除")
      return
    }
    
    // 删除符合条件的快照
    await db.interestSnapshots
      .where('timestamp')
      .below(beforeTimestamp)
      .delete()
    
    console.log(`[Debug] ✅ 成功清除 ${snapshots.length} 个快照`)
  } catch (error) {
    console.error("[Debug] ❌ 清除历史快照失败:", error)
    throw error
  }
}

/**
 * 显示当前快照统计信息
 */
export async function showInterestHistoryStats(): Promise<void> {
  try {
    const snapshots = await db.interestSnapshots.orderBy('timestamp').toArray()
    
    if (snapshots.length === 0) {
      console.log("[Debug] 📊 当前没有任何兴趣演化快照")
      return
    }
    
    console.log(`[Debug] 📊 兴趣演化历程统计:`)
    console.log(`  总快照数: ${snapshots.length}`)
    console.log(`  最早快照: ${new Date(snapshots[0].timestamp).toLocaleString()}`)
    console.log(`  最新快照: ${new Date(snapshots[snapshots.length - 1].timestamp).toLocaleString()}`)
    
    // 按触发类型分组统计
    const triggerStats = snapshots.reduce((stats, snapshot) => {
      stats[snapshot.trigger] = (stats[snapshot.trigger] || 0) + 1
      return stats
    }, {} as Record<string, number>)
    
    console.log(`  触发类型分布:`, triggerStats)
    
    // 显示最近 5 个快照
    console.log(`\n  最近 5 个快照:`)
    snapshots.slice(-5).reverse().forEach((snapshot, index) => {
      console.log(`    ${index + 1}. ${new Date(snapshot.timestamp).toLocaleString()} - ${snapshot.primaryTopic} (${snapshot.trigger})`)
    })
  } catch (error) {
    console.error("[Debug] ❌ 获取统计信息失败:", error)
  }
}
