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
      // 计算当前主导兴趣
      const currentPrimary = this.calculatePrimaryTopic(newProfile.topics)
      
      if (!currentPrimary) {
        return
      }

      // 获取最近的快照历史
      const recentSnapshots = await getInterestHistory(5)
      const lastSnapshot = recentSnapshots[0]

      // 检查是否需要创建快照
      let shouldCreateSnapshot = false
      let changeNote: string | undefined = undefined

      if (!lastSnapshot) {
        // 首次创建快照
        shouldCreateSnapshot = true
        changeNote = `首次建立兴趣画像：${TOPIC_NAMES[currentPrimary.topic as Topic]}`
      } else if (lastSnapshot.primaryTopic !== currentPrimary.topic) {
        // 主导兴趣发生变化
        shouldCreateSnapshot = true
        const oldTopicName = TOPIC_NAMES[lastSnapshot.primaryTopic as Topic] || lastSnapshot.primaryTopic
        const newTopicName = TOPIC_NAMES[currentPrimary.topic as Topic] || currentPrimary.topic
        changeNote = `主导兴趣变化：${oldTopicName} → ${newTopicName}`
        trigger = 'primary_change'
      } else if (trigger === 'rebuild') {
        // 强制重建时也创建快照
        shouldCreateSnapshot = true
        changeNote = '用户主动重建画像'
        
        // Phase 8.2: 检查是否从关键词画像升级到 AI 画像
        if (!lastSnapshot.aiSummary && newProfile.aiSummary) {
          changeNote = '升级到 AI 语义画像'
          trigger = 'ai_change'
        }
      } else if (newProfile.aiSummary && lastSnapshot.aiSummary) {
        // Phase 8.2: 检查 AI 画像是否显著变化（两者都有 AI 时）
        const similarity = this.calculateSemanticSimilarity(
          lastSnapshot.aiSummary.interests,
          newProfile.aiSummary.interests
        )
        
        if (similarity < 0.7) {
          shouldCreateSnapshot = true
          changeNote = `AI 画像发生显著变化（相似度 ${(similarity * 100).toFixed(0)}%）`
          trigger = 'ai_change'
        }
      } else if (!lastSnapshot.aiSummary && newProfile.aiSummary) {
        // Phase 8.2: 首次生成 AI 画像（非重建触发）
        shouldCreateSnapshot = true
        changeNote = '首次生成 AI 语义画像'
        trigger = 'ai_change'
      }

      if (shouldCreateSnapshot) {
        await this.createSnapshot(newProfile, currentPrimary, trigger, changeNote)
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
    }
    
    // Phase 8.2: 包含行为统计（如果有）
    if (profile.behaviors) {
      snapshot.stats = {
        totalBrowses: profile.totalPages,
        totalReads: profile.behaviors.totalReads || 0,
        totalDismisses: profile.behaviors.totalDismisses || 0
      }
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

    if (validEntries.length === 0) {
      return null
    }

    const [firstTopic, firstScore] = validEntries[0]
    const [, secondScore = 0] = validEntries[1] || []
    
    // 计算平均分（不包括OTHER）
    const totalScore = validEntries.reduce((sum, [, score]) => sum + score, 0)
    const avgScore = totalScore / validEntries.length

    // 策略1: 绝对主导 (>33.3%)
    if (firstScore > 1/3) {
      return { topic: firstTopic, score: firstScore, level: 'absolute' }
    }

    // 策略2: 相对主导 (最高比第二高多50%以上，且>20%)
    if (firstScore > 0.2 && firstScore / secondScore >= 1.5) {
      return { topic: firstTopic, score: firstScore, level: 'relative' }
    }

    // 策略3: 显著领先 (>25%，且比平均值高2倍以上)
    if (firstScore > 0.25 && firstScore / avgScore >= 2.0) {
      return { topic: firstTopic, score: firstScore, level: 'leading' }
    }

    return null
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
    
    
    return similarity
  }
}