/**
 * 验证 AI 策略配置是否正确应用到各个模块
 * 
 * 使用方法：在 Service Worker 控制台运行
 */

import { getCurrentStrategy } from '../src/core/strategy/strategy-manager'
import { getRefillManager } from '../src/core/recommender/pool-refill-policy'
import { db } from '../src/storage/db/index'

async function verifyStrategyConfig() {
  console.log('=== AI 策略配置验证 ===\n')

  // 1. 获取 AI 策略
  const strategy = await getCurrentStrategy()
  
  if (!strategy) {
    console.error('❌ 未找到 AI 策略')
    return
  }

  console.log('📋 AI 策略决策:')
  console.log(`  poolSize: ${strategy.strategy.recommendation.targetPoolSize}`)
  console.log(`  cooldownMinutes: ${strategy.strategy.recommendation.cooldownMinutes}`)
  console.log(`  dailyLimit: ${strategy.strategy.recommendation.dailyLimit}`)
  console.log(`  refillThreshold: ${strategy.strategy.recommendation.refillThreshold}`)
  console.log(`  triggerThreshold: ${(strategy.strategy.recommendation.refillThreshold / strategy.strategy.recommendation.targetPoolSize * 100).toFixed(0)}%`)
  console.log(`  决策理由: ${strategy.strategy.meta.reasoning || strategy.decision?.reasoning || '无'}`)

  // 2. 检查 PoolRefillManager 状态
  console.log('\n📊 PoolRefillManager 状态:')
  const refillManager = getRefillManager()
  const state = refillManager.getState()
  
  console.log(`  lastRefillTime: ${state.lastRefillTime ? new Date(state.lastRefillTime).toLocaleString() : '从未补充'}`)
  console.log(`  dailyRefillCount: ${state.dailyRefillCount}`)
  console.log(`  currentDate: ${state.currentDate}`)
  console.log(`  minInterval: ${Math.round(state.minInterval / 1000 / 60)}分钟`)
  console.log(`  maxDailyRefills: ${state.maxDailyRefills}`)
  console.log(`  triggerThreshold: ${(state.triggerThreshold * 100).toFixed(0)}%`)

  // 3. 检查推荐池实际状态
  console.log('\n📦 推荐池实际状态:')
  const recommended = await db.feedArticles
    .filter(a => a.poolStatus === 'recommended' && !a.isRead && a.feedback !== 'dismissed')
    .toArray()
  
  console.log(`  当前数量: ${recommended.length}/${strategy.strategy.recommendation.targetPoolSize}`)
  console.log(`  填充率: ${(recommended.length / strategy.strategy.recommendation.targetPoolSize * 100).toFixed(0)}%`)
  
  if (recommended.length > 0) {
    const scores = recommended.map(a => a.analysisScore || 0).sort((a, b) => b - a)
    console.log(`  评分范围: ${scores[scores.length - 1].toFixed(2)} - ${scores[0].toFixed(2)}`)
  }

  // 4. 检查是否应该补充
  console.log('\n🔍 补充决策分析:')
  const shouldRefill = await refillManager.shouldRefill(
    recommended.length,
    strategy.strategy.recommendation.targetPoolSize
  )
  
  console.log(`  是否应该补充: ${shouldRefill ? '✅ 是' : '❌ 否'}`)
  
  if (!shouldRefill) {
    const fillRate = recommended.length / strategy.strategy.recommendation.targetPoolSize
    const timeSinceLastRefill = Date.now() - state.lastRefillTime
    
    console.log('\n  限制原因分析:')
    console.log(`    填充率检查: ${(fillRate * 100).toFixed(0)}% > ${(state.triggerThreshold * 100).toFixed(0)}% = ${fillRate > state.triggerThreshold ? '❌ 不需要补充' : '✅ 需要补充'}`)
    console.log(`    冷却期检查: ${Math.round(timeSinceLastRefill / 1000 / 60)}分钟 < ${Math.round(state.minInterval / 1000 / 60)}分钟 = ${timeSinceLastRefill < state.minInterval ? '❌ 冷却中' : '✅ 已冷却'}`)
    console.log(`    每日限额检查: ${state.dailyRefillCount} < ${state.maxDailyRefills} = ${state.dailyRefillCount < state.maxDailyRefills ? '✅ 未达限额' : '❌ 已达限额'}`)
  }

  // 5. 检查候选池
  console.log('\n📋 候选池状态:')
  const candidates = await db.feedArticles
    .filter(a => a.poolStatus === 'candidate' && a.analysisScore >= strategy.strategy.candidatePool.entryThreshold)
    .toArray()
  
  console.log(`  合格文章: ${candidates.length}`)
  console.log(`  准入阈值: ${strategy.strategy.candidatePool.entryThreshold.toFixed(2)}`)
  
  if (candidates.length > 0) {
    const scores = candidates.map(a => a.analysisScore || 0).sort((a, b) => b - a)
    console.log(`  评分范围: ${scores[scores.length - 1].toFixed(2)} - ${scores[0].toFixed(2)}`)
  }

  console.log('\n=== 验证完成 ===')
}

// 导出供控制台使用
window.verifyStrategyConfig = verifyStrategyConfig
console.log('已加载验证脚本，运行 verifyStrategyConfig() 开始验证')
