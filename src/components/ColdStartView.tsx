/**
 * 冷启动阶段组件
 * 0-100 页：显示学习进度和鼓励信息
 * 
 * Phase 5.1: 当有 RSS 发现时，临时用雷达图标替换小树
 */

import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import type { UIStyle } from "@/storage/ui-config"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import { logger } from "@/utils/logger"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"
import { CircularProgress } from "./CircularProgress"
import { IconContainer } from "./IconContainer"
import { GlassCard } from "./GlassCard"

const STAGE_THRESHOLDS = [
  { ratio: 0.25, icon: "🌱", name: "explorer" },
  { ratio: 0.6, icon: "🌿", name: "learner" },
  { ratio: 1, icon: "🌳", name: "grower" }
]

const coldStartLogger = logger.withTag("ColdStartView")

interface ColdStartViewProps {
  pageCount: number
  totalPages?: number
  uiStyle?: UIStyle
}

/**
 * 根据页面数确定成长阶段
 */
const getGrowthStage = (pageCount: number, totalPages: number) => {
  const denominator = totalPages > 0 ? totalPages : LEARNING_COMPLETE_PAGES
  const ratio = pageCount / denominator
  const stage = STAGE_THRESHOLDS.find(({ ratio: threshold }) => ratio < threshold)
  if (stage) return stage
  return { icon: "🌲", name: "master" }
}

export function ColdStartView({ pageCount, totalPages = LEARNING_COMPLETE_PAGES, uiStyle = "sketchy" }: ColdStartViewProps) {
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
  
  const denominator = totalPages > 0 ? totalPages : LEARNING_COMPLETE_PAGES
  const progress = Math.min((pageCount / denominator) * 100, 100)
  const stage = getGrowthStage(pageCount, denominator)
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
      
      // 打开设置页 RSS 标签（feeds）
      chrome.tabs.create({ 
        url: chrome.runtime.getURL('options.html#feeds')
      })
    }
  }

  return (
    <div className={isSketchyStyle ? "flex-1 flex flex-col items-center justify-center px-6 py-4" : "flex-1 flex flex-col items-center justify-center px-4 py-6 gap-4"}>
      
      {/* 标准风格：使用环形进度条 + 图标容器 + 玻璃拟态卡片 */}
      {!isSketchyStyle ? (
        <>
          {/* 环形进度条容器 */}
          <div className="mb-2">
            <CircularProgress
              progress={progress}
              icon={displayIcon}
              current={pageCount}
              total={totalPages}
              size={140}
            />
          </div>

          {/* 阶段徽章 - 玻璃拟态 */}
          <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-indigo-500/10 to-green-500/10 backdrop-blur-sm border border-indigo-200/50 dark:border-indigo-700/30">
            <span className="text-sm font-semibold bg-gradient-to-r from-indigo-600 to-green-600 dark:from-indigo-400 dark:to-green-400 bg-clip-text text-transparent">
              {_(`popup.stage.${stage.name}`)}
            </span>
          </div>

          {/* 提示卡片 - 玻璃拟态 */}
          <GlassCard variant="primary" className="w-full">
            <p className="text-xs text-center text-gray-700 dark:text-gray-300">
              {_("popup.hint")}
            </p>
          </GlassCard>
        </>
      ) : (
        /* 手绘风格：保持原有设计 */
        <>
          {/* 成长阶段图标 - 手绘风格放大显示 */}
          {/* 雷达图标可点击 */}
          <div 
            className={`sketchy-emoji text-7xl mb-4 ${hasRSSDiscovery ? 'cursor-pointer hover:scale-110 transition-transform' : ''}`}
            onClick={handleIconClick}
          >
            {displayIcon}
          </div>

          {/* 欢迎信息 - 手绘风格 */}
          <h2 className="sketchy-title text-xl text-center mb-2">
            {_("popup.welcome")}
          </h2>
          <p className="sketchy-text text-sm text-center mb-4 max-w-xs">
            {_("popup.learning")}
          </p>

          {/* 进度条 - 手绘风格 */}
          <div className="w-full mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="sketchy-badge">
                {_(`popup.stage.${stage.name}`)}
              </span>
              <span className="sketchy-text text-sm font-medium">
                {_("popup.progress", { current: pageCount, total: totalPages })}
              </span>
            </div>
            <div className="sketchy-progress">
              <div
                className="sketchy-progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* 提示信息 - 手绘风格 */}
          <div className="sketchy-card mt-4 w-full">
            <p className="sketchy-text text-sm text-center flex items-center justify-center gap-2">
              <span className="sketchy-emoji">📖</span>
              <span>{_("popup.hint")}</span>
            </p>
          </div>
        </>
      )}
    </div>
  )
}
