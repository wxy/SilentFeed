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
  const [funnelCurrentFeedOnly, setFunnelCurrentFeedOnly] = useState(false) // 默认显示文章池（全部）
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
    // 漏斗层（累计统计，到 recommended 为止）
    rssArticles: number
    analyzed: number
    candidate: number
    recommended: number
    // 右侧卡片（状态/动态指标）
    prescreenedOut: number
    raw: number
    stale: number  // Phase 14.2: 已过时（出源未分析）
    analyzedNotQualified: number
    currentRecommendedPool: number
    recommendedPoolCapacity: number
    currentPopupCount: number
    popupCapacity: number
    exitStats: {
      total: number
      read: number
      saved: number
      disliked: number
      unread: number  // 未读总数 = replaced + expired + stale + other
      replaced: number
      expired: number
      stale: number   // 出源
      other: number   // 其他
    }
    learningPages: number
    // 筛选信息
    currentFeedOnly: boolean
    currentFeedArticleCount: number
    totalArticleCount: number
    // 兼容旧字段
    prescreened: number
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
          getRecommendationFunnel(funnelCurrentFeedOnly),
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
  }, [usageStatsPeriod, funnelCurrentFeedOnly])  // 当周期或筛选变化时重新加载

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
      // 清理所有数据（recommendations 表已删除，改用 feedArticles）
      await Promise.all([
        db.pendingVisits.clear(),
        db.confirmedVisits.clear(),
        db.userProfile.clear()
      ])
      
      // 清理所有弹窗推荐状态
      const popupArticles = await db.feedArticles.filter(a => a.poolStatus === 'recommended').toArray()
      const now = Date.now()
      for (const article of popupArticles) {
        await db.feedArticles.update(article.id, {
          poolStatus: 'exited',
          poolExitedAt: now,
          poolExitReason: 'replaced'
        })
      }
      
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
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100 text-right">
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
            <div className="text-2xl font-bold text-green-900 dark:text-green-100 text-right">
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
            <div className="text-2xl font-bold text-cyan-900 dark:text-cyan-100 text-right">
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
              {_("options.collectionStats.aiUsage.noData")}
            </p>
            {!aiConfigStatus.configured && (
              <div className="mt-4 flex justify-center">
                <a
                  href="/options.html?tab=ai-engine"
                  className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <span>{_("options.collectionStats.aiConfigPromptLink")}</span>
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
                <div className="text-right space-y-1">
                  {(() => {
                    const items: Array<{ label: string; value: number }> = [
                      { label: "¥", value: aiUsageStats.byCurrency?.CNY?.total || 0 },
                      { label: "$", value: aiUsageStats.byCurrency?.USD?.total || 0 }
                    ]
                    const visible = items.filter(i => i.value > 0)
                    if (visible.length === 0) {
                      return <div className="text-sm text-gray-500 dark:text-gray-400">{_("options.collectionStats.aiUsage.noCost")}</div>
                    }
                    return (
                      <div className="flex flex-col items-end gap-0.5">
                        {visible.map((i, idx) => (
                          <div key={idx} className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">
                            {i.label}{i.value.toFixed(4)}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>

              {/* 平均延迟 - 拆分为推理/非推理 */}
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                <div className="text-xs text-amber-600 dark:text-amber-400 mb-1">
                  {_("options.collectionStats.aiUsage.overview.avgLatency")}
                </div>
                {aiUsageStats.byReasoning ? (
                  <>
                    <div className="flex items-baseline gap-2 justify-end">
                      <div className="text-lg font-bold text-amber-900 dark:text-amber-100">
                        {(aiUsageStats.byReasoning.withReasoning.avgLatency / 1000).toFixed(2)}s
                      </div>
                      <div className="text-xs text-amber-600 dark:text-amber-400">{_("options.collectionStats.aiUsage.latency.reasoning")}</div>
                    </div>
                    <div className="flex items-baseline gap-2 mt-1 justify-end">
                      <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                        {(aiUsageStats.byReasoning.withoutReasoning.avgLatency / 1000).toFixed(2)}s
                      </div>
                      <div className="text-xs text-amber-600 dark:text-amber-400">{_("options.collectionStats.aiUsage.latency.standard")}</div>
                    </div>
                  </>
                ) : (
                  <div className="text-2xl font-bold text-amber-900 dark:text-amber-100 text-right">
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
                  <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5 flex flex-col items-center gap-0.5">
                    {aiUsageStats.byCurrency?.CNY?.input > 0 && (
                      <span>¥{aiUsageStats.byCurrency.CNY.input.toFixed(4)}</span>
                    )}
                    {aiUsageStats.byCurrency?.USD?.input > 0 && (
                      <span>${aiUsageStats.byCurrency.USD.input.toFixed(4)}</span>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-pink-600 dark:text-pink-400 mb-1">{_("options.collectionStats.aiUsage.tokens.output")}</div>
                  <div className="text-lg font-bold text-pink-900 dark:text-pink-100">
                    {(aiUsageStats.tokens.output / 1000).toFixed(1)}K
                  </div>
                  <div className="text-xs text-pink-600 dark:text-pink-400 mt-0.5 flex flex-col items-center gap-0.5">
                    {aiUsageStats.byCurrency?.CNY?.output > 0 && (
                      <span>¥{aiUsageStats.byCurrency.CNY.output.toFixed(4)}</span>
                    )}
                    {aiUsageStats.byCurrency?.USD?.output > 0 && (
                      <span>${aiUsageStats.byCurrency.USD.output.toFixed(4)}</span>
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1">{_("options.collectionStats.aiUsage.tokens.total")}</div>
                  <div className="text-lg font-bold text-indigo-900 dark:text-indigo-100">
                    {(aiUsageStats.tokens.total / 1000).toFixed(1)}K
                  </div>
                  <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5 flex flex-col items-center gap-0.5">
                    {aiUsageStats.byCurrency?.CNY?.total > 0 && (
                      <span>¥{aiUsageStats.byCurrency.CNY.total.toFixed(4)}</span>
                    )}
                    {aiUsageStats.byCurrency?.USD?.total > 0 && (
                      <span>${aiUsageStats.byCurrency.USD.total.toFixed(4)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 展开的详细信息 */}
            {showUsageDetails && (
              <div className="space-y-4 animate-in slide-in-from-top-2 duration-300 max-w-full overflow-hidden">
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
                                {(() => {
                                  const symbol = data.currency === 'USD' ? '$' : (data.currency === 'CNY' ? '¥' : '')
                                  const value = data.cost.total || 0
                                  return value > 0 && symbol ? (
                                    <div className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                      {symbol}{value.toFixed(4)}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-gray-400">{_("options.collectionStats.aiUsage.noCost")}</div>
                                  )
                                })()}
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
                          'analyze-source': _("options.collectionStats.aiUsage.byPurpose.analyzeSource"),
                          'strategy-decision': _("options.collectionStats.aiUsage.byPurpose.strategyDecision"),
                          'pool-strategy-decision': _("options.collectionStats.aiUsage.byPurpose.poolStrategyDecision"),
                          'feed-prescreening': _("options.collectionStats.aiUsage.byPurpose.feedPrescreening"),
                          'translate': _("options.collectionStats.aiUsage.byPurpose.translate"),
                          'test-connection': _("options.collectionStats.aiUsage.byPurpose.testConnection"),
                          'other': _("options.collectionStats.aiUsage.byPurpose.other")
                        }
                        return Object.entries(aiUsageStats.byPurpose).map(([purpose, data]) => (
                          <div key={purpose} className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-green-100 dark:border-green-800">
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                {purposeLabels[purpose] || purpose}
                              </span>
                              <div className="text-right">
                                {/* 按用途的币种细分（隐藏为 0 的币种） - 垂直排列避免折行 */}
                                <div className="text-sm font-bold text-green-600 dark:text-green-400 flex flex-col items-end gap-0.5">
                                  {(data.byCurrency?.USD?.total ?? 0) > 0 && (
                                    <span className="inline-block">${data.byCurrency!.USD!.total!.toFixed(4)}</span>
                                  )}
                                  {(data.byCurrency?.CNY?.total ?? 0) > 0 && (
                                    <span className="inline-block">¥{data.byCurrency!.CNY!.total!.toFixed(4)}</span>
                                  )}
                                </div>
                                {/* 仅展示各币种总费用，不区分输入/输出（零值隐藏） */}
                                {/* 需求说明：按用途分组只关心不同币种各有多少 */}
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
                                <ProgressBar value={(data.byCurrency?.USD?.total || 0) + (data.byCurrency?.CNY?.total || 0)} max={maxCost} color="amber" height="h-1.5" />
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
                            <span className="font-semibold flex gap-2">
                              {aiUsageStats.byCurrency?.USD?.total > 0 && (
                                <span>${aiUsageStats.byReasoning.withReasoning.cost.total.toFixed(4)}</span>
                              )}
                              {aiUsageStats.byCurrency?.CNY?.total > 0 && (
                                <span>¥{aiUsageStats.byReasoning.withReasoning.cost.total.toFixed(4)}</span>
                              )}
                            </span>
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
                            <span className="font-semibold flex gap-2">
                              {aiUsageStats.byCurrency?.USD?.total > 0 && (
                                <span>${aiUsageStats.byReasoning.withoutReasoning.cost.total.toFixed(4)}</span>
                              )}
                              {aiUsageStats.byCurrency?.CNY?.total > 0 && (
                                <span>¥{aiUsageStats.byReasoning.withoutReasoning.cost.total.toFixed(4)}</span>
                              )}
                            </span>
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
                  <div className="bg-gradient-to-br from-slate-50/80 to-gray-50/80 dark:from-slate-900/20 dark:to-gray-900/20 rounded-lg p-4 border border-slate-200 dark:border-slate-700 max-w-[880px]">
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <span>📊</span>
                      <span>{_(usageStatsPeriod === '30days' ? 'settings.aiUsage.chartTitle.daily' : 'settings.aiUsage.chartTitle.monthly')}</span>
                    </h3>
                    <div className="w-full overflow-hidden">
                      <AIUsageBarChart 
                        data={dailyStats} 
                        mode={usageStatsPeriod === '30days' ? 'daily' : 'monthly'} 
                      />
                    </div>
                  </div>
                )}

                {/* 统计周期说明 */}
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  {_('settings.aiUsage.periodInfo.template', {
                    period: _(usageStatsPeriod === '30days' ? 'settings.aiUsage.periodInfo.last30Days' : 'settings.aiUsage.periodInfo.allTime')
                  })}
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <span>🔍</span>
            <span>{_("options.collectionStats.recommendationFunnelTitle")}</span>
          </h2>
          {/* 数据范围切换 - Tab 样式 */}
          <div className="flex items-center gap-1 text-sm">
            <span className="text-gray-400 dark:text-gray-500 text-xs mr-1">
              {recommendationFunnel?.totalArticleCount ?? 0}
            </span>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
              <button
                onClick={() => setFunnelCurrentFeedOnly(false)}
                className={`px-3 py-1 text-xs font-medium transition-colors ${
                  !funnelCurrentFeedOnly
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                {_("options.collectionStats.allHistory")}
              </button>
              <button
                onClick={() => setFunnelCurrentFeedOnly(true)}
                className={`px-3 py-1 text-xs font-medium transition-colors border-l border-gray-200 dark:border-gray-600 ${
                  funnelCurrentFeedOnly
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                {_("options.collectionStats.currentFeedOnly")}
              </button>
            </div>
          </div>
        </div>

        {!recommendationFunnel || recommendationFunnel.rssArticles === 0 ? (
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 border-2 border-dashed border-gray-300 dark:border-gray-600">
            <p className="text-center text-gray-500 dark:text-gray-400 text-sm">
              {_("options.collectionStats.recommendationFunnelNoData")}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 立体漏斗可视化 - 圆锥曲面，截面面积与数值成比例 */}
            <div className="rounded-2xl bg-gray-50 dark:bg-gray-800 p-6 md:p-8">
              <div className="flex flex-col xl:flex-row justify-center items-center gap-8">
              <svg
                width="580"
                height="680"
                viewBox="0 0 580 680"
                className="max-w-full h-auto"
              >
                {(() => {
                  if (!recommendationFunnel) {
                    return null
                  }

                  const funnel = recommendationFunnel
                  const svgWidth = 580
                  const labelAreaWidth = 140  // 左侧标签区域宽度
                  const funnelAreaWidth = svgWidth - labelAreaWidth
                  const centerX = labelAreaWidth + funnelAreaWidth / 2
                  
                  // 漏斗几何参数 - Phase 13+ 5层漏斗优化
                  const funnelTopY = 80      // 漏斗顶部Y坐标
                  const funnelBottomY = 480  // 漏斗底部Y坐标
                  const funnelHeight = funnelBottomY - funnelTopY
                  const maxRadius = 150      // 最顶层数据层半径
                  const topExpandRadius = 200 // 互联网层放大半径
                  const minRadius = 3        // 最小半径（仅作为兜底保护）
                  
                  // 漏斗顶部：扩展图标（代表RSS订阅源）
                  const extensionIconUrl = typeof chrome !== 'undefined' && chrome.runtime?.getURL
                    ? chrome.runtime.getURL('assets/icons/128/base-static.png')
                    : 'assets/icons/128/base-static.png'

                  // 椭圆纵向半径（透视效果）
                  // 保持恒定比例 0.20，最小值降低以保持小半径的椭圆率一致
                  const getEllipseRy = (radius: number) => Math.max(2.5, radius * 0.20)

                  // 数据层配置（从底部到顶部）
                  type LayerConfig = {
                    key: string
                    label: string
                    color: string
                    ellipseColor: string
                    textColor: string
                    value: number
                    percent: string
                    bodyOpacity: number
                    ellipseOpacity: number
                  }

                  // 定义各层数据 - 从小到大排序（底部到顶部）
                  // Phase 14: 修正漏斗层，移除"通过初筛"（动态指标不适合放在漏斗中）
                  // Phase 14.2: 移除"已读"层，漏斗终止于"已推荐"
                  // 漏斗层（累计统计）：RSS文章 → 已分析 → 候选池 → 已推荐
                  // 添加渐变ID用于美化
                  const layers: (LayerConfig & { gradientId: string })[] = [
                    {
                      key: 'recommended',
                      label: _('options.collectionStats.recommendationFunnelRecommended'),
                      color: 'rgba(190, 242, 100, 0.85)',
                      ellipseColor: 'rgba(220, 252, 162, 0.78)',
                      textColor: '#1f2937',
                      value: funnel.recommended,
                      percent: funnel.candidate > 0 ? `${((funnel.recommended / funnel.candidate) * 100).toFixed(1)}%` : '0%',
                      bodyOpacity: 0.82,
                      ellipseOpacity: 0.65,
                      gradientId: 'gradRecommended'
                    },
                    {
                      key: 'candidate',
                      label: _('options.collectionStats.recommendationFunnelCandidate'),
                      color: 'rgba(251, 191, 36, 0.85)',
                      ellipseColor: 'rgba(253, 224, 71, 0.78)',
                      textColor: '#1f2937',
                      value: funnel.candidate,
                      percent: funnel.analyzed > 0 ? `${((funnel.candidate / funnel.analyzed) * 100).toFixed(1)}%` : '0%',
                      bodyOpacity: 0.80,
                      ellipseOpacity: 0.62,
                      gradientId: 'gradCandidate'
                    },
                    {
                      key: 'analyzed',
                      label: _('options.collectionStats.recommendationFunnelAnalyzed'),
                      color: 'rgba(167, 139, 250, 0.85)',
                      ellipseColor: 'rgba(196, 181, 253, 0.78)',
                      textColor: '#1f2937',
                      value: funnel.analyzed,
                      percent: funnel.rssArticles > 0 ? `${((funnel.analyzed / funnel.rssArticles) * 100).toFixed(1)}%` : '0%',
                      bodyOpacity: 0.78,
                      ellipseOpacity: 0.58,
                      gradientId: 'gradAnalyzed'
                    },
                    {
                      key: 'articles',
                      label: _('options.collectionStats.recommendationFunnelArticles'),
                      color: 'rgba(125, 211, 252, 0.85)',
                      ellipseColor: 'rgba(191, 232, 255, 0.78)',
                      textColor: '#0f172a',
                      value: funnel.rssArticles,
                      percent: '100%',
                      bodyOpacity: 0.75,
                      ellipseOpacity: 0.55,
                      gradientId: 'gradArticles'
                    }
                  ]

                  // 计算基于上一层转化率的累积半径
                  // 每层的半径 = 上一层半径 × 转化率（面积比例，所以用 √转化率）
                  // 这样视觉上能更明显地体现过滤效果
                  const layerBottomRadii: number[] = []
                  
                  // 从最顶层（文章层）开始计算
                  // layers 数组是从底部到顶部：[阅读, 已推荐, 候选, 已分析, 文章]
                  // 我们需要从文章层开始，依次向下计算
                  for (let i = layers.length - 1; i >= 0; i--) {
                    if (i === layers.length - 1) {
                      // 最顶层（文章）使用 maxRadius
                      layerBottomRadii[i] = maxRadius
                    } else {
                      // 当前层相对于上一层的转化率
                      const upperLayer = layers[i + 1]
                      const currentLayer = layers[i]
                      const conversionRate = upperLayer.value > 0 
                        ? currentLayer.value / upperLayer.value 
                        : 0
                      // 半径 = 上一层半径 × √转化率（面积正比于数值）
                      const upperRadius = layerBottomRadii[i + 1]
                      const newRadius = upperRadius * Math.sqrt(conversionRate)
                      layerBottomRadii[i] = Math.max(newRadius, minRadius)
                    }
                  }
                  
                  // 计算每层顶部的半径（等于上一层的底部，最顶层放大代表互联网）
                  const layerTopRadii = layers.map((_, i) => {
                    if (i === layers.length - 1) {
                      // 最顶层顶部放大，代表无尽的互联网信息
                      return topExpandRadius
                    }
                    // 其他层顶部 = 下一层的底部
                    return layerBottomRadii[i + 1]
                  })
                  
                  // 根据半径差异分配垂直空间
                  const radiusDiffs: number[] = layers.map((_, i) => 
                    layerTopRadii[i] - layerBottomRadii[i]
                  )
                  const totalRadiusDiff = radiusDiffs.reduce((a, b) => a + b, 0) || 1
                  
                  // 计算各层的Y坐标
                  type LayerWithGeometry = LayerConfig & {
                    bottomY: number
                    topY: number
                    bottomRadius: number
                    topRadius: number
                    bottomRy: number
                    topRy: number
                    segmentHeight: number
                  }

                  const layersWithGeometry: LayerWithGeometry[] = []
                  let currentY = funnelBottomY
                  
                  // 各层等高
                  const equalSegmentHeight = funnelHeight / layers.length
                  
                  for (let i = 0; i < layers.length; i++) {
                    const bottomRadius = layerBottomRadii[i]
                    const topRadius = layerTopRadii[i]
                    const segmentHeight = equalSegmentHeight
                    
                    layersWithGeometry.push({
                      ...layers[i],
                      bottomY: currentY,
                      topY: currentY - segmentHeight,
                      bottomRadius,
                      topRadius,
                      bottomRy: getEllipseRy(bottomRadius),
                      topRy: getEllipseRy(topRadius),
                      segmentHeight
                    })
                    
                    currentY -= segmentHeight
                  }

                  // 三次贝塞尔曲线构建曲面路径
                  // 控制点靠近下一层位置，曲率变化更自然
                  const buildCurvedPath = (layer: LayerWithGeometry) => {
                    const leftBottom = centerX - layer.bottomRadius
                    const rightBottom = centerX + layer.bottomRadius
                    const leftTop = centerX - layer.topRadius
                    const rightTop = centerX + layer.topRadius
                    
                    // 控制点位于截面位置（顶部和底部的中点半径）
                    // 不做水平外扩，曲线沿漏斗轮廓自然过渡
                    const midRadius = (layer.bottomRadius + layer.topRadius) / 2
                    const leftMidX = centerX - midRadius
                    const rightMidX = centerX + midRadius
                    const midY = (layer.bottomY + layer.topY) / 2
                    
                    // 使用三次贝塞尔曲线 C (两个控制点)
                    // 控制点1靠近底部，控制点2在截面中间位置，曲率变化靠近下一层更自然
                    return [
                      // 从左下角开始
                      `M ${leftBottom} ${layer.bottomY}`,
                      // 底部椭圆弧（前半部分）
                      `A ${layer.bottomRadius} ${layer.bottomRy} 0 0 1 ${rightBottom} ${layer.bottomY}`,
                      // 右侧三次贝塞尔曲线向上
                      `C ${rightBottom} ${layer.bottomY - layer.segmentHeight * 0.4}, ${rightMidX} ${midY}, ${rightTop} ${layer.topY}`,
                      // 顶部椭圆弧（后半部分）
                      `A ${layer.topRadius} ${layer.topRy} 0 0 0 ${leftTop} ${layer.topY}`,
                      // 左侧三次贝塞尔曲线向下
                      `C ${leftMidX} ${midY}, ${leftBottom} ${layer.bottomY - layer.segmentHeight * 0.4}, ${leftBottom} ${layer.bottomY}`,
                      'Z'
                    ].join(' ')
                  }

                  return (
                    <>
                      <defs>
                        <filter id="funnelShadow" x="-20%" y="-20%" width="140%" height="160%">
                          <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#000" floodOpacity="0.2" />
                        </filter>
                        {/* 各层渐变定义 - Phase 13+ 多池架构漏斗 */}
                        <linearGradient id="gradReading" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#FEF9C3" stopOpacity="0.95" />
                          <stop offset="50%" stopColor="#FDE047" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#FACC15" stopOpacity="0.75" />
                        </linearGradient>
                        <linearGradient id="gradRecommended" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#D9F99D" stopOpacity="0.95" />
                          <stop offset="50%" stopColor="#A3E635" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#84CC16" stopOpacity="0.75" />
                        </linearGradient>
                        <linearGradient id="gradCandidate" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#FEF3C7" stopOpacity="0.95" />
                          <stop offset="50%" stopColor="#FBBF24" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.75" />
                        </linearGradient>
                        <linearGradient id="gradAnalyzed" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#EDE9FE" stopOpacity="0.95" />
                          <stop offset="50%" stopColor="#A78BFA" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.75" />
                        </linearGradient>
                        <linearGradient id="gradArticles" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#BAE6FD" stopOpacity="0.95" />
                          <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.85" />
                          <stop offset="100%" stopColor="#0EA5E9" stopOpacity="0.75" />
                        </linearGradient>
                        <linearGradient id="gradInternet" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#E0E7FF" stopOpacity="0.9" />
                          <stop offset="50%" stopColor="#A5B4FC" stopOpacity="0.8" />
                          <stop offset="100%" stopColor="#818CF8" stopOpacity="0.7" />
                        </linearGradient>
                      </defs>
                      
                      {/* 漏斗主体 */}
                      <g filter="url(#funnelShadow)">
                        {/* 各层曲面段 */}
                        {layersWithGeometry.map((layer, layerIndex) => (
                          <g key={`segment-${layer.key}`}>
                            {/* 底部椭圆 - 代表该层筛选后的数值 */}
                            <ellipse
                              cx={centerX}
                              cy={layer.bottomY}
                              rx={layer.bottomRadius}
                              ry={layer.bottomRy}
                              fill={`url(#${layer.gradientId})`}
                              opacity={layer.ellipseOpacity}
                            />
                            {/* 曲面主体 - 使用渐变 */}
                            <path
                              d={buildCurvedPath(layer)}
                              fill={`url(#${layer.gradientId})`}
                              opacity={layer.bodyOpacity}
                            />
                            {/* 顶部椭圆 */}
                            <ellipse
                              cx={centerX}
                              cy={layer.topY}
                              rx={layer.topRadius}
                              ry={layer.topRy}
                              fill={layerIndex === layersWithGeometry.length - 1 ? 'url(#gradInternet)' : `url(#${layer.gradientId})`}
                              opacity={Math.min(layer.ellipseOpacity + 0.2, 1)}
                            />
                          </g>
                        ))}
                      </g>
                      
                      {/* 顶部互联网标识 */}
                      <g>
                        <text 
                          x={centerX} 
                          y={(layersWithGeometry[layersWithGeometry.length - 1]?.topY ?? funnelTopY) - 8}
                          textAnchor="middle" 
                          fontSize="28" 
                          fill="#FFFFFF"
                          fontWeight="300"
                          opacity="0.95"
                          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.3)' }}
                        >
                          ∞
                        </text>
                        <text 
                          x={centerX} 
                          y={(layersWithGeometry[layersWithGeometry.length - 1]?.topY ?? funnelTopY) + 12}
                          textAnchor="middle" 
                          fontSize="10" 
                          fill="#FFFFFF"
                          opacity="0.85"
                          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}
                        >
                          {_('options.collectionStats.recommendationFunnelUniverse')}
                        </text>
                      </g>
                      
                      {/* 顶部RSS图标 - 移到两侧 */}
                      <g>
                        {[-90, 90].map((offset, index) => (
                          <image
                            key={`rss-icon-${index}`}
                            href={extensionIconUrl}
                            x={centerX + offset - 16}
                            y={(layersWithGeometry[layersWithGeometry.length - 1]?.topY ?? funnelTopY) - 20}
                            width={32}
                            height={32}
                            opacity={0.7}
                          />
                        ))}
                      </g>
                      
                      {/* 左侧文字标签 - 垂直排列，用线条指向对应层 */}
                      <g pointerEvents="none">
                        {layersWithGeometry.map((layer, layerIdx) => {
                          // 字号设置
                          const labelFontSize = 11
                          const valueFontSize = 14
                          const percentFontSize = 10
                          
                          // 标签位于层的中心高度
                          const layerCenterY = (layer.topY + layer.bottomY) / 2
                          
                          // 左侧标签区域
                          const labelX = 10
                          const labelY = layerCenterY - 8
                          const valueY = layerCenterY + 8
                          const percentY = layerCenterY + 22
                          
                          // 指示线终点（漏斗左边缘）
                          const lineEndX = centerX - layer.bottomRadius - 5
                          const lineStartX = 125
                          
                          // 层对应的颜色（用于指示线和圆点）
                          const layerColors: Record<string, string> = {
                            'reading': '#FACC15',
                            'recommended': '#84CC16',
                            'candidate': '#F59E0B',
                            'analyzed': '#8B5CF6',
                            'articles': '#0EA5E9'
                          }
                          const dotColor = layerColors[layer.key] || '#6B7280'
                          
                          return (
                            <g key={`segment-text-${layer.key}`}>
                              {/* 指示线 */}
                              <line
                                x1={lineStartX}
                                y1={layerCenterY}
                                x2={lineEndX}
                                y2={layerCenterY}
                                stroke={dotColor}
                                strokeWidth="1.5"
                                strokeDasharray="4 2"
                                opacity="0.6"
                              />
                              {/* 连接圆点 */}
                              <circle
                                cx={lineEndX}
                                cy={layerCenterY}
                                r="4"
                                fill={dotColor}
                                opacity="0.8"
                              />
                              {/* 层标签 */}
                              <text
                                x={labelX}
                                y={labelY}
                                textAnchor="start"
                                fill="#374151"
                                className="dark:fill-gray-300"
                                fontSize={labelFontSize}
                                fontWeight="600"
                              >
                                {layer.label}
                              </text>
                              {/* 数值 */}
                              <text
                                x={labelX}
                                y={valueY}
                                textAnchor="start"
                                fill="#1F2937"
                                className="dark:fill-gray-100"
                                fontSize={valueFontSize}
                                fontWeight="700"
                              >
                                {layer.value}
                              </text>
                              {/* 百分比 */}
                              <text
                                x={labelX + 45}
                                y={valueY}
                                textAnchor="start"
                                fill="#6B7280"
                                className="dark:fill-gray-400"
                                fontSize={percentFontSize}
                                fontWeight="500"
                              >
                                ({layer.percent})
                              </text>
                            </g>
                          )
                        })}
                      </g>
                      
                      {/* 底部用户图标 */}
                      <g>
                        <text x={centerX} y={funnelBottomY + 50} textAnchor="middle" fontSize="32">
                          👨‍💻
                        </text>
                        
                        {/* 退出统计 - 放在用户图标下方，横向排列 */}
                        <g transform={`translate(${centerX}, ${funnelBottomY + 80})`}>
                          {/* 退出详情横向排列 - 3个用户主动 + 分隔符 + 4个被动/未读细分 */}
                          {(() => {
                            const exitItems = [
                              // 用户主动操作
                              { icon: '✓', label: _("options.collectionStats.funnelExitRead"), value: funnel.exitStats?.read ?? 0, color: '#16A34A' },
                              { icon: '📥', label: _("options.collectionStats.funnelExitSaved"), value: funnel.exitStats?.saved ?? 0, color: '#2563EB' },
                              { icon: '✕', label: _("options.collectionStats.funnelExitDisliked"), value: funnel.exitStats?.disliked ?? 0, color: '#DC2626' },
                              // 分隔符占位
                              { icon: '│', label: '', value: '', color: '#D1D5DB', isSeparator: true },
                              // 未读细分（被动离开）
                              { icon: '🔄', label: _("options.collectionStats.funnelExitReplaced"), value: funnel.exitStats?.replaced ?? 0, color: '#9333EA' },
                              { icon: '⏰', label: _("options.collectionStats.funnelExitExpired"), value: funnel.exitStats?.expired ?? 0, color: '#EA580C' },
                              { icon: '🗑️', label: _("options.collectionStats.funnelStale"), value: funnel.exitStats?.stale ?? 0, color: '#6B7280' },
                              { icon: '❓', label: _("options.collectionStats.funnelExitOther"), value: funnel.exitStats?.other ?? 0, color: '#9CA3AF' }
                            ]
                            const itemWidth = 44
                            const totalWidth = exitItems.length * itemWidth
                            const startX = -totalWidth / 2 + itemWidth / 2
                            
                            return exitItems.map((item, idx) => {
                              if (item.isSeparator) {
                                return (
                                  <g key={`exit-${idx}`} transform={`translate(${startX + idx * itemWidth}, 0)`}>
                                    <text x={0} y={14} textAnchor="middle" fontSize="16" fill="#D1D5DB">│</text>
                                  </g>
                                )
                              }
                              return (
                                <g key={`exit-${idx}`} transform={`translate(${startX + idx * itemWidth}, 0)`}>
                                  <text x={0} y={0} textAnchor="middle" fontSize="10">{item.icon}</text>
                                  <text 
                                    x={0} 
                                    y={12} 
                                    textAnchor="middle" 
                                    fontSize="8" 
                                    fill="#6B7280"
                                  >
                                    {item.label}
                                  </text>
                                  <text 
                                    x={0} 
                                    y={24} 
                                    textAnchor="middle" 
                                    fontSize="11" 
                                    fontWeight="bold"
                                    fill={item.color}
                                  >
                                    {item.value}
                                  </text>
                                </g>
                              )
                            })
                          })()}
                        </g>
                        
                        {/* 推荐漏斗恒等式 - 放在退出统计下方 */}
                        <g transform={`translate(${centerX}, ${funnelBottomY + 135})`}>
                          {(() => {
                            const funnel = recommendationFunnel
                            if (!funnel) return null
                            
                            // 验证等式 1: analyzed = rssArticles - raw - stale - prescreenedOut
                            const analyzedCalc = funnel.rssArticles - funnel.raw - funnel.stale - funnel.prescreenedOut
                            const isValid1 = analyzedCalc === funnel.analyzed
                            
                            // 验证等式 2: analyzed = analyzedNotQualified + candidate + currentRecommendedPool + exited
                            const exitedCount = (funnel.exitStats?.total ?? 0) - (funnel.exitStats?.stale ?? 0)
                            const analyzedSum = (funnel.analyzedNotQualified ?? 0) + funnel.candidate + (funnel.currentRecommendedPool ?? 0) + exitedCount
                            const isValid2 = analyzedSum === funnel.analyzed
                            
                            // 定义恒等式的所有项：左边4个 - 右边4个 = 中间1个
                            const items = [
                              { value: funnel.rssArticles, label: '订阅源', color: '#1F2937' },
                              { value: funnel.raw, label: '待分析', color: '#6B7280' },
                              { value: funnel.stale, label: '已过时', color: '#6B7280' },
                              { value: funnel.prescreenedOut, label: '初筛淘汰', color: '#6B7280' },
                              { value: funnel.analyzed, label: '已分析', color: '#3B82F6', isBold: true },
                              { value: funnel.analyzedNotQualified ?? 0, label: '未达标', color: '#6B7280' },
                              { value: funnel.candidate, label: '候选池', color: '#EAB308' },
                              { value: funnel.currentRecommendedPool ?? 0, label: '推荐池', color: '#10B981' },
                              { value: exitedCount, label: '已退出', color: '#6B7280' }
                            ]
                            
                            // 每个项目占用 55px 宽度
                            const itemWidth = 55
                            const startX = -4 * itemWidth - 27
                            
                            return (
                              <>
                                {/* 数字行 */}
                                {items.map((item, idx) => (
                                  <text
                                    key={`value-${idx}`}
                                    x={startX + idx * itemWidth}
                                    y={0}
                                    textAnchor="middle"
                                    fontSize="13"
                                    fontWeight={item.isBold ? 'bold' : 'normal'}
                                    fill={item.color}
                                  >
                                    {item.value}
                                  </text>
                                ))}
                                
                                {/* 运算符行 */}
                                {[0, 1, 2, 3, 4, 5, 6, 7].map((idx) => {
                                  let operator = ''
                                  let color = '#9CA3AF'
                                  let bold = false
                                  
                                  if (idx === 3) {
                                    // 第一个等号
                                    operator = isValid1 ? '=' : '≠'
                                    color = isValid1 ? '#10B981' : '#EF4444'
                                    bold = true
                                  } else if (idx === 4) {
                                    // 第二个等号
                                    operator = isValid2 ? '=' : '≠'
                                    color = isValid2 ? '#10B981' : '#EF4444'
                                    bold = true
                                  } else if (idx < 3) {
                                    operator = '-'
                                  } else {
                                    operator = '+'
                                  }
                                  
                                  return (
                                    <text
                                      key={`op-${idx}`}
                                      x={startX + (idx + 0.5) * itemWidth}
                                      y={-2}
                                      textAnchor="middle"
                                      fontSize="12"
                                      fontWeight={bold ? 'bold' : 'normal'}
                                      fill={color}
                                    >
                                      {operator}
                                    </text>
                                  )
                                })}
                                
                                {/* 标签行 */}
                                {items.map((item, idx) => (
                                  <text
                                    key={`label-${idx}`}
                                    x={startX + idx * itemWidth}
                                    y={22}
                                    textAnchor="middle"
                                    fontSize="8"
                                    fill="#9CA3AF"
                                  >
                                    {item.label}
                                  </text>
                                ))}
                              </>
                            )
                          })()}
                        </g>
                      </g>
                    </>
                  )
                })()}
              </svg>

              {/* 侧边信息卡片 - 展示关联数据 */}
              {/* Phase 14: 合并"文章池状态"组件，显示动态指标 */}
              <div className="flex flex-col gap-3 min-w-[200px]">
                {/* 初筛淘汰卡片 */}
                <div className="relative">
                  <div className="bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900/30 dark:to-gray-900/20 rounded-xl p-3 border border-slate-300 dark:border-slate-600 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">🔍</span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        {_("options.collectionStats.funnelPrescreenedOut")}
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                      {recommendationFunnel.prescreenedOut}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {recommendationFunnel.rssArticles > 0 
                        ? `${((recommendationFunnel.prescreenedOut / recommendationFunnel.rssArticles) * 100).toFixed(1)}% ${_("options.collectionStats.funnelPrescreenedOutDesc")}`
                        : _("options.collectionStats.funnelPrescreenedOutDesc")
                      }
                    </div>
                  </div>
                </div>

                {/* 待分析卡片 */}
                <div className="relative">
                  <div className="bg-gradient-to-br from-sky-50 to-cyan-100 dark:from-sky-900/30 dark:to-cyan-900/20 rounded-xl p-3 border border-sky-300 dark:border-sky-600 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">⏳</span>
                      <span className="text-xs font-semibold text-sky-700 dark:text-sky-200">
                        {_("options.collectionStats.funnelNotAnalyzed")}
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-sky-800 dark:text-sky-100">
                      {recommendationFunnel.raw}
                    </div>
                    <div className="text-xs text-sky-500 dark:text-sky-400 mt-1">
                      {_("options.collectionStats.funnelNotAnalyzedDesc")}
                    </div>
                  </div>
                </div>

                {/* Phase 14.2: 已过时卡片（出源未分析）- 始终显示以保持布局一致 */}
                <div className="relative">
                  <div className="bg-gradient-to-br from-gray-50 to-slate-100 dark:from-gray-900/30 dark:to-slate-900/20 rounded-xl p-3 border border-gray-300 dark:border-gray-600 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">🗑️</span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                        {_("options.collectionStats.funnelStale")}
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-gray-800 dark:text-gray-100">
                      {recommendationFunnel.stale}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {_("options.collectionStats.funnelStaleDesc")}
                    </div>
                  </div>
                </div>

                {/* 分析未达标卡片 */}
                <div className="relative">
                  <div className="bg-gradient-to-br from-violet-50 to-purple-100 dark:from-violet-900/30 dark:to-purple-900/20 rounded-xl p-3 border border-violet-300 dark:border-violet-600 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">📊</span>
                      <span className="text-xs font-semibold text-violet-700 dark:text-violet-200">
                        {_("options.collectionStats.funnelAnalyzedNotQualified")}
                      </span>
                    </div>
                    <div className="text-2xl font-bold text-violet-800 dark:text-violet-100">
                      {recommendationFunnel.analyzedNotQualified}
                    </div>
                    <div className="text-xs text-violet-500 dark:text-violet-400 mt-1">
                      {recommendationFunnel.analyzed > 0 
                        ? `${((recommendationFunnel.analyzedNotQualified / recommendationFunnel.analyzed) * 100).toFixed(1)}% ${_("options.collectionStats.funnelAnalyzedNotQualifiedDesc")}`
                        : _("options.collectionStats.funnelAnalyzedNotQualifiedDesc")
                      }
                    </div>
                  </div>
                </div>

                {/* Phase 14: 推荐池和弹窗显示已移到"内容推荐"的"智能推荐策略"区域 */}
              </div>
            </div>
          </div>

            {/* 转化率总结 - Phase 14: 基于新漏斗结构 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-700">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-xs text-cyan-600 dark:text-cyan-400 mb-2 font-medium">
                    {_("options.collectionStats.funnelAnalysisRate")}
                  </div>
                  <div className="text-xl font-bold text-cyan-900 dark:text-cyan-100">
                    {recommendationFunnel.rssArticles > 0 ? ((recommendationFunnel.analyzed / recommendationFunnel.rssArticles) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {_("options.collectionStats.funnelRssToAnalyzed")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-violet-600 dark:text-violet-400 mb-2 font-medium">
                    {_("options.collectionStats.funnelCandidateRate")}
                  </div>
                  <div className="text-xl font-bold text-violet-900 dark:text-violet-100">
                    {recommendationFunnel.analyzed > 0 ? ((recommendationFunnel.candidate / recommendationFunnel.analyzed) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {_("options.collectionStats.funnelAnalyzedToCandidate")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-green-600 dark:text-green-400 mb-2 font-medium">
                    {_("options.collectionStats.funnelRecommendationRate")}
                  </div>
                  <div className="text-xl font-bold text-green-900 dark:text-green-100">
                    {recommendationFunnel.rssArticles > 0 ? (((recommendationFunnel.currentRecommendedPool ?? 0) + (recommendationFunnel.exitStats?.total ?? 0) - (recommendationFunnel.exitStats?.stale ?? 0)) / recommendationFunnel.rssArticles * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {_("options.collectionStats.funnelRssToRecommended")}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-2 font-medium">
                    {_("options.collectionStats.funnelReadingRate")}
                  </div>
                  <div className="text-xl font-bold text-purple-900 dark:text-purple-100">
                    {(() => {
                      const totalRecommendedHistorical = (recommendationFunnel.currentRecommendedPool ?? 0) + (recommendationFunnel.exitStats?.total ?? 0) - (recommendationFunnel.exitStats?.stale ?? 0)
                      return totalRecommendedHistorical > 0 ? ((recommendationFunnel.exitStats?.read ?? 0) / totalRecommendedHistorical * 100).toFixed(1) : 0
                    })()}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {_("options.collectionStats.funnelRecommendedToRead")}
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
