/**
 * 兴趣快照管理器
 * 
 * 负责管理用户兴趣变化追踪：
 * - 检测主导兴趣变化
 * - 自动创建兴趣快照
 * - 生成变化描述
 * - 定期清理历史数据
 */

import { TOPIC_NAMES, Topic } from '@/core/profile/topics'
import { saveInterestSnapshot, getInterestHistory } from '@/storage/db'
import type { UserProfile, InterestSnapshot } from "@/types/profile"
import type { TopicDistribution } from '@/core/profile/TopicClassifier'

export class InterestSnapshotManager {
  /**
   * 检查并处理兴趣变化
   * 
   * 在用户画像更新时调用，检测主导兴趣是否发生变化
   * 如果发生变化，自动创建快照记录
   * 
   * @param newProfile - 新的用户画像
   * @param trigger - 触发原因
   */
  static async handleProfileUpdate(
    newProfile: UserProfile,
    trigger: InterestSnapshot['trigger'] = 'manual'
  ): Promise<void> {
    try {
      console.log('[SnapshotManager] 🔍 开始处理画像更新', {
        trigger,
        页面数: newProfile.totalPages,
        主题分布: newProfile.topics
      })
      
      // 计算当前主导兴趣
      const currentPrimary = this.calculatePrimaryTopic(newProfile.topics)
      
      if (!currentPrimary) {
        console.log('[SnapshotManager] ⚠️ 没有主导兴趣，跳过快照', {
          主题分布: newProfile.topics,
          原因: '没有满足主导条件的兴趣'
        })
        return
      }

      console.log('[SnapshotManager] ✅ 检测到主导兴趣', {
        主题: currentPrimary.topic,
        分数: currentPrimary.score,
        级别: currentPrimary.level
      })

      // 获取最近的快照历史
      const recentSnapshots = await getInterestHistory(5)
      const lastSnapshot = recentSnapshots[0]

      console.log('[SnapshotManager] 快照历史', {
        总快照数: recentSnapshots.length,
        最近快照: lastSnapshot ? {
          主题: lastSnapshot.primaryTopic,
          时间: new Date(lastSnapshot.timestamp).toLocaleString()
        } : '无'
      })

      // 检查是否需要创建快照
      let shouldCreateSnapshot = false
      let changeNote: string | undefined = undefined

      if (!lastSnapshot) {
        // 首次创建快照
        shouldCreateSnapshot = true
        changeNote = `首次建立兴趣画像：${TOPIC_NAMES[currentPrimary.topic as Topic]}`
        console.log('[SnapshotManager] 📸 触发条件: 首次创建快照')
      } else if (lastSnapshot.primaryTopic !== currentPrimary.topic) {
        // 主导兴趣发生变化
        shouldCreateSnapshot = true
        const oldTopicName = TOPIC_NAMES[lastSnapshot.primaryTopic as Topic] || lastSnapshot.primaryTopic
        const newTopicName = TOPIC_NAMES[currentPrimary.topic as Topic] || currentPrimary.topic
        changeNote = `主导兴趣变化：${oldTopicName} → ${newTopicName}`
        trigger = 'primary_change'
        console.log('[SnapshotManager] 📸 触发条件: 主导兴趣变化', {
          旧: oldTopicName,
          新: newTopicName
        })
      } else if (trigger === 'rebuild') {
        // 强制重建时也创建快照
        shouldCreateSnapshot = true
        changeNote = '用户主动重建画像'
        console.log('[SnapshotManager] 📸 触发条件: 强制重建')
        console.log('[SnapshotManager] 🔍 画像状态检查:', {
          '上次快照有AI': !!lastSnapshot.aiSummary,
          '新画像有AI': !!newProfile.aiSummary,
          '上次AI摘要': lastSnapshot.aiSummary?.summary?.substring(0, 50),
          '新AI摘要': newProfile.aiSummary?.summary?.substring(0, 50)
        })
        
        // Phase 8.2: 检查是否从关键词画像升级到 AI 画像
        if (!lastSnapshot.aiSummary && newProfile.aiSummary) {
          changeNote = '升级到 AI 语义画像'
          trigger = 'ai_change'
          console.log('[SnapshotManager] 🚀 检测到画像升级: 关键词 → AI')
        }
      } else if (newProfile.aiSummary && lastSnapshot.aiSummary) {
        // Phase 8.2: 检查 AI 画像是否显著变化（两者都有 AI 时）
        const similarity = this.calculateSemanticSimilarity(
          lastSnapshot.aiSummary.interests,
          newProfile.aiSummary.interests
        )
        
        console.log('[SnapshotManager] 🤖 AI 语义相似度检测', {
          相似度: (similarity * 100).toFixed(1) + '%',
          阈值: '70%',
          上次摘要: lastSnapshot.aiSummary.interests.slice(0, 30) + '...',
          当前摘要: newProfile.aiSummary.interests.slice(0, 30) + '...'
        })
        
        if (similarity < 0.7) {
          shouldCreateSnapshot = true
          changeNote = `AI 画像发生显著变化（相似度 ${(similarity * 100).toFixed(0)}%）`
          trigger = 'ai_change'
          console.log('[SnapshotManager] 📸 触发条件: AI 语义变化')
        }
      } else if (!lastSnapshot.aiSummary && newProfile.aiSummary) {
        // Phase 8.2: 首次生成 AI 画像（非重建触发）
        shouldCreateSnapshot = true
        changeNote = '首次生成 AI 语义画像'
        trigger = 'ai_change'
        console.log('[SnapshotManager] 📸 触发条件: 首次 AI 画像')
      } else {
        console.log('[SnapshotManager] ⏭️ 跳过快照创建', {
          原因: '主导兴趣未变化且非强制重建',
          当前主题: currentPrimary.topic,
          上次主题: lastSnapshot.primaryTopic
        })
      }

      if (shouldCreateSnapshot) {
        console.log('[SnapshotManager] ✨ 准备创建快照:', {
          触发类型: trigger,
          变化说明: changeNote,
          新画像ID: newProfile.id,
          有AI摘要: !!newProfile.aiSummary
        })
        await this.createSnapshot(newProfile, currentPrimary, trigger, changeNote)
        console.log('[SnapshotManager] ✅ 创建兴趣快照成功:', changeNote)
      } else {
        console.log('[SnapshotManager] ⚠️ 未创建快照 - shouldCreateSnapshot = false')
      }
    } catch (error) {
      console.error('[SnapshotManager] ❌ 处理兴趣变化失败:', error)
    }
  }

  /**
   * 创建兴趣快照
   */
  private static async createSnapshot(
    profile: UserProfile,
    primaryTopic: { topic: string; score: number; level: 'absolute' | 'relative' | 'leading' },
    trigger: InterestSnapshot['trigger'],
    changeNote?: string
  ): Promise<void> {
    const snapshot: InterestSnapshot = {
      id: `snapshot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      primaryTopic: primaryTopic.topic,
      primaryScore: primaryTopic.score,
      primaryLevel: primaryTopic.level,  // 保存主导程度
      topics: { ...profile.topics } as Record<string, number>, // 类型转换
      topKeywords: profile.keywords.slice(0, 10).map(k => ({
        word: k.word,
        weight: k.weight
      })),
      basedOnPages: profile.totalPages,
      trigger,
      changeNote
    }
    
    // Phase 8.2: 包含 AI 摘要（如果有）
    if (profile.aiSummary) {
      snapshot.aiSummary = {
        interests: profile.aiSummary.interests.slice(0, 100), // 限制长度
        topPreferences: profile.aiSummary.preferences.slice(0, 3), // Top 3
        provider: profile.aiSummary.metadata.provider as "openai" | "deepseek" | "keyword"
      }
      
      console.log('[SnapshotManager] ✨ 快照包含 AI 摘要', {
        摘要长度: snapshot.aiSummary.interests.length,
        偏好数: snapshot.aiSummary.topPreferences.length,
        Provider: snapshot.aiSummary.provider
      })
    }
    
    // Phase 8.2: 包含行为统计（如果有）
    if (profile.behaviors) {
      snapshot.stats = {
        totalBrowses: profile.totalPages,
        totalReads: profile.behaviors.totalReads || 0,
        totalDismisses: profile.behaviors.totalDismisses || 0
      }
      
      console.log('[SnapshotManager] 📊 快照包含行为统计', snapshot.stats)
    }

    await saveInterestSnapshot(snapshot)
  }

  /**
   * 计算主导兴趣（相对主导策略）
   * 
   * 策略：
   * 1. 绝对主导：单一兴趣 > 33.3%
   * 2. 相对主导：最高兴趣比第二高兴趣高出50%以上，且 > 20%
   * 3. 显著领先：最高兴趣 > 25%，且比平均值高出2倍以上
   */
  private static calculatePrimaryTopic(
    topics: TopicDistribution
  ): { topic: string; score: number; level: 'absolute' | 'relative' | 'leading' } | null {
    // 过滤掉OTHER并排序
    const validEntries = Object.entries(topics)
      .filter(([topic, score]) => topic !== Topic.OTHER && score > 0)
      .sort(([, a], [, b]) => b - a)

    console.log('[SnapshotManager] 🎯 计算主导兴趣', {
      有效主题数: validEntries.length,
      主题详情: validEntries.map(([topic, score]) => ({
        主题: TOPIC_NAMES[topic as Topic] || topic,
        分数: (score * 100).toFixed(1) + '%'
      }))
    })

    if (validEntries.length === 0) {
      console.log('[SnapshotManager] ⚠️ 没有有效主题（除OTHER外）')
      return null
    }

    const [firstTopic, firstScore] = validEntries[0]
    const [, secondScore = 0] = validEntries[1] || []
    
    // 计算平均分（不包括OTHER）
    const totalScore = validEntries.reduce((sum, [, score]) => sum + score, 0)
    const avgScore = totalScore / validEntries.length

    console.log('[SnapshotManager] 📊 主导判定参数', {
      最高分: (firstScore * 100).toFixed(1) + '%',
      次高分: (secondScore * 100).toFixed(1) + '%',
      平均分: (avgScore * 100).toFixed(1) + '%',
      比值_最高次高: secondScore > 0 ? (firstScore / secondScore).toFixed(2) : '无次高',
      比值_最高平均: (firstScore / avgScore).toFixed(2)
    })

    // 策略1: 绝对主导 (>33.3%)
    if (firstScore > 1/3) {
      console.log('[SnapshotManager] ✅ 满足绝对主导 (>33.3%)')
      return { topic: firstTopic, score: firstScore, level: 'absolute' }
    }

    // 策略2: 相对主导 (最高比第二高多50%以上，且>20%)
    if (firstScore > 0.2 && firstScore / secondScore >= 1.5) {
      console.log('[SnapshotManager] ✅ 满足相对主导 (>20% 且比次高多50%+)')
      return { topic: firstTopic, score: firstScore, level: 'relative' }
    }

    // 策略3: 显著领先 (>25%，且比平均值高2倍以上)
    if (firstScore > 0.25 && firstScore / avgScore >= 2.0) {
      console.log('[SnapshotManager] ✅ 满足显著领先 (>25% 且比平均高2倍+)')
      return { topic: firstTopic, score: firstScore, level: 'leading' }
    }

    console.log('[SnapshotManager] ❌ 未满足任何主导条件', {
      绝对主导: `${(firstScore * 100).toFixed(1)}% (需要 >33.3%)`,
      相对主导: `${(firstScore * 100).toFixed(1)}% 且 ${secondScore > 0 ? (firstScore / secondScore).toFixed(2) : 'N/A'}x (需要 >20% 且 ≥1.5x)`,
      显著领先: `${(firstScore * 100).toFixed(1)}% 且 ${(firstScore / avgScore).toFixed(2)}x (需要 >25% 且 ≥2.0x)`
    })

    return null
  }

  /**
   * 获取兴趣变化历史摘要
   * 
   * @param limit - 返回最近N次变化（默认5次）
   * @returns 兴趣变化历史
   * @deprecated 使用 getEvolutionHistory 替代，可以展示完整演化历程
   */
  static async getChangeHistory(limit: number = 5): Promise<{
    changes: Array<{
      timestamp: number
      from: string
      to: string
      description: string
      basedOnPages: number
    }>
    totalSnapshots: number
  }> {
    try {
      const allSnapshots = await getInterestHistory(50)
      const totalSnapshots = allSnapshots.length

      // 只处理主导兴趣变化的快照
      const changeSnapshots = allSnapshots.filter(s => 
        s.trigger === 'primary_change' || 
        (s.trigger === 'manual' && s.changeNote?.includes('首次建立'))
      )

      const changes: Array<{
        timestamp: number
        from: string
        to: string
        description: string
        basedOnPages: number
      }> = []

      for (let i = 0; i < Math.min(changeSnapshots.length, limit); i++) {
        const current = changeSnapshots[i]
        const previous = changeSnapshots[i + 1] // 上一个快照（时间更早）

        const fromTopic = previous?.primaryTopic || '无'
        const toTopic = current.primaryTopic
        const fromName = previous ? (TOPIC_NAMES[fromTopic as Topic] || fromTopic) : '无'
        const toName = TOPIC_NAMES[toTopic as Topic] || toTopic

        changes.push({
          timestamp: current.timestamp,
          from: fromName,
          to: toName,
          description: current.changeNote || `${fromName} → ${toName}`,
          basedOnPages: current.basedOnPages
        })
      }

      return {
        changes,
        totalSnapshots
      }
    } catch (error) {
      console.error('[SnapshotManager] ❌ 获取变化历史失败:', error)
      return {
        changes: [],
        totalSnapshots: 0
      }
    }
  }

  /**
   * 获取完整的兴趣演化历程
   * 
   * 展示所有快照，包括兴趣未变化但强度变化的情况
   * 
   * @param limit - 返回最近N个快照（默认10个）
   * @returns 完整的演化历程
   */
  static async getEvolutionHistory(limit: number = 10): Promise<{
    snapshots: Array<{
      id: string
      timestamp: number
      topic: string
      topicName: string
      score: number
      level: 'absolute' | 'relative' | 'leading'
      basedOnPages: number
      description: string
      isTopicChange: boolean    // 主导兴趣是否变化
      isLevelChange: boolean    // 主导程度是否变化
      changeDetails?: string    // 变化详情
    }>
    totalSnapshots: number
  }> {
    try {
      const allSnapshots = await getInterestHistory(limit + 1)  // 多取一个用于对比
      const totalSnapshots = allSnapshots.length

      if (allSnapshots.length === 0) {
        return { snapshots: [], totalSnapshots: 0 }
      }

      const snapshots = allSnapshots.slice(0, limit).map((current, index) => {
        const previous = allSnapshots[index + 1] // 上一个快照（时间更早）
        const topicName = TOPIC_NAMES[current.primaryTopic as Topic] || current.primaryTopic
        
        // 判断是否发生变化
        const isTopicChange = previous ? current.primaryTopic !== previous.primaryTopic : true
        const isLevelChange = previous ? current.primaryLevel !== previous.primaryLevel : false
        
        // 生成描述
        let description = ''
        let changeDetails = ''
        
        if (index === allSnapshots.length - 1 || !previous) {
          // 首个快照
          description = `首次建立兴趣画像：${topicName}`
        } else if (isTopicChange) {
          // 主导兴趣变化
          const previousTopicName = TOPIC_NAMES[previous.primaryTopic as Topic] || previous.primaryTopic
          description = `主导兴趣变化：${previousTopicName} → ${topicName}`
          changeDetails = this.getLevelDescription(current.primaryLevel, current.primaryScore)
        } else if (isLevelChange) {
          // 主导程度变化
          const levelChangeText = this.getLevelChangeText(previous.primaryLevel, current.primaryLevel)
          description = `${topicName}兴趣强度变化：${levelChangeText}`
          changeDetails = this.getLevelDescription(current.primaryLevel, current.primaryScore)
        } else {
          // 兴趣保持稳定
          description = `${topicName}兴趣保持稳定`
          changeDetails = this.getLevelDescription(current.primaryLevel, current.primaryScore)
        }

        return {
          id: current.id,
          timestamp: current.timestamp,
          topic: current.primaryTopic,
          topicName,
          score: current.primaryScore,
          level: current.primaryLevel,
          basedOnPages: current.basedOnPages,
          description,
          isTopicChange,
          isLevelChange,
          changeDetails,
          // Phase 8.2: 添加 AI 摘要和统计数据
          aiSummary: current.aiSummary,
          stats: current.stats,
          trigger: current.trigger,
          changeNote: current.changeNote
        }
      })

      return {
        snapshots,
        totalSnapshots
      }
    } catch (error) {
      console.error('[SnapshotManager] ❌ 获取演化历程失败:', error)
      return {
        snapshots: [],
        totalSnapshots: 0
      }
    }
  }

  /**
   * 获取主导程度的描述文本
   */
  private static getLevelDescription(level: 'absolute' | 'relative' | 'leading', score: number): string {
    const percentage = Math.round(score * 100)
    switch (level) {
      case 'absolute':
        return `绝对主导 (${percentage}%)`
      case 'relative':
        return `相对主导 (${percentage}%)`
      case 'leading':
        return `领先主导 (${percentage}%)`
    }
  }

  /**
   * 获取主导程度变化的描述
   */
  private static getLevelChangeText(
    oldLevel: 'absolute' | 'relative' | 'leading',
    newLevel: 'absolute' | 'relative' | 'leading'
  ): string {
    const levelNames = {
      absolute: '绝对主导',
      relative: '相对主导',
      leading: '领先主导'
    }
    return `${levelNames[oldLevel]} → ${levelNames[newLevel]}`
  }

  /**
   * 定期清理旧快照
   * 
   * 保留最近6个月的数据，但确保至少保留最近10个变化快照
   */
  static async cleanupOldSnapshots(): Promise<void> {
    try {
      // 获取所有快照
      const allSnapshots = await getInterestHistory(1000)
      
      if (allSnapshots.length <= 10) {
        console.log('[SnapshotManager] 快照数量较少，跳过清理')
        return
      }

      // 保留策略：
      // 1. 最近6个月的所有快照
      // 2. 最近10个主导兴趣变化快照
      const sixMonthsAgo = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000
      const recentSnapshots = allSnapshots.filter(s => s.timestamp > sixMonthsAgo)
      
      const importantChanges = allSnapshots
        .filter(s => s.trigger === 'primary_change')
        .slice(0, 10) // 最近10个变化

      // 合并需要保留的快照ID
      const keepIds = new Set([
        ...recentSnapshots.map(s => s.id),
        ...importantChanges.map(s => s.id)
      ])

      // 删除其他快照
      const toDelete = allSnapshots.filter(s => !keepIds.has(s.id))
      
      if (toDelete.length > 0) {
        // 这里应该调用数据库删除操作
        // 但目前db.ts还没有删除特定快照的方法，先记录日志
        console.log(`[SnapshotManager] 需要清理 ${toDelete.length} 个旧快照`)
      }
    } catch (error) {
      console.error('[SnapshotManager] ❌ 清理旧快照失败:', error)
    }
  }
  
  /**
   * Phase 8.2: 计算两个文本的语义相似度
   * 
   * 使用简单的 Jaccard 相似度（词袋模型）
   * 适用于短文本（如 AI 兴趣摘要）
   * 
   * @param text1 - 第一个文本
   * @param text2 - 第二个文本
   * @returns 相似度 (0-1)
   */
  private static calculateSemanticSimilarity(text1: string, text2: string): number {
    // 分词：提取中英文词汇
    const tokenize = (text: string): Set<string> => {
      const words = new Set<string>()
      
      // 中文词（2-4个字）
      const chineseWords = text.match(/[\u4e00-\u9fa5]{2,4}/g) || []
      chineseWords.forEach(w => words.add(w))
      
      // 英文词（2+字母）
      const englishWords = text.toLowerCase().match(/[a-z]{2,}/g) || []
      englishWords.forEach(w => words.add(w))
      
      return words
    }
    
    const set1 = tokenize(text1)
    const set2 = tokenize(text2)
    
    // Jaccard 相似度 = |交集| / |并集|
    const intersection = new Set([...set1].filter(x => set2.has(x)))
    const union = new Set([...set1, ...set2])
    
    const similarity = union.size > 0 ? intersection.size / union.size : 0
    
    console.log('[SnapshotManager] 🔍 相似度计算详情', {
      文本1词数: set1.size,
      文本2词数: set2.size,
      交集词数: intersection.size,
      并集词数: union.size,
      相似度: (similarity * 100).toFixed(1) + '%'
    })
    
    return similarity
  }
}