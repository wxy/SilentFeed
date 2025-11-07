/**
 * 采集统计组件
 *
 * 展示数据采集相关的统计信息：
 * - 页面采集数量
 * - 文本分析结果（Phase 3 完成后）
 * - 用户画像数据（Phase 3 完成后）
 * - 存储占用
 * - Top 域名
 *
 * 注意：不包括推荐相关数据，推荐数据在 RecommendationStats 组件中
 */

import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import { getStorageStats } from "@/storage/db"
import type { StorageStats } from "@/storage/types"

export function CollectionStats() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await getStorageStats()
        setStats(data)
      } catch (error) {
        console.error("[CollectionStats] 加载统计失败:", error)
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
          {_("options.collectionStats.noData")}
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
      {/* 采集概览 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📊</span>
          <span>{_("options.collectionStats.overview")}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 总页面数 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">
              {_("options.collectionStats.totalPages")}
            </div>
            <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
              {stats.pageCount}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              {_("options.collectionStats.pagesCollected")}
            </div>
          </div>

          {/* 有效记录 */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="text-sm text-green-600 dark:text-green-400 mb-1">
              {_("options.collectionStats.validRecords")}
            </div>
            <div className="text-3xl font-bold text-green-900 dark:text-green-100">
              {stats.confirmedCount}
            </div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              {_("options.collectionStats.dwellTimeOver30s")}
            </div>
          </div>

          {/* 平均停留时间 */}
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div className="text-sm text-purple-600 dark:text-purple-400 mb-1">
              {_("options.collectionStats.avgDwellTime")}
            </div>
            <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">
              {formatDuration(stats.avgDwellTime)}
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
              {_("options.collectionStats.perPage")}
            </div>
          </div>
        </div>
      </div>

      {/* 文本分析统计 (Phase 3 完成后显示) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🔤</span>
          <span>{_("options.collectionStats.textAnalysis")}</span>
        </h2>

        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-2 border-dashed border-gray-300 dark:border-gray-600">
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
            ⏳ {_("options.collectionStats.comingSoonInPhase3")}
          </p>
          <p className="text-center text-gray-400 dark:text-gray-500 text-xs mt-1">
            {_("options.collectionStats.textAnalysisHint")}
          </p>
        </div>
      </div>

      {/* 用户画像统计 (Phase 3 完成后显示) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>👤</span>
          <span>{_("options.collectionStats.userProfile")}</span>
        </h2>

        <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-2 border-dashed border-gray-300 dark:border-gray-600">
          <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
            ⏳ {_("options.collectionStats.comingSoonInPhase3")}
          </p>
          <p className="text-center text-gray-400 dark:text-gray-500 text-xs mt-1">
            {_("options.collectionStats.profileHint")}
          </p>
        </div>
      </div>

      {/* 存储占用 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>💾</span>
          <span>{_("options.collectionStats.storage")}</span>
        </h2>

        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {_("options.collectionStats.totalSize")}
            </span>
            <span className="text-lg font-semibold">
              {stats.totalSizeMB.toFixed(2)} MB
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {_("options.collectionStats.pendingVisits")}
              </span>
              <span>
                {stats.pendingCount} {_("options.collectionStats.records")}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {_("options.collectionStats.confirmedVisits")}
              </span>
              <span>
                {stats.confirmedCount} {_("options.collectionStats.records")}
              </span>
            </div>
            <div className="flex justify-between items-center text-sm text-gray-400 dark:text-gray-500">
              <span>{_("options.collectionStats.recommendations")}</span>
              <span>
                {stats.recommendationCount} {_("options.collectionStats.records")}
              </span>
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            💡 {_("options.collectionStats.storageHint")}
          </p>
        </div>
      </div>

      {/* Top 10 域名 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🌐</span>
          <span>{_("options.collectionStats.topDomains")}</span>
        </h2>

        {stats.topDomains.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-center py-4">
            {_("options.collectionStats.noDomains")}
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
                      {item.count} {_("options.collectionStats.visits")}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-cyan-500 h-2 rounded-full transition-all duration-500"
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
          <span>{_("options.collectionStats.dataManagement")}</span>
        </h2>

        <div className="space-y-3">
          <button
            disabled
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded-lg cursor-not-allowed opacity-50">
            🧹 {_("options.collectionStats.clearHistory")} (
            {_("options.collectionStats.comingSoon")})
          </button>
          <button
            disabled
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded-lg cursor-not-allowed opacity-50">
            🔄 {_("options.collectionStats.resetProfile")} (
            {_("options.collectionStats.comingSoon")})
          </button>
          <button
            disabled
            className="w-full px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 rounded-lg cursor-not-allowed opacity-50">
            ⚠️ {_("options.collectionStats.clearAll")} (
            {_("options.collectionStats.comingSoon")})
          </button>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
          {_("options.collectionStats.dataManagementHint")}
        </p>
      </div>
    </div>
  )
}
