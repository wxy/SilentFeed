/**
 * AI 用量详细视图组件
 * 
 * 按日展示 AI 调用的详细统计数据
 */

import React, { useEffect, useState } from "react"
import { useI18n } from "@/i18n/helpers"
import { AIUsageTracker } from "@/core/ai/AIUsageTracker"
import type { DailyUsageStats } from "@/types/ai-usage"

interface AIUsageDetailViewProps {
  /** 关闭回调 */
  onClose: () => void
}

export function AIUsageDetailView({ onClose }: AIUsageDetailViewProps) {
  const { _ } = useI18n()
  const [dailyStats, setDailyStats] = useState<DailyUsageStats[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'30days' | 'all'>('30days')

  useEffect(() => {
    loadDailyStats()
  }, [period])

  async function loadDailyStats() {
    setLoading(true)
    try {
      const days = period === '30days' ? 30 : 0
      const stats = await AIUsageTracker.getDailyStats(days)
      setDailyStats(stats)
    } catch (error) {
      console.error("加载按日统计失败:", error)
    } finally {
      setLoading(false)
    }
  }

  // 计算汇总数据
  const summary = dailyStats.reduce(
    (acc, day) => ({
      totalCalls: acc.totalCalls + day.totalCalls,
      totalCost: acc.totalCost + day.cost.total,
      totalTokens: acc.totalTokens + day.tokens.total,
      reasoningCalls: acc.reasoningCalls + day.byReasoning.withReasoning.calls,
      reasoningCost: acc.reasoningCost + day.byReasoning.withReasoning.cost.total
    }),
    {
      totalCalls: 0,
      totalCost: 0,
      totalTokens: 0,
      reasoningCalls: 0,
      reasoningCost: 0
    }
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            📊 AI 用量详细统计
          </h2>
          <div className="flex items-center gap-3">
            {/* 时间范围切换 */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setPeriod('30days')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  period === '30days'
                    ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                最近 30 天
              </button>
              <button
                onClick={() => setPeriod('all')}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  period === 'all'
                    ? 'bg-white dark:bg-gray-600 text-indigo-600 dark:text-indigo-400 shadow'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                所有时间
              </button>
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 汇总卡片 */}
        <div className="grid grid-cols-4 gap-3 p-4 bg-gray-50 dark:bg-gray-900">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">总调用</div>
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {summary.totalCalls}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">总成本</div>
            <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
              ¥{summary.totalCost.toFixed(4)}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">推理调用</div>
            <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
              {summary.reasoningCalls}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {summary.totalCalls > 0 ? ((summary.reasoningCalls / summary.totalCalls) * 100).toFixed(1) : 0}%
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">推理成本</div>
            <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
              ¥{summary.reasoningCost.toFixed(4)}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {summary.totalCost > 0 ? ((summary.reasoningCost / summary.totalCost) * 100).toFixed(1) : 0}%
            </div>
          </div>
        </div>

        {/* 表格 */}
        <div className="flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500 dark:text-gray-400">加载中...</div>
            </div>
          ) : dailyStats.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-gray-500 dark:text-gray-400">暂无数据</div>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left p-2 font-medium text-gray-700 dark:text-gray-300">日期</th>
                  <th className="text-right p-2 font-medium text-gray-700 dark:text-gray-300">总调用</th>
                  <th className="text-right p-2 font-medium text-gray-700 dark:text-gray-300">成功率</th>
                  <th className="text-right p-2 font-medium text-gray-700 dark:text-gray-300">总成本</th>
                  <th className="text-right p-2 font-medium text-gray-700 dark:text-gray-300">推理调用</th>
                  <th className="text-right p-2 font-medium text-gray-700 dark:text-gray-300">非推理调用</th>
                  <th className="text-right p-2 font-medium text-gray-700 dark:text-gray-300">推理成本</th>
                  <th className="text-right p-2 font-medium text-gray-700 dark:text-gray-300">非推理成本</th>
                </tr>
              </thead>
              <tbody>
                {dailyStats.map((day) => {
                  const successRate = day.totalCalls > 0 
                    ? ((day.successfulCalls / day.totalCalls) * 100).toFixed(1)
                    : '0.0'

                  return (
                    <tr
                      key={day.date}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50"
                    >
                      <td className="p-2 text-gray-900 dark:text-gray-100 font-medium">
                        {day.date}
                      </td>
                      <td className="p-2 text-right text-gray-700 dark:text-gray-300">
                        {day.totalCalls}
                      </td>
                      <td className="p-2 text-right">
                        <span className={`${
                          parseFloat(successRate) >= 95
                            ? 'text-green-600 dark:text-green-400'
                            : parseFloat(successRate) >= 80
                            ? 'text-yellow-600 dark:text-yellow-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}>
                          {successRate}%
                        </span>
                      </td>
                      <td className="p-2 text-right text-indigo-600 dark:text-indigo-400 font-medium">
                        ¥{day.cost.total.toFixed(4)}
                      </td>
                      <td className="p-2 text-right text-orange-600 dark:text-orange-400">
                        {day.byReasoning.withReasoning.calls}
                      </td>
                      <td className="p-2 text-right text-green-600 dark:text-green-400">
                        {day.byReasoning.withoutReasoning.calls}
                      </td>
                      <td className="p-2 text-right text-orange-600 dark:text-orange-400">
                        ¥{day.byReasoning.withReasoning.cost.total.toFixed(4)}
                      </td>
                      <td className="p-2 text-right text-green-600 dark:text-green-400">
                        ¥{day.byReasoning.withoutReasoning.cost.total.toFixed(4)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* 底部提示 */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
            💡 提示：推理模式（如 DeepSeek R1）延迟和成本通常较高，但能提供更准确的分析结果
          </div>
        </div>
      </div>
    </div>
  )
}
