/**
 * SilentFeed Content Script
 * 
 * 职责：
 * 1. 监听用户活动，计算停留时间
 * 2. 检测 RSS/Atom feeds
 * 3. 提取页面基础信息和内容
 * 4. 与 background 通信
 * 
 * 不做：
 * - AI 分析（由 background 处理）
 * - 数据库操作（由 background 处理）
 * - 复杂的内容处理（只提取纯文本）
 */

import type { PlasmoCSConfig } from "plasmo"
import { DwellTimeCalculator } from '@/core/tracker/DwellTimeCalculator'
import { ContentExtractor } from '@/core/extractor/ContentExtractor'
import { logger } from '@/utils/logger'

// Plasmo 配置：注入到所有 HTTP/HTTPS 页面
export const config: PlasmoCSConfig = {
  matches: ["https://*/*", "http://*/*"],
  run_at: "document_idle",
  all_frames: false
}

const sfLogger = logger.withTag('SilentFeed')

// ==================== 配置 ====================

const DWELL_TIME_THRESHOLD = 30 // 秒
const MIN_CONTENT_LENGTH = 100 // 最小内容长度

// URL 黑名单：不需要追踪的页面
const URL_BLACKLIST = [
  'https://www.google.com/warmup.html',  // Chrome 预渲染页面
  'chrome://',              // Chrome 内部页面
  'chrome-extension://',    // 扩展页面
  'about:',                 // 浏览器内部页面
  'data:',                  // Data URI
  'blob:',                  // Blob URI
  'javascript:',            // JavaScript URI
]

function isBlacklistedUrl(url: string): boolean {
  return URL_BLACKLIST.some(pattern => url.includes(pattern))
}

// ==================== 标题状态管理器 ====================

/**
 * 标题状态管理器
 * 负责在页面标题中显示学习状态 emoji
 */
class TitleStateManager {
  private originalTitle: string = document.title
  private currentEmoji: string = ''
  
  // Emoji 定义
  private readonly EMOJIS = {
    LEARNING: '📖',   // 学习中（正在阅读）
    PAUSED: '⏸️',     // 已暂停（标签页未激活）
    LEARNED: '✅',    // 已学习完成
  }
  
  /**
   * 标记页面开始学习（添加阅读 emoji）
   */
  startLearning(): void {
    this.originalTitle = this.getCleanTitle()
    this.currentEmoji = this.EMOJIS.LEARNING
    this.updateTitle()
    sfLogger.info('📖 [TitleState] 开始学习', { title: document.title })
  }
  
  /**
   * 标记页面暂停学习（标签页失活）
   */
  pauseLearning(): void {
    this.currentEmoji = this.EMOJIS.PAUSED
    this.updateTitle()
    sfLogger.debug('⏸️ [TitleState] 学习暂停', { title: document.title })
  }
  
  /**
   * 恢复学习状态（标签页激活）
   */
  resumeLearning(): void {
    this.currentEmoji = this.EMOJIS.LEARNING
    this.updateTitle()
    sfLogger.debug('▶️ [TitleState] 恢复学习', { title: document.title })
  }
  
  /**
   * 标记页面学习完成（添加完成 emoji）
   */
  completeLearning(): void {
    this.currentEmoji = this.EMOJIS.LEARNED
    this.updateTitle()
    sfLogger.info('✅ [TitleState] 学习完成', { title: document.title })
    
    // 3 秒后移除完成标记
    setTimeout(() => {
      this.clearLearning()
    }, 3000)
  }
  
  /**
   * 清除学习状态（移除 emoji）
   */
  clearLearning(): void {
    this.currentEmoji = ''
    this.updateTitle()
    sfLogger.debug('🧹 [TitleState] 清除状态', { title: document.title })
  }
  
  /**
   * 重置（用于 SPA 导航）
   */
  reset(): void {
    this.clearLearning()
    this.originalTitle = document.title
  }
  
  /**
   * 获取清理后的标题（移除所有学习相关 emoji）
   */
  private getCleanTitle(): string {
    let title = document.title
    Object.values(this.EMOJIS).forEach(emoji => {
      title = title.replace(emoji + ' ', '')
    })
    return title
  }
  
  /**
   * 更新文档标题
   */
  private updateTitle(): void {
    const cleanTitle = this.getCleanTitle()
    document.title = this.currentEmoji ? `${this.currentEmoji} ${cleanTitle}` : cleanTitle
  }
}

// ==================== 状态管理 ====================

let dwellCalculator: DwellTimeCalculator | null = null
let titleManager: TitleStateManager | null = null
let isRecorded = false
let interactionCount = 0 // 追踪用户交互次数
let hasDetectedRSS = false // RSS 检测标记
let currentUrl = window.location.href // 用于检测 SPA 导航
let checkTimer: number | null = null // 定时检查计时器

// ==================== 扩展上下文检查 ====================

function checkExtensionContext(): boolean {
  try {
    return !!chrome?.runtime?.id
  } catch (error) {
    sfLogger.error('❌ 扩展上下文检查失败', error)
    return false
  }
}

// ==================== RSS 检测 ====================

interface RSSFeedLink {
  url: string
  type: "rss" | "atom"
  title?: string
}

/**
 * 检测页面中的 RSS 链接
 * 
 * 检测策略：
 * 1. 查找 <link rel="alternate"> 标签
 * 2. 尝试常见 RSS URL 路径
 */
function detectRSSFeeds(): RSSFeedLink[] {
  const feeds: RSSFeedLink[] = []
  
  // 1. 检测 <link> 标签
  const linkElements = document.querySelectorAll<HTMLLinkElement>(
    'link[rel="alternate"][type="application/rss+xml"], ' +
    'link[rel="alternate"][type="application/atom+xml"]'
  )
  
  linkElements.forEach((link) => {
    const url = normalizeRSSURL(link.href)
    if (!url) return
    
    const type = link.type.includes("atom") ? "atom" : "rss"
    const title = link.title || document.title
    
    // 避免重复
    if (!feeds.find(f => f.url === url)) {
      feeds.push({ url, type, title })
    }
  })
  
  // 2. 如果没有找到，尝试常见路径
  if (feeds.length === 0) {
    const candidateURLs = generateCandidateRSSURLs()
    for (const url of candidateURLs) {
      feeds.push({ url, type: "rss" }) // 默认假设为 RSS
    }
  }
  
  return feeds
}

/**
 * 生成候选 RSS URL
 */
function generateCandidateRSSURLs(): string[] {
  const origin = window.location.origin
  const paths = ["/feed", "/rss", "/atom.xml", "/index.xml", "/feed.xml", "/rss.xml"]
  return paths.map(path => `${origin}${path}`)
}

/**
 * 标准化 RSS URL
 */
function normalizeRSSURL(url: string): string | null {
  try {
    const absoluteURL = new URL(url, window.location.href)
    
    // 只接受 HTTP/HTTPS 协议
    if (!absoluteURL.protocol.startsWith("http")) {
      return null
    }
    
    // 检测并转换谷歌翻译 URL
    if (absoluteURL.hostname.endsWith('.translate.goog')) {
      const originalUrl = convertGoogleTranslateUrl(absoluteURL)
      if (originalUrl) {
        return originalUrl
      }
      return null
    }
    
    return absoluteURL.href
  } catch {
    return null
  }
}

/**
 * 转换谷歌翻译 URL 为原始 URL
 */
function convertGoogleTranslateUrl(translateUrl: URL): string | null {
  try {
    const hostname = translateUrl.hostname
    const translatedDomain = hostname.replace('.translate.goog', '')
    
    // 策略：将 "--" 替换为临时占位符，"-" 替换为 "."，再将占位符替换回 "-"
    const placeholder = '\x00'
    const originalDomain = translatedDomain
      .replace(/--/g, placeholder)
      .replace(/-/g, '.')
      .replace(new RegExp(placeholder, 'g'), '-')
    
    const originalUrl = new URL(translateUrl.pathname, `https://${originalDomain}`)
    
    // 保留非翻译相关的查询参数
    const params = new URLSearchParams(translateUrl.search)
    const translateParams = ['_x_tr_sl', '_x_tr_tl', '_x_tr_hl', '_x_tr_pto', '_x_tr_hist']
    translateParams.forEach(param => params.delete(param))
    
    if (params.toString()) {
      originalUrl.search = params.toString()
    }
    
    return originalUrl.href
  } catch {
    return null
  }
}

/**
 * 发送 RSS 检测结果到 background
 */
async function notifyRSSFeeds() {
  if (hasDetectedRSS) return
  if (!checkExtensionContext()) return
  
  const feeds = detectRSSFeeds()
  if (feeds.length === 0) return
  
  hasDetectedRSS = true
  
  try {
    await chrome.runtime.sendMessage({
      type: 'RSS_DETECTED',
      payload: {
        feeds,
        sourceURL: window.location.href,
        sourceTitle: document.title,
        detectedAt: Date.now()
      }
    })
    
    sfLogger.info('📡 RSS feeds detected', { count: feeds.length })
  } catch (error) {
    sfLogger.error('Failed to notify RSS feeds', error)
  }
}

// ==================== 内容提取 ====================

interface PageMetadata {
  description?: string
  keywords?: string[]
  author?: string
  publishedTime?: string
  ogImage?: string
  canonical?: string
}

function extractMetadata(): PageMetadata | null {
  const meta: PageMetadata = {}
  
  // Description
  const descMeta = document.querySelector('meta[name="description"]') as HTMLMetaElement
  if (descMeta?.content) {
    meta.description = descMeta.content
  }
  
  // Keywords
  const keywordsMeta = document.querySelector('meta[name="keywords"]') as HTMLMetaElement
  if (keywordsMeta?.content) {
    meta.keywords = keywordsMeta.content.split(',').map(k => k.trim())
  }
  
  // Author
  const authorMeta = document.querySelector('meta[name="author"]') as HTMLMetaElement
  if (authorMeta?.content) {
    meta.author = authorMeta.content
  }
  
  // Published time
  const timeMeta = document.querySelector('meta[property="article:published_time"]') as HTMLMetaElement
  if (timeMeta?.content) {
    meta.publishedTime = timeMeta.content
  }
  
  // OG Image
  const ogImageMeta = document.querySelector('meta[property="og:image"]') as HTMLMetaElement
  if (ogImageMeta?.content) {
    meta.ogImage = ogImageMeta.content
  }
  
  // Canonical URL
  const canonicalLink = document.querySelector('link[rel="canonical"]') as HTMLLinkElement
  if (canonicalLink?.href) {
    meta.canonical = canonicalLink.href
  }
  
  return Object.keys(meta).length > 0 ? meta : null
}

function extractPageContent(): string {
  try {
    const extractor = new ContentExtractor()
    const extracted = extractor.extract(document)
    
    if (!extracted.content || extracted.content.trim().length < MIN_CONTENT_LENGTH) {
      sfLogger.debug('Content too short, skipping')
      return ''
    }
    
    // 合并标题、描述和内容
    let fullText = ''
    if (extracted.title) {
      fullText += extracted.title + '\n\n'
    }
    if (extracted.description) {
      fullText += extracted.description + '\n\n'
    }
    if (extracted.content) {
      fullText += extracted.content
    }
    
    return fullText.trim()
  } catch (error) {
    sfLogger.error('Content extraction failed', error)
    return ''
  }
}

// ==================== 页面访问通知 ====================

async function notifyPageVisit() {
  if (isRecorded) return
  if (!checkExtensionContext()) return
  
  const dwellTime = dwellCalculator?.getEffectiveDwellTime() || 0
  if (dwellTime < DWELL_TIME_THRESHOLD) {
    return
  }
  
  sfLogger.info('📤 准备发送页面访问数据', {
    url: window.location.href,
    停留时间: `${dwellTime.toFixed(1)}秒`,
    交互次数: interactionCount
  })
  
  // 提取数据
  const metadata = extractMetadata()
  const content = extractPageContent()
  
  if (!content) {
    return
  }
  
  // 发送到 background
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'PAGE_VISIT',
      payload: {
        url: window.location.href,
        title: document.title,
        domain: window.location.hostname,
        visitTime: Date.now(),
        duration: dwellTime,
        interactionCount: interactionCount,
        meta: metadata,
        content: content
      }
    })
    
    if (response?.success) {
      isRecorded = true
      
      if (response.deduplicated) {
        // 重复访问：静默处理，清除学习标记
        sfLogger.info('🔄 重复访问，已合并')
        titleManager?.clearLearning()
      } else {
        // 新访问：显示完成标记
        sfLogger.info('✅ 新访问已记录', {
          主题: response.analysis?.topics?.slice(0, 3).join(', '),
          provider: response.analysis?.provider
        })
        titleManager?.completeLearning()
      }
      
      // 🔧 Phase 15.2: 如果是从阅读清单打开且阅读已完成，自动删除条目
      if (response.fromReadingList && response.readingComplete) {
        try {
          // 从 Chrome Reading List 删除该条目
          await chrome.readingList.removeEntry({
            url: window.location.href
          })
          sfLogger.info('✅ 已从阅读清单自动删除（阅读完成）', {
            url: window.location.href
          })
        } catch (error) {
          // 删除失败不影响主流程
          sfLogger.warn('从阅读清单删除失败（不影响主功能）:', error)
        }
      }
    } else {
      sfLogger.error('❌ 记录失败', response?.error)
    }
  } catch (error) {
    // 静默处理错误，不干扰用户
    sfLogger.error('Communication error', error)
  }
}

// ==================== 初始化 ====================

function initialize() {
  // 检查环境
  const hasContext = checkExtensionContext()
  if (!hasContext) {
    sfLogger.error('❌ 扩展上下文无效，停止初始化')
    return
  }
  
  // 检查 URL 黑名单
  const currentUrl = window.location.href
  const isBlacklisted = isBlacklistedUrl(currentUrl)
  if (isBlacklisted) {
    return
  }
  
  sfLogger.info('🚀 SilentFeed 初始化', {
    url: currentUrl,
    title: document.title,
    readyState: document.readyState
  })
  
  // 初始化状态管理器并显示学习图标
  titleManager = new TitleStateManager()
  titleManager.startLearning()
  
  // 初始化计时器（构造函数自动开始计时）
  dwellCalculator = new DwellTimeCalculator()
  
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', () => {
    if (!dwellCalculator || !titleManager) return
    
    const isVisible = !document.hidden
    dwellCalculator.onVisibilityChange(isVisible)
    
    if (isVisible) {
      titleManager.resumeLearning()
    } else {
      titleManager.pauseLearning()
    }
  })
  
  // 监听用户交互（并计数）
  const interactionEvents = ['scroll', 'click', 'keypress', 'mousemove'] as const
  interactionEvents.forEach(eventType => {
    document.addEventListener(eventType, () => {
      if (dwellCalculator) {
        dwellCalculator.onInteraction(eventType)
        interactionCount++
      }
    }, { passive: true })
  })
  
  // 设置定期检查（每 5 秒检查一次是否达到阈值）
  checkTimer = window.setInterval(() => {
    if (!isRecorded && dwellCalculator) {
      const dwellTime = dwellCalculator.getEffectiveDwellTime()
      
      if (dwellTime >= DWELL_TIME_THRESHOLD) {
        sfLogger.info('✅ 达到阈值，准备记录', {
          时间: `${dwellTime.toFixed(1)}秒`
        })
        notifyPageVisit()
      }
    }
  }, 5000)
  
  // 监听 SPA 导航
  setupSPANavigation()
  
  // RSS 检测（页面加载后）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      notifyRSSFeeds()
    })
  } else {
    notifyRSSFeeds()
  }
}

// ==================== SPA 导航监听 ====================

// 保存原始方法（在模块作用域，避免作用域问题）
const originalPushState = history.pushState.bind(history)
const originalReplaceState = history.replaceState.bind(history)

function setupSPANavigation() {
  // 监听浏览器历史变化（后退/前进）
  window.addEventListener('popstate', handleUrlChange)
  
  // 监听哈希变化
  window.addEventListener('hashchange', handleUrlChange)
  
  // 拦截 history.pushState 和 replaceState
  history.pushState = function(...args) {
    originalPushState(...args)
    setTimeout(handleUrlChange, 0)
    return undefined
  } as typeof history.pushState
  
  history.replaceState = function(...args) {
    originalReplaceState(...args)
    setTimeout(handleUrlChange, 0)
  } as typeof history.replaceState
}

function handleUrlChange() {
  const newUrl = window.location.href
  
  if (newUrl !== currentUrl) {
    sfLogger.info('🔄 SPA 导航', {
      from: currentUrl,
      to: newUrl
    })
    
    // 尝试记录当前页面（如果达到阈值）
    if (!isRecorded && dwellCalculator) {
      const dwellTime = dwellCalculator.getEffectiveDwellTime()
      if (dwellTime >= DWELL_TIME_THRESHOLD) {
        notifyPageVisit()
      }
    }
    
    // 重置追踪状态
    resetTracking()
    currentUrl = newUrl
  }
}

function resetTracking() {
  // 清理旧状态
  if (dwellCalculator) {
    dwellCalculator.stop()
  }
  
  if (titleManager) {
    titleManager.clearLearning()
  }
  
  // 重置状态变量
  isRecorded = false
  interactionCount = 0
  hasDetectedRSS = false
  
  // 重新初始化
  titleManager = new TitleStateManager()
  titleManager.startLearning()
  
  dwellCalculator = new DwellTimeCalculator()
  
  // 重新检测 RSS
  notifyRSSFeeds()
}

// ==================== 清理 ====================

function cleanup() {
  // 清除定时器
  if (checkTimer) {
    clearInterval(checkTimer)
    checkTimer = null
  }
  
  if (dwellCalculator) {
    // 如果达到阈值但尚未记录，尝试记录
    const dwellTime = dwellCalculator.getEffectiveDwellTime()
    if (dwellTime >= DWELL_TIME_THRESHOLD && !isRecorded) {
      notifyPageVisit()
    }
    
    dwellCalculator.stop()
    dwellCalculator = null
  }
  
  if (titleManager) {
    titleManager.clearLearning()
    titleManager = null
  }
}

// ==================== 生命周期 ====================

window.addEventListener('beforeunload', cleanup)
window.addEventListener('pagehide', cleanup)

// 启动（等待 DOM 加载完成）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize)
} else {
  initialize()
}
