/**
 * 内容推荐设置组件
 * 展示推荐策略配置
 * 
 * Phase 14: 文章池状态已合并到 CollectionStats 的推荐漏斗中
 *           推荐池和弹窗显示数据移到智能推荐策略区域
 * Phase 15: 投递方式（弹窗/阅读列表静默）从 AI 引擎配置移至此处
 */

import { useState, useEffect } from 'react'
import { useI18n } from '@/i18n/helpers'
import { db } from '@/storage/db'
import { isReadingListAvailable } from '@/utils/browser-compat'
import { getRecommendationConfig, saveRecommendationConfig } from '@/storage/recommendation-config'

interface RecommendationSettingsProps {
  poolStrategy?: any
  recommendationScheduler?: any
  maxRecommendations: number
  isLearningStage: boolean
  pageCount: number
  totalPages: number
  /** 弹窗内活跃推荐数量（从 recommendations 表获取） */
  activeRecommendationCount: number
  /** 推荐池容量（从策略获取，默认 maxRecommendations * 2） */
  poolCapacity: number
}

/**
 * 内容推荐设置组件
 */
export function RecommendationSettings({
  poolStrategy,
  recommendationScheduler,
  maxRecommendations,
  isLearningStage,
  pageCount,
  totalPages,
  activeRecommendationCount,
  poolCapacity
}: RecommendationSettingsProps) {
  const { _ } = useI18n()
  const readingListSupported = isReadingListAvailable()
  
  // 投递方式状态（从 recommendationConfig 加载）
  const [deliveryMode, setDeliveryMode] = useState<'popup' | 'readingList'>('popup')
  const [readingListTitlePrefix, setReadingListTitlePrefix] = useState('📰 ')
  const [readingListCleanup, setReadingListCleanup] = useState({
    enabled: false,
    retentionDays: 30,
    maxEntries: 100,
    intervalHours: 24,
    keepUnread: true
  })
  const [readingListCleanupRunning, setReadingListCleanupRunning] = useState(false)
  const [readingListCleanupResult, setReadingListCleanupResult] = useState<{ removed: number; total: number } | null>(null)
  const [readingListCleanupError, setReadingListCleanupError] = useState<string | null>(null)
  
  // 从 recommendationConfig 初始化投递方式和清理配置
  useEffect(() => {
    const loadDeliveryMode = async () => {
      try {
        const recConfig = await getRecommendationConfig()
        setDeliveryMode(recConfig.deliveryMode === 'readingList' && readingListSupported ? 'readingList' : 'popup')
        setReadingListTitlePrefix(recConfig.readingList?.titlePrefix || '📰 ')
        setReadingListCleanup({
          enabled: recConfig.readingList?.cleanup?.enabled ?? false,
          retentionDays: recConfig.readingList?.cleanup?.retentionDays ?? 30,
          maxEntries: recConfig.readingList?.cleanup?.maxEntries ?? 100,
          intervalHours: recConfig.readingList?.cleanup?.intervalHours ?? 24,
          keepUnread: recConfig.readingList?.cleanup?.keepUnread ?? true
        })
      } catch (error) {
        console.error('加载投递方式失败:', error)
      }
    }
    loadDeliveryMode()
  }, [readingListSupported])
  
  // 保存投递方式到 recommendationConfig
  const handleDeliveryModeChange = async (mode: 'popup' | 'readingList') => {
    if (!readingListSupported && mode === 'readingList') return
    
    setDeliveryMode(mode)
    try {
      const recConfig = await getRecommendationConfig()
      await saveRecommendationConfig({
        ...recConfig,
        deliveryMode: mode === 'readingList' && readingListSupported ? 'readingList' : 'popup'
      })
      // 通知后台服务
      await chrome.runtime.sendMessage({ 
        type: 'DELIVERY_MODE_CHANGED',
        deliveryMode: mode
      }).catch(() => {})
    } catch (error) {
      console.error('保存投递方式失败:', error)
    }
  }
  
  // 保存标题前缀到 recommendationConfig
  const handleTitlePrefixChange = async (prefix: string) => {
    setReadingListTitlePrefix(prefix)
    try {
      const recConfig = await getRecommendationConfig()
      await saveRecommendationConfig({
        ...recConfig,
        readingList: {
          ...recConfig.readingList,
          titlePrefix: prefix
        }
      })
    } catch (error) {
      console.error('保存标题前缀失败:', error)
    }
  }
  
  // 保存清理配置到 recommendationConfig
  const handleCleanupChange = async (updates: Partial<typeof readingListCleanup>) => {
    const newCleanup = { ...readingListCleanup, ...updates }
    setReadingListCleanup(newCleanup)
    try {
      const recConfig = await getRecommendationConfig()
      await saveRecommendationConfig({
        ...recConfig,
        readingList: {
          ...recConfig.readingList,
          cleanup: newCleanup
        }
      })
      // 通知清理调度器
      await chrome.runtime.sendMessage({ type: 'REFRESH_READING_LIST_CLEANUP' }).catch(() => {})
    } catch (error) {
      console.error('保存清理配置失败:', error)
    }
  }
  
  // 手动触发阅读列表清理
  const handleManualReadingListCleanup = async () => {
    if (!readingListSupported) return
    setReadingListCleanupRunning(true)
    setReadingListCleanupError(null)

    try {
      const response = await chrome.runtime.sendMessage({ type: 'CLEANUP_READING_LIST' })
      if (response?.success) {
        setReadingListCleanupResult(response.result)
      } else {
        throw new Error(response?.error || 'unknown_error')
      }
    } catch (error) {
      setReadingListCleanupError(error instanceof Error ? error.message : String(error))
    } finally {
      setReadingListCleanupRunning(false)
    }
  }
  
  const readingListModeEnabled = deliveryMode === 'readingList' && readingListSupported
  const cleanupInputsDisabled = !readingListModeEnabled || !readingListCleanup.enabled
  
  // 实时获取推荐池和弹窗数据
  const [poolData, setPoolData] = useState<{
    currentRecommendedPool: number
    currentPopupCount: number
  }>({ currentRecommendedPool: 0, currentPopupCount: 0 })
  
  useEffect(() => {
    const loadPoolData = async () => {
      try {
        // 从 feedArticles 获取当前推荐池数量
        const recommendedPoolCount = await db.feedArticles
          .filter(a => a.poolStatus === 'recommended')
          .count()
        
        // 从 recommendations 获取当前弹窗显示数量
        const popupCount = await db.recommendations
          .filter(r => {
            const isActive = !r.status || r.status === 'active'
            const isUnreadAndNotDismissed = !r.isRead && r.feedback !== 'dismissed'
            return isActive && isUnreadAndNotDismissed
          })
          .count()
        
        setPoolData({
          currentRecommendedPool: recommendedPoolCount,
          currentPopupCount: popupCount
        })
      } catch (error) {
        console.error('加载池数据失败:', error)
      }
    }
    
    loadPoolData()
  }, [])

  // 格式化时间
  const formatTimeUntil = (timestamp: number): string => {
    const diff = timestamp - Date.now()
    
    if (diff < 0) return "即将执行"
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days} 天后`
    if (hours > 0) return `${hours} 小时后`
    if (minutes > 0) return `${minutes} 分钟后`
    return "即将执行"
  }

  // 解析策略参数
  const getStrategyParams = () => {
    if (!poolStrategy) return null
    
    // 正确的数据结构: poolStrategy = { date, decision: { minInterval, poolSize, ... }, context }
    const decision = poolStrategy.decision
    
    // 冷却期（minInterval 是毫秒，转换为分钟）
    const cooldownMinutes = decision?.minInterval 
      ? Math.round(decision.minInterval / 1000 / 60) 
      : 60
    
    // 分析间隔（从调度器获取实际值，动态范围 1-10 分钟）
    // recommendationScheduler.currentIntervalMinutes 是实际的调度间隔
    const analysisInterval = recommendationScheduler?.currentIntervalMinutes || 1
    
    return {
      cooldownMinutes,
      analysisInterval,
      poolSize: decision?.poolSize || maxRecommendations * 2 || 6,
      reasoning: decision?.reasoning || '等待生成策略',
      confidence: decision?.confidence ? `${Math.round(decision.confidence * 100)}%` : null
    }
  }

  const params = getStrategyParams()

  return (
    <div className="space-y-6 p-6">
      {/* Phase 15: 投递方式选择 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 shadow-sm p-6">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <span>📮</span>
              推荐投递方式
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {readingListSupported
                ? _("options.recommendation.delivery.hint")
                : _("options.recommendation.readingList.notSupported")}
            </p>
          </div>
          {!readingListSupported && (
            <span className="text-xs px-3 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
              {_("options.recommendation.readingList.notSupported")}
            </span>
          )}
        </div>

        <div className="space-y-2 mb-4">
          <label className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition ${deliveryMode === 'popup' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <input
              type="radio"
              className="mt-1"
              checked={deliveryMode === 'popup'}
              onChange={() => handleDeliveryModeChange('popup')}
            />
            <div className="space-y-1 flex-1">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{_("options.recommendation.delivery.popup")}</div>
              <p className="text-xs text-gray-600 dark:text-gray-400">{_("options.recommendation.delivery.popupDesc")}</p>
            </div>
          </label>

          <label className={`flex items-start gap-3 p-4 rounded-lg border transition ${readingListSupported ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'} ${readingListModeEnabled ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-gray-700'}`}>
            <input
              type="radio"
              className="mt-1"
              disabled={!readingListSupported}
              checked={deliveryMode === 'readingList'}
              onChange={() => handleDeliveryModeChange('readingList')}
            />
            <div className="space-y-1 flex-1">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{_("options.recommendation.delivery.readingList")}</div>
              <p className="text-xs text-gray-600 dark:text-gray-400">{_("options.recommendation.delivery.readingListDesc")}</p>
              {readingListSupported && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-300">{_("options.recommendation.delivery.readingListSupportHint")}</p>
              )}
            </div>
          </label>
        </div>

        {readingListModeEnabled && (
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">{_("options.recommendation.readingList.titlePrefix")}</label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                value={readingListTitlePrefix}
                onChange={(e) => handleTitlePrefixChange(e.target.value)}
                placeholder="📰 "
              />
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">{_("options.recommendation.readingList.titlePrefixHint")}</p>
            </div>

            {/* 阅读列表清理配置 */}
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <span>🧹</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{_("options.recommendation.readingList.cleanupTitle")}</p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">{_("options.recommendation.readingList.cleanupDesc")}</p>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={readingListCleanup.enabled}
                    onChange={(e) => handleCleanupChange({ enabled: e.target.checked })}
                  />
                  <span>{_("options.recommendation.readingList.cleanupEnabled")}</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-600 dark:text-gray-400">{_("options.recommendation.readingList.retentionDays")}</label>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    disabled={cleanupInputsDisabled}
                    value={readingListCleanup.retentionDays}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      handleCleanupChange({ retentionDays: Number.isFinite(value) ? value : 30 })
                    }}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600 dark:text-gray-400">{_("options.recommendation.readingList.maxEntries")}</label>
                  <input
                    type="number"
                    min={0}
                    max={500}
                    disabled={cleanupInputsDisabled}
                    value={readingListCleanup.maxEntries}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      handleCleanupChange({ maxEntries: Number.isFinite(value) ? value : 100 })
                    }}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600 dark:text-gray-400">{_("options.recommendation.readingList.intervalHours")}</label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    disabled={cleanupInputsDisabled}
                    value={readingListCleanup.intervalHours}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      handleCleanupChange({ intervalHours: Number.isFinite(value) ? value : 24 })
                    }}
                    className="w-full px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-600 dark:text-gray-400">{_("options.recommendation.readingList.keepUnread")}</label>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded border ${cleanupInputsDisabled ? 'border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900/40 text-gray-400 dark:text-gray-500' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'}`}>
                    <input
                      type="checkbox"
                      disabled={cleanupInputsDisabled}
                      checked={readingListCleanup.keepUnread}
                      onChange={(e) => handleCleanupChange({ keepUnread: e.target.checked })}
                    />
                    <span className="text-xs">{_("options.recommendation.readingList.keepUnreadHint")}</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleManualReadingListCleanup}
                  disabled={!readingListSupported || readingListCleanupRunning}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${(!readingListSupported || readingListCleanupRunning) ? 'bg-gray-300 text-gray-600 dark:bg-gray-700 dark:text-gray-300 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'}`}
                >
                  {readingListCleanupRunning ? _("options.recommendation.readingList.cleanupRunning") : _("options.recommendation.readingList.manualCleanup")}
                </button>
                {readingListCleanupResult && (
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    {_("options.recommendation.readingList.cleanupResult", { removed: readingListCleanupResult.removed, total: readingListCleanupResult.total })}
                  </span>
                )}
                {readingListCleanupError && (
                  <span className="text-xs text-red-600 dark:text-red-400">{readingListCleanupError}</span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{_("options.recommendation.readingList.cleanupScope")}</p>
            </div>
          </div>
        )}
      </div>

      {/* 学习阶段提示 */}
      {isLearningStage && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📚</span>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                学习阶段
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                已浏览 {pageCount}/{totalPages} 页，系统正在学习你的兴趣偏好
              </p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-500"
                  style={{ width: `${Math.min((pageCount / totalPages) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase 14: 文章池状态已合并到 CollectionStats 的推荐漏斗中 */}

      {/* 智能推荐策略 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <span>🎯</span>
          智能推荐策略
        </h3>
        {isLearningStage ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl">📚</span>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    学习阶段
                  </span>
                  <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">0</span>
                </div>
                <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                  已浏览 {pageCount}/{totalPages} 页，系统正在学习你的兴趣偏好
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  完成后 AI 将自动生成个性化推荐策略
                </p>
              </div>
            </div>
          </div>
        ) : poolStrategy?.decision ? (
          <div className="space-y-4">
            {/* AI 决策理由 */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">🤖</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-purple-900 dark:text-purple-100">
                      AI 决策建议
                    </span>
                    {poolStrategy.decision.confidence && (
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-200">
                        置信度 {(poolStrategy.decision.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-purple-800 dark:text-purple-200 mb-2">
                    {poolStrategy.decision.reasoning}
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    更新时间：{poolStrategy.date}
                  </p>
                </div>
              </div>
            </div>
            
            {/* 实时状态：推荐池和弹窗 */}
            <div className="grid grid-cols-2 gap-3">
              {/* 推荐池状态 */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span>📦</span>
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">推荐池</span>
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {poolData.currentRecommendedPool}
                  </span>
                  <span className="text-sm text-green-500 dark:text-green-500">
                    / {poolStrategy.decision.poolSize || poolCapacity}
                  </span>
                </div>
                <div className="w-full bg-green-200 dark:bg-green-800 rounded-full h-1.5">
                  <div 
                    className="bg-green-500 dark:bg-green-400 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min((poolData.currentRecommendedPool / (poolStrategy.decision.poolSize || poolCapacity)) * 100, 100)}%` }}
                  />
                </div>
              </div>
              
              {/* 弹窗显示状态 */}
              <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span>💬</span>
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-300">弹窗显示</span>
                </div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {poolData.currentPopupCount}
                  </span>
                  <span className="text-sm text-amber-500 dark:text-amber-500">
                    / {maxRecommendations}
                  </span>
                </div>
                <div className="w-full bg-amber-200 dark:bg-amber-800 rounded-full h-1.5">
                  <div 
                    className="bg-amber-500 dark:bg-amber-400 h-1.5 rounded-full transition-all"
                    style={{ width: `${Math.min((poolData.currentPopupCount / maxRecommendations) * 100, 100)}%` }}
                  />
                </div>
              </div>
            </div>
            
            {/* 当前策略参数 */}
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">补充间隔</span>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      {params?.cooldownMinutes || 60} 分钟
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    冷却期后自动补充
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">每日补充上限</span>
                    <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                      {poolStrategy.decision.maxDailyRefills || 10} 次
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    防止过度消耗配额
                  </div>
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">触发阈值</span>
                    <span className="text-lg font-bold text-purple-600 dark:text-purple-400">
                      {poolStrategy.decision.triggerThreshold ? (poolStrategy.decision.triggerThreshold * 100).toFixed(0) : 50}%
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    池低于此比例时补充
                  </div>
                </div>
              </div>
            </div>
            
            {/* 数据源分析 */}
            {poolStrategy.context && (
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">📊 决策依据</div>
                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">订阅源</div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {poolStrategy.context.feeds?.totalCount || 0} 个 / {poolStrategy.context.feeds?.activeFeeds || 0} 活跃
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">日均文章</div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {poolStrategy.context.articles?.dailyAverage?.toFixed(0) || 0} 篇
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-gray-400">昨日点击率</div>
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {poolStrategy.context.userBehavior?.recommendationsShown > 0
                        ? ((poolStrategy.context.userBehavior.clicked / poolStrategy.context.userBehavior.recommendationsShown) * 100).toFixed(0)
                        : 0}%
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* 推荐任务执行时间 */}
            {recommendationScheduler?.nextRunTime && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-blue-700 dark:text-blue-300">⏱️ 下次推荐生成</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {formatTimeUntil(recommendationScheduler.nextRunTime)}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">当前推荐数量</span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {maxRecommendations} 条
              </span>
            </div>
            
            {/* 推荐任务执行时间 */}
            {recommendationScheduler?.nextRunTime && (
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 dark:text-gray-400">⏱️ 下次推荐生成</span>
                  <span className="font-medium text-blue-600 dark:text-blue-400">
                    {formatTimeUntil(recommendationScheduler.nextRunTime)}
                  </span>
                </div>
              </div>
            )}
            
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
              推荐池容量为弹窗容量的 2 倍（即 {maxRecommendations * 2} 条）
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
              💡 扩展启动后 5 分钟，AI 将自动生成个性化推荐池策略（此后每 24 小时更新一次）
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
