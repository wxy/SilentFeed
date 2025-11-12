/**
 * 基于规则的推荐引擎
 * 
 * 实现TF-IDF相似度计算和时效性评分，为用户推荐最相关的RSS内容
 */

export interface ArticleData {
  id: string
  title: string
  content: string
  publishDate: Date
  feedId: string
  url: string
}

export interface RecommendationScore {
  articleId: string
  relevanceScore: number    // TF-IDF相似度 (0-1)
  freshnessScore: number   // 时效性评分 (0-1)  
  finalScore: number       // 综合评分 (0-1)
  keywords: string[]       // 匹配的关键词
}

export interface UserInterests {
  keywords: Array<{
    word: string
    weight: number
  }>
}

/**
 * TF-IDF计算器
 * 用于计算文档间的文本相似度
 */
class TFIDFCalculator {
  private documentFrequency: Map<string, number> = new Map()
  private totalDocuments: number = 0

  /**
   * 构建词频统计
   */
  buildVocabulary(articles: ArticleData[]): void {
    this.totalDocuments = articles.length
    this.documentFrequency.clear()

    for (const article of articles) {
      const words = this.tokenize(article.title + ' ' + article.content)
      const uniqueWords = new Set(words)

      for (const word of uniqueWords) {
        const count = this.documentFrequency.get(word) || 0
        this.documentFrequency.set(word, count + 1)
      }
    }
  }

  /**
   * 计算TF-IDF向量
   */
  calculateTFIDF(text: string): Map<string, number> {
    const words = this.tokenize(text)
    const wordCounts = new Map<string, number>()
    
    // 计算词频 (TF)
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1)
    }

    const tfidf = new Map<string, number>()
    for (const [word, count] of wordCounts) {
      const tf = count / words.length
      const df = this.documentFrequency.get(word) || 1
      const idf = Math.log(this.totalDocuments / df)
      tfidf.set(word, tf * idf)
    }

    return tfidf
  }

  /**
   * 文本分词 (简化实现)
   */
  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s\.]/g, ' ') // 保留中英文、数字和点号
      .split(/\s+/)
      .filter(word => word.length >= 1)
  }

  /**
   * 计算向量余弦相似度
   */
  cosineSimilarity(vector1: Map<string, number>, vector2: Map<string, number>): number {
    const words1 = new Set(vector1.keys())
    const words2 = new Set(vector2.keys())
    const intersection = new Set([...words1].filter(word => words2.has(word)))

    if (intersection.size === 0) return 0

    let dotProduct = 0
    let norm1 = 0
    let norm2 = 0

    for (const word of intersection) {
      const val1 = vector1.get(word) || 0
      const val2 = vector2.get(word) || 0
      dotProduct += val1 * val2
    }

    for (const val of vector1.values()) {
      norm1 += val * val
    }

    for (const val of vector2.values()) {
      norm2 += val * val
    }

    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
  }
}

/**
 * 基于规则的推荐引擎
 */
export class RuleBasedRecommender {
  private tfidfCalculator = new TFIDFCalculator()
  private readonly RELEVANCE_WEIGHT = 0.7
  private readonly FRESHNESS_WEIGHT = 0.3
  private readonly MIN_ARTICLE_LENGTH = 100
  private readonly DAYS_LIMIT = 7

  /**
   * 生成推荐列表
   */
  async recommend(
    articles: ArticleData[],
    userInterests: UserInterests,
    limit: number = 10
  ): Promise<RecommendationScore[]> {
    // 预筛选文章
    const filteredArticles = this.prefilterArticles(articles)
    
    if (filteredArticles.length === 0) {
      return []
    }

    // 构建TF-IDF词汇表
    this.tfidfCalculator.buildVocabulary(filteredArticles)

    // 构建用户兴趣向量
    const interestVector = this.buildInterestVector(userInterests)

    // 计算每篇文章的推荐分数
    const scores: RecommendationScore[] = []

    for (const article of filteredArticles) {
      const articleVector = this.tfidfCalculator.calculateTFIDF(
        article.title + ' ' + article.content
      )

      const relevanceScore = this.tfidfCalculator.cosineSimilarity(
        interestVector,
        articleVector
      )

      const freshnessScore = this.calculateFreshnessScore(article.publishDate)

      const finalScore = 
        relevanceScore * this.RELEVANCE_WEIGHT + 
        freshnessScore * this.FRESHNESS_WEIGHT

      const keywords = this.extractMatchedKeywords(userInterests, articleVector)

      scores.push({
        articleId: article.id,
        relevanceScore,
        freshnessScore,
        finalScore,
        keywords
      })
    }

    // 按最终分数排序并返回前N个
    return scores
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, limit)
  }

  /**
   * 预筛选文章
   */
  private prefilterArticles(articles: ArticleData[]): ArticleData[] {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - this.DAYS_LIMIT)

    return articles.filter(article => {
      // 时间限制
      if (article.publishDate < cutoffDate) return false
      
      // 内容质量过滤
      if (article.content.length < this.MIN_ARTICLE_LENGTH) return false

      return true
    })
  }

  /**
   * 构建用户兴趣向量
   */
  private buildInterestVector(userInterests: UserInterests): Map<string, number> {
    const vector = new Map<string, number>()
    
    for (const { word, weight } of userInterests.keywords) {
      // 分词处理用户兴趣关键词
      const tokens = this.tfidfCalculator.tokenize(word)
      for (const token of tokens) {
        vector.set(token, weight)
      }
    }

    return vector
  }

  /**
   * 计算时效性评分
   */
  private calculateFreshnessScore(publishDate: Date): number {
    const now = Date.now()
    const articleTime = publishDate.getTime()
    const hoursPassed = (now - articleTime) / (1000 * 60 * 60)

    // 24小时内文章得分最高，之后线性递减
    if (hoursPassed <= 24) return 1.0
    if (hoursPassed <= 72) return 0.8 - (hoursPassed - 24) / 48 * 0.3
    if (hoursPassed <= 168) return 0.5 - (hoursPassed - 72) / 96 * 0.5
    
    return 0.1 // 一周以上的文章最低分
  }

  /**
   * 提取匹配的关键词
   */
  private extractMatchedKeywords(
    userInterests: UserInterests,
    articleVector: Map<string, number>
  ): string[] {
    const matched: string[] = []

    for (const { word } of userInterests.keywords) {
      if (articleVector.has(word.toLowerCase())) {
        matched.push(word)
      }
    }

    return matched.slice(0, 5) // 最多返回5个关键词
  }
}