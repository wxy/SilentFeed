/**
 * 主题分类器
 *
 * 基于关键词匹配进行主题分类
 */

import type { Keyword } from "../analyzer/types"
import { Topic, TOPIC_KEYWORDS } from "./topics"

/**
 * 主题分布
 */
export interface TopicDistribution {
  [Topic.TECHNOLOGY]: number
  [Topic.SCIENCE]: number
  [Topic.BUSINESS]: number
  [Topic.DESIGN]: number
  [Topic.ARTS]: number
  [Topic.HEALTH]: number
  [Topic.SPORTS]: number
  [Topic.ENTERTAINMENT]: number
  [Topic.NEWS]: number
  [Topic.EDUCATION]: number
  [Topic.OTHER]: number
}

/**
 * 主题分类器类
 */
export class TopicClassifier {
  /**
   * 对关键词进行主题分类
   *
   * @param keywords 关键词列表
   * @returns 主题分布（各主题的权重分数）
   */
  classify(keywords: Keyword[]): TopicDistribution {
    // 初始化所有主题分数为 0
    const scores: TopicDistribution = {
      [Topic.TECHNOLOGY]: 0,
      [Topic.SCIENCE]: 0,
      [Topic.BUSINESS]: 0,
      [Topic.DESIGN]: 0,
      [Topic.ARTS]: 0,
      [Topic.HEALTH]: 0,
      [Topic.SPORTS]: 0,
      [Topic.ENTERTAINMENT]: 0,
      [Topic.NEWS]: 0,
      [Topic.EDUCATION]: 0,
      [Topic.OTHER]: 0,
    }

    // 计算各主题的原始分数
    keywords.forEach((kw) => {
      Object.entries(TOPIC_KEYWORDS).forEach(([topicStr, topicWords]) => {
        const topic = topicStr as Topic
        
        // 检查关键词是否匹配该主题
        const matchScore = this.calculateMatchScore(kw.word, topicWords)
        if (matchScore > 0) {
          scores[topic] += kw.weight * matchScore
        }
      })
    })

    // 归一化分数（总和为 1）
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0)
    
    if (totalScore > 0) {
      Object.keys(scores).forEach((topic) => {
        scores[topic as Topic] /= totalScore
      })
    } else {
      // 如果没有匹配到任何主题，归类为 OTHER
      scores[Topic.OTHER] = 1.0
    }

    return scores
  }

  /**
   * 获取主要主题（Top N）
   *
   * @param distribution 主题分布
   * @param topN 返回前 N 个主题
   * @returns 主要主题列表
   */
  getTopTopics(
    distribution: TopicDistribution,
    topN: number = 3
  ): Array<{ topic: Topic; score: number }> {
    return Object.entries(distribution)
      .map(([topic, score]) => ({ topic: topic as Topic, score }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN)
  }

  /**
   * 计算关键词与主题词的匹配分数
   *
   * @param keyword 关键词
   * @param topicWords 主题词列表
   * @returns 匹配分数（0-1）
   */
  private calculateMatchScore(keyword: string, topicWords: string[]): number {
    const keywordLower = keyword.toLowerCase()
    
    for (const topicWord of topicWords) {
      const topicWordLower = topicWord.toLowerCase()
      
      // 完全匹配
      if (keywordLower === topicWordLower) {
        return 1.0
      }
      
      // 包含匹配（关键词包含主题词，或主题词包含关键词）
      if (keywordLower.includes(topicWordLower) || topicWordLower.includes(keywordLower)) {
        // 根据长度差异计算部分匹配分数
        const shorter = Math.min(keywordLower.length, topicWordLower.length)
        const longer = Math.max(keywordLower.length, topicWordLower.length)
        return shorter / longer * 0.8 // 部分匹配权重稍低
      }
    }
    
    return 0
  }
}

/**
 * 默认导出实例
 */
export const topicClassifier = new TopicClassifier()