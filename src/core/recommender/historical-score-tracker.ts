/**
 * 历史评分追踪器
 * 
 * 用于计算历史推荐评分基准，防止低分推荐持续进入推荐池
 * 
 * 策略：
 * - 策略A：基于当天推荐的平均分
 * - 策略B：基于最近 N 条推荐的平均分（默认）
 */

import { db } from '@/storage/db'
import { logger } from '@/utils/logger'

const scoreLogger = logger.withTag('HistoricalScore')

/**
 * 历史评分基准配置
 */
export interface HistoricalScoreConfig {
  /** 策略类型 */
  strategy: 'daily' | 'recent'
  
  /** 最近 N 条推荐（策略B） */
  recentCount?: number
  
  /** 是否启用（默认启用） */
  enabled?: boolean
  
  /** 最低基准分数（兜底，避免基准过低） */
  minimumBaseline?: number
}

const DEFAULT_CONFIG: HistoricalScoreConfig = {
  strategy: 'recent',
  recentCount: 20,
  enabled: true,
  minimumBaseline: 0.55 // 略低于 qualityThreshold (0.6)，给新推荐一点机会
}

/**
 * 获取历史评分基准
 * 
 * @param config 配置参数
 * @returns 基准分数，如果没有历史数据则返回 null
 */
export async function getHistoricalScoreBaseline(
  config: Partial<HistoricalScoreConfig> = {}
): Promise<number | null> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config }
  
  if (!finalConfig.enabled) {
    scoreLogger.debug('历史评分基准已禁用')
    return null
  }
  
  try {
    let historicalRecommendations: Array<{ score: number; recommendedAt: number }>
    
    if (finalConfig.strategy === 'daily') {
      // 策略A：获取当天的推荐
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayStartMs = todayStart.getTime()
      
      historicalRecommendations = await db.recommendations
        .where('recommendedAt')
        .above(todayStartMs)
        .toArray()
        .then(recs => recs.map(r => ({ score: r.score, recommendedAt: r.recommendedAt })))
      
      scoreLogger.debug(`策略A（当天）: 获取到 ${historicalRecommendations.length} 条推荐`)
      
    } else {
      // 策略B：获取最近 N 条推荐
      historicalRecommendations = await db.recommendations
        .orderBy('recommendedAt')
        .reverse()
        .limit(finalConfig.recentCount || 20)
        .toArray()
        .then(recs => recs.map(r => ({ score: r.score, recommendedAt: r.recommendedAt })))
      
      scoreLogger.debug(`策略B（最近${finalConfig.recentCount}条）: 获取到 ${historicalRecommendations.length} 条推荐`)
    }
    
    // 如果没有历史数据，返回 null
    if (historicalRecommendations.length === 0) {
      scoreLogger.info('📊 无历史推荐数据，跳过基准检查')
      return null
    }
    
    // 计算平均分
    const totalScore = historicalRecommendations.reduce((sum, rec) => sum + rec.score, 0)
    const averageScore = totalScore / historicalRecommendations.length
    
    // 应用最低基准
    const baseline = Math.max(averageScore, finalConfig.minimumBaseline || 0)
    
    scoreLogger.info(`📊 历史评分基准: ${baseline.toFixed(3)} (平均分: ${averageScore.toFixed(3)}, 样本: ${historicalRecommendations.length} 条)`)
    
    return baseline
    
  } catch (error) {
    scoreLogger.error('计算历史评分基准失败:', error)
    return null
  }
}

/**
 * 检查新推荐是否符合历史基准
 * 
 * @param newScore 新推荐的评分
 * @param config 配置参数
 * @returns true 表示符合基准（可以进入推荐池），false 表示不符合
 */
export async function passesHistoricalBaseline(
  newScore: number,
  config: Partial<HistoricalScoreConfig> = {}
): Promise<boolean> {
  const baseline = await getHistoricalScoreBaseline(config)
  
  // 如果没有历史基准，放行
  if (baseline === null) {
    return true
  }
  
  // 新推荐必须达到或超过基准
  const passes = newScore >= baseline
  
  if (!passes) {
    scoreLogger.info(`❌ 新推荐评分 ${newScore.toFixed(3)} 低于历史基准 ${baseline.toFixed(3)}，拒绝进入推荐池`)
  } else {
    scoreLogger.debug(`✅ 新推荐评分 ${newScore.toFixed(3)} 符合历史基准 ${baseline.toFixed(3)}`)
  }
  
  return passes
}

/**
 * 批量检查多个推荐是否符合基准
 * 
 * @param scores 推荐评分数组
 * @param config 配置参数
 * @returns 符合基准的推荐索引数组
 */
export async function filterByHistoricalBaseline(
  scores: number[],
  config: Partial<HistoricalScoreConfig> = {}
): Promise<number[]> {
  const baseline = await getHistoricalScoreBaseline(config)
  
  // 如果没有历史基准，全部放行
  if (baseline === null) {
    return scores.map((_, index) => index)
  }
  
  const passedIndices = scores
    .map((score, index) => ({ score, index }))
    .filter(({ score }) => score >= baseline)
    .map(({ index }) => index)
  
  const filteredCount = scores.length - passedIndices.length
  if (filteredCount > 0) {
    scoreLogger.info(`📊 基于历史基准过滤: ${filteredCount}/${scores.length} 条推荐被拒绝`)
  }
  
  return passedIndices
}
