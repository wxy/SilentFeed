import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import i18n from "@/i18n"
import {
  getAllProviderStatus,
  getProviderStatus,
  saveProviderStatus,
  saveAllProviderStatus,
  deleteProviderStatus,
  clearAllProviderStatus,
  isStatusExpired,
  formatLatency,
  formatLastChecked,
  getStatusIcon,
  getReasoningIcon,
  type AIProviderStatus,
  type AIProvidersStatus
} from "./ai-provider-status"

// Mock logger
vi.mock("@/utils/logger", () => ({
  logger: {
    withTag: vi.fn(() => ({
      debug: vi.fn(),
      error: vi.fn()
    }))
  }
}))

// Mock chrome.storage.local
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockRemove = vi.fn()

global.chrome = {
  storage: {
    local: {
      get: mockGet,
      set: mockSet,
      remove: mockRemove
    }
  }
} as any

describe("ai-provider-status", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("getAllProviderStatus", () => {
    it("应该返回所有 Provider 状态", async () => {
      const mockStatus: AIProvidersStatus = {
        deepseek: {
          providerId: "deepseek",
          type: "remote",
          available: true,
          lastChecked: Date.now()
        }
      }

      mockGet.mockResolvedValue({
        aiProvidersStatus: mockStatus
      })

      const result = await getAllProviderStatus()
      expect(result).toEqual(mockStatus)
    })

    it("应该返回空对象当没有数据时", async () => {
      mockGet.mockResolvedValue({})

      const result = await getAllProviderStatus()
      expect(result).toEqual({})
    })

    it("应该处理错误", async () => {
      mockGet.mockRejectedValue(new Error("Storage error"))

      const result = await getAllProviderStatus()
      expect(result).toEqual({})
    })
  })

  describe("getProviderStatus", () => {
    it("应该返回指定 Provider 的状态", async () => {
      const mockStatus: AIProviderStatus = {
        providerId: "deepseek",
        type: "remote",
        available: true,
        lastChecked: Date.now()
      }

      mockGet.mockResolvedValue({
        aiProvidersStatus: { deepseek: mockStatus }
      })

      const result = await getProviderStatus("deepseek")
      expect(result).toEqual(mockStatus)
    })

    it("应该返回 null 当 Provider 不存在时", async () => {
      mockGet.mockResolvedValue({
        aiProvidersStatus: {}
      })

      const result = await getProviderStatus("nonexistent")
      expect(result).toBeNull()
    })
  })

  describe("saveProviderStatus", () => {
    it("应该保存 Provider 状态", async () => {
      const status: AIProviderStatus = {
        providerId: "deepseek",
        type: "remote",
        available: true,
        lastChecked: Date.now()
      }

      mockGet.mockResolvedValue({
        aiProvidersStatus: {}
      })
      mockSet.mockResolvedValue(undefined)

      await saveProviderStatus(status)

      expect(mockSet).toHaveBeenCalledWith({
        aiProvidersStatus: {
          deepseek: expect.objectContaining({
            providerId: "deepseek",
            type: "remote",
            available: true
          })
        }
      })
    })

    it("应该更新 lastChecked 时间戳", async () => {
      const now = Date.now()
      const status: AIProviderStatus = {
        providerId: "deepseek",
        type: "remote",
        available: true,
        lastChecked: now - 10000 // 10秒前
      }

      mockGet.mockResolvedValue({
        aiProvidersStatus: {}
      })
      mockSet.mockResolvedValue(undefined)

      await saveProviderStatus(status)

      const saved = mockSet.mock.calls[0][0]
      expect(saved.aiProvidersStatus.deepseek.lastChecked).toBeGreaterThanOrEqual(now)
    })
  })

  describe("saveAllProviderStatus", () => {
    it("应该保存所有 Provider 状态", async () => {
      const statuses: AIProvidersStatus = {
        deepseek: {
          providerId: "deepseek",
          type: "remote",
          available: true,
          lastChecked: Date.now()
        },
        ollama: {
          providerId: "ollama",
          type: "local",
          available: false,
          lastChecked: Date.now()
        }
      }

      mockSet.mockResolvedValue(undefined)

      await saveAllProviderStatus(statuses)

      expect(mockSet).toHaveBeenCalledWith({
        aiProvidersStatus: statuses
      })
    })
  })

  describe("deleteProviderStatus", () => {
    it("应该删除指定 Provider 状态", async () => {
      const existing: AIProvidersStatus = {
        deepseek: {
          providerId: "deepseek",
          type: "remote",
          available: true,
          lastChecked: Date.now()
        },
        ollama: {
          providerId: "ollama",
          type: "local",
          available: false,
          lastChecked: Date.now()
        }
      }

      mockGet.mockResolvedValue({
        aiProvidersStatus: existing
      })
      mockSet.mockResolvedValue(undefined)

      await deleteProviderStatus("deepseek")

      expect(mockSet).toHaveBeenCalledWith({
        aiProvidersStatus: { ollama: existing.ollama }
      })
    })
  })

  describe("clearAllProviderStatus", () => {
    it("应该清空所有 Provider 状态", async () => {
      mockRemove.mockResolvedValue(undefined)

      await clearAllProviderStatus()

      expect(mockRemove).toHaveBeenCalledWith("aiProvidersStatus")
    })
  })

  describe("isStatusExpired", () => {
    it("应该返回 true 当状态过期时", () => {
      const status: AIProviderStatus = {
        providerId: "deepseek",
        type: "remote",
        available: true,
        lastChecked: Date.now() - 6 * 60 * 1000 // 6分钟前
      }

      expect(isStatusExpired(status)).toBe(true)
    })

    it("应该返回 false 当状态未过期时", () => {
      const status: AIProviderStatus = {
        providerId: "deepseek",
        type: "remote",
        available: true,
        lastChecked: Date.now() - 3 * 60 * 1000 // 3分钟前
      }

      expect(isStatusExpired(status)).toBe(false)
    })

    it("应该返回 true 当没有 lastChecked 时", () => {
      const status: AIProviderStatus = {
        providerId: "deepseek",
        type: "remote",
        available: true,
        lastChecked: 0
      }

      expect(isStatusExpired(status)).toBe(true)
    })

    it("应该支持自定义缓存时间", () => {
      const status: AIProviderStatus = {
        providerId: "deepseek",
        type: "remote",
        available: true,
        lastChecked: Date.now() - 2 * 60 * 1000 // 2分钟前
      }

      expect(isStatusExpired(status, 1 * 60 * 1000)).toBe(true) // 1分钟缓存
      expect(isStatusExpired(status, 3 * 60 * 1000)).toBe(false) // 3分钟缓存
    })
  })

  describe("formatLatency", () => {
    it("应该格式化毫秒延迟", () => {
      expect(formatLatency(123)).toBe("123ms")
      expect(formatLatency(999)).toBe("999ms")
    })

    it("应该格式化秒级延迟", () => {
      expect(formatLatency(1000)).toBe("1.0s")
      expect(formatLatency(1500)).toBe("1.5s")
      expect(formatLatency(2300)).toBe("2.3s")
    })

    it("应该返回未知当延迟为undefined时", () => {
      expect(formatLatency(undefined)).toBe("未知")
      expect(formatLatency()).toBe("未知")
    })
  })

  describe("formatLastChecked", () => {
    beforeEach(() => {
      // Mock i18n 语言为中文
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('zh-CN')
    })

    afterEach(() => {
      vi.clearAllMocks()
    })

    it("应该显示刚刚", () => {
      const now = Date.now()
      expect(formatLastChecked(now)).toBe("刚刚")
      expect(formatLastChecked(now - 30 * 1000)).toBe("刚刚") // 30秒前
    })

    it("应该显示分钟", () => {
      const now = Date.now()
      expect(formatLastChecked(now - 2 * 60 * 1000)).toBe("2分钟前")
      expect(formatLastChecked(now - 30 * 60 * 1000)).toBe("30分钟前")
    })

    it("应该显示小时", () => {
      const now = Date.now()
      expect(formatLastChecked(now - 2 * 60 * 60 * 1000)).toBe("2小时前")
      expect(formatLastChecked(now - 12 * 60 * 60 * 1000)).toBe("12小时前")
    })

    it("应该显示天", () => {
      const now = Date.now()
      expect(formatLastChecked(now - 2 * 24 * 60 * 60 * 1000)).toBe("2天前")
      expect(formatLastChecked(now - 5 * 24 * 60 * 60 * 1000)).toBe("5天前")
      // 7天或更久前会显示完整日期
      const result = formatLastChecked(now - 10 * 24 * 60 * 60 * 1000)
      expect(result).toMatch(/\d{4}/) // 包含年份
    })

    it("应该在英文环境显示英文", () => {
      vi.spyOn(i18n, 'language', 'get').mockReturnValue('en')
      const now = Date.now()
      expect(formatLastChecked(now)).toBe("just now")
      expect(formatLastChecked(now - 2 * 60 * 1000)).toBe("2 minutes ago")
      expect(formatLastChecked(now - 1 * 60 * 1000)).toBe("1 minute ago")
      expect(formatLastChecked(now - 2 * 60 * 60 * 1000)).toBe("2 hours ago")
      expect(formatLastChecked(now - 1 * 60 * 60 * 1000)).toBe("1 hour ago")
      expect(formatLastChecked(now - 2 * 24 * 60 * 60 * 1000)).toBe("2 days ago")
      expect(formatLastChecked(now - 1 * 24 * 60 * 60 * 1000)).toBe("1 day ago")
    })
  })

  describe("getStatusIcon", () => {
    it("应该返回红色图标当不可用时", () => {
      const status: AIProviderStatus = {
        providerId: "deepseek",
        type: "remote",
        available: false,
        lastChecked: Date.now()
      }

      expect(getStatusIcon(status)).toBe("🔴")
    })

    it("应该返回黄色图标当延迟过高时", () => {
      const status: AIProviderStatus = {
        providerId: "deepseek",
        type: "remote",
        available: true,
        lastChecked: Date.now(),
        latency: 2500 // 超过2秒
      }

      expect(getStatusIcon(status)).toBe("🟡")
    })

    it("应该返回绿色图标当正常可用时", () => {
      const status: AIProviderStatus = {
        providerId: "deepseek",
        type: "remote",
        available: true,
        lastChecked: Date.now(),
        latency: 120
      }

      expect(getStatusIcon(status)).toBe("🟢")
    })
  })

  describe("getReasoningIcon", () => {
    it("应该返回白色图标当没有推理信息时", () => {
      expect(getReasoningIcon(undefined)).toBe("⚪")
    })

    it("应该返回警告图标当推理不可用时", () => {
      expect(getReasoningIcon({ available: false })).toBe("⚠️")
    })

    it("应该返回勾选图标当推理可用时", () => {
      expect(getReasoningIcon({ available: true })).toBe("✅")
    })
  })
})
