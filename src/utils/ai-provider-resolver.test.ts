/**
 * AI Provider 解析工具测试
 */

import { describe, it, expect } from "vitest"
import { resolveProvider, isLocalProvider, isRemoteProvider } from "./ai-provider-resolver"
import type { AIConfig } from "@/storage/ai-config"

describe("ai-provider-resolver", () => {
  const mockConfig: AIConfig = {
    providers: {},
    providerBudgets: {},
    local: {
      enabled: false,
      provider: "ollama",
      endpoint: "http://localhost:11434/v1",
      model: "",
      apiKey: "ollama",
      temperature: 0.2,
      maxOutputTokens: 768,
      timeoutMs: 60000,
      reasoningTimeoutMs: 180000
    },
    engineAssignment: {
      pageAnalysis: { provider: "local" },
      articleAnalysis: { provider: "local" },
      lowFrequencyTasks: { provider: "local" }
    },
    monthlyBudget: 10,
    preferredRemoteProvider: "deepseek",
    preferredLocalProvider: "ollama"
  }

  describe("resolveProvider", () => {
    it("应该将 'remote' 解析为 preferredRemoteProvider", () => {
      expect(resolveProvider("remote", mockConfig)).toBe("deepseek")
    })

    it("应该将 'local' 解析为 preferredLocalProvider", () => {
      expect(resolveProvider("local", mockConfig)).toBe("ollama")
    })

    it("应该保持具体 provider 不变", () => {
      expect(resolveProvider("deepseek", mockConfig)).toBe("deepseek")
      expect(resolveProvider("openai", mockConfig)).toBe("openai")
      expect(resolveProvider("ollama", mockConfig)).toBe("ollama")
    })

    it("应该处理 undefined provider", () => {
      expect(resolveProvider(undefined, mockConfig)).toBe("deepseek")
    })

    it("应该使用自定义 preferredRemoteProvider", () => {
      const customConfig = {
        ...mockConfig,
        preferredRemoteProvider: "openai" as const
      }
      expect(resolveProvider("remote", customConfig)).toBe("openai")
    })

    it("应该处理未知 provider", () => {
      expect(resolveProvider("unknown", mockConfig)).toBe("deepseek")
    })
  })

  describe("isLocalProvider", () => {
    it("应该识别本地 provider", () => {
      expect(isLocalProvider("local")).toBe(true)
      expect(isLocalProvider("ollama")).toBe(true)
    })

    it("应该拒绝远程 provider", () => {
      expect(isLocalProvider("remote")).toBe(false)
      expect(isLocalProvider("deepseek")).toBe(false)
      expect(isLocalProvider("openai")).toBe(false)
    })

    it("应该处理 undefined", () => {
      expect(isLocalProvider(undefined)).toBe(false)
    })
  })

  describe("isRemoteProvider", () => {
    it("应该识别远程 provider", () => {
      expect(isRemoteProvider("remote")).toBe(true)
      expect(isRemoteProvider("deepseek")).toBe(true)
      expect(isRemoteProvider("openai")).toBe(true)
    })

    it("应该拒绝本地 provider", () => {
      expect(isRemoteProvider("local")).toBe(false)
      expect(isRemoteProvider("ollama")).toBe(false)
    })

    it("应该处理 undefined", () => {
      expect(isRemoteProvider(undefined)).toBe(false)
    })
  })
})
