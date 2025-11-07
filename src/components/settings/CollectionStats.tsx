/**
 * 采集统计组件
 *
 * 展示数据采集相关的统计信息：
 * - 页面采集数量
 * - 文本分析结果（Phase 3 完成后）
 * - 用户画像数据（Phase 3 完成后）
 * - 存储占用
 *
 * 注意：不包括推荐相关数据，推荐数据在 RecommendationStats 组件中
 */

import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import { getStorageStats, getAnalysisStats, db } from "@/storage/db"
import { dataMigrator } from "@/core/migrator/DataMigrator"
import type { StorageStats } from "@/storage/types"
import { UserProfileDisplay } from "./UserProfileDisplay"
import { AnalysisDebugger } from "@/debug/AnalysisDebugger"
import { profileManager } from "@/core/profile/ProfileManager"

export function CollectionStats() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [analysisStats, setAnalysisStats] = useState<any>(null)
  const [migrationStats, setMigrationStats] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isRebuildingProfile, setIsRebuildingProfile] = useState(false)

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

  const handleDebugUnanalyzable = async () => {
    try {
      console.log("[CollectionStats] 开始诊断无法分析的记录...")
      const unanalyzable = await AnalysisDebugger.getUnanalyzableRecords()
      const integrity = await AnalysisDebugger.checkDataIntegrity()
      
      alert(`诊断完成！\n无法分析记录: ${unanalyzable.length} 条\n详情已输出到控制台，请按F12查看`)
    } catch (error) {
      console.error("[CollectionStats] 诊断失败:", error)
      alert("诊断失败，请稍后重试")
    }
  }

  const handleCleanInvalidRecords = async () => {
    if (!confirm('确定要清理无效记录吗？\n这将删除关键词数组为空的记录（如搜索页面、首页等）')) {
      return
    }

    try {
      console.log("[CollectionStats] 开始清理无效记录...")
      const result = await dataMigrator.cleanInvalidRecords()
      
      // 重新加载统计数据
      const [storageData, analysisData, migrationData] = await Promise.all([
        getStorageStats(),
        getAnalysisStats(),
        dataMigrator.getMigrationStats()
      ])
      setStats(storageData)
      setAnalysisStats(analysisData)
      setMigrationStats(migrationData)
      
      alert(`无效记录清理完成！\n总记录: ${result.total} 条\n已清理: ${result.cleaned} 条\n剩余有效: ${result.remaining} 条${result.cleaned > 0 ? '\n✅ 用户画像已自动更新' : ''}`)
    } catch (error) {
      console.error("[CollectionStats] 清理无效记录失败:", error)
      alert("清理失败，请稍后重试")
    }
  }

  const handleRebuildProfile = async () => {
    if (isRebuildingProfile) return

    setIsRebuildingProfile(true)
    try {
      await profileManager.rebuildProfile()
      alert("用户画像重建成功！")
    } catch (error) {
      console.error("[CollectionStats] 重建用户画像失败:", error)
      alert("重建失败，请稍后重试")
    } finally {
      setIsRebuildingProfile(false)
    }
  }

  const handleClearProfile = async () => {
    if (!confirm('确定要清除用户画像吗？\n这将删除所有兴趣分析数据，但保留浏览历史。')) {
      return
    }

    try {
      await db.userProfile.clear()
      alert("用户画像清除成功！\n浏览历史保持不变，画像可随时重建。")
    } catch (error) {
      console.error("[CollectionStats] 清除用户画像失败:", error)
      alert("清除失败，请稍后重试")
    }
  }

  const handleClearHistory = async () => {
    if (!confirm('确定要清除浏览历史吗？\n这将删除所有浏览记录和分析结果，但保留用户画像。\n\n⚠️ 此操作不可恢复！')) {
      return
    }

    try {
      // 清除访问记录
      await Promise.all([
        db.pendingVisits.clear(),
        db.confirmedVisits.clear()
      ])
      
      // 重新加载统计数据
      const [storageData, analysisData, migrationData] = await Promise.all([
        getStorageStats(),
        getAnalysisStats(),
        dataMigrator.getMigrationStats()
      ])
      setStats(storageData)
      setAnalysisStats(analysisData)
      setMigrationStats(migrationData)
      
      alert("浏览历史清除成功！\n用户画像保持不变。")
    } catch (error) {
      console.error("[CollectionStats] 清除浏览历史失败:", error)
      alert("清除失败，请稍后重试")
    }
  }

  const handleClearAll = async () => {
    if (!confirm('确定要清除所有数据吗？\n这将删除：\n- 所有浏览历史\n- 所有分析结果\n- 用户画像\n- 推荐记录\n\n⚠️ 此操作不可恢复！请慎重考虑！')) {
      return
    }

    if (!confirm('最后确认：真的要清除所有数据吗？\n清除后将回到初始状态，需要重新开始采集。')) {
      return
    }

    try {
      // 清除所有数据
      await Promise.all([
        db.pendingVisits.clear(),
        db.confirmedVisits.clear(),
        db.userProfile.clear(),
        db.recommendations.clear()
      ])
      
      // 重新加载统计数据
      const [storageData, analysisData, migrationData] = await Promise.all([
        getStorageStats(),
        getAnalysisStats(),
        dataMigrator.getMigrationStats()
      ])
      setStats(storageData)
      setAnalysisStats(analysisData)
      setMigrationStats(migrationData)
      
      alert("所有数据清除成功！\n扩展已恢复到初始状态。")
    } catch (error) {
      console.error("[CollectionStats] 清除所有数据失败:", error)
      alert("清除失败，请稍后重试")
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

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return '未知'
    const date = new Date(timestamp)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    })
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
              累计采集页面
            </div>
            <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
              {stats.pageCount}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              停留超过30秒的页面
            </div>
          </div>

          {/* 存储占用 */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="text-sm text-green-600 dark:text-green-400 mb-1">
              存储占用
            </div>
            <div className="text-3xl font-bold text-green-900 dark:text-green-100">
              {stats.totalSizeMB} MB
            </div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              预估存储空间使用
            </div>
          </div>

          {/* 开始采集时间 */}
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div className="text-sm text-purple-600 dark:text-purple-400 mb-1">
              开始采集时间
            </div>
            <div className="text-lg font-bold text-purple-900 dark:text-purple-100">
              {formatDate(stats.firstCollectionTime)}
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
              平均每日 {stats.avgDailyPages.toFixed(1)} 页
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
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 提取关键词数 */}
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                <div className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">
                  总关键词数
                </div>
                <div className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">
                  {analysisStats.totalKeywords}
                </div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  含重复词，原始提取
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
          </div>
        )}
      </div>

      {/* 用户画像统计 (Phase 3.4 完成) */}
      <UserProfileDisplay />

      {/* 数据管理 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🗂️</span>
          <span>{_("options.collectionStats.dataManagement")}</span>
        </h2>

        <div className="space-y-3">
          <button
            onClick={handleRebuildProfile}
            disabled={isRebuildingProfile}
            className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isRebuildingProfile
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                : 'bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50'
            }`}
          >
            {isRebuildingProfile ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                重建画像中...
              </span>
            ) : (
              <>🔄 重建用户画像</>
            )}
          </button>
          <button
            onClick={handleClearProfile}
            className="w-full px-4 py-2 bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:hover:bg-yellow-900/50 rounded-lg text-sm font-medium transition-colors">
            🗑️ 清除用户画像
          </button>
          <button
            onClick={handleClearHistory}
            className="w-full px-4 py-2 bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50 rounded-lg text-sm font-medium transition-colors">
            🧹 清除浏览历史
          </button>
          <button
            onClick={handleClearAll}
            className="w-full px-4 py-2 bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 rounded-lg text-sm font-medium transition-colors">
            ⚠️ 清除所有数据
          </button>
        </div>

        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
            💡 <strong>数据管理说明：</strong>
          </p>
          <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <li>• <strong>重建画像</strong>：重新分析所有浏览数据，更新兴趣偏好</li>
            <li>• <strong>清除画像</strong>：删除兴趣分析，保留浏览历史</li>
            <li>• <strong>清除历史</strong>：删除浏览记录，保留用户画像</li>
            <li>• <strong>清除所有</strong>：恢复初始状态，谨慎操作</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
