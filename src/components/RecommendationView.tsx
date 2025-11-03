/**
 * 推荐阶段组件
 * 1000+ 页：显示推荐列表
 */

import { useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import { useRecommendationStore } from "@/stores/recommendationStore"
import type { Recommendation } from "@/storage/types"

export function RecommendationView() {
  const { _ } = useI18n()
  const {
    recommendations,
    isLoading,
    error,
    loadRecommendations,
    markAsRead,
    dismissAll
  } = useRecommendationStore()

  // 组件挂载时加载推荐
  useEffect(() => {
    loadRecommendations()
  }, [loadRecommendations])

  const handleItemClick = async (rec: Recommendation) => {
    // 打开链接
    await chrome.tabs.create({ url: rec.url })
    
    // 标记为已读（这里简单标记，后续 Step 6 会添加实际的阅读追踪）
    await markAsRead(rec.id)
  }

  const handleDismissAll = async () => {
    if (recommendations.length === 0) return
    
    const confirmed = confirm(
      _("popup.confirmDismiss", { count: recommendations.length })
    )
    
    if (confirmed) {
      await dismissAll()
    }
  }

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
          <p className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
          <button
            onClick={loadRecommendations}
            className="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm"
          >
            {_("popup.retry")}
          </button>
        </div>
      </div>
    )
  }

  if (recommendations.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center px-6">
          <div className="text-4xl mb-4">✨</div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {_("popup.noRecommendations")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
            {_("popup.checkBackLater")}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* 推荐列表头部 */}
      <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <div>
          <h2 className="text-sm font-medium">
            {_("popup.recommendations")}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {_("popup.recommendationCount", { count: recommendations.length })}
          </p>
        </div>
        {recommendations.length > 0 && (
          <button
            onClick={handleDismissAll}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            {_("popup.dismissAll")}
          </button>
        )}
      </div>

      {/* 推荐列表 */}
      <div className="flex-1 overflow-y-auto">
        {recommendations.map((rec) => (
          <RecommendationItem
            key={rec.id}
            recommendation={rec}
            onClick={() => handleItemClick(rec)}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * 推荐条目组件
 */
interface RecommendationItemProps {
  recommendation: Recommendation
  onClick: () => void
}

function RecommendationItem({ recommendation, onClick }: RecommendationItemProps) {
  const { _ } = useI18n()
  
  return (
    <div
      onClick={onClick}
      className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors"
    >
      {/* 标题 */}
      <h3 className="text-sm font-medium mb-1 line-clamp-2">
        {recommendation.title}
      </h3>
      
      {/* 摘要 */}
      {recommendation.summary && (
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
          {recommendation.summary}
        </p>
      )}
      
      {/* 来源和分数 */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-500 dark:text-gray-500 flex items-center gap-1">
          <span>📡</span>
          <span>{recommendation.source}</span>
        </span>
        
        {recommendation.score && (
          <span className="text-green-600 dark:text-green-400 font-medium">
            {Math.round(recommendation.score * 100)}%
          </span>
        )}
      </div>
    </div>
  )
}
