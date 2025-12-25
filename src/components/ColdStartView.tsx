/**
 * 冷启动阶段组件
 * 显示学习进度和鼓励信息
 * 
 * 进度计算：综合页面数和订阅源数量
 * Phase 5.1: 当有 RSS 发现时，临时用雷达图标替换小树
 */

import { useState, useEffect, useMemo } from "react"
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
  subscribedFeedCount?: number  // 订阅源数量（用于显示）
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

export function ColdStartView({ 
  pageCount, 
  totalPages = LEARNING_COMPLETE_PAGES, 
  subscribedFeedCount = 0,
  uiStyle = "sketchy" 
}: ColdStartViewProps) {
  const { _, t } = useI18n()
  const [hasRSSDiscovery, setHasRSSDiscovery] = useState(false)
  
  // 学习阶段 Tip（与推荐阶段空窗策略一致：学习优先 howItWorks/privacy/philosophy/features）
  interface Tip { emoji: string; text: string }
  const randomTip = useMemo(() => {
    try {
      const tips = t("popup.tips", { returnObjects: true }) as Record<string, Tip[]>
      if (!tips || typeof tips !== 'object') return null
      const learningPriority = ['howItWorks', 'privacy', 'philosophy', 'features']
      const all: Tip[] = []
      for (const cat of learningPriority) {
        if (Array.isArray(tips[cat])) all.push(...tips[cat])
      }
      if (all.length === 0) return null
      const idx = Math.floor(Math.random() * all.length)
      return all[idx]
    } catch {
      return null
    }
  }, [t])
  
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
  // 进度百分比，限制在 0-100 之间
  const progressPercent = Math.min(Math.max((pageCount / denominator) * 100, 0), 100)
  const stage = getGrowthStage(pageCount, denominator)
  const isSketchyStyle = uiStyle === "sketchy"
  
  // 如果有 RSS 发现，用雷达替换成长树
  const displayIcon = hasRSSDiscovery ? '📡' : stage.icon
  
  // 进度文本：显示百分比（整数）
  const progressText = `${Math.round(progressPercent)}%`
  
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
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 gap-4">
      
      {/* 环形进度条容器 */}
      <div className="mb-2">
        <CircularProgress
          progress={progressPercent}
          icon={displayIcon}
          progressText={progressText}
          size={140}
          isSketchyStyle={isSketchyStyle}
          onIconClick={handleIconClick}
          iconClickable={hasRSSDiscovery}
        />
      </div>
      
      {/* 进度详情：显示页面数和订阅源数 */}
      {(pageCount > 0 || subscribedFeedCount > 0) && (
        <div className={`text-xs ${isSketchyStyle ? 'sketchy-text' : 'text-gray-500 dark:text-gray-400'}`}>
          {_("popup.learningStage.progressWithFeeds", { pages: pageCount, feeds: subscribedFeedCount })}
        </div>
      )}

      {/* 阶段徽章 */}
      {isSketchyStyle ? (
        <span className="sketchy-badge sketchy-shimmer">
          {_(`popup.stage.${stage.name}`)}
        </span>
      ) : (
        <div className="px-4 py-1.5 rounded-full bg-gradient-to-r from-indigo-500/10 to-cyan-500/10 backdrop-blur-sm border border-indigo-200/50 dark:border-indigo-700/30">
          <span className="text-sm font-semibold bg-gradient-to-r from-indigo-600 to-cyan-600 dark:from-indigo-400 dark:to-cyan-400 bg-clip-text text-transparent">
            {_(`popup.stage.${stage.name}`)}
          </span>
        </div>
      )}

      {/* 提示卡片 */}
      {isSketchyStyle ? (
        <div className="sketchy-card w-full sketchy-float-hover">
          <p className="sketchy-text text-sm text-center flex items-center justify-center gap-2">
            <span className="sketchy-emoji">💡</span>
            <span>{_("popup.hint")}</span>
          </p>
        </div>
      ) : (
        <GlassCard variant="primary" className="w-full">
          <p className="text-xs text-center text-gray-700 dark:text-gray-300">
            <span className="mr-1.5">💡</span>
            {_("popup.hint")}
          </p>
        </GlassCard>
      )}

      {/* 学习阶段 Tip 卡片（与推荐阶段空窗期一致） */}
      {randomTip && (
        isSketchyStyle ? (
          <div className="sketchy-card w-full sketchy-float-hover">
            <p className="sketchy-text text-xs text-center flex items-center justify-center gap-2">
              <span className="sketchy-emoji">{randomTip.emoji}</span>
              <span>{randomTip.text}</span>
            </p>
          </div>
        ) : (
          <GlassCard variant="secondary" className="w-full">
            <p className="text-xs text-center text-gray-600 dark:text-gray-400">
              <span className="mr-1.5">{randomTip.emoji}</span>
              {randomTip.text}
            </p>
          </GlassCard>
        )
      )}
    </div>
  )
}
