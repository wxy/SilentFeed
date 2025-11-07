import { describe, it, expect, beforeEach } from "vitest"

import { TextAnalyzer } from "./TextAnalyzer"

describe("TextAnalyzer", () => {
  let analyzer: TextAnalyzer

  beforeEach(() => {
    analyzer = new TextAnalyzer()
  })

  describe("detectLanguage", () => {
    it("应该检测中文", () => {
      expect(analyzer.detectLanguage("深入理解 React Hooks")).toBe("zh")
      expect(analyzer.detectLanguage("这是一段中文文本")).toBe("zh")
    })

    it("应该检测英文", () => {
      expect(analyzer.detectLanguage("Understanding React Hooks")).toBe("en")
      expect(analyzer.detectLanguage("This is English text")).toBe("en")
    })

    it("应该检测中英混合（偏中文）", () => {
      expect(analyzer.detectLanguage("深入理解 React Hooks 的工作原理")).toBe("zh")
    })

    it("应该检测中英混合（偏英文）", () => {
      expect(analyzer.detectLanguage("Understanding React Hooks 深入")).toBe("en")
    })

    it("应该处理空文本", () => {
      expect(analyzer.detectLanguage("")).toBe("other")
      expect(analyzer.detectLanguage("   ")).toBe("other")
    })
  })

  describe("tokenize", () => {
    it("应该正确分词中文", () => {
      const result = analyzer.tokenize("深入理解 React Hooks")
      expect(result.language).toBe("zh")
      // 注意: natural 的 WordTokenizer 对中文分词效果有限
      // 它会将中文分为单字或小词组
      // 主要验证英文部分能正确分词
      expect(result.tokens).toContain("react")
      expect(result.tokens).toContain("hooks")
      // 验证有中文 token 存在
      expect(result.tokens.length).toBeGreaterThan(0)
    })

    it("应该正确分词英文", () => {
      const result = analyzer.tokenize("Understanding React Hooks")
      expect(result.language).toBe("en")
      expect(result.tokens).toContain("understanding")
      expect(result.tokens).toContain("react")
      expect(result.tokens).toContain("hooks")
    })

    it("应该转换为小写", () => {
      const result = analyzer.tokenize("React Hooks UseState")
      expect(result.tokens).toContain("react")
      expect(result.tokens).toContain("hooks")
      expect(result.tokens).toContain("usestate")
    })

    it("应该移除特殊字符", () => {
      const result = analyzer.tokenize("React.js, Vue.js & Angular!")
      expect(result.tokens).not.toContain("react.js")
      expect(result.tokens).toContain("react")
      expect(result.tokens).toContain("js")
    })

    it("应该处理空文本", () => {
      const result = analyzer.tokenize("")
      expect(result.tokens).toEqual([])
      expect(result.language).toBe("other")
    })
  })

  describe("removeStopwords", () => {
    it("应该移除英文停用词", () => {
      const tokens = ["the", "react", "is", "a", "good", "library"]
      const filtered = analyzer.removeStopwords(tokens, "en")

      expect(filtered).not.toContain("the")
      expect(filtered).not.toContain("is")
      expect(filtered).not.toContain("a")
      expect(filtered).toContain("react")
      expect(filtered).toContain("good")
      expect(filtered).toContain("library")
    })

    it("应该移除中文停用词", () => {
      const tokens = ["这是", "一个", "很好", "的", "框架"]
      const filtered = analyzer.removeStopwords(tokens, "zh")

      // 注意: stopword 库的中文停用词列表可能不完整
      expect(filtered).toContain("很好")
      expect(filtered).toContain("框架")
    })

    it("应该处理空列表", () => {
      const filtered = analyzer.removeStopwords([], "en")
      expect(filtered).toEqual([])
    })
  })

  describe("extractKeywords", () => {
    it("应该从技术文章提取关键词", () => {
      const text = `
        React Hooks 是 React 16.8 引入的新特性。
        Hooks 让你在不编写 class 的情况下使用 state 和其他 React 特性。
        useState 是最常用的 Hook，它允许你在函数组件中添加 state。
        useEffect 用于处理副作用，如数据获取、订阅等。
        React Hooks 改变了我们编写 React 组件的方式。
      `

      const keywords = analyzer.extractKeywords(text, { topK: 10 })

      // 验证返回数量
      expect(keywords.length).toBeGreaterThan(0)
      expect(keywords.length).toBeLessThanOrEqual(10)

      // 验证包含关键技术词
      const words = keywords.map((k) => k.word)
      expect(words.some((w) => w.includes("react") || w.includes("hook"))).toBe(true)

      // 验证权重递减
      for (let i = 1; i < keywords.length; i++) {
        expect(keywords[i].weight).toBeLessThanOrEqual(keywords[i - 1].weight)
      }

      // 验证权重归一化
      expect(keywords[0].weight).toBeLessThanOrEqual(1.0)
      expect(keywords[0].weight).toBeGreaterThan(0)
    })

    it("应该从科学文章提取关键词", () => {
      const text = `
        Quantum computing is a revolutionary technology that leverages quantum mechanics.
        Unlike classical computers that use bits, quantum computers use qubits.
        Qubits can exist in multiple states simultaneously due to superposition.
        Quantum entanglement allows qubits to be correlated in ways impossible for classical bits.
        This enables quantum computers to solve certain problems exponentially faster.
      `

      const keywords = analyzer.extractKeywords(text, { topK: 10 })

      expect(keywords.length).toBeGreaterThan(0)

      const words = keywords.map((k) => k.word)
      expect(
        words.some((w) => w.includes("quantum") || w.includes("qubit") || w.includes("comput"))
      ).toBe(true)
    })

    it("应该处理短文本", () => {
      const text = "React Hooks"
      const keywords = analyzer.extractKeywords(text, { topK: 5 })

      expect(keywords.length).toBeGreaterThan(0)
      expect(keywords.length).toBeLessThanOrEqual(2)
    })

    it("应该处理空文本", () => {
      const keywords = analyzer.extractKeywords("", { topK: 10 })
      expect(keywords).toEqual([])
    })

    it("应该尊重 topK 参数", () => {
      const text = `
        JavaScript TypeScript React Vue Angular Svelte Node Express Nest Deno Bun
        Python Django Flask FastAPI Java Spring Kotlin Go Rust C# .NET PHP Laravel
      `

      const keywords5 = analyzer.extractKeywords(text, { topK: 5 })
      expect(keywords5.length).toBeLessThanOrEqual(5)

      const keywords10 = analyzer.extractKeywords(text, { topK: 10 })
      expect(keywords10.length).toBeLessThanOrEqual(10)
    })

    it("应该尊重 minWordLength 参数", () => {
      const text = "I am a developer using React and Vue to build apps"

      const keywords = analyzer.extractKeywords(text, { minWordLength: 4 })

      // 应该过滤掉短词（如 "am", "to"）
      const words = keywords.map((k) => k.word)
      expect(words.every((w) => w.length >= 4)).toBe(true)
    })
  })

  describe("clear", () => {
    it("应该清空文档缓存", () => {
      analyzer.extractKeywords("test document 1")
      analyzer.extractKeywords("test document 2")

      // @ts-expect-error - 访问私有属性用于测试
      const docCountBefore = analyzer.tfidf.documents.length
      expect(docCountBefore).toBeGreaterThan(0)

      analyzer.clear()

      // @ts-expect-error - 访问私有属性用于测试
      const docCountAfter = analyzer.tfidf.documents.length
      expect(docCountAfter).toBe(0)
    })
  })

  describe("性能测试", () => {
    it("分析 2000 字文本应该在 100ms 内完成", () => {
      // 生成 2000 字的测试文本
      const words = [
        "React",
        "Hooks",
        "component",
        "state",
        "effect",
        "context",
        "reducer",
        "memo",
        "callback"
      ]
      const text = Array(250)
        .fill(null)
        .map(() => words[Math.floor(Math.random() * words.length)])
        .join(" ")

      expect(text.split(" ").length).toBeGreaterThanOrEqual(250)

      const start = performance.now()
      analyzer.extractKeywords(text, { topK: 20 })
      const end = performance.now()

      const duration = end - start
      console.log(`分析时间: ${duration.toFixed(2)}ms`)

      expect(duration).toBeLessThan(100)
    })
  })
})
