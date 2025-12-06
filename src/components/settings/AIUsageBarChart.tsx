/**
 * AI 用量柱形图组件
 * 
 * 展示每日或每月的 AI 用量统计，包括：
 * - Token 用量（叠加显示推理/非推理）
 * - 调用次数（叠加显示推理/非推理）
 * - 费用（叠加显示推理/非推理）
 */

import React from "react"
import type { DailyUsageStats } from "@/types/ai-usage"

interface AIUsageBarChartProps {
  data: DailyUsageStats[]
  mode: 'daily' | 'monthly'
}

export function AIUsageBarChart({ data, mode }: AIUsageBarChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-center text-gray-500 dark:text-gray-400 py-8">
        暂无数据
      </div>
    )
  }

  // 聚合数据（每日 or 每月）
  const aggregatedData = mode === 'monthly' 
    ? aggregateByMonth(data) 
    : data

  // 计算最大值（用于标准化柱子高度）
  const maxTokens = Math.max(...aggregatedData.map(d => 
    (d.reasoning?.tokens.total || 0) + (d.nonReasoning?.tokens.total || 0)
  ))
  const maxCalls = Math.max(...aggregatedData.map(d => 
    (d.reasoning?.calls || 0) + (d.nonReasoning?.calls || 0)
  ))
  const maxCost = Math.max(...aggregatedData.map(d => 
    (d.reasoning?.cost.total || 0) + (d.nonReasoning?.cost.total || 0)
  ))

  return (
    <div className="space-y-6">
      {aggregatedData.map((item) => {
        const totalTokens = (item.reasoning?.tokens.total || 0) + (item.nonReasoning?.tokens.total || 0)
        const totalCalls = (item.reasoning?.calls || 0) + (item.nonReasoning?.calls || 0)
        const totalCost = (item.reasoning?.cost.total || 0) + (item.nonReasoning?.cost.total || 0)

        const reasoningTokensPercent = totalTokens > 0 
          ? ((item.reasoning?.tokens.total || 0) / totalTokens) * 100 
          : 0
        const reasoningCallsPercent = totalCalls > 0 
          ? ((item.reasoning?.calls || 0) / totalCalls) * 100 
          : 0
        const reasoningCostPercent = totalCost > 0 
          ? ((item.reasoning?.cost.total || 0) / totalCost) * 100 
          : 0

        return (
          <div key={item.date} className="border-b border-gray-200 dark:border-gray-700 pb-4 last:border-0">
            {/* 日期标题 */}
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {formatDate(item.date, mode)}
            </div>

            <div className="grid grid-cols-3 gap-4">
              {/* Token 用量柱 */}
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex justify-between">
                  <span>Token</span>
                  <span className="font-semibold">{(totalTokens / 1000).toFixed(1)}K</span>
                </div>
                <div className="relative h-24 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                  {/* 非推理部分（底部，绿色） */}
                  {item.nonReasoning && item.nonReasoning.tokens.total > 0 && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 bg-green-500 dark:bg-green-600 flex items-end justify-center pb-1"
                      style={{ 
                        height: `${((item.nonReasoning.tokens.total || 0) / maxTokens) * 100}%` 
                      }}
                      title={`非推理: ${(item.nonReasoning.tokens.total / 1000).toFixed(1)}K`}
                    >
                      <span className="text-[10px] text-white">
                        ⚡{(item.nonReasoning.tokens.total / 1000).toFixed(1)}K
                      </span>
                    </div>
                  )}
                  {/* 推理部分（叠加在上面，橙色） */}
                  {item.reasoning && item.reasoning.tokens.total > 0 && (
                    <div 
                      className="absolute left-0 right-0 bg-orange-500 dark:bg-orange-600 flex items-end justify-center pb-1"
                      style={{ 
                        bottom: `${((item.nonReasoning?.tokens.total || 0) / maxTokens) * 100}%`,
                        height: `${((item.reasoning.tokens.total || 0) / maxTokens) * 100}%` 
                      }}
                      title={`推理: ${(item.reasoning.tokens.total / 1000).toFixed(1)}K`}
                    >
                      <span className="text-[10px] text-white">
                        🔬{(item.reasoning.tokens.total / 1000).toFixed(1)}K
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 调用次数柱 */}
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex justify-between">
                  <span>调用</span>
                  <span className="font-semibold">{totalCalls}次</span>
                </div>
                <div className="relative h-24 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                  {/* 非推理部分 */}
                  {item.nonReasoning && item.nonReasoning.calls > 0 && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 bg-blue-500 dark:bg-blue-600 flex items-end justify-center pb-1"
                      style={{ 
                        height: `${((item.nonReasoning.calls || 0) / maxCalls) * 100}%` 
                      }}
                      title={`非推理: ${item.nonReasoning.calls}次`}
                    >
                      <span className="text-[10px] text-white">
                        ⚡{item.nonReasoning.calls}
                      </span>
                    </div>
                  )}
                  {/* 推理部分 */}
                  {item.reasoning && item.reasoning.calls > 0 && (
                    <div 
                      className="absolute left-0 right-0 bg-purple-500 dark:bg-purple-600 flex items-end justify-center pb-1"
                      style={{ 
                        bottom: `${((item.nonReasoning?.calls || 0) / maxCalls) * 100}%`,
                        height: `${((item.reasoning.calls || 0) / maxCalls) * 100}%` 
                      }}
                      title={`推理: ${item.reasoning.calls}次`}
                    >
                      <span className="text-[10px] text-white">
                        🔬{item.reasoning.calls}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* 费用柱 */}
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex justify-between">
                  <span>费用</span>
                  <span className="font-semibold">¥{totalCost.toFixed(4)}</span>
                </div>
                <div className="relative h-24 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                  {/* 非推理部分 */}
                  {item.nonReasoning && item.nonReasoning.cost.total > 0 && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 bg-indigo-500 dark:bg-indigo-600 flex items-end justify-center pb-1"
                      style={{ 
                        height: `${((item.nonReasoning.cost.total || 0) / maxCost) * 100}%` 
                      }}
                      title={`非推理: ¥${item.nonReasoning.cost.total.toFixed(4)}`}
                    >
                      <span className="text-[10px] text-white">
                        ⚡¥{item.nonReasoning.cost.total.toFixed(3)}
                      </span>
                    </div>
                  )}
                  {/* 推理部分 */}
                  {item.reasoning && item.reasoning.cost.total > 0 && (
                    <div 
                      className="absolute left-0 right-0 bg-amber-500 dark:bg-amber-600 flex items-end justify-center pb-1"
                      style={{ 
                        bottom: `${((item.nonReasoning?.cost.total || 0) / maxCost) * 100}%`,
                        height: `${((item.reasoning.cost.total || 0) / maxCost) * 100}%` 
                      }}
                      title={`推理: ¥${item.reasoning.cost.total.toFixed(4)}`}
                    >
                      <span className="text-[10px] text-white">
                        🔬¥{item.reasoning.cost.total.toFixed(3)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* 图例 */}
      <div className="flex items-center justify-center gap-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-orange-500 rounded"></div>
          <span className="text-xs text-gray-600 dark:text-gray-400">🔬 推理模式</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded"></div>
          <span className="text-xs text-gray-600 dark:text-gray-400">⚡ 非推理模式</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 按月聚合数据
 */
function aggregateByMonth(dailyData: DailyUsageStats[]): DailyUsageStats[] {
  const monthlyMap = new Map<string, DailyUsageStats>()

  dailyData.forEach((item) => {
    const monthKey = item.date.substring(0, 7) // 取 YYYY-MM

    if (!monthlyMap.has(monthKey)) {
      monthlyMap.set(monthKey, {
        date: monthKey,
        totalCalls: 0,
        successfulCalls: 0,
        reasoning: item.reasoning ? {
          calls: 0,
          tokens: { input: 0, output: 0, total: 0 },
          cost: { input: 0, output: 0, total: 0 },
          avgLatency: 0
        } : undefined,
        nonReasoning: item.nonReasoning ? {
          calls: 0,
          tokens: { input: 0, output: 0, total: 0 },
          cost: { input: 0, output: 0, total: 0 },
          avgLatency: 0
        } : undefined,
        byProvider: {},
        byPurpose: {}
      })
    }

    const monthData = monthlyMap.get(monthKey)!
    monthData.totalCalls += item.totalCalls
    monthData.successfulCalls += item.successfulCalls

    // 聚合推理数据
    if (item.reasoning && monthData.reasoning) {
      monthData.reasoning.calls += item.reasoning.calls
      monthData.reasoning.tokens.input += item.reasoning.tokens.input
      monthData.reasoning.tokens.output += item.reasoning.tokens.output
      monthData.reasoning.tokens.total += item.reasoning.tokens.total
      monthData.reasoning.cost.input += item.reasoning.cost.input
      monthData.reasoning.cost.output += item.reasoning.cost.output
      monthData.reasoning.cost.total += item.reasoning.cost.total
      monthData.reasoning.avgLatency = (monthData.reasoning.avgLatency + item.reasoning.avgLatency) / 2
    }

    // 聚合非推理数据
    if (item.nonReasoning && monthData.nonReasoning) {
      monthData.nonReasoning.calls += item.nonReasoning.calls
      monthData.nonReasoning.tokens.input += item.nonReasoning.tokens.input
      monthData.nonReasoning.tokens.output += item.nonReasoning.tokens.output
      monthData.nonReasoning.tokens.total += item.nonReasoning.tokens.total
      monthData.nonReasoning.cost.input += item.nonReasoning.cost.input
      monthData.nonReasoning.cost.output += item.nonReasoning.cost.output
      monthData.nonReasoning.cost.total += item.nonReasoning.cost.total
      monthData.nonReasoning.avgLatency = (monthData.nonReasoning.avgLatency + item.nonReasoning.avgLatency) / 2
    }
  })

  return Array.from(monthlyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 格式化日期显示
 */
function formatDate(date: string, mode: 'daily' | 'monthly'): string {
  if (mode === 'monthly') {
    const [year, month] = date.split('-')
    return `${year}年${month}月`
  }
  
  const [year, month, day] = date.split('-')
  return `${month}月${day}日`
}
