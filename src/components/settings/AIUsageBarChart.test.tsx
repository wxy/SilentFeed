import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { AIUsageBarChart, aggregateByMonth, generateTicks } from "./AIUsageBarChart"
import type { DailyUsageStats } from "@/types/ai-usage"

const createPurposeEntry = () => ({
  calls: 0,
  tokens: { input: 0, output: 0, total: 0 },
  cost: { input: 0, output: 0, total: 0 }
})

const createZeroPurposeRecord = () => ({
  "analyze-content": createPurposeEntry(),
  "recommend-content": createPurposeEntry(),
  "generate-profile": createPurposeEntry(),
  translate: createPurposeEntry(),
  "test-connection": createPurposeEntry(),
  other: createPurposeEntry()
})

const BAR_WIDTH = 12
const BAR_GAP = 4
const DATE_GAP = 32
const VISIBLE_DAYS = 7
// 每日包含 4 列：Tokens、Calls、USD 费用、CNY 费用
const DATE_WIDTH = BAR_WIDTH * 4 + BAR_GAP * 3 + DATE_GAP

const createDailyStat = (date: string): DailyUsageStats => ({
  date,
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
  byPurpose: createZeroPurposeRecord()
})

describe("generateTicks", () => {
  it("extends ticks beyond provided max and keeps interval stable", () => {
    const max = 12345
    const ticks = generateTicks(max, 5)

    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(max)
    const interval = ticks[1] - ticks[0]
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i] - ticks[i - 1]).toBe(interval)
    }
  })
})

describe("aggregateByMonth", () => {
  it("merges daily entries into a single monthly bucket", () => {
    const first = createDailyStat("2024-12-01")
    first.totalCalls = 4
    first.tokens = { input: 1000, output: 500, total: 1500 }
    first.cost = { input: 0.2, output: 0.3, total: 0.5 }
    first.byReasoning.withReasoning.calls = 2
    first.byReasoning.withReasoning.tokens.total = 900
    first.byReasoning.withoutReasoning.calls = 2
    first.byReasoning.withoutReasoning.tokens.total = 600

    const second = createDailyStat("2024-12-15")
    second.totalCalls = 6
    second.tokens = { input: 2000, output: 1000, total: 3000 }
    second.cost = { input: 0.4, output: 0.6, total: 1 }
    second.byReasoning.withReasoning.calls = 3
    second.byReasoning.withReasoning.tokens.total = 1500
    second.byReasoning.withoutReasoning.calls = 3
    second.byReasoning.withoutReasoning.tokens.total = 1500

    const result = aggregateByMonth([first, second])
    expect(result).toHaveLength(1)

    const [december] = result
    expect(december.date).toBe("2024-12")
    expect(december.totalCalls).toBe(10)
    expect(december.tokens.total).toBe(4500)
    expect(december.cost.total).toBeCloseTo(1.5)
    expect(december.byReasoning.withReasoning.calls).toBe(5)
    expect(december.byReasoning.withoutReasoning.calls).toBe(5)
  })
})

describe("AIUsageBarChart", () => {
  it("renders chart layout with axes and legend", () => {
    const entry = createDailyStat("2024-12-04")
    entry.byReasoning.withReasoning.tokens.total = 240000
    entry.byReasoning.withoutReasoning.tokens.total = 60000
    entry.byReasoning.withReasoning.calls = 300
    entry.byReasoning.withoutReasoning.calls = 200
    entry.byReasoning.withReasoning.cost.total = 0.45
    entry.byReasoning.withoutReasoning.cost.total = 0.15

    const data = [entry]

    render(<AIUsageBarChart data={data} mode="daily" />)

    expect(screen.getByText("Token")).toBeInTheDocument()
    expect(screen.getByText("Number of calls")).toBeInTheDocument()
    expect(screen.getByText("Token (Reasoning)")).toBeInTheDocument()
    expect(screen.getByText("Call (Non-Reasoning)")).toBeInTheDocument()
    expect(screen.getByText("Cost (Reasoning)")).toBeInTheDocument()
  })

  it("sorts data chronologically and constrains viewport to seven days", () => {
    const sortedDates = Array.from({ length: 10 }, (_, index) => {
      const month = String(index + 1).padStart(2, "0")
      return `2024-${month}-01`
    })
    const unsortedDates = [...sortedDates].reverse()
    const data = unsortedDates.map((date, idx) => {
      const entry = createDailyStat(date)
      entry.byReasoning.withReasoning.tokens.total = 50000 + idx * 1000
      entry.byReasoning.withoutReasoning.tokens.total = 25000
      entry.byReasoning.withReasoning.calls = 10 + idx
      entry.byReasoning.withReasoning.cost.total = 0.1 * idx
      return entry
    })

    const { container } = render(<AIUsageBarChart data={data} mode="daily" />)

    const dateNodes = container.querySelectorAll("[data-date-value]")
    const renderedDates = Array.from(dateNodes).map((node) => node.getAttribute("data-date-value"))
    expect(renderedDates).toEqual(sortedDates)

    const firstDate = container.querySelector('[data-date-value="2024-01-01"]') as HTMLElement
    expect(firstDate).not.toBeNull()
    expect(firstDate.style.width).toBe(`${DATE_WIDTH}px`)
  })
})
