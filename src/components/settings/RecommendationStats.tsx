/**
 * 推荐统计组件
 * 显示推荐效果、阅读率、趋势等信息
 */

import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import { getRecommendationStats } from "@/storage/db"
import type { RecommendationStats } from "@/storage/types"

export function RecommendationStats() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<RecommendationStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await getRecommendationStats()
        setStats(data)
      } catch (error) {
        console.error('[RecommendationStats] 加载统计失败:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStats()
  }, [])

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <p className="text-gray-500 dark:text-gray-400 text-center py-8">
          {_("options.stats.noData")}
        </p>
      </div>
    )
  }

  const readRate = stats.totalCount > 0 
    ? Math.round((stats.readCount / stats.totalCount) * 100) 
    : 0

  const readLaterRate = stats.totalCount > 0
    ? Math.round((stats.readLaterCount / stats.totalCount) * 100)
    : 0

  const dismissedRate = stats.totalCount > 0
    ? Math.round((stats.dismissedCount / stats.totalCount) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* 推荐效果概览 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📊</span>
          <span>{_("options.stats.recommendationOverview")}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 总推荐数 */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {_("options.stats.totalRecommendations")}
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {stats.totalCount}
            </div>
          </div>

          {/* 已读数 */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {_("options.stats.readCount")}
            </div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {stats.readCount}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {readRate}% {_("options.stats.readRate")}
            </div>
          </div>

          {/* 未读数 */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {_("options.stats.unreadCount")}
            </div>
            <div className="text-3xl font-bold text-orange-600 dark:text-orange-400">
              {stats.unreadCount}
            </div>
          </div>
        </div>
      </div>

      {/* 用户反馈统计 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📈</span>
          <span>{_("options.stats.feedbackStats")}</span>
        </h2>

        <div className="space-y-3">
          {/* 已读 */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                ✅ {_("options.stats.read")}
              </span>
              <span className="text-sm font-medium">
                {stats.readCount} ({readRate}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${readRate}%` }}
              />
            </div>
          </div>

          {/* 稍后读 */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                📌 {_("options.stats.readLater")}
              </span>
              <span className="text-sm font-medium">
                {stats.readLaterCount} ({readLaterRate}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${readLaterRate}%` }}
              />
            </div>
          </div>

          {/* 不想读 */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                ❌ {_("options.stats.dismissed")}
              </span>
              <span className="text-sm font-medium">
                {stats.dismissedCount} ({dismissedRate}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className="bg-gray-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${dismissedRate}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 提示信息 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <span className="text-blue-600 dark:text-blue-400 text-lg">💡</span>
          <div className="flex-1">
            <p className="text-sm text-blue-900 dark:text-blue-100">
              {_("options.stats.hint")}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
