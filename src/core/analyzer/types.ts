/**
 * 文本分析相关类型定义
 */

/**
 * 关键词及其权重
 */
export interface Keyword {
  word: string // 关键词
  weight: number // 权重 (0-1)
}

/**
 * 语言类型
 */
export type Language = "zh" | "en" | "other"

/**
 * 文本分析选项
 */
export interface TextAnalysisOptions {
  /** 返回前 K 个关键词 */
  topK?: number
  /** 最小词长（字符数） */
  minWordLength?: number
  /** 是否使用词形还原 */
  useStemming?: boolean
}

/**
 * 分词结果
 */
export interface TokenizeResult {
  tokens: string[] // 分词后的词列表
  language: Language // 检测到的语言
}
