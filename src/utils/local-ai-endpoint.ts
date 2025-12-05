import type { LocalAIConfig } from '@/storage/ai-config'
import { logger } from './logger'

const localAILogger = logger.withTag('LocalAIEndpoint')

export type LocalAIEndpointMode = 'legacy' | 'openai'

export interface LocalAIEndpointSet {
  baseUrl: string
  chatUrl: string
  modelsUrl: string
  generateUrl?: string
}

export interface ResolvedLocalAIEndpoint {
  /** 去掉多余斜杠的基础地址（不含 /v1 后缀） */
  baseUrl: string
  /** 用户输入首选模式 */
  mode: LocalAIEndpointMode
  /** 当前模式下默认使用的聊天和模型接口 */
  chatUrl: string
  modelsUrl: string
  /** 显式的 legacy/openai 端点，方便在失败时回退 */
  legacy: LocalAIEndpointSet
  openai: LocalAIEndpointSet
}

export interface LocalModelSummary {
  id: string
  label: string
  family?: string
  size?: string
  isReasoning?: boolean  // 是否为推理模型（基于命名检测）
}

export interface LocalModelListResult {
  mode: LocalAIEndpointMode
  models: LocalModelSummary[]
}

/**
 * 规范化用户输入的本地 AI Endpoint，统一判断是否使用 OpenAI 兼容接口
 */
export function resolveLocalAIEndpoint(endpoint?: string): ResolvedLocalAIEndpoint {
  const fallback = 'http://localhost:11434/v1'
  const trimmed = (endpoint?.trim() || fallback).replace(/\/+$/, '')
  const hasV1Suffix = /\/v1$/i.test(trimmed)
  const normalizedBase = hasV1Suffix ? trimmed.replace(/\/v1$/i, '') : trimmed
  const openAIBase = `${normalizedBase}/v1`
  const legacyBase = normalizedBase

  const legacy: LocalAIEndpointSet = {
    baseUrl: legacyBase,
    chatUrl: `${legacyBase}/api/chat`,
    modelsUrl: `${legacyBase}/api/tags`,
    generateUrl: `${legacyBase}/api/generate`
  }

  const openai: LocalAIEndpointSet = {
    baseUrl: openAIBase,
    chatUrl: `${openAIBase}/chat/completions`,
    modelsUrl: `${openAIBase}/models`
  }

  return {
    baseUrl: normalizedBase,
    mode: hasV1Suffix ? 'openai' : 'legacy',
    chatUrl: hasV1Suffix ? openai.chatUrl : legacy.chatUrl,
    modelsUrl: hasV1Suffix ? openai.modelsUrl : legacy.modelsUrl,
    legacy,
    openai
  }
}

const DEFAULT_LOCAL_HEADERS: HeadersInit = {
  'Content-Type': 'application/json'
}

export function buildLocalAIHeaders(mode: LocalAIEndpointMode, apiKey?: string): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  // Phase 11 修复: Ollama 本地接口不需要 Authorization 头
  // 只有在使用非 Ollama 的 OpenAI 兼容服务时才需要
  // 如果用户明确提供了 apiKey（不是默认的 'ollama'），才添加 Authorization
  if (mode === 'openai' && apiKey && apiKey.trim() && apiKey.trim().toLowerCase() !== 'ollama') {
    headers.Authorization = `Bearer ${apiKey.trim()}`
  }

  return headers
}

/**
 * 检测模型名是否为推理模型
 */
function isReasoningModel(modelName: string): boolean {
  const normalized = modelName.toLowerCase()
  const keywords = ['r1', 'reasoning', 'think', 'cot']
  return keywords.some(keyword => normalized.includes(keyword))
}

function parseOpenAIModelList(data: any): LocalModelSummary[] {
  const list = Array.isArray(data?.data) ? data.data : []
  return list
    .filter((item: any) => typeof item?.id === 'string')
    .map((item: any) => ({
      id: item.id,
      label: item.id,
      family: item.owned_by || item.object,
      size: item.created ? String(item.created) : undefined,
      isReasoning: isReasoningModel(item.id)
    }))
}

function parseLegacyModelList(data: any): LocalModelSummary[] {
  const models = Array.isArray(data?.models) ? data.models : []
  return models
    .filter((item: any) => typeof item?.name === 'string')
    .map((item: any) => ({
      id: item.name,
      label: item.details?.parameter_size ? `${item.name} - ${item.details.parameter_size}` : item.name,
      family: item.details?.family,
      size: item.details?.parameter_size,
      isReasoning: isReasoningModel(item.name)
    }))
}

export async function listLocalModels(endpoint?: string, apiKey?: string): Promise<LocalModelListResult> {
  const resolved = resolveLocalAIEndpoint(endpoint)
  
  // Phase 11 优化: 只尝试首选模式，除非失败才尝试备用模式
  const primaryMode = resolved.mode
  const primaryUrl = primaryMode === 'openai' ? resolved.openai.modelsUrl : resolved.legacy.modelsUrl
  const fallbackMode: LocalAIEndpointMode = primaryMode === 'openai' ? 'legacy' : 'openai'
  const fallbackUrl = fallbackMode === 'openai' ? resolved.openai.modelsUrl : resolved.legacy.modelsUrl

  // 先尝试首选模式
  try {
    localAILogger.debug(`尝试获取模型列表: ${primaryMode} - ${primaryUrl}`)
    
    const headers = buildLocalAIHeaders(primaryMode, apiKey)
    const response = await fetch(primaryUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(4000)
    })

    if (response.ok) {
      const data = await response.json()
      const models = primaryMode === "openai"
        ? parseOpenAIModelList(data)
        : parseLegacyModelList(data)

      if (models.length > 0) {
        localAILogger.info(`✅ 成功获取 ${models.length} 个模型: ${models.map(m => m.id).join(', ')}`)
        return { mode: primaryMode, models }
      }
    }
  } catch (error) {
    localAILogger.debug(`${primaryMode} 接口失败，尝试备用模式...`, error)
  }

  // 首选模式失败，尝试备用模式
  try {
    localAILogger.debug(`尝试备用模式: ${fallbackMode} - ${fallbackUrl}`)
    
    const headers = buildLocalAIHeaders(fallbackMode, apiKey)
    const response = await fetch(fallbackUrl, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(4000)
    })

    if (response.ok) {
      const data = await response.json()
      const models = fallbackMode === "openai"
        ? parseOpenAIModelList(data)
        : parseLegacyModelList(data)

      if (models.length > 0) {
        localAILogger.info(`✅ 备用模式成功获取 ${models.length} 个模型: ${models.map(m => m.id).join(', ')}`)
        return { mode: fallbackMode, models }
      }
    }
  } catch (error) {
    localAILogger.error(`备用模式也失败`, error)
  }

  // 两种模式都失败
  localAILogger.error('获取本地模型列表失败（所有接口均不可用）')
  throw new Error('无法从 Ollama 获取模型列表，请检查服务是否运行')
}

export function mergeLocalConfig(defaultConfig: LocalAIConfig, saved?: LocalAIConfig): LocalAIConfig {
  return {
    ...defaultConfig,
    ...saved,
    provider: 'ollama'
  }
}
