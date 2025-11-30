/**
 * AI 用量追踪器测试
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { db } from '@/storage/db'
import type { AIUsageRecord } from '@/types/ai-usage'

// 在这个测试文件中取消对 AIUsageTracker 的 mock
vi.unmock('./AIUsageTracker')
import { AIUsageTracker } from './AIUsageTracker'

describe('AIUsageTracker', () => {
  beforeEach(async () => {
    // 清空用量表
    await (db as any).aiUsage.clear()
  })

  afterEach(async () => {
    // 测试后清理
    await (db as any).aiUsage.clear()
  })

  describe('recordUsage', () => {
    it('应该记录成功的 AI 调用', async () => {
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: {
          input: 100,
          output: 50,
          total: 150,
          estimated: false
        },
        cost: {
          input: 0.0002,
          output: 0.00015,
          total: 0.00035,
          estimated: false
        },
        latency: 1500,
        success: true
      })

      const records = await (db as any).aiUsage.toArray()
      expect(records).toHaveLength(1)
      
      const record = records[0]
      expect(record.provider).toBe('deepseek')
      expect(record.model).toBe('deepseek-chat')
      expect(record.purpose).toBe('analyze-content')
      expect(record.tokens.total).toBe(150)
      expect(record.cost.total).toBeCloseTo(0.00035, 6)
      expect(record.success).toBe(true)
      expect(record.latency).toBe(1500)
    })

    it('应该记录失败的 AI 调用', async () => {
      await AIUsageTracker.recordUsage({
        provider: 'openai',
        model: 'gpt-4',
        purpose: 'generate-profile',
        tokens: {
          input: 0,
          output: 0,
          total: 0,
          estimated: true
        },
        cost: {
          input: 0,
          output: 0,
          total: 0,
          estimated: true
        },
        latency: 500,
        success: false,
        error: 'API rate limit exceeded'
      })

      const records = await (db as any).aiUsage.toArray()
      expect(records).toHaveLength(1)
      
      const record = records[0]
      expect(record.success).toBe(false)
      expect(record.error).toBe('API rate limit exceeded')
    })

    it('应该记录元数据', async () => {
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: {
          input: 200,
          output: 100,
          total: 300,
          estimated: false
        },
        cost: {
          input: 0.0004,
          output: 0.0003,
          total: 0.0007,
          estimated: false
        },
        latency: 2000,
        success: true,
        metadata: {
          contentLength: 5000,
          topicCount: 5,
          useReasoning: true
        }
      })

      const records = await (db as any).aiUsage.toArray()
      const record = records[0]
      
      expect(record.metadata).toBeDefined()
      expect(record.metadata?.contentLength).toBe(5000)
      expect(record.metadata?.topicCount).toBe(5)
      expect(record.metadata?.useReasoning).toBe(true)
    })
  })

  describe('correctUsage', () => {
    it('应该校正预估的用量数据', async () => {
      // 先记录一个预估的用量
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: {
          input: 100,  // 预估值
          output: 50,  // 预估值
          total: 150,
          estimated: true
        },
        cost: {
          input: 0.0002,
          output: 0.00015,
          total: 0.00035,
          estimated: true
        },
        latency: 1500,
        success: true
      })

      const records = await (db as any).aiUsage.toArray()
      const recordId = records[0].id

      // 校正为准确值
      await AIUsageTracker.correctUsage(
        recordId,
        { input: 120, output: 60 },  // 实际值
        { input: 0.00024, output: 0.00018 }
      )

      const correctedRecord = await (db as any).aiUsage.get(recordId)
      expect(correctedRecord).toBeDefined()
      expect(correctedRecord!.tokens.input).toBe(120)
      expect(correctedRecord!.tokens.output).toBe(60)
      expect(correctedRecord!.tokens.total).toBe(180)
      expect(correctedRecord!.tokens.estimated).toBe(false)
      expect(correctedRecord!.cost.total).toBeCloseTo(0.00042, 6)
      expect(correctedRecord!.cost.estimated).toBe(false)
    })

    it('应该跳过已经是准确值的记录', async () => {
      // 记录准确值
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: {
          input: 100,
          output: 50,
          total: 150,
          estimated: false  // 已经是准确值
        },
        cost: {
          input: 0.0002,
          output: 0.00015,
          total: 0.00035,
          estimated: false
        },
        latency: 1500,
        success: true
      })

      const records = await (db as any).aiUsage.toArray()
      const recordId = records[0].id
      const originalRecord = { ...records[0] }

      // 尝试校正
      await AIUsageTracker.correctUsage(
        recordId,
        { input: 120, output: 60 },
        { input: 0.00024, output: 0.00018 }
      )

      const record = await (db as any).aiUsage.get(recordId)
      
      // 应该保持不变
      expect(record!.tokens.input).toBe(originalRecord.tokens.input)
      expect(record!.tokens.output).toBe(originalRecord.tokens.output)
    })
  })

  describe('getStats', () => {
    beforeEach(async () => {
      // 准备测试数据
      const now = Date.now()
      
      // DeepSeek - 内容分析
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: { input: 100, output: 50, total: 150, estimated: false },
        cost: { input: 0.0002, output: 0.00015, total: 0.00035, estimated: false },
        latency: 1500,
        success: true
      })

      // DeepSeek - 用户画像生成
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'generate-profile',
        tokens: { input: 500, output: 200, total: 700, estimated: false },
        cost: { input: 0.001, output: 0.0006, total: 0.0016, estimated: false },
        latency: 3000,
        success: true
      })

      // OpenAI - 内容分析（失败）
      await AIUsageTracker.recordUsage({
        provider: 'openai',
        model: 'gpt-4',
        purpose: 'analyze-content',
        tokens: { input: 0, output: 0, total: 0, estimated: true },
        cost: { input: 0, output: 0, total: 0, estimated: true },
        latency: 500,
        success: false,
        error: 'API error'
      })

      // 历史数据（31天前）
      const oldTimestamp = now - 31 * 24 * 60 * 60 * 1000
      await (db as any).aiUsage.add({
        id: 'old_record',
        timestamp: oldTimestamp,
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: { input: 50, output: 25, total: 75, estimated: false },
        cost: { input: 0.0001, output: 0.000075, total: 0.000175, estimated: false },
        latency: 1000,
        success: true
      })
    })

    it('应该统计默认30天内的所有调用', async () => {
      const stats = await AIUsageTracker.getStats()

      expect(stats.totalCalls).toBe(3)  // 不包含31天前的记录
      expect(stats.successfulCalls).toBe(2)
      expect(stats.failedCalls).toBe(1)
      expect(stats.tokens.total).toBe(850)  // 150 + 700
      expect(stats.cost.total).toBeCloseTo(0.00195, 6)
      
      // 验证多货币统计（默认为 CNY）
      expect(stats.byCurrency.CNY.total).toBeCloseTo(0.00195, 6)
      expect(stats.byCurrency.USD.total).toBe(0)
      expect(stats.byCurrency.FREE.total).toBe(0)
    })

    it('应该按 Provider 分组统计', async () => {
      const stats = await AIUsageTracker.getStats()

      expect(stats.byProvider.deepseek).toBeDefined()
      expect(stats.byProvider.deepseek.calls).toBe(2)
      expect(stats.byProvider.deepseek.tokens.total).toBe(850)

      expect(stats.byProvider.openai).toBeDefined()
      expect(stats.byProvider.openai.calls).toBe(1)
      expect(stats.byProvider.openai.tokens.total).toBe(0)
    })

    it('应该按用途分组统计', async () => {
      const stats = await AIUsageTracker.getStats()

      expect(stats.byPurpose['analyze-content']).toBeDefined()
      expect(stats.byPurpose['analyze-content'].calls).toBe(2)  // 1成功 + 1失败

      expect(stats.byPurpose['generate-profile']).toBeDefined()
      expect(stats.byPurpose['generate-profile'].calls).toBe(1)
    })

    it('应该支持按 Provider 筛选', async () => {
      const stats = await AIUsageTracker.getStats({ provider: 'deepseek' })

      expect(stats.totalCalls).toBe(2)
      expect(stats.successfulCalls).toBe(2)
      expect(stats.failedCalls).toBe(0)
    })

    it('应该支持按用途筛选', async () => {
      const stats = await AIUsageTracker.getStats({ purpose: 'analyze-content' })

      expect(stats.totalCalls).toBe(2)  // 1 DeepSeek + 1 OpenAI(失败)
    })

    it('应该支持只统计成功的调用', async () => {
      const stats = await AIUsageTracker.getStats({ onlySuccess: true })

      expect(stats.totalCalls).toBe(2)
      expect(stats.failedCalls).toBe(0)
    })

    it('应该计算平均延迟', async () => {
      const stats = await AIUsageTracker.getStats()

      // (1500 + 3000 + 500) / 3 = 1666.67
      expect(stats.avgLatency).toBeCloseTo(1666.67, 0)
    })

    it('应该支持自定义时间范围', async () => {
      const now = Date.now()
      const stats = await AIUsageTracker.getStats({
        startTime: now - 40 * 24 * 60 * 60 * 1000,  // 40天前
        endTime: now
      })

      expect(stats.totalCalls).toBe(4)  // 包含31天前的记录
    })
  })

  describe('getRecentRecords', () => {
    it('应该返回最近的记录（按时间倒序）', async () => {
      // 添加3条记录
      for (let i = 0; i < 3; i++) {
        await AIUsageTracker.recordUsage({
          provider: 'deepseek',
          model: 'deepseek-chat',
          purpose: 'analyze-content',
          tokens: { input: 100 + i, output: 50, total: 150 + i, estimated: false },
          cost: { input: 0.0002, output: 0.00015, total: 0.00035, estimated: false },
          latency: 1500,
          success: true
        })
        // 确保时间戳不同
        await new Promise(resolve => setTimeout(resolve, 10))
      }

      const records = await AIUsageTracker.getRecentRecords(2)

      expect(records).toHaveLength(2)
      // 最新的记录应该在前面
      expect(records[0].tokens.input).toBe(102)
      expect(records[1].tokens.input).toBe(101)
    })
  })

  describe('getTotalCost', () => {
    it('应该返回总费用', async () => {
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: { input: 100, output: 50, total: 150, estimated: false },
        cost: { input: 0.0002, output: 0.00015, total: 0.00035, estimated: false },
        latency: 1500,
        success: true
      })

      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'generate-profile',
        tokens: { input: 500, output: 200, total: 700, estimated: false },
        cost: { input: 0.001, output: 0.0006, total: 0.0016, estimated: false },
        latency: 3000,
        success: true
      })

      const totalCost = await AIUsageTracker.getTotalCost()
      expect(totalCost).toBeCloseTo(0.00195, 6)
    })
  })

  describe('cleanOldRecords', () => {
    it('应该删除过期的记录', async () => {
      const now = Date.now()
      
      // 添加新记录
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: { input: 100, output: 50, total: 150, estimated: false },
        cost: { input: 0.0002, output: 0.00015, total: 0.00035, estimated: false },
        latency: 1500,
        success: true
      })

      // 添加100天前的记录
      await (db as any).aiUsage.add({
        id: 'old_record',
        timestamp: now - 100 * 24 * 60 * 60 * 1000,
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: { input: 50, output: 25, total: 75, estimated: false },
        cost: { input: 0.0001, output: 0.000075, total: 0.000175, estimated: false },
        latency: 1000,
        success: true
      })

      // 清理90天前的记录
      const deletedCount = await AIUsageTracker.cleanOldRecords(90)

      expect(deletedCount).toBe(1)
      
      const remaining = await (db as any).aiUsage.toArray()
      expect(remaining).toHaveLength(1)
      expect(remaining[0].id).not.toBe('old_record')
    })

    it('应该在没有过期记录时返回0', async () => {
      // 添加新记录
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: { input: 100, output: 50, total: 150, estimated: false },
        cost: { input: 0.0002, output: 0.00015, total: 0.00035, estimated: false },
        latency: 1500,
        success: true
      })

      const deletedCount = await AIUsageTracker.cleanOldRecords(90)
      expect(deletedCount).toBe(0)
    })
  })

  describe('exportToCSV', () => {
    beforeEach(async () => {
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: { input: 100, output: 50, total: 150, estimated: false },
        cost: { input: 0.0002, output: 0.00015, total: 0.00035, estimated: false },
        latency: 1500,
        success: true
      })
    })

    it('应该导出为 CSV 格式', async () => {
      const csv = await AIUsageTracker.exportToCSV()

      expect(csv).toContain('Timestamp,Date,Provider,Model,Purpose')
      expect(csv).toContain('deepseek')
      expect(csv).toContain('deepseek-chat')
      expect(csv).toContain('analyze-content')
      expect(csv).toContain('100')  // input tokens
      expect(csv).toContain('50')   // output tokens
      expect(csv).toContain('150')  // total tokens
      expect(csv).toContain('Yes')  // success
    })

    it('应该正确处理失败的记录', async () => {
      await AIUsageTracker.recordUsage({
        provider: 'openai',
        model: 'gpt-4',
        purpose: 'generate-profile',
        tokens: { input: 0, output: 0, total: 0, estimated: true },
        cost: { input: 0, output: 0, total: 0, estimated: true },
        latency: 500,
        success: false,
        error: 'API error'
      })

      const csv = await AIUsageTracker.exportToCSV()

      expect(csv).toContain('No')  // success = false
      expect(csv).toContain('API error')
    })
  })

  describe('多货币统计', () => {
    it('应该分别统计 CNY、USD 和 FREE 货币的费用', async () => {
      // CNY 费用
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: { input: 100, output: 50, total: 150, estimated: false },
        cost: { currency: 'CNY', input: 0.002, output: 0.0015, total: 0.0035, estimated: false },
        latency: 1500,
        success: true
      })

      // USD 费用
      await AIUsageTracker.recordUsage({
        provider: 'openai',
        model: 'gpt-4',
        purpose: 'analyze-content',
        tokens: { input: 200, output: 100, total: 300, estimated: false },
        cost: { currency: 'USD', input: 0.005, output: 0.01, total: 0.015, estimated: false },
        latency: 2000,
        success: true
      })

      // FREE（本地模型）
      await AIUsageTracker.recordUsage({
        provider: 'ollama',
        model: 'qwen2.5:7b',
        purpose: 'analyze-content',
        tokens: { input: 150, output: 75, total: 225, estimated: false },
        cost: { currency: 'FREE', input: 0, output: 0, total: 0, estimated: false },
        latency: 3000,
        success: true
      })

      const stats = await AIUsageTracker.getStats()

      // 验证 CNY
      expect(stats.byCurrency.CNY.total).toBeCloseTo(0.0035, 6)
      expect(stats.byCurrency.CNY.input).toBeCloseTo(0.002, 6)
      expect(stats.byCurrency.CNY.output).toBeCloseTo(0.0015, 6)

      // 验证 USD
      expect(stats.byCurrency.USD.total).toBeCloseTo(0.015, 6)
      expect(stats.byCurrency.USD.input).toBeCloseTo(0.005, 6)
      expect(stats.byCurrency.USD.output).toBeCloseTo(0.01, 6)

      // 验证 FREE
      expect(stats.byCurrency.FREE.total).toBe(0)
      expect(stats.byCurrency.FREE.input).toBe(0)
      expect(stats.byCurrency.FREE.output).toBe(0)

      // 总费用应该只包含有费用的货币（CNY + USD，不包含 FREE）
      expect(stats.cost.total).toBeCloseTo(0.0185, 6)
    })

    it('应该在 byProvider 中标记货币类型', async () => {
      await AIUsageTracker.recordUsage({
        provider: 'deepseek',
        model: 'deepseek-chat',
        purpose: 'analyze-content',
        tokens: { input: 100, output: 50, total: 150, estimated: false },
        cost: { currency: 'CNY', input: 0.002, output: 0.0015, total: 0.0035, estimated: false },
        latency: 1500,
        success: true
      })

      await AIUsageTracker.recordUsage({
        provider: 'ollama',
        model: 'qwen2.5:7b',
        purpose: 'analyze-content',
        tokens: { input: 150, output: 75, total: 225, estimated: false },
        cost: { currency: 'FREE', input: 0, output: 0, total: 0, estimated: false },
        latency: 3000,
        success: true
      })

      const stats = await AIUsageTracker.getStats()

      expect(stats.byProvider.deepseek.currency).toBe('CNY')
      expect(stats.byProvider.deepseek.isLocal).toBe(false)

      expect(stats.byProvider.ollama.currency).toBe('FREE')
      expect(stats.byProvider.ollama.isLocal).toBe(true)
    })
  })
})
