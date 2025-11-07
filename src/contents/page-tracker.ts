/**
 * 页面访问追踪 Content Script
 * 
 * Phase 2.1 核心功能：
 * - 监听页面激活/失活
 * - 监听用户交互（scroll, click, keypress, mousemove）
 * - 使用 DwellTimeCalculator 计算有效停留时间
 * - 达到 30 秒阈值后通过消息传递给 Background 记录
 * - 提供调试日志用于浏览器测试
 * 
 * ⚠️ 架构说明：
 * - Content Script 运行在网页上下文中
 * - 不能直接访问扩展的 IndexedDB（会创建在网页的存储空间）
 * - 必须通过 chrome.runtime.sendMessage 发送数据到 Background
 * - Background 负责所有数据库操作
 * 
 * @version 2.0
 * @date 2025-11-04
 */

import type { PlasmoCSConfig } from "plasmo"
import { DwellTimeCalculator, type InteractionType } from "~core/tracker/DwellTimeCalculator"
import { contentExtractor } from "~core/extractor"
import { TextAnalyzer } from "~core/analyzer"
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
let isContextValid = true // 扩展上下文是否有效（热重载检测）

// ==================== 扩展上下文检测 ====================

/**
 * 检查扩展上下文是否有效
 * 在开发模式下，热重载会导致 chrome.runtime 失效
 */
function checkExtensionContext(): boolean {
  if (!isContextValid) {
    return false
  }
  
  try {
    // 尝试访问 chrome.runtime.id，如果失效会抛出错误
    if (!chrome.runtime?.id) {
      isContextValid = false
      return false
    }
    return true
  } catch (error) {
    isContextValid = false
    // 开发环境的上下文失效是正常现象（热重载），使用 debug 而非 warn
    logger.debug('⚠️ [PageTracker] 扩展上下文已失效（可能是热重载），停止追踪')
    cleanup()
    return false
  }
}

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

// ==================== 内容提取与分析 ====================

/**
 * 提取页面元数据
 */
async function extractPageMetadata() {
  try {
    const extracted = contentExtractor.extract(document)
    
    return {
      description: extracted.description || undefined,
      keywords: extracted.metaKeywords.length > 0 ? extracted.metaKeywords : undefined,
      author: document.querySelector('meta[name="author"]')?.getAttribute('content') || undefined,
      publishedTime: document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || 
                    document.querySelector('meta[name="publish-date"]')?.getAttribute('content') || undefined,
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') || undefined,
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') || undefined,
    }
  } catch (error) {
    logger.debug('⚠️ [PageTracker] 元数据提取失败', error)
    return null
  }
}

/**
 * 提取内容摘要
 */
async function extractContentSummary() {
  try {
    const extracted = contentExtractor.extract(document)
    
    // 提取首段（前 500 字）
    const firstParagraph = extracted.content.slice(0, 500)
    
    return {
      firstParagraph,
      extractedText: extracted.content,
      wordCount: extracted.content.length,
      language: extracted.language,
    }
  } catch (error) {
    logger.debug('⚠️ [PageTracker] 内容摘要提取失败', error)
    return null
  }
}

/**
 * 分析页面内容
 */
async function analyzePageContent() {
  try {
    const extracted = contentExtractor.extract(document)
    const analyzer = new TextAnalyzer()
    
    // 合并标题和内容进行分析
    const fullText = extracted.title + ' ' + extracted.description + ' ' + extracted.content
    
    // 提取关键词
    const keywords = analyzer.extractKeywords(fullText, { topK: 20 }).map(kw => kw.word)
    
    // 简单的主题分类（基于关键词匹配）
    const topics = classifyTopics(keywords)
    
    return {
      keywords,
      topics,
      language: extracted.language,
    }
  } catch (error) {
    logger.debug('⚠️ [PageTracker] 内容分析失败', error)
    return {
      keywords: [],
      topics: [],
      language: 'other' as const,
    }
  }
}

/**
 * 简单的主题分类（基于关键词匹配）
 * 将在 Phase 3.3 中完善
 */
function classifyTopics(keywords: string[]): string[] {
  const topicKeywords = {
    technology: ['programming', 'code', 'software', 'developer', 'algorithm', 
                '编程', '代码', '软件', '开发', '算法', 'javascript', 'python', 'react', 'vue'],
    design: ['design', 'ui', 'ux', 'interface', 'typography', 
            '设计', '界面', '视觉', '交互', '排版'],
    science: ['research', 'study', 'experiment', 'scientific', 'theory',
             '研究', '实验', '科学', '理论', '数据'],
    business: ['business', 'marketing', 'finance', 'management', 'strategy',
              '商业', '营销', '金融', '管理', '战略'],
  }
  
  const detectedTopics: string[] = []
  
  Object.entries(topicKeywords).forEach(([topic, words]) => {
    const hasMatch = keywords.some(keyword => 
      words.some(word => 
        keyword.toLowerCase().includes(word.toLowerCase()) || 
        word.toLowerCase().includes(keyword.toLowerCase())
      )
    )
    
    if (hasMatch) {
      detectedTopics.push(topic)
    }
  })
  
  return detectedTopics.length > 0 ? detectedTopics : ['other']
}

// ==================== 数据记录 ====================

/**
 * 记录页面访问到数据库
 */
async function recordPageVisit(): Promise<void> {
  // 检查扩展上下文
  if (!checkExtensionContext()) {
    logger.debug('⚠️ [PageTracker] 扩展上下文失效，跳过记录')
    return
  }
  
  if (isRecorded) {
    logger.debug('🚫 [PageTracker] 已记录过，跳过')
    return
  }

  const pageInfo = getPageInfo()
  
    // Phase 2.7 Step 6: 检测访问来源
  let source: 'organic' | 'recommended' | 'search' = 'organic'
  let recommendationId: string | undefined
  
  try {
    // 检查 chrome.storage 是否可用
    if (!checkExtensionContext() || !chrome?.storage?.local) {
      logger.debug('⚠️ [PageTracker] Chrome storage 不可用，跳过来源检测')
      // 继续记录，但使用默认来源
    } else {
      try {
        // 1. 尝试从 chrome.storage 读取追踪信息
        const trackingKey = `tracking_${pageInfo.url}`
        const result = await chrome.storage.local.get(trackingKey)
        const trackingInfo = result[trackingKey]
        
        if (trackingInfo && trackingInfo.expiresAt > Date.now()) {
          source = trackingInfo.source || 'organic'
          recommendationId = trackingInfo.recommendationId
          logger.debug('🔗 [PageTracker] 检测到推荐来源', { source, recommendationId })
          
          // 使用后立即删除追踪信息
          await chrome.storage.local.remove(trackingKey)
        } else {
          // 2. 检测是否来自搜索引擎（基于 referrer）
          const referrer = document.referrer
          if (referrer) {
            try {
              const referrerUrl = new URL(referrer)
              const searchEngines = ['google.com', 'bing.com', 'baidu.com', 'duckduckgo.com']
              if (searchEngines.some(engine => referrerUrl.hostname.includes(engine))) {
                source = 'search'
                logger.debug('🔍 [PageTracker] 检测到搜索引擎来源', { referrer })
              }
            } catch (urlError) {
              // 无效的 referrer URL，忽略
              logger.debug('⚠️ [PageTracker] 无效的 referrer URL')
            }
          }
        }
      } catch (storageError) {
        logger.debug('⚠️ [PageTracker] Chrome storage 访问失败，使用默认来源', storageError)
      }
    }
  } catch (error) {
    logger.debug('⚠️ [PageTracker] 检测来源失败，使用默认值', error)
  }
  
  logger.info('💾 [PageTracker] 准备记录页面访问', {
    页面: pageInfo.title,
    URL: pageInfo.url,
    停留时间: `${pageInfo.dwellTime.toFixed(1)}秒`,
    来源: source,
    时间戳: new Date(pageInfo.visitedAt).toLocaleTimeString()
  })

  try {
    // ⚠️ 架构变更：不再直接访问数据库
    // Content Script 通过消息传递数据到 Background
    // Background 负责所有数据库操作
    
    // 检查扩展上下文
    if (!checkExtensionContext()) {
      logger.debug('⚠️ [PageTracker] 扩展上下文失效，无法记录')
      return
    }
    
    // 构建完整的访问记录数据
    const visitData = {
      id: crypto.randomUUID(),
      url: pageInfo.url,
      title: pageInfo.title,
      domain: pageInfo.domain,
      visitTime: pageInfo.visitedAt,
      duration: pageInfo.dwellTime,
      interactionCount: 0, // TODO: 实际记录交互次数
      
      // Phase 2.7 Step 6: 来源追踪
      source,
      recommendationId,
      
      // Phase 3.2: 提取页面内容和分析
      meta: await extractPageMetadata(),
      contentSummary: await extractContentSummary(),
      analysis: await analyzePageContent(),
      
      status: 'qualified' as const,
      
      // 数据生命周期
      contentRetainUntil: Date.now() + 90 * 24 * 60 * 60 * 1000, // 90 天后
      analysisRetainUntil: -1 // 永久保留
    }
    
    // 发送消息到 Background 保存数据
    const response = await chrome.runtime.sendMessage({
      type: 'SAVE_PAGE_VISIT',
      data: visitData
    })
    
    if (response?.success) {
      isRecorded = true
      logger.info('✅ [PageTracker] 页面访问已记录到数据库（通过 Background）')
      
      // 记录成功后立即清理
      cleanup()
    } else {
      throw new Error(response?.error || '未知错误')
    }
    
  } catch (error) {
    // 开发环境的上下文错误是正常现象
    if (error instanceof Error && error.message?.includes('Extension context')) {
      logger.debug('⚠️ [PageTracker] 扩展上下文失效（热重载导致）')
    } else {
      logger.error('❌ [PageTracker] 记录页面访问失败', error)
    }
  }
}

/**
 * 检查是否达到阈值
 */
function checkThreshold(): void {
  // 检查扩展上下文
  if (!checkExtensionContext()) {
    return
  }
  
  const dwellTime = calculator.getEffectiveDwellTime()

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
  logger.debug('🧹 [PageTracker] 清理资源')
  
  // 停止 DwellTimeCalculator
  calculator.stop()
  
  // 停止定时检查
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
  
  // 移除所有事件监听器
  eventListeners.forEach(({ element, event, handler }) => {
    element.removeEventListener(event, handler)
  })
  eventListeners = []
}

// ==================== 事件监听 ====================

/**
 * 监听页面可见性变化
 */
function setupVisibilityListener(): void {
  const handler = () => {
    const isVisible = !document.hidden
    calculator.onVisibilityChange(isVisible)
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
    }
    
    window.addEventListener(event, handler, { passive: true })
    eventListeners.push({ element: window, event, handler })
  })
}

/**
 * 开始定期检查停留时间
 */
function startThresholdChecking(): void {
  checkTimer = window.setInterval(() => {
    checkThreshold()
  }, CHECK_INTERVAL_MS)
  
  logger.debug('⏰ [PageTracker] 开始定期检查')
}

/**
 * 页面卸载时保存数据
 */
function setupUnloadListener(): void {
  const handler = () => {
    const dwellTime = calculator.getEffectiveDwellTime()
    
    // 如果达到阈值但还没记录，尝试记录（可能失败）
    if (dwellTime >= THRESHOLD_SECONDS && !isRecorded) {
      logger.debug('⚡ [PageTracker] 页面卸载前记录')
      recordPageVisit()
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
    URL: window.location.href
  })

  // 设置监听器
  setupVisibilityListener()
  setupInteractionListeners()
  setupUnloadListener()
  
  // 启动定时检查
  startThresholdChecking()
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
