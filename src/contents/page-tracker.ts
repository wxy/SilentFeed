/**
 * 页面访问追踪 Content Script
 * 
 * Phase 2.1 核心功能：
 * - 监听页面激活/失活
 * - 监听用户交互（scroll, click, keypress, mousemove）
 * - 使用 DwellTimeCalculator 计算有效停留时间
 * - 达到 30 秒阈值后记录到 IndexedDB
 * - 提供调试日志用于浏览器测试
 * 
 * @version 1.0
 * @date 2025-11-02
 */

import type { PlasmoCSConfig } from "plasmo"
import { DwellTimeCalculator, type InteractionType } from "~core/tracker/DwellTimeCalculator"
import { db } from "~storage/db"
import { logger } from "~utils/logger"

// 配置：注入到所有 HTTP/HTTPS 页面
export const config: PlasmoCSConfig = {
  matches: ["http://*/*", "https://*/*"],
  all_frames: false // 只在主框架中运行
}

// ==================== 类型定义 ====================

interface PageVisitData {
  url: string
  title: string
  domain: string
  visitedAt: number // 页面加载时间
  dwellTime: number // 有效停留时间（秒）
}

// ==================== 常量定义 ====================

/**
 * 停留时间阈值（秒）
 * 只有停留超过此时间的页面才会被记录
 */
const THRESHOLD_SECONDS = 30

/**
 * 检查间隔（毫秒）
 * 每隔此时间检查一次是否达到阈值
 */
const CHECK_INTERVAL_MS = 5000

// ==================== 状态管理 ====================

let calculator: DwellTimeCalculator
let isRecorded = false // 防止重复记录
let checkTimer: number | null = null // 定时检查的计时器
let eventListeners: Array<{ element: EventTarget; event: string; handler: EventListener }> = [] // 追踪所有事件监听器

// ==================== 页面信息提取 ====================

/**
 * 获取当前页面的基本信息
 */
function getPageInfo(): PageVisitData {
  const url = window.location.href
  const title = document.title || url
  const domain = window.location.hostname
  const visitedAt = Date.now()
  const dwellTime = calculator.getEffectiveDwellTime()

  return {
    url,
    title,
    domain,
    visitedAt,
    dwellTime
  }
}

// ==================== 数据记录 ====================

/**
 * 记录页面访问到数据库
 */
async function recordPageVisit(): Promise<void> {
  if (isRecorded) {
    logger.debug('🚫 [PageTracker] 已记录过，跳过')
    return
  }

  const pageInfo = getPageInfo()
  
  logger.info('💾 [PageTracker] 准备记录页面访问', {
    页面: pageInfo.title,
    URL: pageInfo.url,
    停留时间: `${pageInfo.dwellTime.toFixed(1)}秒`,
    时间戳: new Date(pageInfo.visitedAt).toLocaleTimeString()
  })

  try {
    // 先创建临时记录（Phase 2.1 简化版，直接升级为正式记录）
    // TODO Phase 2.3: 添加页面过滤逻辑
    // TODO Phase 2.4: 添加内容提取和分析
    
    // 保存到 confirmedVisits 表
    await db.confirmedVisits.add({
      id: crypto.randomUUID(),
      url: pageInfo.url,
      title: pageInfo.title,
      domain: pageInfo.domain,
      visitTime: pageInfo.visitedAt,
      duration: pageInfo.dwellTime,
      interactionCount: 0, // TODO: 实际记录交互次数
      
      // Phase 2.4 将添加完整的元数据和内容
      meta: null,
      contentSummary: null,
      
      // Phase 2.4 将添加完整的内容分析
      analysis: {
        keywords: [], // 关键词
        topics: [], // 主题分类
        language: 'zh' // 语言检测（默认中文）
      },
      
      status: 'qualified',
      
      // 数据生命周期
      contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 天后
      analysisRetainUntil: -1 // 永久保留
    })

    isRecorded = true
    logger.info('✅ [PageTracker] 页面访问已记录到数据库')
    
    // 记录成功后立即清理
    cleanup()
    
    // 通知 background 更新徽章
    chrome.runtime.sendMessage({
      type: 'PAGE_RECORDED',
      data: pageInfo
    }).catch(err => {
      logger.warn('⚠️ [PageTracker] 发送消息到 background 失败', err)
    })
    
  } catch (error) {
    logger.error('❌ [PageTracker] 记录页面访问失败', error)
  }
}

/**
 * 检查是否达到阈值
 */
function checkThreshold(): void {
  const dwellTime = calculator.getEffectiveDwellTime()
  const timeSinceInteraction = calculator.getTimeSinceLastInteraction()
  
  logger.debug('🔍 [PageTracker] 阈值检查', {
    当前停留时间: `${dwellTime.toFixed(1)}秒`,
    距上次交互: `${timeSinceInteraction.toFixed(1)}秒`,
    阈值: `${THRESHOLD_SECONDS}秒`,
    状态: dwellTime >= THRESHOLD_SECONDS ? '✅ 已达到' : `❌ 还需 ${(THRESHOLD_SECONDS - dwellTime).toFixed(1)}秒`
  })

  if (dwellTime >= THRESHOLD_SECONDS && !isRecorded) {
    logger.info('🎯 [PageTracker] 达到阈值，开始记录')
    recordPageVisit()
  }
}

// ==================== 清理函数 ====================

/**
 * 清理所有监听器和定时器
 */
function cleanup(): void {
  logger.debug('🧹 [PageTracker] 清理监听器和定时器')
  
  // 停止 DwellTimeCalculator
  calculator.stop()
  
  // 停止定时检查
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
    logger.debug('⏸️ [PageTracker] 停止阈值检查')
  }
  
  // 移除所有事件监听器
  eventListeners.forEach(({ element, event, handler }) => {
    element.removeEventListener(event, handler)
  })
  eventListeners = []
  
  logger.debug('✅ [PageTracker] 清理完成')
}

// ==================== 事件监听 ====================

/**
 * 监听页面可见性变化
 */
function setupVisibilityListener(): void {
  const handler = () => {
    const isVisible = !document.hidden
    calculator.onVisibilityChange(isVisible)
    
    if (isVisible) {
      logger.debug('👁️ [PageTracker] 页面激活，恢复追踪')
    } else {
      logger.debug('🙈 [PageTracker] 页面失活，暂停追踪')
    }
  }
  
  document.addEventListener('visibilitychange', handler)
  eventListeners.push({ element: document, event: 'visibilitychange', handler })
}

/**
 * 监听用户交互（scroll, click, keypress, mousemove）
 */
function setupInteractionListeners(): void {
  const interactionEvents: InteractionType[] = ['scroll', 'click', 'keypress', 'mousemove']
  
  interactionEvents.forEach(event => {
    const handler = () => {
      calculator.onInteraction(event)
      logger.debug(`👆 [PageTracker] 用户交互: ${event}`)
    }
    
    window.addEventListener(event, handler, { passive: true })
    eventListeners.push({ element: window, event, handler })
  })
  
  logger.debug('✅ [PageTracker] 交互监听器已设置')
}

/**
 * 启动定时检查
 */
/**
 * 开始定期检查停留时间
 */
function startThresholdChecking(): void {
  checkTimer = window.setInterval(() => {
    checkThreshold()
  }, 5000)
  
  logger.debug('⏰ [PageTracker] 开始定期检查（每 5 秒）')
}

/**
 * 页面卸载时保存数据
 */
function setupUnloadListener(): void {
  const handler = () => {
    const dwellTime = calculator.getEffectiveDwellTime()
    
    logger.debug('👋 [PageTracker] 页面卸载', {
      最终停留时间: `${dwellTime.toFixed(1)}秒`,
      是否已记录: isRecorded ? '✅ 是' : '❌ 否'
    })
    
    // 如果达到阈值但还没记录，尝试记录（可能失败）
    if (dwellTime >= THRESHOLD_SECONDS && !isRecorded) {
      logger.debug('⚡ [PageTracker] 页面卸载前记录')
      recordPageVisit() // 注意：可能因为页面关闭而失败
    }
  }
  
  window.addEventListener('beforeunload', handler)
  eventListeners.push({ element: window, event: 'beforeunload', handler })
}

// ==================== 初始化 ====================

function init(): void {
  // 初始化 DwellTimeCalculator
  calculator = new DwellTimeCalculator()
  
  logger.info('🚀 [PageTracker] 页面访问追踪已启动', {
    页面: document.title,
    URL: window.location.href,
    域名: window.location.hostname,
    时间: new Date().toLocaleTimeString()
  })

  // 设置监听器
  setupVisibilityListener()
  setupInteractionListeners()
  setupUnloadListener()
  
  // 启动定时检查
  startThresholdChecking()
  
  logger.debug('✅ [PageTracker] 所有监听器已设置')
  logger.debug(`📋 [PageTracker] 阈值: ${THRESHOLD_SECONDS} 秒，检查间隔: ${CHECK_INTERVAL_MS / 1000} 秒`)
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
