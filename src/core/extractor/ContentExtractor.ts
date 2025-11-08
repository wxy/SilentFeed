/**
 * 内容提取器
 *
 * 从网页中提取结构化内容：
 * - 元数据（title, description, keywords）
 * - 正文内容（优先 article/main 标签）
 * - 语言检测
 */

import type { PageContent, ExtractorConfig } from "./types"

/**
 * 默认配置
 */
const DEFAULT_CONFIG: ExtractorConfig = {
  maxContentLength: 2000,
  extractMetadata: true,
  extractContent: true,
}

/**
 * 内容提取器类
 */
export class ContentExtractor {
  private config: ExtractorConfig

  constructor(config: Partial<ExtractorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 提取页面内容
   * @param doc 文档对象（浏览器环境传 document）
   * @returns 提取的页面内容
   */
  extract(doc: Document = document): PageContent {
    const title = this.extractTitle(doc)
    const description = this.extractDescription(doc)
    const metaKeywords = this.extractMetaKeywords(doc)
    const content = this.config.extractContent
      ? this.extractMainContent(doc)
      : ""
    const language = this.detectLanguage(title + " " + description + " " + content)

    return {
      title,
      description,
      content,
      language,
      metaKeywords,
    }
  }

  /**
   * 提取标题
   */
  private extractTitle(doc: Document): string {
    // 1. 优先使用 og:title
    const ogTitle = doc.querySelector('meta[property="og:title"]')
    if (ogTitle) {
      const content = ogTitle.getAttribute("content")
      if (content) return content.trim()
    }

    // 2. 使用 document.title
    if (doc.title) {
      return doc.title.trim()
    }

    // 3. 使用第一个 h1
    const h1 = doc.querySelector("h1")
    if (h1) {
      return h1.textContent?.trim() || ""
    }

    return ""
  }

  /**
   * 提取描述
   */
  private extractDescription(doc: Document): string {
    // 1. 优先使用 og:description
    const ogDesc = doc.querySelector('meta[property="og:description"]')
    if (ogDesc) {
      const content = ogDesc.getAttribute("content")
      if (content) return content.trim()
    }

    // 2. 使用 meta description
    const metaDesc = doc.querySelector('meta[name="description"]')
    if (metaDesc) {
      const content = metaDesc.getAttribute("content")
      if (content) return content.trim()
    }

    // 3. 使用第一段文字
    const firstP = doc.querySelector("article p, main p, p")
    if (firstP) {
      const text = firstP.textContent?.trim() || ""
      return text.slice(0, 200)
    }

    return ""
  }

  /**
   * 提取元数据关键词
   */
  private extractMetaKeywords(doc: Document): string[] {
    const metaKeywords = doc.querySelector('meta[name="keywords"]')
    if (!metaKeywords) return []

    const content = metaKeywords.getAttribute("content")
    if (!content) return []

    return content
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
  }

  /**
   * 提取正文内容
   *
   * 策略：
   * 1. 优先使用 <article> 标签
   * 2. 其次使用 <main> 标签
   * 3. 最后使用 body（但排除 header, footer, nav, aside）
   */
  private extractMainContent(doc: Document): string {
    // 1. 尝试 article 标签
    const article = doc.querySelector("article")
    if (article) {
      return this.cleanText(article.textContent || "")
    }

    // 2. 尝试 main 标签
    const main = doc.querySelector("main")
    if (main) {
      return this.cleanText(main.textContent || "")
    }

    // 3. 尝试常见的内容类名
    const contentSelectors = [
      ".article-content",
      ".post-content",
      ".entry-content",
      ".content",
      "#content",
      ".main-content",
    ]

    for (const selector of contentSelectors) {
      const element = doc.querySelector(selector)
      if (element) {
        return this.cleanText(element.textContent || "")
      }
    }

    // 4. 回退：提取所有段落
    const paragraphs = Array.from(doc.querySelectorAll("p"))
      .filter((p) => {
        // 排除导航、侧边栏、页脚中的段落
        const parent = p.closest("nav, aside, footer, header")
        return !parent
      })
      .map((p) => p.textContent?.trim() || "")
      .filter((text) => text.length > 50) // 过滤太短的段落

    return this.cleanText(paragraphs.join("\n"))
  }

  /**
   * 清理文本
   * - 移除多余空白
   * - 限制长度
   */
  private cleanText(text: string): string {
    // 移除多余空白
    let cleaned = text
      .replace(/\s+/g, " ") // 多个空白 → 单个空格
      .replace(/\n\s*\n/g, "\n") // 多个换行 → 单个换行
      .trim()

    // 限制长度
    if (cleaned.length > this.config.maxContentLength) {
      cleaned = cleaned.slice(0, this.config.maxContentLength)
    }

    return cleaned
  }

  /**
   * 检测语言
   *
   * 简单规则：
   * - 中文字符占比 > 30% → zh
   * - 否则 → en（默认）
   */
  private detectLanguage(text: string): "zh" | "en" | "other" {
    if (!text || text.length === 0) return "other"

    // 统计中文字符数量
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g)
    const chineseRatio = chineseChars ? chineseChars.length / text.length : 0

    if (chineseRatio > 0.3) {
      return "zh"
    }

    // 统计英文字母数量
    const englishChars = text.match(/[a-zA-Z]/g)
    const englishRatio = englishChars ? englishChars.length / text.length : 0

    if (englishRatio > 0.3) {
      return "en"
    }

    return "other"
  }
}

/**
 * 默认导出实例
 */
export const contentExtractor = new ContentExtractor()
