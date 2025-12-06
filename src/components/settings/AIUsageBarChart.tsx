/**
 * AI 用量柱形图组件
 * 
 * 专业图表布局：
 * - 日期轴上方：Token 用量 + 调用次数（两个柱形图）
 * - 日期轴下方：费用（一个柱形图）
 * - 垂直坐标轴显示数值刻度
 * - 水平辅助线帮助读数
 * - 横向至少显示 30 天数据
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

  // 计算最大值和刻度
  const maxTokens = Math.max(...aggregatedData.map(d => 
    (d.byReasoning.withReasoning.tokens.total || 0) + (d.byReasoning.withoutReasoning.tokens.total || 0)
  ))
  const maxCalls = Math.max(...aggregatedData.map(d => 
    (d.byReasoning.withReasoning.calls || 0) + (d.byReasoning.withoutReasoning.calls || 0)
  ))
  const maxCost = Math.max(...aggregatedData.map(d => 
    (d.byReasoning.withReasoning.cost.total || 0) + (d.byReasoning.withoutReasoning.cost.total || 0)
  ))

  // 生成 Y 轴刻度（4-5 个刻度）
  const tokenTicks = generateTicks(maxTokens, 4)
  const callTicks = generateTicks(maxCalls, 4)
  const costTicks = generateTicks(maxCost, 4)

  // 计算柱子宽度（根据数据量动态调整）
  const barWidth = Math.max(4, Math.min(12, 360 / aggregatedData.length))

  return (
    <div className="space-y-6">
      {/* 上半部分：Token 用量 + 调用次数 */}
      <div className="relative">
        <div className="flex gap-8">
          {/* Token 用量图表 */}
          <div className="flex-1">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              Token 用量 (K)
            </h4>
            <div className="flex">
              {/* Y 轴刻度 */}
              <div className="flex flex-col-reverse justify-between text-[10px] text-gray-400 pr-2 h-32 w-10 text-right">
                {tokenTicks.map((tick, i) => (
                  <div key={i}>{(tick / 1000).toFixed(0)}K</div>
                ))}
              </div>
              
              {/* 图表区域 */}
              <div className="flex-1 relative h-32 border-l border-b border-gray-300 dark:border-gray-600">
                {/* 水平辅助线 */}
                {tokenTicks.slice(1).map((tick, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700"
                    style={{ bottom: `${((tick / tokenTicks[tokenTicks.length - 1]) * 100)}%` }}
                  />
                ))}
                
                {/* 柱状图 */}
                <div className="absolute bottom-0 left-0 right-0 flex items-end gap-px overflow-x-auto pb-0.5">
                  {aggregatedData.map((item) => {
                    const totalTokens = (item.byReasoning.withReasoning.tokens.total || 0) + (item.byReasoning.withoutReasoning.tokens.total || 0)
                    const reasoningHeight = ((item.byReasoning.withReasoning.tokens.total || 0) / tokenTicks[tokenTicks.length - 1]) * 100
                    const nonReasoningHeight = ((item.byReasoning.withoutReasoning.tokens.total || 0) / tokenTicks[tokenTicks.length - 1]) * 100
                    
                    return (
                      <div
                        key={item.date}
                        className="relative group"
                        style={{ width: `${barWidth}px`, minWidth: `${barWidth}px` }}
                        title={`${formatDate(item.date, mode)}\n推理: ${(item.byReasoning.withReasoning.tokens.total / 1000).toFixed(1)}K\n非推理: ${(item.byReasoning.withoutReasoning.tokens.total / 1000).toFixed(1)}K\n总计: ${(totalTokens / 1000).toFixed(1)}K`}
                      >
                        {/* 非推理部分（底部，绿色） */}
                        {item.byReasoning.withoutReasoning.tokens.total > 0 && (
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-green-500 dark:bg-green-600 hover:bg-green-600 dark:hover:bg-green-500 transition-colors"
                            style={{ height: `${nonReasoningHeight}%` }}
                          />
                        )}
                        {/* 推理部分（上面，橙色） */}
                        {item.byReasoning.withReasoning.tokens.total > 0 && (
                          <div
                            className="absolute left-0 right-0 bg-orange-500 dark:bg-orange-600 hover:bg-orange-600 dark:hover:bg-orange-500 transition-colors"
                            style={{ 
                              bottom: `${nonReasoningHeight}%`,
                              height: `${reasoningHeight}%` 
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* 调用次数图表 */}
          <div className="flex-1">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              调用次数
            </h4>
            <div className="flex">
              {/* Y 轴刻度 */}
              <div className="flex flex-col-reverse justify-between text-[10px] text-gray-400 pr-2 h-32 w-10 text-right">
                {callTicks.map((tick, i) => (
                  <div key={i}>{tick}</div>
                ))}
              </div>
              
              {/* 图表区域 */}
              <div className="flex-1 relative h-32 border-l border-b border-gray-300 dark:border-gray-600">
                {/* 水平辅助线 */}
                {callTicks.slice(1).map((tick, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700"
                    style={{ bottom: `${((tick / callTicks[callTicks.length - 1]) * 100)}%` }}
                  />
                ))}
                
                {/* 柱状图 */}
                <div className="absolute bottom-0 left-0 right-0 flex items-end gap-px overflow-x-auto pb-0.5">
                  {aggregatedData.map((item) => {
                    const totalCalls = (item.byReasoning.withReasoning.calls || 0) + (item.byReasoning.withoutReasoning.calls || 0)
                    const reasoningHeight = ((item.byReasoning.withReasoning.calls || 0) / callTicks[callTicks.length - 1]) * 100
                    const nonReasoningHeight = ((item.byReasoning.withoutReasoning.calls || 0) / callTicks[callTicks.length - 1]) * 100
                    
                    return (
                      <div
                        key={item.date}
                        className="relative group"
                        style={{ width: `${barWidth}px`, minWidth: `${barWidth}px` }}
                        title={`${formatDate(item.date, mode)}\n推理: ${item.byReasoning.withReasoning.calls}次\n非推理: ${item.byReasoning.withoutReasoning.calls}次\n总计: ${totalCalls}次`}
                      >
                        {/* 非推理部分（底部，蓝色） */}
                        {item.byReasoning.withoutReasoning.calls > 0 && (
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-500 transition-colors"
                            style={{ height: `${nonReasoningHeight}%` }}
                          />
                        )}
                        {/* 推理部分（上面，紫色） */}
                        {item.byReasoning.withReasoning.calls > 0 && (
                          <div
                            className="absolute left-0 right-0 bg-purple-500 dark:bg-purple-600 hover:bg-purple-600 dark:hover:bg-purple-500 transition-colors"
                            style={{ 
                              bottom: `${nonReasoningHeight}%`,
                              height: `${reasoningHeight}%` 
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 日期轴 */}
      <div className="flex">
        <div className="w-10"></div> {/* Y 轴占位 */}
        <div className="flex-1 overflow-x-auto">
          <div className="flex items-center gap-px min-w-full">
            {aggregatedData.map((item, index) => {
              // 每隔 N 天显示一次日期标签（避免拥挤）
              const showLabel = mode === 'daily' 
                ? index % Math.max(1, Math.floor(aggregatedData.length / 10)) === 0 || index === aggregatedData.length - 1
                : true
              
              return (
                <div
                  key={item.date}
                  className="text-center text-[9px] text-gray-500 dark:text-gray-400"
                  style={{ width: `${barWidth}px`, minWidth: `${barWidth}px` }}
                >
                  {showLabel ? formatDateShort(item.date, mode) : ''}
                </div>
              )
            })}
          </div>
        </div>
        <div className="w-10"></div> {/* 右侧占位保持对齐 */}
      </div>

      {/* 下半部分：费用 */}
      <div className="relative">
        <div className="flex gap-8">
          {/* 费用图表（占满宽度） */}
          <div className="flex-1">
            <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              费用 (¥)
            </h4>
            <div className="flex">
              {/* Y 轴刻度 */}
              <div className="flex flex-col-reverse justify-between text-[10px] text-gray-400 pr-2 h-32 w-10 text-right">
                {costTicks.map((tick, i) => (
                  <div key={i}>¥{tick.toFixed(3)}</div>
                ))}
              </div>
              
              {/* 图表区域 */}
              <div className="flex-1 relative h-32 border-l border-b border-gray-300 dark:border-gray-600">
                {/* 水平辅助线 */}
                {costTicks.slice(1).map((tick, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700"
                    style={{ bottom: `${((tick / costTicks[costTicks.length - 1]) * 100)}%` }}
                  />
                ))}
                
                {/* 柱状图 */}
                <div className="absolute bottom-0 left-0 right-0 flex items-end gap-px overflow-x-auto pb-0.5">
                  {aggregatedData.map((item) => {
                    const totalCost = (item.byReasoning.withReasoning.cost.total || 0) + (item.byReasoning.withoutReasoning.cost.total || 0)
                    const reasoningHeight = ((item.byReasoning.withReasoning.cost.total || 0) / costTicks[costTicks.length - 1]) * 100
                    const nonReasoningHeight = ((item.byReasoning.withoutReasoning.cost.total || 0) / costTicks[costTicks.length - 1]) * 100
                    
                    return (
                      <div
                        key={item.date}
                        className="relative group"
                        style={{ width: `${barWidth}px`, minWidth: `${barWidth}px` }}
                        title={`${formatDate(item.date, mode)}\n推理: ¥${item.byReasoning.withReasoning.cost.total.toFixed(4)}\n非推理: ¥${item.byReasoning.withoutReasoning.cost.total.toFixed(4)}\n总计: ¥${totalCost.toFixed(4)}`}
                      >
                        {/* 非推理部分（底部，靛蓝） */}
                        {item.byReasoning.withoutReasoning.cost.total > 0 && (
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-indigo-500 dark:bg-indigo-600 hover:bg-indigo-600 dark:hover:bg-indigo-500 transition-colors"
                            style={{ height: `${nonReasoningHeight}%` }}
                          />
                        )}
                        {/* 推理部分（上面，琥珀） */}
                        {item.byReasoning.withReasoning.cost.total > 0 && (
                          <div
                            className="absolute left-0 right-0 bg-amber-500 dark:bg-amber-600 hover:bg-amber-600 dark:hover:bg-amber-500 transition-colors"
                            style={{ 
                              bottom: `${nonReasoningHeight}%`,
                              height: `${reasoningHeight}%` 
                            }}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 图例说明 */}
      <div className="flex items-center justify-center gap-8 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-orange-500 rounded"></div>
          <span className="text-xs text-gray-600 dark:text-gray-400">推理模式</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded"></div>
          <span className="text-xs text-gray-600 dark:text-gray-400">非推理模式</span>
        </div>
        <div className="text-xs text-gray-400">（鼠标悬停查看详情）</div>
      </div>
    </div>
  )
}

/**
 * 生成 Y 轴刻度
 * @param max 最大值
 * @param count 刻度数量
 */
function generateTicks(max: number, count: number): number[] {
  if (max === 0) return [0, 1, 2, 3, 4]
  
  // 找到合适的刻度间隔
  const rawInterval = max / count
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)))
  const normalized = rawInterval / magnitude
  
  // 选择最接近的标准间隔 (1, 2, 5)
  let interval: number
  if (normalized <= 1.5) {
    interval = 1 * magnitude
  } else if (normalized <= 3) {
    interval = 2 * magnitude
  } else if (normalized <= 7) {
    interval = 5 * magnitude
  } else {
    interval = 10 * magnitude
  }
  
  // 生成刻度
  const ticks: number[] = []
  for (let i = 0; i <= count; i++) {
    ticks.push(interval * i)
  }
  
  return ticks
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
 * 格式化日期显示（完整）
 */
function formatDate(date: string, mode: 'daily' | 'monthly'): string {
  if (mode === 'monthly') {
    const [year, month] = date.split('-')
    return `${year}年${month}月`
  }
  
  const [year, month, day] = date.split('-')
  return `${year}年${month}月${day}日`
}

/**
 * 格式化日期显示（简短，用于 X 轴）
 */
function formatDateShort(date: string, mode: 'daily' | 'monthly'): string {
  if (mode === 'monthly') {
    const [, month] = date.split('-')
    return `${month}月`
  }
  
  const [, month, day] = date.split('-')
  return `${month}/${day}`
}
