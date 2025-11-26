/**
 * 分析引擎类型定义
 * Phase 9: 将AI能力选择场景化
 */

/**
 * 分析引擎类型
 * - remoteAI: 使用远程 AI 服务（OpenAI、Anthropic、DeepSeek）
 * - remoteAIWithReasoning: 使用带推理能力的远程 AI（DeepSeek Reasoner等）
 * - localAI: 使用本地 AI（Ollama、Chrome AI）
 * - keyword: 仅使用关键字匹配（TF-IDF算法，内部降级使用，不对用户暴露）
 */
export type AnalysisEngine = 
  | 'remoteAI'
  | 'remoteAIWithReasoning'
  | 'localAI'
  | 'keyword'

/**
 * 订阅源分析引擎类型（不包含推理AI，因为成本高、速度慢）
 * keyword 仅作为内部降级选项，不在 UI 中暴露
 */
export type FeedAnalysisEngine = 
  | 'remoteAI'
  | 'localAI'
  | 'keyword'

/**
 * 推荐系统分析引擎类型（包含所有选项）
 */
export type RecommendationAnalysisEngine = AnalysisEngine

/**
 * 分析引擎能力状态
 */
export interface AnalysisEngineCapability {
  /** 是否可用 */
  available: boolean
  /** 不可用原因 */
  reason?: string
}

/**
 * 所有分析引擎的能力状态
 */
export interface AnalysisEngineCapabilities {
  remoteAI: AnalysisEngineCapability
  remoteAIWithReasoning: AnalysisEngineCapability
  localAI: AnalysisEngineCapability
  keyword: AnalysisEngineCapability
}
