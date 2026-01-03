import { useEffect, useState } from "react"
import type { AIProviderStatus, AIProvidersStatus } from "@/storage/ai-provider-status"
import { getAllProviderStatus, saveProviderStatus } from "@/storage/ai-provider-status"
import { AICapabilityManager } from "@/core/ai/AICapabilityManager"
import { getAIConfig } from "@/storage/ai-config"
import { translate as _ } from "@/i18n/helpers"
import { DeepSeekProvider } from '@/core/ai/providers/DeepSeekProvider'
import { OpenAIProvider } from '@/core/ai/providers/OpenAIProvider'
import { OllamaProvider } from '@/core/ai/providers/OllamaProvider'

/**
 * AI Provider 状态管理 Hook
 * 
 * 功能：
 * - 获取所有 Provider 的状态
 * - 检测 Provider 可用性
 * - 自动刷新过期缓存
 */
export function useAIProviderStatus() {
  const [status, setStatus] = useState<AIProvidersStatus>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 加载所有 Provider 状态
   */
  const loadStatus = async () => {
    try {
      const allStatus = await getAllProviderStatus()
      setStatus(allStatus)
    } catch (err) {
      console.error("[useAIProviderStatus] 加载状态失败:", err)
      setError(err instanceof Error ? err.message : "加载状态失败")
    }
  }

  /**
   * 检测单个 Provider 的可用性
   * Phase 9.2 修复: 直接创建 provider 实例测试，不依赖 AICapabilityManager
   */
  const checkProvider = async (providerId: string, type: 'remote' | 'local'): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      // 1. 先检查是否已配置
      const config = await getAIConfig()
      
      // 对于远程 Provider，检查 API Key
      if (type === 'remote') {
        // Phase 9.2: 使用新的 providers 结构
        const providerConfig = config.providers?.[providerId as keyof typeof config.providers]
        
        if (!providerConfig || !providerConfig.apiKey) {
          // 未配置 API Key，标记为未配置状态
          const providerStatus: AIProviderStatus = {
            providerId,
            type,
            available: false,
            lastChecked: Date.now(),
            error: _("options.aiConfig.card.errors.notConfigured")
          }
          
          await saveProviderStatus(providerStatus)
          await loadStatus()
          return
        }
        
        // 已配置，直接创建 provider 实例测试
        let provider
        const { apiKey, model, enableReasoning = false } = providerConfig
        
        // 清理 API Key 中的非 ASCII 字符
        const cleanApiKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim()
        
        if (providerId === 'deepseek') {
          provider = new DeepSeekProvider({ apiKey: cleanApiKey, model })
        } else if (providerId === 'openai') {
          provider = new OpenAIProvider({ apiKey: cleanApiKey, model })
        } else {
          throw new Error(`不支持的提供商: ${providerId}`)
        }
        
        // 测试连接
        const result = await (provider as any).testConnection(false)
        
        // 保存状态
        const providerStatus: AIProviderStatus = {
          providerId,
          type,
          available: result.success,
          lastChecked: Date.now(),
          latency: result.latency,
          error: result.success ? undefined : result.message
        }
        
        await saveProviderStatus(providerStatus)
        await loadStatus()
      } else {
        // 对于本地 Provider，检查是否启用
        if (!config.local?.enabled) {
          const providerStatus: AIProviderStatus = {
            providerId,
            type,
            available: false,
            lastChecked: Date.now(),
            error: _("options.aiConfig.card.errors.localNotEnabled")
          }
          
          await saveProviderStatus(providerStatus)
          await loadStatus()
          return
        }
        
        // 已启用，创建 Ollama provider 实例测试
        const provider = new OllamaProvider({
          endpoint: config.local.endpoint || 'http://localhost:11434/v1',
          model: config.local.model || 'qwen2.5:7b',
          apiKey: ''
        })
        
        // 测试连接
        const result = await provider.testConnection()
        
        // 保存状态
        const providerStatus: AIProviderStatus = {
          providerId,
          type,
          available: result.success,
          lastChecked: Date.now(),
          latency: result.latency,
          error: result.success ? undefined : result.message
        }
        
        await saveProviderStatus(providerStatus)
        await loadStatus()
      }
    } catch (err) {
      console.error(`[useAIProviderStatus] 检测 ${providerId} 失败:`, err)
      
      // 保存错误状态
      const providerStatus: AIProviderStatus = {
        providerId,
        type,
        available: false,
        lastChecked: Date.now(),
        error: err instanceof Error ? err.message : _("options.aiConfig.card.errors.checkFailed")
      }
      
      await saveProviderStatus(providerStatus)
      await loadStatus()
      
      setError(err instanceof Error ? err.message : "检测失败")
    } finally {
      setLoading(false)
    }
  }

  /**
   * 检测所有已启用的 Provider
   * Phase 9.2: 使用新的 providers 结构，逐个检测
   */
  const checkAllProviders = async (): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      // 获取配置
      const config = await getAIConfig()
      
      // 定义所有可能的 Provider
      const allProviders = [
        { id: 'deepseek', type: 'remote' as const },
        { id: 'openai', type: 'remote' as const },
        { id: 'ollama', type: 'local' as const }
      ]

      // 逐个检测每个 Provider
      for (const provider of allProviders) {
        try {
          let providerStatus: AIProviderStatus
          
          // 检查配置状态
          if (provider.type === 'remote') {
            // Phase 9.2: 使用新的 providers 结构
            const providerConfig = config.providers?.[provider.id as keyof typeof config.providers]
            
            if (!providerConfig || !providerConfig.apiKey) {
              // 未配置 API Key
              providerStatus = {
                providerId: provider.id,
                type: provider.type,
                available: false,
                lastChecked: Date.now(),
                error: _("options.aiConfig.card.errors.notConfigured")
              }
            } else {
              // 已配置，直接创建 provider 实例测试
              let providerInstance
              const { apiKey, model, enableReasoning = false } = providerConfig
              
              // 清理 API Key 中的非 ASCII 字符
              const cleanApiKey = apiKey.replace(/[^\x20-\x7E]/g, '').trim()
              
              if (provider.id === 'deepseek') {
                providerInstance = new DeepSeekProvider({ apiKey: cleanApiKey, model })
              } else if (provider.id === 'openai') {
                providerInstance = new OpenAIProvider({ apiKey: cleanApiKey, model })
              } else {
                throw new Error(`不支持的提供商: ${provider.id}`)
              }
              
              // 测试连接
              const result = await (providerInstance as any).testConnection(false)
              providerStatus = {
                providerId: provider.id,
                type: provider.type,
                available: result.success,
                lastChecked: Date.now(),
                latency: result.latency,
                error: result.success ? undefined : result.message
              }
            }
          } else {
            // 本地 Provider
            if (!config.local?.enabled) {
              providerStatus = {
                providerId: provider.id,
                type: provider.type,
                available: false,
                lastChecked: Date.now(),
                error: _("options.aiConfig.card.errors.localNotEnabled")
              }
            } else {
              // 已启用，创建 Ollama provider 实例测试
              const providerInstance = new OllamaProvider({
                endpoint: config.local.endpoint || 'http://localhost:11434/v1',
                model: config.local.model || 'qwen2.5:7b',
                apiKey: ''
              })
              
              // 测试连接
              const result = await providerInstance.testConnection()
              providerStatus = {
                providerId: provider.id,
                type: provider.type,
                available: result.success,
                lastChecked: Date.now(),
                latency: result.latency,
                error: result.success ? undefined : result.message
              }
            }
          }
          
          // 保存状态
          await saveProviderStatus(providerStatus)
        } catch (err) {
          console.error(`[useAIProviderStatus] 检测 ${provider.id} 失败:`, err)
          
          // 保存错误状态
          const providerStatus: AIProviderStatus = {
            providerId: provider.id,
            type: provider.type,
            available: false,
            lastChecked: Date.now(),
            error: err instanceof Error ? err.message : _("options.aiConfig.card.errors.checkFailed")
          }
          
          await saveProviderStatus(providerStatus)
        }
      }
      
      // 刷新状态
      await loadStatus()
    } catch (err) {
      console.error("[useAIProviderStatus] 检测所有 Provider 失败:", err)
      setError(err instanceof Error ? err.message : "检测失败")
    } finally {
      setLoading(false)
    }
  }

  /**
   * 初始化：加载缓存状态
   */
  useEffect(() => {
    loadStatus()
  }, [])

  return {
    status,
    loading,
    error,
    checkProvider,
    checkAllProviders,
    refresh: loadStatus
  }
}
