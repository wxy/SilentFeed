/**
 * 历史数据迁移和分析工具
 *
 * 用于分析历史访问记录，为没有分析结果的页面补充数据
 */

import { db } from "@/storage/db"
import { contentExtractor } from "@/core/extractor"
import { textAnalyzer } from "@/core/analyzer"
import { topicClassifier } from "@/core/profile/TopicClassifier"
import { profileManager } from "@/core/profile/ProfileManager"
import { logger } from "@/utils/logger"
import type { ConfirmedVisit, AnalysisResult } from "@/types/database"

// 创建带标签的 logger
const migratorLogger = logger.withTag('DataMigrator')

/**
 * 历史数据迁移器
 */
export class DataMigrator {
  /**
   * 分析历史页面记录
   * 
   * 为没有分析结果的历史页面补充分析数据
   */
  async analyzeHistoricalPages(batchSize: number = 50): Promise<{
    total: number
    analyzed: number
    failed: number
    updated: number
  }> {
    migratorLogger.info('开始分析历史页面...')

    try {
      // 获取所有确认的访问记录
      const visits = await db.confirmedVisits.orderBy('visitTime').toArray()
      
      migratorLogger.info(`找到 ${visits.length} 条历史记录`)

      // 找出需要分析的记录（更严格的条件检查）
      const needAnalysis = visits.filter(visit => {
        if (!visit.analysis) return true
        if (!visit.analysis.keywords) return true
        if (!Array.isArray(visit.analysis.keywords)) return true
        if (visit.analysis.keywords.length === 0) return true
        if (!visit.analysis.language) return true
        return false
      })

      migratorLogger.info(`其中 ${needAnalysis.length} 条需要分析`)

      if (needAnalysis.length === 0) {
        return { total: visits.length, analyzed: 0, failed: 0, updated: 0 }
      }

      let analyzed = 0
      let failed = 0
      let updated = 0

      // 分批处理
      for (let i = 0; i < needAnalysis.length; i += batchSize) {
        const batch = needAnalysis.slice(i, i + batchSize)
        migratorLogger.info(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(needAnalysis.length / batchSize)}`)

        // ✅ 优化：收集批量更新，而不是逐条更新
        const updates: Array<{ key: string; changes: Partial<ConfirmedVisit> }> = []

        for (const visit of batch) {
          try {
            // 尝试重新访问页面进行分析（如果内容还存在的话）
            const analysis = await this.analyzeVisitFromStoredContent(visit)
            
            if (analysis) {
              updates.push({
                key: visit.id,
                changes: {
                  analysis: {
                    keywords: analysis.keywords || [],
                    topics: analysis.topics || [],
                    language: analysis.language || 'other'
                  }
                }
              })
              updated++
              migratorLogger.debug(`更新记录: ${visit.title} (${analysis.keywords?.length || 0} 关键词)`)
            } else {
              // 如果分析失败，至少设置一个空的有效分析结果
              updates.push({
                key: visit.id,
                changes: {
                  analysis: {
                    keywords: [],
                    topics: [],
                    language: 'other'
                  }
                }
              })
              migratorLogger.debug(`设置空分析结果: ${visit.title}`)
            }
            
            analyzed++
          } catch (error) {
            migratorLogger.error(`分析失败: ${visit.title}`, error)
            failed++
          }
        }

        // ✅ 批量更新数据库
        if (updates.length > 0) {
          // 使用 Promise.all 并行执行所有更新（性能优化）
          await Promise.all(
            updates.map(({ key, changes }) => 
              db.confirmedVisits.update(key, changes)
            )
          )
          migratorLogger.info(`批量更新完成: ${updates.length} 条记录`)
        }

        // 避免阻塞，每批次之间稍作延迟
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      migratorLogger.info(`历史页面分析完成: ${analyzed}/${needAnalysis.length} 条记录已处理`)

      return {
        total: visits.length,
        analyzed,
        failed,
        updated
      }
    } catch (error) {
      migratorLogger.error('历史页面分析失败:', error)
      throw error
    }
  }

  /**
   * 从存储的内容分析访问记录
   */
  private async analyzeVisitFromStoredContent(visit: ConfirmedVisit): Promise<AnalysisResult | null> {
    try {
      // 尝试从存储的内容摘要中分析
      let textToAnalyze = ''
      
      if (visit.contentSummary) {
        textToAnalyze = [
          visit.title || '',
          visit.contentSummary.extractedText || '',
          visit.contentSummary.firstParagraph || ''
        ].filter(Boolean).join(' ')
      } else {
        // 如果没有存储内容，只用标题
        textToAnalyze = visit.title || ''
      }

      if (!textToAnalyze.trim()) {
        migratorLogger.debug(`跳过空内容: ${visit.title}`)
        return null
      }

      // 提取关键词
      const keywordResults = textAnalyzer.extractKeywords(textToAnalyze, { topK: 20 })
      const keywords = keywordResults.map(kw => kw.word)

      // 检测语言
      const language = textAnalyzer.detectLanguage(textToAnalyze)

      // 主题分类
      const topicDistribution = topicClassifier.classify(keywordResults)
      const topics = Object.entries(topicDistribution)
        .filter(([topic, score]) => score > 0.1) // 只保留相关性 > 10% 的主题
        .map(([topic]) => topic)

      return {
        keywords,
        topics,
        language
      }
    } catch (error) {
      migratorLogger.error(`分析内容失败: ${visit.title}`, error)
      return null
    }
  }

  /**
   * 重建用户画像（基于所有可用数据）
   */
  async rebuildUserProfile(): Promise<void> {
    migratorLogger.info('重建用户画像...')
    
    try {
      // 使用 ProfileManager 重建画像
      await profileManager.rebuildProfile()
      migratorLogger.info('用户画像重建完成')
    } catch (error) {
      migratorLogger.error('重建用户画像失败:', error)
      throw error
    }
  }

  /**
   * 清理无效的分析记录
   * 删除关键词数组为空或无效的记录
   */
  async cleanInvalidRecords(): Promise<{
    total: number
    cleaned: number
    remaining: number
  }> {
    migratorLogger.info('开始清理无效记录...')
    
    try {
      const visits = await db.confirmedVisits.toArray()
      
      // 找到无效记录（关键词数组为空的记录）
      const invalidVisits = visits.filter(visit => {
        if (!visit.analysis) return false
        if (!visit.analysis.keywords) return true
        if (!Array.isArray(visit.analysis.keywords)) return true
        if (visit.analysis.keywords.length === 0) return true
        return false
      })

      migratorLogger.info(`找到 ${invalidVisits.length} 条无效记录`)

      // 删除无效记录
      if (invalidVisits.length > 0) {
        const deleteIds = invalidVisits.map(visit => visit.id)
        await db.confirmedVisits.bulkDelete(deleteIds)
        
        migratorLogger.info(`已删除 ${invalidVisits.length} 条无效记录:`)
        invalidVisits.forEach(visit => {
          migratorLogger.debug(`  - ${visit.title} (${visit.url})`)
        })

        // 重建用户画像
        await this.rebuildUserProfile()
      }

      const remaining = visits.length - invalidVisits.length

      return {
        total: visits.length,
        cleaned: invalidVisits.length,
        remaining
      }
    } catch (error) {
      migratorLogger.error('清理无效记录失败:', error)
      throw error
    }
  }

  /**
   * 获取迁移统计信息
   */
  async getMigrationStats(): Promise<{
    totalVisits: number
    visitesWithAnalysis: number
    visitesWithoutAnalysis: number
    analysisCompleteness: number
  }> {
    const visits = await db.confirmedVisits.toArray()
    
    // 使用相同的条件判断
    const withAnalysis = visits.filter(visit => {
      if (!visit.analysis) return false
      if (!visit.analysis.keywords) return false
      if (!Array.isArray(visit.analysis.keywords)) return false
      if (visit.analysis.keywords.length === 0) return false
      if (!visit.analysis.language) return false
      return true
    })

    const withoutAnalysis = visits.length - withAnalysis.length
    const completeness = visits.length > 0 ? (withAnalysis.length / visits.length) * 100 : 0

    return {
      totalVisits: visits.length,
      visitesWithAnalysis: withAnalysis.length,
      visitesWithoutAnalysis: withoutAnalysis,
      analysisCompleteness: Math.round(completeness)
    }
  }
}

/**
 * 默认导出实例
 */
export const dataMigrator = new DataMigrator()