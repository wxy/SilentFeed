import { BadgeManager } from './core/badge/BadgeManager'

console.log('FeedAIMuter Background Service Worker 已启动')

/**
 * 扩展安装或更新时初始化徽章
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('扩展已安装/更新，初始化徽章...')
  
  // TODO: 从 storage 读取页面计数
  // 暂时使用 0 作为初始值
  const pageCount = 0
  await BadgeManager.updateBadge(pageCount)
})

/**
 * Service Worker 启动时初始化徽章
 */
;(async () => {
  // TODO: 从 storage 读取页面计数
  const pageCount = 0
  await BadgeManager.updateBadge(pageCount)
})()

// 导出类型供其他模块使用
export { BadgeManager, ProgressStage } from './core/badge/BadgeManager'

