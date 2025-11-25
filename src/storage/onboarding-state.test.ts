import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  getOnboardingState,
  setOnboardingState,
  completeOnboarding,
  updateOnboardingStep,
  skipOnboarding,
  enterReadyState,
  resetOnboarding,
  shouldShowOnboarding,
  type OnboardingStatus
} from "./onboarding-state"
import * as aiConfig from "./ai-config"

// Mock chrome.storage API
const mockStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn()
  }
}

global.chrome = {
  storage: mockStorage
} as any

// Mock ai-config
vi.mock("./ai-config", () => ({
  isAIConfigured: vi.fn()
}))

describe("OnboardingState", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    
    // 默认返回空对象（首次运行）
    mockStorage.local.get.mockResolvedValue({})
    mockStorage.local.set.mockResolvedValue(undefined)
  })

  describe("getOnboardingState", () => {
    it("首次运行时应该返回默认 setup 状态", async () => {
      const status = await getOnboardingState()
      
      expect(status).toEqual({
        state: 'setup',
        currentStep: 1
      })
    })

    it("应该返回已保存的状态", async () => {
      const savedStatus: OnboardingStatus = {
        state: 'learning',
        completedAt: Date.now()
      }
      
      mockStorage.local.get.mockResolvedValue({
        onboardingStatus: savedStatus
      })
      
      const status = await getOnboardingState()
      
      expect(status).toEqual(savedStatus)
    })

    it("无效状态时应该返回默认状态", async () => {
      mockStorage.local.get.mockResolvedValue({
        onboardingStatus: {
          state: 'invalid-state'
        }
      })
      
      const status = await getOnboardingState()
      
      expect(status.state).toBe('setup')
    })

    it("chrome.storage 不可用时应该返回默认状态", async () => {
      const originalChrome = global.chrome
      // @ts-ignore
      global.chrome = undefined
      
      const status = await getOnboardingState()
      
      expect(status.state).toBe('setup')
      
      global.chrome = originalChrome
    })
  })

  describe("setOnboardingState", () => {
    it("应该保存状态到 chrome.storage.local", async () => {
      const status: OnboardingStatus = {
        state: 'learning',
        completedAt: Date.now()
      }
      
      await setOnboardingState(status)
      
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        onboardingStatus: status
      })
    })

    it("无效状态时应该抛出错误", async () => {
      await expect(
        setOnboardingState({ state: 'invalid' as any })
      ).rejects.toThrow('Invalid state')
    })

    it("chrome.storage 不可用时应该抛出错误", async () => {
      const originalChrome = global.chrome
      // @ts-ignore
      global.chrome = undefined
      
      await expect(
        setOnboardingState({ state: 'setup', currentStep: 1 })
      ).rejects.toThrow('chrome.storage.local not available')
      
      global.chrome = originalChrome
    })
  })

  describe("completeOnboarding", () => {
    it("AI 配置后应该进入 learning 状态", async () => {
      // @ts-ignore
      vi.mocked(aiConfig.isAIConfigured).mockResolvedValue(true)
      
      await completeOnboarding()
      
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        onboardingStatus: expect.objectContaining({
          state: 'learning',
          completedAt: expect.any(Number)
        })
      })
    })

    it("AI 未配置时应该抛出错误", async () => {
      // @ts-ignore
      vi.mocked(aiConfig.isAIConfigured).mockResolvedValue(false)
      
      await expect(completeOnboarding()).rejects.toThrow(
        'Cannot complete onboarding: AI not configured'
      )
    })
  })

  describe("updateOnboardingStep", () => {
    it("setup 状态时应该更新当前步骤", async () => {
      mockStorage.local.get.mockResolvedValue({
        onboardingStatus: {
          state: 'setup',
          currentStep: 1
        }
      })
      
      await updateOnboardingStep(2)
      
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        onboardingStatus: expect.objectContaining({
          state: 'setup',
          currentStep: 2
        })
      })
    })

    it("非 setup 状态时不应该更新步骤", async () => {
      mockStorage.local.get.mockResolvedValue({
        onboardingStatus: {
          state: 'learning',
          completedAt: Date.now()
        }
      })
      
      await updateOnboardingStep(2)
      
      expect(mockStorage.local.set).not.toHaveBeenCalled()
    })

    it("无效步骤时应该抛出错误", async () => {
      mockStorage.local.get.mockResolvedValue({
        onboardingStatus: {
          state: 'setup',
          currentStep: 1
        }
      })
      
      await expect(updateOnboardingStep(0)).rejects.toThrow('Invalid step')
      await expect(updateOnboardingStep(5)).rejects.toThrow('Invalid step')
    })
  })

  describe("skipOnboarding", () => {
    it("应该进入 learning 状态并标记为 skipped", async () => {
      await skipOnboarding()
      
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        onboardingStatus: expect.objectContaining({
          state: 'learning',
          completedAt: expect.any(Number),
          skipped: true
        })
      })
    })
  })

  describe("enterReadyState", () => {
    it("从 learning 状态应该进入 ready 状态", async () => {
      const completedAt = Date.now()
      mockStorage.local.get.mockResolvedValue({
        onboardingStatus: {
          state: 'learning',
          completedAt
        }
      })
      
      await enterReadyState()
      
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        onboardingStatus: expect.objectContaining({
          state: 'ready',
          completedAt
        })
      })
    })

    it("非 learning 状态时不应该进入 ready", async () => {
      mockStorage.local.get.mockResolvedValue({
        onboardingStatus: {
          state: 'setup',
          currentStep: 1
        }
      })
      
      await enterReadyState()
      
      expect(mockStorage.local.set).not.toHaveBeenCalled()
    })
  })

  describe("resetOnboarding", () => {
    it("应该重置到默认 setup 状态", async () => {
      await resetOnboarding()
      
      expect(mockStorage.local.set).toHaveBeenCalledWith({
        onboardingStatus: {
          state: 'setup',
          currentStep: 1
        }
      })
    })
  })

  describe("shouldShowOnboarding", () => {
    it("setup 状态时应该返回 true", async () => {
      mockStorage.local.get.mockResolvedValue({
        onboardingStatus: {
          state: 'setup',
          currentStep: 1
        }
      })
      
      const result = await shouldShowOnboarding()
      
      expect(result).toBe(true)
    })

    it("learning 状态时应该返回 false", async () => {
      mockStorage.local.get.mockResolvedValue({
        onboardingStatus: {
          state: 'learning',
          completedAt: Date.now()
        }
      })
      
      const result = await shouldShowOnboarding()
      
      expect(result).toBe(false)
    })

    it("ready 状态时应该返回 false", async () => {
      mockStorage.local.get.mockResolvedValue({
        onboardingStatus: {
          state: 'ready',
          completedAt: Date.now()
        }
      })
      
      const result = await shouldShowOnboarding()
      
      expect(result).toBe(false)
    })
  })
})
