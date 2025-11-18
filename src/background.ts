import { ProfileUpdateScheduler } from './core/profile/ProfileUpdateScheduler'
import { initializeDatabase, getPageCount, getUnreadRecommendations, db } from './storage/db'
import type { ConfirmedVisit } from '@/types/database'
import { FeedManager } from './core/rss/managers/FeedManager'
import { RSSValidator } from './core/rss/RSSValidator'
import { feedScheduler, fetchFeed } from './background/feed-scheduler'
import { IconManager } from './utils/IconManager'
import { evaluateAndAdjust } from './core/recommender/adaptive-count'
import { setupNotificationListeners, testNotification } from './core/recommender/notification'
import { recommendationService } from './core/recommender/RecommendationService'
import { logger } from '@/utils/logger'
import { LEARNING_COMPLETE_PAGES } from '@/constants/progress'

const bgLogger = logger.withTag('Background')

bgLogger.info('FeedAIMuter Background Service Worker 已启动')

// Phase 5.2: 初始化图标管理器
let iconManager: IconManager | null = null

// 开发环境下加载调试工具
if (process.env.NODE_ENV === 'development') {
  import('./debug/generate-interest-changes').then(() => {
    bgLogger.info('🔧 开发调试工具已加载')
  }).catch(error => {
    bgLogger.error('❌ 加载调试工具失败:', error)
  })
}

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
    
    // 1. 检查是否有未查看的 RSS 发现
    const feedManager = new FeedManager()
    const candidateFeeds = await feedManager.getFeeds('candidate')
    
    if (candidateFeeds.length > 0 && !rssDiscoveryViewed) {
      // 启动 RSS 发现动画
      iconManager.startDiscoverAnimation()
      bgLogger.info(`📡 启动 RSS 发现动画 (${candidateFeeds.length} 个源)`)
      return
    }
    
    // 停止发现动画(如果在播放)
    iconManager.stopDiscoverAnimation()
    
    // 2. 正常图标逻辑
    const pageCount = await getPageCount()
    
    if (pageCount < LEARNING_COMPLETE_PAGES) {
      // 学习阶段：显示进度遮罩
      iconManager.setLearningProgress(pageCount)
      iconManager.setRecommendCount(0)  // 清除推荐
      bgLogger.debug(`学习进度：${pageCount}/${LEARNING_COMPLETE_PAGES} 页`)
    } else {
      // 推荐阶段：显示推荐波纹
      const unreadRecs = await getUnreadRecommendations(50)
      const unreadCount = Math.min(unreadRecs.length, 3)  // 最多3条波纹
      iconManager.setRecommendCount(unreadCount)
      iconManager.setLearningProgress(LEARNING_COMPLETE_PAGES)  // 学习完成
      bgLogger.debug(`未读推荐：${unreadCount}`)
    }
  } catch (error) {
    bgLogger.error('❌ 更新图标失败:', error)
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
    
    // 2. 更新徽章
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
    
    // Phase 5 Sprint 3: 启动 RSS 定时调度器
    bgLogger.info('启动 RSS 定时调度器...')
    feedScheduler.start(30) // 每 30 分钟检查一次
    
    // Phase 6: 启动推荐数量定期评估
    bgLogger.info('创建推荐数量评估定时器（每周一次）...')
    chrome.alarms.create('evaluate-recommendations', {
      periodInMinutes: 7 * 24 * 60 // 每 7 天（1 周）
    })
    
    // Phase 6: 启动推荐生成定时任务
    bgLogger.info('创建推荐生成定时器（每 20 分钟生成 1 条）...')
    chrome.alarms.create('generate-recommendation', {
      periodInMinutes: 20 // 每 20 分钟生成一次推荐
    })
    
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
            const visitData = message.data as Omit<ConfirmedVisit, 'id'> & { id: string }
            await db.confirmedVisits.add(visitData)
            await updateBadge()
            ProfileUpdateScheduler.checkAndScheduleUpdate().catch(error => {
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
              bgLogger.debug('验证 RSS 源:', feed.url)
              const result = await RSSValidator.validateURL(feed.url)
              
              if (!result.valid || !result.metadata) {
                bgLogger.debug('❌ 验证失败，跳过:', { url: feed.url, error: result.error })
                continue
              }
              
              const metadata = result.metadata
              const sourceDomain = new URL(sourceURL).hostname
              
              // 3. 添加到候选列表（使用 RSS 标题 + 域名）
              bgLogger.info('添加到候选列表:', metadata.title)
              const feedId = await feedManager.addCandidate({
                url: feed.url,
                title: `${metadata.title} - ${sourceDomain}`,
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
              throw new Error(`抓取失败: ${feed.title}`)
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
 * Phase 6: 定时器事件监听器
 * 处理推荐数量定期评估和推荐生成
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  bgLogger.debug('定时器触发:', alarm.name)
  
  try {
    if (alarm.name === 'evaluate-recommendations') {
      bgLogger.info('开始评估推荐数量...')
      const newCount = await evaluateAndAdjust()
      bgLogger.info(`✅ 推荐数量已调整为: ${newCount} 条`)
    } else if (alarm.name === 'generate-recommendation') {
      // 检查是否达到学习阈值
      const pageCount = await getPageCount()
      if (pageCount < LEARNING_COMPLETE_PAGES) {
        bgLogger.debug(`跳过推荐生成：当前 ${pageCount} 页，需要 ${LEARNING_COMPLETE_PAGES} 页`)
        return
      }
      
      bgLogger.info('开始自动生成推荐（每次 1 条）...')
      
      const result = await recommendationService.generateRecommendations(
        1, // 每次只生成 1 条
        'subscribed', // 只从订阅源
        10 // 批次大小
      )
      
      bgLogger.info('推荐生成结果:', {
        生成数量: result.stats.recommendedCount,
        处理文章: result.stats.processedArticles,
        总文章数: result.stats.totalArticles,
        耗时: `${result.stats.processingTimeMs}ms`,
        推荐详情: result.recommendations.map(r => ({
          标题: r.title,
          评分: r.score,
          来源: r.source
        }))
      })
      
      if (result.stats.recommendedCount > 0) {
        bgLogger.info(`✅ 自动推荐生成完成: ${result.stats.recommendedCount} 条`)
        // 更新徽章显示新推荐
        await updateBadge()
      } else {
        bgLogger.info('暂无新推荐')
      }
    }
  } catch (error) {
    bgLogger.error('❌ 定时器处理失败:', error)
  }
})