/**
 * 数据库迁移工具
 * 
 * Phase 10: 文章持久化重构 - 数据迁移
 * Phase 13: 多池架构迁移 - poolStatus 字段统一
 */

import { db } from './index'
import { logger } from '@/utils/logger'

const migrationLogger = logger.withTag('DB-Migration')

// 推荐阈值（与 pipeline.ts 保持一致）
const RECOMMENDATION_THRESHOLD = 6.5

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

/**
 * Phase 13: 迁移旧字段到新的 poolStatus 系统
 * 
 * 将旧的 recommended/inPool/poolRemovedReason 字段
 * 迁移到新的 poolStatus/poolExitedAt/poolExitReason 系统
 * 
 * 迁移规则：
 * 1. recommended=true && inPool=true → poolStatus='recommended'
 * 2. recommended=true && inPool=false 且 recommendations 表 feedback='later' → poolExitReason='saved'
 * 3. recommended=true && inPool=false 且 recommendations 表 status='replaced' → poolExitReason='replaced'
 * 4. recommended=true && inPool=false 且 recommendations 表 status='expired' → poolExitReason='expired'
 * 5. recommended=true && read=true → poolExitReason='read'
 * 6. recommended=true && disliked=true → poolExitReason='disliked'
 * 7. 有 analysis 且 analysisScore >= 6.5 且无 poolStatus → poolStatus='candidate'
 * 8. 有 analysis 且 analysisScore < 6.5 且无 poolStatus → poolStatus='analyzed-not-qualified'
 * 9. 无 analysis 且无 poolStatus → poolStatus='raw'（如果 inFeed=true）
 */
export async function migrateToPoolStatus(): Promise<{
  success: boolean
  total: number
  migrated: {
    toRecommended: number
    toCandidate: number
    toAnalyzedNotQualified: number
    toRaw: number
    toExited: number
  }
  errors: number
}> {
  const stats = {
    success: true,
    total: 0,
    migrated: {
      toRecommended: 0,
      toCandidate: 0,
      toAnalyzedNotQualified: 0,
      toRaw: 0,
      toExited: 0
    },
    errors: 0
  }
  
  try {
    migrationLogger.info('🚀 开始 Phase 13 poolStatus 迁移...')
    
    // 预先获取 recommendations 表中的各类状态记录
    const allRecommendations = await db.recommendations.toArray()
    
    // 按 URL 分组建立查找表
    const laterUrlSet = new Set<string>()
    const replacedUrlSet = new Set<string>()
    const expiredUrlSet = new Set<string>()
    const laterRecMap = new Map<string, typeof allRecommendations[0]>()
    const replacedRecMap = new Map<string, typeof allRecommendations[0]>()
    const expiredRecMap = new Map<string, typeof allRecommendations[0]>()
    
    for (const rec of allRecommendations) {
      if (rec.feedback === 'later') {
        laterUrlSet.add(rec.url)
        laterRecMap.set(rec.url, rec)
      }
      if (rec.status === 'replaced') {
        replacedUrlSet.add(rec.url)
        replacedRecMap.set(rec.url, rec)
      }
      if (rec.status === 'expired') {
        expiredUrlSet.add(rec.url)
        expiredRecMap.set(rec.url, rec)
      }
    }
    
    migrationLogger.info(`发现状态记录: ${laterUrlSet.size} 条"稀后读", ${replacedUrlSet.size} 条"被替换", ${expiredUrlSet.size} 条"已过期"`)
    
    // 获取所有文章
    const articles = await db.feedArticles.toArray()
    stats.total = articles.length
    migrationLogger.info(`需要检查 ${articles.length} 篇文章`)
    
    const now = Date.now()
    
    for (const article of articles) {
      try {
        // 如果已有 poolStatus，跳过
        if (article.poolStatus) {
          continue
        }
        
        const updates: any = {}
        
        // 规则 1: recommended=true && inPool=true → poolStatus='recommended'
        if (article.recommended === true && article.inPool === true) {
          updates.poolStatus = 'recommended'
          updates.recommendedPoolAddedAt = article.poolAddedAt || now
          stats.migrated.toRecommended++
          migrationLogger.debug(`迁移到推荐池: ${article.title}`)
        }
        // 规则 2, 3, 4, 5: 已退出的文章
        else if (article.recommended === true && article.inPool === false) {
          // 优先检查"稀后读"（来自 recommendations 表）
          if (laterUrlSet.has(article.link)) {
            const laterRec = laterRecMap.get(article.link)
            updates.poolExitReason = 'saved'
            updates.poolExitedAt = laterRec?.feedbackAt || article.poolRemovedAt || now
            stats.migrated.toExited++
            migrationLogger.debug(`迁移到已退出(稀后读): ${article.title}`)
          }
          // 检查"被替换"（来自 recommendations 表的 status='replaced'）
          else if (replacedUrlSet.has(article.link)) {
            const replacedRec = replacedRecMap.get(article.link)
            updates.poolExitReason = 'replaced'
            updates.poolExitedAt = replacedRec?.replacedAt || article.poolRemovedAt || now
            stats.migrated.toExited++
            migrationLogger.debug(`迁移到已退出(被替换): ${article.title}`)
          }
          // 检查"已过期"（来自 recommendations 表的 status='expired'）
          else if (expiredUrlSet.has(article.link)) {
            const expiredRec = expiredRecMap.get(article.link)
            updates.poolExitReason = 'expired'
            updates.poolExitedAt = expiredRec?.replacedAt || article.poolRemovedAt || now
            stats.migrated.toExited++
            migrationLogger.debug(`迁移到已退出(已过期): ${article.title}`)
          }
          // 已阅读
          else if (article.read === true) {
            updates.poolExitReason = 'read'
            updates.poolExitedAt = article.poolRemovedAt || now
            stats.migrated.toExited++
            migrationLogger.debug(`迁移到已退出(已读): ${article.title}`)
          }
          // 不想读
          else if (article.disliked === true) {
            updates.poolExitReason = 'disliked'
            updates.poolExitedAt = article.poolRemovedAt || now
            stats.migrated.toExited++
            migrationLogger.debug(`迁移到已退出(不想读): ${article.title}`)
          }
          // 使用旧的退出原因
          else if (article.poolRemovedReason) {
            updates.poolExitReason = article.poolRemovedReason
            updates.poolExitedAt = article.poolRemovedAt || now
            stats.migrated.toExited++
            migrationLogger.debug(`迁移到已退出(${article.poolRemovedReason}): ${article.title}`)
          }
        }
        // 规则 5 & 6: 有 analysis 的文章
        else if (article.analysis) {
          const score = article.analysisScore || 0
          if (score >= RECOMMENDATION_THRESHOLD) {
            updates.poolStatus = 'candidate'
            updates.candidatePoolAddedAt = now
            stats.migrated.toCandidate++
            migrationLogger.debug(`迁移到候选池: ${article.title}, 分数: ${score}`)
          } else {
            updates.poolStatus = 'analyzed-not-qualified'
            stats.migrated.toAnalyzedNotQualified++
            migrationLogger.debug(`迁移到分析未达标: ${article.title}, 分数: ${score}`)
          }
        }
        // 规则 7: 无 analysis 且在源中 → 原始池
        else if (article.inFeed === true) {
          updates.poolStatus = 'raw'
          stats.migrated.toRaw++
          migrationLogger.debug(`迁移到原始池: ${article.title}`)
        }
        
        // 应用更新
        if (Object.keys(updates).length > 0) {
          await db.feedArticles.update(article.id, updates)
        }
        
      } catch (error) {
        stats.errors++
        migrationLogger.error(`迁移文章失败: ${article.id}`, error)
      }
    }
    
    migrationLogger.info('✅ Phase 13 poolStatus 迁移完成', {
      total: stats.total,
      migrated: stats.migrated,
      errors: stats.errors
    })
    
    return stats
    
  } catch (error) {
    migrationLogger.error('❌ Phase 13 迁移失败:', error)
    stats.success = false
    return stats
  }
}

/**
 * 检查是否需要运行 Phase 13 迁移
 */
export async function needsPhase13Migration(): Promise<boolean> {
  try {
    // 1. 检查迁移标记
    const settings = await db.settings.get('singleton')
    if (settings?.migrations?.phase13Completed === true) {
      migrationLogger.debug('Phase 13 迁移已完成，跳过')
      return false
    }
    
    // 2. 检查是否有文章数据
    const articleCount = await db.feedArticles.count()
    if (articleCount === 0) {
      migrationLogger.debug('无文章数据，标记 Phase 13 迁移已完成')
      await markPhase13Completed()
      return false
    }
    
    // 3. 采样检查是否有旧字段数据需要迁移
    // 查找 recommended=true 但无 poolStatus 的文章
    const legacyArticles = await db.feedArticles
      .filter(a => a.recommended === true && !a.poolStatus)
      .limit(5)
      .toArray()
    
    if (legacyArticles.length > 0) {
      migrationLogger.info(`检测到 ${legacyArticles.length}+ 篇旧数据需要迁移到 poolStatus`)
      return true
    }
    
    // 4. 查找有 analysis 但无 poolStatus 的文章
    const analyzedNoStatus = await db.feedArticles
      .filter(a => a.analysis !== undefined && !a.poolStatus)
      .limit(5)
      .toArray()
    
    if (analyzedNoStatus.length > 0) {
      migrationLogger.info(`检测到 ${analyzedNoStatus.length}+ 篇已分析文章需要设置 poolStatus`)
      return true
    }
    
    // 5. 查找 inFeed=true 但无 poolStatus 的文章
    const inFeedNoStatus = await db.feedArticles
      .filter(a => a.inFeed === true && !a.poolStatus)
      .limit(5)
      .toArray()
    
    if (inFeedNoStatus.length > 0) {
      migrationLogger.info(`检测到 ${inFeedNoStatus.length}+ 篇在源文章需要设置 poolStatus`)
      return true
    }
    
    // 全部检查通过，标记迁移完成
    migrationLogger.debug('数据已是最新版本，标记 Phase 13 迁移已完成')
    await markPhase13Completed()
    return false
    
  } catch (error) {
    migrationLogger.error('检查 Phase 13 迁移需求失败:', error)
    return false
  }
}

/**
 * 标记 Phase 13 迁移完成
 */
async function markPhase13Completed(): Promise<void> {
  const settings = await db.settings.get('singleton')
  const existingMigrations = settings?.migrations || {}
  await db.settings.update('singleton', {
    migrations: {
      ...existingMigrations,
      phase13Completed: true
    }
  })
}

/**
 * 运行 Phase 13 完整迁移
 */
export async function runPhase13Migration(): Promise<boolean> {
  try {
    migrationLogger.info('🚀 开始 Phase 13 多池架构数据迁移...')
    
    const result = await migrateToPoolStatus()
    
    if (!result.success) {
      throw new Error('poolStatus 迁移失败')
    }
    
    migrationLogger.info('✅ Phase 13 迁移统计:', {
      total: result.total,
      toRecommended: result.migrated.toRecommended,
      toCandidate: result.migrated.toCandidate,
      toAnalyzedNotQualified: result.migrated.toAnalyzedNotQualified,
      toRaw: result.migrated.toRaw,
      toExited: result.migrated.toExited,
      errors: result.errors
    })
    
    // 标记迁移完成
    await markPhase13Completed()
    migrationLogger.info('✅ Phase 13 数据迁移全部完成')
    
    return true
    
  } catch (error) {
    migrationLogger.error('❌ Phase 13 数据迁移失败:', error)
    return false
  }
}

// ================ Phase 14.3: Stale 状态迁移 ================

/**
 * 检查是否需要运行 Stale 状态迁移
 * 将 inFeed=false 且 poolStatus='raw' 的文章迁移为 'stale'
 */
export async function needsStaleMigration(): Promise<boolean> {
  try {
    // 1. 检查迁移标记
    const settings = await db.settings.get('singleton')
    if (settings?.migrations?.staleMigrationCompleted === true) {
      return false
    }
    
    // 2. 检查是否有文章数据
    const articleCount = await db.feedArticles.count()
    if (articleCount === 0) {
      await markStaleMigrationCompleted()
      return false
    }
    
    // 3. 采样检查是否有需要迁移的文章
    const staleArticles = await db.feedArticles
      .filter(a => 
        (a.poolStatus === 'raw' || !a.poolStatus) && 
        a.inFeed === false
      )
      .limit(5)
      .toArray()
    
    if (staleArticles.length > 0) {
      migrationLogger.info(`检测到 ${staleArticles.length}+ 篇已出源的 raw 文章需要迁移为 stale`)
      return true
    }
    
    // 全部检查通过，标记迁移完成
    await markStaleMigrationCompleted()
    return false
    
  } catch (error) {
    migrationLogger.error('检查 Stale 迁移需求失败:', error)
    return false
  }
}

/**
 * 标记 Stale 迁移完成
 */
async function markStaleMigrationCompleted(): Promise<void> {
  const settings = await db.settings.get('singleton')
  const existingMigrations = settings?.migrations || {}
  await db.settings.update('singleton', {
    migrations: {
      ...existingMigrations,
      staleMigrationCompleted: true
    }
  })
}

/**
 * 运行 Stale 状态迁移
 * 将 inFeed=false 且 poolStatus='raw'（或无状态）的文章改为 'stale'
 */
export async function runStaleMigration(): Promise<boolean> {
  try {
    migrationLogger.info('🔄 开始 Stale 状态迁移...')
    
    // 查找所有需要迁移的文章
    const articlesToMigrate = await db.feedArticles
      .filter(a => 
        (a.poolStatus === 'raw' || !a.poolStatus) && 
        a.inFeed === false
      )
      .toArray()
    
    migrationLogger.info(`📊 找到 ${articlesToMigrate.length} 篇需要迁移为 stale 的文章`)
    
    if (articlesToMigrate.length === 0) {
      await markStaleMigrationCompleted()
      return true
    }
    
    // 批量更新
    let migratedCount = 0
    const batchSize = 100
    
    for (let i = 0; i < articlesToMigrate.length; i += batchSize) {
      const batch = articlesToMigrate.slice(i, i + batchSize)
      
      await db.transaction('rw', db.feedArticles, async () => {
        for (const article of batch) {
          await db.feedArticles.update(article.id, {
            poolStatus: 'stale'
          })
          migratedCount++
        }
      })
      
      if (migratedCount % 500 === 0 || migratedCount === articlesToMigrate.length) {
        migrationLogger.info(`📝 Stale 迁移进度: ${migratedCount}/${articlesToMigrate.length}`)
      }
    }
    
    // 标记迁移完成
    await markStaleMigrationCompleted()
    migrationLogger.info(`✅ Stale 迁移完成！共迁移 ${migratedCount} 篇文章`)
    
    return true
    
  } catch (error) {
    migrationLogger.error('❌ Stale 迁移失败:', error)
    return false
  }
}
