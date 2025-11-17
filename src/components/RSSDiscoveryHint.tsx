import { useState, useEffect } from "react"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import { logger } from "@/utils/logger"

const discoveryLogger = logger.withTag("RSSDiscoveryHint")

/**
 * RSS 发现提示组件
 * 
 * 极简设计：只显示雷达图标 + 右上角数字徽章
 * 点击后跳转到设置页 RSS 标签
 */
export function RSSDiscoveryHint() {
  const [feedCount, setFeedCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFeedCount()
  }, [])

  const loadFeedCount = async () => {
    try {
      const feedManager = new FeedManager()
      const candidateFeeds = await feedManager.getFeeds('candidate')
      setFeedCount(candidateFeeds.length)
    } catch (error) {
      discoveryLogger.error('加载候选源数量失败:', error)
    } finally {
      setLoading(false)
    }
  }

  // 点击雷达图标
  const handleClick = () => {
    // 1. 标记为已查看
    chrome.runtime.sendMessage({ type: 'RSS_DISCOVERY_VIEWED' })
    
    // 2. 打开设置页，定位到 RSS 标签（使用 URL hash）
    chrome.tabs.create({ 
      url: chrome.runtime.getURL('options.html#rss')
    })
  }

  if (loading || feedCount === 0) {
    return null
  }

  return (
    <div className="relative inline-block cursor-pointer" onClick={handleClick}>
      {/* 雷达图标 */}
      <div className="sketchy-emoji text-7xl hover:scale-110 transition-transform">
        📡
      </div>
      
      {/* 右上角数字徽章 */}
      <div className="absolute -top-2 -right-2 bg-green-500 text-white rounded-full w-8 h-8 flex items-center justify-center font-bold text-sm shadow-lg">
        {feedCount}
      </div>
    </div>
  )
}
