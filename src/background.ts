import { BadgeManager } from './core/badge/BadgeManager'
import { ProfileUpdateScheduler } from './core/profile/ProfileUpdateScheduler'
import { initializeDatabase, getPageCount, getUnreadRecommendations, db } from './storage/db'
import type { ConfirmedVisit } from './storage/types'

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
 * 更新徽章（支持两阶段）
 * 
 * - 冷启动（< 1000 页）：显示成长树 emoji
 * - 推荐阶段（≥ 1000 页）：显示未读推荐数字
 */
async function updateBadgeWithRecommendations(): Promise<void> {
  try {
    const pageCount = await getPageCount()
    
    if (pageCount < 1000) {
      // 冷启动：只显示进度
      await BadgeManager.updateBadge(pageCount)
    } else {
      // 推荐阶段：显示未读数
      const unreadRecs = await getUnreadRecommendations(50)
      await BadgeManager.updateBadge(pageCount, unreadRecs.length)
    }
  } catch (error) {
    console.error('[Background] ❌ 更新徽章失败:', error)
    await BadgeManager.updateBadge(0, 0)
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
    await updateBadgeWithRecommendations()
    
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
 * 
 * ⚠️ 注意：不要在这里调用 initializeDatabase()
 * 数据库初始化只在 onInstalled 中进行一次
 */
;(async () => {
  try {
    console.log('[Background] Service Worker 启动...')
    
    // 更新徽章（读取数据，不初始化）
    await updateBadgeWithRecommendations()
    
    console.log('[Background] ✅ Service Worker 启动完成')
  } catch (error) {
    console.error('[Background] ❌ Service Worker 启动失败:')
    console.error('  错误类型:', (error as any)?.constructor?.name || 'Unknown')
    console.error('  错误消息:', (error as Error)?.message || String(error))
    console.error('  完整错误:', error)
    // 启动失败时设置默认徽章
    try {
      await BadgeManager.updateBadge(0)
    } catch (badgeError) {
      console.error('[Background] ❌ 徽章更新也失败:', badgeError)
    }
  }
})()

/**
 * 监听来自其他组件的消息
 * 
 * Phase 2.7: 监听推荐变化，更新徽章
 * Phase 2.1: 接收 Content Script 的页面访问数据并保存到数据库
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] 收到消息:', message.type)
  
  // 异步处理消息
  ;(async () => {
    try {
      switch (message.type) {
        case 'SAVE_PAGE_VISIT':
          // ⚠️ 新增：接收来自 Content Script 的页面访问数据
          // Content Script 不能直接访问扩展的 IndexedDB
          // 必须通过 Background 保存数据
          try {
            console.log('[Background] 保存页面访问数据...')
            const visitData = message.data as Omit<ConfirmedVisit, 'id'> & { id: string }
            
            // 添加调试信息
            console.log('[Background] 访问数据详情:', {
              url: visitData.url,
              title: visitData.title,
              分析结果: visitData.analysis,
              关键词数量: visitData.analysis?.keywords?.length || 0,
              主题: visitData.analysis?.topics,
              语言: visitData.analysis?.language
            })
            
            // 保存到数据库
            await db.confirmedVisits.add(visitData)
            
            console.log('[Background] ✅ 页面访问已保存', {
              url: visitData.url,
              title: visitData.title,
              duration: visitData.duration,
              analysis: visitData.analysis ? '有分析数据' : '无分析数据'
            })
            
            // 更新徽章
            await updateBadgeWithRecommendations()
            
            // 🔄 新增：智能调度用户画像更新
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
          // 旧消息类型（兼容）：页面记录后更新徽章
          console.log('[Background] 页面已记录，更新徽章...')
          await updateBadgeWithRecommendations()
          sendResponse({ success: true })
          break
        
        case 'RECOMMENDATION_ADDED':
          // 新增推荐后更新徽章
          console.log('[Background] 新增推荐，更新徽章...')
          await updateBadgeWithRecommendations()
          sendResponse({ success: true })
          break
        
        case 'RECOMMENDATION_READ':
          // 标记已读后更新徽章
          console.log('[Background] 推荐已读，更新徽章...')
          await updateBadgeWithRecommendations()
          sendResponse({ success: true })
          break
        
        case 'RECOMMENDATIONS_DISMISSED':
          // 批量忽略后更新徽章
          console.log('[Background] 推荐已忽略，更新徽章...')
          await updateBadgeWithRecommendations()
          sendResponse({ success: true })
          break
        
        default:
          console.warn('[Background] 未知消息类型:', message.type)
          sendResponse({ success: false, error: 'Unknown message type' })
      }
    } catch (error) {
      console.error('[Background] 处理消息失败:', error)
      sendResponse({ success: false, error: String(error) })
    }
  })()
  
  // 返回 true 表示异步响应
  return true
})

// 导出类型供其他模块使用
export { BadgeManager, ProgressStage } from './core/badge/BadgeManager'

