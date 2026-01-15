import { ProfileUpdateScheduler } from './core/profile/ProfileUpdateScheduler'
import { semanticProfileBuilder } from './core/profile/SemanticProfileBuilder'
import { initializeDatabase, getPageCount, getUnreadRecommendations, db, markAsRead, needsPhase13Migration, runPhase13Migration, needsStaleMigration, runStaleMigration } from './storage/db'
import type { ConfirmedVisit } from '@/types/database'
import { FeedManager } from './core/rss/managers/FeedManager'
import { RSSValidator } from './core/rss/RSSValidator'
import { getSourceAnalysisService } from './core/rss/SourceAnalysisService'
import { fetchFeed } from './background/feed-scheduler'
import { 
  startAllSchedulers, 
  feedScheduler, 
  recommendationScheduler, 
  strategyReviewScheduler,
  reconfigureSchedulersForState 
} from './background/index'
import { IconManager } from './utils/IconManager'
import { evaluateAndAdjust } from './core/recommender/adaptive-count'
import { setupNotificationListeners, testNotification } from './core/recommender/notification'
import { getOnboardingState } from './storage/onboarding-state'
import { OnboardingStateService, type OnboardingStateInfo } from './core/onboarding/OnboardingStateService'
import { logger } from '@/utils/logger'
import { LEARNING_COMPLETE_PAGES } from '@/constants/progress'
import { aiManager } from './core/ai/AICapabilityManager'
import { getAIConfig, saveAIConfig, isAIConfigured } from '@/storage/ai-config'
import { getRecommendationConfig, saveRecommendationConfig } from '@/storage/recommendation-config'
import { ReadingListManager } from './core/reading-list/reading-list-manager'
import { processPageVisit, type PageVisitData } from './background/page-visit-handler'
import { migrateStorageKeys, needsStorageKeyMigration } from '@/storage/migrations/storage-key-migration'
import {
  migrateLocalStorageKeys,
  needsLocalStorageMigration,
  cleanupLegacyNotificationKeys,
  cleanupAggregatedTrackingData
} from '@/storage/migrations/local-storage-migration'
import { LOCAL_STORAGE_KEYS } from '@/storage/local-storage-keys'
import {
  consumeTabTracking,
  consumeUrlTracking,
  saveTabTracking,
  saveUrlTracking
} from '@/storage/tracking-storage'
import { syncSystemStats } from '@/storage/system-stats'
import { getStrategyDecider, collectDailyUsageContext } from './core/recommender/pool-strategy-decider'
import { getRefillManager } from './core/recommender/pool-refill-policy'
import { cleanupExpiredArticles, cleanupExpiredRecommendations } from '@/storage/transactions'

const bgLogger = logger.withTag('Background')

bgLogger.info('Silent Feed Background Service Worker 已启动')

/**
 * 检查是否正在生成池策略（使用持久化存储，防止热加载丢失状态）
 */
async function isPoolStrategyGenerating(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(LOCAL_STORAGE_KEYS.POOL_STRATEGY_GENERATING)
    return result[LOCAL_STORAGE_KEYS.POOL_STRATEGY_GENERATING] === true
  } catch {
    return false
  }
}

/**
 * 设置池策略生成状态
 */
async function setPoolStrategyGenerating(isGenerating: boolean): Promise<void> {
  try {
    if (isGenerating) {
      await chrome.storage.local.set({ [LOCAL_STORAGE_KEYS.POOL_STRATEGY_GENERATING]: true })
    } else {
      await chrome.storage.local.remove(LOCAL_STORAGE_KEYS.POOL_STRATEGY_GENERATING)
    }
  } catch (error) {
    bgLogger.error('设置池策略生成状态失败', error)
  }
}

bgLogger.info('Silent Feed Background Service Worker 已启动')

/**
 * Phase 11: 配置 Ollama 请求的 DNR 规则
 * 
 * 问题：Ollama 的本地服务因为 CORS 限制拒绝浏览器扩展的请求
 * 原因：Origin 和 Referer 头会触发 CORS 预检请求，导致 403 Forbidden
 * 
 * 解决方案：使用 declarativeNetRequest 移除 Origin 和 Referer 头
 * 注意：规则在 public/dnr-rules.json 中定义，通过 manifest.json 静态加载
 */
async function setupOllamaDNRRules(): Promise<void> {
  try {
    // 延迟检测，等待 DNR 规则完全加载
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // 检查 manifest 中的 DNR 配置
    const manifest = chrome.runtime.getManifest()
    const hasDNRConfig = manifest.declarative_net_request?.rule_resources?.some(
      (resource: { id: string }) => resource.id === 'ollama-cors-fix'
    )
    
    if (hasDNRConfig) {
      bgLogger.info('✅ Ollama CORS 修复规则已配置')
    } else {
      bgLogger.error('❌ Ollama CORS 修复规则未在 manifest 中配置')
      bgLogger.error('   请尝试：1) 重新构建扩展  2) 重新加载扩展  3) 重新安装扩展')
    }
    
    // 清理可能存在的遗留动态规则（避免冲突）
    const dynamicRules = await chrome.declarativeNetRequest.getDynamicRules()
    if (dynamicRules.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: dynamicRules.map(r => r.id)
      })
      bgLogger.info('🧹 已清理遗留的动态 DNR 规则')
    }
  } catch (error) {
    bgLogger.error('❌ 检查 Ollama DNR 规则失败:', error)
  }
}

// 检查 DNR 规则状态
setupOllamaDNRRules()

// 阅读列表清理定时器已废弃：清理逻辑不再由后台定时器负责，交由池容量与用户行为统一控制

// Phase 5.2: 初始化图标管理器
let iconManager: IconManager | null = null

/**
 * RSS 发现查看状态
 * 用于追踪用户是否已查看过 RSS 发现
 */
let rssDiscoveryViewed = false

/**
 * 统一的徽章/图标更新函数
 * 
 * Phase 5.2: 使用新的图标系统
 * 
 * 优先级：
 * 0. AI 未配置 - 图标暂停状态（优先级最高）
 * 1. RSS 发现（未查看） - 图标动画
 * 2. 学习阶段（< 动态阈值） - 图标进度遮罩
 * 3. 推荐阶段（≥ 动态阈值） - 图标波纹点亮
 */
async function updateBadge(): Promise<void> {
  try {
    // Phase 5.2: 如果图标管理器未初始化,记录警告但不阻塞
    if (!iconManager) {
      bgLogger.warn('⚠️ 图标管理器未初始化')
      return
    }
    
    // 0. 检查 AI 配置状态（优先级最高）
    const aiConfigured = await isAIConfigured()
    
    if (!aiConfigured) {
      // AI 未配置，显示暂停图标
      iconManager.pause()
      bgLogger.info('⏸️ AI 未配置，显示暂停图标')
      return
    } else {
      // AI 已配置，恢复正常图标
      iconManager.resume()
    }
    
    // 1. 检查是否有未查看的 RSS 发现
    const feedManager = new FeedManager()
    const candidateFeeds = await feedManager.getFeeds('candidate')
    
    // 2. 使用 OnboardingStateService 获取统一的状态（包含动态阈值）
    const stateInfo = await OnboardingStateService.getState()
    const { pageCount, threshold, isLearningComplete } = stateInfo
    
    if (!isLearningComplete) {
      // 学习阶段：显示进度遮罩（传入动态阈值）
      iconManager.setBadgeState(pageCount, 0, threshold)
      bgLogger.debug(`📚 学习进度：${pageCount}/${threshold} 页`)
    } else {
      // 推荐阶段：根据投递模式显示
      // Phase 15: 检查投递模式
      const config = await getRecommendationConfig()
      const isReadingListMode = config.deliveryMode === 'readingList'

      if (isReadingListMode) {
        // 阅读清单模式：统计阅读清单中由本扩展添加且未读的条目
        let displayCount = 0
        try {
          if (ReadingListManager.isAvailable() && chrome.readingList) {
            const entries = await chrome.readingList.query({})
            const ourRecords = await db.readingListEntries.toArray()
            const ourUrls = new Set(ourRecords.map(r => r.url))
            displayCount = entries.filter(e => ourUrls.has(e.url) && !e.hasBeenRead).length
          }
        } catch (rlError) {
          bgLogger.warn('读取阅读清单条目失败:', rlError)
        }

        iconManager.setRecommendCount(displayCount > 0 ? Math.min(displayCount, 3) : 0)
        // 清除波纹以避免视觉冲突
        iconManager.setBadgeState(threshold, 0, threshold)
        bgLogger.debug(`📬 推荐阶段（阅读清单模式）：${displayCount} 条未读（扩展添加）`)
      } else {
        // 弹窗模式：显示数字徽章为未读推荐数量（最多3）
        const unreadRecs = await getUnreadRecommendations(50)
        const unreadCount = unreadRecs.length
        iconManager.setRecommendCount(Math.min(unreadCount, 3))
        bgLogger.debug(`📬 推荐阶段（弹窗模式）：${unreadCount} 条未读推荐`)
      }
    }
    
    // 3. RSS 发现动画（优先级最高，会覆盖上面的状态）
    if (candidateFeeds.length > 0 && !rssDiscoveryViewed) {
      iconManager.startDiscoverAnimation()
    } else {
      iconManager.stopDiscoverAnimation()
    }
  } catch (error) {
    bgLogger.error('❌ 更新图标失败:', error)
  }
}

/**
 * 首次安装时初始化默认配置
 * 
 * Phase 9.1: 确保所有配置在扩展安装时就有默认值
 * 避免首次使用时因缺少配置导致的问题
 */
async function initializeDefaultConfigs() {
  bgLogger.info('初始化默认配置...')
  
  try {
    // 1. 检查并初始化 AI 配置
    const aiConfig = await getAIConfig()
    // 如果数据库中没有配置（enabled 为 false 且 provider 为 null 表示从未配置）
    const hasAIConfig = await chrome.storage.sync.get('aiConfig')
    if (!hasAIConfig.aiConfig) {
      bgLogger.info('  首次安装，保存 AI 默认配置到数据库')
      await saveAIConfig(aiConfig) // aiConfig 已经是完整的默认配置
    } else {
      bgLogger.info('  AI 配置已存在，跳过初始化')
    }
    
    // 2. 检查并初始化推荐配置
    const recommendConfig = await getRecommendationConfig()
    const hasRecommendConfig = await chrome.storage.sync.get('recommendationConfig')
    if (!hasRecommendConfig.recommendationConfig) {
      bgLogger.info('  首次安装，保存推荐默认配置到数据库')
      await saveRecommendationConfig(recommendConfig) // recommendConfig 已经是完整的默认配置
    } else {
      bgLogger.info('  推荐配置已存在，跳过初始化')
    }
    
    bgLogger.info('✅ 默认配置初始化完成')
  } catch (error) {
    bgLogger.error('❌ 默认配置初始化失败:', error)
    // 不抛出错误，避免阻塞整个初始化流程
  }
}

/**
 * 扩展安装或更新时初始化
 */
chrome.runtime.onInstalled.addListener(async () => {
  bgLogger.info('扩展已安装/更新，开始初始化...')
  
  try {
    // 0a. 执行 Sync Storage Key 迁移（优先级最高）
    const needsSyncMigration = await needsStorageKeyMigration()
    if (needsSyncMigration) {
      bgLogger.info('🔄 检测到需要迁移 Sync Storage Key...')
      const migrationResult = await migrateStorageKeys()
      
      if (migrationResult.success) {
        bgLogger.info('✅ Sync Storage Key 迁移成功', {
          migratedKeys: migrationResult.migratedKeys
        })
      } else {
        bgLogger.warn('⚠️ Sync Storage Key 迁移部分失败', {
          errors: migrationResult.errors
        })
      }
    }
    
    // 0b. 执行 Local Storage Key 迁移
    const needsLocalMigration = await needsLocalStorageMigration()
    if (needsLocalMigration) {
      bgLogger.info('🔄 检测到需要迁移 Local Storage Key...')
      const localStats = await migrateLocalStorageKeys()
      bgLogger.info('✅ Local Storage Key 迁移完成', localStats)
    }
    
    // 0c. 清理遗留的旧格式键
    const legacyCount = await cleanupLegacyNotificationKeys()
    if (legacyCount > 0) {
      bgLogger.info(`✅ 清理遗留旧格式键: ${legacyCount} 项`)
    }
    
    // 1. 初始化数据库
    await initializeDatabase()
    
    // 1b. Phase 13: 检查并运行 poolStatus 迁移
    if (await needsPhase13Migration()) {
      bgLogger.info('🔄 检测到需要 Phase 13 数据迁移，开始迁移...')
      const migrationSuccess = await runPhase13Migration()
      if (migrationSuccess) {
        bgLogger.info('✅ Phase 13 数据迁移完成')
      } else {
        bgLogger.warn('⚠️ Phase 13 数据迁移失败，部分数据可能需要手动处理')
      }
    }
    
    // 1c. Phase 14.3: 检查并运行 Stale 状态迁移
    if (await needsStaleMigration()) {
      bgLogger.info('🔄 检测到需要 Stale 状态迁移，开始迁移...')
      const staleMigrationSuccess = await runStaleMigration()
      if (staleMigrationSuccess) {
        bgLogger.info('✅ Stale 状态迁移完成')
      } else {
        bgLogger.warn('⚠️ Stale 状态迁移失败，部分数据可能需要手动处理')
      }
    }
    
    // 2. 清理可能残留的策略生成锁（防止热加载后锁卡住）
    await setPoolStrategyGenerating(false)
    bgLogger.debug('🧹 已清理策略生成锁')
    
    // 3. 首次安装时初始化默认配置
    await initializeDefaultConfigs()
    
    // 4. 初始化 AI Manager (Phase 8)
    await aiManager.initialize()
    bgLogger.info('✅ AI Manager 初始化完成')
    
    // 5. 更新徽章
    await updateBadge()
    
    bgLogger.info('✅ 初始化完成')
  } catch (error) {
    bgLogger.error('❌ 初始化失败:')
    bgLogger.error('  错误类型:', (error as any)?.constructor?.name || 'Unknown')
    bgLogger.error('  错误消息:', (error as Error)?.message || String(error))
    bgLogger.error('  完整错误:', error)
  }
})

/**
 * Service Worker 启动时初始化徽章
 */
;(async () => {
  try {
    bgLogger.info('Service Worker 启动...')
    
    // Phase 8: 初始化 AI Manager
    await aiManager.initialize()
    bgLogger.info('✅ AI Manager 初始化完成')
    
    // 初始化 OnboardingStateService（全局阶段状态管理）
    await OnboardingStateService.initialize()
    bgLogger.info('✅ OnboardingStateService 初始化完成')
    
    // 同步系统统计到缓存
    syncSystemStats().catch(err => 
      bgLogger.warn('初始统计同步失败:', err)
    )
    
    // Phase 5.2: 初始化图标管理器
    try {
      iconManager = new IconManager()
      // 开发模式下强制重新加载图片(防止缓存)
      const forceReload = process.env.NODE_ENV === 'development'
      await iconManager.initialize(forceReload)
      bgLogger.info(`✅ 图标管理器初始化成功${forceReload ? ' (强制重新加载)' : ''}`)
    } catch (error) {
      bgLogger.error('❌ 图标管理器初始化失败,使用旧徽章系统:', error)
      iconManager = null
    }
    
    await updateBadge()
    
    // 初始化阅读列表监听器
    ReadingListManager.setupListeners()
    bgLogger.info('✅ 阅读列表监听器已设置')

    // 阅读列表清理定时器已废弃：不再配置
    
    // Phase 7: 启动所有后台调度器
    await startAllSchedulers()
    
    // Phase 6: 启动弹窗容量定期评估
    bgLogger.info('创建弹窗容量评估定时器（每天一次）...')
    chrome.alarms.create('evaluate-popup-capacity', {
      periodInMinutes: 24 * 60 // 每 24 小时（1 天）
    })
    
    // Phase 12.7: 创建定期清理推荐池的定时器（每天一次）
    bgLogger.info('创建推荐池清理定时器（每天一次）...')
    chrome.alarms.create('cleanup-recommendation-pool', {
      delayInMinutes: 1, // 启动 1 分钟后首次执行
      periodInMinutes: 24 * 60 // 每 24 小时
    })
    
    // 创建每日画像更新定时器（每天一次）
    // 确保即使用户行为未达到触发阈值，画像也能每天至少更新一次
    bgLogger.info('创建每日画像更新定时器（每天一次）...')
    chrome.alarms.create('daily-profile-update', {
      delayInMinutes: 60, // 启动 1 小时后首次执行（避免启动时资源竞争）
      periodInMinutes: 24 * 60 // 每 24 小时
    })
    
    // 🆕 创建每日推荐池策略生成定时器（每天一次）
    bgLogger.info('创建每日推荐池策略生成定时器（每天一次）...')
    chrome.alarms.create('daily-pool-strategy', {
      delayInMinutes: 5, // 启动 5 分钟后首次执行（尽早生成个性化策略）
      periodInMinutes: 24 * 60 // 每 24 小时
    })
    
    // 创建追踪数据清理定时器（每小时一次）
    bgLogger.info('创建追踪数据清理定时器（每小时一次）...')
    chrome.alarms.create('cleanup-tracking-data', {
      delayInMinutes: 30, // 启动 30 分钟后首次执行
      periodInMinutes: 60 // 每小时
    })
    
    // Phase 14: 创建每周数据清理定时器（清理过期文章和推荐）
    bgLogger.info('创建每周数据清理定时器...')
    chrome.alarms.create('weekly-data-cleanup', {
      delayInMinutes: 120, // 启动 2 小时后首次执行
      periodInMinutes: 7 * 24 * 60 // 每 7 天
    })
    
    // Phase 12.7: 数据迁移 - 为旧推荐补充 status 字段
    // 🔥 优化：限制批量处理数量，避免内存溢出
    try {
      // 先统计需要迁移的数量
      const totalCount = await db.recommendations
        .filter(r => !r.status)
        .count()
      
      if (totalCount > 0) {
        bgLogger.info(`开始推荐数据迁移，共 ${totalCount} 条待迁移...`)
        
        // 分批处理，每次最多 100 条
        const batchSize = 100
        let migrated = 0
        
        while (migrated < totalCount) {
          const batch = await db.recommendations
            .filter(r => !r.status)
            .limit(batchSize)
            .toArray()
          
          if (batch.length === 0) break
          
          await db.recommendations.bulkUpdate(
            batch.map(rec => ({
              key: rec.id,
              changes: { status: 'active' as const }
            }))
          )
          
          migrated += batch.length
          bgLogger.debug(`已迁移 ${migrated}/${totalCount} 条推荐`)
        }
        
        bgLogger.info(`✅ 推荐数据迁移完成，共 ${migrated} 条`)
      }
    } catch (error) {
      bgLogger.error('❌ 推荐数据迁移失败:', error)
    }
    
    // Phase 6: 设置通知监听器
    bgLogger.info('设置推荐通知监听器...')
    setupNotificationListeners()
    
    bgLogger.info('✅ Service Worker 启动完成')
  } catch (error) {
    bgLogger.error('❌ Service Worker 启动失败:', error)
  }
})()

/**
 * 监听来自其他组件的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  bgLogger.debug('收到消息:', message.type)
  
  ;(async () => {
    try {
      switch (message.type) {
        case 'PAGE_VISIT':
          // Phase 12.8: 使用模块化的页面访问处理器
          try {
            // 1. 检查 Onboarding 状态
            const onboardingStatus = await getOnboardingState()
            if (onboardingStatus.state === 'setup') {
              bgLogger.debug('⏸️ 准备阶段，跳过页面访问数据采集')
              sendResponse({ success: true, skipped: true })
              break
            }
            
            const pageData = message.payload as PageVisitData
            
            // 2. 检查推荐来源追踪
            try {
              let trackingInfo = null
              let trackingSource = ''
              
              // 优先通过 Tab ID 查找
              const tabId = sender.tab?.id
              if (tabId) {
                trackingInfo = await consumeTabTracking(tabId)
                if (trackingInfo) {
                  trackingSource = 'tabId'
                }
              }
              
              // 备用：通过 URL 查找
              if (!trackingInfo) {
                trackingInfo = await consumeUrlTracking(pageData.url)
                if (trackingInfo) {
                  trackingSource = 'url'
                }
              }
              
              if (trackingInfo?.recommendationId) {
                pageData.source = 'recommended'
                pageData.recommendationId = trackingInfo.recommendationId
                
                const sourceDesc = trackingInfo.source === 'popup' 
                  ? (trackingInfo.action === 'translated' ? '弹窗(翻译)' : '弹窗(原文)')
                  : '阅读列表'
                
                bgLogger.info(`✅ 检测到推荐文章打开: ${sourceDesc} (via ${trackingSource})`, {
                  tabId,
                  url: pageData.url,
                  recommendationId: trackingInfo.recommendationId
                })
              }
            } catch (storageError) {
              bgLogger.warn('检查推荐追踪失败', storageError)
            }
            
            // 3. 处理页面访问（AI 分析、去重等）
            const result = await processPageVisit(pageData)
            
            if (!result.success) {
              sendResponse(result)
              break
            }
            
            // 4. 后续处理（推荐标记、画像学习、阅读清单移除等）
            // 为内容脚本提供阅读清单移除的诊断信息
            const removalDebug: {
              attempted: boolean
              normalizedUrl?: string
              entriesFound?: number
              matchedUrls?: string[]
              removedCount?: number
              fallbackAttempted?: boolean
              fallbackRemoved?: boolean
              error?: string
            } = { attempted: false }

            // 标记为已读与画像学习仅在非去重时进行，但移除阅读清单在两种情况下都兜底执行
            if (pageData.recommendationId) {
              try {
                if (!result.deduplicated) {
                  await markAsRead(pageData.recommendationId, pageData.duration, undefined)
                  bgLogger.info(`✅ 推荐已标记为已读: ${pageData.recommendationId}`)
                }
                
                const recommendation = await db.recommendations.get(pageData.recommendationId)
                if (recommendation) {
                  if (!result.deduplicated) {
                    await semanticProfileBuilder.onRead(recommendation, pageData.duration, 0.5)
                    bgLogger.debug('✅ 画像阅读学习完成')
                  }
                  
                  // Phase 15: 如果文章来自阅读清单，学习完成后自动移除
                  if (recommendation.savedToReadingList && ReadingListManager.isAvailable()) {
                    try {
                      // 直接使用 recommendationId 查询，避免 URL 格式匹配问题
                      const entries = await db.readingListEntries
                        .where('recommendationId').equals(pageData.recommendationId)
                        .toArray()
                      
                      removalDebug.attempted = true
                      removalDebug.entriesFound = entries.length
                      removalDebug.matchedUrls = entries.map(e => e.url)
                      removalDebug.removedCount = 0
                      
                      bgLogger.info('🔍 通过推荐ID查询阅读清单记录', {
                        '推荐ID': pageData.recommendationId,
                        '匹配到条目数': entries.length,
                        '匹配到的URLs': entries.map(e => e.url)
                      })

                      if (entries.length > 0) {
                        for (const entry of entries) {
                          try {
                            // 标记为已读而非删除，保留历史记录
                            await chrome.readingList.updateEntry({ url: entry.url, hasBeenRead: true })
                            // 从数据库记录表中删除（已完成任务）
                            await db.readingListEntries.delete(entry.normalizedUrl)
                            removalDebug.removedCount = (removalDebug.removedCount || 0) + 1
                            bgLogger.info('✅ 学习完成，已标记阅读清单条目为已读', {
                              url: entry.url,
                              normalizedUrl: entry.normalizedUrl,
                              recommendationId: pageData.recommendationId,
                              title: recommendation.title
                            })
                          } catch (updateError) {
                            bgLogger.warn('更新阅读清单失败（可能已手动删除）:', {
                              error: updateError,
                              url: entry.url,
                              recommendationId: pageData.recommendationId
                            })
                          }
                        }
                      } else {
                        bgLogger.debug('未找到对应的阅读清单记录（可能已手动删除或旧数据）', {
                          recommendationId: pageData.recommendationId
                        })
                      }
                    } catch (error) {
                      removalDebug.error = error instanceof Error ? error.message : String(error)
                      bgLogger.warn('自动移除阅读清单条目失败:', error)
                    }
                  }
                }
              } catch (error) {
                bgLogger.warn('推荐后续处理失败:', error)
              }
            }
            
            // 若未执行移除尝试（例如无 recommendationId），进行通用的规范化匹配移除
            if (!removalDebug.attempted && ReadingListManager.isAvailable()) {
              try {
                const normalizedUrl = ReadingListManager.normalizeUrlForTracking(pageData.url)
                const entries = await db.readingListEntries
                  .where('normalizedUrl').equals(normalizedUrl)
                  .toArray()
                removalDebug.attempted = true
                removalDebug.normalizedUrl = normalizedUrl
                removalDebug.entriesFound = entries.length
                removalDebug.matchedUrls = entries.map(e => e.url)
                removalDebug.removedCount = 0
                bgLogger.debug('通用路径查询阅读清单记录', { normalizedUrl, entriesFound: entries.length })
                if (entries.length === 0 && pageData.meta?.canonical) {
                  const canonicalNorm = ReadingListManager.normalizeUrlForTracking(pageData.meta.canonical)
                  const canonicalEntries = await db.readingListEntries
                    .where('normalizedUrl').equals(canonicalNorm)
                    .toArray()
                  bgLogger.debug('通用路径使用 canonical 兜底查询', { canonicalNorm, entriesFound: canonicalEntries.length })
                  if (canonicalEntries.length > 0) {
                    removalDebug.normalizedUrl = canonicalNorm
                    removalDebug.entriesFound = canonicalEntries.length
                    removalDebug.matchedUrls = canonicalEntries.map(e => e.url)
                    entries.splice(0, entries.length, ...canonicalEntries)
                  }
                }
                if (entries.length > 0) {
                  for (const entry of entries) {
                    try {
                      // 标记为已读而非删除
                      await chrome.readingList.updateEntry({ url: entry.url, hasBeenRead: true })
                      await db.readingListEntries.delete(entry.normalizedUrl)
                      removalDebug.removedCount = (removalDebug.removedCount || 0) + 1
                      bgLogger.info('✅ 通用路径标记阅读清单条目为已读', { url: entry.url, normalizedUrl: entry.normalizedUrl })
                    } catch (updateError) {
                      bgLogger.warn('通用路径更新失败', { error: updateError, url: entry.url })
                    }
                  }
                } else {
                  removalDebug.fallbackAttempted = true
                  try {
                    // 标记为已读而非删除
                    await chrome.readingList.updateEntry({ url: pageData.url, hasBeenRead: true })
                    removalDebug.fallbackRemoved = true
                    bgLogger.info('✅ 通用路径标记为已读（使用原始URL）', { url: pageData.url })
                  } catch (updateError) {
                    removalDebug.fallbackRemoved = false
                    bgLogger.debug('通用路径未找到对应条目', { error: updateError, url: pageData.url })
                  }
                }
              } catch (e) {
                removalDebug.error = e instanceof Error ? e.message : String(e)
                bgLogger.warn('通用路径移除尝试失败', e)
              }
            }
            
            // 5. 刷新状态
            if (!result.deduplicated) {
              const newStateInfo = await OnboardingStateService.onPageVisited()
              if (newStateInfo.state === 'ready' && newStateInfo.isLearningComplete) {
                bgLogger.info(`🎉 学习完成，页面 ${newStateInfo.pageCount}/${newStateInfo.threshold}`)
                await reconfigureSchedulersForState('ready')
              }
              
              // 传递给画像调度器
              ProfileUpdateScheduler.checkAndScheduleUpdate({
                url: pageData.url,
                title: pageData.title,
                domain: pageData.domain,
                visitTime: pageData.visitTime,
                duration: pageData.duration
              } as any).catch(error => {
                bgLogger.error('画像更新调度失败:', error)
              })
            }
            
            await updateBadge()
            // 将阅读清单移除诊断信息返回给内容脚本，便于前端日志调试
            sendResponse({ ...result, removal: removalDebug })
          } catch (error) {
            bgLogger.error('❌ 处理页面访问失败:', error)
            sendResponse({ 
              success: false, 
              deduplicated: false,
              error: error instanceof Error ? error.message : String(error)
            })
          }
          break
        
        case 'PAGE_RECORDED':
        case 'RECOMMENDATION_ADDED':
        case 'RECOMMENDATION_READ':
        case 'RECOMMENDATIONS_DISMISSED':
          await updateBadge()
          sendResponse({ success: true })
          break
        
        case 'ONBOARDING_STATE_CHANGED':
          // Phase 9.1: Onboarding 状态变化，重新配置调度器
          try {
            const { state } = message
            bgLogger.info(`Onboarding 状态变化: ${state}`)
            
            // 刷新 OnboardingStateService 缓存
            await OnboardingStateService.refreshState()
            
            // 调用重新配置函数
            await reconfigureSchedulersForState(state)
            
            // 更新图标
            await updateBadge()
            
            sendResponse({ success: true })
          } catch (error) {
            bgLogger.error('❌ 重新配置调度器失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break
        
        case 'RSS_DETECTED':
          try {
            // 验证 payload 存在
            if (!message.payload) {
              bgLogger.error('❌ RSS_DETECTED 消息缺少 payload')
              sendResponse({ success: false, error: 'Missing payload' })
              break
            }
            
            const { feeds, sourceURL, sourceTitle } = message.payload as {
              feeds: Array<{
                url: string
                type: 'rss' | 'atom'
                title: string
                description?: string
                metadata: any
              }>
              sourceURL: string
              sourceTitle: string
            }
            
            // 验证必需字段
            if (!feeds || !Array.isArray(feeds)) {
              bgLogger.error('❌ RSS_DETECTED 消息缺少 feeds 数组')
              sendResponse({ success: false, error: 'Invalid feeds data' })
              break
            }
            
            if (!sourceURL) {
              bgLogger.error('❌ RSS_DETECTED 消息缺少 sourceURL')
              sendResponse({ success: false, error: 'Missing sourceURL' })
              break
            }
            
            const feedManager = new FeedManager()
            let addedCount = 0
            const newFeedIds: string[] = [] // 记录新添加的源 ID
            
            for (const feed of feeds) {
              // 1. 检查是否已存在（任何状态）
              const existing = await feedManager.getFeedByUrl(feed.url)
              if (existing) {
                if (existing.status === 'ignored') {
                  bgLogger.debug('跳过已忽略的源:', feed.url)
                  continue
                } else if (existing.status === 'candidate') {
                  // 已经在候选列表中，触发徽章更新
                  bgLogger.debug('源已在候选列表中:', feed.url)
                  addedCount++
                  continue
                } else {
                  // 已订阅或推荐状态，跳过
                  bgLogger.debug(`源已存在（状态: ${existing.status}）:`, feed.url)
                  continue
                }
              }
              
              // 2. 使用 RSSValidator 验证并获取元数据
              const result = await RSSValidator.validateURL(feed.url)
              
              if (!result.valid || !result.metadata) {
                // 404 等错误静默跳过，不干扰用户
                continue
              }
              
              const metadata = result.metadata
              // 使用 RSS feed 自身的 link 域名，而不是来源页面域名（避免谷歌翻译等代理域名）
              const feedDomain = metadata.link ? new URL(metadata.link).hostname : new URL(sourceURL).hostname
              
              // 3. 添加到候选列表（使用 RSS 标题 + 域名）
              bgLogger.info('添加到候选列表:', metadata.title)
              const feedId = await feedManager.addCandidate({
                url: feed.url,
                title: `${metadata.title} (${feedDomain})`,
                description: metadata.description,
                link: metadata.link,
                language: metadata.language,
                category: metadata.category,
                lastBuildDate: metadata.lastBuildDate,
                itemCount: metadata.itemCount,
                generator: metadata.generator,
                discoveredFrom: sourceURL,
                discoveredAt: Date.now(),
              })
              addedCount++
              newFeedIds.push(feedId)
            }
            
            // 只有真正添加了新源才重置查看状态并触发 AI 分析
            if (addedCount > 0) {
              bgLogger.info(`成功添加 ${addedCount} 个有效 RSS 源`)
              rssDiscoveryViewed = false
              await updateBadge()
              
              // 4. 后台异步触发 AI 分析（不阻塞响应）
              // 注意：feedManager.analyzeFeed 内部会检查 AI 是否配置
              if (newFeedIds.length > 0) {
                const aiConfigured = await isAIConfigured()
                if (aiConfigured) {
                  bgLogger.info('开始后台 AI 分析...')
                  Promise.all(
                    newFeedIds.map(feedId => 
                      feedManager.analyzeFeed(feedId)
                        .then(quality => {
                          if (quality) {
                            bgLogger.info(`✅ AI 分析完成: ${feedId}, 评分: ${quality.score}`)
                          }
                        })
                        .catch((error: Error) => {
                          bgLogger.error(`❌ AI 分析失败: ${feedId}`, error)
                          // AI 分析失败不删除源（AI 可能只是暂时不可用）
                        })
                    )
                  ).then(() => {
                    bgLogger.info('所有 AI 分析完成')
                  }).catch(error => {
                    bgLogger.error('批量 AI 分析失败:', error)
                  })
                } else {
                  bgLogger.info('AI 未配置，跳过源分析')
                }
              }
            }
            
            sendResponse({ success: true })
          } catch (error) {
            bgLogger.error('❌ 处理 RSS 检测失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break
        
        case 'RSS_DISCOVERY_VIEWED':
          rssDiscoveryViewed = true
          await updateBadge()
          sendResponse({ success: true })
          break
        
        case 'RSS_IGNORED':
          await updateBadge()
          sendResponse({ success: true })
          break
        
        case 'MANUAL_FETCH_FEEDS':
          // Phase 5 Sprint 3: 手动触发所有RSS抓取
          try {
            bgLogger.info('手动触发 RSS 抓取...')
            
            // Phase 5.2: 启动后台抓取动画
            if (iconManager) {
              iconManager.startFetchingAnimation()
            }
            
            // 使用强制手动抓取，忽略时间和频率限制
            const result = await feedScheduler.fetchAllManual()
            
            // Phase 5.2: 停止后台抓取动画
            if (iconManager) {
              iconManager.stopFetchingAnimation()
              await updateBadge()  // 恢复正常状态
            }
            
            sendResponse({ success: true, data: result })
          } catch (error) {
            bgLogger.error('❌ 手动抓取失败:', error)
            
            // 停止动画
            if (iconManager) {
              iconManager.stopFetchingAnimation()
            }
            
            sendResponse({ success: false, error: String(error) })
          }
          break

        case 'MANUAL_FETCH_SINGLE_FEED':
          // 手动触发单个RSS源抓取
          try {
            const { feedId } = message.payload as { feedId: string }
            bgLogger.info('手动触发单个RSS源抓取:', feedId)
            
            // Phase 5.2: 启动后台抓取动画
            if (iconManager) {
              iconManager.startFetchingAnimation()
            }
            
            // 获取特定的RSS源
            const feed = await db.discoveredFeeds.get(feedId)
            if (!feed) {
              throw new Error(`RSS源不存在: ${feedId}`)
            }
            
            if (feed.status !== 'subscribed') {
              throw new Error(`RSS源未订阅: ${feed.title}`)
            }
            
            if (!feed.isActive) {
              throw new Error(`RSS源已暂停: ${feed.title}`)
            }
            
            // 强制抓取单个源
            const success = await fetchFeed(feed)
            
            // 重新获取更新后的 feed 数据，检查是否需要 AI 分析
            // 注意：fetchFeed 内部可能已经触发了 AI 分析，这里使用最新数据避免重复
            const updatedFeed = await db.discoveredFeeds.get(feedId)
            if (updatedFeed) {
              const needsAnalysis = !updatedFeed.category || !updatedFeed.language || !updatedFeed.quality
              if (needsAnalysis) {
                const aiConfigured = await isAIConfigured()
                if (aiConfigured) {
                  bgLogger.info('源缺少基本信息，触发 AI 分析:', updatedFeed.title)
                  // 异步触发，不阻塞读取响应
                  getSourceAnalysisService().analyze(feedId, true).catch(error => {
                    bgLogger.error('手动读取触发 AI 分析失败:', error)
                  })
                }
              }
            }
            
            // Phase 5.2: 停止后台抓取动画
            if (iconManager) {
              iconManager.stopFetchingAnimation()
              await updateBadge()  // 恢复正常状态
            }
            
            if (success) {
              sendResponse({ 
                success: true, 
                data: { 
                  total: 1, 
                  fetched: 1, 
                  skipped: 0, 
                  failed: 0,
                  feedTitle: feed.title 
                } 
              })
            } else {
              // 获取详细错误信息
              const updatedFeed = await db.discoveredFeeds.get(feedId)
              const errorDetail = updatedFeed?.lastError || '未知错误'
              throw new Error(`抓取失败: ${feed.title} - ${errorDetail}`)
            }
            
          } catch (error) {
            bgLogger.error('❌ 单个RSS源抓取失败:', error)
            
            // 停止动画
            if (iconManager) {
              iconManager.stopFetchingAnimation()
            }
            
            sendResponse({ success: false, error: String(error) })
          }
          break
        
        // 开发环境下的图标调试命令
        case 'DEBUG_SET_LEARNING':
          if (process.env.NODE_ENV === 'development' && iconManager) {
            iconManager.setLearningProgress(message.pages)
            sendResponse({ success: true })
          } else {
            sendResponse({ success: false, error: 'Not in development mode' })
          }
          break
        
        case 'DEBUG_SET_RECOMMEND':
          if (process.env.NODE_ENV === 'development' && iconManager) {
            iconManager.setRecommendCount(message.count)
            sendResponse({ success: true })
          } else {
            sendResponse({ success: false, error: 'Not in development mode' })
          }
          break
        
        case 'DEBUG_START_DISCOVER':
          if (process.env.NODE_ENV === 'development' && iconManager) {
            iconManager.startDiscoverAnimation()
            sendResponse({ success: true })
          } else {
            sendResponse({ success: false, error: 'Not in development mode' })
          }
          break
        
        case 'DEBUG_SET_FETCHING':
          if (process.env.NODE_ENV === 'development' && iconManager) {
            if (message.enable) {
              iconManager.startFetchingAnimation()
            } else {
              iconManager.stopFetchingAnimation()
            }
            sendResponse({ success: true })
          } else {
            sendResponse({ success: false, error: 'Not in development mode' })
          }
          break
        
        case 'DEBUG_SET_PAUSED':
          if (process.env.NODE_ENV === 'development' && iconManager) {
            if (message.enable) {
              iconManager.pause()
            } else {
              iconManager.resume()
            }
            sendResponse({ success: true })
          } else {
            sendResponse({ success: false, error: 'Not in development mode' })
          }
          break
        
        case 'DEBUG_SET_ERROR':
          if (process.env.NODE_ENV === 'development' && iconManager) {
            if (message.enable) {
              iconManager.setError(true)
            } else {
              iconManager.clearError()
            }
            sendResponse({ success: true })
          } else {
            sendResponse({ success: false, error: 'Not in development mode' })
          }
          break
        
        case 'DEBUG_RESET_ICON':
          if (process.env.NODE_ENV === 'development' && iconManager) {
            iconManager.clearError()
            iconManager.resume()
            iconManager.stopFetchingAnimation()
            iconManager.stopDiscoverAnimation()
            await updateBadge()  // 恢复到当前实际状态
            sendResponse({ success: true })
          } else {
            sendResponse({ success: false, error: 'Not in development mode' })
          }
          break
        
        // Phase 6: 测试推荐通知
        case 'TEST_NOTIFICATION':
          try {
            bgLogger.info('触发测试通知...')
            await testNotification()
            sendResponse({ success: true })
          } catch (error) {
            bgLogger.error('❌ 测试通知失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break
        
        // 获取完整的阶段状态信息（供 Popup 使用）
        case 'GET_ONBOARDING_STATE_INFO':
          try {
            const stateInfo = await OnboardingStateService.getState()
            sendResponse({ success: true, data: stateInfo })
          } catch (error) {
            bgLogger.error('❌ 获取阶段状态信息失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break
        
        // 获取画像更新进度（从 Background 实例读取）
        case 'GET_PROFILE_UPDATE_PROGRESS':
          try {
            const progress = await semanticProfileBuilder.getUpdateProgress()
            sendResponse({ success: true, data: progress })
          } catch (error) {
            bgLogger.error('❌ 获取画像更新进度失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break
        
        // 获取后台任务状态
        case 'GET_SCHEDULER_STATUS':
          try {
            const alarms = await chrome.alarms.getAll()
            const status = {
              feedScheduler: {
                name: 'RSS抓取',
                alarms: alarms.filter(a => a.name === 'fetch-feeds').map(a => ({
                  name: a.name,
                  scheduledTime: a.scheduledTime,
                  periodInMinutes: a.periodInMinutes
                }))
              },
              recommendationScheduler: {
                name: '推荐生成',
                nextRunTime: recommendationScheduler.nextRunTime,
                alarms: alarms.filter(a => a.name === 'generate-recommendation').map(a => ({
                  name: a.name,
                  scheduledTime: a.scheduledTime,
                  periodInMinutes: a.periodInMinutes
                }))
              },
              otherTasks: alarms.filter(a => 
                !['fetch-feeds', 'generate-recommendation'].includes(a.name)
              ).map(a => ({
                name: a.name,
                scheduledTime: a.scheduledTime,
                periodInMinutes: a.periodInMinutes
              }))
            }
            sendResponse({ success: true, data: status })
          } catch (error) {
            bgLogger.error('❌ 获取调度器状态失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break

        case 'GET_SCHEDULERS_STATUS':
          // 为推荐设置页面提供调度器状态
          try {
            // 获取推荐调度器的当前间隔
            const alarms = await chrome.alarms.getAll()
            const recAlarm = alarms.find(a => a.name === 'generate-recommendation')
            
            sendResponse({
              success: true,
              recommendation: {
                nextRunTime: recommendationScheduler.nextRunTime,
                currentIntervalMinutes: recAlarm?.periodInMinutes || 1
              }
            })
          } catch (error) {
            bgLogger.error('❌ 获取调度器状态失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break

        case 'GET_ACTIVE_RECOMMENDATIONS_COUNT':
          // 获取弹窗内活跃推荐数量
          try {
            const activeRecs = await db.recommendations
              .filter(rec => {
                const isActive = !rec.status || rec.status === 'active'
                const isUnreadAndNotDismissed = !rec.isRead && rec.feedback !== 'dismissed'
                return isActive && isUnreadAndNotDismissed
              })
              .count()
            sendResponse({ success: true, count: activeRecs })
          } catch (error) {
            bgLogger.error('❌ 获取活跃推荐数量失败:', error)
            sendResponse({ success: false, error: String(error), count: 0 })
          }
          break
        
        // 画像学习：用户拒绝推荐
        case 'PROFILE_ON_DISMISS':
          try {
            const { recommendation } = message.payload
            await semanticProfileBuilder.onDismiss(recommendation)
            sendResponse({ success: true })
          } catch (error) {
            bgLogger.error('❌ 画像拒绝学习失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break
        
        // 画像学习：用户阅读推荐
        case 'PROFILE_ON_READ':
          try {
            const { recommendation, readDuration, scrollDepth } = message.payload
            await semanticProfileBuilder.onRead(recommendation, readDuration, scrollDepth)
            sendResponse({ success: true })
          } catch (error) {
            bgLogger.error('❌ 画像阅读学习失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break
        
        // Phase 15.1: 清理模式切换时的旧推荐
        case 'CLEANUP_MODE_SWITCH':
          try {
            const { targetMode } = message as { type: string; targetMode: 'popup' | 'readingList' }
            bgLogger.info(`🔄 清理模式切换遗留数据，目标模式: ${targetMode}`)
            
            // 清理 recommendations 表中的旧推荐
            const cleaned = await db.recommendations
              .filter(rec => {
                const isActive = !rec.status || rec.status === 'active'
                const isUnreadAndNotDismissed = !rec.isRead && rec.feedback !== 'dismissed'
                return isActive && isUnreadAndNotDismissed
              })
              .modify({ status: 'expired' })
            
            bgLogger.info(`✅ 已清理 ${cleaned} 条旧推荐，推荐池已释放`)
            
            // 立即触发一次新推荐生成
            recommendationScheduler.triggerNow().catch(error => {
              bgLogger.error('强制生成推荐失败:', error)
            })
            
            sendResponse({ success: true, cleaned })
          } catch (error) {
            bgLogger.error('❌ 清理模式切换数据失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break

        // 模式切换：保存配置并进行条目转移
        case 'DELIVERY_MODE_CHANGED':
          (async () => {
            try {
              const { deliveryMode } = message as { type: string; deliveryMode: 'popup' | 'readingList' }
              const prevConfig = await getRecommendationConfig()
              const prevMode = prevConfig.deliveryMode
              const newConfig = { ...prevConfig, deliveryMode }
              await saveRecommendationConfig(newConfig)
              bgLogger.info(`📮 推荐投递模式切换: ${prevMode} → ${deliveryMode}`)

              const autoAddedPrefix = '🤫 '

              // Phase 15: 简化设计 - 直接使用弹窗已处理的 URL 和标题
              if (deliveryMode === 'readingList' && ReadingListManager.isAvailable()) {
                // 1. 获取当前弹窗中活跃的推荐
                const activeRecs = await db.recommendations
                  .filter(rec => {
                    const isActive = !rec.status || rec.status === 'active'
                    const isUnread = !rec.isRead
                    const notDismissed = rec.feedback !== 'dismissed'
                    const notLater = rec.feedback !== 'later'
                    return isActive && isUnread && notDismissed && notLater
                  })
                  .toArray()

                // 2. 获取配置
                const uiConfigResult = await chrome.storage.sync.get('ui_config')
                const autoTranslate = !!(uiConfigResult?.ui_config?.autoTranslate)
                const interfaceLanguage = typeof navigator !== 'undefined' ? navigator.language : 'zh-CN'

                // 3. 使用统一的 URL 决策函数（复用弹窗逻辑）
                const { decideUrlForReadingListEntry } = await import('@/utils/recommendation-display')

                let transferred = 0
                for (const rec of activeRecs) {
                  try {
                    // 决策最终显示的 URL 和标题
                    const { url, title } = await decideUrlForReadingListEntry(rec, {
                      autoTranslate,
                      interfaceLanguage
                    })

                    // 添加到阅读清单
                    const finalTitle = `${autoAddedPrefix}${title}`
                    const ok = await ReadingListManager.addToReadingList(finalTitle, url, rec.isRead)

                    if (ok) {
                      // 记录映射关系
                      const normalizedUrl = ReadingListManager.normalizeUrlForTracking(url)
                      await db.readingListEntries.put({
                        normalizedUrl,
                        url,
                        recommendationId: rec.id,
                        addedAt: Date.now(),
                        titlePrefix: autoAddedPrefix
                      })

                      // 标记推荐为在清单中
                      await db.recommendations.update(rec.id, {
                        displayLocation: 'readingList'
                      })

                      transferred++
                      bgLogger.debug('已转移到阅读清单', { id: rec.id, title })
                    }
                  } catch (err) {
                    bgLogger.warn('转移到阅读列表失败（忽略）', { id: rec.id, err })
                  }
                }

                // 触发一次推荐生成以填充池
                recommendationScheduler.triggerNow().catch(() => {})
                sendResponse({ success: true, transferred })
              } else if (deliveryMode === 'popup') {
                // 1. 查询阅读清单中由扩展管理的条目
                const entries = await chrome.readingList.query({})
                const ourEntries = entries.filter(e => e.title?.startsWith(autoAddedPrefix))

                let removed = 0
                for (const entry of ourEntries) {
                  try {
                    // 2. 从阅读清单删除
                    await ReadingListManager.removeFromReadingList(entry.url)

                    // 3. 恢复推荐到弹窗模式
                    try {
                      const normalizedUrl = ReadingListManager.normalizeUrlForTracking(entry.url)
                      const rlEntry = await db.readingListEntries.get(normalizedUrl)

                      if (rlEntry?.recommendationId) {
                        await db.recommendations.update(rlEntry.recommendationId, {
                          displayLocation: 'popup'
                        })

                        bgLogger.info('已恢复推荐到弹窗模式', {
                          recommendationId: rlEntry.recommendationId
                        })
                      }

                      // 4. 清理映射关系
                      await db.readingListEntries.delete(normalizedUrl)
                      removed++
                    } catch (err) {
                      bgLogger.warn('恢复推荐状态失败（忽略）', { url: entry.url, err })
                    }
                  } catch (err) {
                    bgLogger.warn('删除阅读列表条目失败（忽略）', { url: entry.url, err })
                  }
                }

                // 触发推荐生成填充弹窗
                recommendationScheduler.triggerNow().catch(() => {})
                sendResponse({ success: true, removed })
              } else {
                sendResponse({ success: true })
              }
            } catch (error) {
              bgLogger.error('❌ 模式切换处理失败:', error)
              sendResponse({ success: false, error: String(error) })
            }
          })()
          return true
        
        // 打开推荐文章（从弹窗或翻译按钮）
        // 由 Background 处理，确保追踪信息在创建 Tab 后立即保存
        case 'OPEN_RECOMMENDATION':
          try {
            const { url, sourceUrl, recommendationId, title, action } = message.payload
            
            // 弹窗已经根据语言和设置决定了最终 URL，这里只需直接打开
            // 不再重复决策翻译逻辑
            const finalUrl = url
            
            // 1. 创建新标签页
            const tab = await chrome.tabs.create({ url: finalUrl })
            
            // 2. 保存追踪信息（使用 Tab ID）
            // ⚠️ 使用 local storage 而非 session，避免扩展重启后丢失
            if (tab.id) {
              await saveTabTracking(tab.id, {
                recommendationId,
                title,
                source: 'popup',
                action: action || 'clicked'
              })
              
              sendResponse({ success: true, tabId: tab.id })
            } else {
              bgLogger.warn('⚠️ 创建标签页成功但无 Tab ID')
              sendResponse({ success: true, tabId: null })
            }
          } catch (error) {
            bgLogger.error('❌ 打开推荐失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break

        // AI 订阅源质量分析
        case 'AI_SOURCE_ANALYSIS':
          try {
            const { feedId, feedTitle, feedDescription, feedLink, sampleArticles, existingLanguage } = message.payload
            bgLogger.info('收到 AI 订阅源分析请求:', { feedId, feedTitle, existingLanguage })
            
            // 使用 AICapabilityManager 的订阅源分析方法
            // 现在直接传递请求参数，不再手动构建提示词
            await aiManager.initialize()
            const result = await aiManager.analyzeSource({
              feedTitle: feedTitle || '未知标题',
              feedDescription: feedDescription || '',
              feedLink: feedLink || '',
              sampleArticles: sampleArticles || ''
            })
            
            // 如果 RSS 源已声明语言且 AI 没有检测到语言，使用 RSS 声明的语言
            if (existingLanguage && !result.language) {
              result.language = existingLanguage
              bgLogger.info('使用 RSS 源声明的语言:', existingLanguage)
            }
            
            bgLogger.info('AI 订阅源分析完成:', {
              feedId,
              qualityScore: result.qualityScore,
              category: result.contentCategory,
              language: result.language,
              tags: result.topicTags
            })
            
            sendResponse({ success: true, result })
          } catch (error) {
            bgLogger.error('❌ AI 订阅源分析失败:', error)
            sendResponse({ 
              success: false, 
              error: error instanceof Error ? error.message : String(error)
            })
          }
          break

        // 阅读列表清理相关消息已废弃：保持接口精简

        default:
          sendResponse({ success: false, error: 'Unknown message type' })
      }
    } catch (error) {
      bgLogger.error('处理消息失败:', error)
      sendResponse({ success: false, error: String(error) })
    }
  })()
  
  return true
})

/**
 * 🆕 生成每日推荐池策略（Alarm 触发）
 */
async function generateDailyPoolStrategy(): Promise<void> {
  try {
    // 检查阶段状态（仅 ready 状态才生成）
    const state = await OnboardingStateService.getState()
    if (state.state !== 'ready') {
      bgLogger.debug('非 ready 状态，跳过推荐池策略生成')
      return
    }
    
    // 检查锁（防止并发）
    const isGenerating = await isPoolStrategyGenerating()
    if (isGenerating) {
      bgLogger.debug('推荐池策略正在生成中，跳过')
      return
    }
    
    await setPoolStrategyGenerating(true)
    
    try {
      const decider = getStrategyDecider()
      
      // 检查是否已有今日决策
      const cached = await decider.getCachedDecision()
      if (cached) {
        bgLogger.debug('今日推荐池策略已存在，跳过')
        return
      }
      
      bgLogger.info('🤖 开始生成今日推荐池策略...')
      
      // 收集上下文数据
      const context = await collectDailyUsageContext()
      
      // AI 决策
      const decision = await decider.decideDailyStrategy(context)
      
      // 应用决策到补充管理器
      const refillManager = getRefillManager()
      refillManager.updatePolicy({
        minInterval: decision.minInterval,
        maxDailyRefills: decision.maxDailyRefills,
        triggerThreshold: decision.triggerThreshold
      })
      
      bgLogger.info('✅ 推荐池策略已生成并应用', {
        poolSize: decision.poolSize,
        refillInterval: Math.round(decision.minInterval / 1000 / 60),
        confidence: decision.confidence
      })
    } finally {
      // 释放锁（5秒后）
      setTimeout(async () => {
        await setPoolStrategyGenerating(false)
      }, 5000)
    }
  } catch (error) {
    bgLogger.error('❌ 每日推荐池策略生成失败:', error)
  }
}

/**
 * Phase 6/7: 定时器事件监听器
 * 处理推荐数量定期评估和推荐生成
 * Phase: 推荐系统重构 - 策略审查
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  bgLogger.debug('定时器触发:', alarm.name)
  
  try {
    if (alarm.name === 'evaluate-popup-capacity') {
      bgLogger.info('开始评估弹窗容量...')
      const newCount = await evaluateAndAdjust()
      bgLogger.info(`✅ 弹窗容量已调整为: ${newCount} 条`)
    } else if (alarm.name === 'generate-recommendation') {
      // Phase 7: 委托给 recommendationScheduler 处理
      // Phase 5.2: 启动推荐分析动画（呼吸效果）
      if (iconManager) {
        iconManager.startAnalyzingAnimation()
      }
      
      await recommendationScheduler.handleAlarm()
      
      // Phase 5.2: 停止推荐分析动画
      if (iconManager) {
        iconManager.stopAnalyzingAnimation()
      }
      
      // 更新徽章显示新推荐
      await updateBadge()
    } else if (alarm.name === 'strategy-review') {
      // 策略审查：检查并生成新策略
      bgLogger.info('开始策略审查...')
      await strategyReviewScheduler.handleAlarm()
    } else if (alarm.name === 'cleanup-recommendation-pool') {
      // Phase 12.7: 清理超限的推荐池
      bgLogger.info('开始清理推荐池...')
      await cleanupRecommendationPool()
    } else if (alarm.name === 'daily-profile-update') {
      // 每日画像更新：确保画像至少每天更新一次
      bgLogger.info('开始每日画像更新...')
      await dailyProfileUpdate()
    } else if (alarm.name === 'cleanup-tracking-data') {
      // 清理过期的追踪数据（新格式聚合存储）
      bgLogger.info('开始清理过期追踪数据...')
      const cleaned = await cleanupAggregatedTrackingData()
      bgLogger.info(`✅ 清理了 ${cleaned} 条过期追踪数据`)
    } else if (alarm.name === 'weekly-data-cleanup') {
      // Phase 14: 每周数据清理
      bgLogger.info('开始每周数据清理...')
      await weeklyDataCleanup()
    } else if (alarm.name === 'daily-pool-strategy') {
      // 🆕 每日推荐池策略生成
      bgLogger.info('开始每日推荐池策略生成...')
      await generateDailyPoolStrategy()
    }
  } catch (error) {
    bgLogger.error('❌ 定时器处理失败:', error)
  }
})

/**
 * Phase 12.7: 清理推荐池中的超限推荐
 * 
 * 策略：
 * 1. 获取当前池容量配置（maxRecommendations × 2）
 * 2. 查询所有活跃的未读推荐
 * 3. 如果超过容量限制，按分数排序，保留高分推荐，清理低分推荐
 * 4. 将清理的推荐标记为 'replaced' 状态
 * 5. 同步更新 feedArticles 的 inPool 状态
 */
async function cleanupRecommendationPool(): Promise<void> {
  try {
    const config = await getRecommendationConfig()
    const poolCapacity = (config.maxRecommendations || 3) * 2  // 池容量 = 弹窗容量 × 2
    
    // 获取所有活跃的未读推荐（未忽略）
    const activeRecs = await db.recommendations
      .filter(r => {
        const isActive = !r.status || r.status === 'active'
        const isUnreadAndNotDismissed = !r.isRead && r.feedback !== 'dismissed'
        return isActive && isUnreadAndNotDismissed
      })
      .toArray()
    
    bgLogger.info(`推荐池状态: ${activeRecs.length}/${poolCapacity} 条活跃推荐`)
    
    if (activeRecs.length > poolCapacity) {
      bgLogger.warn(`⚠️ 推荐池超限: ${activeRecs.length} > ${poolCapacity}，开始清理...`)
      
      // 按分数降序排序，保留高分推荐
      const sorted = activeRecs.sort((a, b) => (b.score || 0) - (a.score || 0))
      const toKeep = sorted.slice(0, poolCapacity)
      const toRemove = sorted.slice(poolCapacity)
      
      if (toRemove.length > 0) {
        // 标记为 replaced 状态
        await db.recommendations.bulkUpdate(
          toRemove.map(rec => ({
            key: rec.id,
            changes: {
              status: 'replaced' as const,
              replacedAt: Date.now(),
              replacedBy: 'pool-cleanup'
            }
          }))
        )
        
        // 同步更新 feedArticles 的 inPool 状态
        let updatedArticles = 0
        for (const rec of toRemove) {
          try {
            const article = await db.feedArticles
              .where('link').equals(rec.url)
              .first()
            
            if (article) {
              const now = Date.now()
              await db.feedArticles.update(article.id, {
                // Phase 13: 新字段
                poolStatus: 'exited',         // 明确的退出状态
                poolExitedAt: now,
                poolExitReason: 'replaced',    // 被清理实际是被替换
                // Phase 10: 旧字段（兼容）
                inPool: false,
                poolRemovedAt: now,
                poolRemovedReason: 'replaced'
              })
              updatedArticles++
            }
          } catch (error) {
            bgLogger.warn(`更新文章 inPool 状态失败: ${rec.url}`, error)
          }
        }
        
        bgLogger.info(`🧹 清理完成: 移除 ${toRemove.length} 条低分推荐，更新 ${updatedArticles} 篇文章状态`)
        bgLogger.info(`   保留分数范围: ${toKeep[toKeep.length - 1]?.score.toFixed(2)} - ${toKeep[0]?.score.toFixed(2)}`)
        bgLogger.info(`   移除分数范围: ${toRemove[toRemove.length - 1]?.score.toFixed(2)} - ${toRemove[0]?.score.toFixed(2)}`)
      }
    } else {
      bgLogger.debug(`推荐池正常，无需清理`)
    }
  } catch (error) {
    bgLogger.error('❌ 清理推荐池失败:', error)
  }
}

/**
 * 每日画像更新
 * 
 * 策略（保守更新，避免无意义的 AI 消耗）：
 * 1. 检查是否配置了 AI（未配置则跳过）
 * 2. 检查是否有足够的数据（至少 10 页浏览记录）
 * 3. 检查是否有新的行为数据（没有新数据则跳过，画像应该是稳定的）
 * 4. 检查距离上次更新是否超过 20 小时（避免与行为触发的更新重复）
 * 5. 执行画像重建
 */
async function dailyProfileUpdate(): Promise<void> {
  try {
    // 1. 检查 AI 配置
    const aiConfigured = await isAIConfigured()
    if (!aiConfigured) {
      bgLogger.debug('每日画像更新跳过：AI 未配置')
      return
    }
    
    // 2. 检查数据量
    const pageCount = await getPageCount()
    if (pageCount < 10) {
      bgLogger.debug(`每日画像更新跳过：数据不足 (${pageCount}/10 页)`)
      return
    }
    
    // 3. 检查是否有新的行为数据
    const { hasNewData, browseProgress, readProgress, dismissProgress } = 
      await semanticProfileBuilder.getUpdateProgress()
    
    if (!hasNewData) {
      bgLogger.debug('每日画像更新跳过：没有新的行为数据，画像应该是稳定的')
      return
    }
    
    // 4. 检查上次更新时间（避免与行为触发的更新重复）
    const profile = await db.userProfile.get('singleton')
    if (profile?.lastUpdated) {
      const hoursSinceLastUpdate = (Date.now() - profile.lastUpdated) / (1000 * 60 * 60)
      if (hoursSinceLastUpdate < 20) {
        bgLogger.debug(`每日画像更新跳过：上次更新距今仅 ${hoursSinceLastUpdate.toFixed(1)} 小时`)
        return
      }
    }
    
    // 5. 执行画像重建
    bgLogger.info('📊 开始每日画像更新...', {
      新浏览: browseProgress.current,
      新阅读: readProgress.current,
      新拒绝: dismissProgress.current
    })
    const startTime = Date.now()
    
    await ProfileUpdateScheduler.executeUpdate('每日定时更新')
    
    const duration = Date.now() - startTime
    bgLogger.info(`✅ 每日画像更新完成，耗时 ${(duration / 1000).toFixed(1)} 秒`)
  } catch (error) {
    bgLogger.error('❌ 每日画像更新失败:', error)
  }
}

/**
 * Phase 14: 每周数据清理
 * 
 * 策略：
 * 1. 清理过期文章（超过 45 天的文章）
 * 2. 清理过期推荐记录（已消费且超过 45 天的推荐）
 * 3. 清理孤儿推荐记录（对应文章已删除）
 * 
 * 保留策略：
 * - 未消费的活跃推荐始终保留（不论时间）
 * - 已标记重要的文章保留更长时间
 */
async function weeklyDataCleanup(): Promise<void> {
  try {
    const RETENTION_DAYS = 45 // 保留 45 天
    
    bgLogger.info(`🧹 开始每周数据清理（保留 ${RETENTION_DAYS} 天内的数据）...`)
    const startTime = Date.now()
    
    // 1. 清理过期文章
    bgLogger.info('  📰 清理过期文章...')
    await cleanupExpiredArticles(RETENTION_DAYS)
    
    // 2. 清理过期推荐记录
    bgLogger.info('  📋 清理过期推荐记录...')
    const recCleanupResult = await cleanupExpiredRecommendations(RETENTION_DAYS)
    
    const duration = Date.now() - startTime
    bgLogger.info(`✅ 每周数据清理完成，耗时 ${(duration / 1000).toFixed(1)} 秒`, {
      过期推荐: recCleanupResult.expiredDeleted,
      孤儿推荐: recCleanupResult.orphanDeleted
    })
  } catch (error) {
    bgLogger.error('❌ 每周数据清理失败:', error)
  }
}