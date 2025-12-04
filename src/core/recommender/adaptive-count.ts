/**
 * 推荐数量自适应调整模块
 * Phase 6: 根据用户行为智能调整推荐数量
 */

const STORAGE_KEY = "adaptive-metrics"

/**
 * 自适应指标
 */
export interface AdaptiveMetrics {
  /** 推荐总数（最近30天） */
  totalRecommendations: number
  
  /** 点击数 */
  clickCount: number
  
  /** 单个不想读数 */
  dismissCount: number
  
  /** 全部不想读次数（强信号） */
  dismissAllCount: number
  
  /** 弹窗打开记录（时间戳数组） */
  popupOpenTimestamps: number[]
  
  /** 最后更新时间 */
  lastUpdated: number
}

/**
 * 默认指标
 */
const DEFAULT_METRICS: AdaptiveMetrics = {
  totalRecommendations: 0,
  clickCount: 0,
  dismissCount: 0,
  dismissAllCount: 0,
  popupOpenTimestamps: [],
  lastUpdated: Date.now()
}

/**
 * 获取自适应指标
 */
export async function getAdaptiveMetrics(): Promise<AdaptiveMetrics> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const metrics = result[STORAGE_KEY] as AdaptiveMetrics | undefined
    
    if (!metrics) {
      return DEFAULT_METRICS
    }
    
    // 清理30天前的数据
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
    const validTimestamps = metrics.popupOpenTimestamps.filter(
      (ts) => ts > thirtyDaysAgo
    )
    
    return {
      ...metrics,
      popupOpenTimestamps: validTimestamps
    }
  } catch (error) {
    console.error("[AdaptiveMetrics] 加载失败:", error)
    return DEFAULT_METRICS
  }
}

/**
 * 保存自适应指标
 */
async function saveMetrics(metrics: AdaptiveMetrics): Promise<void> {
  try {
    await chrome.storage.local.set({
      [STORAGE_KEY]: {
        ...metrics,
        lastUpdated: Date.now()
      }
    })
  } catch (error) {
    console.error("[AdaptiveMetrics] 保存失败:", error)
  }
}

/**
 * 记录弹窗打开
 */
export async function trackPopupOpen(): Promise<void> {
  const metrics = await getAdaptiveMetrics()
  metrics.popupOpenTimestamps.push(Date.now())
  await saveMetrics(metrics)
  
}

/**
 * 记录推荐点击
 */
export async function trackRecommendationClick(): Promise<void> {
  const metrics = await getAdaptiveMetrics()
  metrics.clickCount++
  await saveMetrics(metrics)
  
}

/**
 * 记录单个不想读
 */
export async function trackDismiss(): Promise<void> {
  const metrics = await getAdaptiveMetrics()
  metrics.dismissCount++
  await saveMetrics(metrics)
  
}

/**
 * 记录全部不想读（强信号）
 */
export async function trackDismissAll(): Promise<void> {
  const metrics = await getAdaptiveMetrics()
  metrics.dismissAllCount++
  await saveMetrics(metrics)
  
}

/**
 * 记录新推荐生成
 */
export async function trackRecommendationGenerated(count: number): Promise<void> {
  const metrics = await getAdaptiveMetrics()
  metrics.totalRecommendations += count
  await saveMetrics(metrics)
}

/**
 * 计算弹窗打开频率（次/天）
 */
function calculatePopupFrequency(metrics: AdaptiveMetrics): number {
  if (metrics.popupOpenTimestamps.length === 0) {
    return 0
  }
  
  const now = Date.now()
  const oneDayAgo = now - 24 * 60 * 60 * 1000
  const recentOpens = metrics.popupOpenTimestamps.filter((ts) => ts > oneDayAgo)
  
  return recentOpens.length
}

/**
 * 计算点击率
 */
function calculateClickRate(metrics: AdaptiveMetrics): number {
  if (metrics.totalRecommendations === 0) {
    return 0
  }
  return metrics.clickCount / metrics.totalRecommendations
}

/**
 * 计算不想读率
 */
function calculateDismissRate(metrics: AdaptiveMetrics): number {
  if (metrics.totalRecommendations === 0) {
    return 0
  }
  return metrics.dismissCount / metrics.totalRecommendations
}

/**
 * 调整推荐数量（自适应算法）
 * 
 * 影响因素：
 * 1. 全部不想读次数（强信号，大幅减少）
 * 2. 不想读率（轻信号，小幅减少）
 * 3. 点击率（正向信号，增加）
 * 4. 弹窗打开频率（正向信号，增加）
 * 
 * @param currentCount 当前推荐数量
 * @returns 调整后的推荐数量（1-5）
 */
export async function adjustRecommendationCount(
  currentCount: number
): Promise<number> {
  const metrics = await getAdaptiveMetrics()
  
  // 计算各项指标
  const dismissRate = calculateDismissRate(metrics)
  const clickRate = calculateClickRate(metrics)
  const popupFrequency = calculatePopupFrequency(metrics)
  
  let adjustment = 0
  
  // 1. 全部不想读（强信号）- 最近频繁点击
  if (metrics.dismissAllCount >= 3) {
    adjustment -= 2 // 强烈减少
  } else if (metrics.dismissAllCount >= 1) {
    adjustment -= 1 // 减少
  }
  
  // 2. 单个不想读率
  if (dismissRate > 0.7) {
    adjustment -= 1 // 不想读率高，减少
  }
  
  // 3. 点击率（正向）
  if (clickRate > 0.5) {
    adjustment += 1 // 点击率高，增加
  }
  
  // 4. 弹窗打开频率（正向）
  if (popupFrequency >= 5) {
    adjustment += 1 // 高频打开，增加
  }
  
  // 计算新数量（限制在1-5范围内）
  const newCount = Math.max(1, Math.min(5, currentCount + adjustment))
  
  
  return newCount
}

/**
 * 定期评估并调整推荐数量（建议每周运行一次）
 */
export async function evaluateAndAdjust(): Promise<number> {
  const { getRecommendationConfig, saveRecommendationConfig } = await import(
    "../../storage/recommendation-config"
  )
  
  const config = await getRecommendationConfig()
  const newCount = await adjustRecommendationCount(config.maxRecommendations)
  
  if (newCount !== config.maxRecommendations) {
    await saveRecommendationConfig({ maxRecommendations: newCount })
  }
  
  return newCount
}

/**
 * 重置全部不想读计数（用于给用户新机会）
 */
export async function resetDismissAllCount(): Promise<void> {
  const metrics = await getAdaptiveMetrics()
  metrics.dismissAllCount = 0
  await saveMetrics(metrics)
}
