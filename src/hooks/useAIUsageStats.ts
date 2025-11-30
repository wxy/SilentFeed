/**
 * AI 用量统计 Hook
 * 
 * 用于在 React 组件中查询和展示 AI 用量统计
 */

import { useState, useEffect } from 'react'
import { AIUsageTracker } from '@/core/ai/AIUsageTracker'
import type { AIUsageStats, UsageStatsQuery } from '@/types/ai-usage'

/**
 * 使用 AI 用量统计
 * 
 * @param query - 查询条件
 * @param autoRefresh - 自动刷新间隔（毫秒），0 表示不自动刷新
 * @returns 统计数据和刷新函数
 */
export function useAIUsageStats(
  query: UsageStatsQuery = {},
  autoRefresh: number = 0
) {
  const [stats, setStats] = useState<AIUsageStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await AIUsageTracker.getStats(query)
      setStats(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '获取统计失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()

    if (autoRefresh > 0) {
      const interval = setInterval(fetchStats, autoRefresh)
      return () => clearInterval(interval)
    }
  }, [JSON.stringify(query), autoRefresh])

  return {
    stats,
    loading,
    error,
    refresh: fetchStats
  }
}

/**
 * 使用总费用
 * 
 * @param query - 查询条件
 * @returns 总费用和刷新函数
 */
export function useTotalCost(query: UsageStatsQuery = {}) {
  const [totalCost, setTotalCost] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  const fetchTotalCost = async () => {
    setLoading(true)
    const cost = await AIUsageTracker.getTotalCost(query)
    setTotalCost(cost)
    setLoading(false)
  }

  useEffect(() => {
    fetchTotalCost()
  }, [JSON.stringify(query)])

  return {
    totalCost,
    loading,
    refresh: fetchTotalCost
  }
}

/**
 * 格式化费用（人民币）
 * 
 * @param cost - 费用金额
 * @returns 格式化的字符串
 */
export function formatCost(cost: number): string {
  if (cost === 0) return '¥0.00'
  if (cost < 0.0001) return '< ¥0.0001'
  return `¥${cost.toFixed(4)}`
}

/**
 * 格式化 Token 数量
 * 
 * @param tokens - Token 数量
 * @returns 格式化的字符串
 */
export function formatTokens(tokens: number): string {
  if (tokens < 1000) return `${tokens}`
  if (tokens < 1000000) return `${(tokens / 1000).toFixed(1)}K`
  return `${(tokens / 1000000).toFixed(2)}M`
}

/**
 * 格式化延迟时间
 * 
 * @param latency - 延迟（毫秒）
 * @returns 格式化的字符串
 */
export function formatLatency(latency: number): string {
  if (latency < 1000) return `${latency}ms`
  return `${(latency / 1000).toFixed(2)}s`
}

/**
 * 计算成功率
 * 
 * @param successfulCalls - 成功次数
 * @param totalCalls - 总次数
 * @returns 成功率百分比
 */
export function calculateSuccessRate(successfulCalls: number, totalCalls: number): number {
  if (totalCalls === 0) return 0
  return (successfulCalls / totalCalls) * 100
}
