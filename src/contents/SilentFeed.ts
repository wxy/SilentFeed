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
import { TitleStateManager } from './title-state-manager'
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

// ==================== 状态管理 ====================

let dwellCalculator: DwellTimeCalculator | null = null
let titleManager: TitleStateManager | null = null
let isRecorded = false
let interactionCount = 0 // 追踪用户交互次数
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
// 注意：RSS 检测功能已移至专门的 rss-detector.ts content script

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
    titleManager.reset()
  }
  
  // 重置状态变量
  isRecorded = false
  interactionCount = 0
  
  // 重新初始化
  titleManager = new TitleStateManager()
  titleManager.startLearning()
  
  dwellCalculator = new DwellTimeCalculator()
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
