/**
 * AI Provider 状态管理
 * 
 * 用于缓存和管理 AI Provider 的可用性状态、延迟、推理能力等信息
 */

import { logger } from '@/utils/logger'
import { formatRelativeTime } from '@/utils/date-formatter'

const statusLogger = logger.withTag('AIProviderStatus')

/**
 * AI Provider 推理能力状态
 */
export interface AIReasoningStatus {
  available: boolean // 是否支持推理
  latency?: number // 推理模式延迟（ms）
  error?: string // 推理测试错误
  lastChecked?: number // 上次检测时间
}

/**
 * AI Provider 状态
 */
export interface AIProviderStatus {
  providerId: string // 'deepseek', 'openai', 'ollama', etc.
  type: 'remote' | 'local'
  available: boolean
  lastChecked: number // 时间戳
  latency?: number // 响应延迟（ms）
  error?: string // 错误信息
  reasoning?: AIReasoningStatus // 推理能力状态
}

/**
 * 所有 Provider 的状态集合
 */
export interface AIProvidersStatus {
  [providerId: string]: AIProviderStatus
}

const STORAGE_KEY = 'aiProvidersStatus'
const CACHE_DURATION = 5 * 60 * 1000 // 5 分钟缓存

/**
 * 获取所有 Provider 状态
 */
export async function getAllProviderStatus(): Promise<AIProvidersStatus> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    return result[STORAGE_KEY] || {}
  } catch (error) {
    statusLogger.error('获取 Provider 状态失败:', error)
    return {}
  }
}

/**
 * 获取单个 Provider 状态
 */
export async function getProviderStatus(providerId: string): Promise<AIProviderStatus | null> {
  const allStatus = await getAllProviderStatus()
  return allStatus[providerId] || null
}

/**
 * 保存单个 Provider 状态
 */
export async function saveProviderStatus(status: AIProviderStatus): Promise<void> {
  try {
    const allStatus = await getAllProviderStatus()
    allStatus[status.providerId] = {
      ...status,
      lastChecked: Date.now()
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: allStatus })
    statusLogger.debug(`Provider 状态已保存: ${status.providerId}`, status)
  } catch (error) {
    statusLogger.error(`保存 Provider 状态失败: ${status.providerId}`, error)
  }
}

/**
 * 批量保存 Provider 状态
 */
export async function saveAllProviderStatus(statuses: AIProvidersStatus): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: statuses })
    statusLogger.debug('批量保存 Provider 状态', Object.keys(statuses))
  } catch (error) {
    statusLogger.error('批量保存 Provider 状态失败', error)
  }
}

/**
 * 删除 Provider 状态
 */
export async function deleteProviderStatus(providerId: string): Promise<void> {
  try {
    const allStatus = await getAllProviderStatus()
    delete allStatus[providerId]
    await chrome.storage.local.set({ [STORAGE_KEY]: allStatus })
    statusLogger.debug(`Provider 状态已删除: ${providerId}`)
  } catch (error) {
    statusLogger.error(`删除 Provider 状态失败: ${providerId}`, error)
  }
}

/**
 * 清空所有 Provider 状态
 */
export async function clearAllProviderStatus(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY)
    statusLogger.debug('所有 Provider 状态已清空')
  } catch (error) {
    statusLogger.error('清空 Provider 状态失败', error)
  }
}

/**
 * 检查状态是否过期
 */
export function isStatusExpired(status: AIProviderStatus, cacheDuration: number = CACHE_DURATION): boolean {
  if (!status.lastChecked) return true
  return Date.now() - status.lastChecked > cacheDuration
}

/**
 * 格式化延迟显示
 */
export function formatLatency(latency?: number): string {
  if (!latency) return '未知'
  if (latency < 1000) return `${latency}ms`
  return `${(latency / 1000).toFixed(1)}s`
}

/**
 * 格式化上次检测时间
 */
export function formatLastChecked(timestamp: number): string {
  return formatRelativeTime(timestamp)
}

/**
 * 获取状态图标
 */
export function getStatusIcon(status: AIProviderStatus): string {
  if (!status.available) return '🔴'
  if (status.latency && status.latency > 2000) return '🟡'
  return '🟢'
}

/**
 * 获取推理状态图标
 */
export function getReasoningIcon(reasoning?: AIReasoningStatus): string {
  if (!reasoning) return '⚪'
  if (!reasoning.available) return '⚠️'
  return '✅'
}
