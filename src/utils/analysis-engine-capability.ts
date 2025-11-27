/**
 * 分析引擎能力检测工具
 * Phase 9: 检测各种分析引擎的可用性
 */

import { getAIConfig, isAIConfigured } from '@/storage/ai-config'
import { logger } from './logger'
import { listLocalModels } from './local-ai-endpoint'
import type { 
  AnalysisEngine, 
  AnalysisEngineCapability, 
  AnalysisEngineCapabilities 
} from '@/types/analysis-engine'

const capabilityLogger = logger.withTag('EngineCapability')

/**
 * 检测 Chrome AI 是否可用
 */
async function checkChromeAI(): Promise<boolean> {
  try {
    if (typeof window === 'undefined' || !('ai' in window)) {
      return false
    }
    
    const ai = (window as any).ai
    if (!ai || !('languageModel' in ai)) {
      return false
    }
    
    const capabilities = await ai.languageModel.capabilities()
    return capabilities && capabilities.available === 'readily'
  } catch (error) {
    capabilityLogger.debug('Chrome AI 不可用:', error)
    return false
  }
}

/**
 * 检测 Ollama 是否可用
 */
async function checkOllama(endpoint?: string, apiKey?: string): Promise<boolean> {
  try {
    const result = await listLocalModels(endpoint, apiKey)
    return result.models.length > 0
  } catch (error) {
    capabilityLogger.debug('Ollama 不可用（正常）')
    return false
  }
}

/**
 * 检测本地 AI 是否可用
 * 导出供 UI 组件使用
 */
export async function checkLocalAI(): Promise<AnalysisEngineCapability> {
  try {
    const aiConfig = await getAIConfig()
    const localConfig = aiConfig.local

    if (!localConfig?.enabled) {
      return {
        available: false,
        reason: '本地 AI 未启用，请先在 AI 引擎页面打开',
        details: { configEnabled: false, status: 'not-enabled' }
      }
    }

    const endpoint = (localConfig.endpoint || '').trim()
    if (!endpoint) {
      return {
        available: false,
        reason: '本地 AI 服务地址未填写',
        details: { configEnabled: true, status: 'missing-endpoint' }
      }
    }

    const model = (localConfig.model || '').trim()
    if (!model) {
      return {
        available: false,
        reason: '本地 AI 模型名称未填写',
        details: { configEnabled: true, status: 'missing-model' }
      }
    }

    const hasChromeAI = await checkChromeAI()
    const hasOllama = await checkOllama(endpoint, localConfig.apiKey)
    const provider = localConfig.provider || 'ollama'
    const providerAvailable = provider === 'ollama'
      ? hasOllama
      : hasChromeAI

    if (!providerAvailable) {
      const reason = provider === 'ollama'
        ? '无法连接到 Ollama，请确认服务已启动且地址正确'
        : '未检测到 Chrome AI，请检查浏览器版本与实验特性设置'
      return {
        available: false,
        reason,
        details: {
          provider,
          endpoint,
          model,
          hasChromeAI,
          hasOllama,
          status: provider === 'ollama' ? 'ollama-offline' : 'chrome-ai-offline'
        }
      }
    }

    const detectedReason = provider === 'ollama'
      ? `检测到 Ollama (${model})`
      : '检测到 Chrome AI'

    return {
      available: true,
      reason: detectedReason,
      details: {
        provider,
        endpoint,
        model,
        hasChromeAI,
        hasOllama,
        status: 'ready'
      }
    }
  } catch (error) {
    capabilityLogger.error('本地 AI 检测失败:', error)
    return {
      available: false,
      reason: error instanceof Error ? error.message : '本地 AI 检测失败'
    }
  }
}

/**
 * 检测远程 AI 是否可用
 */
async function checkRemoteAI(): Promise<AnalysisEngineCapability> {
  try {
    const isConfigured = await isAIConfigured()
    
    if (!isConfigured) {
      return {
        available: false,
        reason: '未配置 AI API（需要设置 OpenAI、Anthropic 或 DeepSeek API）'
      }
    }
    
    const aiConfig = await getAIConfig()
    
    // 检查 API Key（新的 apiKeys 结构或旧的 apiKey 字段）
    const apiKey = aiConfig.apiKeys?.[aiConfig.provider!] || aiConfig.apiKey || ""
    if (!apiKey) {
      return {
        available: false,
        reason: 'API Key 未设置'
      }
    }
    
    return {
      available: true,
      reason: `已配置 ${aiConfig.provider} API`
    }
  } catch (error) {
    capabilityLogger.error('远程 AI 检测失败:', error)
    return {
      available: false,
      reason: error instanceof Error ? error.message : '配置检查失败'
    }
  }
}

/**
 * 检测远程 AI 推理模式是否可用
 */
async function checkRemoteAIWithReasoning(): Promise<AnalysisEngineCapability> {
  try {
    const isConfigured = await isAIConfigured()
    
    if (!isConfigured) {
      return {
        available: false,
        reason: '未配置 AI API'
      }
    }
    
    const aiConfig = await getAIConfig()
    
    // 检查是否启用推理能力
    if (!aiConfig.enableReasoning) {
      return {
        available: false,
        reason: '推理能力未启用（请在 AI 引擎设置中启用）'
      }
    }
    
    // 当前只有 DeepSeek 实现了推理模式
    // 未来其他提供商也可能支持
    if (aiConfig.provider === 'deepseek') {
      return {
        available: true,
        reason: 'DeepSeek-R1 推理模式已启用（成本约为标准模式 10 倍）'
      }
    }
    
    // 其他提供商：已启用推理但暂不支持
    return {
      available: false,
      reason: `${aiConfig.provider} 暂不支持推理模式（未来可能会支持）`
    }
  } catch (error) {
    capabilityLogger.error('推理模式检测失败:', error)
    return {
      available: false,
      reason: error instanceof Error ? error.message : '配置检查失败'
    }
  }
}

/**
 * 检测关键字引擎可用性
 * 关键字引擎始终可用（基于 TF-IDF 算法）
 */
function checkKeyword(): AnalysisEngineCapability {
  return {
    available: true,
    reason: '基于 TF-IDF 算法，无需 AI，速度最快'
  }
}

/**
 * 检测单个分析引擎的能力
 */
export async function checkEngineCapability(
  engine: AnalysisEngine
): Promise<AnalysisEngineCapability> {
  switch (engine) {
    case 'remoteAI':
      return checkRemoteAI()
    case 'remoteAIWithReasoning':
      return checkRemoteAIWithReasoning()
    case 'localAI':
      return checkLocalAI()
    case 'keyword':
      return checkKeyword()
    default:
      return {
        available: false,
        reason: '未知的引擎类型'
      }
  }
}

/**
 * 检测所有分析引擎的能力
 */
export async function checkAllEngineCapabilities(): Promise<AnalysisEngineCapabilities> {
  const [remoteAI, remoteAIWithReasoning, localAI, keyword] = await Promise.all([
    checkRemoteAI(),
    checkRemoteAIWithReasoning(),
    checkLocalAI(),
    checkKeyword()
  ])
  
  return {
    remoteAI,
    remoteAIWithReasoning,
    localAI,
    keyword
  }
}

/**
 * 获取推荐的分析引擎
 * 根据当前可用性推荐最佳引擎
 */
export async function getRecommendedEngine(): Promise<{
  engine: AnalysisEngine
  reason: string
}> {
  const capabilities = await checkAllEngineCapabilities()
  
  // 优先级：remoteAI > localAI > keyword
  // 不推荐 remoteAIWithReasoning（成本太高，需要用户主动选择）
  
  if (capabilities.remoteAI.available) {
    return {
      engine: 'remoteAI',
      reason: '远程 AI 已配置，推荐使用以获得最佳质量'
    }
  }
  
  if (capabilities.localAI.available) {
    return {
      engine: 'localAI',
      reason: capabilities.localAI.reason || '本地 AI 可用，推荐使用以保护隐私'
    }
  }
  
  return {
    engine: 'keyword',
    reason: '使用 TF-IDF 关键字算法（无需配置 AI）'
  }
}
