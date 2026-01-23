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
  
  /** 最大基准分数（上限，防止门槛过高） */
  maximumBaseline?: number
}

const DEFAULT_CONFIG: HistoricalScoreConfig = {
  strategy: 'recent',
  recentCount: 20, // 默认 20 条，实际使用时会根据推荐池大小动态调整
  enabled: true,
  minimumBaseline: 0.55, // 略低于 qualityThreshold (0.8)，给新推荐一点机会
  maximumBaseline: 0.85  // Phase 9: 匹配 qualityThreshold 0.8 的严格标准，允许基准上升到更高水平
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
    let historicalArticles: Array<{ score: number; popupAddedAt: number }>
    
    if (finalConfig.strategy === 'daily') {
      // 策略A：获取当天的弹窗推荐
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)
      const todayStartMs = todayStart.getTime()
      
      // 从 feedArticles 查询 poolStatus='popup' 或 poolStatus='exited' 的文章
      historicalArticles = await db.feedArticles
        .where('poolStatus')
        .anyOf(['popup', 'exited'])
        .filter(a => (a.popupAddedAt || 0) > todayStartMs && a.analysisScore !== undefined)
        .toArray()
        .then(articles => articles.map(a => ({ 
          score: a.analysisScore!, 
          popupAddedAt: a.popupAddedAt || 0 
        })))
      
      scoreLogger.debug(`策略A（当天）: 获取到 ${historicalArticles.length} 条推荐`)
      
    } else {
      // 策略B：获取最近 N 条推荐
      // 从 feedArticles 查询 poolStatus='popup' 或 poolStatus='exited' 的文章
      historicalArticles = await db.feedArticles
        .where('poolStatus')
        .anyOf(['popup', 'exited'])
        .filter(a => a.analysisScore !== undefined && a.popupAddedAt !== undefined)
        .reverse()
        .sortBy('popupAddedAt')
        .then(articles => articles
          .slice(0, finalConfig.recentCount || 20)
          .map(a => ({ 
            score: a.analysisScore!, 
            popupAddedAt: a.popupAddedAt || 0 
          })))
      
      scoreLogger.debug(`策略B（最近${finalConfig.recentCount}条）: 获取到 ${historicalArticles.length} 条推荐`)
    }
    
    // 如果没有历史数据，返回 null
    if (historicalArticles.length === 0) {
      scoreLogger.info('📊 无历史推荐数据，跳过基准检查')
      return null
    }
    
    // 计算平均分
    const totalScore = historicalArticles.reduce((sum, rec) => sum + rec.score, 0)
    const averageScore = totalScore / historicalArticles.length
    
    // 应用最低和最高基准限制
    let baseline = averageScore
    baseline = Math.max(baseline, finalConfig.minimumBaseline || 0)  // 应用最低基准
    baseline = Math.min(baseline, finalConfig.maximumBaseline || 1)  // 应用最高基准
    
    scoreLogger.info(`📊 历史评分基准: ${baseline.toFixed(3)} (平均分: ${averageScore.toFixed(3)}, 样本: ${historicalArticles.length} 条, 范围: ${(finalConfig.minimumBaseline || 0).toFixed(2)}-${(finalConfig.maximumBaseline || 1).toFixed(2)})`)
    
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
