import { BadgeManager } from './core/badge/BadgeManager'
import { initializeDatabase, getPageCount } from './storage/db'

console.log('FeedAIMuter Background Service Worker 已启动')

/**
 * 扩展安装或更新时初始化
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Background] 扩展已安装/更新，开始初始化...')
  
  try {
    // 1. 初始化数据库
    await initializeDatabase()
    
    // 2. 从数据库读取页面计数并更新徽章
    const pageCount = await getPageCount()
    await BadgeManager.updateBadge(pageCount)
    
    console.log(`[Background] ✅ 初始化完成，当前页面计数: ${pageCount}`)
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
    
    // 只读取数据，不初始化数据库
    const pageCount = await getPageCount()
    await BadgeManager.updateBadge(pageCount)
    
    console.log(`[Background] ✅ Service Worker 启动完成，当前页面计数: ${pageCount}`)
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

// 导出类型供其他模块使用
export { BadgeManager, ProgressStage } from './core/badge/BadgeManager'

