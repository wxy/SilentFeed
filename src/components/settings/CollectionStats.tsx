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
import {
  getStorageStats,
  getAIAnalysisStats,
  db,
  getPageCount,
  getRecommendationFunnel
} from "@/storage/db"
import { dataMigrator } from "@/core/migrator/DataMigrator"
import { ProfileUpdateScheduler } from "@/core/profile/ProfileUpdateScheduler"
import type { StorageStats } from "@/types/database"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"
import { getAIConfig, getProviderDisplayName } from "@/storage/ai-config"
import { logger } from "@/utils/logger"

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

export function CollectionStats() {
  const { _ } = useI18n()
  const [stats, setStats] = useState<StorageStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [aiQualityStats, setAiQualityStats] = useState<any>(null)
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

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [
          storageData,
          aiQualityData,
          aiConfig,
          currentPageCount,
          funnelData
        ] = await Promise.all([
          getStorageStats(),
          getAIAnalysisStats(),
          getAIConfig(),
          getPageCount(),
          getRecommendationFunnel()
        ])
        
        setStats(storageData)
        setAiQualityStats(aiQualityData)
        setPageCount(currentPageCount)
        setRecommendationFunnel(funnelData)
        
        // 设置 AI 配置状态
        setAiConfigStatus({
          enabled: aiConfig.enabled,
          provider: getProviderDisplayName(aiConfig.provider || null),
          configured: aiConfig.enabled && aiConfig.provider !== null && Object.keys(aiConfig.apiKeys || {}).length > 0
        })
      } catch (error) {
        collectionLogger.error("加载统计失败:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadStats()
  }, [])

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
    const date = new Date(timestamp)
    const locale = document.documentElement.lang || 'zh-CN'
    return date.toLocaleDateString(locale, {
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
            <div className="text-3xl font-bold text-indigo-900 dark:text-indigo-100">
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
            <div className="text-3xl font-bold text-green-900 dark:text-green-100">
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
            <div className="text-lg font-bold text-cyan-900 dark:text-cyan-100">
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
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>💰</span>
          <span>{_("options.collectionStats.aiCostAnalysisTitle")}</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Token 总用量 */}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">
              {_("options.collectionStats.totalTokenUsageLabel")}
            </div>
            <div className="text-3xl font-bold text-amber-900 dark:text-amber-100">
              {aiQualityStats && aiQualityStats.totalTokens > 0
                ? `${(aiQualityStats.totalTokens / 1000).toFixed(1)}K`
                : '--'}
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {aiQualityStats && aiQualityStats.aiAnalyzedPages > 0
                ? _("options.collectionStats.avgTokensPerPage", { tokens: Math.round(aiQualityStats.totalTokens / aiQualityStats.aiAnalyzedPages) })
                : _("options.collectionStats.noData")}
            </div>
          </div>

          {/* 累计费用 */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
            <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">
              累计费用
            </div>
            <div className="text-3xl font-bold text-indigo-900 dark:text-indigo-100">
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
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
              {aiQualityStats && aiQualityStats.aiAnalyzedPages > 0 && aiQualityStats.primaryCurrency
                ? `均 ${aiQualityStats.primaryCurrency === 'CNY' ? '¥' : '$'}${aiQualityStats.avgCostPerPage.toFixed(6)}/页`
                : '暂无消费'}
            </div>
          </div>
        </div>

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
                      📚 {_("options.collectionStats.funnelLearningPages")}
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
                      ❌ {_("options.collectionStats.funnelDismissed")}
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
