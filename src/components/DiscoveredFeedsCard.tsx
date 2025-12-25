import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import type { DiscoveredFeed } from "@/types/rss"
import { logger } from "@/utils/logger"

const feedsCardLogger = logger.withTag("DiscoveredFeedsCard")

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

  // 查看源（打开新标签页）
  const handleView = (feed: DiscoveredFeed) => {
    chrome.tabs.create({ url: feed.url })
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
        {feeds.map(feed => (
          <div 
            key={feed.id} 
            className="sketchy-card-nested p-2"
          >
            {/* 源标题 */}
            <div className="sketchy-text text-sm font-medium mb-1 truncate">
              {feed.title}
            </div>
            
            {/* 来源页面 - 转换翻译域名 */}
            <div className="sketchy-text-muted text-xs mb-2 truncate">
              来自: {(() => {
                const hostname = new URL(feed.discoveredFrom).hostname
                // 如果是翻译域名，转换为原始域名
                if (hostname.endsWith('.translate.goog')) {
                  const translatedDomain = hostname.replace('.translate.goog', '')
                  const placeholder = '\x00'
                  const originalDomain = translatedDomain
                    .replace(/--/g, placeholder)
                    .replace(/-/g, '.')
                    .replace(new RegExp(placeholder, 'g'), '-')
                  return originalDomain
                }
                return hostname
              })()}
            </div>
            
            {/* 操作按钮 */}
            <div className="flex gap-2">
              <button
                onClick={() => handleView(feed)}
                className="sketchy-button-small flex-1"
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
        ))}
      </div>

      {/* 提示文本 */}
      <p className="sketchy-text-muted text-xs mt-3">
        💡 我们会分析这些源的内容质量和相关性，推荐优质源供你订阅
      </p>
    </div>
  )
}
