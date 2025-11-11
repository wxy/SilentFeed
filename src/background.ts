import { BadgeManager } from './core/badge/BadgeManager'
import { ProfileUpdateScheduler } from './core/profile/ProfileUpdateScheduler'
import { initializeDatabase, getPageCount, getUnreadRecommendations, db } from './storage/db'
import type { ConfirmedVisit } from './storage/types'
import { FeedManager } from './core/rss/managers/FeedManager'
import { RSSValidator } from './core/rss/RSSValidator'

console.log('FeedAIMuter Background Service Worker 已启动')

// 开发环境下加载调试工具
if (process.env.NODE_ENV === 'development') {
  import('./debug/generate-interest-changes').then(() => {
    console.log('🔧 开发调试工具已加载')
  }).catch(error => {
    console.error('❌ 加载调试工具失败:', error)
  })
}

/**
 * RSS 发现查看状态
 * 用于追踪用户是否已查看过 RSS 发现
 */
let rssDiscoveryViewed = false

/**
 * 统一的徽章更新函数
 * 
 * 优先级：
 * 1. RSS 发现（未查看） - 显示雷达 📡
 * 2. 学习阶段（< 1000 页） - 显示进度百分比
 * 3. 推荐阶段（≥ 1000 页） - 显示未读推荐数
 */
async function updateBadge(): Promise<void> {
  try {
    // 1. 检查是否有未查看的 RSS 发现
    const feedManager = new FeedManager()
    const candidateFeeds = await feedManager.getFeeds('candidate')
    
    if (candidateFeeds.length > 0 && !rssDiscoveryViewed) {
      // 显示雷达图标
      await chrome.action.setBadgeText({ text: '📡' })
      await chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' }) // 绿色背景
      console.log(`[Background] 📡 显示 RSS 发现提示 (${candidateFeeds.length} 个源)`)
      return
    }
    
    // 2. 正常徽章逻辑
    const pageCount = await getPageCount()
    
    if (pageCount < 1000) {
      // 学习阶段：显示进度百分比
      const progress = Math.floor((pageCount / 1000) * 100)
      await chrome.action.setBadgeText({ text: `${progress}%` })
      await chrome.action.setBadgeBackgroundColor({ color: '#2196F3' }) // 蓝色
      console.log(`[Background] 学习进度：${progress}%`)
    } else {
      // 推荐阶段：显示未读推荐数
      const unreadRecs = await getUnreadRecommendations(50)
      const unreadCount = unreadRecs.length
      await chrome.action.setBadgeText({ text: unreadCount > 0 ? String(unreadCount) : '' })
      await chrome.action.setBadgeBackgroundColor({ color: '#F44336' }) // 红色
      console.log(`[Background] 未读推荐：${unreadCount}`)
    }
  } catch (error) {
    console.error('[Background] ❌ 更新徽章失败:', error)
  }
}

/**
 * 扩展安装或更新时初始化
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] 扩展已安装/更新，开始初始化...')
  
  try {
    // 1. 初始化数据库
    await initializeDatabase()
    
    // 2. 更新徽章
    await updateBadge()
    
    console.log('[Background] ✅ 初始化完成')
  } catch (error) {
    console.error('[Background] ❌ 初始化失败:')
    console.error('  错误类型:', (error as any)?.constructor?.name || 'Unknown')
    console.error('  错误消息:', (error as Error)?.message || String(error))
    console.error('  完整错误:', error)
    // 初始化失败时设置默认徽章
    await BadgeManager.updateBadge(0)
  }
})

/**
 * Service Worker 启动时初始化徽章
 */
;(async () => {
  try {
    console.log('[Background] Service Worker 启动...')
    await updateBadge()
    console.log('[Background] ✅ Service Worker 启动完成')
  } catch (error) {
    console.error('[Background] ❌ Service Worker 启动失败:', error)
    try {
      await BadgeManager.updateBadge(0)
    } catch (badgeError) {
      console.error('[Background] ❌ 徽章更新也失败:', badgeError)
    }
  }
})()

/**
 * 监听来自其他组件的消息
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] 收到消息:', message.type)
  
  ;(async () => {
    try {
      switch (message.type) {
        case 'SAVE_PAGE_VISIT':
          try {
            const visitData = message.data as Omit<ConfirmedVisit, 'id'> & { id: string }
            await db.confirmedVisits.add(visitData)
            await updateBadge()
            ProfileUpdateScheduler.checkAndScheduleUpdate().catch(error => {
              console.error('[Background] 画像更新调度失败:', error)
            })
            sendResponse({ success: true })
          } catch (dbError) {
            console.error('[Background] ❌ 保存页面访问失败:', dbError)
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
                  console.log('[Background] 跳过已忽略的源:', feed.url)
                  continue
                } else if (existing.status === 'candidate') {
                  // 已经在候选列表中，触发徽章更新
                  console.log('[Background] 源已在候选列表中:', feed.url)
                  addedCount++
                  continue
                } else {
                  // 已订阅或推荐状态，跳过
                  console.log('[Background] 源已存在（状态: ' + existing.status + '）:', feed.url)
                  continue
                }
              }
              
              // 2. 使用 RSSValidator 验证并获取元数据
              console.log('[Background] 验证 RSS 源:', feed.url)
              const result = await RSSValidator.validateURL(feed.url)
              
              if (!result.valid || !result.metadata) {
                console.log('[Background] ❌ 验证失败，跳过:', feed.url, result.error)
                continue
              }
              
              const metadata = result.metadata
              const sourceDomain = new URL(sourceURL).hostname
              
              // 3. 添加到候选列表（使用 RSS 标题 + 域名）
              console.log('[Background] 添加到候选列表:', metadata.title)
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
              console.log(`[Background] 成功添加 ${addedCount} 个有效 RSS 源`)
              rssDiscoveryViewed = false
              await updateBadge()
              
              // 4. 后台异步触发质量分析（不阻塞响应）
              if (newFeedIds.length > 0) {
                console.log('[Background] 开始后台质量分析...')
                Promise.all(
                  newFeedIds.map(feedId => 
                    feedManager.analyzeFeed(feedId)
                      .then(quality => {
                        if (quality) {
                          console.log(`[Background] ✅ 质量分析完成: ${feedId}, 评分: ${quality.score}`)
                          
                          // 如果质量分析失败（评分为0且有错误），自动删除
                          if (quality.score === 0 && quality.error) {
                            console.log(`[Background] ⚠️ 质量分析发现错误，自动删除: ${feedId}`)
                            feedManager.delete(feedId).catch((err: Error) => {
                              console.error(`[Background] 自动删除失败: ${feedId}`, err)
                            })
                          }
                        }
                      })
                      .catch((error: Error) => {
                        console.error(`[Background] ❌ 质量分析失败: ${feedId}`, error)
                        // 分析失败也自动删除
                        feedManager.delete(feedId).catch((err: Error) => {
                          console.error(`[Background] 自动删除失败: ${feedId}`, err)
                        })
                      })
                  )
                ).then(() => {
                  console.log('[Background] 所有质量分析完成')
                }).catch(error => {
                  console.error('[Background] 批量质量分析失败:', error)
                })
              }
            }
            
            sendResponse({ success: true })
          } catch (error) {
            console.error('[Background] ❌ 处理 RSS 检测失败:', error)
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
        
        default:
          sendResponse({ success: false, error: 'Unknown message type' })
      }
    } catch (error) {
      console.error('[Background] 处理消息失败:', error)
      sendResponse({ success: false, error: String(error) })
    }
  })()
  
  return true
})

export { BadgeManager, ProgressStage } from './core/badge/BadgeManager'