/**
 * 内容提取器类型定义
 */

/**
 * 网页内容
 */
export interface PageContent {
  /** 页面标题 */
  title: string
  /** 页面描述 */
  description: string
  /** 正文内容（前 2000 字） */
  content: string
  /** 语言 */
  language: "zh" | "en" | "other"
  /** 元数据关键词 */
  metaKeywords: string[]
}

/**
 * 提取配置
 */
export interface ExtractorConfig {
  /** 最大内容长度 */
  maxContentLength: number
  /** 是否提取元数据 */
  extractMetadata: boolean
  /** 是否提取正文 */
  extractContent: boolean
}
