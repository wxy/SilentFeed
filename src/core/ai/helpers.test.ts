import { describe, it, expect } from "vitest"
import {
  extractKeywordsFromTopics,
  detectLanguage,
  mergeTopicDistributions
} from "./helpers"

describe("AI Helpers", () => {
  describe("extractKeywordsFromTopics", () => {
    it("应该按概率降序提取关键词", () => {
      const topics = {
        "技术": 0.7,
        "设计": 0.2,
        "商业": 0.1
      }
      
      const keywords = extractKeywordsFromTopics(topics)
      
      expect(keywords).toEqual(["技术", "设计", "商业"])
    })
    
    it("应该过滤低概率主题", () => {
      const topics = {
        "技术": 0.7,
        "设计": 0.2,
        "商业": 0.05  // 低于默认阈值 0.1
      }
      
      const keywords = extractKeywordsFromTopics(topics)
      
      expect(keywords).toEqual(["技术", "设计"])
    })
    
    it("应该支持自定义阈值", () => {
      const topics = {
        "技术": 0.7,
        "设计": 0.2,
        "商业": 0.15
      }
      
      const keywords = extractKeywordsFromTopics(topics, 0.2)
      
      // 只有 >= 0.2 的主题
      expect(keywords).toEqual(["技术", "设计"])
    })
    
    it("应该处理空对象", () => {
      const keywords = extractKeywordsFromTopics({})
      
      expect(keywords).toEqual([])
    })
    
    it("应该处理所有概率都低于阈值的情况", () => {
      const topics = {
        "技术": 0.05,
        "设计": 0.03
      }
      
      const keywords = extractKeywordsFromTopics(topics)
      
      expect(keywords).toEqual([])
    })
  })
  
  describe("detectLanguage", () => {
    it("应该识别中文", () => {
      const text = "这是一段中文文本，包含了足够多的中文字符。"
      
      expect(detectLanguage(text)).toBe("zh")
    })
    
    it("应该识别英文", () => {
      const text = "This is an English text with enough characters."
      
      expect(detectLanguage(text)).toBe("en")
    })
    
    it("应该识别日文", () => {
      const text = "これは日本語のテキストです。ひらがなとカタカナが含まれています。"
      
      expect(detectLanguage(text)).toBe("ja")
    })
    
    it("应该处理混合文本（中文占优）", () => {
      const text = "这是中文为主的文本 with some English words 但中文占大多数"
      
      expect(detectLanguage(text)).toBe("zh")
    })
    
    it("应该处理混合文本（英文占优）", () => {
      const text = "This is mostly English text with 一些中文 but English dominates"
      
      expect(detectLanguage(text)).toBe("en")
    })
    
    it("应该处理空文本", () => {
      expect(detectLanguage("")).toBe("en")
    })
    
    it("应该处理纯数字和符号", () => {
      const text = "123456 !@#$%^&*()"
      
      expect(detectLanguage(text)).toBe("en")
    })
  })
  
  describe("mergeTopicDistributions", () => {
    it("应该合并多个主题分布（均等权重）", () => {
      const dist1 = { "技术": 0.8, "设计": 0.2 }
      const dist2 = { "技术": 0.6, "设计": 0.4 }
      
      const merged = mergeTopicDistributions([dist1, dist2])
      
      expect(merged["技术"]).toBeCloseTo(0.7, 5)  // (0.8 + 0.6) / 2
      expect(merged["设计"]).toBeCloseTo(0.3, 5)  // (0.2 + 0.4) / 2
    })
    
    it("应该支持自定义权重", () => {
      const dist1 = { "技术": 0.8, "设计": 0.2 }
      const dist2 = { "技术": 0.4, "设计": 0.6 }
      
      // 权重 3:1，更偏向第一个分布
      const merged = mergeTopicDistributions([dist1, dist2], [3, 1])
      
      expect(merged["技术"]).toBeCloseTo(0.7, 5)  // (0.8*3 + 0.4*1) / 4
      expect(merged["设计"]).toBeCloseTo(0.3, 5)  // (0.2*3 + 0.6*1) / 4
    })
    
    it("应该处理不同主题集合", () => {
      const dist1 = { "技术": 0.7, "设计": 0.3 }
      const dist2 = { "商业": 0.6, "技术": 0.4 }
      
      const merged = mergeTopicDistributions([dist1, dist2])
      
      expect(merged["技术"]).toBeCloseTo(0.55, 5)  // (0.7 + 0.4) / 2
      expect(merged["设计"]).toBeCloseTo(0.15, 5)  // (0.3 + 0) / 2
      expect(merged["商业"]).toBeCloseTo(0.3, 5)   // (0 + 0.6) / 2
    })
    
    it("应该处理空数组", () => {
      const merged = mergeTopicDistributions([])
      
      expect(merged).toEqual({})
    })
    
    it("应该处理单个分布", () => {
      const dist = { "技术": 0.7, "设计": 0.3 }
      
      const merged = mergeTopicDistributions([dist])
      
      expect(merged).toEqual(dist)
    })
    
    it("应该自动归一化权重", () => {
      const dist1 = { "技术": 0.8 }
      const dist2 = { "技术": 0.4 }
      
      // 权重未归一化
      const merged = mergeTopicDistributions([dist1, dist2], [10, 5])
      
      // 应该等效于 2:1 的权重
      expect(merged["技术"]).toBeCloseTo(0.667, 2)  // (0.8*2 + 0.4*1) / 3
    })
  })
})
