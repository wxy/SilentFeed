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

import React, { useEffect, useState } from "react"
import { useI18n } from "@/i18n/helpers"
import { getStorageStats, getAnalysisStats, getAIAnalysisStats, getRecommendationStats, db, getPageCount } from "@/storage/db"
import { dataMigrator } from "@/core/migrator/DataMigrator"
import { ProfileUpdateScheduler } from "@/core/profile/ProfileUpdateScheduler"
import type { StorageStats, RecommendationStats } from "@/types/database"
import { AnalysisDebugger } from "@/debug/AnalysisDebugger"
import { profileManager } from "@/core/profile/ProfileManager"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"
import { getAIConfig, getProviderDisplayName } from "@/storage/ai-config"
import { logger } from "@/utils/logger"

const collectionLogger = logger.withTag("CollectionStats")

/**
 * 获取语言名称的国际化文本
 * 使用翻译键，根据当前界面语言显示对应的语言名称
 * 例如：中文界面显示"中文""英文"，英文界面显示"Chinese""English"
 */
function getLanguageName(langCode: string, _: (key: string) => string): string {
  const langMap: Record<string, string> = {
    'zh-CN': _("options.collectionStats.languages.zhCN"),
    'zh': _("options.collectionStats.languages.zh"),
    'en': _("options.collectionStats.languages.en"),
    'ja': _("options.collectionStats.languages.ja"),
    'fr': _("options.collectionStats.languages.fr"),
    'de': _("options.collectionStats.languages.de"),
    'es': _("options.collectionStats.languages.es"),
    'ko': _("options.collectionStats.languages.ko"),
    'other': _("options.collectionStats.languages.other")
  }
  // 如果找不到，使用 other 作为默认值
  return langMap[langCode] || _("options.collectionStats.languages.other")
}

/**
 * 获取AI提供者名称的国际化文本
 */
function getProviderName(provider: string, _: (key: string) => string): string {
  const providerMap: Record<string, string> = {
    'keyword': _("common.aiProviders.keyword"),
    'openai': _("common.aiProviders.openai"),
    'anthropic': _("common.aiProviders.anthropic"),
    'deepseek': _("common.aiProviders.deepseek")
  }
  return providerMap[provider.toLowerCase()] || provider
}

export function CollectionStats() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [analysisStats, setAnalysisStats] = useState<any>(null)
  const [aiQualityStats, setAiQualityStats] = useState<any>(null)
  const [migrationStats, setMigrationStats] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isRebuildingProfile, setIsRebuildingProfile] = useState(false)
  const [recommendationStats, setRecommendationStats] = useState<RecommendationStats | null>(null)
  const [aiConfigStatus, setAiConfigStatus] = useState<{
    enabled: boolean
    provider: string
    configured: boolean
  }>({
    enabled: false,
    provider: "",
    configured: false
  })
  const [pageCount, setPageCount] = useState<number>(0)
  const [isLearningStage, setIsLearningStage] = useState<boolean>(false)

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [storageData, analysisData, aiQualityData, migrationData, aiConfig, recommendationData, currentPageCount] = await Promise.all([
          getStorageStats(),
          getAnalysisStats(),
          getAIAnalysisStats(),
          dataMigrator.getMigrationStats(),
          getAIConfig(),
          getRecommendationStats(999999), // 获取所有推荐统计（传入足够大的天数）
          getPageCount() // 获取当前页面计数
        ])
        setStats(storageData)
        setAnalysisStats(analysisData)
        setAiQualityStats(aiQualityData)
        setMigrationStats(migrationData)
        setRecommendationStats(recommendationData)
        setPageCount(currentPageCount)
        setIsLearningStage(currentPageCount < LEARNING_COMPLETE_PAGES)
        
        // 设置 AI 配置状态
        setAiConfigStatus({
          enabled: aiConfig.enabled,
          provider: getProviderDisplayName(aiConfig.provider),
          configured: aiConfig.enabled && aiConfig.provider !== null && aiConfig.apiKey !== ""
        })
      } catch (error) {
        collectionLogger.error("加载统计失败:", error)
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
        collectionLogger.info("自动重建用户画像...")
        await dataMigrator.rebuildUserProfile()
      }
      
      // 重新加载统计数据
      const [analysisData, migrationData] = await Promise.all([
        getAnalysisStats(),
        dataMigrator.getMigrationStats()
      ])
      setAnalysisStats(analysisData)
      setMigrationStats(migrationData)
      
      const profileUpdated = result.updated > 0 ? _("options.collectionStats.alerts.profileAutoUpdated") : ""
      alert(_("options.collectionStats.alerts.analyzeComplete", {
        analyzed: result.analyzed,
        updated: result.updated,
        failed: result.failed,
        profileUpdated
      }))
    } catch (error) {
      collectionLogger.error("历史页面分析失败:", error)
      alert(_("options.collectionStats.alerts.analyzeFailed"))
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleDebugUnanalyzable = async () => {
    try {
      collectionLogger.info("开始诊断无法分析的记录...")
      const unanalyzable = await AnalysisDebugger.getUnanalyzableRecords()
      const integrity = await AnalysisDebugger.checkDataIntegrity()
      
      alert(_("options.collectionStats.alerts.diagnosticComplete", { count: unanalyzable.length }))
    } catch (error) {
      collectionLogger.error("诊断失败:", error)
      alert(_("options.collectionStats.alerts.diagnosticFailed"))
    }
  }

  const handleCleanInvalidRecords = async () => {
    if (!confirm(_("options.collectionStats.alerts.cleanInvalidConfirm"))) {
      return
    }

    try {
      collectionLogger.info("开始清理无效记录...")
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
      
      const profileUpdated = result.cleaned > 0 ? _("options.collectionStats.alerts.profileAutoUpdated") : ""
      alert(_("options.collectionStats.alerts.cleanInvalidComplete", {
        total: result.total,
        cleaned: result.cleaned,
        remaining: result.remaining,
        profileUpdated
      }))
    } catch (error) {
      collectionLogger.error("清理无效记录失败:", error)
      alert(_("options.collectionStats.alerts.cleanInvalidFailed"))
    }
  }

  const handleRebuildProfile = async () => {
    if (isRebuildingProfile) return

    setIsRebuildingProfile(true)
    try {
      // 使用调度器的强制更新，确保状态同步
      await ProfileUpdateScheduler.forceUpdate()
      alert(_("options.collectionStats.alerts.rebuildSuccess"))
    } catch (error) {
      collectionLogger.error("重建用户画像失败:", error)
      alert(_("options.collectionStats.alerts.rebuildFailed"))
    } finally {
      setIsRebuildingProfile(false)
    }
  }

  const handleClearDataAndRebuild = async () => {
    if (!confirm(_("options.collectionStats.alerts.clearDataConfirm"))) {
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
      
      alert(_("options.collectionStats.alerts.clearDataSuccess"))
    } catch (error) {
      collectionLogger.error("清除数据失败:", error)
      alert(_("options.collectionStats.alerts.clearDataFailed"))
    }
  }

  const handleClearAll = async () => {
    if (!confirm(_("options.collectionStats.alerts.clearAllConfirm"))) {
      return
    }

    if (!confirm(_("options.collectionStats.alerts.clearAllFinalConfirm"))) {
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
      
      alert(_("options.collectionStats.alerts.clearAllSuccess"))
    } catch (error) {
      collectionLogger.error("清除所有数据失败:", error)
      alert(_("options.collectionStats.alerts.clearAllFailed"))
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
    if (seconds < 60) return _("options.collectionStats.durationSeconds", { seconds: Math.round(seconds) })
    const minutes = Math.floor(seconds / 60)
    const secs = Math.round(seconds % 60)
    return _("options.collectionStats.durationMinutes", { minutes, seconds: secs })
  }

  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return _("options.collectionStats.unknownDate")
    const date = new Date(timestamp)
    // 使用当前语言环境的日期格式
    const locale = document.documentElement.lang || 'zh-CN'
    return date.toLocaleDateString(locale, {
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
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
            <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">
              {_("options.collectionStats.totalPagesLabel")}
            </div>
            <div className="text-3xl font-bold text-indigo-900 dark:text-indigo-100">
              {stats.pageCount}
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
              {_("options.collectionStats.dwellTimeHint")}
            </div>
          </div>

          {/* 存储占用 */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="text-sm text-green-600 dark:text-green-400 mb-1">
              {_("options.collectionStats.storageLabel")}
            </div>
            <div className="text-3xl font-bold text-green-900 dark:text-green-100">
              {_("options.collectionStats.storageSizeMB", { size: stats.totalSizeMB })}
            </div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              {_("options.collectionStats.storageHint")}
            </div>
          </div>

          {/* 开始采集时间 */}
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
            <div className="text-sm text-cyan-600 dark:text-cyan-400 mb-1">
              {_("options.collectionStats.firstCollectionLabel")}
            </div>
            <div className="text-lg font-bold text-cyan-900 dark:text-cyan-100">
              {formatDate(stats.firstCollectionTime)}
            </div>
            <div className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">
              {_("options.collectionStats.avgDailyPages", { count: stats.avgDailyPages.toFixed(1) })}
            </div>
          </div>
        </div>
      </div>

      {/* AI 配置状态 (Phase 4 - Sprint 5.2) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🤖</span>
          <span>{_("options.collectionStats.aiQualityTitle")}</span>
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
              {_("options.collectionStats.providerLabel")}
            </div>
            <div className={`text-2xl font-bold ${
              aiConfigStatus.configured
                ? "text-green-900 dark:text-green-100"
                : "text-gray-900 dark:text-gray-100"
            }`}>
              {aiConfigStatus.configured ? aiConfigStatus.provider : _("options.collectionStats.providerKeyword")}
            </div>
            <div className={`text-xs mt-1 flex items-center gap-1 ${
              aiConfigStatus.configured
                ? "text-green-600 dark:text-green-400"
                : "text-gray-500 dark:text-gray-400"
            }`}>
              {aiConfigStatus.configured ? (
                <>
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  <span>{_("options.collectionStats.providerStatusAI")}</span>
                </>
              ) : (
                <>
                  <span className="inline-block w-2 h-2 bg-gray-400 rounded-full"></span>
                  <span>{_("options.collectionStats.providerStatusKeyword")}</span>
                </>
              )}
            </div>
          </div>

          {/* AI 分析占比 */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
            <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">
              {_("options.collectionStats.aiPercentageLabel")}
            </div>
            <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
              {aiQualityStats ? _("options.collectionStats.aiPercentageValue", { percentage: aiQualityStats.aiPercentage.toFixed(1) }) : '--'}
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
              {aiQualityStats ? _("options.collectionStats.aiPagesCount", { ai: aiQualityStats.aiAnalyzedPages, total: aiQualityStats.totalPages }) : _("options.collectionStats.noData")}
            </div>
          </div>

          {/* 累计费用 */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
            <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">
              {_("options.collectionStats.totalCostLabel")}
            </div>
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
              {aiQualityStats ? (
                <div className="space-y-0.5">
                  {aiQualityStats.totalCostUSD > 0 && (
                    <div>{_("options.collectionStats.totalCostUSD", { cost: aiQualityStats.totalCostUSD.toFixed(4) })}</div>
                  )}
                  {aiQualityStats.totalCostCNY > 0 && (
                    <div className={aiQualityStats.totalCostUSD > 0 ? 'text-lg' : ''}>
                      {_("options.collectionStats.totalCostCNY", { cost: aiQualityStats.totalCostCNY.toFixed(4) })}
                    </div>
                  )}
                  {aiQualityStats.totalCostUSD === 0 && aiQualityStats.totalCostCNY === 0 && (
                    <div>$0</div>
                  )}
                </div>
              ) : '$0'}
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
              {aiQualityStats && aiQualityStats.aiAnalyzedPages > 0 && aiQualityStats.primaryCurrency
                ? _("options.collectionStats.avgCostPerPage", { 
                    currency: aiQualityStats.primaryCurrency === 'CNY' ? '¥' : '$',
                    cost: aiQualityStats.avgCostPerPage.toFixed(6)
                  })
                : _("options.collectionStats.noCost")}
            </div>
          </div>

          {/* Token 用量 */}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">
              {_("options.collectionStats.tokenUsageLabel")}
            </div>
            <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
              {aiQualityStats && aiQualityStats.totalTokens > 0
                ? _("options.collectionStats.tokenUsageK", { tokens: (aiQualityStats.totalTokens / 1000).toFixed(1) })
                : '--'}
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {aiQualityStats && aiQualityStats.aiAnalyzedPages > 0
                ? _("options.collectionStats.avgTokensPerPage", { tokens: Math.round(aiQualityStats.totalTokens / aiQualityStats.aiAnalyzedPages) })
                : _("options.collectionStats.noData")}
            </div>
          </div>
        </div>

        {/* AI 提供商使用分布（仅在有 AI 分析时显示） */}
        {aiQualityStats && aiQualityStats.providerDistribution.length > 0 && (
          <div className="mt-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {_("options.collectionStats.providerDistributionTitle")}
            </h3>
            <div className="space-y-2">
              {aiQualityStats.providerDistribution.map((item: { provider: string; count: number; percentage: number }) => (
                <div key={item.provider} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {getProviderName(item.provider, _)}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {_("options.collectionStats.providerDistributionCount", { count: item.count, percentage: item.percentage.toFixed(1) })}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className="bg-gradient-to-r from-indigo-500 to-cyan-500 h-2 rounded-full transition-all"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI 成本按提供商分布（仅在有成本数据时显示） */}
        {aiQualityStats && aiQualityStats.providerCostDistribution && aiQualityStats.providerCostDistribution.length > 0 && (
          <div className="mt-4 bg-gradient-to-br from-indigo-50/80 to-cyan-50/80 dark:from-indigo-900/20 dark:to-cyan-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-700">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
              <span>💰</span>
              <span>{_("options.collectionStats.providerCostDistributionTitle")}</span>
            </h3>
            <div className="space-y-3">
              {aiQualityStats.providerCostDistribution.map((item: { provider: string; costUSD: number; costCNY: number; tokens: number }) => {
                const hasCostUSD = item.costUSD > 0
                const hasCostCNY = item.costCNY > 0
                const hasCost = hasCostUSD || hasCostCNY
                return (
                  <div key={item.provider} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-purple-100 dark:border-indigo-800">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                        {getProviderName(item.provider, _)}
                      </span>
                      {hasCost && (
                        <div className="text-right">
                          {hasCostUSD && (
                            <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                              ${item.costUSD.toFixed(4)}
                            </div>
                          )}
                          {hasCostCNY && (
                            <div className="text-sm font-bold text-pink-600 dark:text-pink-400">
                              ¥{item.costCNY.toFixed(4)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                      {item.tokens > 0 && (
                        <span>
                          {_("options.collectionStats.providerTokens", { tokens: (item.tokens / 1000).toFixed(1) })}
                        </span>
                      )}
                      {!hasCost && (
                        <span className="text-gray-400 dark:text-gray-500">
                          {_("options.collectionStats.noCost")}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 引导配置 AI（仅在未配置时显示） */}
        {!aiConfigStatus.configured && (
          <div className="mt-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-xl">💡</span>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                  {_("options.collectionStats.aiConfigPromptTitle")}
                </h3>
                <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-2">
                  {_("options.collectionStats.aiConfigPromptDesc")}
                </p>
                <a
                  href="/options.html?tab=ai"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                  <span>{_("options.collectionStats.aiConfigPromptLink")}</span>
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
              {_("options.collectionStats.textAnalysisNoData")}
            </p>
            <p className="text-center text-gray-400 dark:text-gray-500 text-xs mt-1">
              {_("options.collectionStats.textAnalysisHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 提取关键词数 */}
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 border border-emerald-200 dark:border-emerald-800">
                <div className="text-sm text-emerald-600 dark:text-emerald-400 mb-1">
                  {_("options.collectionStats.totalKeywordsLabel")}
                </div>
                <div className="text-3xl font-bold text-emerald-900 dark:text-emerald-100">
                  {analysisStats.totalKeywords}
                </div>
                <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  {_("options.collectionStats.totalKeywordsHint")}
                </div>
              </div>

              {/* 平均关键词数 */}
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
                <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">
                  {_("options.collectionStats.avgKeywordsLabel")}
                </div>
                <div className="text-3xl font-bold text-amber-900 dark:text-amber-100">
                  {analysisStats.avgKeywordsPerPage.toFixed(1)}
                </div>
              </div>
            </div>

            {/* 语言分布 */}
            {analysisStats.languageDistribution.length > 0 && (
              <div>
                <h3 className="text-md font-medium mb-2">{_("options.collectionStats.languageDistributionTitle")}</h3>
                <div className="space-y-2">
                  {analysisStats.languageDistribution.map((lang: any) => (
                    <div key={lang.language} className="flex justify-between items-center">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {getLanguageName(lang.language, _)}
                      </span>
                      <span className="text-sm font-medium">
                        {_("options.collectionStats.languagePages", { count: lang.count })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 推荐统计 (Phase 7 完成) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🎯</span>
          <span>{_("options.collectionStats.recommendationStats")}</span>
        </h2>

        {/* 学习阶段提示 */}
        {isLearningStage ? (
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border-2 border-dashed border-indigo-300 dark:border-indigo-700">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📚</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
                  {_("options.collectionStats.learningStageTitle")}
                </p>
                <p className="text-sm text-indigo-700 dark:text-indigo-300 mb-2">
                  {_("options.collectionStats.learningStageHint", { 
                    current: pageCount, 
                    total: LEARNING_COMPLETE_PAGES 
                  })}
                </p>
                <div className="bg-indigo-100 dark:bg-indigo-900/40 rounded p-3 mt-2">
                  <div className="text-xs text-indigo-800 dark:text-blue-200">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{_("options.collectionStats.recommendationCount")}:</span>
                      <span className="font-bold text-lg">0</span>
                    </div>
                    <p className="mt-1 text-indigo-600 dark:text-indigo-300">
                      {_("options.collectionStats.learningStageNote")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : !recommendationStats || recommendationStats.totalCount === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
              {_("options.collectionStats.recommendationStatsNoData")}
            </p>
            <p className="text-center text-gray-400 dark:text-gray-500 text-xs mt-1">
              {_("options.collectionStats.recommendationStatsHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 总推荐数 */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
                <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">
                  {_("options.collectionStats.totalRecommendationsLabel")}
                </div>
                <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                  {recommendationStats.totalCount}
                </div>
              </div>

              {/* 已读数 */}
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                <div className="text-sm text-green-600 dark:text-green-400 mb-1">
                  {_("options.collectionStats.readRecommendationsLabel")}
                </div>
                <div className="text-3xl font-bold text-green-900 dark:text-green-100">
                  {recommendationStats.readCount}
                </div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                  {_("options.collectionStats.readRate", { 
                    rate: ((recommendationStats.readCount / recommendationStats.totalCount) * 100).toFixed(1) 
                  })}
                </div>
              </div>

              {/* 不想读 */}
              <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-4 border border-orange-200 dark:border-orange-800">
                <div className="text-sm text-orange-600 dark:text-orange-400 mb-1">
                  {_("options.collectionStats.dismissedRecommendationsLabel")}
                </div>
                <div className="text-3xl font-bold text-orange-900 dark:text-orange-100">
                  {recommendationStats.dismissedCount}
                </div>
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  {_("options.collectionStats.dismissedRate", { 
                    rate: ((recommendationStats.dismissedCount / recommendationStats.totalCount) * 100).toFixed(1) 
                  })}
                </div>
              </div>
            </div>

            {/* 来源分布 */}
            {recommendationStats.topSources.length > 0 && (
              <div className="mt-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {_("options.collectionStats.topSourcesTitle")}
                </h3>
                <div className="space-y-2">
                  {recommendationStats.topSources.slice(0, 5).map((item: { source: string; count: number; readRate: number }) => (
                    <div key={item.source} className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-gray-700 dark:text-gray-300 truncate max-w-[300px]">
                            {item.source}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {_("options.collectionStats.sourceStats", { 
                              count: item.count, 
                              readRate: item.readRate.toFixed(1) 
                            })}
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-cyan-500 h-2 rounded-full transition-all"
                            style={{ width: `${Math.min(100, item.readRate)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            onClick={handleRebuildProfile}
            disabled={isRebuildingProfile}
            className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              isRebuildingProfile
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                : 'bg-indigo-100 text-indigo-800 hover:bg-blue-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-blue-900/50'
            }`}
          >
            {isRebuildingProfile ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span>
                {_("options.collectionStats.rebuildingProfile")}
              </span>
            ) : (
              <>🔄 {_("options.collectionStats.rebuildProfile")}</>
            )}
          </button>
          <button
            onClick={handleClearDataAndRebuild}
            className="w-full px-4 py-2 bg-orange-100 text-orange-800 hover:bg-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:hover:bg-orange-900/50 rounded-lg text-sm font-medium transition-colors">
            🗑️ {_("options.collectionStats.clearDataRestart")}
          </button>
          <button
            onClick={handleClearAll}
            className="w-full px-4 py-2 bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 rounded-lg text-sm font-medium transition-colors">
            ⚠️ {_("options.collectionStats.clearAll")}
          </button>
        </div>

        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1">
            💡 <strong>{_("options.collectionStats.dataManagementNote")}</strong>
          </p>
          <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <li>• {_("options.collectionStats.dataManagementRebuild")}</li>
            <li>• {_("options.collectionStats.dataManagementClearData")}</li>
            <li>• {_("options.collectionStats.dataManagementClearAll")}</li>
          </ul>
          
          <div className="mt-3 pt-2 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">
              🤖 <strong>{_("options.collectionStats.autoUpdateStrategy")}</strong>
            </p>
            <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <li>• {_("options.collectionStats.autoUpdateFirst")}</li>
              <li>• {_("options.collectionStats.autoUpdateIncremental")}</li>
              <li>• {_("options.collectionStats.autoUpdatePeriodic")}</li>
              <li>• {_("options.collectionStats.autoUpdateManual")}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
