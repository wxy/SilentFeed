import { useEffect, useState } from "react"
import type { AIProviderStatus, AIProvidersStatus } from "@/storage/ai-provider-status"
import { getAllProviderStatus, saveProviderStatus } from "@/storage/ai-provider-status"
import { AICapabilityManager } from "@/core/ai/AICapabilityManager"
import { getAIConfig } from "@/storage/ai-config"
import { translate as _ } from "@/i18n/helpers"

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
   */
  const checkProvider = async (providerId: string, type: 'remote' | 'local'): Promise<void> => {
    setLoading(true)
    setError(null)

    try {
      // 1. 先检查是否已配置 API Key
      const config = await getAIConfig()
      
      // 对于远程 Provider，检查 API Key
      if (type === 'remote') {
        const hasApiKey = config.apiKeys[providerId as keyof typeof config.apiKeys]
        
        if (!hasApiKey) {
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
      }
      
      // 对于本地 Provider，检查是否启用
      if (type === 'local') {
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
      }

      // 2. 已配置，进行连接测试
      const manager = new AICapabilityManager()
      await manager.initialize()
      
      // 测试连接
      const result = await manager.testConnection(type)

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

      // 初始化 AI 管理器
      const manager = new AICapabilityManager()
      await manager.initialize()

      // 逐个检测每个 Provider
      for (const provider of allProviders) {
        try {
          let providerStatus: AIProviderStatus
          
          // 检查配置状态
          if (provider.type === 'remote') {
            const hasApiKey = config.apiKeys[provider.id as keyof typeof config.apiKeys]
            
            if (!hasApiKey) {
              // 未配置 API Key
              providerStatus = {
                providerId: provider.id,
                type: provider.type,
                available: false,
                lastChecked: Date.now(),
                error: _("options.aiConfig.card.errors.notConfigured")
              }
            } else {
              // 已配置，测试连接
              const result = await manager.testConnection(provider.type)
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
              // 已启用，测试连接
              const result = await manager.testConnection(provider.type)
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
