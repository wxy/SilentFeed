import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useAIProviderStatus } from "./useAIProviderStatus"
import * as aiProviderStatus from "@/storage/ai-provider-status"
import type { AIConfig } from "@/storage/ai-config"

// Mock 依赖
vi.mock("@/storage/ai-provider-status", () => ({
  getAllProviderStatus: vi.fn(),
  saveProviderStatus: vi.fn()
}))

// Mock AI Config
const mockGetAIConfig = vi.fn()
vi.mock("@/storage/ai-config", () => ({
  getAIConfig: () => mockGetAIConfig()
}))

// Mock AICapabilityManager
const mockInitialize = vi.fn()
const mockTestConnection = vi.fn()

vi.mock("@/core/ai/AICapabilityManager", () => {
  return {
    AICapabilityManager: class {
      initialize = mockInitialize
      testConnection = mockTestConnection
    }
  }
})

describe("useAIProviderStatus", () => {
  // 默认配置：有 API Key
  const defaultConfig: AIConfig = {
    enabled: true,
    monthlyBudget: 10,
    apiKeys: {
      deepseek: "sk-test-key",
      openai: "sk-openai-test"
    },
    local: {
      enabled: true,
      provider: "ollama",
      endpoint: "http://localhost:11434/v1",
      model: "qwen2.5:7b"
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockInitialize.mockResolvedValue(undefined)
    mockTestConnection.mockResolvedValue({ success: true, message: "OK" })
    mockGetAIConfig.mockResolvedValue(defaultConfig)
  })

  describe("loadStatus", () => {
    it("应该加载所有 Provider 状态", async () => {
      const mockStatus = {
        deepseek: {
          providerId: "deepseek",
          type: "remote" as const,
          available: true,
          lastChecked: Date.now(),
          latency: 100
        }
      }

      vi.mocked(aiProviderStatus.getAllProviderStatus).mockResolvedValue(mockStatus)

      const { result } = renderHook(() => useAIProviderStatus())

      await waitFor(() => {
        expect(result.current.status).toEqual(mockStatus)
      })

      expect(aiProviderStatus.getAllProviderStatus).toHaveBeenCalled()
    })

    it("应该处理加载失败", async () => {
      vi.mocked(aiProviderStatus.getAllProviderStatus).mockRejectedValue(new Error("加载失败"))

      const { result } = renderHook(() => useAIProviderStatus())

      await waitFor(() => {
        expect(result.current.status).toEqual({})
      })
    })
  })

  describe("checkProvider - API Key 验证", () => {
    it("应该拒绝未配置 API Key 的远程 Provider", async () => {
      // 设置为无 API Key
      mockGetAIConfig.mockResolvedValue({
        ...defaultConfig,
        apiKeys: {}
      })

      vi.mocked(aiProviderStatus.getAllProviderStatus).mockResolvedValue({})
      vi.mocked(aiProviderStatus.saveProviderStatus).mockResolvedValue()

      const { result } = renderHook(() => useAIProviderStatus())

      await act(async () => {
        await result.current.checkProvider("deepseek", "remote")
      })

      // 不应该调用 testConnection
      expect(mockTestConnection).not.toHaveBeenCalled()
      
      // 应该保存未配置状态
      expect(aiProviderStatus.saveProviderStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: "deepseek",
          type: "remote",
          available: false,
          error: "未配置 API Key"
        })
      )
    })

    it("应该拒绝未启用的本地 AI", async () => {
      // 设置本地 AI 未启用
      mockGetAIConfig.mockResolvedValue({
        ...defaultConfig,
        local: {
          ...defaultConfig.local!,
          enabled: false
        }
      })

      vi.mocked(aiProviderStatus.getAllProviderStatus).mockResolvedValue({})
      vi.mocked(aiProviderStatus.saveProviderStatus).mockResolvedValue()

      const { result } = renderHook(() => useAIProviderStatus())

      await act(async () => {
        await result.current.checkProvider("ollama", "local")
      })

      // 不应该调用 testConnection
      expect(mockTestConnection).not.toHaveBeenCalled()
      
      // 应该保存未启用状态
      expect(aiProviderStatus.saveProviderStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: "ollama",
          type: "local",
          available: false,
          error: "未启用本地 AI"
        })
      )
    })
  })

  describe("checkProvider - 连接测试", () => {
    it("应该检测已配置的 Provider 并保存状态", async () => {
      mockTestConnection.mockResolvedValue({
        success: true,
        message: "连接成功",
        latency: 150
      })

      vi.mocked(aiProviderStatus.getAllProviderStatus).mockResolvedValue({})
      vi.mocked(aiProviderStatus.saveProviderStatus).mockResolvedValue()

      const { result } = renderHook(() => useAIProviderStatus())

      await act(async () => {
        await result.current.checkProvider("deepseek", "remote")
      })

      expect(mockGetAIConfig).toHaveBeenCalled()
      expect(mockInitialize).toHaveBeenCalled()
      expect(mockTestConnection).toHaveBeenCalledWith("remote")
      expect(aiProviderStatus.saveProviderStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: "deepseek",
          type: "remote",
          available: true,
          latency: 150
        })
      )
    })

    it("应该处理检测失败", async () => {
      mockTestConnection.mockResolvedValue({
        success: false,
        message: "连接失败"
      })

      vi.mocked(aiProviderStatus.getAllProviderStatus).mockResolvedValue({})
      vi.mocked(aiProviderStatus.saveProviderStatus).mockResolvedValue()

      const { result } = renderHook(() => useAIProviderStatus())

      await act(async () => {
        await result.current.checkProvider("deepseek", "remote")
      })

      expect(aiProviderStatus.saveProviderStatus).toHaveBeenCalledWith(
        expect.objectContaining({
          providerId: "deepseek",
          type: "remote",
          available: false,
          error: "连接失败"
        })
      )
    })

    it("应该在检测期间设置 loading 状态", async () => {
      let resolveTest: () => void
      const testPromise = new Promise<void>(resolve => {
        resolveTest = resolve
      })

      mockTestConnection.mockImplementation(() => testPromise.then(() => ({ success: true, message: "OK" })))

      vi.mocked(aiProviderStatus.getAllProviderStatus).mockResolvedValue({})
      vi.mocked(aiProviderStatus.saveProviderStatus).mockResolvedValue()

      const { result } = renderHook(() => useAIProviderStatus())

      expect(result.current.loading).toBe(false)

      // 开始检测（不 await）
      act(() => {
        result.current.checkProvider("deepseek", "remote")
      })

      // 等一下让状态更新
      await new Promise(resolve => setTimeout(resolve, 10))

      // 完成检测
      resolveTest!()
      await act(async () => {
        await testPromise
        await new Promise(resolve => setTimeout(resolve, 10))
      })

      // 检测完成后应该恢复
      expect(result.current.loading).toBe(false)
    })
  })

  describe("checkAllProviders", () => {
    it("应该检测所有 Provider", async () => {
      mockTestConnection.mockResolvedValue({
        success: true,
        message: "OK"
      })

      vi.mocked(aiProviderStatus.getAllProviderStatus).mockResolvedValue({})

      const { result } = renderHook(() => useAIProviderStatus())

      await act(async () => {
        await result.current.checkAllProviders()
      })

      expect(mockInitialize).toHaveBeenCalled()
      expect(mockTestConnection).toHaveBeenCalled()
    })

    it("应该处理检测失败", async () => {
      mockInitialize.mockRejectedValue(new Error("初始化失败"))

      vi.mocked(aiProviderStatus.getAllProviderStatus).mockResolvedValue({})

      const { result } = renderHook(() => useAIProviderStatus())

      await act(async () => {
        await result.current.checkAllProviders()
      })

      expect(result.current.error).toBe("初始化失败")
    })
  })

  describe("refresh", () => {
    it("应该重新加载状态", async () => {
      const mockStatus = {
        deepseek: {
          providerId: "deepseek",
          type: "remote" as const,
          available: true,
          lastChecked: Date.now()
        }
      }

      vi.mocked(aiProviderStatus.getAllProviderStatus).mockResolvedValue(mockStatus)

      const { result } = renderHook(() => useAIProviderStatus())

      await act(async () => {
        await result.current.refresh()
      })

      expect(aiProviderStatus.getAllProviderStatus).toHaveBeenCalled()
      expect(result.current.status).toEqual(mockStatus)
    })
  })
})
