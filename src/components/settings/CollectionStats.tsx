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
            {/* 立体漏斗可视化 - 椭圆分层设计（对数比例） */}
            <div className="flex justify-center items-center gap-8">
              {/* 主漏斗 */}
              <svg 
                width="400" 
                height="500" 
                viewBox="0 0 400 500" 
                className="max-w-full h-auto"
              >
                <defs>
                  {/* 椭圆顶部渐变（3D立体感）- 三层配色 */}
                  <radialGradient id="ellipseTop1">
                    <stop offset="0%" stopColor="#BFDBFE" />
                    <stop offset="50%" stopColor="#93C5FD" />
                    <stop offset="100%" stopColor="#60A5FA" />
                  </radialGradient>
                  <radialGradient id="ellipseTop2">
                    <stop offset="0%" stopColor="#BBF7D0" />
                    <stop offset="50%" stopColor="#86EFAC" />
                    <stop offset="100%" stopColor="#4ADE80" />
                  </radialGradient>
                  <radialGradient id="ellipseTop4">
                    <stop offset="0%" stopColor="#DDD6FE" />
                    <stop offset="50%" stopColor="#C4B5FD" />
                    <stop offset="100%" stopColor="#A78BFA" />
                  </radialGradient>
                  
                  {/* 阴影 */}
                  <filter id="layerShadow">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                    <feOffset dx="0" dy="4" result="offsetblur"/>
                    <feComponentTransfer>
                      <feFuncA type="linear" slope="0.25"/>
                    </feComponentTransfer>
                    <feMerge> 
                      <feMergeNode/>
                      <feMergeNode in="SourceGraphic"/> 
                    </feMerge>
                  </filter>
                </defs>

                {(() => {
                  // 完整圆锥漏斗：从文章到用户，一气呵成
                  const topRadius = 140  // 顶部半径（文章）
                  const topRy = 18  // 顶部椭圆高度
                  const topY = 100  // 顶部 Y 位置
                  const bottomY = 470  // 底部 Y 位置（圆锥顶尖）
                  
                  // 三层数据位置（在圆锥上）
                  const layerYs = [100, 250, 400]
                  
                  // 根据圆锥线性缩小计算每层半径（吻合圆锥切面）
                  const totalHeight = bottomY - topY
                  const layers = layerYs.map((y, i) => {
                    const progress = (y - topY) / totalHeight  // 从顶部到底部的进度 (0-1)
                    const radius = topRadius * (1 - progress)  // 线性缩小到 0
                    const ry = topRy * (1 - progress)  // 高度也线性缩小
                    
                    return {
                      label: ['文章', '推荐', '阅读'][i],
                      y,
                      radius: Math.max(radius, 1),  // 避免为 0
                      ry: Math.max(ry, 1),
                      value: [
                        recommendationFunnel.rssArticles,
                        recommendationFunnel.inPool,
                        recommendationFunnel.read
                      ][i]
                    }
                  })
                  
                  return (
                    <>
                      {/* 顶部互联网符号 */}
                      <text x="250" y="30" textAnchor="middle" fontSize="32">
                        🌐
                      </text>
                      <text x="250" y="55" textAnchor="middle" fill="#64748B" fontSize="11" fontWeight="500">
                        互联网海量信息
                      </text>
                      
                      {/* 内部切面（在圆锥后面）- 第二、三层 */}
                      {layers.slice(1).map((layer, idx) => {
                        const i = idx + 1  // 实际索引（1, 2）
                        const colors = [
                          { fill: '#3B82F6', bg: '#E0F2FE', text: '#1E3A8A', stroke: '#3B82F6' },
                          { fill: '#10B981', bg: '#D1FAE5', text: '#064E3B', stroke: '#10B981' },
                          { fill: '#8B5CF6', bg: '#EDE9FE', text: '#4C1D95', stroke: '#8B5CF6' }
                        ][i]
                        
                        const percentage = i === 1 
                          ? (layers[0].value > 0 ? ((layer.value / layers[0].value) * 100).toFixed(1) : 0)
                          : (layers[1].value > 0 ? ((layer.value / layers[1].value) * 100).toFixed(1) : 0)
                        
                        return (
                          <g key={i}>
                            {/* 阴影层 */}
                            <ellipse cx="250" cy={layer.y + 3} rx={layer.radius} ry={layer.ry} fill={colors.fill} opacity="0.2"/>
                            {/* 主体层 - 纯色不透明，无边线 */}
                            <ellipse cx="250" cy={layer.y} rx={layer.radius} ry={layer.ry} fill={colors.bg}/>
                            
                            {/* 标签在左侧 */}
                            <text x="40" y={layer.y + 4} textAnchor="start" fill={colors.text} fontSize="12" fontWeight="600">
                              {layer.label}
                            </text>
                            
                            {/* 数字在中心（较小）*/}
                            <text x="250" y={layer.y + 5} textAnchor="middle" fill={colors.text} fontSize="15" fontWeight="bold">
                              {layer.value}
                            </text>
                            
                            {/* 百分比 */}
                            <text x="250" y={layer.y + 17} textAnchor="middle" fill={colors.stroke} fontSize="9" opacity="0.8">
                              {percentage}%
                            </text>
                          </g>
                        )
                      })}
                      
                      {/* 漏斗立体填充 - 在 defs 之前绘制 */}
                      <defs>
                        {/* 圆锥阴影滚镜 */}
                        <filter id="coneShadow" x="-50%" y="-50%" width="200%" height="200%">
                          <feGaussianBlur in="SourceAlpha" stdDeviation="4"/>
                          <feOffset dx="3" dy="6"/>
                          <feComponentTransfer>
                            <feFuncA type="linear" slope="0.4"/>
                          </feComponentTransfer>
                          <feMerge>
                            <feMergeNode/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                        
                        {/* 漏斗段渐变（从上到下）- 三层配色，颜色更深 */}
                        <linearGradient id="funnelFill1" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.6" />
                          <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.4" />
                        </linearGradient>
                        <linearGradient id="funnelFill2" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#4ADE80" stopOpacity="0.6" />
                          <stop offset="100%" stopColor="#10B981" stopOpacity="0.4" />
                        </linearGradient>
                        <linearGradient id="funnelFill3" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.6" />
                          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.4" />
                        </linearGradient>
                        
                        {/* 漏斗外侧打光（从左到右） */}
                        <linearGradient id="funnelLightLeft" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.3" />
                          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="funnelLightRight" x1="100%" y1="0%" x2="0%" y2="0%">
                          <stop offset="0%" stopColor="#000000" stopOpacity="0.15" />
                          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
                        </linearGradient>
                        
                        {/* 完整圆锥渐变（从蓝到紫） */}
                        <linearGradient id="completeFunnelFill" x1="0%" y1="0%" x2="0%" y2="100%">
                          <stop offset="0%" stopColor="#60A5FA" stopOpacity="0.6" />
                          <stop offset="33%" stopColor="#4ADE80" stopOpacity="0.5" />
                          <stop offset="66%" stopColor="#A78BFA" stopOpacity="0.4" />
                          <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.3" />
                        </linearGradient>
                      </defs>
                      
                      {/* 完整圆锥填充（从顶部到底部）*/}
                      <g filter="url(#coneShadow)">
                        <path
                          d={`
                            M ${250 - topRadius},${topY}
                            L 250,${bottomY}
                            L ${250 + topRadius},${topY}
                            Z
                          `}
                          fill="url(#completeFunnelFill)"
                          opacity="0.7"
                        />
                      </g>
                      
                      {/* 圆锥左侧打光 */}
                      <path
                        d={`
                          M ${250 - topRadius},${topY}
                          L 250,${bottomY}
                          L ${250 - topRadius + 40},${topY}
                          Z
                        `}
                        fill="url(#funnelLightLeft)"
                      />
                      
                      {/* 圆锥右侧阴影 */}
                      <path
                        d={`
                          M ${250 + topRadius - 40},${topY}
                          L 250,${bottomY}
                          L ${250 + topRadius},${topY}
                          Z
                        `}
                        fill="url(#funnelLightRight)"
                      />

                      {/* 第一层椭圆（顶层，在圆锥上方） */}
                      {(() => {
                        const layer = layers[0]
                        const colors = { fill: '#3B82F6', text: '#1E3A8A', stroke: '#3B82F6' }
                        
                        return (
                          <g filter="url(#layerShadow)">
                            {/* 阴影层 */}
                            <ellipse cx="250" cy={layer.y + 5} rx={layer.radius} ry={layer.ry} fill={colors.fill} opacity="0.3"/>
                            {/* 主体层 - 无边线 */}
                            <ellipse cx="250" cy={layer.y} rx={layer.radius} ry={layer.ry} fill={`url(#ellipseTop1)`}/>
                            
                            {/* 标签在左侧 */}
                            <text x="40" y={layer.y + 5} textAnchor="start" fill={colors.text} fontSize="14" fontWeight="600">
                              {layer.label}
                            </text>
                            
                            {/* 数字在中心 */}
                            <text x="250" y={layer.y + 5} textAnchor="middle" fill={colors.text} fontSize="20" fontWeight="bold">
                              {layer.value}
                            </text>
                          </g>
                        )
                      })()}
                      
                      {/* 用户符号在圆锥顶尖之下（增加距离） */}
                      <text x="250" y="500" textAnchor="middle" fontSize="24">
                        👤
                      </text>
                      <text x="250" y="520" textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="500">
                        你
                      </text>
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
