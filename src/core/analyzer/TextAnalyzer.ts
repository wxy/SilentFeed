import natural from "natural"
import * as stopword from "stopword"

import type { Keyword, Language, TextAnalysisOptions, TokenizeResult } from "./types"

/**
 * 文本分析引擎
 *
 * 提供 TF-IDF 关键词提取、中英文分词、停用词过滤等功能
 *
 * @example
 * ```typescript
 * const analyzer = new TextAnalyzer()
 * const keywords = analyzer.extractKeywords("深入理解 React Hooks", 10)
 * console.log(keywords) // [{ word: 'react', weight: 0.8 }, ...]
 * ```
 */
export class TextAnalyzer {
  private readonly tfidf: natural.TfIdf
  private readonly tokenizer: natural.WordTokenizer

  constructor() {
    this.tfidf = new natural.TfIdf()
    this.tokenizer = new natural.WordTokenizer()
  }

  /**
   * 提取关键词（TF-IDF）
   *
   * @param text 输入文本
   * @param options 分析选项
   * @returns 关键词及权重列表
   */
  extractKeywords(text: string, options: TextAnalysisOptions = {}): Keyword[] {
    const { topK = 20, minWordLength = 2, useStemming = true } = options

    // 1. 分词
    const { tokens, language } = this.tokenize(text)

    // 2. 移除停用词
    const filtered = this.removeStopwords(tokens, language)

    // 3. 过滤短词
    const validTokens = filtered.filter((token) => token.length >= minWordLength)

    if (validTokens.length === 0) {
      return []
    }

    // 4. 计算 TF-IDF
    this.tfidf.addDocument(validTokens)
    const docIndex = this.tfidf.documents.length - 1

    // 5. 获取所有词的 TF-IDF 分数
    const scores: Keyword[] = []
    const measured = new Set<string>()

    validTokens.forEach((token) => {
      // 避免重复计算
      const stemmedToken = useStemming ? this.stem(token, language) : token
      if (measured.has(stemmedToken)) {
        return
      }
      measured.add(stemmedToken)

      const score = this.tfidf.tfidf(stemmedToken, docIndex)
      if (score > 0) {
        scores.push({
          word: stemmedToken,
          weight: score
        })
      }
    })

    // 6. 排序并返回 Top K
    const sorted = scores.sort((a, b) => b.weight - a.weight).slice(0, topK)

    // 7. 归一化权重到 [0, 1]
    const maxWeight = sorted[0]?.weight || 1
    return sorted.map((kw) => ({
      word: kw.word,
      weight: kw.weight / maxWeight
    }))
  }

  /**
   * 中英文分词
   *
   * @param text 输入文本
   * @returns 分词结果和语言类型
   */
  tokenize(text: string): TokenizeResult {
    if (!text || text.trim().length === 0) {
      return { tokens: [], language: "other" }
    }

    // 检测语言
    const language = this.detectLanguage(text)

    // 标准化：转小写、移除特殊字符
    const normalized = text.toLowerCase().replace(/[^\w\s\u4e00-\u9fa5]/g, " ")

    let tokens: string[]

    if (language === "zh") {
      // 中文分词
      // natural 的 WordTokenizer 对中文支持有限，这里使用简单的字符分割
      // 未来可以集成更好的中文分词库（如 jieba）
      tokens = this.tokenizer.tokenize(normalized) || []

      // 过滤单字（通常不是有意义的词）
      tokens = tokens.filter((t) => t.length > 1)
    } else {
      // 英文分词
      tokens = this.tokenizer.tokenize(normalized) || []
    }

    // 过滤空白
    tokens = tokens.filter((t) => t.trim().length > 0)

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

    let filtered = tokens

    // 移除中文停用词
    if (language === "zh") {
      filtered = stopword.removeStopwords(filtered, stopword.zh)
    }

    // 移除英文停用词（中英混合文本也需要）
    filtered = stopword.removeStopwords(filtered, stopword.en)

    return filtered
  }

  /**
   * 检测文本语言
   *
   * 简单规则：检测中文字符占比
   *
   * @param text 输入文本
   * @returns 语言类型
   */
  detectLanguage(text: string): Language {
    if (!text || text.trim().length === 0) {
      return "other"
    }

    // 统计中文字符数量
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g) || []
    const totalChars = text.replace(/\s/g, "").length

    if (totalChars === 0) {
      return "other"
    }

    const chineseRatio = chineseChars.length / totalChars

    // 如果中文字符占比 > 20%，认为是中文（降低阈值，适应中英混合文本）
    if (chineseRatio > 0.2) {
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
   * 词形还原（Stemming）
   *
   * 将词还原为词根形式，如 running → run
   *
   * @param word 单词
   * @param language 语言类型
   * @returns 词根
   */
  private stem(word: string, language: Language): string {
    if (language === "zh") {
      // 中文暂不做词形还原
      return word
    }

    // 英文使用 Porter Stemmer
    return natural.PorterStemmer.stem(word)
  }

  /**
   * 清理资源
   *
   * 清空 TF-IDF 文档缓存，释放内存
   */
  clear(): void {
    this.tfidf.documents = []
  }
}
