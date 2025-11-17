/**
 * 文本分析相关类型
 */

/**
 * 关键词及其权重
 */
export interface Keyword {
  word: string
  weight: number
}

/**
 * 语言类型
 */
export type Language = "zh" | "en" | "other"

/**
 * 文本分析选项
 */
export interface TextAnalysisOptions {
  topK?: number
  minWordLength?: number
  useStemming?: boolean
}

/**
 * 分词结果
 */
export interface TokenizeResult {
  tokens: string[]
  language: Language
}
