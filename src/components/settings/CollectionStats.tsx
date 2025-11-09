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
import { getStorageStats, getAnalysisStats, getAIAnalysisStats, db } from "@/storage/db"
import { dataMigrator } from "@/core/migrator/DataMigrator"
import { ProfileUpdateScheduler } from "@/core/profile/ProfileUpdateScheduler"
import type { StorageStats } from "@/storage/types"
import { UserProfileDisplay } from "./UserProfileDisplay"
import { AnalysisDebugger } from "@/debug/AnalysisDebugger"
import { profileManager } from "@/core/profile/ProfileManager"
import { getAIConfig, getProviderDisplayName } from "@/storage/ai-config"

export function CollectionStats() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [analysisStats, setAnalysisStats] = useState<any>(null)
  const [aiQualityStats, setAiQualityStats] = useState<any>(null)
  const [migrationStats, setMigrationStats] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isRebuildingProfile, setIsRebuildingProfile] = useState(false)
  const [aiConfigStatus, setAiConfigStatus] = useState<{
    enabled: boolean
    provider: string
    configured: boolean
  }>({
    enabled: false,
    provider: "未配置",
    configured: false
  })

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [storageData, analysisData, aiQualityData, migrationData, aiConfig] = await Promise.all([
          getStorageStats(),
          getAnalysisStats(),
          getAIAnalysisStats(),
          dataMigrator.getMigrationStats(),
          getAIConfig()
        ])
        setStats(storageData)
        setAnalysisStats(analysisData)
        setAiQualityStats(aiQualityData)
        setMigrationStats(migrationData)
        
        // 设置 AI 配置状态
        setAiConfigStatus({
          enabled: aiConfig.enabled,
          provider: getProviderDisplayName(aiConfig.provider),
          configured: aiConfig.enabled && aiConfig.provider !== null && aiConfig.apiKey !== ""
        })
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
      // 使用调度器的强制更新，确保状态同步
      await ProfileUpdateScheduler.forceUpdate()
      alert("用户画像重建成功！")
    } catch (error) {
      console.error("[CollectionStats] 重建用户画像失败:", error)
      alert("重建失败，请稍后重试")
    } finally {
      setIsRebuildingProfile(false)
    }
  }

  const handleClearDataAndRebuild = async () => {
    if (!confirm('确定要清除浏览历史并重建用户画像吗？\n这将：\n- 删除所有浏览记录和分析结果\n- 删除当前用户画像\n- 重置为初始状态\n\n⚠️ 此操作不可恢复！')) {
      return
    }

    try {
      // 清除访问记录和用户画像
      await Promise.all([
        db.pendingVisits.clear(),
        db.confirmedVisits.clear(),
        db.userProfile.clear()
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
      
      alert("数据清除成功！\n现在可以重新开始浏览，系统将自动构建新的用户画像。")
    } catch (error) {
      console.error("[CollectionStats] 清除数据失败:", error)
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

      {/* AI 配置状态 (Phase 4 - Sprint 5.2) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🤖</span>
          <span>AI 分析质量</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          {/* 服务提供商 */}
          <div className={`rounded-lg p-4 border ${
            aiConfigStatus.configured
              ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
              : "bg-gray-50 dark:bg-gray-700/20 border-gray-200 dark:border-gray-600"
          }`}>
            <div className={`text-sm mb-1 ${
              aiConfigStatus.configured
                ? "text-green-600 dark:text-green-400"
                : "text-gray-600 dark:text-gray-400"
            }`}>
              服务提供商
            </div>
            <div className={`text-2xl font-bold ${
              aiConfigStatus.configured
                ? "text-green-900 dark:text-green-100"
                : "text-gray-900 dark:text-gray-100"
            }`}>
              {aiConfigStatus.configured ? aiConfigStatus.provider : "关键词"}
            </div>
            <div className={`text-xs mt-1 flex items-center gap-1 ${
              aiConfigStatus.configured
                ? "text-green-600 dark:text-green-400"
                : "text-gray-500 dark:text-gray-400"
            }`}>
              {aiConfigStatus.configured ? (
                <>
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <span>AI 语义理解</span>
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 bg-gray-400 rounded-full"></span>
                  <span>传统关键词</span>
                </>
              )}
            </div>
          </div>

          {/* AI 分析占比 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
            <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">
              AI 分析占比
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {aiQualityStats ? `${aiQualityStats.aiPercentage.toFixed(1)}%` : '--'}
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
              {aiQualityStats ? `${aiQualityStats.aiAnalyzedPages}/${aiQualityStats.totalPages} 页` : '无数据'}
            </div>
          </div>

          {/* 累计费用 */}
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-800">
            <div className="text-sm text-purple-600 dark:text-purple-400 mb-1">
              累计费用
            </div>
            <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
              {aiQualityStats ? (
                <div className="space-y-0.5">
                  {aiQualityStats.totalCostUSD > 0 && (
                    <div>${aiQualityStats.totalCostUSD.toFixed(4)}</div>
                  )}
                  {aiQualityStats.totalCostCNY > 0 && (
                    <div className={aiQualityStats.totalCostUSD > 0 ? 'text-lg' : ''}>
                      ¥{aiQualityStats.totalCostCNY.toFixed(4)}
                    </div>
                  )}
                  {aiQualityStats.totalCostUSD === 0 && aiQualityStats.totalCostCNY === 0 && (
                    <div>$0</div>
                  )}
                </div>
              ) : '$0'}
            </div>
            <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
              {aiQualityStats && aiQualityStats.aiAnalyzedPages > 0 && aiQualityStats.primaryCurrency
                ? `均 ${aiQualityStats.primaryCurrency === 'CNY' ? '¥' : '$'}${aiQualityStats.avgCostPerPage.toFixed(6)}/页`
                : '暂无消费'}
            </div>
          </div>

          {/* Token 用量 */}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">
              Token 用量
            </div>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
              {aiQualityStats && aiQualityStats.totalTokens > 0
                ? (aiQualityStats.totalTokens / 1000).toFixed(1) + 'K'
                : '--'}
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {aiQualityStats && aiQualityStats.aiAnalyzedPages > 0
                ? `均 ${Math.round(aiQualityStats.totalTokens / aiQualityStats.aiAnalyzedPages)} tokens/页`
                : '无数据'}
            </div>
          </div>
        </div>

        {/* 提供商分布（仅在有 AI 分析时显示） */}
        {aiQualityStats && aiQualityStats.providerDistribution.length > 0 && (
          <div className="mt-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              提供商分布
            </h3>
            <div className="space-y-2">
              {aiQualityStats.providerDistribution.map((item: any) => (
                <div key={item.provider} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {item.provider}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {item.count} 页 ({item.percentage.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-purple-500 h-2 rounded-full transition-all"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 引导配置 AI（仅在未配置时显示） */}
        {!aiConfigStatus.configured && (
          <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">💡</span>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                  想要更准确的内容分析？
                </h3>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                  配置 AI 提供商（OpenAI、Anthropic、DeepSeek），获得更精准的语义理解和主题分类。
                </p>
                <a
                  href="/options.html?tab=ai"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                  <span>前往配置</span>
                  <span>→</span>
                </a>
              </div>
            </div>
          </div>
        )}
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
            onClick={handleClearDataAndRebuild}
            className="w-full px-4 py-2 bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50 rounded-lg text-sm font-medium transition-colors">
            🗑️ 清除数据重新开始
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
            <li>• <strong>重建画像</strong>：基于现有浏览数据重新分析兴趣偏好</li>
            <li>• <strong>清除数据重新开始</strong>：删除浏览历史和画像，从零开始</li>
            <li>• <strong>清除所有数据</strong>：包括推荐记录在内的完全清空</li>
          </ul>
          
          <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">
              🤖 <strong>自动更新策略：</strong>
            </p>
            <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <li>• 首次构建：浏览10页后自动创建画像</li>
              <li>• 增量更新：每5页新内容后智能更新</li>
              <li>• 定期刷新：6小时周期性更新</li>
              <li>• 手动重建：随时可以强制刷新画像</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
