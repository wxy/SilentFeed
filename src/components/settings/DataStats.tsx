/**
 * 数据统计组件
 * 显示页面数、存储占用、域名Top 10等信息
 */

import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import { getStorageStats } from "@/storage/db"
import type { StorageStats } from "@/storage/types"

export function DataStats() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await getStorageStats()
        setStats(data)
      } catch (error) {
        console.error('[DataStats] 加载统计失败:', error)
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
          {_("options.dataStats.noData")}
        </p>
      </div>
    )
  }

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}秒`
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return `${minutes}分${secs}秒`
  }

  return (
    <div className="space-y-6">
      {/* 数据概览 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📚</span>
          <span>{_("options.dataStats.overview")}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* 总页面数 */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {_("options.dataStats.totalPages")}
            </div>
            <div className="text-3xl font-bold text-gray-900 dark:text-white">
              {stats.pageCount}
            </div>
          </div>

          {/* 正式记录 */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {_("options.dataStats.confirmedVisits")}
            </div>
            <div className="text-3xl font-bold text-green-600 dark:text-green-400">
              {stats.confirmedCount}
            </div>
          </div>

          {/* 推荐数 */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {_("options.dataStats.recommendations")}
            </div>
            <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
              {stats.recommendationCount}
            </div>
          </div>

          {/* 平均停留时间 */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {_("options.dataStats.avgDwellTime")}
            </div>
            <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
              {formatDuration(stats.avgDwellTime)}
            </div>
          </div>
        </div>
      </div>

      {/* 存储占用 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>💾</span>
          <span>{_("options.dataStats.storage")}</span>
        </h2>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {_("options.dataStats.totalSize")}
            </span>
            <span className="text-lg font-semibold">
              {stats.totalSizeMB.toFixed(2)} MB
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {_("options.dataStats.pendingVisits")}
              </span>
              <span>{stats.pendingCount} {_("options.dataStats.records")}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {_("options.dataStats.confirmedVisitsLabel")}
              </span>
              <span>{stats.confirmedCount} {_("options.dataStats.records")}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {_("options.dataStats.recommendationsLabel")}
              </span>
              <span>{stats.recommendationCount} {_("options.dataStats.records")}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Top 10 域名 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🌐</span>
          <span>{_("options.dataStats.topDomains")}</span>
        </h2>

        {stats.topDomains.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            {_("options.dataStats.noDomains")}
          </p>
        ) : (
          <div className="space-y-3">
            {stats.topDomains.map((item, index) => {
              const maxCount = stats.topDomains[0]?.count || 1
              const percentage = (item.count / maxCount) * 100

              return (
                <div key={item.domain}>
                  <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-6">
                        #{index + 1}
                      </span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[300px]">
                        {item.domain}
                      </span>
                    </div>
                    <span className="text-sm font-medium">
                      {item.count} {_("options.dataStats.visits")}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-purple-500 to-pink-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 数据管理 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🗂️</span>
          <span>{_("options.dataStats.dataManagement")}</span>
        </h2>

        <div className="space-y-3">
          <button
            disabled
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded-lg cursor-not-allowed opacity-50"
          >
            🧹 {_("options.dataStats.clearHistory")} ({_("options.dataStats.comingSoon")})
          </button>
          <button
            disabled
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded-lg cursor-not-allowed opacity-50"
          >
            🔄 {_("options.dataStats.resetProfile")} ({_("options.dataStats.comingSoon")})
          </button>
          <button
            disabled
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded-lg cursor-not-allowed opacity-50"
          >
            ⚠️ {_("options.dataStats.clearAll")} ({_("options.dataStats.comingSoon")})
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
          {_("options.dataStats.dataManagementHint")}
        </p>
      </div>
    </div>
  )
}
