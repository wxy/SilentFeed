/**
 * AI 用量追踪服务
 * 
 * 负责记录和统计所有 AI 调用的用量和费用
 * 
 * 功能：
 * 1. 记录每次 AI 调用的详细信息（tokens、cost、latency）
 * 2. 支持从 API 响应中校正实际用量
 * 3. 提供多维度的用量统计查询
 * 4. 自动清理过期数据（默认保留 90 天）
 */

import { db } from "@/storage/db"
import type { AIUsageRecord, AIUsageStats, UsageStatsQuery, AIUsagePurpose, DailyUsageStats } from "@/types/ai-usage"
import { logger } from "@/utils/logger"
import { getCurrentMonthRange } from '@/utils/date-utils'

const usageLogger = logger.withTag("AIUsage")

/**
 * AI 用量追踪器
 */
export class AIUsageTracker {
  /**
   * 记录一次 AI 调用
   * 
   * @param record - 用量记录
   */
  static async recordUsage(record: Omit<AIUsageRecord, 'id' | 'timestamp'>): Promise<void> {
    try {
      const fullRecord: AIUsageRecord = {
        ...record,
        id: `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now()
      }
      
      await (db as any).aiUsage.add(fullRecord)
      
      usageLogger.info("📊 AI 用量已记录", {
        provider: record.provider,
        purpose: record.purpose,
        tokens: record.tokens.total,
        cost: record.cost.total.toFixed(4),
        reasoning: record.reasoning || false
      })
    } catch (error) {
      usageLogger.error("记录 AI 用量失败:", error)
    }
  }
  
  /**
   * 校正用量记录（当 API 返回准确值时）
   * 
   * @param recordId - 记录 ID
   * @param actualTokens - API 返回的实际 token 数
   * @param actualCost - 根据实际 tokens 计算的成本
   */
  static async correctUsage(
    recordId: string,
    actualTokens: { input: number; output: number },
    actualCost: { input: number; output: number }
  ): Promise<void> {
    try {
      const record = await (db as any).aiUsage.get(recordId)
      
      if (!record) {
        usageLogger.warn("未找到用量记录:", recordId)
        return
      }
      
      // 如果已经是准确值，跳过
      if (!record.tokens.estimated && !record.cost.estimated) {
        return
      }
      
      const updates: Partial<AIUsageRecord> = {
        tokens: {
          input: actualTokens.input,
          output: actualTokens.output,
          total: actualTokens.input + actualTokens.output,
          estimated: false
        },
        cost: {
          currency: record.cost.currency, // 保持原有货币
          input: actualCost.input,
          output: actualCost.output,
          total: actualCost.input + actualCost.output,
          estimated: false
        }
      }
      
      await (db as any).aiUsage.update(recordId, updates)
      
      usageLogger.info("✅ 用量已校正", {
        recordId,
        before: {
          tokens: record.tokens.total,
          cost: record.cost.total.toFixed(4)
        },
        after: {
          tokens: updates.tokens!.total,
          cost: updates.cost!.total.toFixed(4)
        }
      })
    } catch (error) {
      usageLogger.error("校正用量失败:", error)
    }
  }
  
  /**
   * 获取用量统计
   * 
   * @param query - 查询条件
   * @returns 统计结果
   */
  static async getStats(query: UsageStatsQuery = {}): Promise<AIUsageStats> {
    try {
      const {
        startTime = Date.now() - 30 * 24 * 60 * 60 * 1000, // 默认 30 天
        endTime = Date.now(),
        provider,
        purpose,
        onlySuccess = false
      } = query
      
      // 查询记录
      let records = await (db as any).aiUsage
        .where('timestamp')
        .between(startTime, endTime, true, true)
        .toArray()
      
      // 应用筛选条件
      if (provider) {
        records = records.filter((r: AIUsageRecord) => r.provider === provider)
      }
      
      if (purpose) {
        records = records.filter((r: AIUsageRecord) => r.purpose === purpose)
      }
      
      if (onlySuccess) {
        records = records.filter((r: AIUsageRecord) => r.success)
      }
      
      // 计算统计
      const stats: AIUsageStats = {
        period: { start: startTime, end: endTime },
        totalCalls: records.length,
        successfulCalls: records.filter((r: AIUsageRecord) => r.success).length,
        failedCalls: records.filter((r: AIUsageRecord) => !r.success).length,
        tokens: { input: 0, output: 0, total: 0 },
        cost: { input: 0, output: 0, total: 0 },
        byCurrency: {
          CNY: { input: 0, output: 0, total: 0 },
          USD: { input: 0, output: 0, total: 0 },
          FREE: { input: 0, output: 0, total: 0 }
        },
        byProvider: {},
        byPurpose: {} as any,
        avgLatency: 0
      }
      
      let totalLatency = 0
      let hasReasoningData = false
      let reasoningLatency = 0
      let nonReasoningLatency = 0
      
      for (const record of records) {
        // 总计 tokens
        stats.tokens.input += record.tokens.input
        stats.tokens.output += record.tokens.output
        stats.tokens.total += record.tokens.total
        
        // 获取货币类型，默认 CNY
        const currency = (record.cost.currency || 'CNY') as 'CNY' | 'USD' | 'FREE'
        
        // 按货币分组统计费用
        stats.byCurrency[currency].input += record.cost.input
        stats.byCurrency[currency].output += record.cost.output
        stats.byCurrency[currency].total += record.cost.total
        
        // 总计费用（忽略 FREE 货币）
        const isFree = currency === 'FREE'
        if (!isFree) {
          stats.cost.input += record.cost.input
          stats.cost.output += record.cost.output
          stats.cost.total += record.cost.total
        }
        
        totalLatency += record.latency
        
        // 推理模式统计（reasoning === undefined 视为 false）
        hasReasoningData = true
        if (!stats.byReasoning) {
          stats.byReasoning = {
            withReasoning: {
              calls: 0,
              tokens: { input: 0, output: 0, total: 0 },
              cost: { input: 0, output: 0, total: 0 },
              avgLatency: 0
            },
            withoutReasoning: {
              calls: 0,
              tokens: { input: 0, output: 0, total: 0 },
              cost: { input: 0, output: 0, total: 0 },
              avgLatency: 0
            }
          }
        }
        
        const reasoningStats = record.reasoning 
          ? stats.byReasoning.withReasoning 
          : stats.byReasoning.withoutReasoning
        
        reasoningStats.calls++
        reasoningStats.tokens.input += record.tokens.input
        reasoningStats.tokens.output += record.tokens.output
        reasoningStats.tokens.total += record.tokens.total
        
        if (!isFree) {
          reasoningStats.cost.input += record.cost.input
          reasoningStats.cost.output += record.cost.output
          reasoningStats.cost.total += record.cost.total
        }
        
        if (record.reasoning) {
          reasoningLatency += record.latency
        } else {
          nonReasoningLatency += record.latency
        }
        
        // 按 Provider 分组
        const isLocalProvider = record.provider === 'ollama' || isFree
        
        if (!stats.byProvider[record.provider]) {
          stats.byProvider[record.provider] = {
            calls: 0,
            tokens: { input: 0, output: 0, total: 0 },
            cost: { input: 0, output: 0, total: 0 },
            currency: currency,
            isLocal: isLocalProvider
          }
        }
        
        const providerStats = stats.byProvider[record.provider]
        providerStats.calls++
        providerStats.tokens.input += record.tokens.input
        providerStats.tokens.output += record.tokens.output
        providerStats.tokens.total += record.tokens.total
        
        if (!isFree) {
          providerStats.cost.input += record.cost.input
          providerStats.cost.output += record.cost.output
          providerStats.cost.total += record.cost.total
        }
        
        // 按用途分组
        if (!stats.byPurpose[record.purpose as AIUsagePurpose]) {
          stats.byPurpose[record.purpose as AIUsagePurpose] = {
            calls: 0,
            tokens: { input: 0, output: 0, total: 0 },
            cost: { input: 0, output: 0, total: 0 },
            byCurrency: {
              CNY: { input: 0, output: 0, total: 0 },
              USD: { input: 0, output: 0, total: 0 },
              FREE: { input: 0, output: 0, total: 0 }
            }
          }
        }
        
        const purposeStats = stats.byPurpose[record.purpose as AIUsagePurpose]
        purposeStats.calls++
        purposeStats.tokens.input += record.tokens.input
        purposeStats.tokens.output += record.tokens.output
        purposeStats.tokens.total += record.tokens.total
        
        // 按币种累计费用（保留 FREE）
        purposeStats.byCurrency![currency].input += record.cost.input
        purposeStats.byCurrency![currency].output += record.cost.output
        purposeStats.byCurrency![currency].total += record.cost.total

        // 汇总非 FREE 的费用到用途总计
        if (!isFree) {
          purposeStats.cost.input += record.cost.input
          purposeStats.cost.output += record.cost.output
          purposeStats.cost.total += record.cost.total
        }
      }
      
      // 计算平均延迟
      stats.avgLatency = records.length > 0 ? totalLatency / records.length : 0
      
      // 计算推理模式的平均延迟
      if (stats.byReasoning) {
        if (stats.byReasoning.withReasoning.calls > 0) {
          stats.byReasoning.withReasoning.avgLatency = reasoningLatency / stats.byReasoning.withReasoning.calls
        }
        if (stats.byReasoning.withoutReasoning.calls > 0) {
          stats.byReasoning.withoutReasoning.avgLatency = nonReasoningLatency / stats.byReasoning.withoutReasoning.calls
        }
      }
      
      return stats
    } catch (error) {
      usageLogger.error("获取用量统计失败:", error)
      throw error
    }
  }
  
  /**
   * 获取最近的用量记录
   * 
   * @param limit - 返回数量
   * @returns 用量记录数组
   */
  static async getRecentRecords(limit: number = 50): Promise<AIUsageRecord[]> {
    try {
      return await (db as any).aiUsage
        .orderBy('timestamp')
        .reverse()
        .limit(limit)
        .toArray()
    } catch (error) {
      usageLogger.error("获取最近用量记录失败:", error)
      return []
    }
  }
  
  /**
   * 清理过期数据
   * 
   * @param daysToKeep - 保留天数（默认 90 天）
   * @returns 删除的记录数
   */
  static async cleanOldRecords(daysToKeep: number = 90): Promise<number> {
    try {
      const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000
      
      const oldRecords = await (db as any).aiUsage
        .where('timestamp')
        .below(cutoffTime)
        .toArray()
      
      if (oldRecords.length === 0) {
        return 0
      }
      
      await (db as any).aiUsage
        .where('timestamp')
        .below(cutoffTime)
        .delete()
      
      usageLogger.info(`🗑️ 已清理 ${oldRecords.length} 条过期用量记录（${daysToKeep} 天前）`)
      
      return oldRecords.length
    } catch (error) {
      usageLogger.error("清理过期数据失败:", error)
      return 0
    }
  }
  
  /**
   * 获取总费用
   * 
   * @param query - 查询条件
   * @returns 总费用
   */
  static async getTotalCost(query: UsageStatsQuery = {}): Promise<number> {
    const stats = await this.getStats(query)
    return stats.cost.total
  }

  /**
   * 获取指定货币的总费用（避免跨货币相加）
   *
   * @param currency 货币类型：'CNY' | 'USD' | 'FREE'
   * @param query 查询条件
   * @returns 指定货币的总费用
   */
  static async getTotalCostByCurrency(
    currency: 'CNY' | 'USD' | 'FREE',
    query: UsageStatsQuery = {}
  ): Promise<number> {
    const stats = await this.getStats(query)
    return stats.byCurrency[currency].total
  }
  
  /**
   * 获取当前自然月的总费用
   * 
   * @returns 本月总费用（CNY）
   */
  static async getCurrentMonthCost(): Promise<number> {
    const { start, end } = getCurrentMonthRange()
    
    return this.getTotalCost({
      startTime: start,
      endTime: end
    })
  }
  
  /**
   * 获取当前自然月的统计数据
   * 
   * @returns 本月统计
   */
  static async getCurrentMonthStats(): Promise<AIUsageStats> {
    const { start, end } = getCurrentMonthRange()
    
    return this.getStats({
      startTime: start,
      endTime: end
    })
  }
  
  /**
   * 获取按日统计数据
   * 
   * @param days - 统计最近 N 天（默认 30 天，0 表示所有时间）
   * @returns 每日统计数据数组
   */
  static async getDailyStats(days: number = 30): Promise<DailyUsageStats[]> {
    try {
      const now = Date.now()
      const startTime = days > 0 ? now - days * 24 * 60 * 60 * 1000 : 0
      
      // 查询所有记录
      const records = await (db as any).aiUsage
        .where('timestamp')
        .between(startTime, now, true, true)
        .toArray()
      
      // 按日期分组
      const dailyMap = new Map<string, AIUsageRecord[]>()
      
      for (const record of records) {
        const date = new Date(record.timestamp)
        const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
        
        if (!dailyMap.has(dateKey)) {
          dailyMap.set(dateKey, [])
        }
        dailyMap.get(dateKey)!.push(record)
      }
      
      // 计算每日统计
      const dailyStats: DailyUsageStats[] = []
      
      for (const [date, dayRecords] of dailyMap.entries()) {
        const stats: DailyUsageStats = {
          date,
          totalCalls: dayRecords.length,
          successfulCalls: dayRecords.filter(r => r.success).length,
          failedCalls: dayRecords.filter(r => !r.success).length,
          tokens: { input: 0, output: 0, total: 0 },
          cost: { input: 0, output: 0, total: 0 },
          byCurrency: {
            CNY: { input: 0, output: 0, total: 0 },
            USD: { input: 0, output: 0, total: 0 },
            FREE: { input: 0, output: 0, total: 0 }
          },
          byCurrencyReasoning: {
            CNY: {
              withReasoning: { input: 0, output: 0, total: 0 },
              withoutReasoning: { input: 0, output: 0, total: 0 }
            },
            USD: {
              withReasoning: { input: 0, output: 0, total: 0 },
              withoutReasoning: { input: 0, output: 0, total: 0 }
            },
            FREE: {
              withReasoning: { input: 0, output: 0, total: 0 },
              withoutReasoning: { input: 0, output: 0, total: 0 }
            }
          },
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
          byPurpose: {} as any
        }
        
        for (const record of dayRecords) {
          // 总计 tokens
          stats.tokens.input += record.tokens.input
          stats.tokens.output += record.tokens.output
          stats.tokens.total += record.tokens.total
          
          // 获取货币类型，跳过 FREE
          const currency = (record.cost.currency || 'CNY') as 'CNY' | 'USD' | 'FREE'
          const isFree = currency === 'FREE'
          
          if (!isFree) {
            stats.cost.input += record.cost.input
            stats.cost.output += record.cost.output
            stats.cost.total += record.cost.total
          }

          // 按币种累计每日费用（包含 FREE）
          stats.byCurrency![currency].input += record.cost.input
          stats.byCurrency![currency].output += record.cost.output
          stats.byCurrency![currency].total += record.cost.total

          // 按币种 + 推理模式累计每日费用（包含 FREE）
          if (record.reasoning) {
            stats.byCurrencyReasoning![currency].withReasoning.input += record.cost.input
            stats.byCurrencyReasoning![currency].withReasoning.output += record.cost.output
            stats.byCurrencyReasoning![currency].withReasoning.total += record.cost.total
          } else {
            stats.byCurrencyReasoning![currency].withoutReasoning.input += record.cost.input
            stats.byCurrencyReasoning![currency].withoutReasoning.output += record.cost.output
            stats.byCurrencyReasoning![currency].withoutReasoning.total += record.cost.total
          }
          
          // 推理模式统计（reasoning === undefined 视为 false）
          const reasoningStats = record.reasoning 
            ? stats.byReasoning.withReasoning 
            : stats.byReasoning.withoutReasoning
          
          reasoningStats.calls++
          reasoningStats.tokens.input += record.tokens.input
          reasoningStats.tokens.output += record.tokens.output
          reasoningStats.tokens.total += record.tokens.total
          
          if (!isFree) {
            reasoningStats.cost.input += record.cost.input
            reasoningStats.cost.output += record.cost.output
            reasoningStats.cost.total += record.cost.total
          }
          
          // 按 Provider 分组
          if (!stats.byProvider[record.provider]) {
            stats.byProvider[record.provider] = {
              calls: 0,
              tokens: { input: 0, output: 0, total: 0 },
              cost: { input: 0, output: 0, total: 0 }
            }
          }
          
          const providerStats = stats.byProvider[record.provider]
          providerStats.calls++
          providerStats.tokens.input += record.tokens.input
          providerStats.tokens.output += record.tokens.output
          providerStats.tokens.total += record.tokens.total
          
          if (!isFree) {
            providerStats.cost.input += record.cost.input
            providerStats.cost.output += record.cost.output
            providerStats.cost.total += record.cost.total
          }
          
          // 按用途分组
          if (!stats.byPurpose[record.purpose as AIUsagePurpose]) {
            stats.byPurpose[record.purpose as AIUsagePurpose] = {
              calls: 0,
              tokens: { input: 0, output: 0, total: 0 },
              cost: { input: 0, output: 0, total: 0 },
              byCurrency: {
                CNY: { input: 0, output: 0, total: 0 },
                USD: { input: 0, output: 0, total: 0 },
                FREE: { input: 0, output: 0, total: 0 }
              }
            }
          }
          
          const purposeStats = stats.byPurpose[record.purpose as AIUsagePurpose]
          purposeStats.calls++
          purposeStats.tokens.input += record.tokens.input
          purposeStats.tokens.output += record.tokens.output
          purposeStats.tokens.total += record.tokens.total
          
          // 按币种累计用途费用（包含 FREE）
          purposeStats.byCurrency![currency].input += record.cost.input
          purposeStats.byCurrency![currency].output += record.cost.output
          purposeStats.byCurrency![currency].total += record.cost.total

          // 汇总非 FREE 的费用到用途总计
          if (!isFree) {
            purposeStats.cost.input += record.cost.input
            purposeStats.cost.output += record.cost.output
            purposeStats.cost.total += record.cost.total
          }
        }
        
        dailyStats.push(stats)
      }
      
      // 按日期排序（降序）
      dailyStats.sort((a, b) => b.date.localeCompare(a.date))
      
      return dailyStats
    } catch (error) {
      usageLogger.error("获取按日统计失败:", error)
      return []
    }
  }

  /**
   * 导出用量数据（用于分析或备份）
   * 
   * @param query - 查询条件
   * @returns CSV 格式的字符串
   */
  static async exportToCSV(query: UsageStatsQuery = {}): Promise<string> {
    try {
      const {
        startTime = 0,
        endTime = Date.now(),
        provider,
        purpose,
        onlySuccess = false
      } = query
      
      let records = await (db as any).aiUsage
        .where('timestamp')
        .between(startTime, endTime, true, true)
        .toArray()
      
      if (provider) {
        records = records.filter((r: AIUsageRecord) => r.provider === provider)
      }
      
      if (purpose) {
        records = records.filter((r: AIUsageRecord) => r.purpose === purpose)
      }
      
      if (onlySuccess) {
        records = records.filter((r: AIUsageRecord) => r.success)
      }
      
      // CSV 表头
      const headers = [
        'Timestamp',
        'Date',
        'Provider',
        'Model',
        'Purpose',
        'Input Tokens',
        'Output Tokens',
        'Total Tokens',
        'Currency',
        'Input Cost',
        'Output Cost',
        'Total Cost',
        'Latency (ms)',
        'Success',
        'Error'
      ]
      
      // CSV 内容
      const rows = records.map((r: AIUsageRecord) => [
        r.timestamp,
        new Date(r.timestamp).toLocaleString('zh-CN'),
        r.provider,
        r.model,
        r.purpose,
        r.tokens.input,
        r.tokens.output,
        r.tokens.total,
        r.cost.currency || 'CNY',
        r.cost.input.toFixed(6),
        r.cost.output.toFixed(6),
        r.cost.total.toFixed(6),
        r.latency,
        r.success ? 'Yes' : 'No',
        r.error || ''
      ])
      
      const csv = [
        headers.join(','),
        ...rows.map((row: any[]) => row.map((cell: any) => 
          typeof cell === 'string' && cell.includes(',') 
            ? `"${cell}"` 
            : cell
        ).join(','))
      ].join('\n')
      
      return csv
    } catch (error) {
      usageLogger.error("导出 CSV 失败:", error)
      throw error
    }
  }
}

/**
 * 辅助函数：创建用量记录模板
 * 
 * @param provider - AI Provider
 * @param model - 使用的模型
 * @param purpose - 调用用途
 * @param latency - 调用延迟
 * @returns 部分用量记录
 */
export function createUsageRecord(
  provider: 'openai' | 'deepseek' | 'ollama' | 'keyword',
  model: string,
  purpose: AIUsagePurpose,
  latency: number
): Omit<AIUsageRecord, 'id' | 'timestamp' | 'tokens' | 'cost' | 'success'> {
  return {
    provider,
    model,
    purpose,
    latency
  }
}
