import type { Keyword, Language, TextAnalysisOptions, TokenizeResult } from "./types"

/**
 * 停用词列表
 */
const STOP_WORDS = {
  zh: new Set([
    "的", "了", "在", "是", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
    "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
    "自己", "这", "当", "下", "能", "而", "过", "来", "他", "她", "它", "我们",
    "你们", "他们", "这个", "那个", "什么", "怎么", "为什么", "因为", "所以",
    "但是", "如果", "或者", "以及", "关于", "对于", "由于", "根据", "通过",
    "可以", "应该", "需要", "必须", "可能", "或许", "也许", "一些", "许多",
    "大量", "少量", "所有", "任何", "每个", "各种", "不同", "相同", "类似",
    "这样", "那样", "如此", "非常", "特别", "尤其", "特殊", "一般", "通常",
    "经常", "总是", "从来", "很少", "偶尔", "有时", "现在", "以前", "以后",
    "立即", "马上", "不久", "最近", "最终", "最后", "首先", "然后", "接着",
    "另外", "此外", "而且", "并且", "同时", "与此", "然而", "相反", "尽管"
  ]),
  en: new Set([
    "the", "be", "to", "of", "and", "a", "in", "that", "have", "i", "it", "for",
    "not", "on", "with", "he", "as", "you", "do", "at", "this", "but", "his",
    "by", "from", "they", "we", "say", "her", "she", "or", "an", "will", "my",
    "one", "all", "would", "there", "their", "what", "so", "up", "out", "if",
    "about", "who", "get", "which", "go", "me", "when", "make", "can", "like",
    "time", "no", "just", "him", "know", "take", "people", "into", "year",
    "your", "good", "some", "could", "them", "see", "other", "than", "then",
    "now", "look", "only", "come", "its", "over", "think", "also", "back",
    "after", "use", "two", "how", "our", "work", "first", "well", "way",
    "even", "new", "want", "because", "any", "these", "give", "day", "most", "us"
  ])
}

/**
 * 文本分析引擎（无依赖版本）
 *
 * 提供关键词提取、中英文分词、停用词过滤等功能
 * 
 * @example
 * ```typescript
 * const analyzer = new TextAnalyzer()
 * const keywords = analyzer.extractKeywords("深入理解 React Hooks", { topK: 10 })
 * console.log(keywords) // [{ word: 'react', weight: 0.8 }, ...]
 * ```
 */
export class TextAnalyzer {
  /**
   * 提取关键词
   *
   * @param text 输入文本
   * @param options 分析选项
   * @returns 关键词及权重列表
   */
  extractKeywords(text: string, options: TextAnalysisOptions = {}): Keyword[] {
    const { topK = 20, minWordLength = 2 } = options

    // 1. 分词
    const { tokens, language } = this.tokenize(text)

    // 2. 移除停用词
    const filtered = this.removeStopwords(tokens, language)

    // 3. 过滤短词
    const validTokens = filtered.filter((token) => token.length >= minWordLength)

    if (validTokens.length === 0) {
      return []
    }

    // 4. 计算词频权重
    const termFrequency = this.calculateTermFrequency(validTokens)
    
    // 转换为 Keyword 格式并排序
    const keywords: Keyword[] = Array.from(termFrequency.entries())
      .map(([word, weight]) => ({ word, weight }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, topK)

    return keywords
  }

  /**
   * 文本分词
   *
   * @param text 输入文本
   * @returns 分词结果和语言
   */
  tokenize(text: string): TokenizeResult {
    if (!text || text.trim().length === 0) {
      return { tokens: [], language: "other" }
    }

    // 检测语言
    const language = this.detectLanguage(text)
    
    // 清理文本
    const cleanText = text
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!cleanText) {
      return { tokens: [], language }
    }

    const tokens: string[] = []
    
    if (language === 'zh') {
      // 中文分词（简化版，按字分割）
      for (let i = 0; i < cleanText.length; i++) {
        const char = cleanText[i]
        if (/[\u4e00-\u9fa5]/.test(char)) {
          tokens.push(char)
        }
      }
    } else {
      // 英文分词
      const words = cleanText.match(/[a-zA-Z]+/g) || []
      tokens.push(...words.filter(word => word.length >= 2))
    }

    return { tokens, language }
  }

  /**
   * 移除停用词
   *
   * @param tokens 词列表
   * @param language 语言类型
   * @returns 过滤后的词列表
   */
  removeStopwords(tokens: string[], language: Language = "en"): string[] {
    if (tokens.length === 0) {
      return []
    }

    const stopWords = language === 'zh' ? STOP_WORDS.zh : STOP_WORDS.en
    return tokens.filter(token => !stopWords.has(token))
  }

  /**
   * 检测文本语言
   *
   * @param text 输入文本
   * @returns 语言类型
   */
  detectLanguage(text: string): Language {
    if (!text || text.trim().length === 0) {
      return "other"
    }

    // 统计中文字符数量
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length
    const totalChars = text.replace(/\s/g, "").length

    if (totalChars === 0) {
      return "other"
    }

    const chineseRatio = chineseChars / totalChars

    // 如果中文字符占比 > 30%，认为是中文
    if (chineseRatio > 0.3) {
      return "zh"
    }

    // 检测是否有英文字母
    const hasEnglish = /[a-zA-Z]/.test(text)
    if (hasEnglish) {
      return "en"
    }

    return "other"
  }

  /**
   * 计算词频
   *
   * @param tokens 词列表
   * @returns 词频映射
   */
  private calculateTermFrequency(tokens: string[]): Map<string, number> {
    const frequency = new Map<string, number>()
    
    // 统计词频
    tokens.forEach(token => {
      frequency.set(token, (frequency.get(token) || 0) + 1)
    })

    // 归一化到 [0, 1]
    const totalTokens = tokens.length
    frequency.forEach((count, word) => {
      frequency.set(word, count / totalTokens)
    })

    return frequency
  }

  /**
   * 清理资源
   */
  clear(): void {
    // 无需清理，无状态实现
  }
}

/**
 * 默认导出实例
 */
export const textAnalyzer = new TextAnalyzer()