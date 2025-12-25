import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import type { DiscoveredFeed } from "@/types/rss"
import { logger } from "@/utils/logger"

const feedsCardLogger = logger.withTag("DiscoveredFeedsCard")

/**
 * 转换谷歌翻译域名为原始域名
 * 例如：juejin-cn.translate.goog → juejin.cn
 */
function convertTranslateDomain(hostname: string): string {
  if (!hostname.endsWith('.translate.goog')) {
    return hostname
  }
  
  const translatedDomain = hostname.replace('.translate.goog', '')
  const placeholder = '\x00'
  const originalDomain = translatedDomain
    .replace(/--/g, placeholder)
    .replace(/-/g, '.')
    .replace(new RegExp(placeholder, 'g'), '-')
  
  return originalDomain
}

/**
 * 转换谷歌翻译 URL 为原始 URL
 * 处理完整的 URL，包括路径和参数
 */
function convertTranslateUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    const originalHostname = convertTranslateDomain(urlObj.hostname)
    
    if (originalHostname === urlObj.hostname) {
      return url // 非翻译 URL，直接返回
    }
    
    // 重建 URL，移除翻译参数
    const newUrl = new URL(urlObj.pathname + urlObj.hash, `${urlObj.protocol}//${originalHostname}`)
    
    // 保留非翻译相关的查询参数
    const params = new URLSearchParams(urlObj.search)
    const translateParams = ['_x_tr_sl', '_x_tr_tl', '_x_tr_hl', '_x_tr_pto', '_x_tr_hist']
    translateParams.forEach(param => params.delete(param))
    
    if (params.toString()) {
      newUrl.search = params.toString()
    }
    
    return newUrl.href
  } catch {
    return url // 解析失败，返回原 URL
  }
}

/**
 * 发现的 RSS 源卡片
 * Phase 5.1: 显示候选 RSS 源列表，提供查看/忽略操作
 */
export function DiscoveredFeedsCard() {
  const { _ } = useI18n()
  const [feeds, setFeeds] = useState<DiscoveredFeed[]>([])
  const [loading, setLoading] = useState(true)

  // 加载候选源
  useEffect(() => {
    loadFeeds()
  }, [])

  const loadFeeds = async () => {
    try {
      const feedManager = new FeedManager()
      const candidateFeeds = await feedManager.getFeeds('candidate')
      setFeeds(candidateFeeds)
    } catch (error) {
      feedsCardLogger.error('加载候选源失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 忽略源
  const handleIgnore = async (feedId: string) => {
    try {
      const feedManager = new FeedManager()
      await feedManager.ignore(feedId)
      
      // 移除已忽略的源
      setFeeds(prev => prev.filter(f => f.id !== feedId))
      
      // 更新徽章
      chrome.runtime.sendMessage({ type: 'RSS_IGNORED' })
    } catch (error) {
      feedsCardLogger.error('忽略源失败:', error)
    }
  }

  // 查看源（打开新标签页）- 转换翻译 URL
  const handleView = (feed: DiscoveredFeed) => {
    const originalUrl = convertTranslateUrl(feed.url)
    chrome.tabs.create({ url: originalUrl })
  }

  if (loading) {
    return (
      <div className="sketchy-card mb-3">
        <div className="sketchy-emoji text-2xl animate-pulse">🔍</div>
        <p className="sketchy-text text-sm mt-2">加载中...</p>
      </div>
    )
  }

  if (feeds.length === 0) {
    return null // 无候选源时不显示
  }

  return (
    <div className="sketchy-card mb-3">
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="sketchy-emoji text-2xl">📡</span>
        <h3 className="sketchy-title text-base">
          发现 {feeds.length} 个 RSS 源
        </h3>
      </div>

      {/* 源列表 */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {feeds.map(feed => {
          // 转换所有可能的翻译 URL
          const originalFeedUrl = convertTranslateUrl(feed.url)
          const originalDiscoveredFrom = convertTranslateUrl(feed.discoveredFrom)
          const discoveredHostname = convertTranslateDomain(new URL(feed.discoveredFrom).hostname)
          
          return (
            <div 
              key={feed.id} 
              className="sketchy-card-nested p-2"
            >
              {/* 源标题 - 添加悬浮提示显示完整转换后的 URL */}
              <div 
                className="sketchy-text text-sm font-medium mb-1 truncate"
                title={originalFeedUrl}
              >
                {feed.title}
              </div>
              
              {/* 来源页面 - 显示转换后的域名，悬浮显示完整 URL */}
              <div 
                className="sketchy-text-muted text-xs mb-2 truncate"
                title={originalDiscoveredFrom}
              >
                来自: {discoveredHostname}
              </div>
              
              {/* 操作按钮 */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleView(feed)}
                  className="sketchy-button-small flex-1"
                  title={`查看 RSS: ${originalFeedUrl}`}
                >
                  🔗 查看
                </button>
                <button
                  onClick={() => handleIgnore(feed.id)}
                  className="sketchy-button-small-secondary flex-1"
                >
                  🚫 忽略
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {/* 提示文本 */}
      <p className="sketchy-text-muted text-xs mt-3">
        💡 我们会分析这些源的内容质量和相关性，推荐优质源供你订阅
      </p>
    </div>
  )
}
