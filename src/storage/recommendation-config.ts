/**
 * 推荐系统配置
 * Phase 6: AI 推荐引擎
 * 
 * 设计理念：
 * - 默认使用全文分析（后台异步，时效性要求不高）
 * - 用户只需选择成本相关（推理模式）和隐私相关（本地AI）的选项
 * - 推荐数量由系统根据用户行为自动调整
 */

const STORAGE_KEY = "recommendation-config"

/**
 * 推荐配置接口
 */
export interface RecommendationConfig {
  /** 是否使用推理模式（DeepSeek-R1等，成本更高但质量更好） */
  useReasoning: boolean
  
  /** 是否使用本地AI（Ollama/Chrome AI，隐私保护但消耗性能） */
  useLocalAI: boolean
  
  /** 
   * 推荐条目数（1-5，由系统自动调整）
   * 根据用户清理推荐的速度自动优化：
   * - 清理快（频繁点"不想读"）→ 推荐少
   * - 清理慢（推荐停留时间长）→ 推荐多
   */
  maxRecommendations: number
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: RecommendationConfig = {
  useReasoning: false, // 默认不使用推理模式（成本考虑）
  useLocalAI: false,   // 默认不使用本地AI（性能考虑）
  maxRecommendations: 3 // 初始值3条，后续自动调整
}

/**
 * 获取推荐配置
 */
export async function getRecommendationConfig(): Promise<RecommendationConfig> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    const config = result[STORAGE_KEY] as RecommendationConfig | undefined
    
    return {
      ...DEFAULT_CONFIG,
      ...config
    }
  } catch (error) {
    console.error("[RecommendationConfig] 加载失败:", error)
    return DEFAULT_CONFIG
  }
}

/**
 * 保存推荐配置
 */
export async function saveRecommendationConfig(
  config: Partial<RecommendationConfig>
): Promise<void> {
  try {
    const current = await getRecommendationConfig()
    const updated = { ...current, ...config }
    
    // 验证 maxRecommendations 范围（1-5）
    if (updated.maxRecommendations < 1) {
      updated.maxRecommendations = 1
    }
    if (updated.maxRecommendations > 5) {
      updated.maxRecommendations = 5
    }
    
    await chrome.storage.local.set({ [STORAGE_KEY]: updated })
    console.log("[RecommendationConfig] 配置已保存:", updated)
  } catch (error) {
    console.error("[RecommendationConfig] 保存失败:", error)
    throw error
  }
}

/**
 * 监听配置变化
 */
export function watchRecommendationConfig(
  callback: (config: RecommendationConfig) => void
): () => void {
  const listener = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ) => {
    if (areaName === "local" && changes[STORAGE_KEY]) {
      const newConfig = {
        ...DEFAULT_CONFIG,
        ...(changes[STORAGE_KEY].newValue as RecommendationConfig)
      }
      callback(newConfig)
    }
  }

  chrome.storage.onChanged.addListener(listener)

  // 返回取消监听函数
  return () => {
    chrome.storage.onChanged.removeListener(listener)
  }
}