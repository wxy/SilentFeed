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
import { getStorageStats, getAnalysisStats } from "@/storage/db"
import { dataMigrator } from "@/core/migrator/DataMigrator"
import type { StorageStats } from "@/storage/types"
import { UserProfileDisplay } from "./UserProfileDisplay"

export function CollectionStats() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [analysisStats, setAnalysisStats] = useState<any>(null)
  const [migrationStats, setMigrationStats] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [storageData, analysisData, migrationData] = await Promise.all([
          getStorageStats(),
          getAnalysisStats(),
          dataMigrator.getMigrationStats()
        ])
        setStats(storageData)
        setAnalysisStats(analysisData)
        setMigrationStats(migrationData)
      } catch (error) {
        console.error("[CollectionStats] 加载统计失败:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStats()
  }, [])

  const handleAnalyzeHistoricalPages = async () => {
    if (isAnalyzing) return

    setIsAnalyzing(true)
    try {
      const result = await dataMigrator.analyzeHistoricalPages()
      
      // 如果成功更新了记录，自动重建用户画像
      if (result.updated > 0) {
        console.log("[CollectionStats] 自动重建用户画像...")
        await dataMigrator.rebuildUserProfile()
      }
      
      // 重新加载统计数据
      const [analysisData, migrationData] = await Promise.all([
        getAnalysisStats(),
        dataMigrator.getMigrationStats()
      ])
      setAnalysisStats(analysisData)
      setMigrationStats(migrationData)
      
      alert(`历史页面分析完成！\n处理了 ${result.analyzed} 条记录\n成功更新 ${result.updated} 条记录\n失败 ${result.failed} 条\n${result.updated > 0 ? '\n✅ 用户画像已自动更新' : ''}`)
    } catch (error) {
      console.error("[CollectionStats] 历史页面分析失败:", error)
      alert("分析失败，请稍后重试")
    } finally {
      setIsAnalyzing(false)
    }
  }

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

      {/* 文本分析统计 (Phase 3.4 完成) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🔤</span>
          <span>{_("options.collectionStats.textAnalysis")}</span>
        </h2>

        {!analysisStats || analysisStats.analyzedPages === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
              暂无文本分析数据
            </p>
            <p className="text-center text-gray-400 dark:text-gray-500 text-xs mt-1">
              继续浏览网页，系统将自动提取和分析内容
            </p>
            {migrationStats && migrationStats.visitesWithoutAnalysis > 0 && (
              <div className="mt-3 text-center">
                <button
                  onClick={handleAnalyzeHistoricalPages}
                  disabled={isAnalyzing}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isAnalyzing
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300'
                  }`}
                >
                  {isAnalyzing ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                      分析中...
                    </span>
                  ) : (
                    <>📊 分析历史页面 ({migrationStats.visitesWithoutAnalysis} 条)</>
                  )}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 分析完整性提示 */}
            {migrationStats && migrationStats.analysisCompleteness < 100 && (
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-orange-800 dark:text-orange-300 text-sm font-medium">
                      分析完整性: {migrationStats.analysisCompleteness}%
                    </p>
                    <p className="text-orange-600 dark:text-orange-400 text-xs mt-1">
                      还有 {migrationStats.visitesWithoutAnalysis} 条历史记录未分析
                    </p>
                  </div>
                  <button
                    onClick={handleAnalyzeHistoricalPages}
                    disabled={isAnalyzing}
                    className={`px-3 py-1 rounded text-xs font-medium ${
                      isAnalyzing
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-orange-200 text-orange-800 hover:bg-orange-300 dark:bg-orange-800 dark:text-orange-200'
                    }`}
                  >
                    {isAnalyzing ? '分析中...' : '补充分析'}
                  </button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 已分析页面数 */}
              <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
                <div className="text-sm text-cyan-600 dark:text-cyan-400 mb-1">
                  已分析页面
                </div>
                <div className="text-3xl font-bold text-cyan-900 dark:text-cyan-100">
                  {analysisStats.analyzedPages}
                </div>
              </div>

              {/* 提取关键词数 */}
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                <div className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">
                  提取关键词
                </div>
                <div className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">
                  {analysisStats.totalKeywords}
                </div>
              </div>

              {/* 平均关键词数 */}
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">
                  平均每页关键词
                </div>
                <div className="text-3xl font-bold text-amber-900 dark:text-amber-100">
                  {analysisStats.avgKeywordsPerPage.toFixed(1)}
                </div>
              </div>
            </div>

            {/* 语言分布 */}
            {analysisStats.languageDistribution.length > 0 && (
              <div>
                <h3 className="text-md font-medium mb-2">语言分布</h3>
                <div className="space-y-2">
                  {analysisStats.languageDistribution.map((lang: any) => (
                    <div key={lang.language} className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {lang.language}
                      </span>
                      <span className="text-sm font-medium">
                        {lang.count} 页面
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 热门关键词 */}
            {analysisStats.topKeywords.length > 0 && (
              <div>
                <h3 className="text-md font-medium mb-2">热门关键词 Top 10</h3>
                <div className="flex flex-wrap gap-2">
                  {analysisStats.topKeywords.map((keyword: any, index: number) => (
                    <span
                      key={keyword.word}
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        index < 3
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                          : index < 6
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
                      }`}
                    >
                      {keyword.word}
                      <span className="ml-1 text-xs opacity-70">
                        {keyword.frequency}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 用户画像统计 (Phase 3.4 完成) */}
      <UserProfileDisplay />

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
