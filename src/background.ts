import { ProfileUpdateScheduler } from './core/profile/ProfileUpdateScheduler'
import { initializeDatabase, getPageCount, getUnreadRecommendations, db, markAsRead } from './storage/db'
import type { ConfirmedVisit } from '@/types/database'
import { FeedManager } from './core/rss/managers/FeedManager'
import { RSSValidator } from './core/rss/RSSValidator'
import { fetchFeed } from './background/feed-scheduler'
import { startAllSchedulers, feedScheduler, recommendationScheduler, reconfigureSchedulersForState } from './background/index'
import { IconManager } from './utils/IconManager'
import { evaluateAndAdjust } from './core/recommender/adaptive-count'
import { setupNotificationListeners, testNotification } from './core/recommender/notification'
import { getOnboardingState } from './storage/onboarding-state'
import { logger } from '@/utils/logger'
import { LEARNING_COMPLETE_PAGES } from '@/constants/progress'
import { aiManager } from './core/ai/AICapabilityManager'
import { getAIConfig, saveAIConfig, isAIConfigured } from '@/storage/ai-config'
import { getRecommendationConfig, saveRecommendationConfig } from '@/storage/recommendation-config'
import { ReadingListManager } from './core/reading-list/reading-list-manager'

const bgLogger = logger.withTag('Background')

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
      (resource) => resource.id === 'ollama-cors-fix'
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
 * 2. 学习阶段（< 100 页） - 图标进度遮罩
 * 3. 推荐阶段（≥ 100 页） - 图标波纹点亮
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
    
    // 2. 正常图标逻辑（先设置基础状态）
    const pageCount = await getPageCount()
    
    if (pageCount < LEARNING_COMPLETE_PAGES) {
      // 学习阶段：显示进度遮罩
      iconManager.setBadgeState(pageCount, 0)  // 批量更新：学习进度 + 清除推荐
      bgLogger.debug(`📚 学习进度：${pageCount}/${LEARNING_COMPLETE_PAGES} 页`)
    } else {
      // 推荐阶段：显示推荐波纹
      const unreadRecs = await getUnreadRecommendations(50)
      const unreadCount = Math.min(unreadRecs.length, 3)  // 最多3条波纹
      iconManager.setBadgeState(LEARNING_COMPLETE_PAGES, unreadCount)
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
    const hasRecommendConfig = await chrome.storage.local.get('recommendation-config')
    if (!hasRecommendConfig['recommendation-config']) {
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
    // 1. 初始化数据库
    await initializeDatabase()
    
    // 2. 首次安装时初始化默认配置
    await initializeDefaultConfigs()
    
    // 3. 初始化 AI Manager (Phase 8)
    await aiManager.initialize()
    bgLogger.info('✅ AI Manager 初始化完成')
    
    // 4. 更新徽章
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
    
    // Phase 12.7: 数据迁移 - 为旧推荐补充 status 字段
    try {
      const oldRecs = await db.recommendations
        .filter(r => !r.status)
        .toArray()
      
      if (oldRecs.length > 0) {
        await db.recommendations.bulkUpdate(
          oldRecs.map(rec => ({
            key: rec.id,
            changes: { status: 'active' as const }
          }))
        )
        bgLogger.info(`📝 已为 ${oldRecs.length} 条旧推荐补充 status 字段`)
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
        case 'SAVE_PAGE_VISIT':
          try {
            // Phase 9.1: 检查 Onboarding 状态，setup 阶段跳过数据采集
            const onboardingStatus = await getOnboardingState()
            if (onboardingStatus.state === 'setup') {
              bgLogger.debug('⏸️ 准备阶段，跳过页面访问数据采集')
              sendResponse({ success: true, skipped: true })
              break
            }
            
            const visitData = message.data as Omit<ConfirmedVisit, 'id'> & { id: string }
            
            // 统一追踪机制：检查推荐来源（弹窗或阅读列表）
            try {
              const trackingKey = `recommendation_tracking_${visitData.url}`
              bgLogger.debug('检查推荐追踪', { trackingKey })
              
              const trackingData = await chrome.storage.session.get(trackingKey)
              bgLogger.debug('追踪数据', { trackingData })
              
              const trackingInfo = trackingData[trackingKey]
              bgLogger.debug('追踪信息', { trackingInfo })
              
              if (trackingInfo && trackingInfo.recommendationId) {
                visitData.source = 'recommended'
                visitData.recommendationId = trackingInfo.recommendationId
                
                // 记录详细来源信息
                let sourceDesc: string
                if (trackingInfo.source === 'popup') {
                  sourceDesc = trackingInfo.action === 'translated' 
                    ? '弹窗(翻译)' 
                    : '弹窗(原文)'
                } else {
                  sourceDesc = '阅读列表'
                }
                
                bgLogger.info(`✅ 检测到推荐文章打开: ${sourceDesc}`, {
                  url: visitData.url,
                  recommendationId: trackingInfo.recommendationId,
                  source: trackingInfo.source,
                  action: trackingInfo.action
                })
                
                // 统一处理：无论来源，验证后都移除追踪信息
                // 避免重复追踪（多次打开同一篇文章）
                await chrome.storage.session.remove(trackingKey)
              }
            } catch (storageError) {
              bgLogger.warn('检查推荐追踪失败', storageError)
              // 继续保存，使用 visitData 中的默认 source
            }
            
            await db.confirmedVisits.add(visitData)
            
            // 策略B：如果是从推荐点击的，30秒后标记为已读
            if (visitData.recommendationId) {
              try {
                // visitData.duration 是停留时间（秒）
                // scrollDepth 暂时没有追踪，传 undefined
                await markAsRead(
                  visitData.recommendationId,
                  visitData.duration, // readDuration
                  undefined // scrollDepth (待实现)
                )
                bgLogger.info(`✅ 推荐已验证并标记为已读: ${visitData.recommendationId}, 阅读时长: ${visitData.duration}秒`)
              } catch (markError) {
                bgLogger.error('❌ 标记推荐为已读失败:', markError)
              }
            }
            
            await updateBadge()
            // Phase 8: 传递访问数据给 ProfileUpdateScheduler 用于语义画像学习
            ProfileUpdateScheduler.checkAndScheduleUpdate(visitData).catch(error => {
              bgLogger.error('画像更新调度失败:', error)
            })
            sendResponse({ success: true })
          } catch (dbError) {
            bgLogger.error('❌ 保存页面访问失败:', dbError)
            sendResponse({ success: false, error: String(dbError) })
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
            
            // 调用重新配置函数
            await reconfigureSchedulersForState(state)
            
            sendResponse({ success: true })
          } catch (error) {
            bgLogger.error('❌ 重新配置调度器失败:', error)
            sendResponse({ success: false, error: String(error) })
          }
          break
        
        case 'RSS_DETECTED':
          try {
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
            
            // 只有真正添加了新源才重置查看状态并触发质量分析
            if (addedCount > 0) {
              bgLogger.info(`成功添加 ${addedCount} 个有效 RSS 源`)
              rssDiscoveryViewed = false
              await updateBadge()
              
              // 4. 后台异步触发质量分析（不阻塞响应）
              if (newFeedIds.length > 0) {
                bgLogger.info('开始后台质量分析...')
                Promise.all(
                  newFeedIds.map(feedId => 
                    feedManager.analyzeFeed(feedId)
                      .then(quality => {
                        if (quality) {
                          bgLogger.info(`✅ 质量分析完成: ${feedId}, 评分: ${quality.score}`)
                          
                          // 如果质量分析失败（评分为0且有错误），自动删除
                          if (quality.score === 0 && quality.error) {
                            bgLogger.warn(`⚠️ 质量分析发现错误，自动删除: ${feedId}`)
                            feedManager.delete(feedId).catch((err: Error) => {
                              bgLogger.error(`自动删除失败: ${feedId}`, err)
                            })
                          }
                        }
                      })
                      .catch((error: Error) => {
                        bgLogger.error(`❌ 质量分析失败: ${feedId}`, error)
                        // 分析失败也自动删除
                        feedManager.delete(feedId).catch((err: Error) => {
                          bgLogger.error(`自动删除失败: ${feedId}`, err)
                        })
                      })
                  )
                ).then(() => {
                  bgLogger.info('所有质量分析完成')
                }).catch(error => {
                  bgLogger.error('批量质量分析失败:', error)
                })
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
 * Phase 6/7: 定时器事件监听器
 * 处理推荐数量定期评估和推荐生成
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
      await recommendationScheduler.handleAlarm()
      // 更新徽章显示新推荐
      await updateBadge()
    } else if (alarm.name === 'cleanup-recommendation-pool') {
      // Phase 12.7: 清理超限的推荐池
      bgLogger.info('开始清理推荐池...')
      await cleanupRecommendationPool()
    } else if (alarm.name === 'daily-profile-update') {
      // 每日画像更新：确保画像至少每天更新一次
      bgLogger.info('开始每日画像更新...')
      await dailyProfileUpdate()
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
              await db.feedArticles.update(article.id, {
                inPool: false,
                poolRemovedAt: Date.now(),
                poolRemovedReason: 'pool-cleanup'
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
 * 策略：
 * 1. 检查是否配置了 AI（未配置则跳过）
 * 2. 检查是否有足够的数据（至少 10 页浏览记录）
 * 3. 检查距离上次更新是否超过 20 小时（避免与行为触发的更新重复）
 * 4. 执行画像重建
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
    
    // 3. 检查上次更新时间（避免与行为触发的更新重复）
    const profile = await db.userProfile.get('singleton')
    if (profile?.lastUpdated) {
      const hoursSinceLastUpdate = (Date.now() - profile.lastUpdated) / (1000 * 60 * 60)
      if (hoursSinceLastUpdate < 20) {
        bgLogger.debug(`每日画像更新跳过：上次更新距今仅 ${hoursSinceLastUpdate.toFixed(1)} 小时`)
        return
      }
    }
    
    // 4. 执行画像重建
    bgLogger.info('📊 开始每日画像更新...')
    const startTime = Date.now()
    
    await ProfileUpdateScheduler.executeUpdate('每日定时更新')
    
    const duration = Date.now() - startTime
    bgLogger.info(`✅ 每日画像更新完成，耗时 ${(duration / 1000).toFixed(1)} 秒`)
  } catch (error) {
    bgLogger.error('❌ 每日画像更新失败:', error)
  }
}