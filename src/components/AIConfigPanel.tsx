import { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import { AIProviderCard } from "./AIProviderCard"
import { useAIProviderStatus } from "@/hooks/useAIProviderStatus"
import { getAIConfig, saveAIConfig, AVAILABLE_MODELS, getProviderFromModel } from "@/storage/ai-config"
import type { AIConfig } from "@/storage/ai-config"
import { useI18n } from "@/i18n/helpers"

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

  // Provider 列表配置
  const providers = [
    { id: 'deepseek', name: 'DeepSeek', type: 'remote' as const, supportsReasoning: true },
    { id: 'openai', name: 'OpenAI', type: 'remote' as const, supportsReasoning: false },
    { id: 'ollama', name: 'Ollama', type: 'local' as const, supportsReasoning: false }
  ]

  /**
   * 加载当前使用的 Provider
   */
  useEffect(() => {
    const loadCurrentProvider = async () => {
      const config = await getAIConfig()
      
      // 从当前选择的模型推导 Provider
      if (config.model) {
        const provider = getProviderFromModel(config.model)
        setCurrentProvider(provider)
      } else if (config.local?.enabled) {
        // 如果启用了本地 AI，标记为 ollama
        setCurrentProvider('ollama')
      } else {
        setCurrentProvider(null)
      }
    }

    loadCurrentProvider()
  }, [status]) // 状态变化时重新加载

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
    <div className="space-y-4">
      {/* 标题和全局操作 */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {_("options.aiConfig.providerPanel.title")}
        </h2>
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
        {providers.map((provider) => (
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
          />
        ))}
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
      } else if (providerId === 'ollama') {
        setOllamaEndpoint(currentConfig.local?.endpoint || 'http://localhost:11434/v1')
        setOllamaModel(currentConfig.local?.model || 'qwen2.5:7b')
        setOllamaEnabled(currentConfig.local?.enabled || false)
        // 恢复缓存的模型列表
        if (currentConfig.local?.cachedModels && currentConfig.local.cachedModels.length > 0) {
          setOllamaModels(currentConfig.local.cachedModels)
        }
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
      let provider
      
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
              enableReasoning: enableReasoning
            }
          },
          // 兼容：同时更新旧结构
          apiKeys: {
            ...config!.apiKeys,
            [providerId]: apiKey
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
        message: error instanceof Error ? error.message : '测试失败' 
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
      const tempConfig: AIConfig = {
        ...config!,
        local: {
          ...config!.local,
          enabled: true,
          provider: 'ollama',
          endpoint: ollamaEndpoint,
          model: ollamaModel
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
          const modelsUrl = ollamaEndpoint.replace(/\/v1\/?$/, '') + '/api/tags'
          const response = await fetch(modelsUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          })

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }

          const data = await response.json()
          const models = (data.models || []).map((m: any) => ({
            id: m.name,
            label: `${m.name} (${(m.size / 1e9).toFixed(1)}GB)`
          }))

          setOllamaModels(models)
          
          // 尝试恢复之前选择的模型
          // 如果之前选择的模型在新列表中，保持选中；否则选择第一个模型
          const previousModel = ollamaModel
          if (models.length > 0) {
            const modelExists = models.some((m: { id: string; label: string }) => m.id === previousModel)
            if (!modelExists) {
              setOllamaModel(models[0].id)
            }
          }
          
          setTestResult({ 
            success: true, 
            message: _("options.aiConfig.configModal.testResult.modelsLoaded", { count: models.length }) 
          })
          
          // Phase 9.2 修复: 测试成功后立即保存配置和状态
          // 1. 保存配置到 storage
          const newConfig: AIConfig = {
            ...config!,
            local: {
              ...config!.local,
              enabled: true,
              provider: 'ollama',
              endpoint: ollamaEndpoint,
              model: ollamaModel || (models.length > 0 ? models[0].id : ''),
              cachedModels: models
            } as any
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
        message: error instanceof Error ? error.message : '测试失败' 
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
                <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <input
                    type="checkbox"
                    id="enableReasoning"
                    checked={enableReasoning}
                    onChange={(e) => setEnableReasoning(e.target.checked)}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="enableReasoning" className="text-sm text-gray-700 dark:text-gray-300">
                    {_("options.aiConfig.configModal.enableReasoning")}
                  </label>
                </div>
              )}

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
