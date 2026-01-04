/**
 * 内容推荐设置组件
 * 展示推荐策略和文章池流转状态
 */

import { useState, useEffect } from 'react'
import { useI18n } from '@/i18n/helpers'
import { getPoolStats } from '@/storage/db/db-pool'
import { db } from '@/storage/db'

interface PoolStats {
  raw: number
  prescreenedOut: number
  analyzedNotQualified: number
  candidate: {
    count: number
    avgScore: number
  }
  recommended: {
    count: number
    avgAgeMs: number
    avgAgeDays: number
  }
  exited: {
    total: number
    byReason: {
      read: number
      disliked: number
      saved: number
      replaced: number
      expired: number
      quality_dropped: number
    }
  }
  activeTotal: number
}

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
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null)
  const [loading, setLoading] = useState(true)
  // 本地查询弹窗活跃推荐数量（避免消息传递延迟问题）
  const [localActiveRecommendationCount, setLocalActiveRecommendationCount] = useState<number | null>(null)

  // 加载池状态统计（只在组件挂载时加载一次，不自动刷新）
  useEffect(() => {
    loadStats()
  }, [])

  // 加载统计数据
  const loadStats = async () => {
    try {
      setLoading(true)
      const stats = await getPoolStats()
      setPoolStats(stats)
      
      // 直接查询 recommendations 表获取弹窗活跃推荐数量
      const activeRecs = await db.recommendations
        .filter(rec => {
          const isActive = !rec.status || rec.status === 'active'
          const isUnreadAndNotDismissed = !rec.isRead && rec.feedback !== 'dismissed'
          return isActive && isUnreadAndNotDismissed
        })
        .count()
      setLocalActiveRecommendationCount(activeRecs)
      
      // 退出统计直接使用 getPoolStats 返回的数据（统一数据源）
      // 不再单独查询，避免条件不一致导致数据不准确
    } catch (error) {
      console.error('加载池状态统计失败:', error)
    } finally {
      setLoading(false)
    }
  }

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

      {/* 文章池状态概览 */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-600 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <span>📊</span>
            文章池状态
          </h3>
          <button
            onClick={loadStats}
            disabled={loading}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? '加载中...' : '🔄 刷新'}
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            加载中...
          </div>
        ) : poolStats ? (
          <div className="relative">
            {/* SVG 流程图 */}
            <div className="relative bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900/50 dark:to-gray-800/50 rounded-lg p-6">
              {/* SVG 箭头定义 */}
              <svg width="0" height="0" className="absolute">
                <defs>
                  <marker id="arrow-gray" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                    <path d="M0,0 L5,2.5 L0,5 Z" fill="#9CA3AF" />
                  </marker>
                  <marker id="arrow-red" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                    <path d="M0,0 L5,2.5 L0,5 Z" fill="#EF4444" />
                  </marker>
                  <marker id="arrow-green" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                    <path d="M0,0 L5,2.5 L0,5 Z" fill="#22C55E" />
                  </marker>
                  <marker id="arrow-blue" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto">
                    <path d="M0,0 L5,2.5 L0,5 Z" fill="#3B82F6" />
                  </marker>
                </defs>
              </svg>

              {/* ===== 第1行：订阅源 ===== */}
              <div className="flex justify-center mb-2">
                <div className="w-32 px-3 py-2 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg text-center">
                  <div className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">📡 订阅源</div>
                  <div className="text-xl font-bold text-purple-600 dark:text-purple-400">{poolStats.activeTotal}</div>
                </div>
              </div>

              {/* 箭头：订阅源 → AI初筛 */}
              <div className="flex justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line x1="10" y1="0" x2="10" y2="15" stroke="#9CA3AF" strokeWidth="1" markerEnd="url(#arrow-gray)" />
                </svg>
              </div>

              {/* ===== 第2行：AI初筛（居中） + 初筛淘汰（左侧） ===== */}
              <div className="flex justify-center mb-2">
                {/* AI初筛（居中） - 使用 relative 作为废弃块的定位参考 */}
                <div className="relative w-36 px-3 py-1.5 bg-transparent border border-dashed border-orange-300 dark:border-orange-500 rounded-full text-center">
                  <span className="text-xs font-medium text-orange-600 dark:text-orange-400">🤖 AI 初筛</span>
                  {/* 初筛淘汰（绝对定位到控制块左侧） */}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 flex items-center">
                    <div className="w-24 px-2 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-center">
                      <div className="text-[10px] text-gray-600 dark:text-gray-400">🚫 初筛淘汰</div>
                      <div className="text-lg font-bold text-gray-500 dark:text-gray-400">{poolStats.prescreenedOut}</div>
                    </div>
                    {/* 箭头（在废弃块和控制块之间，指向废弃块） */}
                    <svg width="20" height="12" viewBox="0 0 20 12" className="ml-1">
                      <line x1="20" y1="6" x2="5" y2="6" stroke="#6B7280" strokeWidth="1" markerEnd="url(#arrow-gray)" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* 箭头：AI初筛 → 待分析 */}
              <div className="flex justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line x1="10" y1="0" x2="10" y2="15" stroke="#9CA3AF" strokeWidth="1" markerEnd="url(#arrow-gray)" />
                </svg>
              </div>

              {/* ===== 第3行：待分析 ===== */}
              <div className="flex justify-center mb-2">
                <div className="w-32 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg text-center">
                  <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">📥 待分析</div>
                  <div className="text-xl font-bold text-gray-700 dark:text-gray-300">{poolStats.raw}</div>
                </div>
              </div>

              {/* 箭头：待分析 → AI深度分析 */}
              <div className="flex justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line x1="10" y1="0" x2="10" y2="15" stroke="#9CA3AF" strokeWidth="1" markerEnd="url(#arrow-gray)" />
                </svg>
              </div>

              {/* ===== 第4行：AI深度分析（居中） + 未达标（左侧） ===== */}
              <div className="flex justify-center mb-2">
                {/* AI深度分析（居中） - 使用 relative 作为废弃块的定位参考 */}
                <div className="relative w-36 px-3 py-1.5 bg-transparent border border-dashed border-cyan-300 dark:border-cyan-500 rounded-full text-center">
                  <span className="text-xs font-medium text-cyan-600 dark:text-cyan-400">🧠 AI分析 · {params?.analysisInterval || 1}分钟</span>
                  {/* 分析未达标（绝对定位到控制块左侧） */}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 mr-2 flex items-center">
                    <div className="w-24 px-2 py-1.5 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-center">
                      <div className="text-[10px] text-gray-600 dark:text-gray-400">❌ 未达标</div>
                      <div className="text-lg font-bold text-gray-500 dark:text-gray-400">{poolStats.analyzedNotQualified}</div>
                    </div>
                    {/* 箭头（在废弃块和控制块之间，指向废弃块） */}
                    <svg width="20" height="12" viewBox="0 0 20 12" className="ml-1">
                      <line x1="20" y1="6" x2="5" y2="6" stroke="#6B7280" strokeWidth="1" markerEnd="url(#arrow-gray)" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* 箭头：AI深度分析 → 候选池 */}
              <div className="flex justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line x1="10" y1="0" x2="10" y2="15" stroke="#22C55E" strokeWidth="1" markerEnd="url(#arrow-green)" />
                </svg>
              </div>

              {/* ===== 第5行：候选池 ===== */}
              <div className="flex justify-center mb-2">
                <div className="w-32 px-3 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-600 rounded-lg text-center">
                  <div className="text-xs text-yellow-700 dark:text-yellow-400 mb-1">✅ 候选池</div>
                  <div className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{poolStats.candidate.count}</div>
                </div>
              </div>

              {/* 箭头：候选池 → 冷却期 */}
              <div className="flex justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line x1="10" y1="0" x2="10" y2="15" stroke="#9CA3AF" strokeWidth="1" markerEnd="url(#arrow-gray)" />
                </svg>
              </div>

              {/* ===== 第6行：冷却期控制 ===== */}
              <div className="flex justify-center mb-2">
                <div className="w-36 px-3 py-1.5 bg-transparent border border-dashed border-orange-300 dark:border-orange-500 rounded-full text-center">
                  <span className="text-xs font-medium text-orange-600 dark:text-orange-400">⏱️ 冷却期 · {params?.cooldownMinutes || 60}分钟</span>
                </div>
              </div>

              {/* 箭头：冷却期 → 推荐池 */}
              <div className="flex justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line x1="10" y1="0" x2="10" y2="15" stroke="#22C55E" strokeWidth="1" markerEnd="url(#arrow-green)" />
                </svg>
              </div>

              {/* ===== 第7行：推荐池 ===== */}
              <div className="flex justify-center mb-2">
                <div className="w-32 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-300 dark:border-green-600 rounded-lg text-center">
                  <div className="text-xs text-green-700 dark:text-green-400 mb-1">⭐ 推荐池</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    {poolStats.recommended.count}/{poolCapacity}
                  </div>
                </div>
              </div>

              {/* 箭头：推荐池 → 弹窗 */}
              <div className="flex justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line x1="10" y1="0" x2="10" y2="15" stroke="#3B82F6" strokeWidth="1" markerEnd="url(#arrow-blue)" />
                </svg>
              </div>

              {/* ===== 第8行：弹窗显示 ===== */}
              <div className="flex justify-center mb-2">
                <div className="w-32 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-600 rounded-lg text-center">
                  <div className="text-xs text-blue-700 dark:text-blue-400 mb-1">📱 弹窗显示</div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {localActiveRecommendationCount ?? activeRecommendationCount}/{maxRecommendations}
                  </div>
                </div>
              </div>

              {/* 箭头：弹窗 → 退出统计 */}
              <div className="flex justify-center">
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line x1="10" y1="0" x2="10" y2="15" stroke="#9CA3AF" strokeWidth="1" markerEnd="url(#arrow-gray)" />
                </svg>
              </div>

              {/* ===== 第9行：退出统计 ===== */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 text-center">
                  🔚 退出统计 · 总计 {poolStats?.exited?.total || 0}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  <div className="text-center p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">📖 已读</div>
                    <div className="text-base font-bold text-blue-600 dark:text-blue-400">{poolStats?.exited?.byReason?.read || 0}</div>
                  </div>
                  <div className="text-center p-1.5 bg-amber-50 dark:bg-amber-900/20 rounded">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">📑 稍后</div>
                    <div className="text-base font-bold text-amber-600 dark:text-amber-400">{poolStats?.exited?.byReason?.saved || 0}</div>
                  </div>
                  <div className="text-center p-1.5 bg-red-50 dark:bg-red-900/20 rounded">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">👎 不想</div>
                    <div className="text-base font-bold text-red-600 dark:text-red-400">{poolStats?.exited?.byReason?.disliked || 0}</div>
                  </div>
                  <div className="text-center p-1.5 bg-gray-50 dark:bg-gray-700 rounded">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">🔄 替换</div>
                    <div className="text-base font-bold text-gray-500 dark:text-gray-400">{poolStats?.exited?.byReason?.replaced || 0}</div>
                  </div>
                  <div className="text-center p-1.5 bg-gray-50 dark:bg-gray-700 rounded">
                    <div className="text-[10px] text-gray-500 dark:text-gray-400">⏰ 过期</div>
                    <div className="text-base font-bold text-gray-500 dark:text-gray-400">{poolStats?.exited?.byReason?.expired || 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            暂无数据
          </div>
        )}
      </div>

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
            
            {/* 当前策略参数 */}
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500 dark:text-gray-400">推荐池容量</span>
                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                      {poolStrategy.decision.poolSize || poolCapacity} 条
                    </span>
                  </div>
                  <div className="text-xs text-gray-400">
                    弹窗显示 {maxRecommendations} 条
                  </div>
                </div>
                
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
