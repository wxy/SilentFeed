/**
 * 兴趣变化数据生成器（开发调试工具）
 * 
 * 用于快速生成模拟的兴趣演化数据，测试兴趣变化展示功能
 * 
 * 使用方法：
 * 1. 在浏览器控制台运行此脚本
 * 2. 或在 background script 中导入调用
 */

import { saveInterestSnapshot, getUserProfile } from '@/storage/db'
import type { InterestSnapshot } from '@/types/profile'
import { Topic, TOPIC_NAMES } from '@/core/profile/topics'

/**
 * 生成模拟的兴趣演化历程
 * 
 * @param count - 生成的快照数量（默认5个）
 * @returns 生成的快照ID列表
 */
export async function generateInterestChanges(count: number = 5): Promise<string[]> {
  const profile = await getUserProfile()
  
  if (!profile) {
    console.error('❌ 未找到用户画像，请先创建画像')
    return []
  }

  console.log('🚀 开始生成兴趣演化数据...')
  
  // 定义兴趣演化路径（模拟用户兴趣的自然变化）
  // 每个快照包含主题和期望的主导程度
  const interestPath = [
    { topic: Topic.TECHNOLOGY, name: TOPIC_NAMES[Topic.TECHNOLOGY], level: 'absolute' as const },
    { topic: Topic.TECHNOLOGY, name: TOPIC_NAMES[Topic.TECHNOLOGY], level: 'relative' as const },  // 强度减弱
    { topic: Topic.BUSINESS, name: TOPIC_NAMES[Topic.BUSINESS], level: 'leading' as const },      // 新兴趣出现
    { topic: Topic.BUSINESS, name: TOPIC_NAMES[Topic.BUSINESS], level: 'absolute' as const },     // 新兴趣增强
    { topic: Topic.ENTERTAINMENT, name: TOPIC_NAMES[Topic.ENTERTAINMENT], level: 'relative' as const },
    { topic: Topic.TECHNOLOGY, name: TOPIC_NAMES[Topic.TECHNOLOGY], level: 'leading' as const },  // 回归但较弱
    { topic: Topic.TECHNOLOGY, name: TOPIC_NAMES[Topic.TECHNOLOGY], level: 'absolute' as const }, // 重新增强
  ]

  const snapshotIds: string[] = []
  const baseTime = Date.now() - (count * 7 * 24 * 60 * 60 * 1000) // 从 count 周前开始

  // 所有话题列表
  const allTopics = Object.values(Topic)

  for (let i = 0; i < Math.min(count, interestPath.length); i++) {
    const { topic, name, level } = interestPath[i]
    const timestamp = baseTime + (i * 7 * 24 * 60 * 60 * 1000) // 每周一次变化
    const basedOnPages = 100 + i * 150 // 模拟逐渐增加的浏览页面数

    // 根据期望的主导程度构造话题分布
    const topics: Record<string, number> = {}
    
    // 设置主导话题的占比
    let primaryScore: number
    switch (level) {
      case 'absolute':
        primaryScore = 0.35 + Math.random() * 0.15  // 35-50%
        break
      case 'relative':
        primaryScore = 0.22 + Math.random() * 0.08  // 22-30%
        break
      case 'leading':
        primaryScore = 0.16 + Math.random() * 0.06  // 16-22%
        break
      default:
        primaryScore = 0.20
    }
    
    topics[topic] = primaryScore
    
    // 分配剩余占比给其他话题
    const otherTopics = allTopics.filter((t: Topic) => t !== topic)
    const remainingScore = 1 - primaryScore
    const avgOtherScore = remainingScore / otherTopics.length
    
    otherTopics.forEach((t: Topic) => {
      // 添加随机波动，使分布更自然
      topics[t] = avgOtherScore * (0.5 + Math.random())
    })

    // 归一化到1.0
    const sum = Object.values(topics).reduce((a, b) => a + b, 0)
    Object.keys(topics).forEach(t => {
      topics[t] = topics[t] / sum
    })

    const snapshot: InterestSnapshot = {
      id: `snapshot_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp,
      primaryTopic: topic,
      primaryScore: topics[topic],
      primaryLevel: level,  // 使用预设的主导程度
      topics,
      topKeywords: [
        { word: `${name}关键词1`, weight: 0.9 },
        { word: `${name}关键词2`, weight: 0.7 },
        { word: `${name}关键词3`, weight: 0.5 },
      ],
      basedOnPages,
      trigger: (i === 0 
        ? 'manual' 
        : interestPath[i - 1].topic !== topic 
          ? 'primary_change' 
          : interestPath[i - 1].level !== level
            ? 'periodic'  // 同主题但强度变化
            : 'periodic') as InterestSnapshot['trigger'],
      changeNote: i === 0 
        ? `首次建立兴趣画像：${name}`
        : interestPath[i - 1].topic !== topic 
          ? `主导兴趣变化：${interestPath[i - 1].name} → ${name}`
          : undefined
    }

    await saveInterestSnapshot(snapshot)
    snapshotIds.push(snapshot.id)

    console.log(`✅ [${i + 1}/${count}] 创建快照:`, {
      时间: new Date(timestamp).toLocaleDateString('zh-CN'),
      主导兴趣: name,
      主导程度: level === 'absolute' ? '🔥绝对主导' : level === 'relative' ? '⭐相对主导' : '💫领先主导',
      占比: `${Math.round(topics[topic] * 100)}%`,
      页面数: basedOnPages,
      变化说明: snapshot.changeNote || '无变化'
    })

    // 模拟异步延迟，避免时间戳完全相同
    await new Promise(resolve => setTimeout(resolve, 10))
  }

  console.log(`🎉 成功生成 ${snapshotIds.length} 个兴趣快照`)
  console.log('💡 请刷新设置页面查看兴趣演化历程')
  
  return snapshotIds
}

/**
 * 清除所有兴趣快照（用于重置测试）
 * @deprecated 使用 clearInterestHistory 替代
 */
export async function clearInterestSnapshots(): Promise<void> {
  const { db } = await import('@/storage/db')
  await db.interestSnapshots.clear()
  console.log('🧹 已清除所有兴趣快照')
}

// 开发环境下挂载到全局对象，方便浏览器控制台调用
if (process.env.NODE_ENV === 'development') {
  // 导入完整的清除功能
  import('./clear-interest-history').then(module => {
    ;(globalThis as any).__generateInterestChanges = generateInterestChanges
    ;(globalThis as any).__clearInterestSnapshots = clearInterestSnapshots  // 保留向后兼容
    ;(globalThis as any).__clearInterestHistory = module.clearInterestHistory
    ;(globalThis as any).__clearInterestHistoryBefore = module.clearInterestHistoryBefore
    ;(globalThis as any).__showInterestHistoryStats = module.showInterestHistoryStats
    
    console.log('🔧 开发调试工具已加载:')
    console.log('  - __generateInterestChanges(5)       生成5个兴趣变化快照')
    console.log('  - __clearInterestHistory()           清除所有演化历程（推荐）')
    console.log('  - __showInterestHistoryStats()       显示演化历程统计')
    console.log('  - __clearInterestHistoryBefore(ts)   清除指定时间之前的快照')
  })
}
