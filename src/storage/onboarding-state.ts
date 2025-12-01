/**
 * Onboarding 状态管理
 * 
 * 功能：
 * 1. 管理扩展运行状态（setup/learning/ready）
 * 2. 跟踪引导流程进度
 * 3. 提供状态查询和更新接口
 */

import { logger } from "@/utils/logger"
import { withErrorHandling } from "@/utils/error-handler"
import { isAIConfigured } from "./ai-config"

const onboardingLogger = logger.withTag('OnboardingState')

/**
 * 扩展运行状态
 * - setup: 未配置 AI，显示引导界面
 * - learning: 已配置 AI，正在学习（冷启动阶段）
 * - ready: 学习完成，可以推荐（pageCount >= 1000）
 */
export type OnboardingState = 'setup' | 'learning' | 'ready'

/**
 * Onboarding 状态数据
 */
export interface OnboardingStatus {
  /** 当前状态 */
  state: OnboardingState
  
  /** 引导完成时间（毫秒时间戳） */
  completedAt?: number
  
  /** 当前步骤（1-4，仅在 setup 状态有效） */
  currentStep?: number
  
  /** 是否跳过了引导（手动跳过） */
  skipped?: boolean
}

/**
 * 默认状态
 */
const DEFAULT_STATUS: OnboardingStatus = {
  state: 'setup',
  currentStep: 1
}

/**
 * 获取 Onboarding 状态
 */
export async function getOnboardingState(): Promise<OnboardingStatus> {
  return withErrorHandling(
    async () => {
      // 检查 chrome.storage 是否可用
      if (!chrome?.storage?.local) {
        onboardingLogger.warn('chrome.storage.local not available, using default state')
        return DEFAULT_STATUS
      }
      
      const result = await chrome.storage.local.get('onboardingStatus')
      
      if (result.onboardingStatus) {
        const status = result.onboardingStatus as OnboardingStatus
        
        // 验证状态合法性
        if (!['setup', 'learning', 'ready'].includes(status.state)) {
          onboardingLogger.warn(`Invalid state: ${status.state}, reset to setup`)
          return DEFAULT_STATUS
        }
        
        return status
      }
      
      // 首次运行，返回默认状态
      onboardingLogger.info('First run, returning default setup state')
      return DEFAULT_STATUS
    },
    {
      tag: 'OnboardingState.getOnboardingState',
      fallback: DEFAULT_STATUS,
      errorCode: 'ONBOARDING_STATE_LOAD_ERROR',
      userMessage: '加载引导状态失败'
    }
  ) as Promise<OnboardingStatus>
}

/**
 * 保存 Onboarding 状态
 */
export async function setOnboardingState(status: OnboardingStatus): Promise<void> {
  return withErrorHandling(
    async () => {
      // 检查 chrome.storage 是否可用
      if (!chrome?.storage?.local) {
        throw new Error('chrome.storage.local not available')
      }
      
      // 验证状态合法性
      if (!['setup', 'learning', 'ready'].includes(status.state)) {
        throw new Error(`Invalid state: ${status.state}`)
      }
      
      await chrome.storage.local.set({ onboardingStatus: status })
      onboardingLogger.info(`State updated to: ${status.state}`, status)
    },
    {
      tag: 'OnboardingState.setOnboardingState',
      rethrow: true,
      errorCode: 'ONBOARDING_STATE_SAVE_ERROR',
      userMessage: '保存引导状态失败'
    }
  ) as Promise<void>
}

/**
 * 完成引导流程（从 setup 进入 learning）
 * Phase 9.1: 允许不配置 AI 也能完成引导
 */
export async function completeOnboarding(): Promise<void> {
  return withErrorHandling(
    async () => {
      const status: OnboardingStatus = {
        state: 'learning',
        completedAt: Date.now()
      }
      
      await setOnboardingState(status)
      onboardingLogger.info('✅ Onboarding completed, entering learning phase')
    },
    {
      tag: 'OnboardingState.completeOnboarding',
      rethrow: true,
      errorCode: 'ONBOARDING_COMPLETE_ERROR',
      userMessage: '完成引导失败'
    }
  ) as Promise<void>
}

/**
 * 更新当前步骤
 */
export async function updateOnboardingStep(step: number): Promise<void> {
  return withErrorHandling(
    async () => {
      const currentStatus = await getOnboardingState()
      
      // 只能在 setup 状态更新步骤
      if (currentStatus.state !== 'setup') {
        onboardingLogger.warn(`Cannot update step in state: ${currentStatus.state}`)
        return
      }
      
      // 验证步骤范围
      if (step < 1 || step > 4) {
        throw new Error(`Invalid step: ${step}`)
      }
      
      await setOnboardingState({
        ...currentStatus,
        currentStep: step
      })
      
      onboardingLogger.debug(`Step updated to: ${step}`)
    },
    {
      tag: 'OnboardingState.updateOnboardingStep',
      rethrow: true,
      errorCode: 'ONBOARDING_STEP_UPDATE_ERROR',
      userMessage: '更新引导步骤失败'
    }
  ) as Promise<void>
}

/**
 * 跳过引导（进入 learning 状态，但标记为跳过）
 * 仅用于测试或高级用户
 */
export async function skipOnboarding(): Promise<void> {
  return withErrorHandling(
    async () => {
      const status: OnboardingStatus = {
        state: 'learning',
        completedAt: Date.now(),
        skipped: true
      }
      
      await setOnboardingState(status)
      onboardingLogger.warn('⚠️ Onboarding skipped by user')
    },
    {
      tag: 'OnboardingState.skipOnboarding',
      rethrow: true,
      errorCode: 'ONBOARDING_SKIP_ERROR',
      userMessage: '跳过引导失败'
    }
  ) as Promise<void>
}

/**
 * 进入 Ready 状态（当 pageCount >= 1000）
 * 由 Popup 在检测到冷启动完成时调用
 */
export async function enterReadyState(): Promise<void> {
  return withErrorHandling(
    async () => {
      const currentStatus = await getOnboardingState()
      
      // 只能从 learning 进入 ready
      if (currentStatus.state !== 'learning') {
        onboardingLogger.warn(`Cannot enter ready from state: ${currentStatus.state}`)
        return
      }
      
      const status: OnboardingStatus = {
        ...currentStatus,
        state: 'ready'
      }
      
      await setOnboardingState(status)
      onboardingLogger.info('✅ Entered ready state, recommendations available')
    },
    {
      tag: 'OnboardingState.enterReadyState',
      rethrow: true,
      errorCode: 'ONBOARDING_READY_ERROR',
      userMessage: '进入准备状态失败'
    }
  ) as Promise<void>
}

/**
 * 重置 Onboarding 状态（用于测试或重新引导）
 */
export async function resetOnboarding(): Promise<void> {
  return withErrorHandling(
    async () => {
      await setOnboardingState(DEFAULT_STATUS)
      onboardingLogger.warn('🔄 Onboarding state reset to default')
    },
    {
      tag: 'OnboardingState.resetOnboarding',
      rethrow: true,
      errorCode: 'ONBOARDING_RESET_ERROR',
      userMessage: '重置引导状态失败'
    }
  ) as Promise<void>
}

/**
 * 检查是否需要显示引导界面
 */
export async function shouldShowOnboarding(): Promise<boolean> {
  const status = await getOnboardingState()
  return status.state === 'setup'
}
