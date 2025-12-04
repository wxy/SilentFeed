/**
 * 文章全文抓取器
 * Phase 6: 推荐引擎
 * 
 * 功能：
 * - 抓取 RSS 文章的完整内容
 * - 提取正文，去除广告和无关内容
 * - 计算文章长度和预估阅读时长
 * 
 * 未来优化: 可集成 @mozilla/readability 提升提取质量
 */

/**
 * 文章内容
 */
export interface ArticleContent {
  /** 标题 */
  title: string
  /** 正文内容（纯文本） */
  textContent: string
  /** 正文内容（HTML） */
  htmlContent: string
  /** 摘要 */
  excerpt: string
  /** 字数统计 */
  wordCount: number
  /** 预估阅读时长（分钟） */
  readingTime: number
  /** 提取时间 */
  fetchedAt: number
}

/**
 * 抓取文章全文
 * 
 * @param url - 文章 URL
 * @returns 文章内容，失败返回 null
 */
export async function fetchArticleContent(
  url: string
): Promise<ArticleContent | null> {
  try {
    
    // 1. 获取网页内容
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SilentFeed/1.0; +https://github.com/wxy/SilentFeed)"
      }
    })
    
    if (!response.ok) {
      console.error(`[ArticleFetcher] HTTP 错误: ${response.status}`)
      return null
    }
    
    const html = await response.text()
    
    // 2. 简化的正文提取（使用 DOM 解析）
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, "text/html")
    
    // 移除脚本、样式和导航元素
    const unwantedSelectors = [
      "script",
      "style",
      "nav",
      "header",
      "footer",
      "aside",
      ".sidebar",
      ".advertisement",
      ".ad",
      "#comments"
    ]
    unwantedSelectors.forEach((selector) => {
      doc.querySelectorAll(selector).forEach((el) => el.remove())
    })
    
    // 提取标题
    const title =
      doc.querySelector("h1")?.textContent?.trim() ||
      doc.querySelector("title")?.textContent?.trim() ||
      "无标题"
    
    // 提取正文（通常在 article, main 或 .content 中）
    const contentElement =
      doc.querySelector("article") ||
      doc.querySelector("main") ||
      doc.querySelector(".content") ||
      doc.querySelector(".post") ||
      doc.body
    
    const htmlContent = contentElement?.innerHTML || ""
    const textContent = stripHtml(contentElement?.textContent || "")
    
    // 3. 计算字数和阅读时长
    const wordCount = countWords(textContent)
    const readingTime = calculateReadingTime(wordCount)
    
    // 4. 生成摘要
    const excerpt = generateExcerpt(textContent)
    
    
    return {
      title,
      textContent,
      htmlContent,
      excerpt,
      wordCount,
      readingTime,
      fetchedAt: Date.now()
    }
  } catch (error) {
    console.error("[ArticleFetcher] 抓取失败:", error)
    return null
  }
}

/**
 * 去除 HTML 标签并清理文本
 */
function stripHtml(text: string): string {
  return text
    .replace(/\s+/g, " ") // 合并空白字符
    .trim()
}

/**
 * 统计字数
 * - 中文：按字符数
 * - 英文：按单词数
 */
function countWords(text: string): number {
  // 提取中文字符
  const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || []
  
  // 提取英文单词
  const englishWords = text
    .replace(/[\u4e00-\u9fa5]/g, "") // 去除中文
    .match(/\b\w+\b/g) || []
  
  return chineseChars.length + englishWords.length
}

/**
 * 计算预估阅读时长（分钟）
 * 
 * 阅读速度参考：
 * - 中文：300-500 字/分钟（取 400）
 * - 英文：200-250 词/分钟（取 250）
 * 
 * 简化计算：统一按 250 words/min
 */
function calculateReadingTime(wordCount: number): number {
  const WORDS_PER_MINUTE = 250
  const minutes = Math.ceil(wordCount / WORDS_PER_MINUTE)
  return Math.max(1, minutes) // 至少 1 分钟
}

/**
 * 生成摘要
 * 取前 200 个字符
 */
function generateExcerpt(text: string, length: number = 200): string {
  if (text.length <= length) {
    return text
  }
  return text.substring(0, length) + "..."
}

/**
 * 批量抓取文章
 * 
 * @param urls - 文章 URL 列表
 * @param maxConcurrent - 最大并发数（避免过载）
 * @returns 文章内容列表
 */
export async function fetchArticlesBatch(
  urls: string[],
  maxConcurrent: number = 3
): Promise<Array<{ url: string; content: ArticleContent | null }>> {
  const results: Array<{ url: string; content: ArticleContent | null }> = []
  
  // 分批处理
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent)
    const batchResults = await Promise.all(
      batch.map(async (url) => ({
        url,
        content: await fetchArticleContent(url)
      }))
    )
    results.push(...batchResults)
  }
  
  return results
}
