import { useI18n } from "@/i18n/helpers"
import { useCallback, useEffect, useState } from "react"
import {
  getAIConfig,
  saveAIConfig,
  validateApiKey,
  type AIProviderType,
  type LocalAIConfig,
  AVAILABLE_MODELS,
  getProviderFromModel
} from "@/storage/ai-config"
import { aiManager } from "@/core/ai/AICapabilityManager"
import { checkLocalAIStatus } from "@/storage/recommendation-config"
import { listLocalModels, type LocalAIEndpointMode, type LocalModelSummary } from "@/utils/local-ai-endpoint"

const DEFAULT_LOCAL_CONFIG: LocalAIConfig = {
  enabled: false,
  provider: "ollama",
  endpoint: "http://localhost:11434/v1",
  model: "",
  temperature: 0.2,
  maxOutputTokens: 768,
  timeoutMs: 45000
}

const createDefaultLocalConfig = (): LocalAIConfig => ({ ...DEFAULT_LOCAL_CONFIG })

// 本地 AI 检测结果
interface LocalAIStatus {
  hasChromeAI: boolean
  hasOllama: boolean
  checking: boolean
  available: boolean
  services: Array<'chrome-ai' | 'ollama'>
}

export function AIConfig() {
  const { _ } = useI18n()
  
  // 状态管理
  const [model, setModel] = useState<string>("")  // 模型选择（主要状态）
  const [apiKeys, setApiKeys] = useState<Record<AIProviderType, string>>({
    openai: "",
    deepseek: ""
  })  // 各提供商的 API Keys
  const [monthlyBudget, setMonthlyBudget] = useState<number>(5) // 默认 $5/月
  const [enableReasoning, setEnableReasoning] = useState(false) // Phase 9: 推理能力
  const [localAIChoice, setLocalAIChoice] = useState<'none' | 'chromeAI' | 'ollama'>('none') // Phase 9: 本地 AI 三选一
  const [localConfig, setLocalConfig] = useState<LocalAIConfig>(createDefaultLocalConfig())
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  
  // Phase 9: 本地 AI 检测状态
  const [localAIStatus, setLocalAIStatus] = useState<LocalAIStatus>({
    hasChromeAI: false,
    hasOllama: false,
    checking: true,
    available: false,
    services: []
  })
  const [localModels, setLocalModels] = useState<LocalModelSummary[]>([])
  const [localModelsMode, setLocalModelsMode] = useState<LocalAIEndpointMode | null>(null)
  const [isFetchingLocalModels, setIsFetchingLocalModels] = useState(false)
  const [localModelsError, setLocalModelsError] = useState<string | null>(null)
  const [localTestSuccess, setLocalTestSuccess] = useState(false)
  const [showAdvancedLocalOptions, setShowAdvancedLocalOptions] = useState(false)
  const [showCostDetails, setShowCostDetails] = useState(false) // Phase 9: 成本详情浮层
  const [showChromeAIHelp, setShowChromeAIHelp] = useState(false) // Phase 9: Chrome AI 帮助浮层

  // 从模型推导当前 Provider
  const currentProvider = model ? getProviderFromModel(model) : null
  
  // 获取当前 Provider 的 API Key
  const currentApiKey = currentProvider ? apiKeys[currentProvider] : ""

  const buildLocalConfigForSave = (forceEnabled?: boolean): LocalAIConfig => {
    const enabled = typeof forceEnabled === 'boolean'
    ? forceEnabled
    : localAIChoice === 'ollama'
    return {
    ...localConfig,
    enabled,
    provider: "ollama"
    }
  }
  
  // 获取当前模型的货币符号
  const getCurrencySymbol = () => {
    if (!currentProvider) return "$"
    return currentProvider === "deepseek" ? "¥" : "$"
  }
  
  // 获取预算范围
  const getBudgetRange = () => {
    if (!currentProvider) return { min: 1, max: 100 }
    return currentProvider === "deepseek" 
    ? { min: 10, max: 500 }  // DeepSeek 用人民币
    : { min: 1, max: 100 }   // OpenAI/Anthropic 用美元
  }

  // 加载保存的配置
  useEffect(() => {
    getAIConfig().then((config) => {
    // 加载模型配置
    if (config.model) {
      setModel(config.model)
    }
    
    // 加载各 Provider 的 API Keys
    if (config.apiKeys) {
      setApiKeys({
        openai: config.apiKeys.openai || "",
        deepseek: config.apiKeys.deepseek || ""
      })
    }
    
    // 加载其他配置
    setMonthlyBudget(config.monthlyBudget || 5)
    setEnableReasoning(config.enableReasoning || false)

    const mergedLocal = config.local
      ? { ...createDefaultLocalConfig(), ...config.local }
      : createDefaultLocalConfig()
    setLocalConfig(mergedLocal)
    setLocalAIChoice(mergedLocal.enabled ? 'ollama' : 'none')
    })
  }, [])

  // Phase 9: 检测本地 AI 可用性
  useEffect(() => {
    let isMounted = true
    const detectLocalAI = async () => {
    if (!isMounted) return
    setLocalAIStatus(prev => ({ ...prev, checking: true }))
    try {
      const status = await checkLocalAIStatus()
      if (!isMounted) return
      setLocalAIStatus({
        hasChromeAI: status.hasChromeAI,
        hasOllama: status.hasOllama,
        checking: false,
        available: status.availableServices.length > 0,
        services: status.availableServices
      })
    } catch (error) {
      if (!isMounted) return
      setLocalAIStatus({ hasChromeAI: false, hasOllama: false, checking: false, available: false, services: [] })
    }
    }
    detectLocalAI()
    return () => {
      isMounted = false
    }
  }, [])

  const refreshLocalModels = useCallback(async () => {
    if (!localConfig.endpoint?.trim()) {
    setLocalModels([])
    setLocalModelsMode(null)
    setLocalModelsError(_("options.aiConfig.localAIForm.errors.missingEndpoint"))
    return
    }

    setIsFetchingLocalModels(true)
    setLocalModelsError(null)

    try {
    const { mode, models } = await listLocalModels(localConfig.endpoint, localConfig.apiKey)
    setLocalModelsMode(mode)
    setLocalModels(models)

    if (models.length && (!localConfig.model || !models.some(m => m.id === localConfig.model))) {
      setLocalConfig(prev => ({ ...prev, model: models[0].id }))
    }
    } catch (error) {
    setLocalModels([])
    setLocalModelsMode(null)
    setLocalModelsError(error instanceof Error ? error.message : String(error))
    } finally {
    setIsFetchingLocalModels(false)
    }
  }, [localConfig.endpoint, localConfig.apiKey, _])

  // 测试连接
  const handleTest = async () => {
    if (!model) {
    setMessage({ type: "error", text: _("options.aiConfig.errors.selectModel") })
    return
    }
    if (!currentProvider) {
    setMessage({ type: "error", text: _("options.aiConfig.errors.invalidModel") })
    return
    }
    if (!currentApiKey) {
    setMessage({ type: "error", text: _("options.aiConfig.errors.enterApiKey") })
    return
    }

    setIsTesting(true)
    setMessage(null)

    try {
    // 1. 先验证格式
    const isValid = validateApiKey(currentProvider, currentApiKey)
    if (!isValid) {
      setMessage({
        type: "error",
        text: _("options.aiConfig.errors.invalidApiKeyFormat")
      })
      setIsTesting(false)
      return
    }

    // 2. 临时保存配置（以便 aiManager 可以读取）
    await saveAIConfig({
      provider: currentProvider,
      apiKeys,
      enabled: true,
      monthlyBudget,
      model,
      enableReasoning,
      local: buildLocalConfigForSave()
    })

    // 3. 重新初始化 aiManager 以加载新配置
    await aiManager.initialize()

    // 4. 测试连接
    const startTime = Date.now()
    const result = await aiManager.testConnection()
    const latency = Date.now() - startTime

    if (result.success) {
      setMessage({
        type: "success",
        text: _("options.aiConfig.messages.testSuccess", { latency })
      })
    } else {
      setMessage({
        type: "error",
        text: _("options.aiConfig.errors.testFailed", { error: result.message || "Unknown error" })
      })
    }
    } catch (error) {
    setMessage({
      type: "error",
      text: _("options.aiConfig.errors.testFailed", { error: error instanceof Error ? error.message : String(error) })
    })
    } finally {
    setIsTesting(false)
    }
  }

  // 保存配置
  const handleSave = async () => {
    if (!model) {
    setMessage({ type: "error", text: _("options.aiConfig.errors.selectModel") })
    return
    }
    if (!currentProvider) {
    setMessage({ type: "error", text: _("options.aiConfig.errors.invalidModel") })
    return
    }
    if (!currentApiKey) {
    setMessage({ type: "error", text: _("options.aiConfig.errors.enterApiKey") })
    return
    }

    setIsSaving(true)
    setMessage(null)

    try {
    await saveAIConfig({
      provider: currentProvider,
      apiKeys,
      enabled: true,
      monthlyBudget,
      model,
      enableReasoning,
      local: buildLocalConfigForSave()
    })
    setMessage({ type: "success", text: _("options.aiConfig.messages.saveSuccess") })
    } catch (error) {
    setMessage({
      type: "error",
      text: _("options.aiConfig.errors.saveFailed", { error: error instanceof Error ? error.message : String(error) })
    })
    } finally {
    setIsSaving(false)
    }
  }

  // 禁用 AI
  const handleDisable = async () => {
    setIsSaving(true)
    setMessage(null)

    try {
    await saveAIConfig({
      provider: null,
      apiKeys: {},
      enabled: false,
      monthlyBudget: 5,
      model: undefined,
      enableReasoning: false,
      local: buildLocalConfigForSave(false)
    })
    setModel("")
    setApiKeys({ openai: "", deepseek: "" })
    setEnableReasoning(false)
    setLocalAIChoice('none')
    setMessage({ type: "success", text: _("options.aiConfig.messages.disableSuccess") })
    } catch (error) {
    setMessage({
      type: "error",
      text: _("options.aiConfig.errors.disableFailed", { error: error instanceof Error ? error.message : String(error) })
    })
    } finally {
    setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
    {/* 标题 */}
    <div>
      <h2 className="text-2xl font-bold mb-2">🤖 {_("options.aiConfig.title")}</h2>
      <p className="text-gray-600 dark:text-gray-400">
        {_("options.aiConfig.subtitle")}
      </p>
    </div>

    {/* 关于 AI 分析（移到顶部） */}
    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <h3 className="font-semibold mb-2">💡 {_("options.aiConfig.info.title")}</h3>
      <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
        <p>{_("options.aiConfig.info.overview")}</p>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div className="flex items-start gap-2">
            <span className="text-lg">☁️</span>
            <div>
              <p className="font-medium">{_("options.aiConfig.info.remoteTitle")}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{_("options.aiConfig.info.remoteDesc")}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-lg">🔒</span>
            <div>
              <p className="font-medium">{_("options.aiConfig.info.localTitle")}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{_("options.aiConfig.info.localDesc")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* 主要内容：两栏布局 */}
    <div className="grid gap-6 md:grid-cols-2">
      {/* 左栏：远程 AI */}
      <div className="space-y-4 p-5 bg-white dark:bg-gray-900 border-2 border-blue-200 dark:border-blue-800 rounded-lg">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span>☁️</span>
          {_("options.aiConfig.remote.title")}
        </h3>

        {/* 模型选择（合并了 Provider） */}
        <div>
          <label htmlFor="ai-model" className="block text-sm font-medium mb-2">
            {_("options.aiConfig.labels.modelAndProvider")}
          </label>
          <select
            id="ai-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">{_("options.aiConfig.placeholders.disableRemoteAI")}</option>
            {Object.entries(AVAILABLE_MODELS).map(([providerKey, models]) => {
              const label = providerKey.toUpperCase()
              
              return (
                <optgroup key={providerKey} label={label}>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.costMultiplier && m.costMultiplier !== 1 && ` (${m.costMultiplier}x)`}
                      {m.supportsReasoning && " ⚡"}
                    </option>
                  ))}
                </optgroup>
              )
            })}
          </select>
          {model && currentProvider && AVAILABLE_MODELS[currentProvider]?.find(m => m.id === model) && (
            <p className="mt-1 text-sm text-gray-500">
              {_(`options.aiConfig.models.${model}.description`)}
            </p>
          )}
        </div>

        {/* API Key */}
        {model && currentProvider && (
          <>
            <div>
              <label htmlFor="api-key" className="block text-sm font-medium mb-2">
                {_("options.aiConfig.labels.apiKey")} ({currentProvider.toUpperCase()})
              </label>
              <input
                id="api-key"
                type="password"
                value={currentApiKey}
                onChange={(e) => setApiKeys({ ...apiKeys, [currentProvider]: e.target.value })}
                placeholder={_("options.aiConfig.placeholders.apiKey")}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-gray-500">
                {_("options.aiConfig.hints.apiKey")}
              </p>
            </div>

            {/* 预算控制 */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <label htmlFor="monthly-budget" className="block text-sm font-medium">
                  {_("options.aiConfig.budgetLabel")}
                </label>
                {/* 成本参考链接 */}
                <button
                  type="button"
                  onClick={() => setShowCostDetails(!showCostDetails)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  💰 {_("options.aiConfig.cost.reference")}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-600 dark:text-gray-400">
                  {getCurrencySymbol()}
                </span>
                <input
                  id="monthly-budget"
                  type="number"
                  min={getBudgetRange().min}
                  max={getBudgetRange().max}
                  step="1"
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(Math.max(getBudgetRange().min, Number(e.target.value)))}
                  className="w-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {_("options.aiConfig.budgetUnit")}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {_("options.aiConfig.budgetHint")}
              </p>
              <p className="mt-1 text-xs text-orange-600 dark:text-orange-400">
                {_("options.aiConfig.budgetWarning", {
                  range: currentProvider === "deepseek" ? "¥10-50" : "$5-10"
                })}
              </p>
            </div>

            {/* Phase 9: 推理能力开关 */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <input
                  id="enable-reasoning"
                  type="checkbox"
                  checked={enableReasoning}
                  onChange={(e) => setEnableReasoning(e.target.checked)}
                  disabled={!!(model && currentProvider && !AVAILABLE_MODELS[currentProvider]?.find(m => m.id === model)?.supportsReasoning)}
                  className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="flex-1">
                  <label htmlFor="enable-reasoning" className="block text-sm font-medium">
                    ⚡ {_("options.aiConfig.enableReasoning")}
                  </label>
                  <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                    {_("options.aiConfig.reasoningHint")}
                  </p>
                  
                  {/* 显示当前模型的推理支持状态 */}
                  {model && currentProvider && AVAILABLE_MODELS[currentProvider]?.find(m => m.id === model) && (
                    <>
                      {AVAILABLE_MODELS[currentProvider].find(m => m.id === model)?.supportsReasoning ? (
                        <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                          ✅ {_("options.aiConfig.reasoningSupported")}
                          {enableReasoning && AVAILABLE_MODELS[currentProvider].find(m => m.id === model)?.reasoningCostMultiplier && (
                            <span className="ml-1">
                              ({_("options.aiConfig.reasoningCost", { 
                                multiplier: AVAILABLE_MODELS[currentProvider].find(m => m.id === model)?.reasoningCostMultiplier 
                              })})
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          💡 {_("options.aiConfig.reasoningNotSupported")}
                        </p>
                      )}
                    </>
                  )}
                  
                  {enableReasoning && (
                    <p className="mt-1 text-xs text-orange-600 dark:text-orange-400 font-medium">
                      {_("options.aiConfig.reasoningWarning")}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* 测试连接按钮 */}
            <div>
              <button
                onClick={handleTest}
                disabled={!currentApiKey || isTesting || isSaving}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isTesting ? _("options.aiConfig.buttons.testing") : _("options.aiConfig.buttons.test")}
              </button>
            </div>
          </>
        )}
      </div>

      {/* 右栏：本地 AI */}
      <div className="space-y-4 p-5 bg-white dark:bg-gray-900 border-2 border-green-200 dark:border-green-800 rounded-lg">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <span>🔒</span>
          {_("options.aiConfig.local.title")}
        </h3>

        {localAIStatus.checking && (
          <p className="text-xs text-gray-500">{_("options.aiConfig.local.checking")}</p>
        )}

        {/* 本地 AI 类型选择 */}
        <div>
          <label className="block text-sm font-medium mb-2">
            {_("options.aiConfig.local.choiceTitle")}
          </label>
          <div className="space-y-2">
            {/* 不使用本地 AI（默认） */}
            <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="localAIChoice"
              value="none"
              checked={localAIChoice === 'none'}
              onChange={() => {
                setLocalAIChoice('none')
                setLocalConfig(prev => ({ ...prev, enabled: false, provider: "ollama" }))
              }}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {_("options.aiConfig.local.none")}
            </span>
          </label>
          
          {/* Chrome AI */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="localAIChoice"
                value="chromeAI"
                checked={localAIChoice === 'chromeAI'}
                onChange={() => {
                  setLocalAIChoice('chromeAI')
                  setLocalConfig(prev => ({ ...prev, enabled: false, provider: "ollama" }))
                }}
                disabled={!localAIStatus.hasChromeAI}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {_("options.aiConfig.local.chromeAI")}
              </span>
            </label>
            {localAIStatus.hasChromeAI ? (
              <span className="text-xs text-green-600 dark:text-green-400">
                ✓ {_("options.aiConfig.local.available")}
              </span>
            ) : (
              <button
                onClick={() => setShowChromeAIHelp(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {_("options.aiConfig.local.howToEnable")}
              </button>
            )}
          </div>
          
          {/* Ollama */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="localAIChoice"
                value="ollama"
                checked={localAIChoice === 'ollama'}
                onChange={() => {
                  setLocalAIChoice('ollama')
                  setLocalConfig(prev => ({ ...prev, enabled: true, provider: "ollama" }))
                }}
                disabled={!localAIStatus.hasOllama}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {_("options.aiConfig.local.ollama")}
              </span>
            </label>
            {localAIStatus.hasOllama ? (
              <span className="text-xs text-green-600 dark:text-green-400">
                ✓ {_("options.aiConfig.local.available")}
              </span>
            ) : (
              <a
                href="https://ollama.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {_("options.aiConfig.local.installOllama")}
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Ollama 配置表单 */}
      {localAIChoice === 'ollama' && (
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          {/* Endpoint */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {_("options.aiConfig.localAIForm.endpoint")}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={localConfig.endpoint}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, provider: "ollama", endpoint: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="http://localhost:11434/v1"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!localConfig.endpoint?.trim()) {
                    setLocalModelsError(_("options.aiConfig.localAIForm.errors.missingEndpoint"))
                    return
                  }
                  try {
                    setIsFetchingLocalModels(true)
                    setLocalModelsError(null)
                    setLocalTestSuccess(false)
                    await refreshLocalModels()
                    setLocalTestSuccess(true)
                    setTimeout(() => setLocalTestSuccess(false), 3000)
                  } catch (error) {
                    console.error('测试连接失败:', error)
                    setLocalModelsError(error instanceof Error ? error.message : String(error))
                  } finally {
                    setIsFetchingLocalModels(false)
                  }
                }}
                disabled={isFetchingLocalModels || !localConfig.endpoint?.trim()}
                className={`px-4 py-2 text-sm rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap ${
                  localTestSuccess
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {localTestSuccess
                  ? '✅ ' + _('options.aiConfig.localAIForm.messages.testSuccess')
                  : isFetchingLocalModels
                  ? _("options.aiConfig.localAIForm.buttons.testing")
                  : _("options.aiConfig.localAIForm.buttons.test")}
              </button>
            </div>
          </div>

          {/* 模型选择 */}
          <div>
            <label className="block text-sm font-medium mb-1">
              {_("options.aiConfig.localAIForm.model")}
            </label>
            <select
              value={localConfig.model}
              onChange={(e) => setLocalConfig(prev => ({ ...prev, provider: "ollama", model: e.target.value }))}
              disabled={localModels.length === 0}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {localModels.length === 0 ? (
                <option value="">{_("options.aiConfig.localAIForm.modelPlaceholder")}</option>
              ) : (
                <>
                  {!localConfig.model && <option value="">{_("options.aiConfig.localAIForm.selectModel")}</option>}
                  {localModels.map((modelOption) => (
                    <option key={modelOption.id} value={modelOption.id}>
                      {modelOption.label}
                    </option>
                  ))}
                </>
              )}
            </select>
            {localModelsError && (
              <p className="mt-1 text-xs text-red-500 dark:text-red-400">
                {localModelsError}
              </p>
            )}
          </div>

          {/* 高级选项折叠 */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvancedLocalOptions(!showAdvancedLocalOptions)}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1"
            >
              <span>{showAdvancedLocalOptions ? '▼' : '▶'}</span>
              {_("options.aiConfig.localAIForm.advancedOptions")}
            </button>
          </div>

          {showAdvancedLocalOptions && (
            <div className="grid gap-4 md:grid-cols-3 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {_("options.aiConfig.localAIForm.temperature")}
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  value={localConfig.temperature ?? 0.2}
                  onChange={(e) => setLocalConfig(prev => ({
                    ...prev,
                    provider: "ollama",
                    temperature: Math.min(1, Math.max(0, Number(e.target.value)))
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {_("options.aiConfig.localAIForm.maxTokens")}
                </label>
                <input
                  type="number"
                  min="128"
                  step="32"
                  value={localConfig.maxOutputTokens ?? 768}
                  onChange={(e) => setLocalConfig(prev => ({
                    ...prev,
                    provider: "ollama",
                    maxOutputTokens: Math.max(128, Number(e.target.value))
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  {_("options.aiConfig.localAIForm.timeout")}
                </label>
                <input
                  type="number"
                  min="5000"
                  step="1000"
                  value={localConfig.timeoutMs ?? 45000}
                  onChange={(e) => setLocalConfig(prev => ({
                    ...prev,
                    provider: "ollama",
                    timeoutMs: Math.max(5000, Number(e.target.value))
                  }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {_("options.aiConfig.localAIForm.note")}
          </p>
        </div>
      )}
    </div>
  </div>

  {/* 底部统一保存按钮 */}
  <div className="flex flex-col items-center gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
    <button
      onClick={handleSave}
      disabled={isTesting || isSaving}
      className="px-8 py-3 bg-green-600 text-white text-lg font-semibold rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors shadow-lg"
    >
      {isSaving ? _("options.aiConfig.buttons.saving") : _("options.aiConfig.buttons.save")}
    </button>
    
    {/* 全局消息提示 */}
    {message && (
      <div
        className={`p-4 rounded-lg w-full max-w-md text-center ${
          message.type === "success"
            ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
            : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
        }`}
      >
        {message.text}
      </div>
    )}
  </div>

  {/* 成本参考浮层模态框 */}
  {showCostDetails && (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={() => setShowCostDetails(false)}
    >
        <div 
          className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto m-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">💰 {_("options.aiConfig.cost.title")}</h3>
            <button
              onClick={() => setShowCostDetails(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl"
            >
              ×
            </button>
          </div>
          
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
            {_("options.aiConfig.cost.example")}
          </p>

          <div className="space-y-4 text-sm">
            {/* DeepSeek */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded">
              <div className="font-semibold text-gray-800 dark:text-gray-200">
                {_("options.aiConfig.cost.deepseek.title")}
              </div>
              <ul className="ml-4 mt-2 space-y-1 text-gray-700 dark:text-gray-300">
                <li>• {_("options.aiConfig.cost.deepseek.inputUncached")}</li>
                <li>• {_("options.aiConfig.cost.deepseek.inputCached")}</li>
                <li>• {_("options.aiConfig.cost.deepseek.output")}</li>
                <li className="font-medium text-blue-600 dark:text-blue-400 mt-2">
                  → {_("options.aiConfig.cost.deepseek.estimate")}
                </li>
              </ul>
            </div>

            {/* OpenAI */}
            <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded">
              <div className="font-semibold text-gray-800 dark:text-gray-200">
                {_("options.aiConfig.cost.openai.title")}
              </div>
              <ul className="ml-4 mt-2 space-y-1 text-gray-700 dark:text-gray-300">
                <li>• GPT-5 Nano: {_("options.aiConfig.cost.openai.nano")}</li>
                <li>• GPT-5 Mini: {_("options.aiConfig.cost.openai.mini")}</li>
                <li>• GPT-5: {_("options.aiConfig.cost.openai.standard")}</li>
                <li>• o4-mini (推理): {_("options.aiConfig.cost.openai.o4mini")}</li>
                <li className="font-medium text-green-600 dark:text-green-400 mt-2">
                  → {_("options.aiConfig.cost.openai.estimate")}
                </li>
              </ul>
            </div>

            {/* Anthropic */}
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded">
              <div className="font-semibold text-gray-800 dark:text-gray-200">
                {_("options.aiConfig.cost.anthropic.title")}
              </div>
              <ul className="ml-4 mt-2 space-y-1 text-gray-700 dark:text-gray-300">
                <li>• {_("options.aiConfig.cost.anthropic.input")}</li>
                <li>• {_("options.aiConfig.cost.anthropic.output")}</li>
                <li className="font-medium text-purple-600 dark:text-purple-400 mt-2">
                  → {_("options.aiConfig.cost.anthropic.estimate")}
                </li>
              </ul>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-600 dark:text-gray-400">
            {_("options.aiConfig.cost.note")}
          </p>
        </div>
      </div>
    )}

    {/* Chrome AI 帮助浮层模态框 */}
    {showChromeAIHelp && (
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
        onClick={() => setShowChromeAIHelp(false)}
      >
        <div 
          className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg m-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">❓ {_("options.aiConfig.chromeAI.title")}</h3>
            <button
              onClick={() => setShowChromeAIHelp(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl"
            >
              ×
            </button>
          </div>
          
          <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
            {_("options.aiConfig.chromeAI.description")}
          </p>

          <div className="space-y-3 text-sm">
            <div>
              <div className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                1️⃣ {_("options.aiConfig.chromeAI.step1.title")}
              </div>
              <p className="text-gray-700 dark:text-gray-300 ml-6">
                {_("options.aiConfig.chromeAI.step1.content")}
              </p>
            </div>

            <div>
              <div className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                2️⃣ {_("options.aiConfig.chromeAI.step2.title")}
              </div>
              <p className="text-gray-700 dark:text-gray-300 ml-6">
                {_("options.aiConfig.chromeAI.step2.content")}
              </p>
              <button
                onClick={() => {
                  navigator.clipboard.writeText('chrome://flags/#optimization-guide-on-device-model')
                  alert(_("options.aiConfig.chromeAI.urlCopied"))
                }}
                title={_("options.aiConfig.chromeAI.clickToCopy")}
                className="ml-6 mt-2 p-2 bg-gray-100 dark:bg-gray-700 rounded font-mono text-xs text-blue-600 dark:text-blue-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors block"
              >
                chrome://flags/#optimization-guide-on-device-model
                <span className="ml-2 text-[10px]">📋</span>
              </button>
            </div>

            <div>
              <div className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                3️⃣ {_("options.aiConfig.chromeAI.step3.title")}
              </div>
              <p className="text-gray-700 dark:text-gray-300 ml-6">
                {_("options.aiConfig.chromeAI.step3.content")}
              </p>
            </div>

            <div>
              <div className="font-semibold text-gray-800 dark:text-gray-200 mb-1">
                4️⃣ {_("options.aiConfig.chromeAI.step4.title")}
              </div>
              <p className="text-gray-700 dark:text-gray-300 ml-6">
                {_("options.aiConfig.chromeAI.step4.content")}
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-600 dark:text-gray-400">
            {_("options.aiConfig.chromeAI.note")}
          </p>
        </div>
      </div>
    )}
    </div>
  )
}