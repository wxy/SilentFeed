/**
 * 内容推荐设置组件（流程视图）
 * - 学习提示与策略说明
 * - 推荐投递方式选择（弹窗/阅读列表）
 * - 任务调度、准入阈值、补充策略、池状态
 */
import { useEffect, useState, useCallback } from 'react'
import { useI18n } from '@/i18n/helpers'
import { isReadingListAvailable } from '@/utils/browser-compat'
import { getRecommendationConfig, saveRecommendationConfig } from '@/storage/recommendation-config'
import { db, getUnreadRecommendations } from '@/storage/db'
import { ReadingListManager } from '@/core/reading-list/reading-list-manager'

interface RecommendationSettingsProps {
  poolStrategy?: any
  currentStrategy?: any
  recommendationScheduler?: any
  maxRecommendations: number
  isLearningStage: boolean
  pageCount: number
  totalPages: number
  activeRecommendationCount: number
  poolCapacity: number
}

export function RecommendationSettings({
  poolStrategy,
  currentStrategy,
  recommendationScheduler,
  maxRecommendations,
  isLearningStage,
  pageCount,
  totalPages,
  activeRecommendationCount,
  poolCapacity,
}: RecommendationSettingsProps) {
  const { _ } = useI18n()
  const [refillState, setRefillState] = useState<{ lastRefillTime: number; dailyRefillCount: number; currentDate: string } | null>(null)
  const readingListSupported = isReadingListAvailable()
  const [deliveryMode, setDeliveryMode] = useState<'popup' | 'readingList'>('popup')
  const readingListModeEnabled = deliveryMode === 'readingList' && readingListSupported

  // 初始化投递方式
  useEffect(() => {
    const loadDelivery = async () => {
      try {
        const recConfig = await getRecommendationConfig()
        setDeliveryMode(recConfig.deliveryMode === 'readingList' && readingListSupported ? 'readingList' : 'popup')
      } catch {
        // 忽略错误
      }
    }
    loadDelivery()
  }, [readingListSupported])

  const handleDeliveryModeChange = async (mode: 'popup' | 'readingList') => {
    if (!readingListSupported && mode === 'readingList') return
    setDeliveryMode(mode)
    try {
      const recConfig = await getRecommendationConfig()
      await saveRecommendationConfig({
        ...recConfig,
        deliveryMode: mode === 'readingList' && readingListSupported ? 'readingList' : 'popup'
      })
      await chrome.runtime.sendMessage({ type: 'DELIVERY_MODE_CHANGED', deliveryMode: mode }).catch(() => {})
    } catch {
      // 忽略错误
    }
  }

  useEffect(() => {
    // 读取补充状态（用于显示下次可补充时间与剩余次数）
    const loadRefillState = async () => {
      try {
        const result = await chrome.storage.local.get('pool_refill_state')
        if (result.pool_refill_state) {
          setRefillState(result.pool_refill_state)
        }
      } catch (error) {
        // 静默失败即可
      }
    }
    loadRefillState()
  }, [])

  // 实时池状态（统一数据源：以弹窗实际显示为准）
  const [poolData, setPoolData] = useState<{ candidatePoolCount: number; recommendedPoolCount: number }>({ 
    candidatePoolCount: 0,
    recommendedPoolCount: 0
  })
  
  // 加载池统计数据
  const loadPoolData = useCallback(async () => {
    try {
      // 🆕 清单模式下，先主动同步已读状态
      const config = await getRecommendationConfig()
      if (config.deliveryMode === 'readingList') {
        await syncReadingListStatusForSettings()
      }
      
      // 候选池：使用独立查询（候选池比较简单）
      const candidatePoolCount = await db.feedArticles.filter(a => a.poolStatus === 'candidate').count()
      
      // 推荐池：统一使用 getUnreadRecommendations() 结果，与弹窗保持完全一致
      const unreadRecs = await getUnreadRecommendations(100)
      const recommendedPoolCount = unreadRecs.length
      
      setPoolData({ 
        candidatePoolCount,
        recommendedPoolCount
      })
    } catch (error) {
      console.error('[设置页] 加载池统计失败:', error)
    }
  }, [])
  
  // 🆕 设置页专用的同步函数
  const syncReadingListStatusForSettings = async (): Promise<void> => {
    try {
      const entries = await chrome.readingList.query({})
      const ourMappings = await db.readingListEntries.toArray()
      
      let synced = 0
      for (const mapping of ourMappings) {
        const entry = entries.find(e => 
          ReadingListManager.normalizeUrlForTracking(e.url) === mapping.normalizedUrl
        )
        
        if (entry?.hasBeenRead && mapping.recommendationId) {
          const article = await db.feedArticles.get(mapping.recommendationId)
          
          if (article && !article.isRead) {
            await db.feedArticles.update(article.id, {
              isRead: true,
              clickedAt: Date.now(),
              poolStatus: 'exited',
              poolExitedAt: Date.now(),
              poolExitReason: 'read'
            })
            synced++
          }
        }
      }
    } catch (error) {
      console.error('[清单同步] 设置页同步失败:', error)
    }
  }
  
  // 初始加载
  useEffect(() => {
    loadPoolData()
  }, [loadPoolData])
  
  // 监听推荐池更新消息，自动重新加载统计数据
  useEffect(() => {
    // 测试环境中可能没有 chrome.runtime
    if (!chrome?.runtime?.onMessage) {
      return
    }

    const handleMessage = (message: any) => {
      if (message.type === 'RECOMMENDATION_UPDATED') {
        console.debug('[RecommendationSettings] 收到推荐池更新消息，重新加载统计数据')
        loadPoolData()
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [loadPoolData])

  const formatTimeUntil = (timestamp: number): string => {
    const diff = timestamp - Date.now()
    if (diff <= 0) return _('recommendation.strategy.imminent')
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes} ${_('recommendation.time.minutesLater')}`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} ${_('recommendation.time.hoursLater')}`
    const days = Math.floor(hours / 24)
    return `${days} ${_('recommendation.time.daysLater')}`
  }

  const formatAbsoluteTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    const hours = `${date.getHours()}`.padStart(2, '0')
    const minutes = `${date.getMinutes()}`.padStart(2, '0')
    return `${month}-${day} ${hours}:${minutes}`
  }

  // 从 AI 策略读取准入阈值
  const entryThreshold = currentStrategy?.strategy?.candidatePool?.entryThreshold ?? 0.7

  const minIntervalMinutes = currentStrategy?.strategy?.recommendation?.cooldownMinutes ?? 60
  const dailyRefillLimit = currentStrategy?.strategy?.recommendation?.dailyLimit ?? 10
  const triggerPercent = currentStrategy?.strategy?.recommendation?.refillThreshold && currentStrategy?.strategy?.recommendation?.targetPoolSize
    ? ((currentStrategy.strategy.recommendation.refillThreshold / currentStrategy.strategy.recommendation.targetPoolSize) * 100).toFixed(0)
    : '50'
  const poolSize = currentStrategy?.strategy?.recommendation?.targetPoolSize ?? 8

  const nextRefillTime =
    refillState && currentStrategy?.strategy?.recommendation?.cooldownMinutes
      ? refillState.lastRefillTime + (currentStrategy.strategy.recommendation.cooldownMinutes * 60 * 1000)
      : null
  const remainingRefills =
    refillState && dailyRefillLimit
      ? Math.max(dailyRefillLimit - (refillState.dailyRefillCount || 0), 0)
      : null

  const learningProgress = totalPages > 0 ? Math.min(Math.round((pageCount / totalPages) * 100), 100) : 0

  return (
    <div className="space-y-6 p-6">
      {/* 固定顶部：推荐投递方式 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 shadow-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">{_('推荐投递方式')}</span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{readingListSupported ? _('阅读列表可用') : _('阅读列表不可用')}</span>
        </div>
        <div className="flex gap-4 text-sm text-gray-700 dark:text-gray-200">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="delivery"
              value="popup"
              className="accent-indigo-600"
              checked={deliveryMode === 'popup'}
              onChange={() => handleDeliveryModeChange('popup')}
            />
            <span>{_('弹窗')}</span>
          </label>
          <label className={`flex items-center gap-2 ${readingListSupported ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
            <input
              type="radio"
              name="delivery"
              value="readingList"
              className="accent-indigo-600"
              disabled={!readingListSupported}
              checked={deliveryMode === 'readingList'}
              onChange={() => handleDeliveryModeChange('readingList')}
            />
            <span>{_('阅读列表')}</span>
          </label>
        </div>
        {readingListSupported && readingListModeEnabled && (
          <div className="mt-2 text-xs text-green-600 dark:text-green-400">{_('已启用阅读列表模式')}</div>
        )}
      </div>
      {/* 学习阶段与智能推荐策略互斥显示 */}
      {isLearningStage ? (
        // 学习阶段：不显示智能推荐策略
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <span className="text-2xl">📚</span>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{_('学习阶段')}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">{_('已浏览')} {pageCount}/{totalPages} {_('页，系统正在学习你的兴趣偏好')}</p>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-indigo-500 h-full transition-all duration-500" style={{ width: `${learningProgress}%` }} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        // 智能推荐策略：按要求的顺序显示
        <div className="space-y-3">
          {/* 1. 策略对话框（整体包裹） */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-indigo-200 dark:border-indigo-700 shadow-sm overflow-hidden">
            <div className="flex items-start gap-4 p-6">
              {/* AI 头像 */}
              <div className="flex-shrink-0">
                <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-purple-400 rounded-full flex items-center justify-center text-lg shadow-md">
                  🤫
                </div>
              </div>

              {/* 对话框内容 */}
              <div className="flex-1 min-w-0">
                {/* 策略头部信息 */}
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-200 dark:border-indigo-700/50">
                  <div>
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{_('智能推荐策略')}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {currentStrategy?.strategy?.meta?.generatedAt 
                        ? `${_('更新于')} ${new Date(currentStrategy.strategy.meta.generatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                        : _('使用默认策略')}
                      {currentStrategy?.id && (
                        <span className="ml-2 text-gray-400 dark:text-gray-500">
                          (ID: {currentStrategy.id.split('-')[1]?.substring(0, 8)})
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {poolStrategy?.decision?.confidence && (
                      <span className="text-xs text-indigo-600 dark:text-indigo-300 flex-shrink-0">{_('置信度')} {Math.round(poolStrategy.decision.confidence * 100)}%</span>
                    )}
                    {/* 重新生成策略按钮 */}
                    <button
                      onClick={async () => {
                        try {
                          await chrome.runtime.sendMessage({ type: 'TRIGGER_RECOMMENDATION_STRATEGY' })
                          alert('✅ 已触发 AI 策略生成')
                          setTimeout(() => window.location.reload(), 1000)
                        } catch (error) {
                          alert('❌ 触发失败: ' + String(error))
                        }
                      }}
                      className="px-2 py-1 text-[10px] bg-indigo-500 hover:bg-indigo-600 text-white rounded transition-colors"
                      title={_('重新生成 AI 策略')}
                    >
                      🎯 {_('重新生成')}
                    </button>
                  </div>
                </div>
                
                {/* 策略推理文本 */}
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
                  {poolStrategy?.decision?.reasoning || _('根据历史行为调整推荐策略')}
                </p>

                {/* 决策上下文 - 折叠面板 */}
                {currentStrategy?.context && (
                  <details className="mb-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-700">
                    <summary className="px-4 py-2 cursor-pointer text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/30 rounded-lg transition-colors">
                      📋 {_('决策依据')}（{_('系统状态快照')}）
                    </summary>
                    
                    <div className="p-4 space-y-3 border-t border-amber-200 dark:border-amber-700">
                      {/* 供给侧 */}
                      <div className="bg-white dark:bg-gray-800 rounded p-3 border border-amber-200 dark:border-amber-700/50">
                        <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">📥 {_('供给侧')}</div>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                          <div><span className="text-gray-500">{_('活跃源')}:</span> <span className="font-mono">{currentStrategy.context.supply.activeFeeds}</span></div>
                          <div><span className="text-gray-500">{_('日均新文章')}:</span> <span className="font-mono">{currentStrategy.context.supply.dailyNewArticles}</span></div>
                          <div><span className="text-gray-500">{_('原料池')}:</span> <span className="font-mono">{currentStrategy.context.supply.rawPoolSize}</span></div>
                          <div><span className="text-gray-500">{_('候选池')}:</span> <span className="font-mono">{currentStrategy.context.supply.candidatePoolSize}</span></div>
                          <div><span className="text-gray-500">{_('低分文章')}:</span> <span className="font-mono">{currentStrategy.context.supply.analyzedNotQualifiedSize}</span></div>
                        </div>
                      </div>

                      {/* 需求侧 */}
                      <div className="bg-white dark:bg-gray-800 rounded p-3 border border-amber-200 dark:border-amber-700/50">
                        <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">📤 {_('需求侧')}</div>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                          <div><span className="text-gray-500">{_('日均阅读')}:</span> <span className="font-mono">{currentStrategy.context.demand.dailyReadCount}</span></div>
                          <div><span className="text-gray-500">{_('阅读速度')}:</span> <span className="font-mono">{currentStrategy.context.demand.avgReadSpeed.toFixed(1)}</span> {_('篇/天')}</div>
                          <div><span className="text-gray-500">{_('拒绝率')}:</span> <span className="font-mono">{currentStrategy.context.demand.dismissRate.toFixed(0)}%</span></div>
                          <div><span className="text-gray-500">{_('喜欢率')}:</span> <span className="font-mono">{currentStrategy.context.demand.likeRate.toFixed(0)}%</span></div>
                          <div><span className="text-gray-500">{_('推荐池')}:</span> <span className="font-mono">{currentStrategy.context.demand.recommendationPoolSize}/{currentStrategy.context.demand.recommendationPoolCapacity}</span></div>
                        </div>
                      </div>

                      {/* 系统资源 */}
                      <div className="bg-white dark:bg-gray-800 rounded p-3 border border-amber-200 dark:border-amber-700/50">
                        <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">💰 {_('系统资源')}</div>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                          <div><span className="text-gray-500">{_('今日 Tokens')}:</span> <span className="font-mono">{currentStrategy.context.system.aiTokensUsedToday}/{currentStrategy.context.system.aiTokensBudgetDaily}</span></div>
                          <div><span className="text-gray-500">{_('今日成本')}:</span> <span className="font-mono">${currentStrategy.context.system.aiCostToday.toFixed(4)}</span></div>
                          <div><span className="text-gray-500">{_('今日分析')}:</span> <span className="font-mono">{currentStrategy.context.system.analyzedArticlesToday}</span></div>
                          <div><span className="text-gray-500">{_('今日推荐')}:</span> <span className="font-mono">{currentStrategy.context.system.recommendedArticlesToday}</span></div>
                        </div>
                      </div>

                      {/* 历史数据 */}
                      <div className="bg-white dark:bg-gray-800 rounded p-3 border border-amber-200 dark:border-amber-700/50">
                        <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">📊 {_('历史数据')}（7天）</div>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                          <div><span className="text-gray-500">{_('总阅读')}:</span> <span className="font-mono">{currentStrategy.context.history.last7DaysReadCount}</span></div>
                          <div><span className="text-gray-500">{_('总推荐')}:</span> <span className="font-mono">{currentStrategy.context.history.last7DaysRecommendedCount}</span></div>
                          <div><span className="text-gray-500">{_('总分析')}:</span> <span className="font-mono">{currentStrategy.context.history.last7DaysAnalyzedCount}</span></div>
                        </div>
                      </div>

                      {/* 用户画像 */}
                      <div className="bg-white dark:bg-gray-800 rounded p-3 border border-amber-200 dark:border-amber-700/50">
                        <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">👤 {_('用户画像')}</div>
                        <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-[11px]">
                          <div><span className="text-gray-500">{_('页面访问')}:</span> <span className="font-mono">{currentStrategy.context.userProfile.pageVisitCount}</span></div>
                          <div><span className="text-gray-500">{_('引导完成')}:</span> <span className="font-mono">{currentStrategy.context.userProfile.onboardingComplete ? _('是') : _('否')}</span></div>
                          <div><span className="text-gray-500">{_('画像置信度')}:</span> <span className="font-mono">{(currentStrategy.context.userProfile.profileConfidence * 100).toFixed(0)}%</span></div>
                        </div>
                      </div>
                    </div>
                  </details>
                )}

                {/* 原有的阈值可视化部分保持不变 */}
                <div className="space-y-4 mb-4">
                  {/* 候选池阈值 - 独立框（整合所有候选池信息）*/}
                  <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-lg p-3 border border-indigo-200 dark:border-indigo-700/50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold">【候选池】</span>准入阈值
                      </span>
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{entryThreshold.toFixed(1)} {_('分')}</span>
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-500">{_('AI 评分高于此值的文章才能进入候选池')}</div>
                    
                    {/* 当前候选池数量 */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-indigo-200 dark:border-indigo-700/50">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{_('当前候选池')}</span>
                      <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{poolData.candidatePoolCount} <span className="text-xs font-normal">{_('篇')}</span></span>
                    </div>
                    
                    {/* 过期时间 */}
                    {currentStrategy?.strategy?.candidatePool?.expiryHours && (
                      <div className="flex items-center justify-between mt-1 pt-1 border-t border-indigo-200 dark:border-indigo-700/50">
                        <span className="text-xs text-gray-600 dark:text-gray-400">{_('过期淘汰')}</span>
                        <span className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                          {currentStrategy.strategy.candidatePool.expiryHours}h
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* 推荐池 - 大框整合所有相关数据 */}
                  <div className="bg-purple-50 dark:bg-purple-900/10 rounded-lg p-4 border border-purple-200 dark:border-purple-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-purple-600 dark:text-purple-400 font-semibold text-sm">【推荐池】</span>
                    </div>

                    {/* 触发阈值 */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{_('触发阈值')}</span>
                        <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{currentStrategy?.strategy?.recommendation?.refillThreshold ?? 3} {_('条')}</span>
                      </div>
                      <div className="w-full bg-purple-200 dark:bg-purple-800 rounded-full h-2">
                        <div className="bg-purple-600 dark:bg-purple-400 h-2 rounded-full transition-all" style={{ width: `${triggerPercent}%` }} />
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">{_('推荐池文章数 ≤ 此值时触发补充')}</div>
                    </div>

                    {/* 补充配置（仅显示，不可操作） */}
                    <div className="grid grid-cols-2 gap-3 mb-4 text-xs pb-4 border-b border-purple-200 dark:border-purple-700/50">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-600 dark:text-gray-400">{_('补充间隔')}</span>
                        </div>
                        <div className="font-bold text-green-600 dark:text-green-400">{minIntervalMinutes} 分钟</div>
                        {nextRefillTime && (
                          <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">{_('下次：')} {formatAbsoluteTime(nextRefillTime)}</div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-600 dark:text-gray-400">{_('每日上限')}</span>
                        </div>
                        <div className="font-bold text-orange-600 dark:text-orange-400">{dailyRefillLimit} {_('次')}</div>
                        {remainingRefills !== null && (
                          <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">{_('剩余：')} {remainingRefills} {_('次')}</div>
                        )}
                      </div>
                    </div>

                    {/* 推荐池容量状态（推荐池即弹窗显示） */}
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1">
                            <span>📦</span>
                            <span className="text-xs font-medium text-green-700 dark:text-green-300">{_('推荐池')} ({_('弹窗显示')})</span>
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                // 发送强制补充消息（会自动重置状态并执行补充）
                                const result = await chrome.runtime.sendMessage({ type: 'FORCE_REFILL' })
                                if (!result?.success) {
                                  throw new Error('强制补充失败: ' + (result?.error || '未知错误'))
                                }
                                
                                alert('✅ 已触发立即补充，页面将刷新以显示最新数据')
                                // 等待 1 秒让 background 完成数据更新
                                setTimeout(() => window.location.reload(), 1000)
                              } catch (error) {
                                alert('❌ 补充失败: ' + String(error))
                              }
                            }}
                            className="px-2 py-1 text-[10px] bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                            title={_('重置冷却时间并立即补充推荐池')}
                          >
                            ⚡ {_('立即补充')}
                          </button>
                        </div>
                        <div className="flex items-baseline gap-1 mb-2">
                          <span className="text-lg font-bold text-green-600 dark:text-green-400">{poolData.recommendedPoolCount}</span>
                          <span className="text-xs text-green-500 dark:text-green-500">/ {poolSize}</span>
                        </div>
                        <div className="w-full bg-green-200 dark:bg-green-800 rounded-full h-1.5">
                          <div className="bg-green-500 dark:bg-green-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.min((poolData.recommendedPoolCount / poolSize) * 100, 100)}%` }} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 2. 下次推荐时间 - 独立块样式（调度系统消息） */}
          {recommendationScheduler?.nextRunTime && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">⏱️ {_('recommendation.strategy.nextGeneration')}</span>
                <div className="text-right">
                  <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    {formatAbsoluteTime(recommendationScheduler.nextRunTime)}
                  </div>
                  <div className="text-xs text-blue-500 dark:text-blue-500">
                    {formatTimeUntil(recommendationScheduler.nextRunTime)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
