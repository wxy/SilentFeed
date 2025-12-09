import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { AIProviderCard } from "./AIProviderCard"
import { useAIProviderStatus } from "@/hooks/useAIProviderStatus"
import { getAIConfig, saveAIConfig, AVAILABLE_MODELS, getProviderFromModel } from "@/storage/ai-config"
import type { AIConfig } from "@/storage/ai-config"
import { useI18n } from "@/i18n/helpers"
import { getCurrentMonthUsage } from "@/utils/budget-utils"

/**
 * AI Provider 配置面板
 * 
 * 显示所有 AI Provider 的状态卡片，支持：
 * - 查看状态
 * - 检测可用性
 * - 快捷配置
 */
export function AIConfigPanel() {
  const { _ } = useI18n()
  const { status, loading, checkProvider, checkAllProviders, refresh } = useAIProviderStatus()
  const [checkingProvider, setCheckingProvider] = useState<string | null>(null)
  const [showConfigModal, setShowConfigModal] = useState<string | null>(null)
  const [currentProvider, setCurrentProvider] = useState<string | null>(null)
  const [configVersion, setConfigVersion] = useState(0) // 用于强制刷新
  const [ollamaSupportsReasoning, setOllamaSupportsReasoning] = useState(false) // Phase 11.2: Ollama 推理能力状态
  const [preferredRemoteProvider, setPreferredRemoteProvider] = useState<"deepseek" | "openai">("deepseek") // Phase 12: 首选远程 AI
  const [preferredLocalProvider, setPreferredLocalProvider] = useState<"ollama">("ollama") // Phase 12: 首选本地 AI
  
  // Phase 12.4: 预算数据
  const [providerBudgets, setProviderBudgets] = useState<{ openai?: number; deepseek?: number }>({})
  const [monthlyUsage, setMonthlyUsage] = useState<{
    openai: { amount: number; currency: 'USD' | 'CNY' }
    deepseek: { amount: number; currency: 'USD' | 'CNY' }
  }>({
    openai: { amount: 0, currency: 'USD' },
    deepseek: { amount: 0, currency: 'CNY' }
  })

  // Provider 列表配置
  const providers = [
    { id: 'deepseek', name: 'DeepSeek', type: 'remote' as const, supportsReasoning: true },
    { id: 'openai', name: 'OpenAI', type: 'remote' as const, supportsReasoning: false },
    { id: 'ollama', name: 'Ollama', type: 'local' as const, supportsReasoning: ollamaSupportsReasoning } // 动态读取
  ]

  /**
   * 加载当前使用的 Provider 和预算配置
   */
  useEffect(() => {
    const loadCurrentProvider = async () => {
      const config = await getAIConfig()
      
      // Phase 11.2: 读取 Ollama 推理能力状态
      setOllamaSupportsReasoning(config.local?.isReasoningModel || false)
      
      // Phase 12: 读取首选 Provider 配置
      setPreferredRemoteProvider(config.preferredRemoteProvider || "deepseek")
      setPreferredLocalProvider(config.preferredLocalProvider || "ollama")
      
      // Phase 12.4: 读取预算配置
      setProviderBudgets(config.providerBudgets || {})
      
      // Phase 12.4: 读取当前月消费
      const openaiUsage = await getCurrentMonthUsage('openai')
      const deepseekUsage = await getCurrentMonthUsage('deepseek')
      setMonthlyUsage({
        openai: openaiUsage,
        deepseek: deepseekUsage
      })
      
      // Phase 11: 从 engineAssignment 确定实际在用的 Provider
      // 优先级：profileGeneration（低频但重要）> feedAnalysis > pageAnalysis
      let activeProvider: string | null = null
      
      if (config.engineAssignment) {
        // 优先看 profileGeneration（用户画像生成最重要）
        const profileProvider = config.engineAssignment.profileGeneration?.provider
        if (profileProvider && profileProvider !== 'ollama') {
          activeProvider = profileProvider
        } else if (config.engineAssignment.feedAnalysis?.provider && 
                   config.engineAssignment.feedAnalysis.provider !== 'ollama') {
          // 其次看 feedAnalysis
          activeProvider = config.engineAssignment.feedAnalysis.provider
        } else if (config.engineAssignment.pageAnalysis?.provider && 
                   config.engineAssignment.pageAnalysis.provider !== 'ollama') {
          // 最后看 pageAnalysis
          activeProvider = config.engineAssignment.pageAnalysis.provider
        } else if (profileProvider === 'ollama' || 
                   config.engineAssignment.feedAnalysis?.provider === 'ollama' ||
                   config.engineAssignment.pageAnalysis?.provider === 'ollama') {
          // 如果任何任务使用 ollama，标记为 ollama
          activeProvider = 'ollama'
        }
      }
      
      // 降级处理：如果没有 engineAssignment，从旧字段推导
      if (!activeProvider) {
        // 从当前选择的模型推导 Provider
        if (config.model) {
          const provider = getProviderFromModel(config.model)
          activeProvider = provider
        } else if (config.local?.enabled) {
          // 如果启用了本地 AI，标记为 ollama
          activeProvider = 'ollama'
        }
      }
      
      setCurrentProvider(activeProvider)
    }

    loadCurrentProvider()
  }, [status, configVersion]) // 状态变化或配置版本变化时重新加载
  
  // 监听 storage 变化，实时更新"在用"状态
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'sync' && changes.aiConfig) {
        // AI 配置变化，强制刷新
        setConfigVersion(v => v + 1)
      }
    }
    
    chrome.storage.onChanged.addListener(handleStorageChange)
    
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  /**
   * 检测单个 Provider
   */
  const handleCheckProvider = async (providerId: string, type: 'remote' | 'local') => {
    setCheckingProvider(providerId)
    try {
      await checkProvider(providerId, type)
    } finally {
      setCheckingProvider(null)
    }
  }

  /**
   * 打开配置弹窗
   */
  const handleConfigure = (providerId: string) => {
    setShowConfigModal(providerId)
  }

  /**
   * 检测所有 Provider
   */
  const handleCheckAll = async () => {
    await checkAllProviders()
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg">
      {/* 标题和全局操作 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          🤖 {_("options.aiConfig.providerPanel.title")}
        </h3>
        <button
          onClick={handleCheckAll}
          disabled={loading}
          className={`
            px-4 py-2 rounded-lg font-medium transition-colors
            ${loading
              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
            }
          `}
        >
          {loading ? _("options.aiConfig.providerPanel.checking") : _("options.aiConfig.providerPanel.checkAll")}
        </button>
      </div>

      {/* Provider 卡片列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {providers.map((provider) => {
          // Phase 12.4: 准备预算数据（仅对远程 AI）
          const budgetProps = provider.type === 'remote' && (provider.id === 'openai' || provider.id === 'deepseek')
            ? {
                monthlyBudget: providerBudgets[provider.id as 'openai' | 'deepseek'],
                currentSpent: monthlyUsage[provider.id as 'openai' | 'deepseek']?.amount || 0,
                currency: monthlyUsage[provider.id as 'openai' | 'deepseek']?.currency
              }
            : {}
          
          return (
            <AIProviderCard
              key={provider.id}
              providerId={provider.id}
              providerName={provider.name}
              status={status[provider.id] || null}
              onCheck={() => handleCheckProvider(provider.id, provider.type)}
              onConfigure={() => handleConfigure(provider.id)}
              checking={checkingProvider === provider.id}
              isActive={currentProvider === provider.id}
              supportsReasoning={provider.supportsReasoning}
              isPreferred={
                provider.type === 'remote' 
                  ? preferredRemoteProvider === provider.id 
                  : preferredLocalProvider === provider.id
              }
              {...budgetProps}
            />
          )
        })}
      </div>

      {/* 配置弹窗 */}
      {showConfigModal && createPortal(
        <ConfigModal
          providerId={showConfigModal}
          onClose={() => {
            setShowConfigModal(null)
            refresh()
          }}
        />, document.body
      )}
    </div>
  )
}

/**
 * 配置弹窗组件
 */
function ConfigModal({ 
  providerId, 
  onClose 
}: { 
  providerId: string; 
  onClose: () => void 
}) {
  const { _ } = useI18n()
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [config, setConfig] = useState<AIConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [enableReasoning, setEnableReasoning] = useState(false)
  
  // Phase 12: 设为首选状态
  const [isPreferred, setIsPreferred] = useState(false)
  
  // Phase 12.4: 预算配置
  const [monthlyBudget, setMonthlyBudget] = useState<number | undefined>(undefined)
  
  // Phase 12.6: 超时配置
  const [timeoutMs, setTimeoutMs] = useState<number | undefined>(undefined)
  const [reasoningTimeoutMs, setReasoningTimeoutMs] = useState<number | undefined>(undefined)
  
  // Ollama 特有配置
  const [ollamaEndpoint, setOllamaEndpoint] = useState('http://localhost:11434/v1')
  const [ollamaModel, setOllamaModel] = useState('qwen2.5:7b')
  const [ollamaEnabled, setOllamaEnabled] = useState(false)
  const [ollamaModels, setOllamaModels] = useState<Array<{ id: string; label: string }>>([])
  const [loadingModels, setLoadingModels] = useState(false)

  // 加载当前配置
  useEffect(() => {
    const loadConfig = async () => {
      const currentConfig = await getAIConfig()
      setConfig(currentConfig)

      if (providerId === 'deepseek' || providerId === 'openai') {
        // Phase 9.2: 从 providers 结构中读取配置
        const providerConfig = currentConfig.providers?.[providerId]
        setApiKey(providerConfig?.apiKey || '')
        
        // 如果已选择该 Provider 的模型，设置为当前模型
        const models = AVAILABLE_MODELS[providerId as keyof typeof AVAILABLE_MODELS]
        if (providerConfig?.model && models.some(m => m.id === providerConfig.model)) {
          setSelectedModel(providerConfig.model)
        }
        
        setEnableReasoning(providerConfig?.enableReasoning || false)
        
        // Phase 12: 读取首选远程 AI 状态
        setIsPreferred(currentConfig.preferredRemoteProvider === providerId)
        
        // Phase 12.4: 读取预算配置
        const budgetValue = currentConfig.providerBudgets?.[providerId as 'openai' | 'deepseek']
        setMonthlyBudget(budgetValue)
        
        // Phase 12.6: 读取超时配置
        setTimeoutMs(providerConfig?.timeoutMs)
        setReasoningTimeoutMs(providerConfig?.reasoningTimeoutMs)
      } else if (providerId === 'ollama') {
        setOllamaEndpoint(currentConfig.local?.endpoint || 'http://localhost:11434/v1')
        setOllamaModel(currentConfig.local?.model || 'qwen2.5:7b')
        setOllamaEnabled(currentConfig.local?.enabled || false)
        // 恢复缓存的模型列表
        if (currentConfig.local?.cachedModels && currentConfig.local.cachedModels.length > 0) {
          setOllamaModels(currentConfig.local.cachedModels)
        }
        
        // Phase 12: 读取首选本地 AI 状态（目前只有 ollama）
        setIsPreferred(currentConfig.preferredLocalProvider === 'ollama')
        
        // Phase 12.6: 读取超时配置
        setTimeoutMs(currentConfig.local?.timeoutMs)
        setReasoningTimeoutMs(currentConfig.local?.reasoningTimeoutMs)
      }
    }

    loadConfig()
  }, [providerId])

  const handleSave = async () => {
    if (!config) return

    // Phase 9.1: 检查是否已测试成功
    if (!testResult?.success) {
      setTestResult({ 
        success: false, 
        message: _('options.aiConfig.configModal.testResult.pleaseTestFirst') 
      })
      return
    }

    setSaving(true)
    try {
      // Phase 9.1: 测试成功时已保存配置，这里只需关闭弹窗
      // refresh() 会重新加载最新状态
      onClose()
    } finally {
      setSaving(false)
    }
  }

  // 获取可用模型列表
  const getAvailableModels = () => {
    if (providerId === 'deepseek' || providerId === 'openai') {
      return AVAILABLE_MODELS[providerId as keyof typeof AVAILABLE_MODELS] || []
    }
    return []
  }

  // 检查当前选择的模型是否支持推理
  const currentModelSupportsReasoning = () => {
    if (!selectedModel) return false
    const models = getAvailableModels()
    const model = models.find(m => m.id === selectedModel)
    return model?.supportsReasoning || false
  }

  /**
   * 测试远程 AI 连接
   * Phase 9.1: 直接创建 provider 实例测试，不依赖 AICapabilityManager
   */
  const handleTestRemoteConnection = async () => {
    if (!apiKey || !selectedModel) {
      setTestResult({ success: false, message: _("options.aiConfig.configModal.testResult.missingConfig") })
      return
    }

    setTesting(true)
    setTestResult(null)

    try {
      // Phase 9.1: 直接创建 provider 实例进行测试
      // 避免依赖 AICapabilityManager.initialize() 可能的延迟问题
      let provider: { testConnection: (enableReasoning: boolean) => Promise<{ success: boolean; message?: string; latency?: number }> }
      
      if (providerId === 'deepseek') {
        const { DeepSeekProvider } = await import('@/core/ai/providers/DeepSeekProvider')
        provider = new DeepSeekProvider({ 
          apiKey,
          model: selectedModel
        })
      } else if (providerId === 'openai') {
        const { OpenAIProvider } = await import('@/core/ai/providers/OpenAIProvider')
        provider = new OpenAIProvider({ 
          apiKey,
          model: selectedModel
        })
      } else {
        throw new Error(`不支持的提供商: ${providerId}`)
      }
      
      // 测试连接
      const result = await provider.testConnection(enableReasoning)
      
      if (result.success) {
        // 显示成功消息
        const message = enableReasoning 
          ? _("options.aiConfig.configModal.testResult.successWithReasoning", { latency: result.latency })
          : _("options.aiConfig.configModal.testResult.success", { latency: result.latency })
        
        setTestResult({ 
          success: true, 
          message 
        })
        
        // Phase 9.2 修复: 使用新的 providers 结构保存配置
        const newConfig: AIConfig = {
          ...config!,
          providers: {
            ...config!.providers,
            [providerId]: {
              apiKey: apiKey,
              model: selectedModel,
              enableReasoning: enableReasoning,
              // Phase 12.6: 保存超时配置
              timeoutMs: timeoutMs,
              reasoningTimeoutMs: reasoningTimeoutMs
            }
          },
          // 兼容：同时更新旧结构
          apiKeys: {
            ...config!.apiKeys,
            [providerId]: apiKey
          },
          // Phase 12: 更新首选远程 AI（勾选时设置，取消勾选不变）
          preferredRemoteProvider: isPreferred 
            ? (providerId as "deepseek" | "openai") 
            : config!.preferredRemoteProvider,
          // Phase 12.4: 更新预算配置
          providerBudgets: {
            ...config!.providerBudgets,
            [providerId]: monthlyBudget  // 允许 undefined（表示删除预算）
          }
          // 注意：不要覆盖全局的 model/provider/enableReasoning
          // 这些字段应该由引擎分配机制管理
        }
        await saveAIConfig(newConfig)
        
        // 2. 更新本地 state，确保 useEffect 能读取到最新配置
        setConfig(newConfig)
        
        // 3. 保存状态到缓存
        const { saveProviderStatus } = await import('@/storage/ai-provider-status')
        await saveProviderStatus({
          providerId,
          type: 'remote',
          available: true,
          lastChecked: Date.now(),
          latency: result.latency
        })
      } else {
        setTestResult({ 
          success: false, 
          message: _("options.aiConfig.configModal.testResult.error", { message: result.message || _("options.aiConfig.configModal.testResult.connectionFailed") }) 
        })
      }
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: error instanceof Error ? error.message : _('options.aiConfig.configModal.testResult.unknownError') 
      })
    } finally {
      setTesting(false)
    }
  }

  /**
   * 测试 Ollama 连接并加载模型列表
   */
  const handleTestOllamaConnection = async () => {
    if (!ollamaEndpoint) {
      setTestResult({ success: false, message: _("options.aiConfig.configModal.testResult.missingEndpoint") })
      return
    }

    setTesting(true)
    setLoadingModels(true)
    setTestResult(null)

    try {
      // 临时保存配置用于测试
      // Phase 11.1 修复: 确保 apiKey 始终为 "ollama"，避免 403 错误
      const tempConfig: AIConfig = {
        ...config!,
        local: {
          ...config!.local,
          enabled: true,
          provider: 'ollama',
          endpoint: ollamaEndpoint,
          model: ollamaModel,
          apiKey: 'ollama' // 强制设置为 "ollama"
        } as any
      }

      await saveAIConfig(tempConfig)

      // 测试连接
      const { AICapabilityManager } = await import('@/core/ai/AICapabilityManager')
      const manager = new AICapabilityManager()
      await manager.initialize()
      
      const result = await manager.testConnection('local')

      if (result.success) {
        // 加载模型列表
        try {
          // Phase 11.2: 使用 /api/tags 获取模型列表（Ollama 官方 API）
          // 参考: https://docs.ollama.com/api/tags
          const baseUrl = ollamaEndpoint.replace(/\/v1\/?$/, '')
          const tagsUrl = `${baseUrl}/api/tags`
          
          const response = await fetch(tagsUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const data = await response.json()
          
          // /api/tags 返回格式: { models: [ { name, size, ... } ] }
          if (!data.models || !Array.isArray(data.models)) {
            throw new Error('API 返回格式错误: 缺少 models 字段')
          }
          
          // Phase 11.2: 对每个模型调用 /api/show 获取 capabilities
          const modelsWithDetails = await Promise.all(
            data.models.map(async (m: any) => {
              try {
                // 调用 /api/show 获取模型详情
                const showResponse = await fetch(`${baseUrl}/api/show`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: m.name })
                })
                
                if (showResponse.ok) {
                  const details = await showResponse.json()
                  // Phase 11.2: 通过 Ollama API 的 capabilities 检测推理能力（官方标准字段）
                  // 参考: https://github.com/ollama/ollama/blob/main/docs/api.md#show-model-information
                  const capabilities = details.capabilities || []
                  const isReasoning = capabilities.includes('thinking')
                  
                  return {
                    id: m.name,
                    label: `${m.name} (${(m.size / 1e9).toFixed(1)}GB)${isReasoning ? ' 🔬' : ''}`,
                    isReasoning
                  }
                }
              } catch (error) {
                console.warn(`获取模型 ${m.name} 详情失败:`, error)
              }
              
              // Phase 11.2: API 失败时，无法判断是否支持推理，标记为 false
              return {
                id: m.name,
                label: `${m.name} (${(m.size / 1e9).toFixed(1)}GB)`,
                isReasoning: false
              }
            })
          )

          setOllamaModels(modelsWithDetails)
          
          // 尝试恢复之前选择的模型
          // 如果之前选择的模型在新列表中，保持选中；否则选择第一个模型
          const previousModel = ollamaModel
          if (modelsWithDetails.length > 0) {
            const modelExists = modelsWithDetails.some((m: any) => m.id === previousModel)
            if (!modelExists) {
              setOllamaModel(modelsWithDetails[0].id)
            }
          }
          
          setTestResult({ 
            success: true, 
            message: _("options.aiConfig.configModal.testResult.modelsLoaded", { count: modelsWithDetails.length }) 
          })
          
          // Phase 9.2 修复: 测试成功后立即保存配置和状态
          // Phase 11.1 修复: 确保 apiKey 始终为 "ollama"
          // Phase 11.2: 保存推理模型信息
          // 1. 保存配置到 storage
          const selectedModelId = ollamaModel || (modelsWithDetails.length > 0 ? modelsWithDetails[0].id : '')
          const selectedModel = modelsWithDetails.find((m: any) => m.id === selectedModelId)
          
          const newConfig: AIConfig = {
            ...config!,
            local: {
              ...config!.local,
              enabled: true,
              provider: 'ollama',
              endpoint: ollamaEndpoint,
              model: selectedModelId,
              apiKey: 'ollama', // 强制设置为 "ollama"
              cachedModels: modelsWithDetails,
              isReasoningModel: selectedModel?.isReasoning || false, // 标记是否为推理模型
              // Phase 12.6: 保存超时配置
              timeoutMs: timeoutMs,
              reasoningTimeoutMs: reasoningTimeoutMs
            } as any,
            // Phase 12: 更新首选本地 AI（勾选时设置为 ollama，取消勾选不变）
            preferredLocalProvider: isPreferred ? 'ollama' : config!.preferredLocalProvider
          }
          await saveAIConfig(newConfig)
          
          // 2. 更新本地 state，确保 useEffect 能读取到最新配置
          setConfig(newConfig)
          
          // 3. 保存状态到缓存
          const { saveProviderStatus } = await import('@/storage/ai-provider-status')
          await saveProviderStatus({
            providerId: 'ollama',
            type: 'local',
            available: true,
            lastChecked: Date.now(),
            latency: result.latency
          })
        } catch (modelError) {
          setTestResult({ 
            success: true, 
            message: _("options.aiConfig.configModal.testResult.modelsLoadFailed", { error: modelError instanceof Error ? modelError.message : _("options.aiConfig.configModal.testResult.unknownError") }) 
          })
          
          // 即使加载模型失败，连接仍然成功，保存状态
          const { saveProviderStatus } = await import('@/storage/ai-provider-status')
          await saveProviderStatus({
            providerId: 'ollama',
            type: 'local',
            available: true,
            lastChecked: Date.now(),
            latency: result.latency
          })
        }
      } else {
        setTestResult({ 
          success: false, 
          message: result.message || _("options.aiConfig.configModal.testResult.connectionFailed") 
        })
      }
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: error instanceof Error ? error.message : _('options.aiConfig.configModal.testResult.unknownError') 
      })
    } finally {
      setTesting(false)
      setLoadingModels(false)
    }
  }

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {_("options.aiConfig.configModal.title", { provider: providerId === 'deepseek' ? 'DeepSeek' : providerId === 'openai' ? 'OpenAI' : 'Ollama' })}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 mb-6">
          {/* DeepSeek / OpenAI 配置 */}
          {(providerId === 'deepseek' || providerId === 'openai') && (
            <>
              {/* API Key */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {_("options.aiConfig.configModal.apiKey")}
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={_("options.aiConfig.configModal.apiKeyPlaceholder", { provider: providerId === 'deepseek' ? 'DeepSeek' : 'OpenAI' })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 模型选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {_("options.aiConfig.configModal.selectModel")}
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">{_("options.aiConfig.configModal.selectModelPlaceholder")}</option>
                  {getAvailableModels().map((model) => (
                    <option key={model.id} value={model.id}>
                      {_((`options.aiConfig.models.${model.id}.name` as any))} - {_((`options.aiConfig.models.${model.id}.description` as any))}
                    </option>
                  ))}
                </select>
              </div>

              {/* 推理能力开关（仅当模型支持时） */}
              {currentModelSupportsReasoning() && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <input
                      type="checkbox"
                      id="enableReasoning"
                      checked={enableReasoning}
                      onChange={(e) => setEnableReasoning(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <label htmlFor="enableReasoning" className="flex-1 text-sm text-gray-700 dark:text-gray-300">
                      {_("options.aiConfig.configModal.enableReasoning")} 🔬
                    </label>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 px-3">
                    {enableReasoning 
                      ? _("options.aiConfig.configModal.reasoningEnabled") 
                      : _("options.aiConfig.configModal.reasoningDisabled")
                    }
                  </p>
                </div>
              )}

              {/* Phase 12: 设为首选远程 AI */}
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                  <input
                    type="checkbox"
                    id="setPreferredRemote"
                    checked={isPreferred}
                    onChange={(e) => setIsPreferred(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="setPreferredRemote" className="flex-1 text-sm font-medium text-blue-900 dark:text-blue-100">
                    ⭐ {_("options.aiConfig.configModal.setPreferredRemote")}
                  </label>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 px-3">
                  {_("options.aiConfig.configModal.preferredRemoteHint")}
                </p>
              </div>

              {/* Phase 12.6: 高级设置（预算 + 超时）- 折叠面板 */}
              <details className="group">
                <summary className="flex items-center justify-between cursor-pointer p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">⚙️ {_("options.aiConfig.card.advancedSettings")}</span>
                  <svg className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                
                <div className="mt-2 space-y-4 p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg border border-gray-100 dark:border-gray-700/50">
                  {/* 月度预算 */}
                  <div className="space-y-2">
                    <label htmlFor="monthlyBudget" className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                      💰 {_("options.aiConfig.configModal.monthlyBudget")}
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {providerId === 'openai' ? '$' : '¥'}
                      </span>
                      <input
                        type="number"
                        id="monthlyBudget"
                        value={monthlyBudget ?? ''}
                        onChange={(e) => {
                          const value = e.target.value
                          setMonthlyBudget(value === '' ? undefined : parseFloat(value))
                        }}
                        placeholder={_("options.aiConfig.configModal.budgetPlaceholder")}
                        min="0"
                        step="0.01"
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        / {_("options.aiConfig.configModal.perMonth")}
                      </span>
                    </div>
                  </div>

                  {/* 超时配置 */}
                  <div className="space-y-2">
                    <span className="block text-xs font-medium text-gray-600 dark:text-gray-400">
                      ⏱️ {_("options.aiConfig.card.timeout.description")}
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="timeoutMs" className="block text-xs text-gray-500 dark:text-gray-500 mb-1">
                          {_("options.aiConfig.card.timeout.standard")}
                        </label>
                        <select
                          id="timeoutMs"
                          value={timeoutMs ?? 60000}
                          onChange={(e) => setTimeoutMs(parseInt(e.target.value))}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="30000">{_("options.aiConfig.card.timeout.seconds", { value: 30 })}</option>
                          <option value="60000">{_("options.aiConfig.card.timeout.seconds", { value: 60 })}</option>
                          <option value="90000">{_("options.aiConfig.card.timeout.seconds", { value: 90 })}</option>
                          <option value="120000">{_("options.aiConfig.card.timeout.seconds", { value: 120 })}</option>
                          <option value="180000">{_("options.aiConfig.card.timeout.seconds", { value: 180 })}</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="reasoningTimeoutMs" className="block text-xs text-gray-500 dark:text-gray-500 mb-1">
                          {_("options.aiConfig.card.timeout.reasoning")}
                        </label>
                        <select
                          id="reasoningTimeoutMs"
                          value={reasoningTimeoutMs ?? 120000}
                          onChange={(e) => setReasoningTimeoutMs(parseInt(e.target.value))}
                          className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="60000">{_("options.aiConfig.card.timeout.seconds", { value: 60 })}</option>
                          <option value="120000">{_("options.aiConfig.card.timeout.seconds", { value: 120 })}</option>
                          <option value="180000">{_("options.aiConfig.card.timeout.seconds", { value: 180 })}</option>
                          <option value="240000">{_("options.aiConfig.card.timeout.seconds", { value: 240 })}</option>
                          <option value="300000">{_("options.aiConfig.card.timeout.seconds", { value: 300 })}</option>
                        </select>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {_("options.aiConfig.card.timeout.hint")}
                    </p>
                  </div>
                </div>
              </details>

              {/* 测试连接按钮 */}
              <button
                onClick={handleTestRemoteConnection}
                disabled={!apiKey || !selectedModel || testing}
                className={`
                  w-full px-4 py-2 rounded-lg font-medium transition-colors
                  ${testing
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : testResult?.success
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed'
                  }
                `}
              >
                {testing ? _("options.aiConfig.configModal.testing") : testResult?.success ? _("options.aiConfig.configModal.testSuccess") : _("options.aiConfig.configModal.testConnection")}
              </button>
            </>
          )}

          {/* Ollama 配置 */}
          {providerId === 'ollama' && (
            <>
              {/* 端点配置 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {_("options.aiConfig.configModal.ollamaEndpoint")}
                </label>
                <input
                  type="text"
                  value={ollamaEndpoint}
                  onChange={(e) => setOllamaEndpoint(e.target.value)}
                  placeholder="http://localhost:11434/v1"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {_("options.aiConfig.configModal.ollamaEndpointHint")}
                </p>
              </div>

              {/* 测试连接并加载模型 */}
              <button
                onClick={handleTestOllamaConnection}
                disabled={!ollamaEndpoint.trim() || testing}
                className={`
                  w-full px-4 py-2 rounded-lg font-medium transition-colors
                  ${testing
                    ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                    : testResult?.success
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed'
                  }
                `}
              >
                {testing ? (loadingModels ? _("options.aiConfig.configModal.loadingModels") : _("options.aiConfig.configModal.testing")) : testResult?.success ? _("options.aiConfig.configModal.testSuccess") : _("options.aiConfig.configModal.testConnectionAndLoadModels")}
              </button>

              {/* 模型名称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {_("options.aiConfig.configModal.modelName")}
                </label>
                <select
                  value={ollamaModel}
                  onChange={(e) => setOllamaModel(e.target.value)}
                  disabled={ollamaModels.length === 0}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {ollamaModels.length === 0 ? (
                    <option value="">{_("options.aiConfig.configModal.loadModelsHint")}</option>
                  ) : (
                    ollamaModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.label}
                      </option>
                    ))
                  )}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {ollamaModels.length > 0 
                    ? _("options.aiConfig.configModal.testResult.modelsLoaded", { count: ollamaModels.length }) 
                    : _("options.aiConfig.configModal.loadModelsHint")
                  }
                </p>
              </div>

              {/* Phase 12.6: 超时配置 - 折叠面板 */}
              <details className="group">
                <summary className="flex items-center justify-between cursor-pointer p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700/50 transition-colors">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">⏱️ {_("options.aiConfig.card.timeout.description")}</span>
                  <svg className="w-4 h-4 text-gray-500 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                
                <div className="mt-2 space-y-3 p-3 bg-gray-50/50 dark:bg-gray-800/30 rounded-lg border border-gray-100 dark:border-gray-700/50">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor="local-timeoutMs" className="block text-xs text-gray-500 dark:text-gray-500 mb-1">
                        {_("options.aiConfig.card.timeout.standard")}
                      </label>
                      <select
                        id="local-timeoutMs"
                        value={timeoutMs ?? 60000}
                        onChange={(e) => setTimeoutMs(parseInt(e.target.value))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="30000">{_("options.aiConfig.card.timeout.seconds", { value: 30 })}</option>
                        <option value="45000">{_("options.aiConfig.card.timeout.seconds", { value: 45 })}</option>
                        <option value="60000">{_("options.aiConfig.card.timeout.seconds", { value: 60 })}</option>
                        <option value="90000">{_("options.aiConfig.card.timeout.seconds", { value: 90 })}</option>
                        <option value="120000">{_("options.aiConfig.card.timeout.seconds", { value: 120 })}</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="local-reasoningTimeoutMs" className="block text-xs text-gray-500 dark:text-gray-500 mb-1">
                        {_("options.aiConfig.card.timeout.reasoning")}
                      </label>
                      <select
                        id="local-reasoningTimeoutMs"
                        value={reasoningTimeoutMs ?? 180000}
                        onChange={(e) => setReasoningTimeoutMs(parseInt(e.target.value))}
                        className="w-full px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="120000">{_("options.aiConfig.card.timeout.seconds", { value: 120 })}</option>
                        <option value="180000">{_("options.aiConfig.card.timeout.seconds", { value: 180 })}</option>
                        <option value="240000">{_("options.aiConfig.card.timeout.seconds", { value: 240 })}</option>
                        <option value="300000">{_("options.aiConfig.card.timeout.seconds", { value: 300 })}</option>
                        <option value="600000">{_("options.aiConfig.card.timeout.seconds", { value: 600 })}</option>
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {_("options.aiConfig.card.timeout.localHint")}
                  </p>
                </div>
              </details>

              {/* Phase 12: 设为首选本地 AI */}
              <div className="space-y-2">
                <div className="flex items-center gap-3 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <input
                    type="checkbox"
                    id="setPreferredLocal"
                    checked={isPreferred}
                    onChange={(e) => setIsPreferred(e.target.checked)}
                    className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500"
                  />
                  <label htmlFor="setPreferredLocal" className="flex-1 text-sm font-medium text-purple-900 dark:text-purple-100">
                    ⭐ {_("options.aiConfig.configModal.setPreferredLocal")}
                  </label>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 px-3">
                  {_("options.aiConfig.configModal.preferredLocalHint")}
                </p>
              </div>
            </>
          )}

          {/* 测试结果显示 */}
          {testResult && (
            <div className={`p-3 rounded-lg ${testResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
              <p className="text-sm">
                {testResult.success ? '✓' : '✗'} {testResult.message}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
          >
            {_("options.aiConfig.configModal.close")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`
              px-4 py-2 rounded font-medium transition-colors
              ${saving
                ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 text-white'
              }
            `}
          >
            {saving ? _("options.aiConfig.configModal.saving") : _("options.aiConfig.configModal.save")}
          </button>
        </div>
      </div>
    </div>
  )
}
