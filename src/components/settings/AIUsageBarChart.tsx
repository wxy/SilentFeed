import React from "react"
import { useI18n } from "@/i18n/helpers"
import type { AIUsagePurpose, DailyUsageStats } from "@/types/ai-usage"

interface AIUsageBarChartProps {
  data: DailyUsageStats[]
  mode: "daily" | "monthly"
}

const MIN_BAR_HEIGHT = 2
const BASE_BAR_WIDTH = 12
const BASE_BAR_GAP = 4
const BASE_DATE_GAP = 32
const BASE_PER_DAY_WIDTH = BASE_BAR_WIDTH * 3 + BASE_BAR_GAP * 2
const BASE_DATE_WIDTH = BASE_PER_DAY_WIDTH + BASE_DATE_GAP
const VISIBLE_DAYS = 7

const PURPOSE_KEYS: AIUsagePurpose[] = [
  "analyze-content",
  "recommend-content",
  "generate-profile",
  "translate",
  "test-connection",
  "other"
]

const createPurposeTotals = () => ({
  calls: 0,
  tokens: { input: 0, output: 0, total: 0 },
  cost: { input: 0, output: 0, total: 0 }
})

const createEmptyPurposeRecord = (): DailyUsageStats["byPurpose"] =>
  PURPOSE_KEYS.reduce((acc, key) => {
    acc[key] = createPurposeTotals()
    return acc
  }, {} as DailyUsageStats["byPurpose"])

export function AIUsageBarChart({ data, mode }: AIUsageBarChartProps) {
  const { _ } = useI18n()
  const chartScrollRef = React.useRef<HTMLDivElement>(null)
  const dateScrollRef = React.useRef<HTMLDivElement>(null)
  const renderEmptyState = () => (
    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
      {_("settings.aiUsage.emptyState")}
    </div>
  )

  if (data.length === 0) {
    return renderEmptyState()
  }

  const aggregatedData = mode === "monthly" ? aggregateByMonth(data) : data
  const sortedData = React.useMemo(() => {
    return [...aggregatedData].sort((a, b) => a.date.localeCompare(b.date))
  }, [aggregatedData])

  const maxTokens = Math.max(
    ...aggregatedData.map(
      (d) => (d.byReasoning.withReasoning.tokens.total || 0) + (d.byReasoning.withoutReasoning.tokens.total || 0)
    ),
    0
  )
  const maxCalls = Math.max(
    ...aggregatedData.map(
      (d) => (d.byReasoning.withReasoning.calls || 0) + (d.byReasoning.withoutReasoning.calls || 0)
    ),
    0
  )
  const maxCost = Math.max(
    ...aggregatedData.map(
      (d) => (d.byReasoning.withReasoning.cost.total || 0) + (d.byReasoning.withoutReasoning.cost.total || 0)
    ),
    0
  )

  if (maxTokens === 0 && maxCalls === 0 && maxCost === 0) {
    return renderEmptyState()
  }

  const tokenTicks = generateTicks(maxTokens, 5)
  const callTicks = generateTicks(maxCalls, 5)
  const tokenMaxDenom = tokenTicks[tokenTicks.length - 1] || Math.max(1, maxTokens)
  const callMaxDenom = callTicks[callTicks.length - 1] || Math.max(1, maxCalls)
  const costMaxDenom = Math.max(1, maxCost)

  // 使用固定尺寸，不缩放 - 让外部容器处理滚动
  const barWidth = BASE_BAR_WIDTH
  const barGap = BASE_BAR_GAP
  const dateGap = BASE_DATE_GAP
  const perDayWidth = barWidth * 3 + barGap * 2
  const dateWidth = perDayWidth + dateGap
  const totalContentWidth = sortedData.length * dateWidth
  const latestDateKey = sortedData[sortedData.length - 1]?.date ?? ""
  const tokenAxisLabel = _("settings.aiUsage.tokenAxisLabel")
  const callAxisLabel = _("settings.aiUsage.callAxisLabel")
  const legendLabels = {
    tokenNonReasoning: _("settings.aiUsage.legend.tokenNonReasoning"),
    tokenReasoning: _("settings.aiUsage.legend.tokenReasoning"),
    callsNonReasoning: _("settings.aiUsage.legend.callsNonReasoning"),
    callsReasoning: _("settings.aiUsage.legend.callsReasoning"),
    costNonReasoning: _("settings.aiUsage.legend.costNonReasoning"),
    costReasoning: _("settings.aiUsage.legend.costReasoning")
  }
  const totalLabel = _("settings.aiUsage.labels.total")
  const callUnit = _("settings.aiUsage.units.calls")

  const formatTokenTooltip = (date: string, label: string, value: number, total?: number) => {
    const formattedDate = formatDate(date, mode, _)
    const valueK = (value / 1000).toFixed(1)
    const totalK = typeof total === "number" ? (total / 1000).toFixed(1) : valueK
    // 统一使用带总量的格式
    return _("settings.aiUsage.tooltip.tokenReasoning", {
      date: formattedDate,
      label,
      value: valueK,
      totalLabel,
      total: totalK
    })
  }

  const formatCallTooltip = (date: string, label: string, value: number, total?: number) => {
    const formattedDate = formatDate(date, mode, _)
    const totalValue = typeof total === "number" ? total : value
    // 统一使用带总量的格式
    return _("settings.aiUsage.tooltip.callsReasoning", {
      date: formattedDate,
      label,
      value,
      totalLabel,
      total: totalValue,
      unit: callUnit
    })
  }

  const formatCostTooltip = (
    date: string,
    label: string,
    value: number,
    total?: number,
    currencies?: { CNY?: number; USD?: number }
  ) => {
    const formattedDate = formatDate(date, mode, _)
    const formattedValue = value.toFixed(4)
    const totalValue = typeof total === "number" ? total : value
    // 统一使用带总量的格式
    const base = _("settings.aiUsage.tooltip.costReasoning", {
      date: formattedDate,
      label,
      value: formattedValue,
      totalLabel,
      total: totalValue.toFixed(4)
    })
    // 附加币种费用详情（隐藏为 0 的币种）
    const usd = currencies?.USD ?? 0
    const cny = currencies?.CNY ?? 0
    const parts: string[] = []
    if (usd > 0) parts.push(`USD: $${usd.toFixed(4)}`)
    if (cny > 0) parts.push(`CNY: ¥${cny.toFixed(4)}`)
    return parts.length > 0 ? `${base} (${parts.join(', ')})` : base
  }

  // 滚动到最右侧（显示最新数据）
  React.useEffect(() => {
    const containers = [chartScrollRef.current, dateScrollRef.current]
    containers.forEach((container) => {
      if (!container) {
        return
      }
      container.scrollLeft = Math.max(0, container.scrollWidth - container.clientWidth)
    })
  }, [latestDateKey, sortedData.length])

  const syncScroll = (source: "chart" | "date") => (event: React.UIEvent<HTMLDivElement>) => {
    const partner = source === "chart" ? dateScrollRef.current : chartScrollRef.current
    if (!partner) {
      return
    }
    if (Math.abs(partner.scrollLeft - event.currentTarget.scrollLeft) > 1) {
      partner.scrollLeft = event.currentTarget.scrollLeft
    }
  }

  const heightPct = (value: number, max: number) => {
    if (value <= 0 || max <= 0) {
      return 0
    }
    const pct = (value / max) * 100
    return Math.min(100, Math.max(MIN_BAR_HEIGHT, pct))
  }

  return (
    <div className="space-y-3 w-full max-w-full overflow-hidden">
      <div className="relative w-full">
        <div className="flex w-full">
          <div className="relative text-[10px] text-gray-500 dark:text-gray-400 pr-2 h-40 w-12 shrink-0 text-right">
            {tokenTicks.map((tick) => (
              <div
                key={tick}
                className="absolute inset-x-0 flex items-end justify-end leading-none"
                style={{ bottom: `${tokenMaxDenom === 0 ? 0 : (tick / tokenMaxDenom) * 100}%` }}
              >
                <span>{(tick / 1000).toFixed(1)}K</span>
              </div>
            ))}
          </div>

          <div
            className="relative h-40 border-l border-r border-b border-gray-300 dark:border-gray-600 flex-1 min-w-0 overflow-hidden"
          >
            {tokenTicks
              .filter((tick) => tick > 0)
              .map((tick) => (
                <div
                  key={`grid-${tick}`}
                  className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700"
                  style={{ bottom: `${tokenMaxDenom === 0 ? 0 : (tick / tokenMaxDenom) * 100}%` }}
                />
              ))}

            <div className="absolute bottom-0 left-0 right-0 h-full">
              <div
                ref={chartScrollRef}
                data-testid="ai-usage-bars-scroll"
                className="h-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                style={{
                  scrollbarWidth: "none",
                  msOverflowStyle: "none",
                  scrollbarColor: "transparent transparent"
                }}
                onScroll={syncScroll("chart")}
              >
                <div
                  className="flex items-end h-full"
                  style={{ width: `${totalContentWidth}px` }}
                >
                  {sortedData.map((item) => {
                  const usdTotal = (item.byCurrency?.USD?.total ?? 0)
                  const cnyTotal = (item.byCurrency?.CNY?.total ?? 0)
                  const totalTokens =
                    (item.byReasoning.withReasoning.tokens.total || 0) +
                    (item.byReasoning.withoutReasoning.tokens.total || 0)
                  const totalCalls =
                    (item.byReasoning.withReasoning.calls || 0) +
                    (item.byReasoning.withoutReasoning.calls || 0)
                  const totalCost =
                    (item.byReasoning.withReasoning.cost.total || 0) +
                    (item.byReasoning.withoutReasoning.cost.total || 0)

                  return (
                    <div
                      key={item.date}
                      className="flex items-end h-full justify-center"
                      style={{ width: `${dateWidth}px`, minWidth: `${dateWidth}px` }}
                    >
                      <div
                        className="flex items-end h-full"
                        style={{ width: `${perDayWidth}px`, gap: `${barGap}px` }}
                      >
                        <div className="relative flex-1 h-full">
                          {item.byReasoning.withoutReasoning.tokens.total > 0 && (
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-sky-400 dark:bg-sky-500 hover:bg-sky-500 dark:hover:bg-sky-400 transition-colors cursor-pointer"
                              style={{
                                height: `${heightPct(item.byReasoning.withoutReasoning.tokens.total || 0, tokenMaxDenom)}%`
                              }}
                              title={formatTokenTooltip(
                                item.date,
                                legendLabels.tokenNonReasoning,
                                item.byReasoning.withoutReasoning.tokens.total || 0,
                                totalTokens
                              )}
                            />
                          )}
                          {item.byReasoning.withReasoning.tokens.total > 0 && (
                            <div
                              className="absolute left-0 right-0 bg-indigo-600 dark:bg-indigo-700 hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors cursor-pointer rounded-t-sm"
                              style={{
                                bottom: `${heightPct(item.byReasoning.withoutReasoning.tokens.total || 0, tokenMaxDenom)}%`,
                                height: `${heightPct(item.byReasoning.withReasoning.tokens.total || 0, tokenMaxDenom)}%`
                              }}
                              title={formatTokenTooltip(
                                item.date,
                                legendLabels.tokenReasoning,
                                item.byReasoning.withReasoning.tokens.total || 0,
                                totalTokens
                              )}
                            />
                          )}
                        </div>

                        <div className="relative flex-1 h-full">
                          {item.byReasoning.withoutReasoning.calls > 0 && (
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-emerald-400 dark:bg-emerald-500 hover:bg-emerald-500 dark:hover:bg-emerald-400 transition-colors cursor-pointer"
                              style={{ height: `${heightPct(item.byReasoning.withoutReasoning.calls || 0, callMaxDenom)}%` }}
                              title={formatCallTooltip(
                                item.date,
                                legendLabels.callsNonReasoning,
                                item.byReasoning.withoutReasoning.calls || 0,
                                totalCalls
                              )}
                            />
                          )}
                          {item.byReasoning.withReasoning.calls > 0 && (
                            <div
                              className="absolute left-0 right-0 bg-teal-600 dark:bg-teal-700 hover:bg-teal-700 dark:hover:bg-teal-600 transition-colors cursor-pointer rounded-t-sm"
                              style={{
                                bottom: `${heightPct(item.byReasoning.withoutReasoning.calls || 0, callMaxDenom)}%`,
                                height: `${heightPct(item.byReasoning.withReasoning.calls || 0, callMaxDenom)}%`
                              }}
                              title={formatCallTooltip(
                                item.date,
                                legendLabels.callsReasoning,
                                item.byReasoning.withReasoning.calls || 0,
                                totalCalls
                              )}
                            />
                          )}
                        </div>

                        <div className="relative flex-1 h-full">
                          {item.byReasoning.withoutReasoning.cost.total > 0 && (
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-orange-300 dark:bg-orange-400 hover:bg-orange-400 dark:hover:bg-orange-300 transition-colors cursor-pointer"
                              style={{ height: `${heightPct(item.byReasoning.withoutReasoning.cost.total || 0, costMaxDenom)}%` }}
                              title={formatCostTooltip(
                                item.date,
                                legendLabels.costNonReasoning,
                                item.byReasoning.withoutReasoning.cost.total || 0,
                                totalCost,
                                { USD: usdTotal, CNY: cnyTotal }
                              )}
                            />
                          )}
                          {item.byReasoning.withReasoning.cost.total > 0 && (
                            <div
                              className="absolute left-0 right-0 bg-rose-500 dark:bg-rose-600 hover:bg-rose-600 dark:hover:bg-rose-500 transition-colors cursor-pointer rounded-t-sm"
                              style={{
                                bottom: `${heightPct(item.byReasoning.withoutReasoning.cost.total || 0, costMaxDenom)}%`,
                                height: `${heightPct(item.byReasoning.withReasoning.cost.total || 0, costMaxDenom)}%`
                              }}
                              title={formatCostTooltip(
                                item.date,
                                legendLabels.costReasoning,
                                item.byReasoning.withReasoning.cost.total || 0,
                                totalCost,
                                { USD: usdTotal, CNY: cnyTotal }
                              )}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            </div>
          </div>

          <div className="relative text-[10px] text-gray-500 dark:text-gray-400 pl-2 h-40 w-12 shrink-0 text-left">
            {callTicks.map((tick) => (
              <div
                key={`call-${tick}`}
                className="absolute inset-x-0 flex items-end leading-none"
                style={{ bottom: `${callMaxDenom === 0 ? 0 : (tick / callMaxDenom) * 100}%` }}
              >
                <span>{tick}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center w-full">
        <div className="w-12 shrink-0 pr-2 text-[9px] text-right text-gray-500 dark:text-gray-400">{tokenAxisLabel}</div>
        <div
          className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          ref={dateScrollRef}
          onScroll={syncScroll("date")}
          data-testid="ai-usage-dates-scroll"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            scrollbarColor: "transparent transparent"
          }}
        >
          <div
            className="flex items-center"
            style={{ width: `${totalContentWidth}px` }}
          >
            {sortedData.map((item, index) => {
              const showLabel =
                mode === "daily"
                  ? index % Math.max(1, Math.floor(sortedData.length / 12)) === 0 || index === sortedData.length - 1
                  : true

              return (
                <div
                  key={`date-${item.date}`}
                  data-date-value={item.date}
                  className="text-center text-[9px] text-gray-500 dark:text-gray-400"
                  style={{ width: `${dateWidth}px`, minWidth: `${dateWidth}px` }}
                >
                  {showLabel ? formatDateShort(item.date, mode, _) : ""}
                </div>
              )
            })}
          </div>
        </div>
        <div className="w-10 shrink-0 pl-2 text-[9px] text-left text-gray-500 dark:text-gray-400">{callAxisLabel}</div>
      </div>

      <div className="flex items-center justify-center gap-4 pt-3 border-t border-gray-200 dark:border-gray-700 text-[11px]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-sky-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">{legendLabels.tokenNonReasoning}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-indigo-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">{legendLabels.tokenReasoning}</span>
          </div>
        </div>
        <div className="text-gray-300 dark:text-gray-600">|</div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-emerald-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">{legendLabels.callsNonReasoning}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-teal-500 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">{legendLabels.callsReasoning}</span>
          </div>
        </div>
        <div className="text-gray-300 dark:text-gray-600">|</div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-orange-400 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">{legendLabels.costNonReasoning}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-rose-400 rounded"></div>
            <span className="text-gray-600 dark:text-gray-400">{legendLabels.costReasoning}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export function generateTicks(max: number, count: number): number[] {
  if (max <= 0) {
    return [0, 1]
  }

  const rawInterval = max / count
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawInterval)))
  const normalized = rawInterval / magnitude

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

  const minimumTicks = count + 1
  const requiredTicks = Math.max(minimumTicks, Math.ceil(max / interval) + 1)
  const ticks: number[] = []

  for (let i = 0; i < requiredTicks; i++) {
    ticks.push(interval * i)
  }

  if (ticks[ticks.length - 1] < max) {
    ticks.push(ticks[ticks.length - 1] + interval)
  }

  return ticks
}

export function aggregateByMonth(dailyData: DailyUsageStats[]): DailyUsageStats[] {
  const monthlyMap = new Map<string, DailyUsageStats>()

  dailyData.forEach((item) => {
    const monthKey = item.date.substring(0, 7)

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
        byPurpose: createEmptyPurposeRecord()
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
    monthData.byReasoning.withReasoning.calls += item.byReasoning.withReasoning.calls || 0
    monthData.byReasoning.withReasoning.tokens.input += item.byReasoning.withReasoning.tokens.input || 0
    monthData.byReasoning.withReasoning.tokens.output += item.byReasoning.withReasoning.tokens.output || 0
    monthData.byReasoning.withReasoning.tokens.total += item.byReasoning.withReasoning.tokens.total || 0
    monthData.byReasoning.withReasoning.cost.input += item.byReasoning.withReasoning.cost.input || 0
    monthData.byReasoning.withReasoning.cost.output += item.byReasoning.withReasoning.cost.output || 0
    monthData.byReasoning.withReasoning.cost.total += item.byReasoning.withReasoning.cost.total || 0

    // 聚合非推理数据
    monthData.byReasoning.withoutReasoning.calls += item.byReasoning.withoutReasoning.calls || 0
    monthData.byReasoning.withoutReasoning.tokens.input += item.byReasoning.withoutReasoning.tokens.input || 0
    monthData.byReasoning.withoutReasoning.tokens.output += item.byReasoning.withoutReasoning.tokens.output || 0
    monthData.byReasoning.withoutReasoning.tokens.total += item.byReasoning.withoutReasoning.tokens.total || 0
    monthData.byReasoning.withoutReasoning.cost.input += item.byReasoning.withoutReasoning.cost.input || 0
    monthData.byReasoning.withoutReasoning.cost.output += item.byReasoning.withoutReasoning.cost.output || 0
    monthData.byReasoning.withoutReasoning.cost.total += item.byReasoning.withoutReasoning.cost.total || 0

    PURPOSE_KEYS.forEach((key) => {
      const source = item.byPurpose?.[key]
      if (!source) {
        return
      }
      const target = monthData.byPurpose[key]
      target.calls += source.calls || 0
      target.tokens.input += source.tokens.input || 0
      target.tokens.output += source.tokens.output || 0
      target.tokens.total += source.tokens.total || 0
      target.cost.input += source.cost.input || 0
      target.cost.output += source.cost.output || 0
      target.cost.total += source.cost.total || 0
    })
  })

  return Array.from(monthlyMap.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function formatDate(date: string, mode: "daily" | "monthly", formatFn: (key: string, options?: any) => string): string {
  if (mode === "monthly") {
    const [year, month] = date.split("-")
    return formatFn("settings.aiUsage.dateFormat.monthly", { year, month })
  }

  const [year, month, day] = date.split("-")
  return formatFn("settings.aiUsage.dateFormat.daily", { year, month, day })
}

function formatDateShort(date: string, mode: "daily" | "monthly", formatFn: (key: string, options?: any) => string): string {
  if (mode === "monthly") {
    const [, month] = date.split("-")
    return formatFn("settings.aiUsage.dateFormat.monthlyShort", { month })
  }

  const [, month, day] = date.split("-")
  return formatFn("settings.aiUsage.dateFormat.dailyShort", { month, day })
}
