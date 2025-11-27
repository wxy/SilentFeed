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
          <span>🧠</span>
          <span>AI 学习概览</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* 学习页面数 */}
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800">
            <div className="text-sm text-indigo-600 dark:text-indigo-400 mb-1">
              学习页面数
            </div>
            <div className="text-3xl font-bold text-indigo-900 dark:text-indigo-100">
              {stats.pageCount}
            </div>
            <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
              停留超过30秒的页面
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
              开始学习时间
            </div>
            <div className="text-lg font-bold text-cyan-900 dark:text-cyan-100">
              {formatDate(stats.firstCollectionTime)}
            </div>
            <div className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">
              平均每日 {stats.avgDailyPages.toFixed(1)} 页
            </div>
          </div>
        </div>
      </div>

      {/* AI 成本分析 */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span>💰</span>
          <span>AI 成本分析</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Token 总用量 */}
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-200 dark:border-amber-800">
            <div className="text-sm text-amber-600 dark:text-amber-400 mb-1">
              Token 总用量
            </div>
            <div className="text-3xl font-bold text-amber-900 dark:text-amber-100">
              {aiQualityStats && aiQualityStats.totalTokens > 0
                ? `${(aiQualityStats.totalTokens / 1000).toFixed(1)}K`
                : '--'}
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {aiQualityStats && aiQualityStats.aiAnalyzedPages > 0
                ? `均 ${Math.round(aiQualityStats.totalTokens / aiQualityStats.aiAnalyzedPages)} tokens/页`
                : '暂无数据'}
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
            {/* 立体漏斗可视化 - 半透明玻璃风格 */}
            <div className="flex justify-center items-center gap-8">
              {/* 主漏斗 */}
              <svg
                width="480"
                height="520"
                viewBox="0 0 480 520"
                className="max-w-full h-auto"
              >
                <defs>
                  {/* 顶部椭圆的柔和光晕 */}
                  <radialGradient id="ellipseTopGlow" cx="50%" cy="35%" r="70%">
                    <stop offset="0%" stopColor="#FFF8DC" stopOpacity="0.98" />
                    <stop offset="60%" stopColor="#FFE69A" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#F5C654" stopOpacity="0.65" />
                  </radialGradient>

                  <radialGradient id="sliceGlow" cx="50%" cy="20%" r="90%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
                    <stop offset="45%" stopColor="#FFFFFF" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                  </radialGradient>
                  
                  {/* 漏斗主体的垂直渐变：参考示例配色 */}
                  <linearGradient id="completeFunnelFill" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#F8DD6B" stopOpacity="0.78" />
                    <stop offset="28%" stopColor="#7CC464" stopOpacity="0.76" />
                    <stop offset="55%" stopColor="#FDAB4C" stopOpacity="0.7" />
                    <stop offset="78%" stopColor="#3CB1E6" stopOpacity="0.66" />
                    <stop offset="100%" stopColor="#143F78" stopOpacity="0.62" />
                  </linearGradient>
                  
                  {/* 左侧高光，制造玻璃质感 */}
                  <linearGradient id="glassHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
                    <stop offset="30%" stopColor="#FFFFFF" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                  </linearGradient>
                  
                  {/* 右侧阴影，增强体积感 */}
                  <linearGradient id="glassShade" x1="100%" y1="0%" x2="0%" y2="0%">
                    <stop offset="0%" stopColor="#3A2A61" stopOpacity="0.28" />
                    <stop offset="45%" stopColor="#3A2A61" stopOpacity="0.06" />
                    <stop offset="100%" stopColor="#3A2A61" stopOpacity="0" />
                  </linearGradient>

                  {/* 软阴影 */}
                  <filter id="coneShadow" x="-40%" y="-40%" width="180%" height="200%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="4" />
                    <feOffset dx="1.5" dy="5" />
                    <feComponentTransfer>
                      <feFuncA type="linear" slope="0.28" />
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  
                  {/* 切片阴影 */}
                  <filter id="sliceShadow" x="-30%" y="-30%" width="160%" height="200%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
                    <feOffset dy="3" />
                    <feComponentTransfer>
                      <feFuncA type="linear" slope="0.2" />
                    </feComponentTransfer>
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {(() => {
                  const centerX = 240
                  const topRadius = 150
                  const bottomRadius = 10
                  const topY = 80
                  const bottomY = 470
                  const funnelHeight = bottomY - topY

                  const getYFromRatio = (ratio: number) => topY + funnelHeight * ratio

                  const getFunnelRadius = (y: number) => {
                    const progress = Math.min(Math.max((y - topY) / funnelHeight, 0), 1)
                    const smoothStep = progress * progress * (3 - 2 * progress)
                    const blendedEase = 0.6 * smoothStep + 0.4 * Math.pow(progress, 1.35)
                    const baseRadius = topRadius - (topRadius - bottomRadius) * blendedEase
                    const inwardBend = (topRadius - bottomRadius) * 0.14 * Math.sin(Math.PI * progress) * (1 - progress * 0.6)
                    return Math.max(bottomRadius, baseRadius - inwardBend)
                  }

                  const generateFunnelPath = () => {
                    const steps = 90
                    const commands: string[] = []

                    for (let i = 0; i <= steps; i++) {
                      const y = topY + (funnelHeight * i) / steps
                      const radius = getFunnelRadius(y)
                      commands.push(`${i === 0 ? 'M' : 'L'} ${centerX - radius},${y}`)
                    }

                    commands.push(`L ${centerX + bottomRadius},${bottomY}`)

                    for (let i = steps; i >= 0; i--) {
                      const y = topY + (funnelHeight * i) / steps
                      const radius = getFunnelRadius(y)
                      commands.push(`L ${centerX + radius},${y}`)
                    }

                    commands.push('Z')
                    return commands.join(' ')
                  }

                  const generateBandPath = (yStart: number, yEnd: number) => {
                    const steps = 60
                    const cmds: string[] = []

                    for (let i = 0; i <= steps; i++) {
                      const ratio = i / steps
                      const y = yStart + (yEnd - yStart) * ratio
                      const radius = getFunnelRadius(y)
                      cmds.push(`${i === 0 ? 'M' : 'L'} ${centerX - radius},${y}`)
                    }

                    for (let i = steps; i >= 0; i--) {
                      const ratio = i / steps
                      const y = yStart + (yEnd - yStart) * ratio
                      const radius = getFunnelRadius(y)
                      cmds.push(`L ${centerX + radius},${y}`)
                    }

                    cmds.push('Z')
                    return cmds.join(' ')
                  }

                  const dropletSpecs = [
                    { key: 'rss-1', x: centerX - 120, color: '#FF9F43' },
                    { key: 'rss-2', x: centerX - 60, color: '#FFB955' },
                    { key: 'rss-3', x: centerX, color: '#FFC870' },
                    { key: 'rss-4', x: centerX + 60, color: '#FF9F43' },
                    { key: 'rss-5', x: centerX + 120, color: '#FFB955' }
                  ]

                  const getDropletPath = (cx: number, cy: number, size: number) => {
                    const top = cy - size
                    const bottom = cy + size * 1.2
                    const controlOffset = size * 0.9
                    return `M ${cx} ${top} C ${cx + controlOffset} ${top + size * 0.8}, ${cx + controlOffset} ${bottom - size * 0.4}, ${cx} ${bottom} C ${cx - controlOffset} ${bottom - size * 0.4}, ${cx - controlOffset} ${top + size * 0.8}, ${cx} ${top} Z`
                  }

                  const renderRssIcon = (cx: number, cy: number, size: number) => {
                    const dotX = cx - size * 0.2
                    const dotY = cy + size * 0.45
                    const outerStartX = cx - size * 0.45
                    const outerStartY = cy + size * 0.35
                    const outerEndX = cx + size * 0.55
                    const outerEndY = cy - size * 0.35
                    const innerStartX = cx - size * 0.35
                    const innerStartY = cy + size * 0.25
                    const innerEndX = cx + size * 0.35
                    const innerEndY = cy - size * 0.2
                    return (
                      <g>
                        <circle cx={dotX} cy={dotY} r={size * 0.12} fill="#FFFFFF" />
                        <path
                          d={`M ${outerStartX} ${outerStartY} A ${size * 0.95} ${size * 0.95} 0 0 1 ${outerEndX} ${outerEndY}`}
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth={size * 0.14}
                          strokeLinecap="round"
                        />
                        <path
                          d={`M ${innerStartX} ${innerStartY} A ${size * 0.7} ${size * 0.7} 0 0 1 ${innerEndX} ${innerEndY}`}
                          fill="none"
                          stroke="#FFFFFF"
                          strokeWidth={size * 0.12}
                          strokeLinecap="round"
                        />
                      </g>
                    )
                  }

                  const segments = [
                    {
                      key: 'infinite',
                      startRatio: 0,
                      endRatio: 0.18,
                      fill: '#F6D96C',
                      border: '#E4BB27',
                      textColor: '#8F5C00',
                      label: null,
                      value: null,
                      percentText: null
                    },
                    {
                      key: 'articles',
                      startRatio: 0.18,
                      endRatio: 0.45,
                      fill: '#73C062',
                      border: '#3C8F34',
                      textColor: '#104019',
                      label: '文章',
                      value: recommendationFunnel.rssArticles,
                      percentText: '100%'
                    },
                    {
                      key: 'recommendations',
                      startRatio: 0.45,
                      endRatio: 0.7,
                      fill: '#FD9F3C',
                      border: '#E46900',
                      textColor: '#7A2C00',
                      label: '推荐',
                      value: recommendationFunnel.inPool,
                      percentText: recommendationFunnel.rssArticles > 0
                        ? `${((recommendationFunnel.inPool / recommendationFunnel.rssArticles) * 100).toFixed(1)}%`
                        : '0%'
                    },
                    {
                      key: 'reading',
                      startRatio: 0.7,
                      endRatio: 0.9,
                      fill: '#3AA8E0',
                      border: '#1872B0',
                      textColor: '#073655',
                      label: '阅读',
                      value: recommendationFunnel.read,
                      percentText: recommendationFunnel.inPool > 0
                        ? `${((recommendationFunnel.read / recommendationFunnel.inPool) * 100).toFixed(1)}%`
                        : '0%'
                    },
                    {
                      key: 'base',
                      startRatio: 0.9,
                      endRatio: 0.99,
                      fill: '#143F78',
                      border: '#0F2B4F',
                      textColor: '#E2E8F0',
                      label: null,
                      value: null,
                      percentText: null
                    }
                  ]

                  const segmentSpecs = segments.map((segment) => {
                    const yStart = getYFromRatio(segment.startRatio)
                    const yEnd = getYFromRatio(segment.endRatio)
                    const midY = (yStart + yEnd) / 2
                    return {
                      ...segment,
                      yStart,
                      yEnd,
                      midY,
                      midRadius: getFunnelRadius(midY)
                    }
                  })

                  const boundaryEllipses = segmentSpecs
                    .filter((segment) => segment.key !== 'infinite')
                    .map((segment) => {
                      const radius = getFunnelRadius(segment.yStart)
                      const ratio = Math.min(Math.max((segment.yStart - topY) / funnelHeight, 0), 1)
                      // 通过增大短轴长度增强切面厚度
                      const ry = Math.max(3, radius * 0.09 * (1 - ratio * 0.35))
                      return {
                        y: segment.yStart,
                        radius,
                        color: segment.border,
                        ry,
                        segmentKey: segment.key
                      }
                    })

                  const funnelPath = generateFunnelPath()

                  return (
                    <>
                      {/* 顶部信息流水滴 */}
                      {dropletSpecs.map((droplet) => (
                        <g key={droplet.key}>
                          <path
                            d={getDropletPath(droplet.x, topY - 55, 20)}
                            fill={droplet.color}
                            opacity="0.9"
                            stroke="#FFFFFF"
                            strokeWidth={1.2}
                          />
                          {renderRssIcon(droplet.x, topY - 60, 12)}
                        </g>
                      ))}

                      {/* 顶部椭圆及阴影 */}
                      <ellipse cx={centerX} cy={topY + 4} rx={topRadius + 5} ry={20} fill="#000" opacity="0.08" />
                      <ellipse cx={centerX} cy={topY} rx={topRadius} ry={18} fill="url(#ellipseTopGlow)" stroke="none" opacity="0.9" />

                      {/* 分段切片 */}
                      {segmentSpecs.map((segment) => (
                        <path
                          key={segment.key}
                          d={generateBandPath(segment.yStart, segment.yEnd)}
                          fill={segment.fill}
                          opacity={segment.key === 'infinite' ? 0.55 : 0.82}
                          filter={segment.key === 'infinite' ? undefined : 'url(#sliceShadow)'}
                        />
                      ))}

                      {/* 漏斗主体半透明包裹 */}
                      <path d={funnelPath} fill="url(#completeFunnelFill)" opacity="0.8" filter="url(#coneShadow)" />
                      <path d={funnelPath} fill="url(#glassHighlight)" opacity="0.35" />
                      <path d={funnelPath} fill="url(#glassShade)" opacity="0.55" />

                      {/* 切面椭圆边界 */}
                      {boundaryEllipses.map((boundary) => (
                        <ellipse
                          key={`boundary-${boundary.y}`}
                          cx={centerX}
                          cy={boundary.y}
                          rx={boundary.radius}
                          ry={boundary.ry}
                          fill={`url(#sliceGlow)`}
                          opacity={0.15}
                          stroke={boundary.color}
                          strokeOpacity={0.45}
                          strokeWidth={boundary.segmentKey === 'reading' ? 1.2 : 0.9}
                        />
                      ))}

                      {/* 内部标签与数值 */}
                      {segmentSpecs.map((segment) => (
                        <g key={`${segment.key}-labels`}>
                          {segment.label ? (
                            <text
                              x={centerX}
                              y={segment.value === null ? segment.midY : segment.midY - 16}
                              textAnchor="middle"
                              fill={segment.textColor}
                              fontSize={segment.value === null ? 16 : 15}
                              fontWeight="600"
                              stroke={segment.key === 'infinite' ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.35)'}
                              strokeWidth={0.4}
                              style={{ paintOrder: 'stroke fill' }}
                            >
                              {segment.label}
                            </text>
                          ) : null}
                          {segment.value !== null && (
                            <>
                              <text
                                x={centerX}
                                y={segment.midY + 4}
                                textAnchor="middle"
                                fill={segment.textColor}
                                fontSize="22"
                                fontWeight="700"
                                stroke="rgba(255,255,255,0.45)"
                                strokeWidth={0.8}
                                style={{ paintOrder: 'stroke fill' }}
                              >
                                {segment.value}
                              </text>
                              <text
                                x={centerX}
                                y={segment.midY + 24}
                                textAnchor="middle"
                                fill={segment.border}
                                fontSize="12"
                                fontWeight="600"
                                stroke="rgba(0,0,0,0.25)"
                                strokeWidth={0.4}
                                style={{ paintOrder: 'stroke fill' }}
                              >
                                {segment.percentText}
                              </text>
                            </>
                          )}
                        </g>
                      ))}

                      {/* 底部用户符号 */}
                      <text x={centerX} y={bottomY + 24} textAnchor="middle" fontSize="26">
                        👤
                      </text>
                      <text x={centerX} y={bottomY + 44} textAnchor="middle" fill="#475569" fontSize="12" fontWeight="500">
                        你
                      </text>

                      {/* 出口水滴，展示阅读量 */}
                      <g>
                        <path
                          d={getDropletPath(centerX, bottomY + 100, 26)}
                          fill="#1F7BBE"
                          opacity="0.85"
                          stroke="#E0F2FE"
                          strokeWidth={1.4}
                        />
                        <text
                          x={centerX}
                          y={bottomY + 96}
                          textAnchor="middle"
                          fill="#E0F2FE"
                          fontSize="11"
                        >
                          阅读完成
                        </text>
                        <text
                          x={centerX}
                          y={bottomY + 116}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="16"
                          fontWeight="700"
                        >
                          {recommendationFunnel.read}
                        </text>
                      </g>
                    </>
                  )
                })()}
              </svg>

              {/* 侧边数据球 - 增强3D效果 */}
              <div className="flex flex-col gap-6">
                {/* 学习页面数 */}
                <div className="relative">
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <defs>
                      {/* 多层径向渐变，模拟球体光泽 */}
                      <radialGradient id="sphereGradient1" cx="40%" cy="35%">
                        <stop offset="0%" stopColor="#FFFBEB" stopOpacity="1" />
                        <stop offset="25%" stopColor="#FEF3C7" stopOpacity="0.95" />
                        <stop offset="50%" stopColor="#FDE68A" stopOpacity="0.9" />
                        <stop offset="75%" stopColor="#FCD34D" stopOpacity="0.75" />
                        <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.6" />
                      </radialGradient>
                      {/* 高光效果 */}
                      <radialGradient id="sphereHighlight1" cx="35%" cy="30%">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
                        <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                      </radialGradient>
                      {/* 增强阴影 */}
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
                    {/* 主球体 */}
                    <circle cx="60" cy="55" r="45" fill="url(#sphereGradient1)" filter="url(#sphereShadow1)"/>
                    {/* 高光层 */}
                    <ellipse cx="48" cy="42" rx="20" ry="15" fill="url(#sphereHighlight1)" opacity="0.8"/>
                    <text x="60" y="45" textAnchor="middle" fill="#78350F" fontSize="12" fontWeight="600">
                      📚 学习页面
                    </text>
                    <text x="60" y="65" textAnchor="middle" fill="#78350F" fontSize="16" fontWeight="bold">
                      {recommendationFunnel.learningPages}
                    </text>
                  </svg>
                </div>

                {/* 不想读总数 */}
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
                    <text x="60" y="45" textAnchor="middle" fill="#7C2D12" fontSize="12" fontWeight="600">
                      ❌ 不想读
                    </text>
                    <text x="60" y="65" textAnchor="middle" fill="#7C2D12" fontSize="16" fontWeight="bold">
                      {recommendationFunnel.dismissed}
                    </text>
                  </svg>
                </div>
              </div>
            </div>

            {/* 转化率总结 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-5 border border-blue-200 dark:border-blue-700">
              <div className="grid grid-cols-2 gap-6 text-center">
                <div>
                  <div className="text-xs text-green-600 dark:text-green-400 mb-2 font-medium">
                    推荐率
                  </div>
                  <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                    {recommendationFunnel.rssArticles > 0 ? ((recommendationFunnel.inPool / recommendationFunnel.rssArticles) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    RSS → 推荐池
                  </div>
                </div>
                <div>
                  <div className="text-xs text-purple-600 dark:text-purple-400 mb-2 font-medium">
                    阅读率
                  </div>
                  <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                    {recommendationFunnel.inPool > 0 ? ((recommendationFunnel.read / recommendationFunnel.inPool) * 100).toFixed(1) : 0}%
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    推荐池 → 已读
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
