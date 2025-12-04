/**
 * 数据库迁移工具
 * 
 * Phase 10: 文章持久化重构 - 数据迁移
 */

import { db } from './index'
import { logger } from '@/utils/logger'

const migrationLogger = logger.withTag('DB-Migration')

/**
 * Phase 10: 从 recommendations 表同步状态到 feedArticles
 * 
 * 目的：确保 feedArticles 表的状态字段（inPool, read, disliked）
 * 与 recommendations 表一致
 * 
 * 执行时机：
 * - 数据库升级到 v16 后首次运行
 * - 或手动触发（用于修复数据不一致）
 */
export async function migrateRecommendationStatus(): Promise<{
  success: boolean
  processed: number
  synced: number
  errors: number
}> {
  const stats = {
    success: true,
    processed: 0,
    synced: 0,
    errors: 0
  }
  
  try {
    migrationLogger.info('开始同步 recommendations → feedArticles 状态...')
    
    // 1. 获取所有推荐记录
    const recommendations = await db.recommendations.toArray()
    migrationLogger.info(`找到 ${recommendations.length} 条推荐记录`)
    
    // 2. 按 URL 分组（一篇文章可能有多次推荐）
    const urlMap = new Map<string, typeof recommendations>()
    for (const rec of recommendations) {
      if (!urlMap.has(rec.url)) {
        urlMap.set(rec.url, [])
      }
      urlMap.get(rec.url)!.push(rec)
    }
    
    migrationLogger.info(`涉及 ${urlMap.size} 篇不同的文章`)
    
    // 3. 逐篇文章同步状态
    for (const [url, recs] of urlMap.entries()) {
      stats.processed++
      
      try {
        // 查找对应的文章
        const articles = await db.feedArticles
          .where('link')
          .equals(url)
          .toArray()
        
        if (articles.length === 0) {
          // 文章不存在（可能是跨 Feed 的文章或已被删除）
          // 这是正常情况，不记录日志避免干扰
          continue
        }
        
        // 分析推荐状态（可能有多次推荐）
        const hasActiveRec = recs.some(r => r.status === 'active')
        const hasReadRec = recs.some(r => r.isRead === true)
        const hasDismissedRec = recs.some(r => 
          r.feedback === 'dismissed' || r.status === 'dismissed'
        )
        
        // 取最新的推荐记录
        const latestRec = recs.sort((a, b) => 
          (b.recommendedAt || 0) - (a.recommendedAt || 0)
        )[0]
        
        // 为每篇文章更新状态
        for (const article of articles) {
          const updates: any = {}
          
          // recommended: 只要有过推荐就设为 true
          if (!article.recommended && recs.length > 0) {
            updates.recommended = true
          }
          
          // inPool: 有活跃推荐 = 在池中
          if (article.inPool === undefined || article.inPool === false) {
            updates.inPool = hasActiveRec
            if (hasActiveRec) {
              updates.poolAddedAt = latestRec.recommendedAt || Date.now()
            }
          }
          
          // read: 任何一次推荐被阅读 = 已读
          if (!article.read && hasReadRec) {
            updates.read = true
            if (latestRec.clickedAt) {
              updates.poolRemovedAt = latestRec.clickedAt
              updates.poolRemovedReason = 'read'
            }
          }
          
          // disliked: 任何一次推荐被拒绝 = 不想读
          if (!article.disliked && hasDismissedRec) {
            updates.disliked = true
            const dismissedRec = recs.find(r => 
              r.feedback === 'dismissed' || r.status === 'dismissed'
            )
            if (dismissedRec?.feedbackAt) {
              updates.poolRemovedAt = dismissedRec.feedbackAt
              updates.poolRemovedReason = 'disliked'
            }
          }
          
          // 应用更新
          if (Object.keys(updates).length > 0) {
            await db.feedArticles.update(article.id, updates)
            stats.synced++
            
            migrationLogger.debug(`已同步文章状态: ${article.title}`, {
              updates,
              articleId: article.id
            })
          }
        }
      } catch (error) {
        stats.errors++
        migrationLogger.error(`同步文章失败: ${url}`, error)
      }
    }
    
    migrationLogger.info('✅ 状态同步完成', {
      processed: stats.processed,
      synced: stats.synced,
      errors: stats.errors
    })
    
    return stats
    
  } catch (error) {
    migrationLogger.error('❌ 状态同步失败:', error)
    stats.success = false
    return stats
  }
}

/**
 * Phase 10: 计算文章重要性评分
 * 
 * 根据文章的用户交互历史计算重要性评分（0-100）
 * 用于后续的数据清理决策
 */
export async function calculateArticleImportance(): Promise<{
  success: boolean
  processed: number
  errors: number
}> {
  const stats = {
    success: true,
    processed: 0,
    errors: 0
  }
  
  try {
    migrationLogger.info('开始计算文章重要性评分...')
    
    const articles = await db.feedArticles.toArray()
    migrationLogger.info(`需要处理 ${articles.length} 篇文章`)
    
    for (const article of articles) {
      stats.processed++
      
      try {
        let score = 0
        
        // 基础评分
        if (article.recommended) score += 30      // 被推荐过
        if (article.read) score += 20             // 被阅读过
        if (article.starred) score += 50          // 被收藏
        if (article.disliked) score -= 10         // 被拒绝（负分）
        
        // 查找对应的推荐记录（获取更多指标）
        // Phase 10: url 字段没有索引，使用 filter 替代
        const recs = await db.recommendations
          .filter(rec => rec.url === article.link)
          .toArray()
        
        for (const rec of recs) {
          // 深度阅读
          if (rec.readDuration && rec.readDuration > 180) {
            score += 20
          }
          
          // 高效推荐
          if (rec.effectiveness === 'effective') {
            score += 10
          } else if (rec.effectiveness === 'ineffective') {
            score -= 5
          }
          
          // 高分推荐
          if (rec.score && rec.score > 0.8) {
            score += 5
          }
        }
        
        // 时效性加分（最近的文章更重要）
        const ageInDays = (Date.now() - article.published) / (1000 * 60 * 60 * 24)
        if (ageInDays < 7) {
          score += 10
        } else if (ageInDays < 30) {
          score += 5
        }
        
        // 限制在 0-100 范围内
        const finalScore = Math.max(0, Math.min(100, score))
        
        // 更新评分
        if (article.importance !== finalScore) {
          await db.feedArticles.update(article.id, {
            importance: finalScore
          })
        }
        
      } catch (error) {
        stats.errors++
        migrationLogger.error(`计算评分失败: ${article.id}`, error)
      }
    }
    
    migrationLogger.info('✅ 重要性评分计算完成', {
      processed: stats.processed,
      errors: stats.errors
    })
    
    return stats
    
  } catch (error) {
    migrationLogger.error('❌ 重要性评分计算失败:', error)
    stats.success = false
    return stats
  }
}

/**
 * Phase 10: 执行完整迁移
 * 
 * 包含所有迁移步骤，按顺序执行
 */
export async function runFullMigration(): Promise<boolean> {
  try {
    migrationLogger.info('🚀 开始 Phase 10 完整数据迁移...')
    
    // 步骤 1: 同步推荐状态
    migrationLogger.info('步骤 1/2: 同步推荐状态 (recommendations → feedArticles)...')
    const syncResult = await migrateRecommendationStatus()
    if (!syncResult.success) {
      throw new Error('推荐状态同步失败')
    }
    migrationLogger.info(`✅ 步骤 1/2 完成: 处理 ${syncResult.processed} 篇文章，同步 ${syncResult.synced} 条推荐状态`)
    
    // 步骤 2: 计算重要性评分
    migrationLogger.info('步骤 2/2: 计算文章重要性评分...')
    const importanceResult = await calculateArticleImportance()
    if (!importanceResult.success) {
      throw new Error('重要性评分计算失败')
    }
    migrationLogger.info(`✅ 步骤 2/2 完成: 计算 ${importanceResult.processed} 篇文章的重要性评分`)
    
    // 步骤 3: 标记迁移完成
    await db.settings.update('singleton', { 
      migrations: { phase10Completed: true } 
    })
    migrationLogger.info('✅ 已设置迁移完成标记')
    
    migrationLogger.info('✅ Phase 10 数据迁移全部完成')
    return true
    
  } catch (error) {
    migrationLogger.error('❌ Phase 10 数据迁移失败:', error)
    return false
  }
}

/**
 * 检查是否需要运行迁移
 * 
 * 通过检查特定标记来判断迁移是否已执行
 */
/**
 * 检查是否需要运行 Phase 10 迁移
 * 
 * Phase 10: 使用 settings 表记录迁移状态，避免每次启动都运行
 */
export async function needsMigration(): Promise<boolean> {
  try {
    // 1. 检查迁移标记
    const settings = await db.settings.get('singleton')
    if (settings?.migrations?.phase10Completed === true) {
      migrationLogger.debug('Phase 10 迁移已完成，跳过')
      return false
    }
    
    // 2. 检查是否有文章数据
    const articleCount = await db.feedArticles.count()
    if (articleCount === 0) {
      migrationLogger.debug('无文章数据，标记迁移已完成')
      await db.settings.update('singleton', { 
        migrations: { phase10Completed: true } 
      })
      return false
    }
    
    // 3. 采样检查是否有文章缺少新字段（检查前10篇）
    const sampleArticles = await db.feedArticles.limit(10).toArray()
    const needsMigration = sampleArticles.some(article => 
      article.inFeed === undefined ||
      article.inPool === undefined ||
      article.deleted === undefined
    )
    
    if (needsMigration) {
      migrationLogger.info('检测到需要数据迁移（缺少 Phase 10 新字段）')
    } else {
      migrationLogger.debug('数据已是最新版本，标记迁移已完成')
      await db.settings.update('singleton', { 
        migrations: { phase10Completed: true } 
      })
    }
    
    return needsMigration
  } catch (error) {
    migrationLogger.error('检查迁移需求失败:', error)
    return false
  }
}
