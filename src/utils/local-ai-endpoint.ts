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

  // Phase 11 修复: OpenAI 兼容模式下始终添加 Authorization 头
  // Ollama 的 OpenAI 兼容接口即使不需要真实的 API Key，
  // 也需要 Authorization 头，否则会返回 403
  if (mode === 'openai') {
    const token = apiKey?.trim() || 'ollama'
    headers.Authorization = `Bearer ${token}`
  }

  return headers
}

function parseOpenAIModelList(data: any): LocalModelSummary[] {
  const list = Array.isArray(data?.data) ? data.data : []
  return list
    .filter((item: any) => typeof item?.id === 'string')
    .map((item: any) => ({
      id: item.id,
      label: item.id,
      family: item.owned_by || item.object,
      size: item.created ? String(item.created) : undefined
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
      size: item.details?.parameter_size
    }))
}

export async function listLocalModels(endpoint?: string, apiKey?: string): Promise<LocalModelListResult> {
  const resolved = resolveLocalAIEndpoint(endpoint)
  const attemptOrder: Array<{ mode: LocalAIEndpointMode; url: string }> = resolved.mode === 'openai'
    ? [
        { mode: 'openai', url: resolved.openai.modelsUrl },
        { mode: 'legacy', url: resolved.legacy.modelsUrl }
      ]
    : [
        { mode: 'legacy', url: resolved.legacy.modelsUrl },
        { mode: 'openai', url: resolved.openai.modelsUrl }
      ]

  let lastError: Error | null = null
  const mergedModels: LocalModelSummary[] = []
  const dedupMap = new Map<string, LocalModelSummary>()
  let detectedMode: LocalAIEndpointMode | null = null

  for (const attempt of attemptOrder) {
    const headers = buildLocalAIHeaders(attempt.mode, apiKey)
    
    try {
      localAILogger.debug(`尝试获取模型列表: ${attempt.mode} - ${attempt.url}`)
      
      const response = await fetch(attempt.url, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(4000)
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = await response.json()
      const models = attempt.mode === "openai"
        ? parseOpenAIModelList(data)
        : parseLegacyModelList(data)

      localAILogger.debug(`${attempt.mode} 接口返回 ${models.length} 个模型`)

      if (!models.length) {
        localAILogger.debug(`${attempt.mode} 接口未返回模型列表`)
      }

      if (!detectedMode && models.length) {
        detectedMode = attempt.mode
      } else if (!detectedMode) {
        detectedMode = attempt.mode
      }

      for (const model of models) {
        if (!dedupMap.has(model.id)) {
          dedupMap.set(model.id, model)
          mergedModels.push(model)
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      localAILogger.debug(`${attempt.mode} 模型列表获取失败`, lastError)
    }
  }

  if (mergedModels.length) {
    const result = {
      mode: detectedMode ?? attemptOrder[0].mode,
      models: mergedModels
    }
    localAILogger.info(`✅ 成功获取 ${mergedModels.length} 个模型:`, mergedModels.map(m => m.id).join(', '))
    return result
  }

  localAILogger.warn('获取本地模型列表失败（所有接口均不可用）', lastError)
  throw lastError ?? new Error('无法获取本地模型列表')
}

export function mergeLocalConfig(defaultConfig: LocalAIConfig, saved?: LocalAIConfig): LocalAIConfig {
  return {
    ...defaultConfig,
    ...saved,
    provider: 'ollama'
  }
}
