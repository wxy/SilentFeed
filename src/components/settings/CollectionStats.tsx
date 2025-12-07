/**
 * 采集统计组件 (Phase 10.2: AI First 优化版)
 *
 * 展示数据采集相关的统计信息：
 * - 页面采集数量
 * - RSS 文章总数 (NEW)
 * - 推荐筛选漏斗 (NEW)
 * - AI 成本统计
 * - 存储占用
 * - 数据管理
 *
 * 移除项（AI First 简化）：
 * - 文本分析统计（关键词提取）
 * - AI 分析占比展示
 */

import React, { useEffect, useState } from "react"
import { useI18n } from "@/i18n/helpers"
import { formatDate as formatDateI18n } from "@/utils/date-formatter"
import {
  getStorageStats,
  getAIAnalysisStats,
  db,
  getPageCount,
  getRecommendationFunnel,
  getFeedStats,
  type FeedStats
} from "@/storage/db"
import { dataMigrator } from "@/core/migrator/DataMigrator"
import { ProfileUpdateScheduler } from "@/core/profile/ProfileUpdateScheduler"
import type { StorageStats } from "@/types/database"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"
import { getAIConfig, getProviderDisplayName } from "@/storage/ai-config"
import { logger } from "@/utils/logger"
import { AIUsageTracker } from "@/core/ai/AIUsageTracker"
import type { AIUsageStats, DailyUsageStats } from "@/types/ai-usage"
import { FeedSpiderChart } from "./FeedSpiderChart"
import { AIUsageBarChart } from "./AIUsageBarChart"

const collectionLogger = logger.withTag("CollectionStats")

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

/**
 * 格式化货币显示
 */
function formatCurrency(amount: number, currency: 'CNY' | 'USD' | 'FREE'): string {
  if (currency === 'FREE') {
    return '免费'
  }
  const symbol = currency === 'CNY' ? '¥' : '$'
  return `${symbol}${amount.toFixed(4)}`
}

/**
 * 简单的进度条组件（用于数据可视化）
 */
function ProgressBar({ 
  value, 
  max, 
  color = 'indigo',
  height = 'h-2',
  showPercentage = false
}: { 
  value: number
  max: number
  color?: 'indigo' | 'green' | 'amber' | 'purple' | 'blue'
  height?: string
  showPercentage?: boolean
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0
  const colorClasses = {
    indigo: 'bg-indigo-600 dark:bg-indigo-500',
    green: 'bg-green-600 dark:bg-green-500',
    amber: 'bg-amber-600 dark:bg-amber-500',
    purple: 'bg-purple-600 dark:bg-purple-500',
    blue: 'bg-blue-600 dark:bg-blue-500'
  }
  
  return (
    <div className="w-full">
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden ${height}`}>
        <div 
          className={`${height} ${colorClasses[color]} transition-all duration-300 rounded-full`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      {showPercentage && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          {percentage.toFixed(1)}%
        </div>
      )}
    </div>
  )
}

export function CollectionStats() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [aiUsageStats, setAiUsageStats] = useState<AIUsageStats | null>(null)
  const [dailyStats, setDailyStats] = useState<DailyUsageStats[]>([])
  const [showUsageDetails, setShowUsageDetails] = useState(false)
  const [usageStatsPeriod, setUsageStatsPeriod] = useState<'30days' | 'all'>('30days')
  const [isRebuildingProfile, setIsRebuildingProfile] = useState(false)
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
  const [recommendationFunnel, setRecommendationFunnel] = useState<{
    rssArticles: number
    inPool: number
    notified: number
    read: number
    learningPages: number
    dismissed: number
  } | null>(null)
  
  // Phase 11: 订阅源蛛网图
  const [feedStats, setFeedStats] = useState<FeedStats[]>([])

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [
          storageData,
          aiConfig,
          currentPageCount,
          funnelData,
          usageStats,
          feedsData
        ] = await Promise.all([
          getStorageStats(),
          getAIConfig(),
          getPageCount(),
          getRecommendationFunnel(),
          AIUsageTracker.getStats(
            usageStatsPeriod === '30days'
              ? { startTime: Date.now() - 30 * 24 * 60 * 60 * 1000 }
              : undefined  // undefined 表示全部数据
          ),
          getFeedStats()
        ])
        
        // 加载每日统计数据
        const dailyData = await AIUsageTracker.getDailyStats(
          usageStatsPeriod === '30days' ? 30 : undefined
        )
        
        collectionLogger.info('✅ 加载数据完成:', {
          storageData: storageData.pageCount,
          currentPageCount,
          aiUsageStatsCount: usageStats.totalCalls,
          dailyDataLength: dailyData.length,
          dailyDataSample: dailyData.slice(0, 2)
        })
        
        setStats(storageData)
        setPageCount(currentPageCount)
        setRecommendationFunnel(funnelData)
        setAiUsageStats(usageStats)
        setDailyStats(dailyData)
        setFeedStats(feedsData)
        
        // 设置 AI 配置状态
        const hasAIProvider = Object.values(aiConfig.providers).some(
          p => p && p.apiKey && p.model
        )
        const firstProvider = Object.entries(aiConfig.providers).find(
          ([_, p]) => p && p.apiKey
        )
        setAiConfigStatus({
          enabled: hasAIProvider,
          provider: firstProvider ? getProviderDisplayName(firstProvider[0] as any) : 'None',
          configured: hasAIProvider
        })
      } catch (error) {
        collectionLogger.error("加载统计失败:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStats()
  }, [usageStatsPeriod])  // 当周期变化时重新加载

  // 事件处理器（数据管理）
  const handleRebuildProfile = async () => {
    if (isRebuildingProfile) return

    setIsRebuildingProfile(true)
    try {
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
      await Promise.all([
        db.pendingVisits.clear(),
        db.confirmedVisits.clear(),
        db.userProfile.clear()
      ])
      
      const [storageData] = await Promise.all([
        getStorageStats()
      ])
      setStats(storageData)
      
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
      await Promise.all([
        db.pendingVisits.clear(),
        db.confirmedVisits.clear(),
        db.userProfile.clear(),
        db.recommendations.clear()
      ])
      
      const [storageData] = await Promise.all([
        getStorageStats()
      ])
      setStats(storageData)
      
      alert(_("options.collectionStats.alerts.clearAllSuccess"))
    } catch (error) {
      collectionLogger.error("清除所有数据失败:", error)
      alert(_("options.collectionStats.alerts.clearAllFailed"))
    }
  }

  // 工具函数
  const formatDate = (timestamp?: number): string => {
    if (!timestamp) return _("options.collectionStats.unknownDate")
    return formatDateI18n(timestamp, {
      year: 'numeric',
      month: 'long', 
      day: 'numeric'
    })
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

  // Render sections
  return (
    <div className="space-y-6">
      {/* AI 学习概览 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>📚</span>
          <span>{_("options.collectionStats.aiLearningOverview")}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 学习页面数 */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
            <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">
              {_("options.collectionStats.learningPagesLabel")}
            </div>
            <div className="text-3xl font-bold text-indigo-900 dark:text-indigo-100 text-right">
              {stats.pageCount}
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
              {_("options.collectionStats.learningPagesHint")}
            </div>
          </div>

          {/* 存储占用 */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
            <div className="text-sm text-green-600 dark:text-green-400 mb-1">
              {_("options.collectionStats.storageLabel")}
            </div>
            <div className="text-3xl font-bold text-green-900 dark:text-green-100 text-right">
              {_("options.collectionStats.storageSizeMB", { size: stats.totalSizeMB })}
            </div>
            <div className="text-xs text-green-600 dark:text-green-400 mt-1">
              {_("options.collectionStats.storageHint")}
            </div>
          </div>

          {/* 开始学习时间 */}
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
            <div className="text-sm text-cyan-600 dark:text-cyan-400 mb-1">
              {_("options.collectionStats.startLearningTimeLabel")}
            </div>
            <div className="text-lg font-bold text-cyan-900 dark:text-cyan-100 text-right">
              {formatDate(stats.firstCollectionTime)}
            </div>
            <div className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">
              {_("options.collectionStats.avgDailyPagesShort", { count: stats.avgDailyPages.toFixed(1) })}
            </div>
          </div>
        </div>
      </div>

      {/* AI 成本分析 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>💰</span>
            <span>{_("options.collectionStats.aiCostAnalysisTitle")}</span>
          </h2>
          <div className="flex items-center gap-3">
            {/* 周期选择器 */}
            {aiUsageStats && aiUsageStats.totalCalls > 0 && (
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                <button
                  onClick={() => setUsageStatsPeriod('30days')}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    usageStatsPeriod === '30days'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {_("options.collectionStats.aiUsage.period.last30Days")}
                </button>
                <button
                  onClick={() => setUsageStatsPeriod('all')}
                  className={`px-3 py-1 text-xs rounded transition-colors ${
                    usageStatsPeriod === 'all'
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {_("options.collectionStats.aiUsage.period.allTime")}
                </button>
              </div>
            )}
            {/* 展开/收起按钮 */}
            {aiUsageStats && aiUsageStats.totalCalls > 0 && (
              <button
                onClick={() => setShowUsageDetails(!showUsageDetails)}
                className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
              >
                {showUsageDetails ? _('options.collectionStats.aiUsage.collapseDetails') + ' ▲' : _('options.collectionStats.aiUsage.expandDetails') + ' ▼'}
              </button>
            )}
          </div>
        </div>

        {!aiUsageStats || aiUsageStats.totalCalls === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
              暂无 AI 调用数据
            </p>
            {!aiConfigStatus.configured && (
              <div className="mt-4 flex justify-center">
                <a
                  href="/options.html?tab=ai-engine"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <span>去配置 AI 引擎</span>
                  <span>→</span>
                </a>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* 主要指标卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {/* 总调用次数 */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">
                  {_("options.collectionStats.aiUsage.overview.totalCalls")}
                </div>
                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100 text-right">
                  {aiUsageStats.totalCalls}
                </div>
              </div>

              {/* 成功率 */}
              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                <div className="text-xs text-green-600 dark:text-green-400 mb-1">
                  {_("options.collectionStats.aiUsage.overview.successRate")}
                </div>
                <div className="text-2xl font-bold text-green-900 dark:text-green-100 text-right">
                  {((aiUsageStats.successfulCalls / aiUsageStats.totalCalls) * 100).toFixed(1)}%
                </div>
                <div className="text-xs text-green-600 dark:text-green-400 mt-0.5 text-right">
                  {aiUsageStats.successfulCalls}/{aiUsageStats.totalCalls}
                </div>
              </div>

              {/* 累计费用 */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
                <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">
                  {_("options.collectionStats.aiUsage.overview.totalCost")}
                </div>
                <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 text-right">
                  ¥{aiUsageStats.cost.total.toFixed(4)}
                </div>
              </div>

              {/* 平均延迟 - 拆分为推理/非推理 */}
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                <div className="text-xs text-amber-600 dark:text-amber-400 mb-1">
                  {_("options.collectionStats.aiUsage.overview.avgLatency")}
                </div>
                {aiUsageStats.byReasoning ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <div className="text-lg font-bold text-amber-900 dark:text-amber-100">
                        {(aiUsageStats.byReasoning.withReasoning.avgLatency / 1000).toFixed(2)}s
                      </div>
                      <div className="text-xs text-amber-600 dark:text-amber-400">{_("options.collectionStats.aiUsage.latency.reasoning")}</div>
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                        {(aiUsageStats.byReasoning.withoutReasoning.avgLatency / 1000).toFixed(2)}s
                      </div>
                      <div className="text-xs text-amber-600 dark:text-amber-400">{_("options.collectionStats.aiUsage.latency.standard")}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-2xl font-bold text-amber-900 dark:text-amber-100">
                    {(aiUsageStats.avgLatency / 1000).toFixed(2)}s
                  </div>
                )}
              </div>
            </div>

            {/* Token 使用详情 */}
            <div className="bg-gradient-to-br from-purple-50/80 to-pink-50/80 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-4 border border-purple-200 dark:border-purple-700 mb-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                📊 {_("options.collectionStats.aiUsage.tokens.title")}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">{_("options.collectionStats.aiUsage.tokens.input")}</div>
                  <div className="text-lg font-bold text-purple-900 dark:text-purple-100">
                    {(aiUsageStats.tokens.input / 1000).toFixed(1)}K
                  </div>
                  <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">
                    ¥{aiUsageStats.cost.input.toFixed(4)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-pink-600 dark:text-pink-400 mb-1">{_("options.collectionStats.aiUsage.tokens.output")}</div>
                  <div className="text-lg font-bold text-pink-900 dark:text-pink-100">
                    {(aiUsageStats.tokens.output / 1000).toFixed(1)}K
                  </div>
                  <div className="text-xs text-pink-600 dark:text-pink-400 mt-0.5">
                    ¥{aiUsageStats.cost.output.toFixed(4)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">{_("options.collectionStats.aiUsage.tokens.total")}</div>
                  <div className="text-lg font-bold text-indigo-900 dark:text-indigo-100">
                    {(aiUsageStats.tokens.total / 1000).toFixed(1)}K
                  </div>
                  <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                    ¥{aiUsageStats.cost.total.toFixed(4)}
                  </div>
                </div>
              </div>
            </div>

            {/* 展开的详细信息 */}
            {showUsageDetails && (
              <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                {/* 按 Provider 分组 */}
                {Object.keys(aiUsageStats.byProvider).length > 0 && (
                  <div className="bg-gradient-to-br from-indigo-50/80 to-cyan-50/80 dark:from-indigo-900/20 dark:to-cyan-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-700">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <span>🤖</span>
                      <span>{_("options.collectionStats.aiUsage.byProvider.title")}</span>
                    </h3>
                    <div className="space-y-2">
                      {(() => {
                        const maxCalls = Math.max(...Object.values(aiUsageStats.byProvider).map(d => d.calls))
                        const maxTokens = Math.max(...Object.values(aiUsageStats.byProvider).map(d => d.tokens.total))
                        return Object.entries(aiUsageStats.byProvider).map(([provider, data]) => (
                          <div key={provider} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-purple-100 dark:border-indigo-800">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {getProviderName(provider, _)}
                              </span>
                              <div className="text-right">
                                <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                  ¥{data.cost.total.toFixed(4)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-2">
                              <span>{data.calls} {_("options.collectionStats.aiUsage.byProvider.calls")}</span>
                              <span>{(data.tokens.total / 1000).toFixed(1)}K {_("options.collectionStats.aiUsage.byProvider.tokens")}</span>
                              <span className="text-gray-400">
                                {_("options.collectionStats.aiUsage.byProvider.inputOutput", {
                                  input: (data.tokens.input / 1000).toFixed(1),
                                  output: (data.tokens.output / 1000).toFixed(1)
                                })}
                              </span>
                            </div>
                            {/* 可视化进度条 */}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-12">{_("options.collectionStats.aiUsage.chart.calls")}</span>
                                <ProgressBar value={data.calls} max={maxCalls} color="indigo" height="h-1.5" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-12">{_("options.collectionStats.aiUsage.chart.tokens")}</span>
                                <ProgressBar value={data.tokens.total} max={maxTokens} color="purple" height="h-1.5" />
                              </div>
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                )}

                {/* 按用途分组 */}
                {Object.keys(aiUsageStats.byPurpose).length > 0 && (
                  <div className="bg-gradient-to-br from-green-50/80 to-emerald-50/80 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4 border border-green-200 dark:border-green-700">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <span>📋</span>
                      <span>{_("options.collectionStats.aiUsage.byPurpose.title")}</span>
                    </h3>
                    <div className="space-y-2">
                      {(() => {
                        const maxCalls = Math.max(...Object.values(aiUsageStats.byPurpose).map(d => d.calls))
                        const maxCost = Math.max(...Object.values(aiUsageStats.byPurpose).map(d => d.cost.total))
                        const purposeLabels: Record<string, string> = {
                          'analyze-content': _("options.collectionStats.aiUsage.byPurpose.analyzeContent"),
                          'recommend-content': _("options.collectionStats.aiUsage.byPurpose.recommendContent"),
                          'generate-profile': _("options.collectionStats.aiUsage.byPurpose.generateProfile"),
                          'test-connection': _("options.collectionStats.aiUsage.byPurpose.testConnection")
                        }
                        return Object.entries(aiUsageStats.byPurpose).map(([purpose, data]) => (
                          <div key={purpose} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-green-100 dark:border-green-800">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {purposeLabels[purpose] || purpose}
                              </span>
                              <div className="text-right">
                                <div className="text-sm font-bold text-green-600 dark:text-green-400">
                                  ¥{data.cost.total.toFixed(4)}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-2">
                              <span>{data.calls} {_("options.collectionStats.aiUsage.byPurpose.calls")}</span>
                              <span>{(data.tokens.total / 1000).toFixed(1)}K {_("options.collectionStats.aiUsage.byPurpose.tokens")}</span>
                              <span className="text-gray-400">
                                {_("options.collectionStats.aiUsage.byPurpose.inputOutput", {
                                  input: (data.tokens.input / 1000).toFixed(1),
                                  output: (data.tokens.output / 1000).toFixed(1)
                                })}
                              </span>
                            </div>
                            {/* 可视化进度条 */}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-12">{_("options.collectionStats.aiUsage.chart.calls")}</span>
                                <ProgressBar value={data.calls} max={maxCalls} color="green" height="h-1.5" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-12">{_("options.collectionStats.aiUsage.chart.cost")}</span>
                                <ProgressBar value={data.cost.total} max={maxCost} color="amber" height="h-1.5" />
                              </div>
                            </div>
                          </div>
                        ))
                      })()}
                    </div>
                  </div>
                )}

                {/* 推理模式对比（如果有推理数据） */}
                {aiUsageStats.byReasoning && (
                  <div className="bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-700">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <span>🧠</span>
                      <span>{_("options.collectionStats.aiUsage.byReasoning.title")}</span>
                    </h3>
                    
                    {/* 可视化对比图表 */}
                    <div className="mb-4 space-y-3">
                      <div>
                        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                          <span>{_("options.collectionStats.aiUsage.chart.callsComparison")}</span>
                          <span>{aiUsageStats.byReasoning.withReasoning.calls + aiUsageStats.byReasoning.withoutReasoning.calls} {_("options.collectionStats.aiUsage.chart.callsUnit")}</span>
                        </div>
                        <div className="flex gap-1 h-6 rounded overflow-hidden">
                          <div 
                            className="bg-orange-500 dark:bg-orange-600 flex items-center justify-center text-xs text-white"
                            style={{ 
                              width: `${(aiUsageStats.byReasoning.withReasoning.calls / (aiUsageStats.byReasoning.withReasoning.calls + aiUsageStats.byReasoning.withoutReasoning.calls) * 100).toFixed(1)}%` 
                            }}
                          >
                            {aiUsageStats.byReasoning.withReasoning.calls > 0 && (
                              <span className="px-2">🔬 {aiUsageStats.byReasoning.withReasoning.calls}</span>
                            )}
                          </div>
                          <div 
                            className="bg-green-500 dark:bg-green-600 flex items-center justify-center text-xs text-white"
                            style={{ 
                              width: `${(aiUsageStats.byReasoning.withoutReasoning.calls / (aiUsageStats.byReasoning.withReasoning.calls + aiUsageStats.byReasoning.withoutReasoning.calls) * 100).toFixed(1)}%` 
                            }}
                          >
                            {aiUsageStats.byReasoning.withoutReasoning.calls > 0 && (
                              <span className="px-2">⚡ {aiUsageStats.byReasoning.withoutReasoning.calls}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                          <span>{_("options.collectionStats.aiUsage.chart.tokensComparison")}</span>
                          <span>{((aiUsageStats.byReasoning.withReasoning.tokens.total + aiUsageStats.byReasoning.withoutReasoning.tokens.total) / 1000).toFixed(1)}K</span>
                        </div>
                        <div className="flex gap-1 h-6 rounded overflow-hidden">
                          <div 
                            className="bg-orange-400 dark:bg-orange-500 flex items-center justify-center text-xs text-white"
                            style={{ 
                              width: `${(aiUsageStats.byReasoning.withReasoning.tokens.total / (aiUsageStats.byReasoning.withReasoning.tokens.total + aiUsageStats.byReasoning.withoutReasoning.tokens.total) * 100).toFixed(1)}%` 
                            }}
                          >
                            {aiUsageStats.byReasoning.withReasoning.tokens.total > 0 && (
                              <span className="px-2">{(aiUsageStats.byReasoning.withReasoning.tokens.total / 1000).toFixed(1)}K</span>
                            )}
                          </div>
                          <div 
                            className="bg-green-400 dark:bg-green-500 flex items-center justify-center text-xs text-white"
                            style={{ 
                              width: `${(aiUsageStats.byReasoning.withoutReasoning.tokens.total / (aiUsageStats.byReasoning.withReasoning.tokens.total + aiUsageStats.byReasoning.withoutReasoning.tokens.total) * 100).toFixed(1)}%` 
                            }}
                          >
                            {aiUsageStats.byReasoning.withoutReasoning.tokens.total > 0 && (
                              <span className="px-2">{(aiUsageStats.byReasoning.withoutReasoning.tokens.total / 1000).toFixed(1)}K</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* 推理模式 */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-amber-100 dark:border-amber-800">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">🔬</span>
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {_("options.collectionStats.aiUsage.byReasoning.withReasoning")}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex justify-between">
                            <span>{_("options.collectionStats.aiUsage.byReasoning.calls")}</span>
                            <span className="font-semibold">{aiUsageStats.byReasoning.withReasoning.calls} {_("options.collectionStats.aiUsage.byReasoning.callsUnit")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{_("options.collectionStats.aiUsage.byReasoning.tokenUsage")}</span>
                            <span className="font-semibold">{(aiUsageStats.byReasoning.withReasoning.tokens.total / 1000).toFixed(1)}K</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-orange-600 dark:text-orange-400">{_("options.collectionStats.aiUsage.byReasoning.avgLatency")}</span>
                            <span className="font-semibold text-orange-600 dark:text-orange-400">
                              {(aiUsageStats.byReasoning.withReasoning.avgLatency / 1000).toFixed(2)}s
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>{_("options.collectionStats.aiUsage.byReasoning.cost")}</span>
                            <span className="font-semibold">¥{aiUsageStats.byReasoning.withReasoning.cost.total.toFixed(4)}</span>
                          </div>
                        </div>
                      </div>

                      {/* 非推理模式 */}
                      <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-amber-100 dark:border-amber-800">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">⚡</span>
                          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                            {_("options.collectionStats.aiUsage.byReasoning.withoutReasoning")}
                          </span>
                        </div>
                        <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex justify-between">
                            <span>{_("options.collectionStats.aiUsage.byReasoning.calls")}</span>
                            <span className="font-semibold">{aiUsageStats.byReasoning.withoutReasoning.calls} {_("options.collectionStats.aiUsage.byReasoning.callsUnit")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>{_("options.collectionStats.aiUsage.byReasoning.tokenUsage")}</span>
                            <span className="font-semibold">{(aiUsageStats.byReasoning.withoutReasoning.tokens.total / 1000).toFixed(1)}K</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-green-600 dark:text-green-400">{_("options.collectionStats.aiUsage.byReasoning.avgLatency")}</span>
                            <span className="font-semibold text-green-600 dark:text-green-400">
                              {(aiUsageStats.byReasoning.withoutReasoning.avgLatency / 1000).toFixed(2)}s
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>{_("options.collectionStats.aiUsage.byReasoning.cost")}</span>
                            <span className="font-semibold">¥{aiUsageStats.byReasoning.withoutReasoning.cost.total.toFixed(4)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* 对比说明 */}
                    {aiUsageStats.byReasoning.withReasoning.calls > 0 && aiUsageStats.byReasoning.withoutReasoning.calls > 0 && (
                      <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded text-xs text-amber-800 dark:text-amber-300">
                        {_("options.collectionStats.aiUsage.byReasoning.comparisonHint")}{' '}
                        <strong>
                          {(aiUsageStats.byReasoning.withReasoning.avgLatency / aiUsageStats.byReasoning.withoutReasoning.avgLatency).toFixed(1)}x
                        </strong>
                        {_("options.collectionStats.aiUsage.byReasoning.comparisonSuffix")}
                      </div>
                    )}
                  </div>
                )}


                {/* 每日/每月用量统计柱形图 */}
                {dailyStats.length > 0 && (
                  <div className="bg-gradient-to-br from-slate-50/80 to-gray-50/80 dark:from-slate-900/20 dark:to-gray-900/20 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <span>📊</span>
                      <span>{usageStatsPeriod === '30days' ? '每日用量统计' : '每月用量统计'}</span>
                    </h3>
                    <AIUsageBarChart 
                      data={dailyStats} 
                      mode={usageStatsPeriod === '30days' ? 'daily' : 'monthly'} 
                    />
                  </div>
                )}

                {/* 统计周期说明 */}
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  💡 数据统计周期：{usageStatsPeriod === '30days' ? '最近 30 天' : '全部时间'} | 数据来源：AI 用量追踪器
                </div>
              </div>
            )}
          </>
        )}

        {/* 引导配置 AI（仅在未配置且没有数据时显示） */}
        {!aiConfigStatus.configured && (!aiUsageStats || aiUsageStats.totalCalls === 0) && (
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
                  href="/options.html?tab=ai-engine"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
                  <span>{_("options.collectionStats.aiConfigPromptLink")}</span>
                  <span>→</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 推荐筛选漏斗 (NEW) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🔍</span>
          <span>{_("options.collectionStats.recommendationFunnelTitle")}</span>
        </h2>

        {!recommendationFunnel || recommendationFunnel.rssArticles === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
              暂无推荐数据
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 立体漏斗可视化 - 曲面圆锥结构 */}
            <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 p-6 md:p-8">
              <div className="flex flex-col xl:flex-row justify-center items-center gap-8">
              <svg
                width="420"
                height="540"
                viewBox="0 0 420 540"
                className="max-w-full h-auto"
              >
                {(() => {
                  if (!recommendationFunnel) {
                    return null
                  }

                  const funnel = recommendationFunnel
                  const svgWidth = 420
                  const centerX = svgWidth / 2
                  const baseBottomY = 440
                  const baseHeight = 85
                  const baseRadius = 48
                  const radiusStep = 34
                  // 漏斗顶部：扩展图标（代表RSS订阅源）
                  const extensionIconUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
                    ? chrome.runtime.getURL('assets/icons/128/base-static.png')
                    : 'assets/icons/128/base-static.png'
                  // 漏斗底部：专业人士头像（用户应该是专业人士）
                  const professionalIconUrl = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234B5563"%3E%3Cpath d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/%3E%3C/svg%3E'

                  const getEllipseRy = (radius: number) => Math.max(12, radius * 0.28)

                  type SegmentConfig = {
                    key: string
                    label: string
                    color: string
                    ellipseColor: string
                    textColor: string
                    value?: number
                    percent?: string
                    displayValue?: string
                    heightScale: number
                    radiusScale: number
                    isCap?: boolean
                    bodyOpacity: number
                    ellipseOpacity: number
                  }

                  const segmentsConfig: SegmentConfig[] = [
                    {
                      key: 'reading',
                      label: _('options.collectionStats.recommendationFunnelReading'),
                      color: 'rgba(254, 240, 138, 0.85)',
                      ellipseColor: 'rgba(255, 249, 196, 0.8)',
                      textColor: '#1f2937',
                      value: funnel.read,
                      percent: funnel.inPool > 0 ? `${((funnel.read / funnel.inPool) * 100).toFixed(1)}%` : '0%',
                      heightScale: 0.65,
                      radiusScale: 0.7,
                      bodyOpacity: 0.65,
                      ellipseOpacity: 0.5
                    },
                    {
                      key: 'recommendations',
                      label: _('options.collectionStats.recommendationFunnelRecommendations'),
                      color: 'rgba(190, 242, 100, 0.85)',
                      ellipseColor: 'rgba(220, 252, 162, 0.78)',
                      textColor: '#1f2937',
                      value: funnel.inPool,
                      percent: funnel.rssArticles > 0 ? `${((funnel.inPool / funnel.rssArticles) * 100).toFixed(1)}%` : '0%',
                      heightScale: 0.78,
                      radiusScale: 0.85,
                      bodyOpacity: 0.62,
                      ellipseOpacity: 0.45
                    },
                    {
                      key: 'articles',
                      label: _('options.collectionStats.recommendationFunnelArticles'),
                      color: 'rgba(125, 211, 252, 0.85)',
                      ellipseColor: 'rgba(191, 232, 255, 0.78)',
                      textColor: '#0f172a',
                      value: funnel.rssArticles,
                      percent: '100%',
                      heightScale: 0.92,
                      radiusScale: 1.05,
                      bodyOpacity: 0.6,
                      ellipseOpacity: 0.42
                    },
                    {
                      key: 'universe',
                      label: _('options.collectionStats.recommendationFunnelUniverse'),
                      color: 'rgba(226, 232, 240, 0.8)',
                      ellipseColor: 'rgba(241, 245, 249, 0.85)',
                      textColor: '#111827',
                      displayValue: _('options.collectionStats.recommendationFunnelInfinitySymbol'),
                      heightScale: 1.15,
                      radiusScale: 1.4,
                      isCap: true,
                      bodyOpacity: 0.55,
                      ellipseOpacity: 0.55
                    }
                  ]

                  type SegmentWithLayout = SegmentConfig & {
                    yTop: number
                    yBottom: number
                    topRadius: number
                    bottomRadius: number
                    topRy: number
                    bottomRy: number
                    midY: number
                    height: number
                  }

                  let currentBottomY = baseBottomY
                  let currentBottomRadius = baseRadius

                  const segmentsWithLayout: SegmentWithLayout[] = segmentsConfig.map((segment) => {
                    const height = baseHeight * segment.heightScale
                    const radiusDelta = radiusStep * segment.radiusScale
                    const yBottom = currentBottomY
                    const yTop = yBottom - height
                    const bottomRadius = currentBottomRadius
                    const topRadius = bottomRadius + radiusDelta
                    const layout: SegmentWithLayout = {
                      ...segment,
                      yTop,
                      yBottom,
                      topRadius,
                      bottomRadius,
                      topRy: getEllipseRy(topRadius),
                      bottomRy: getEllipseRy(bottomRadius),
                      midY: (yTop + yBottom) / 2,
                      height
                    }
                    currentBottomY = yTop
                    currentBottomRadius = topRadius
                    return layout
                  })

                  const buildFrontPath = (segment: SegmentWithLayout) => {
                    const leftBottomX = centerX - segment.bottomRadius
                    const rightBottomX = centerX + segment.bottomRadius
                    const leftTopX = centerX - segment.topRadius
                    const rightTopX = centerX + segment.topRadius
                    return [
                      `M ${leftBottomX} ${segment.yBottom}`,
                      `A ${segment.bottomRadius} ${segment.bottomRy} 0 0 1 ${rightBottomX} ${segment.yBottom}`,
                      `L ${rightTopX} ${segment.yTop}`,
                      `A ${segment.topRadius} ${segment.topRy} 0 0 0 ${leftTopX} ${segment.yTop}`,
                      'Z'
                    ].join(' ')
                  }

                  return (
                    <>
                      <defs>
                        <filter id="funnelShadow" x="-20%" y="-20%" width="140%" height="160%">
                          <feDropShadow dx="0" dy="12" stdDeviation="18" floodColor="#000" floodOpacity="0.28" />
                        </filter>
                      </defs>
                      <g filter="url(#funnelShadow)">
                      {segmentsWithLayout.map((segment) => (
                        <g key={`segment-${segment.key}`}>
                          <ellipse
                            cx={centerX}
                            cy={segment.yBottom}
                            rx={segment.bottomRadius}
                            ry={segment.bottomRy}
                            fill={segment.ellipseColor}
                            opacity={segment.ellipseOpacity}
                          />
                          <path
                            d={buildFrontPath(segment)}
                            fill={segment.color}
                            opacity={segment.bodyOpacity}
                          />
                          <ellipse
                            cx={centerX}
                            cy={segment.yTop}
                            rx={segment.topRadius}
                            ry={segment.topRy}
                            fill={segment.ellipseColor}
                            opacity={Math.min(segment.ellipseOpacity + 0.1, 1)}
                          />
                        </g>
                      ))}
                      </g>
                      <g>
                        {[ -70, 0, 70 ].map((offset, index) => (
                          <image
                            key={`rss-icon-${index}`}
                            href={extensionIconUrl}
                            x={centerX + offset - 24}
                            y={segmentsWithLayout[segmentsWithLayout.length - 1].yTop - 60}
                            width={48}
                            height={48}
                            opacity={0.95 - index * 0.15}
                          />
                        ))}
                      </g>
                      <g pointerEvents="none">
                        {segmentsWithLayout.map((segment) => {
                          const labelFontSize = Math.min(Math.max(segment.height * 0.16, 11), 18)
                          const infoFontSize = Math.min(Math.max(segment.height * 0.2, 13), 22)
                          const labelY = segment.yBottom + labelFontSize * 0.45
                          const infoY = Math.min(segment.yBottom - segment.bottomRy * 0.2, segment.yTop + segment.height * 0.75)
                          const infoSpacing = Math.min(segment.topRadius * 0.45, 90)
                          if (segment.isCap) {
                            return (
                              <g key={`segment-text-${segment.key}`}>
                                <text
                                  x={centerX}
                                  y={segment.yTop + segment.height * 0.45}
                                  textAnchor="middle"
                                  fill={segment.textColor}
                                  fontSize={infoFontSize + 10}
                                  fontWeight="600"
                                >
                                  {segment.displayValue}
                                </text>
                                <text
                                  x={centerX}
                                  y={labelY}
                                  textAnchor="middle"
                                  fill={segment.textColor}
                                  fontSize={labelFontSize + 2}
                                  fontWeight="600"
                                >
                                  {segment.label}
                                </text>
                              </g>
                            )
                          }
                          return (
                            <g key={`segment-text-${segment.key}`}>
                              <text
                                x={centerX}
                                y={labelY}
                                textAnchor="middle"
                                fill={segment.textColor}
                                fontSize={labelFontSize}
                                fontWeight="600"
                              >
                                {segment.label}
                              </text>
                              <text
                                x={centerX - infoSpacing / 2}
                                y={infoY}
                                textAnchor="middle"
                                fill={segment.textColor}
                                fontSize={infoFontSize}
                                fontWeight="700"
                              >
                                {segment.value ?? 0}
                              </text>
                              <text
                                x={centerX + infoSpacing / 2}
                                y={infoY}
                                textAnchor="middle"
                                fill={segment.textColor}
                                fontSize={infoFontSize - 2}
                                fontWeight="600"
                              >
                                {segment.percent ?? '0%'}
                              </text>
                            </g>
                          )
                        })}
                      </g>
                      <g>
                        <text x={centerX} y={baseBottomY + 70} textAnchor="middle" fontSize="32">
                          👨‍💻
                        </text>
                      </g>
                    </>
                  )
                })()}
              </svg>

              {/* 侧边数据球 */}
              <div className="flex flex-col gap-6">
                <div className="relative">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <defs>
                      <radialGradient id="sphereGradient1" cx="40%" cy="35%">
                        <stop offset="0%" stopColor="#FFFBEB" stopOpacity="1" />
                        <stop offset="25%" stopColor="#FEF3C7" stopOpacity="0.95" />
                        <stop offset="50%" stopColor="#FDE68A" stopOpacity="0.9" />
                        <stop offset="75%" stopColor="#FCD34D" stopOpacity="0.75" />
                        <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.6" />
                      </radialGradient>
                      <radialGradient id="sphereHighlight1" cx="35%" cy="30%">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
                        <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                      </radialGradient>
                      <filter id="sphereShadow1">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                        <feOffset dx="2" dy="5"/>
                        <feComponentTransfer>
                          <feFuncA type="linear" slope="0.5"/>
                        </feComponentTransfer>
                        <feMerge>
                          <feMergeNode/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    <circle cx="60" cy="55" r="45" fill="url(#sphereGradient1)" filter="url(#sphereShadow1)"/>
                    <ellipse cx="48" cy="42" rx="20" ry="15" fill="url(#sphereHighlight1)" opacity="0.8"/>
                    <text x="52" y="44" textAnchor="middle" fill="#78350F" fontSize="18" fontWeight="700">
                      {recommendationFunnel.learningPages}
                    </text>
                    <text x="60" y="70" textAnchor="middle" fill="#78350F" fontSize="12" fontWeight="600">
                      {_("options.collectionStats.funnelLearningPages").split("\n").map((line, i) => (
                        <tspan key={i} x="60" dy={i === 0 ? 0 : "1.2em"}>
                          {i === 0 ? "📚 " : ""}{line}
                        </tspan>
                      ))}
                    </text>
                  </svg>
                </div>
                <div className="relative">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <defs>
                      <radialGradient id="sphereGradient2" cx="40%" cy="35%">
                        <stop offset="0%" stopColor="#FFF7ED" stopOpacity="1" />
                        <stop offset="25%" stopColor="#FFEDD5" stopOpacity="0.95" />
                        <stop offset="50%" stopColor="#FDBA74" stopOpacity="0.9" />
                        <stop offset="75%" stopColor="#FB923C" stopOpacity="0.75" />
                        <stop offset="100%" stopColor="#F97316" stopOpacity="0.6" />
                      </radialGradient>
                      <radialGradient id="sphereHighlight2" cx="35%" cy="30%">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
                        <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                      </radialGradient>
                      <filter id="sphereShadow2">
                        <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                        <feOffset dx="2" dy="5"/>
                        <feComponentTransfer>
                          <feFuncA type="linear" slope="0.5"/>
                        </feComponentTransfer>
                        <feMerge>
                          <feMergeNode/>
                          <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                      </filter>
                    </defs>
                    <circle cx="60" cy="55" r="45" fill="url(#sphereGradient2)" filter="url(#sphereShadow2)"/>
                    <ellipse cx="48" cy="42" rx="20" ry="15" fill="url(#sphereHighlight2)" opacity="0.8"/>
                    <text x="52" y="44" textAnchor="middle" fill="#7C2D12" fontSize="18" fontWeight="700">
                      {recommendationFunnel.dismissed}
                    </text>
                    <text x="60" y="70" textAnchor="middle" fill="#7C2D12" fontSize="12" fontWeight="600">
                      {_("options.collectionStats.funnelDismissed").split("\n").map((line, i) => (
                        <tspan key={i} x="60" dy={i === 0 ? 0 : "1.2em"}>
                          {i === 0 ? "❌ " : ""}{line}
                        </tspan>
                      ))}
                    </text>
                  </svg>
                </div>
                </div>
              </div>
            </div>

            {/* 转化率总结 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-700">
              <div className="grid grid-cols-2 gap-6 text-center">
                <div>
                  <div className="text-xs text-green-600 dark:text-green-400 mb-2 font-medium">
                    {_("options.collectionStats.funnelRecommendationRate")}
                  </div>
                  <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                    {recommendationFunnel.rssArticles > 0 ? ((recommendationFunnel.inPool / recommendationFunnel.rssArticles) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {_("options.collectionStats.funnelRssToPool")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-2 font-medium">
                    {_("options.collectionStats.funnelReadingRate")}
                  </div>
                  <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                    {recommendationFunnel.inPool > 0 ? ((recommendationFunnel.read / recommendationFunnel.inPool) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {_("options.collectionStats.funnelPoolToRead")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 订阅源质量蛛网图 (Phase 11) */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>🕸️</span>
          <span>{_("options.collectionStats.feedSpiderSectionTitle")}</span>
        </h2>

        {feedStats.length === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
              {_("options.collectionStats.feedSpiderNoData")}
            </p>
          </div>
        ) : (
          <FeedSpiderChart stats={feedStats} size={600} showLabels={true} />
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
