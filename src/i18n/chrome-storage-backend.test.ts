/**
 * ChromeStorageBackend 测试
 * 
 * 测试 i18n 语言偏好存储到 chrome.storage.sync
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import ChromeStorageBackend from "./chrome-storage-backend"

// Mock chrome.storage API
const mockStorage = {
  sync: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn()
  }
}

global.chrome = {
  storage: mockStorage
} as any

describe("ChromeStorageBackend", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 默认成功的 mock
    mockStorage.sync.get.mockResolvedValue({})
    mockStorage.sync.set.mockResolvedValue(undefined)
    mockStorage.sync.remove.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe("saveLanguage", () => {
    it("应该保存语言偏好到 chrome.storage.sync", async () => {
      await ChromeStorageBackend.saveLanguage("zh-CN")

      expect(mockStorage.sync.set).toHaveBeenCalledWith({
        i18nextLng: "zh-CN"
      })
    })

    it("应该保存英文语言偏好", async () => {
      await ChromeStorageBackend.saveLanguage("en-US")

      expect(mockStorage.sync.set).toHaveBeenCalledWith({
        i18nextLng: "en-US"
      })
    })

    it("应该在 chrome.storage 不可用时抛出错误", async () => {
      // 临时移除 chrome.storage
      const originalStorage = global.chrome.storage
      // @ts-ignore
      delete global.chrome.storage

      await expect(ChromeStorageBackend.saveLanguage("zh-CN"))
        .rejects
        .toThrow("chrome.storage.sync not available")

      // 恢复
      global.chrome.storage = originalStorage
    })

    it("应该在保存失败时抛出错误", async () => {
      mockStorage.sync.set.mockRejectedValue(new Error("Storage error"))

      await expect(ChromeStorageBackend.saveLanguage("zh-CN"))
        .rejects
        .toThrow("Storage error")
    })
  })

  describe("loadLanguage", () => {
    it("应该从 chrome.storage.sync 加载语言偏好", async () => {
      mockStorage.sync.get.mockResolvedValue({
        i18nextLng: "zh-CN"
      })

      const result = await ChromeStorageBackend.loadLanguage()

      expect(mockStorage.sync.get).toHaveBeenCalledWith("i18nextLng")
      expect(result).toBe("zh-CN")
    })

    it("应该在未设置语言时返回 null", async () => {
      mockStorage.sync.get.mockResolvedValue({})

      const result = await ChromeStorageBackend.loadLanguage()

      expect(result).toBeNull()
    })

    it("应该在 chrome.storage 不可用时返回 null", async () => {
      // 临时移除 chrome.storage
      const originalStorage = global.chrome.storage
      // @ts-ignore
      delete global.chrome.storage

      const result = await ChromeStorageBackend.loadLanguage()

      expect(result).toBeNull()

      // 恢复
      global.chrome.storage = originalStorage
    })

    it("应该在加载失败时返回 null", async () => {
      mockStorage.sync.get.mockRejectedValue(new Error("Storage error"))

      const result = await ChromeStorageBackend.loadLanguage()

      expect(result).toBeNull()
    })
  })

  describe("removeLanguage", () => {
    it("应该删除语言偏好", async () => {
      await ChromeStorageBackend.removeLanguage()

      expect(mockStorage.sync.remove).toHaveBeenCalledWith("i18nextLng")
    })

    it("应该在 chrome.storage 不可用时不抛出错误", async () => {
      // 临时移除 chrome.storage
      const originalStorage = global.chrome.storage
      // @ts-ignore
      delete global.chrome.storage

      await expect(ChromeStorageBackend.removeLanguage()).resolves.toBeUndefined()

      // 恢复
      global.chrome.storage = originalStorage
    })

    it("应该在删除失败时抛出错误", async () => {
      mockStorage.sync.remove.mockRejectedValue(new Error("Storage error"))

      await expect(ChromeStorageBackend.removeLanguage())
        .rejects
        .toThrow("Storage error")
    })
  })

  describe("Backend interface methods", () => {
    it("应该实现 init 方法", () => {
      const backend = new ChromeStorageBackend()
      
      expect(() => {
        backend.init({}, {}, {})
      }).not.toThrow()
    })

    it("应该实现 read 方法", () => {
      const backend = new ChromeStorageBackend()
      
      return new Promise<void>((resolve) => {
        backend.read("zh-CN", "translation", (err, data) => {
          expect(err).toBeNull()
          expect(data).toBeNull()
          resolve()
        })
      })
    })

    it("type 属性应该是 'backend'", () => {
      const backend = new ChromeStorageBackend()
      expect(backend.type).toBe("backend")
    })
  })
})
