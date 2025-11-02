import { BadgeManager } from './core/badge/BadgeManager'
import { initializeDatabase, getPageCount } from './storage/db'

console.log('FeedAIMuter Background Service Worker 已启动')

/**
 * 扩展安装或更新时初始化
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('扩展已安装/更新，开始初始化...')
  
  // 1. 初始化数据库
  await initializeDatabase()
  
  // 2. 从数据库读取页面计数并更新徽章
  const pageCount = await getPageCount()
  await BadgeManager.updateBadge(pageCount)
  
  console.log(`✅ 初始化完成，当前页面计数: ${pageCount}`)
})

/**
 * Service Worker 启动时初始化徽章
 */
;(async () => {
  try {
    // 初始化数据库（如果已存在则跳过）
    await initializeDatabase()
    
    // 从数据库读取页面计数
    const pageCount = await getPageCount()
    await BadgeManager.updateBadge(pageCount)
    
    console.log(`✅ Service Worker 启动完成，当前页面计数: ${pageCount}`)
  } catch (error) {
    console.error('❌ Service Worker 初始化失败:', error)
  }
})()

// 导出类型供其他模块使用
export { BadgeManager, ProgressStage } from './core/badge/BadgeManager'

