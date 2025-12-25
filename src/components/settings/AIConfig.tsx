import { useI18n } from "@/i18n/helpers"
import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  getAIConfig,
  saveAIConfig,
  validateApiKey,
  getEngineAssignment,
  saveEngineAssignment,
  type AIProviderType,
  type LocalAIConfig,
  AVAILABLE_MODELS,
  getProviderFromModel
} from "@/storage/ai-config"
import { aiManager } from "@/core/ai/AICapabilityManager"
import { checkLocalAIStatus, getRecommendationConfig, saveRecommendationConfig } from "@/storage/recommendation-config"
import type { RecommendationAnalysisEngine, FeedAnalysisEngine } from "@/types/analysis-engine"
import { listLocalModels, type LocalAIEndpointMode, type LocalModelSummary } from "@/utils/local-ai-endpoint"
import { AIEngineAssignmentComponent } from "@/components/settings/AIEngineAssignment"
import type { AIEngineAssignment as AIEngineAssignmentType } from "@/types/ai-engine-assignment"
import { OnboardingStateService } from "@/core/onboarding/OnboardingStateService"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"
import { AIConfigPanel } from "@/components/AIConfigPanel"
import { BudgetOverview } from "@/components/BudgetOverview"

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
  const [monthlyBudget, setMonthlyBudget] = useState<number>(5) // 默认 $5/月 (已废弃，保留兼容)
  
  // Phase 12.4: Provider 级别预算
  const [providerBudgets, setProviderBudgets] = useState<{
    openai?: number
    deepseek?: number
  }>({})
  
  // Phase 12.6: Provider 超时配置（远程 AI）
  const [providerTimeouts, setProviderTimeouts] = useState<{
    openai?: { standard?: number; reasoning?: number }
    deepseek?: { standard?: number; reasoning?: number }
  }>({})
  
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

  // Phase 8: AI 引擎分配
  const [engineAssignment, setEngineAssignment] = useState<AIEngineAssignmentType | null>(null)
  
  // Phase 12: Provider 偏好设置
  const [preferredRemoteProvider, setPreferredRemoteProvider] = useState<"deepseek" | "openai">("deepseek")
  const [preferredLocalProvider, setPreferredLocalProvider] = useState<"ollama">("ollama")
  
  // 推荐配置
  const [maxRecommendations, setMaxRecommendations] = useState(3)
  const [isLearningStage, setIsLearningStage] = useState(false)
  const [pageCount, setPageCount] = useState(0)
  const [totalPages, setTotalPages] = useState(LEARNING_COMPLETE_PAGES)
  const [recommendationScheduler, setRecommendationScheduler] = useState<{
    lastRunTime?: number
    nextRunTime?: number
  } | null>(null)
  
  const [localModels, setLocalModels] = useState<LocalModelSummary[]>([])
  const [localModelsMode, setLocalModelsMode] = useState<LocalAIEndpointMode | null>(null)
  const [isFetchingLocalModels, setIsFetchingLocalModels] = useState(false)
  const [localModelsError, setLocalModelsError] = useState<string | null>(null)
  const [localTestSuccess, setLocalTestSuccess] = useState(false)
  const [showAdvancedLocalOptions, setShowAdvancedLocalOptions] = useState(false)
  const [showCostDetails, setShowCostDetails] = useState(false) // Phase 9: 成本详情浮层
  const [showChromeAIHelp, setShowChromeAIHelp] = useState(false) // Phase 9: Chrome AI 帮助浮层
  const [showOllamaHelp, setShowOllamaHelp] = useState(false) // Ollama 安装帮助浮层

  // 自动保存状态
  const [autoSaving, setAutoSaving] = useState(false)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isInitializedRef = useRef(false) // 追踪是否已完成初始化

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
  
  /**
   * 格式化时间距离
   */
  const formatTimeUntil = (timestamp: number): string => {
    const now = Date.now()
    const diff = timestamp - now
    
    if (diff < 0) return '即将执行'
    
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days} 天`
    if (hours > 0) return `${hours} 小时`
    if (minutes > 0) return `${minutes} 分钟`
    return '即将执行'
  }
  

  
  // 获取当前模型的货币符号
  const getCurrencySymbol = () => {
    if (!currentProvider) return "$"
    return currentProvider === "deepseek" ? "¥" : "$"
  }
  
  // 获取预算范围（根据 provider 判断货币）
  const getBudgetRange = (provider: AIProviderType) => {
    return provider === "deepseek" 
    ? { min: 10, max: 500, currency: 'CNY', symbol: '¥' }  // DeepSeek 用人民币
    : { min: 1, max: 100, currency: 'USD', symbol: '$' }   // OpenAI 用美元
  }

  // 加载保存的配置
  useEffect(() => {
    getAIConfig().then((config) => {
    // 从 providers 结构中加载配置
    // 优先使用第一个配置完整的 provider
    const configuredProvider = config.providers 
      ? Object.entries(config.providers).find(([_, cfg]) => cfg && cfg.apiKey && cfg.model)
      : null
    
    if (configuredProvider) {
      const [_, cfg] = configuredProvider
      setModel(cfg.model)
      setEnableReasoning(cfg.enableReasoning || false)
    }
    
    // 加载所有 Provider 的 API Keys
    setApiKeys({
      openai: config.providers?.openai?.apiKey || "",
      deepseek: config.providers?.deepseek?.apiKey || ""
    })
    
    // Phase 12.4: 加载 Provider 预算
    setProviderBudgets(config.providerBudgets || {})
    
    // Phase 12.6: 加载 Provider 超时配置
    setProviderTimeouts({
      openai: {
        standard: config.providers?.openai?.timeoutMs,
        reasoning: config.providers?.openai?.reasoningTimeoutMs
      },
      deepseek: {
        standard: config.providers?.deepseek?.timeoutMs,
        reasoning: config.providers?.deepseek?.reasoningTimeoutMs
      }
    })
    
    // 加载其他配置
    setMonthlyBudget(config.monthlyBudget || 5)

    const mergedLocal = config.local
      ? { ...createDefaultLocalConfig(), ...config.local }
      : createDefaultLocalConfig()
    setLocalConfig(mergedLocal)
    setLocalAIChoice(mergedLocal.enabled ? 'ollama' : 'none')

    // Phase 12: 加载 Provider 偏好设置
    setPreferredRemoteProvider(config.preferredRemoteProvider || "deepseek")
    setPreferredLocalProvider(config.preferredLocalProvider || "ollama")

    // Phase 8: 加载 AI 引擎分配配置
    getEngineAssignment().then(assignment => {
      setEngineAssignment(assignment)
    })
    
    // 加载推荐配置
    getRecommendationConfig().then(recConfig => {
      setMaxRecommendations(recConfig.maxRecommendations || 3)
    })
    
    // 检查学习阶段 - 使用 OnboardingStateService
    OnboardingStateService.getState().then(state => {
      setPageCount(state.pageCount)
      setTotalPages(state.threshold)
      setIsLearningStage(state.state === 'learning' || state.state === 'setup')
      // 标记初始化完成
      isInitializedRef.current = true
    })
    
    // 加载推荐调度器状态
    const loadRecommendationScheduler = async () => {
      try {
        const response: any = await new Promise((resolve) => {
          chrome.runtime.sendMessage({ type: 'GET_SCHEDULER_STATUS' }, resolve)
        })
        
        if (response?.success) {
          setRecommendationScheduler({
            nextRunTime: response.data.recommendationScheduler.nextRunTime
          })
        }
      } catch (error) {
        console.error('加载推荐调度器状态失败:', error)
      }
    }
    
    loadRecommendationScheduler()
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

  // 缓存模型列表请求结果，避免短时间内重复请求
  const lastFetchRef = useRef<{ endpoint: string; apiKey: string; timestamp: number } | null>(null)
  const fetchingRef = useRef(false) // 防止并发请求
  const CACHE_DURATION = 3000 // 3秒缓存

  const refreshLocalModels = useCallback(async (forceRefresh = false) => {
    if (!localConfig.endpoint?.trim()) {
      setLocalModels([])
      setLocalModelsMode(null)
      setLocalModelsError(_("options.aiConfig.localAIForm.errors.missingEndpoint"))
      return
    }

    // 防止并发请求
    if (fetchingRef.current && !forceRefresh) {
      return
    }

    // 检查缓存：如果 endpoint 和 apiKey 相同，且在缓存时间内，跳过请求
    const now = Date.now()
    const lastFetch = lastFetchRef.current
    if (!forceRefresh && lastFetch &&
        lastFetch.endpoint === localConfig.endpoint &&
        lastFetch.apiKey === (localConfig.apiKey || '') &&
        (now - lastFetch.timestamp) < CACHE_DURATION) {
      return // 使用缓存的模型列表
    }

    fetchingRef.current = true
    setIsFetchingLocalModels(true)
    setLocalModelsError(null)

    try {
      const { mode, models } = await listLocalModels(localConfig.endpoint, localConfig.apiKey)
      setLocalModelsMode(mode)
      setLocalModels(models)

      // 更新缓存
      lastFetchRef.current = {
        endpoint: localConfig.endpoint,
        apiKey: localConfig.apiKey || '',
        timestamp: now
      }

      // 只在模型列表中没有当前选中的模型时才自动选择第一个
      // 避免循环更新
      if (models.length > 0 && !models.some(m => m.id === localConfig.model)) {
        setLocalConfig(prev => ({ ...prev, model: models[0].id }))
      }
    } catch (error) {
      setLocalModels([])
      setLocalModelsMode(null)
      setLocalModelsError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsFetchingLocalModels(false)
      fetchingRef.current = false
    }
  }, [localConfig.endpoint, localConfig.apiKey, localConfig.model, _])

  // 保持最新的 refreshLocalModels 引用
  const refreshLocalModelsRef = useRef(refreshLocalModels)
  useEffect(() => {
    refreshLocalModelsRef.current = refreshLocalModels
  }, [refreshLocalModels])

  // 自动加载本地 AI 模型列表（页面加载时）
  // 使用 ref 追踪是否已经自动加载过，避免重复触发
  const hasAutoLoadedRef = useRef(false)
  useEffect(() => {
    if (localAIChoice === 'ollama' && localConfig.endpoint?.trim() && !hasAutoLoadedRef.current) {
      hasAutoLoadedRef.current = true
      refreshLocalModelsRef.current()
    }
  }, [localAIChoice, localConfig.endpoint])

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
    // 构建 providers 结构
    const providers: Record<string, { apiKey: string; model: string; enableReasoning?: boolean; timeoutMs?: number; reasoningTimeoutMs?: number }> = {}
    
    if (apiKeys.openai) {
      providers.openai = {
        apiKey: apiKeys.openai,
        model: currentProvider === 'openai' ? model : 'gpt-4o-mini',
        enableReasoning: currentProvider === 'openai' ? enableReasoning : false,
        timeoutMs: providerTimeouts.openai?.standard,  // Phase 12.6: 保存超时配置
        reasoningTimeoutMs: providerTimeouts.openai?.reasoning
      }
    }
    
    if (apiKeys.deepseek) {
      providers.deepseek = {
        apiKey: apiKeys.deepseek,
        model: currentProvider === 'deepseek' ? model : 'deepseek-chat',
        enableReasoning: currentProvider === 'deepseek' ? enableReasoning : false,
        timeoutMs: providerTimeouts.deepseek?.standard,  // Phase 12.6: 保存超时配置
        reasoningTimeoutMs: providerTimeouts.deepseek?.reasoning
      }
    }
    
    await saveAIConfig({
      providers,
      providerBudgets,  // Phase 12.4: 保存 Provider 预算
      local: buildLocalConfigForSave(),
      engineAssignment: engineAssignment || await getEngineAssignment(),
      // Phase 12: 保存 Provider 偏好设置
      preferredRemoteProvider,
      preferredLocalProvider
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

  /**
   * 自动保存配置（防抖 1000ms）
   * 只保存基本配置，不验证 API Key（API Key 在弹窗中保存）
   */
  const autoSaveConfig = useCallback(async () => {
    // 如果没有选择模型或没有配置 API Key，跳过自动保存
    if (!model || !currentProvider || !currentApiKey) {
      return
    }

    setAutoSaving(true)
    
    try {
      // 内联构建本地配置，避免依赖 buildLocalConfigForSave 函数
      const localConfigForSave = {
        ...localConfig,
        enabled: localAIChoice === 'ollama',
        provider: "ollama" as const
      }

      // Phase 9.2: 使用新的 providers 结构保存配置
      const providers: Record<string, { apiKey: string; model: string; enableReasoning?: boolean; timeoutMs?: number; reasoningTimeoutMs?: number }> = {}
      
      // 只保存有 API key 的 provider
      if (apiKeys.openai) {
        providers.openai = {
          apiKey: apiKeys.openai,
          model: currentProvider === 'openai' ? model : 'gpt-4o-mini',
          enableReasoning: currentProvider === 'openai' ? enableReasoning : false,
          timeoutMs: providerTimeouts.openai?.standard,  // Phase 12.6: 保存超时配置
          reasoningTimeoutMs: providerTimeouts.openai?.reasoning
        }
      }
      
      if (apiKeys.deepseek) {
        providers.deepseek = {
          apiKey: apiKeys.deepseek,
          model: currentProvider === 'deepseek' ? model : 'deepseek-chat',
          enableReasoning: currentProvider === 'deepseek' ? enableReasoning : false,
          timeoutMs: providerTimeouts.deepseek?.standard,  // Phase 12.6: 保存超时配置
          reasoningTimeoutMs: providerTimeouts.deepseek?.reasoning
        }
      }
      
      await saveAIConfig({
        providers,
        providerBudgets,  // Phase 12.4: 保存 Provider 预算
        local: localConfigForSave,
        engineAssignment: engineAssignment || await getEngineAssignment(),
        // Phase 12: 保存 Provider 偏好设置
        preferredRemoteProvider,
        preferredLocalProvider
      })
      
      // Phase 8: 保存 AI 引擎分配配置
      if (engineAssignment) {
        await saveEngineAssignment(engineAssignment)
      }
      
      // 保存推荐配置
      const recConfig = await getRecommendationConfig()
      await saveRecommendationConfig({
        ...recConfig,
        maxRecommendations
      })
      
    } catch (error) {
      console.error('[AIConfig] Auto-save failed:', error)
    } finally {
      setAutoSaving(false)
    }
  }, [model, currentProvider, currentApiKey, apiKeys, providerBudgets, providerTimeouts, enableReasoning, engineAssignment, maxRecommendations, localConfig, localAIChoice, preferredRemoteProvider, preferredLocalProvider])

  /**
   * 触发自动保存（带防抖）
   */
  const triggerAutoSave = useCallback(() => {
    // 清除之前的定时器
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }
    
    // 1000ms 后自动保存（增加防抖时间，避免频繁写入）
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSaveConfig()
    }, 1000)
  }, [autoSaveConfig])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [])

  // 监听关键字段变化，触发自动保存
  useEffect(() => {
    // 只有在初始化完成后才触发自动保存（避免初始加载时触发）
    if (!isInitializedRef.current) {
      return
    }
    
    // 只有在已配置 API Key 的情况下才自动保存
    if (model && currentProvider && currentApiKey) {
      triggerAutoSave()
    }
    // 只监听需要自动保存的字段，不包括函数引用
  }, [providerBudgets, enableReasoning, engineAssignment, maxRecommendations, model, currentProvider, currentApiKey])

  // 监听 engineAssignment 变化，同步更新 RecommendationConfig
  useEffect(() => {
    if (!isInitializedRef.current || !engineAssignment) {
      return
    }

    // 将 AIEngineAssignment 转换为 RecommendationConfig
    const syncRecommendationConfig = async () => {
      try {
        const recConfig = await getRecommendationConfig()
        
        // 安全检查：确保所有必要的字段都存在
        if (!engineAssignment.profileGeneration || !engineAssignment.articleAnalysis) {
          return
        }
        
        // 根据 profileGeneration 的设置确定 analysisEngine
        let analysisEngine: RecommendationAnalysisEngine = 'remoteAI'
        if (engineAssignment.profileGeneration.provider === 'ollama') {
          analysisEngine = 'localAI'
        } else if (engineAssignment.profileGeneration.useReasoning) {
          analysisEngine = 'remoteAIWithReasoning'
        }
        
        // 根据 articleAnalysis 的设置确定 feedAnalysisEngine
        let feedAnalysisEngine: FeedAnalysisEngine = 'remoteAI'
        if (engineAssignment.articleAnalysis.provider === 'ollama') {
          feedAnalysisEngine = 'localAI'
        }
        
        // 保存更新后的配置
        await saveRecommendationConfig({
          ...recConfig,
          analysisEngine,
          feedAnalysisEngine,
          useReasoning: engineAssignment.profileGeneration.useReasoning || false,
          useLocalAI: engineAssignment.profileGeneration.provider === 'ollama'
        })
      } catch (error) {
        console.error('[AIConfig] Failed to sync recommendation config:', error)
      }
    }

    syncRecommendationConfig()
  }, [engineAssignment])

  // 保存配置（保留用于手动触发，但隐藏保存按钮）
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
    // 构建 providers 结构
    const providers: Record<string, { apiKey: string; model: string; enableReasoning?: boolean }> = {}
    
    if (apiKeys.openai) {
      providers.openai = {
        apiKey: apiKeys.openai,
        model: currentProvider === 'openai' ? model : 'gpt-4o-mini',
        enableReasoning: currentProvider === 'openai' ? enableReasoning : false
      }
    }
    
    if (apiKeys.deepseek) {
      providers.deepseek = {
        apiKey: apiKeys.deepseek,
        model: currentProvider === 'deepseek' ? model : 'deepseek-chat',
        enableReasoning: currentProvider === 'deepseek' ? enableReasoning : false
      }
    }
    
    await saveAIConfig({
      providers,
      providerBudgets,  // Phase 12.4: 保存 Provider 预算
      local: buildLocalConfigForSave(),
      engineAssignment: engineAssignment || await getEngineAssignment(),
      // Phase 12: 保存 Provider 偏好设置
      preferredRemoteProvider,
      preferredLocalProvider
    })
    
    // Phase 8: 保存 AI 引擎分配配置
    if (engineAssignment) {
      await saveEngineAssignment(engineAssignment)
    }
    
    // 保存推荐配置
    const recConfig = await getRecommendationConfig()
    await saveRecommendationConfig({
      ...recConfig,
      maxRecommendations
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
      providers: {},
      providerBudgets: {},  // Phase 12.4: 清空 Provider 预算
      local: buildLocalConfigForSave(false),
      engineAssignment: await getEngineAssignment(),
      // Phase 12: 保持 Provider 偏好设置
      preferredRemoteProvider,
      preferredLocalProvider
    })
    setModel("")
    setApiKeys({ openai: "", deepseek: "" })
    setProviderBudgets({})  // Phase 12.4: 清空预算状态
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

    {/* 如何选择 AI 提供商（置顶） */}
    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
      <h4 className="font-semibold mb-2">💡 {_("options.aiConfig.info.title")}</h4>
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
            <span className="text-lg">💻</span>
            <div>
              <p className="font-medium">{_("options.aiConfig.info.localTitle")}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{_("options.aiConfig.info.localDesc")}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* AI Provider 状态面板 */}
    <div>
      <AIConfigPanel />
    </div>

    {/* Phase 12.4: 月度预算总览 */}
    <div>
      <BudgetOverview />
    </div>

    {/* Phase 8: AI 引擎分配 */}
    {engineAssignment && (
    <div>
      <AIEngineAssignmentComponent
        value={engineAssignment}
        onChange={setEngineAssignment}
      />
    </div>
  )}

  {/* 智能推荐数量 */}
  <div className="p-6 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg">
    <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
      🎯 {_("options.recommendation.smartCount")}
    </h3>
    {isLearningStage ? (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">📚</span>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {_("options.recommendation.learningStageTitle")}
              </span>
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">0</span>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
              {_("options.recommendation.learningStageHint", { current: pageCount, total: totalPages })}
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              {_("options.recommendation.learningStageNote")}
            </p>
          </div>
        </div>
      </div>
    ) : (
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-600 dark:text-gray-400">{_("options.recommendation.currentCount")}</span>
          <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {_("options.recommendation.countItems", { count: maxRecommendations })}
          </span>
        </div>
        
        {/* 推荐任务执行时间 */}
        {recommendationScheduler?.nextRunTime && (
          <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500 dark:text-gray-400">⏱️ 下次推荐生成</span>
              <span className="font-medium text-blue-600 dark:text-blue-400">
                {formatTimeUntil(recommendationScheduler.nextRunTime)}
              </span>
            </div>
          </div>
        )}
        
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
          {_("options.recommendation.countHint")}
        </p>
      </div>
    )}
    

  </div>

  {/* 自动保存状态提示 */}
  {autoSaving && (
    <div className="flex items-center justify-center gap-2 py-2 text-sm text-gray-600 dark:text-gray-400">
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
      </svg>
      <span>{_("options.aiConfig.autoSaving")}</span>
    </div>
  )}
  
  {/* 全局消息提示 */}
  {message && (
    <div
      className={`p-4 rounded-lg w-full max-w-md mx-auto text-center ${
        message.type === "success"
          ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
          : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
      }`}
    >
      {message.text}
    </div>
  )}

  {/* 成本参考浮层模态框 */}
  {showCostDetails && createPortal(
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
      </div>, document.body
    )}

    {/* Chrome AI 说明浮层 */}
    {showChromeAIHelp && createPortal(
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={() => setShowChromeAIHelp(false)}
      >
        <div 
          className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold">🚧 {_("options.aiConfig.chromeAI.title")}</h3>
            <button
              onClick={() => setShowChromeAIHelp(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl"
            >
              ×
            </button>
          </div>
          
          <div className="space-y-4 text-sm text-gray-700 dark:text-gray-300">
            <p>
              {_("options.aiConfig.chromeAI.notAvailableYet")}
            </p>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
              <div className="font-semibold text-blue-900 dark:text-blue-200 mb-2">
                📊 {_("options.aiConfig.chromeAI.currentStatus")}
              </div>
              <ul className="space-y-1 text-blue-800 dark:text-blue-300 text-xs">
                <li>• {_("options.aiConfig.chromeAI.status.earlyPreview")}</li>
                <li>• {_("options.aiConfig.chromeAI.status.limitedPlatform")}</li>
                <li>• {_("options.aiConfig.chromeAI.status.unstableAPI")}</li>
              </ul>
            </div>

            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="font-semibold text-green-900 dark:text-green-200 mb-2">
                ✅ {_("options.aiConfig.chromeAI.whenAvailable")}
              </div>
              <ul className="space-y-1 text-green-800 dark:text-green-300 text-xs">
                <li>• {_("options.aiConfig.chromeAI.condition.stableRelease")}</li>
                <li>• {_("options.aiConfig.chromeAI.condition.crossPlatform")}</li>
                <li>• {_("options.aiConfig.chromeAI.condition.stableAPI")}</li>
              </ul>
            </div>

            <p className="text-xs text-gray-600 dark:text-gray-400">
              📖 {_("options.aiConfig.chromeAI.learnMore")}: {" "}
              <a 
                href="https://developer.chrome.com/docs/ai/built-in-apis"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Chrome Built-in AI APIs
              </a>
            </p>

            <p className="font-semibold">
              💡 {_("options.aiConfig.chromeAI.useOllamaInstead")}
            </p>
          </div>

          <button
            onClick={() => {
              setShowChromeAIHelp(false)
              setShowOllamaHelp(true)
            }}
            className="mt-4 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {_("options.aiConfig.chromeAI.viewOllamaGuide")}
          </button>
        </div>
      </div>,
      document.body
    )}

    {/* Ollama 安装帮助浮层 */}
    {showOllamaHelp && createPortal(
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
        onClick={() => setShowOllamaHelp(false)}
      >
        <div 
          className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4 sticky top-0 bg-white dark:bg-gray-800 pb-2 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-bold">🦙 {_("options.aiConfig.ollama.title")}</h3>
            <button
              onClick={() => setShowOllamaHelp(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-2xl"
            >
              ×
            </button>
          </div>
          
          <div className="space-y-4 text-sm">
            <p className="text-gray-700 dark:text-gray-300">
              {_("options.aiConfig.ollama.description")}
            </p>

            {/* 安装步骤 */}
            <div className="space-y-3">
              <div className="font-semibold text-gray-800 dark:text-gray-200">
                📥 {_("options.aiConfig.ollama.installation.title")}
              </div>
              
              {/* macOS */}
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                <div className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                  🍎 macOS
                </div>
                <code className="block bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto">
                  brew install ollama
                </code>
                <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  {_("options.aiConfig.ollama.installation.macOS.alternative")}:{" "}
                  <a 
                    href="https://ollama.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {_("options.aiConfig.ollama.installation.downloadInstaller")}
                  </a>
                </p>
              </div>

              {/* Linux */}
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                <div className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                  🐧 Linux
                </div>
                <code className="block bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto">
                  curl -fsSL https://ollama.com/install.sh | sh
                </code>
              </div>

              {/* Windows */}
              <div className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg">
                <div className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                  🪟 Windows
                </div>
                <p className="text-gray-700 dark:text-gray-300 text-xs">
                  {_("options.aiConfig.ollama.installation.windows.instruction")}:{" "}
                  <a 
                    href="https://ollama.com/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    ollama.com/download
                  </a>
                </p>
              </div>
            </div>

            {/* 启动服务 */}
            <div className="space-y-2">
              <div className="font-semibold text-gray-800 dark:text-gray-200">
                🚀 {_("options.aiConfig.ollama.startService.title")}
              </div>
              <code className="block bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto">
                ollama serve
              </code>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {_("options.aiConfig.ollama.startService.note")}
              </p>
            </div>

            {/* 下载模型 */}
            <div className="space-y-2">
              <div className="font-semibold text-gray-800 dark:text-gray-200">
                📦 {_("options.aiConfig.ollama.downloadModel.title")}
              </div>
              
              <div className="space-y-2">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <div className="font-medium text-blue-900 dark:text-blue-200 text-xs mb-1">
                    ⭐ {_("options.aiConfig.ollama.downloadModel.recommended")}
                  </div>
                  <code className="block bg-gray-900 text-gray-100 p-2 rounded text-xs font-mono overflow-x-auto mt-2">
                    ollama pull llama3.2
                  </code>
                  <p className="text-xs text-blue-800 dark:text-blue-300 mt-2">
                    {_("options.aiConfig.ollama.downloadModel.llama.description")}
                  </p>
                </div>

                <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                  <div className="font-medium text-gray-800 dark:text-gray-200 text-xs mb-1">
                    🇨🇳 {_("options.aiConfig.ollama.downloadModel.chineseOptimized")}
                  </div>
                  <code className="block bg-gray-900 text-gray-100 p-2 rounded text-xs font-mono overflow-x-auto mt-2">
                    ollama pull qwen2.5:3b
                  </code>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
                    {_("options.aiConfig.ollama.downloadModel.qwen.description")}
                  </p>
                </div>
              </div>
            </div>

            {/* 验证安装 */}
            <div className="space-y-2">
              <div className="font-semibold text-gray-800 dark:text-gray-200">
                ✅ {_("options.aiConfig.ollama.verify.title")}
              </div>
              <code className="block bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto">
                curl http://localhost:11434/api/version
              </code>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {_("options.aiConfig.ollama.verify.success")}
              </p>
            </div>

            {/* 配置扩展 */}
            <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
              <div className="font-semibold text-green-900 dark:text-green-200 mb-2">
                ⚙️ {_("options.aiConfig.ollama.configure.title")}
              </div>
              <ol className="space-y-1 text-green-800 dark:text-green-300 text-xs list-decimal list-inside">
                <li>{_("options.aiConfig.ollama.configure.step1")}</li>
                <li>{_("options.aiConfig.ollama.configure.step2")}</li>
                <li>{_("options.aiConfig.ollama.configure.step3")}</li>
                <li>{_("options.aiConfig.ollama.configure.step4")}</li>
              </ol>
            </div>

            {/* 更多资源 */}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <div className="font-semibold text-gray-800 dark:text-gray-200 mb-2">
                📚 {_("options.aiConfig.ollama.resources.title")}
              </div>
              <ul className="space-y-1 text-xs">
                <li>
                  <a 
                    href="https://github.com/ollama/ollama"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    📖 {_("options.aiConfig.ollama.resources.officialDocs")}
                  </a>
                </li>
                <li>
                  <a 
                    href="https://ollama.com/library"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    🤗 {_("options.aiConfig.ollama.resources.modelLibrary")}
                  </a>
                </li>
                <li>
                  <a 
                    href="https://github.com/wxy/SilentFeed/blob/master/docs/OLLAMA_SETUP_GUIDE.md"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    📄 {_("options.aiConfig.ollama.resources.detailedGuide")}
                  </a>
                </li>
              </ul>
            </div>
          </div>

          <button
            onClick={() => setShowOllamaHelp(false)}
            className="mt-6 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {_("options.aiConfig.ollama.closeButton")}
          </button>
        </div>
      </div>,
      document.body
    )}
    </div>
  )
}