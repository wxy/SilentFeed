import { useI18n } from "@/i18n/helpers"
import { useEffect, useState } from "react"
import {
  getAIConfig,
  saveAIConfig,
  validateApiKey,
  type AIProviderType
} from "@/storage/ai-config"
import { aiManager } from "@/core/ai/AICapabilityManager"
import { checkLocalAI } from "@/utils/analysis-engine-capability"

// 本地 AI 检测结果
interface LocalAIStatus {
  hasChromeAI: boolean
  hasOllama: boolean
  checking: boolean
}

export function AIConfig() {
  const { _ } = useI18n()
  const [provider, setProvider] = useState<AIProviderType | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [monthlyBudget, setMonthlyBudget] = useState<number>(5) // 默认 $5/月
  const [enableReasoning, setEnableReasoning] = useState(false) // Phase 9: 推理能力
  const [localAIChoice, setLocalAIChoice] = useState<'none' | 'chromeAI' | 'ollama'>('none') // Phase 9: 本地 AI 三选一
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)
  
  // Phase 9: 本地 AI 检测状态
  const [localAIStatus, setLocalAIStatus] = useState<LocalAIStatus>({
    hasChromeAI: false,
    hasOllama: false,
    checking: true
  })
  const [showCostDetails, setShowCostDetails] = useState(false) // Phase 9: 成本详情浮层
  const [showChromeAIHelp, setShowChromeAIHelp] = useState(false) // Phase 9: Chrome AI 帮助浮层

  // 动态获取本地化的提供商选项
  const getProviderOptions = (): Array<{ value: AIProviderType | ""; label: string; description: string }> => [
    { value: "", label: _("options.aiConfig.providers.none.label"), description: _("options.aiConfig.providers.none.description") },
    { value: "openai", label: _("options.aiConfig.providers.openai.label"), description: _("options.aiConfig.providers.openai.description") },
    { value: "anthropic", label: _("options.aiConfig.providers.anthropic.label"), description: _("options.aiConfig.providers.anthropic.description") },
    { value: "deepseek", label: _("options.aiConfig.providers.deepseek.label"), description: _("options.aiConfig.providers.deepseek.description") }
  ]

  // 加载保存的配置
  useEffect(() => {
    getAIConfig().then((config) => {
      if (config.provider) {
        setProvider(config.provider)
        setApiKey(config.apiKey)
        setMonthlyBudget(config.monthlyBudget || 5)
        setEnableReasoning(config.enableReasoning || false) // Phase 9
      }
    })
  }, [])

  // Phase 9: 检测本地 AI 可用性
  useEffect(() => {
    const detectLocalAI = async () => {
      setLocalAIStatus(prev => ({ ...prev, checking: true }))
      try {
        const result = await checkLocalAI()
        // 解析 reason 来判断具体哪些服务可用
        const hasChromeAI = result.reason?.includes('Chrome AI') || false
        const hasOllama = result.reason?.includes('Ollama') || false
        setLocalAIStatus({
          hasChromeAI,
          hasOllama,
          checking: false
        })
      } catch (error) {
        setLocalAIStatus({ hasChromeAI: false, hasOllama: false, checking: false })
      }
    }
    detectLocalAI()
  }, [])

  // 测试连接
  const handleTest = async () => {
    if (!provider) {
      setMessage({ type: "error", text: _("options.aiConfig.errors.selectProvider") })
      return
    }
    if (!apiKey) {
      setMessage({ type: "error", text: _("options.aiConfig.errors.enterApiKey") })
      return
    }

    setIsTesting(true)
    setMessage(null)

    try {
      // 1. 先验证格式
      const isValid = validateApiKey(provider, apiKey)
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
        provider,
        apiKey: apiKey.trim(),
        enabled: true,
        monthlyBudget,
        enableReasoning // Phase 9
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
    if (!provider) {
      setMessage({ type: "error", text: _("options.aiConfig.errors.selectProviderAndKey") })
      return
    }
    if (!apiKey) {
      setMessage({ type: "error", text: _("options.aiConfig.errors.selectProviderAndKey") })
      return
    }

    setIsSaving(true)
    setMessage(null)

    try {
      await saveAIConfig({
        provider,
        apiKey,
        enabled: true,
        monthlyBudget,
        enableReasoning // Phase 9
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
        apiKey: "",
        enabled: false,
        monthlyBudget: 5,
        enableReasoning: false // Phase 9
      })
      setProvider(null)
      setApiKey("")
      setEnableReasoning(false) // Phase 9
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
        <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
          <li>✅ {_("options.aiConfig.info.withConfig")}</li>
          <li>⚡ {_("options.aiConfig.info.withoutConfig")}</li>
          <li>🔄 {_("options.aiConfig.info.fallback")}</li>
        </ul>
      </div>

      {/* 提供商选择 */}
      <div>
        <label htmlFor="ai-provider" className="block text-sm font-medium mb-2">
          {_("options.aiConfig.labels.provider")}
        </label>
        <select
          id="ai-provider"
          value={provider || ""}
          onChange={(e) => {
            const value = e.target.value
            setProvider(value === "" ? null : value as AIProviderType)
          }}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {getProviderOptions().map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {provider && (
          <p className="mt-1 text-sm text-gray-500">
            {getProviderOptions().find(opt => opt.value === provider)?.description}
          </p>
        )}
      </div>

      {/* API Key */}
      {provider && (
        <>
          <div>
            <label htmlFor="api-key" className="block text-sm font-medium mb-2">
              {_("options.aiConfig.labels.apiKey")}
            </label>
            <input
              id="api-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
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
                {provider === "deepseek" ? "¥" : "$"}
              </span>
              <input
                id="monthly-budget"
                type="number"
                min="1"
                max={provider === "deepseek" ? "500" : "100"}
                step="1"
                value={monthlyBudget}
                onChange={(e) => setMonthlyBudget(Math.max(1, Number(e.target.value)))}
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
                range: provider === "deepseek" ? "¥10-50" : "$5-10"
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
                className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <div className="flex-1">
                <label htmlFor="enable-reasoning" className="block text-sm font-medium">
                  🧠 {_("options.aiConfig.enableReasoning")}
                </label>
                <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
                  {_("options.aiConfig.reasoningHint")}
                </p>
                {enableReasoning && (
                  <p className="mt-1 text-xs text-orange-600 dark:text-orange-400 font-medium">
                    {_("options.aiConfig.reasoningWarning")}
                  </p>
                )}
                {provider === 'deepseek' && (
                  <p className="mt-1 text-xs text-green-600 dark:text-green-400">
                    ✅ {_("options.aiConfig.reasoningAvailableDeepSeek")}
                  </p>
                )}
                {provider && provider !== 'deepseek' && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    💡 {_("options.aiConfig.reasoningFutureSupport", { provider: provider.toUpperCase() })}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex gap-4">
            <button
              onClick={handleTest}
              disabled={!apiKey || isTesting || isSaving}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isTesting ? _("options.aiConfig.buttons.testing") : _("options.aiConfig.buttons.test")}
            </button>
            <button
              onClick={handleSave}
              disabled={!apiKey || isTesting || isSaving}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? _("options.aiConfig.buttons.saving") : _("options.aiConfig.buttons.save")}
            </button>
            {provider && (
              <button
                onClick={handleDisable}
                disabled={isTesting || isSaving}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {_("options.aiConfig.buttons.disable")}
              </button>
            )}
          </div>

          {/* 消息提示 */}
          {message && (
            <div
              className={`p-4 rounded-lg ${
                message.type === "success"
                  ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                  : "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
              }`}
            >
              {message.text}
            </div>
          )}
        </>
      )}

      {/* Phase 9: 本地 AI 检测状态 + 启用控制 */}
      <div className="mt-8 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold">🔒 {_("options.aiConfig.localAITitle")}</h3>
          {localAIStatus.checking && (
            <span className="text-xs text-gray-500">检测中...</span>
          )}
        </div>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          {_("options.aiConfig.localAIHint")}
        </p>
        
        {/* 本地 AI 三选一（任何时候都显示） */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {_("options.aiConfig.localAIControl.choiceTitle")}
          </p>
          <div className="space-y-2">
            {/* 不使用本地 AI（默认） */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="localAIChoice"
                value="none"
                checked={localAIChoice === 'none'}
                onChange={() => setLocalAIChoice('none')}
                className="w-4 h-4"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {_("options.aiConfig.localAIControl.none")}
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
                  onChange={() => setLocalAIChoice('chromeAI')}
                  disabled={!localAIStatus.hasChromeAI}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {_("options.aiConfig.localAIControl.chromeAI")}
                </span>
              </label>
              {localAIStatus.hasChromeAI ? (
                <span className="text-xs text-green-600 dark:text-green-400">
                  ✓ {_("options.aiConfig.localAIControl.available")}
                </span>
              ) : (
                <button
                  onClick={() => setShowChromeAIHelp(true)}
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {_("options.aiConfig.localAIControl.howToEnable")}
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
                  onChange={() => setLocalAIChoice('ollama')}
                  disabled={!localAIStatus.hasOllama}
                  className="w-4 h-4"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {_("options.aiConfig.localAIControl.ollama")}
                </span>
              </label>
              {localAIStatus.hasOllama ? (
                <span className="text-xs text-green-600 dark:text-green-400">
                  ✓ {_("options.aiConfig.localAIControl.available")}
                </span>
              ) : (
                <a
                  href="https://ollama.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {_("options.aiConfig.localAIControl.installOllama")}
                </a>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {_("options.aiConfig.localAIControl.hint")}
          </p>
        </div>
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
                  <li>• {_("options.aiConfig.cost.openai.input")}</li>
                  <li>• {_("options.aiConfig.cost.openai.output")}</li>
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