/**
 * TopicClassifier 单元测试
 */

import { describe, it, expect } from "vitest"
import { TopicClassifier } from "./TopicClassifier"
import { Topic } from "./topics"
import type { Keyword } from "../analyzer/types"

describe("TopicClassifier", () => {
  const classifier = new TopicClassifier()

  describe("主题分类", () => {
    it("应该正确分类技术关键词", () => {
      const keywords: Keyword[] = [
        { word: "react", weight: 0.8 },
        { word: "javascript", weight: 0.6 },
        { word: "programming", weight: 0.4 },
        { word: "编程", weight: 0.3 },
      ]

      const distribution = classifier.classify(keywords)

      expect(distribution[Topic.TECHNOLOGY]).toBeGreaterThan(0.5)
      expect(distribution[Topic.OTHER]).toBeLessThan(0.5)
    })

    it("应该正确分类科学关键词", () => {
      const keywords: Keyword[] = [
        { word: "research", weight: 0.7 },
        { word: "experiment", weight: 0.6 },
        { word: "scientific", weight: 0.5 },
        { word: "研究", weight: 0.4 },
      ]

      const distribution = classifier.classify(keywords)

      expect(distribution[Topic.SCIENCE]).toBeGreaterThan(0.5)
    })

    it("应该正确分类设计关键词", () => {
      const keywords: Keyword[] = [
        { word: "design", weight: 0.8 },
        { word: "ui", weight: 0.6 },
        { word: "设计", weight: 0.5 },
        { word: "interface", weight: 0.4 },
      ]

      const distribution = classifier.classify(keywords)

      expect(distribution[Topic.DESIGN]).toBeGreaterThan(0.5)
    })

    it("应该处理混合主题", () => {
      const keywords: Keyword[] = [
        { word: "react", weight: 0.6 },        // 技术
        { word: "design", weight: 0.4 },       // 设计
        { word: "business", weight: 0.3 },     // 商业
      ]

      const distribution = classifier.classify(keywords)

      expect(distribution[Topic.TECHNOLOGY]).toBeGreaterThan(0)
      expect(distribution[Topic.DESIGN]).toBeGreaterThan(0)
      expect(distribution[Topic.BUSINESS]).toBeGreaterThan(0)
      
      // 技术应该是最高分
      expect(distribution[Topic.TECHNOLOGY]).toBeGreaterThan(distribution[Topic.DESIGN])
    })

    it("没有匹配时应该归类为 OTHER", () => {
      const keywords: Keyword[] = [
        { word: "随机词汇", weight: 0.8 },
        { word: "xyz123", weight: 0.6 },
      ]

      const distribution = classifier.classify(keywords)

      expect(distribution[Topic.OTHER]).toBe(1.0)
      expect(distribution[Topic.TECHNOLOGY]).toBe(0)
    })

    it("应该正确归一化分数", () => {
      const keywords: Keyword[] = [
        { word: "react", weight: 0.8 },
        { word: "design", weight: 0.6 },
        { word: "health", weight: 0.4 },
      ]

      const distribution = classifier.classify(keywords)
      
      // 所有分数之和应该等于 1
      const totalScore = Object.values(distribution).reduce((sum, score) => sum + score, 0)
      expect(totalScore).toBeCloseTo(1.0, 5)
    })
  })

  describe("获取主要主题", () => {
    it("应该返回 Top N 主题", () => {
      const distribution = {
        [Topic.TECHNOLOGY]: 0.5,
        [Topic.DESIGN]: 0.3,
        [Topic.SCIENCE]: 0.2,
        [Topic.BUSINESS]: 0,
        [Topic.ARTS]: 0,
        [Topic.HEALTH]: 0,
        [Topic.SPORTS]: 0,
        [Topic.ENTERTAINMENT]: 0,
        [Topic.NEWS]: 0,
        [Topic.EDUCATION]: 0,
        [Topic.OTHER]: 0,
      }

      const topTopics = classifier.getTopTopics(distribution, 2)

      expect(topTopics).toHaveLength(2)
      expect(topTopics[0].topic).toBe(Topic.TECHNOLOGY)
      expect(topTopics[0].score).toBe(0.5)
      expect(topTopics[1].topic).toBe(Topic.DESIGN)
      expect(topTopics[1].score).toBe(0.3)
    })

    it("应该过滤零分主题", () => {
      const distribution = {
        [Topic.TECHNOLOGY]: 0.8,
        [Topic.DESIGN]: 0.2,
        [Topic.SCIENCE]: 0,
        [Topic.BUSINESS]: 0,
        [Topic.ARTS]: 0,
        [Topic.HEALTH]: 0,
        [Topic.SPORTS]: 0,
        [Topic.ENTERTAINMENT]: 0,
        [Topic.NEWS]: 0,
        [Topic.EDUCATION]: 0,
        [Topic.OTHER]: 0,
      }

      const topTopics = classifier.getTopTopics(distribution, 5)

      expect(topTopics).toHaveLength(2) // 只有 2 个主题有分数
      expect(topTopics.every(t => t.score > 0)).toBe(true)
    })
  })

  describe("匹配分数计算", () => {
    it("完全匹配应该返回 1.0", () => {
      const keywords: Keyword[] = [{ word: "react", weight: 1.0 }]
      
      const distribution = classifier.classify(keywords)
      
      // React 应该完全匹配技术主题
      expect(distribution[Topic.TECHNOLOGY]).toBeGreaterThan(0)
    })

    it("部分匹配应该返回较低分数", () => {
      // 使用不同的关键词来测试匹配分数差异
      const keywords1: Keyword[] = [{ word: "javascript", weight: 1.0 }]    // 完全匹配技术词汇
      const keywords2: Keyword[] = [{ word: "science", weight: 1.0 }]       // 匹配科学词汇，不匹配技术
      
      const dist1 = classifier.classify(keywords1)
      const dist2 = classifier.classify(keywords2)
      
      // JavaScript 应该在技术主题得分更高
      expect(dist1[Topic.TECHNOLOGY]).toBeGreaterThan(0.5)
      // Science 应该在科学主题得分更高，技术主题分数很低或为0
      expect(dist2[Topic.SCIENCE]).toBeGreaterThan(0.5)
      expect(dist2[Topic.TECHNOLOGY]).toBeLessThan(0.1)
    })
  })
})