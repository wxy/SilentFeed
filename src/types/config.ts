/**
 * 设置与配置类型
 */

/**
 * 停留时间配置
 */
export interface DwellTimeConfig {
  mode: "auto" | "fixed"
  fixedThreshold: number
  minThreshold: number
  maxThreshold: number
  calculatedThreshold: number
}

/**
 * 用户设置（单例）
 */
export interface UserSettings {
  id: "singleton"
  aiConfig?: {
    provider: "openai" | "anthropic" | "deepseek" | "chrome" | "none"
    apiKey?: string
    baseURL?: string
    model?: string
  }
  dwellTime: DwellTimeConfig
  exclusionRules: {
    autoExcludeIntranet: boolean
    autoExcludeSensitive: boolean
    customDomains: string[]
  }
  dataRetention: {
    rawVisitsDays: number
    statisticsDays: number
  }
  initPhase?: {
    completed: boolean
    pageCount: number
  }
  notifications?: {
    enabled: boolean
    dailyLimit: number
  }
  
  /** Phase 10: 数据迁移标记 */
  migrations?: {
    phase10Completed?: boolean
  }
}
