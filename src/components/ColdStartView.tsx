/**
 * 冷启动阶段组件
 * 0-1000 页：显示学习进度和鼓励信息
 * 
 * Phase 5.1: 当有 RSS 发现时，临时用雷达图标替换小树
 */

import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import type { UIStyle } from "@/storage/ui-config"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import { logger } from "@/utils/logger"

const coldStartLogger = logger.withTag("ColdStartView")

interface ColdStartViewProps {
  pageCount: number
  totalPages?: number
  uiStyle?: UIStyle
}

/**
 * 根据页面数确定成长阶段
 */
const getGrowthStage = (pageCount: number) => {
  if (pageCount < 250) return { icon: "🌱", name: "explorer" }
  if (pageCount < 600) return { icon: "🌿", name: "learner" }
  if (pageCount < 1000) return { icon: "🌳", name: "grower" }
  return { icon: "🌲", name: "master" }
}

export function ColdStartView({ pageCount, totalPages = 1000, uiStyle = "sketchy" }: ColdStartViewProps) {
  const { _ } = useI18n()
  const [hasRSSDiscovery, setHasRSSDiscovery] = useState(false)
  
  // 检查是否有 RSS 发现
  useEffect(() => {
    const checkRSSDiscovery = async () => {
      try {
        const feedManager = new FeedManager()
        const candidateFeeds = await feedManager.getFeeds('candidate')
        setHasRSSDiscovery(candidateFeeds.length > 0)
      } catch (error) {
        coldStartLogger.error('检查 RSS 发现失败:', error)
      }
    }
    
    checkRSSDiscovery()
    
    // 监听消息，当用户查看后立即恢复显示
    const messageListener = (message: any) => {
      if (message.type === 'RSS_DISCOVERY_VIEWED') {
        setHasRSSDiscovery(false)
      }
    }
    chrome.runtime.onMessage.addListener(messageListener)
    
    // 每 5 秒检查一次（以防 popup 打开时发现新 RSS）
    const interval = setInterval(checkRSSDiscovery, 5000)
    
    return () => {
      clearInterval(interval)
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [])
  
  const progress = Math.min((pageCount / totalPages) * 100, 100)
  const stage = getGrowthStage(pageCount)
  const isSketchyStyle = uiStyle === "sketchy"
  
  // 如果有 RSS 发现，用雷达替换成长树
  const displayIcon = hasRSSDiscovery ? '📡' : stage.icon
  
  // 点击雷达图标
  const handleIconClick = () => {
    if (hasRSSDiscovery) {
      // 立即恢复显示（先更新 UI，再执行其他操作）
      setHasRSSDiscovery(false)
      
      // 标记为已查看
      chrome.runtime.sendMessage({ type: 'RSS_DISCOVERY_VIEWED' })
      
      // 打开设置页 RSS 标签
      chrome.tabs.create({ 
        url: chrome.runtime.getURL('options.html#rss')
      })
    }
  }

  return (
    <div className={isSketchyStyle ? "flex-1 flex flex-col items-center justify-center px-6 py-4" : "flex-1 flex flex-col items-center justify-center px-4 py-6"}>
      {/* 成长阶段图标 - 手绘风格放大显示 */}
      {/* 雷达图标可点击 */}
      <div 
        className={`${isSketchyStyle ? 'sketchy-emoji text-7xl' : 'text-8xl'} mb-4 ${hasRSSDiscovery ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
        onClick={handleIconClick}
      >
        {displayIcon}
      </div>

      {/* 欢迎信息 - 手绘风格 */}
      <h2 className={isSketchyStyle ? "sketchy-title text-xl text-center mb-2" : "text-2xl font-bold text-center mb-3"}>
        {_("popup.welcome")}
      </h2>
      <p className={isSketchyStyle ? "sketchy-text text-sm text-center mb-4 max-w-xs" : "text-sm text-gray-600 dark:text-gray-400 text-center mb-6 max-w-xs"}>
        {_("popup.learning")}
      </p>

      {/* 进度条 - 手绘风格 */}
      <div className="w-full mb-3">
        <div className={`flex justify-between items-center ${isSketchyStyle ? 'mb-2' : 'mb-3'}`}>
          <span className={isSketchyStyle ? "sketchy-badge" : "px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-sm font-semibold"}>
            {_(`popup.stage.${stage.name}`)}
          </span>
          <span className={isSketchyStyle ? "sketchy-text text-sm font-medium" : "text-sm font-medium"}>
            {_("popup.progress", { current: pageCount, total: totalPages })}
          </span>
        </div>
        <div className={isSketchyStyle ? "sketchy-progress" : "w-full h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"}>
          <div
            className={isSketchyStyle ? "sketchy-progress-bar" : "h-full bg-green-500 transition-all duration-500"}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* 提示信息 - 手绘风格 */}
      <div className={isSketchyStyle ? "sketchy-card mt-4 w-full" : "mt-6 w-full p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"}>
        <p className={isSketchyStyle ? "sketchy-text text-sm text-center flex items-center justify-center gap-2" : "text-sm text-center flex items-center justify-center gap-2 text-blue-800 dark:text-blue-200"}>
          <span className={isSketchyStyle ? "sketchy-emoji" : ""}>📖</span>
          <span>{_("popup.hint")}</span>
        </p>
      </div>
    </div>
  )
}
