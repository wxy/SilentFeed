/**
 * 内容推荐设置组件（流程视图）
 * - 学习提示与策略说明
 * - 推荐投递方式选择（弹窗/阅读列表）
 * - 任务调度、准入阈值、补充策略、池状态
 */
import { useEffect, useState } from 'react'
import { useI18n } from '@/i18n/helpers'
import { isReadingListAvailable } from '@/utils/browser-compat'
import { getRecommendationConfig, saveRecommendationConfig } from '@/storage/recommendation-config'
import { db } from '@/storage/db'

interface RecommendationSettingsProps {
  currentStrategy?: any  // Phase 13: StrategyDecision 对象
  maxRecommendations: number
  isLearningStage: boolean
  pageCount: number
  totalPages: number
  activeRecommendationCount: number
  poolCapacity: number
}

export function RecommendationSettings({
  currentStrategy,
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

  // 实时池/弹窗状态
  const [poolData, setPoolData] = useState<{ currentRecommendedPool: number; currentPopupCount: number; candidatePoolCount: number }>({ 
    currentRecommendedPool: 0, 
    currentPopupCount: 0,
    candidatePoolCount: 0
  })
  useEffect(() => {
    const loadPoolData = async () => {
      try {
        // 推荐池 = recommendations 表中活跃未读的记录（与 RefillScheduler 一致）
        const recommendedPoolCount = await db.recommendations
          .filter(r => {
            const isActive = !r.status || r.status === 'active'
            const isUnread = !r.isRead
            return isActive && isUnread
          })
          .count()
        
        // 弹窗显示 = recommendations 表中活跃未读且未标记稍后读的记录
        const popupCount = await db.recommendations
          .filter(r => {
            const isActive = !r.status || r.status === 'active'
            const isUnreadAndNotDismissed = !r.isRead && r.feedback !== 'dismissed'
            return isActive && isUnreadAndNotDismissed
          })
          .count()
        
        // 候选池 = feedArticles 中 poolStatus='candidate' 的数量
        const candidatePoolCount = await db.feedArticles
          .filter(a => a.poolStatus === 'candidate')
          .count()
        
        setPoolData({ currentRecommendedPool: recommendedPoolCount, currentPopupCount: popupCount, candidatePoolCount })
      } catch {
        // 忽略错误
      }
    }
    loadPoolData()
    
    // 每 5 秒刷新一次
    const interval = setInterval(loadPoolData, 5000)
    return () => clearInterval(interval)
  }, [])

  const formatTimeUntil = (timestamp: number): string => {
    const diff = timestamp - Date.now()
    if (diff <= 0) return '即将执行'
    const minutes = Math.floor(diff / 60000)
    if (minutes < 60) return `${minutes} 分钟后`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours} 小时后`
    const days = Math.floor(hours / 24)
    return `${days} 天后`
  }

  const formatAbsoluteTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    const hours = `${date.getHours()}`.padStart(2, '0')
    const minutes = `${date.getMinutes()}`.padStart(2, '0')
    return `${month}-${day} ${hours}:${minutes}`
  }

  // Phase 13: 从新策略系统读取参数
  const entryThreshold = currentStrategy?.strategy?.candidatePool?.entryThreshold ?? 0.5

  // 补充策略参数（从旧的 PoolRefillPolicy 读取，这些是补充管理器的实时配置）
  const minIntervalMinutes = 60  // 默认值
  const dailyRefillLimit = 10    // 默认值
  const triggerPercent = '50'    // 默认值
  
  // 优先使用新策略系统的 targetPoolSize
  const poolSize = currentStrategy?.strategy?.recommendation?.targetPoolSize ?? 
                  maxRecommendations * 2

  // 读取补充状态以显示下次补充时间
  const nextRefillTime =
    refillState
      ? (() => {
          // 如果 lastRefillTime 是 0 或非常小（早于 2020年），说明刚重置，下次执行时间就是现在
          if (refillState.lastRefillTime < new Date('2020-01-01').getTime()) {
            return Date.now()
          }
          // 使用固定的默认间隔 60 分钟（60 * 60 * 1000 ms）
          const defaultInterval = 60 * 60 * 1000
          return refillState.lastRefillTime + defaultInterval
        })()
      : null
  const remainingRefills =
    refillState && typeof dailyRefillLimit === 'number'
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
                      {currentStrategy ? `${_('更新于')} ${new Date(currentStrategy.createdAt).toLocaleString()}` : _('使用默认策略')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        try {
                          await chrome.runtime.sendMessage({ type: 'TRIGGER_RECOMMENDATION_STRATEGY' })
                          alert('✅ 已触发推荐策略执行')
                        } catch (error) {
                          alert('❌ 触发失败: ' + String(error))
                        }
                      }}
                      className="px-2 py-1 text-xs bg-indigo-500 hover:bg-indigo-600 text-white rounded transition-colors"
                    >
                      🎯 重新生成
                    </button>
                  </div>
                </div>
                
                {/* 策略推理文本 */}
                <p className="text-sm text-gray-700 dark:text-gray-300 mb-4 leading-relaxed">
                  {currentStrategy?.reasoning || _('根据历史行为调整推荐策略')}
                </p>
                
                {/* 阈值可视化部分 */}
                <div className="space-y-4 mb-4">
                  {/* 候选池阈值 - 独立框 */}
                  <div className="bg-indigo-50 dark:bg-indigo-900/10 rounded-lg p-3 border border-indigo-200 dark:border-indigo-700/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold">【候选池】</span>准入阈值
                      </span>
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">{(entryThreshold * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-indigo-200 dark:bg-indigo-800 rounded-full h-2">
                      <div className="bg-indigo-600 dark:bg-indigo-400 h-2 rounded-full transition-all" style={{ width: `${entryThreshold * 100}%` }} />
                    </div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">{_('文章评分高于此值才进入候选池')}</div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-indigo-200 dark:border-indigo-700/50">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{_('当前候选池')}</span>
                      <span className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{poolData.candidatePoolCount} <span className="text-xs font-normal">篇</span></span>
                    </div>
                    {currentStrategy?.id && (
                      <div className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">{_('来源：AI 策略（ID:')} {currentStrategy.id.substring(0, 8)}{_('）')}</div>
                    )}
                  </div>
                  
                  {/* 推荐池 - 大框整合所有相关数据 */}
                  <div className="bg-purple-50 dark:bg-purple-900/10 rounded-lg p-4 border border-purple-200 dark:border-purple-700/50">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-purple-600 dark:text-purple-400 font-semibold text-sm">【推荐池】补充机制</span>
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">(从候选池 → 推荐池)</span>
                    </div>

                    {/* 触发阈值 */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{_('触发阈值')}</span>
                        <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{triggerPercent}%</span>
                      </div>
                      <div className="w-full bg-purple-200 dark:bg-purple-800 rounded-full h-2">
                        <div className="bg-purple-600 dark:bg-purple-400 h-2 rounded-full transition-all" style={{ width: `${triggerPercent}%` }} />
                      </div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-500 mt-1">{_('池容量低于此比例时触发补充')}</div>
                    </div>

                    {/* 补充配置 */}
                    <div className="grid grid-cols-2 gap-3 mb-4 text-xs pb-4 border-b border-purple-200 dark:border-purple-700/50">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-600 dark:text-gray-400">{_('补充间隔')}</span>
                          <button
                            onClick={async () => {
                              try {
                                await chrome.runtime.sendMessage({ type: 'RESET_REFILL_TIME' })
                                alert('✅ 已重置下次补充时间为现在')
                                window.location.reload()
                              } catch (error) {
                                alert('❌ 重置失败: ' + String(error))
                              }
                            }}
                            className="px-2 py-0.5 text-[10px] bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                          >
                            重置时间
                          </button>
                        </div>
                        <div className="font-bold text-green-600 dark:text-green-400">{minIntervalMinutes} 分钟</div>
                        {nextRefillTime && (
                          <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">{_('下次：')} {formatAbsoluteTime(nextRefillTime)}</div>
                        )}
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-600 dark:text-gray-400">{_('每日上限')}</span>
                          <button
                            onClick={async () => {
                              try {
                                await chrome.runtime.sendMessage({ type: 'RESET_DAILY_REFILL_COUNT' })
                                alert('✅ 已重置每日补充次数')
                                window.location.reload()
                              } catch (error) {
                                alert('❌ 重置失败: ' + String(error))
                              }
                            }}
                            className="px-2 py-0.5 text-[10px] bg-orange-500 hover:bg-orange-600 text-white rounded transition-colors"
                          >
                            重置次数
                          </button>
                        </div>
                        <div className="font-bold text-orange-600 dark:text-orange-400">{dailyRefillLimit} {_('次')}</div>
                        {remainingRefills !== null && (
                          <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-1">{_('剩余：')} {remainingRefills} {_('次')}</div>
                        )}
                      </div>
                    </div>

                    {/* 推荐池/弹窗容量状态 */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <div className="flex items-center gap-1 mb-2">
                          <span>📦</span>
                          <span className="text-xs font-medium text-green-700 dark:text-green-300">{_('推荐池')}</span>
                        </div>
                        <div className="flex items-baseline gap-1 mb-2">
                          <span className="text-lg font-bold text-green-600 dark:text-green-400">{poolData.currentRecommendedPool}</span>
                          <span className="text-xs text-green-500 dark:text-green-500">/ {poolSize}</span>
                        </div>
                        <div className="w-full bg-green-200 dark:bg-green-800 rounded-full h-1.5">
                          <div className="bg-green-500 dark:bg-green-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.min((poolData.currentRecommendedPool / poolSize) * 100, 100)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1 mb-2">
                          <span>💬</span>
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-300">{_('弹窗显示')}</span>
                        </div>
                        <div className="flex items-baseline gap-1 mb-2">
                          <span className="text-lg font-bold text-amber-600 dark:text-amber-400">{poolData.currentPopupCount}</span>
                          <span className="text-xs text-amber-500 dark:text-amber-500">/ {maxRecommendations}</span>
                        </div>
                        <div className="w-full bg-amber-200 dark:bg-amber-800 rounded-full h-1.5">
                          <div className="bg-amber-500 dark:bg-amber-400 h-1.5 rounded-full transition-all" style={{ width: `${Math.min((poolData.currentPopupCount / maxRecommendations) * 100, 100)}%` }} />
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
                <span className="text-sm font-medium text-blue-900 dark:text-blue-100">⏱️ {_('下次推荐生成')}</span>
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
