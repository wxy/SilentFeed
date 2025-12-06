/**
 * AI 用量柱形图组件
 * 
 * 横向时间轴布局，每个日期/月份下方显示三个垂直柱子：
 * - Token 用量柱（叠加显示推理/非推理）
 * - 调用次数柱（叠加显示推理/非推理）
 * - 费用柱（叠加显示推理/非推理）
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
    (d.byReasoning.withReasoning.tokens.total || 0) + (d.byReasoning.withoutReasoning.tokens.total || 0)
  ))
  const maxCalls = Math.max(...aggregatedData.map(d => 
    (d.byReasoning.withReasoning.calls || 0) + (d.byReasoning.withoutReasoning.calls || 0)
  ))
  const maxCost = Math.max(...aggregatedData.map(d => 
    (d.byReasoning.withReasoning.cost.total || 0) + (d.byReasoning.withoutReasoning.cost.total || 0)
  ))

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* 横向时间轴布局 */}
        <div className="flex gap-4 pb-4">
          {aggregatedData.map((item) => {
            const totalTokens = (item.byReasoning.withReasoning.tokens.total || 0) + (item.byReasoning.withoutReasoning.tokens.total || 0)
            const totalCalls = (item.byReasoning.withReasoning.calls || 0) + (item.byReasoning.withoutReasoning.calls || 0)
            const totalCost = (item.byReasoning.withReasoning.cost.total || 0) + (item.byReasoning.withoutReasoning.cost.total || 0)

            return (
              <div key={item.date} className="flex flex-col items-center min-w-[120px]">
                {/* 日期刻度 */}
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-3 text-center whitespace-nowrap">
                  {formatDate(item.date, mode)}
                </div>

                {/* 三个垂直柱子 */}
                <div className="flex gap-2 items-end h-32">
                  {/* Token 用量柱 */}
                  <div className="flex flex-col items-center">
                    <div className="relative w-8 h-28 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                      {/* 非推理部分（底部，绿色） */}
                      {item.byReasoning.withoutReasoning.tokens.total > 0 && (
                        <div 
                          className="absolute bottom-0 left-0 right-0 bg-green-500 dark:bg-green-600 transition-all"
                          style={{ 
                            height: `${((item.byReasoning.withoutReasoning.tokens.total || 0) / maxTokens) * 100}%` 
                          }}
                          title={`非推理: ${(item.byReasoning.withoutReasoning.tokens.total / 1000).toFixed(1)}K`}
                        />
                      )}
                      {/* 推理部分（上面，橙色） */}
                      {item.byReasoning.withReasoning.tokens.total > 0 && (
                        <div 
                          className="absolute left-0 right-0 bg-orange-500 dark:bg-orange-600 transition-all"
                          style={{ 
                            bottom: `${((item.byReasoning.withoutReasoning.tokens.total || 0) / maxTokens) * 100}%`,
                            height: `${((item.byReasoning.withReasoning.tokens.total || 0) / maxTokens) * 100}%` 
                          }}
                          title={`推理: ${(item.byReasoning.withReasoning.tokens.total / 1000).toFixed(1)}K`}
                        />
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                      {(totalTokens / 1000).toFixed(1)}K
                    </div>
                  </div>

                  {/* 调用次数柱 */}
                  <div className="flex flex-col items-center">
                    <div className="relative w-8 h-28 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                      {/* 非推理部分（底部，蓝色） */}
                      {item.byReasoning.withoutReasoning.calls > 0 && (
                        <div 
                          className="absolute bottom-0 left-0 right-0 bg-blue-500 dark:bg-blue-600 transition-all"
                          style={{ 
                            height: `${((item.byReasoning.withoutReasoning.calls || 0) / maxCalls) * 100}%` 
                          }}
                          title={`非推理: ${item.byReasoning.withoutReasoning.calls}次`}
                        />
                      )}
                      {/* 推理部分（上面，紫色） */}
                      {item.byReasoning.withReasoning.calls > 0 && (
                        <div 
                          className="absolute left-0 right-0 bg-purple-500 dark:bg-purple-600 transition-all"
                          style={{ 
                            bottom: `${((item.byReasoning.withoutReasoning.calls || 0) / maxCalls) * 100}%`,
                            height: `${((item.byReasoning.withReasoning.calls || 0) / maxCalls) * 100}%` 
                          }}
                          title={`推理: ${item.byReasoning.withReasoning.calls}次`}
                        />
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                      {totalCalls}次
                    </div>
                  </div>

                  {/* 费用柱 */}
                  <div className="flex flex-col items-center">
                    <div className="relative w-8 h-28 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden border border-gray-200 dark:border-gray-700">
                      {/* 非推理部分（底部，靛蓝） */}
                      {item.byReasoning.withoutReasoning.cost.total > 0 && (
                        <div 
                          className="absolute bottom-0 left-0 right-0 bg-indigo-500 dark:bg-indigo-600 transition-all"
                          style={{ 
                            height: `${((item.byReasoning.withoutReasoning.cost.total || 0) / maxCost) * 100}%` 
                          }}
                          title={`非推理: ¥${item.byReasoning.withoutReasoning.cost.total.toFixed(4)}`}
                        />
                      )}
                      {/* 推理部分（上面，琥珀） */}
                      {item.byReasoning.withReasoning.cost.total > 0 && (
                        <div 
                          className="absolute left-0 right-0 bg-amber-500 dark:bg-amber-600 transition-all"
                          style={{ 
                            bottom: `${((item.byReasoning.withoutReasoning.cost.total || 0) / maxCost) * 100}%`,
                            height: `${((item.byReasoning.withReasoning.cost.total || 0) / maxCost) * 100}%` 
                          }}
                          title={`推理: ¥${item.byReasoning.withReasoning.cost.total.toFixed(4)}`}
                        />
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 whitespace-nowrap">
                      ¥{totalCost.toFixed(3)}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* 图例说明 */}
        <div className="flex items-center justify-center gap-8 pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">指标：</div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gradient-to-b from-orange-500 to-green-500 rounded"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">Token</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gradient-to-b from-purple-500 to-blue-500 rounded"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">调用</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-gradient-to-b from-amber-500 to-indigo-500 rounded"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">费用</span>
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 ml-4">|</div>
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400">模式：</div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-orange-500 rounded"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">推理</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span className="text-xs text-gray-600 dark:text-gray-400">非推理</span>
          </div>
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
        failedCalls: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost: { input: 0, output: 0, total: 0 },
        byReasoning: {
          withReasoning: {
            calls: 0,
            tokens: { input: 0, output: 0, total: 0 },
            cost: { input: 0, output: 0, total: 0 }
          },
          withoutReasoning: {
            calls: 0,
            tokens: { input: 0, output: 0, total: 0 },
            cost: { input: 0, output: 0, total: 0 }
          }
        },
        byProvider: {},
        byPurpose: {} as any  // 聚合时不需要完整的 Record
      })
    }

    const monthData = monthlyMap.get(monthKey)!
    monthData.totalCalls += item.totalCalls
    monthData.successfulCalls += item.successfulCalls
    monthData.failedCalls += item.failedCalls
    monthData.tokens.input += item.tokens.input
    monthData.tokens.output += item.tokens.output
    monthData.tokens.total += item.tokens.total
    monthData.cost.input += item.cost.input
    monthData.cost.output += item.cost.output
    monthData.cost.total += item.cost.total

    // 聚合推理数据
    monthData.byReasoning.withReasoning.calls += item.byReasoning.withReasoning.calls
    monthData.byReasoning.withReasoning.tokens.input += item.byReasoning.withReasoning.tokens.input
    monthData.byReasoning.withReasoning.tokens.output += item.byReasoning.withReasoning.tokens.output
    monthData.byReasoning.withReasoning.tokens.total += item.byReasoning.withReasoning.tokens.total
    monthData.byReasoning.withReasoning.cost.input += item.byReasoning.withReasoning.cost.input
    monthData.byReasoning.withReasoning.cost.output += item.byReasoning.withReasoning.cost.output
    monthData.byReasoning.withReasoning.cost.total += item.byReasoning.withReasoning.cost.total

    // 聚合非推理数据
    monthData.byReasoning.withoutReasoning.calls += item.byReasoning.withoutReasoning.calls
    monthData.byReasoning.withoutReasoning.tokens.input += item.byReasoning.withoutReasoning.tokens.input
    monthData.byReasoning.withoutReasoning.tokens.output += item.byReasoning.withoutReasoning.tokens.output
    monthData.byReasoning.withoutReasoning.tokens.total += item.byReasoning.withoutReasoning.tokens.total
    monthData.byReasoning.withoutReasoning.cost.input += item.byReasoning.withoutReasoning.cost.input
    monthData.byReasoning.withoutReasoning.cost.output += item.byReasoning.withoutReasoning.cost.output
    monthData.byReasoning.withoutReasoning.cost.total += item.byReasoning.withoutReasoning.cost.total
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
