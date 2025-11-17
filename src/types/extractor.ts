/**
 * 内容提取器相关类型
 */

/**
 * 网页内容
 */
export interface PageContent {
  title: string
  description: string
  content: string
  language: "zh" | "en" | "other"
  metaKeywords: string[]
}

/**
 * 提取配置
 */
export interface ExtractorConfig {
  maxContentLength: number
  extractMetadata: boolean
  extractContent: boolean
}
