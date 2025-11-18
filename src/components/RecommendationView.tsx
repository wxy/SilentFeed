/**
 * 推荐阶段组件
 * Phase 6: 固定高度布局，克制设计
 * - 顶部工具栏：设置、RSS源（可选）、全部不想读
 * - 推荐列表：固定高度，无滚动条
 * - 用户行为跟踪：点击、不想读、全部不想读
 */

import { useEffect, useState } from "react"
import { useI18n } from "@/i18n/helpers"
import { useRecommendationStore } from "@/stores/recommendationStore"
import { FeedManager } from "@/core/rss/managers/FeedManager"
import { getRecommendationConfig } from "@/storage/recommendation-config"
import {
  trackRecommendationClick,
  trackDismiss,
  trackDismissAll
} from "@/core/recommender/adaptive-count"
import { sanitizeHtml } from "@/utils/html"
import { getFaviconUrl, handleFaviconError } from "@/utils/favicon"
import { formatRecommendationReason } from "@/utils/formatReason"
import type { Recommendation } from "@/types/database"
import { logger } from "@/utils/logger"

const recViewLogger = logger.withTag("RecommendationView")

/**
 * 获取推荐引擎标志（基于结构化数据或字符串）
 */
function getEngineLabel(recommendation: Recommendation, t: (key: string) => string): { emoji: string; text: string } {
  const reason = recommendation.reason
  
  // 如果是结构化数据
  if (typeof reason === 'object' && reason !== null) {
    const { provider, isReasoning } = reason
    if (provider === 'deepseek' && isReasoning) {
      return { emoji: "🧠", text: t("popup.engine.reasoningAI") }
    } else if (provider === 'keyword') {
      return { emoji: "🔍", text: t("popup.engine.algorithm") }
    } else {
      return { emoji: "🤖", text: t("popup.engine.ai") }
    }
  }
  
  // 兼容旧版本字符串数据
  const reasonStr = typeof reason === 'string' ? reason : ""
  if (reasonStr.includes("推理AI")) {
    return { emoji: "🧠", text: t("popup.engine.reasoningAI") }
  } else if (reasonStr.includes("AI")) {
    return { emoji: "🤖", text: t("popup.engine.ai") }
  } else if (reasonStr.includes("算法")) {
    return { emoji: "🔍", text: t("popup.engine.algorithm") }
  } else {
    return { emoji: "🔍", text: t("popup.engine.algorithm") }
  }
}

export function RecommendationView() {
  const { _, t } = useI18n()
  const {
    recommendations,
    isLoading,
    error,
    loadRecommendations,
    markAsRead,
    dismissAll,
    dismissSelected
  } = useRecommendationStore()
  
  const [maxRecommendations, setMaxRecommendations] = useState(5)
  const [hasRSSFeeds, setHasRSSFeeds] = useState(false)

  // 加载推荐配置
  useEffect(() => {
    const loadConfig = async () => {
      const config = await getRecommendationConfig()
      setMaxRecommendations(config.maxRecommendations)
    }
    loadConfig()
  }, [])

  // 检查是否有发现的RSS源
  useEffect(() => {
    const checkRSSFeeds = async () => {
      try {
        const feedManager = new FeedManager()
        const candidateFeeds = await feedManager.getFeeds('candidate')
        setHasRSSFeeds(candidateFeeds.length > 0)
      } catch (error) {
        recViewLogger.error('检查RSS源失败:', error)
      }
    }
    checkRSSFeeds()
  }, [])

  // 组件挂载时加载推荐
  useEffect(() => {
    loadRecommendations()
  }, [loadRecommendations])

  const handleItemClick = async (rec: Recommendation, event: React.MouseEvent) => {
    try {
      recViewLogger.debug(`点击推荐条目: ${rec.id} - ${rec.title}`)
      
      // 立即添加视觉反馈：降低透明度，表示正在处理
      const element = event.currentTarget as HTMLElement
      element.style.opacity = '0.6'
      element.style.pointerEvents = 'none'
      
      // Phase 6: 跟踪推荐点击
      await trackRecommendationClick()
      
      // 打开链接
      await chrome.tabs.create({ url: rec.url })
      
      // 标记为已读（这会立即从列表中移除该条目）
      recViewLogger.debug(`开始标记为已读: ${rec.id}`)
      await markAsRead(rec.id)
      recViewLogger.info(`✅ 标记已读完成，条目已从列表移除: ${rec.id}`)
      
    } catch (error) {
      recViewLogger.error('❌ 处理点击失败:', error)
      
      // 恢复视觉状态（如果操作失败）
      const element = event.currentTarget as HTMLElement
      element.style.opacity = '1'
      element.style.pointerEvents = 'auto'
    }
  }

  const handleDismiss = async (recId: string, event: React.MouseEvent) => {
    event.stopPropagation() // 阻止点击事件冒泡
    
    try {
      recViewLogger.debug(`点击不想读: ${recId}`)
      
      // Phase 6: 跟踪单个不想读
      await trackDismiss()
      
      // 调用store的dismissSelected方法来真正删除推荐
      recViewLogger.debug(`开始标记为不想读: ${recId}`)
      await dismissSelected([recId])
      recViewLogger.info(`✅ 标记不想读完成: ${recId}`)
      
    } catch (error) {
      recViewLogger.error('❌ 标记不想读失败:', error)
      
      // 如果删除失败，给用户提示
      const element = event.currentTarget.closest('[data-recommendation-id]')
      if (element) {
        ;(element as HTMLElement).style.opacity = '0.3'
        ;(element as HTMLElement).style.pointerEvents = 'none'
      }
    }
  }

  const handleDismissAll = async () => {
    if (recommendations.length === 0) return
    
    const confirmed = confirm(
      _("popup.confirmDismissAll", { count: Math.min(recommendations.length, maxRecommendations) })
    )
    
    if (confirmed) {
      // Phase 6: 跟踪全部不想读（强信号）
      await trackDismissAll()
      
      await dismissAll()
    }
  }

  const openSettings = () => {
    chrome.runtime.openOptionsPage()
  }

  const openRSSManagement = () => {
    chrome.tabs.create({ 
      url: chrome.runtime.getURL('options.html#rss')
    })
  }

  // 只显示前N条推荐（根据配置）
  const displayedRecommendations = recommendations.slice(0, maxRecommendations)

  if (isLoading && recommendations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {_("popup.loading")}
          </p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">
            {error}
          </p>
          <button
            onClick={loadRecommendations}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            {_("popup.retry")}
          </button>
        </div>
      </div>
    )
  }

  if (displayedRecommendations.length === 0) {
    return (
      <div className="flex flex-col">
        {/* 顶部工具栏 */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <button
            onClick={openSettings}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            ⚙️ {_("popup.settings")}
          </button>
          
          {hasRSSFeeds && (
            <button
              onClick={openRSSManagement}
              className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
              <span>📡</span>
              <span>{_("popup.rssFeeds")}</span>
            </button>
          )}
        </div>
        
        {/* 空状态 */}
        <div className="h-[300px] flex items-center justify-center">
          <div className="text-center px-6">
            <div className="text-4xl mb-4">✨</div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              {_("popup.noRecommendations")}
            </p>
            <button
              onClick={async () => {
                const { generateRecommendations } = useRecommendationStore.getState()
                await generateRecommendations()
                await loadRecommendations()
              }}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors mb-3"
              disabled={isLoading}
            >
              {isLoading ? _("popup.generating") : `🤖 ${_("popup.generateNow")}`}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              {_("popup.checkBackLater")}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* 顶部工具栏 */}
      <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={openSettings}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            ⚙️ {_("popup.settings")}
          </button>
          
          {hasRSSFeeds && (
            <button
              onClick={openRSSManagement}
              className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-xs hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
            >
              <span>📡</span>
              <span>{_("popup.rssFeeds")}</span>
            </button>
          )}
        </div>
        
        <button
          onClick={handleDismissAll}
          className="text-xs text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
        >
          {_("popup.dismissAll")}
        </button>
      </div>

      {/* 推荐列表 - 无滚动条，动态高度 */}
      <div className="flex flex-col">
        {displayedRecommendations.map((rec, index) => (
          <RecommendationItem
            key={rec.id}
            recommendation={rec}
            isTopItem={index === 0} // 第一条显示摘要
            onClick={(e) => handleItemClick(rec, e)}
            onDismiss={(e) => handleDismiss(rec.id, e)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 推荐条目组件
 * Phase 6 优化：紧凑布局，适应600px高度限制
 * - 第一条（评分最高）显示摘要（max-h-32 = 128px）
 * - 其他条目保持紧凑（h-16 = 64px）
 * - 显示文章长度、阅读时长、推荐理由
 */
interface RecommendationItemProps {
  recommendation: Recommendation
  isTopItem: boolean  // 是否为第一条（评分最高）
  onClick: (event: React.MouseEvent) => void
  onDismiss: (event: React.MouseEvent) => void
}

function RecommendationItem({ recommendation, isTopItem, onClick, onDismiss }: RecommendationItemProps) {
  const { _, t } = useI18n()
  
  // 第一条显示摘要，需要更大的高度（但限制最大高度避免溢出）
  if (isTopItem) {
    return (
      <div
        data-recommendation-id={recommendation.id}
        className="max-h-32 px-4 py-2 border-b-2 border-blue-200 dark:border-blue-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors bg-blue-50/30 dark:bg-blue-900/10"
      >
        {/* 标题行 - 限制单行 */}
        <div 
          onClick={(e) => onClick(e)}
          className="cursor-pointer mb-1.5"
        >
          <h3 className="text-sm font-medium line-clamp-1 leading-snug">
            {sanitizeHtml(recommendation.title)}
          </h3>
        </div>
        
        {/* 摘要 - 仅第一条显示，限制2行 */}
        {(recommendation.excerpt || recommendation.summary) && (
          <div 
            onClick={(e) => onClick(e)}
            className="cursor-pointer mb-1.5"
          >
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 leading-relaxed">
              {sanitizeHtml(recommendation.excerpt || recommendation.summary)}
            </p>
          </div>
        )}
        
        {/* 推荐理由 - 限制单行 */}
        {recommendation.reason && (
          <div className="mb-1.5">
            <p className="text-xs text-blue-700 dark:text-blue-300 italic line-clamp-1">
              💡 {sanitizeHtml(formatRecommendationReason(recommendation.reason, t))}
            </p>
          </div>
        )}
        
        {/* 底部信息栏 */}
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex items-center gap-1 text-gray-500 dark:text-gray-500 truncate">
              <img 
                src={getFaviconUrl(recommendation.sourceUrl || recommendation.url)} 
                alt="" 
                className="w-4 h-4 flex-shrink-0"
                onError={handleFaviconError}
              />
              <span className="truncate">{recommendation.source}</span>
            </span>
            
            {recommendation.wordCount && (
              <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">
                📏 {formatWordCount(recommendation.wordCount)}
              </span>
            )}
            
            {recommendation.readingTime && (
              <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">
                ⏱️ {recommendation.readingTime}分钟
              </span>
            )}
            
            {recommendation.score && (
              <span className="text-green-600 dark:text-green-400 font-medium flex-shrink-0">
                ⭐ {Math.round(recommendation.score * 100)}%
              </span>
            )}
            
            {/* 推荐引擎标志 */}
            <span className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0 ml-1">
              {(() => {
                const { emoji, text } = getEngineLabel(recommendation, _)
                return `${emoji} ${text}`
              })()}
            </span>
          </div>
          
          <button
            onClick={onDismiss}
            className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-red-100 dark:hover:bg-red-900 hover:text-red-600 dark:hover:text-red-300 transition-colors flex-shrink-0 ml-2"
            title={_("popup.notInterested")}
          >
            ❌
          </button>
        </div>
      </div>
    )
  }
  
  // 其他条目保持紧凑 - h-16 = 64px
  return (
    <div
      data-recommendation-id={recommendation.id}
      className="h-16 px-4 py-2 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex flex-col justify-between"
    >
      {/* 标题行 - 单行，超出隐藏 */}
      <div 
        onClick={(e) => onClick(e)}
        className="cursor-pointer flex-1 overflow-hidden"
      >
        <h3 className="text-sm font-medium line-clamp-1 leading-snug">
          {sanitizeHtml(recommendation.title)}
        </h3>
      </div>
      
      {/* 底部信息栏 */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="flex items-center gap-1 text-gray-500 dark:text-gray-500 truncate">
            <img 
              src={getFaviconUrl(recommendation.sourceUrl || recommendation.url)} 
              alt="" 
              className="w-4 h-4 flex-shrink-0"
              onError={handleFaviconError}
            />
            <span className="truncate">{recommendation.source}</span>
          </span>
          
          {recommendation.wordCount && (
            <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">
              📏 {formatWordCount(recommendation.wordCount)}
            </span>
          )}
          
          {recommendation.readingTime && (
            <span className="text-gray-500 dark:text-gray-500 flex-shrink-0">
              ⏱️ {recommendation.readingTime}min
            </span>
          )}
          
          {recommendation.score && (
            <span className="text-green-600 dark:text-green-400 font-medium flex-shrink-0">
              {Math.round(recommendation.score * 100)}%
            </span>
          )}
          
          {/* 推荐引擎标志 */}
          <span className="text-xs text-gray-500 dark:text-gray-500 flex-shrink-0 ml-1">
            {(() => {
              const { emoji, text } = getEngineLabel(recommendation, _)
              return `${emoji} ${text}`
            })()}
          </span>
        </div>
        
        <button
          onClick={onDismiss}
          className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-red-100 dark:hover:bg-red-900 hover:text-red-600 dark:hover:text-red-300 transition-colors flex-shrink-0 ml-2"
          title={_("popup.notInterested")}
        >
          ❌
        </button>
      </div>
    </div>
  )
}

/**
 * 格式化字数显示
 */
function formatWordCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万字`
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k字`
  }
  return `${count}字`
}
