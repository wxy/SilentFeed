import { useI18n } from "@/i18n/helpers"
import { useEffect, useState } from "react"
import {
  getAIConfig,
  saveAIConfig,
  validateApiKey,
  type AIProviderType
} from "@/storage/ai-config"
import { aiManager } from "@/core/ai/AICapabilityManager"

export function AIConfig() {
  const { _ } = useI18n()
  const [provider, setProvider] = useState<AIProviderType | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [monthlyBudget, setMonthlyBudget] = useState<number>(5) // 默认 $5/月
  const [isTesting, setIsTesting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

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
      }
    })
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
        monthlyBudget
      })

      // 3. 测试连接
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
        monthlyBudget
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
        monthlyBudget: 5
      })
      setProvider(null)
      setApiKey("")
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
            <label htmlFor="monthly-budget" className="block text-sm font-medium mb-2">
              {_("options.aiConfig.budgetLabel")}
            </label>
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

      {/* 使用说明 */}
      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">{_("options.aiConfig.info.title")}</h3>
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li>• {_("options.aiConfig.info.withConfig")}</li>
          <li>• {_("options.aiConfig.info.withoutConfig")}</li>
          <li>• {_("options.aiConfig.info.fallback")}</li>
          <li>• {_("options.aiConfig.info.privacy")}</li>
        </ul>
      </div>

      {/* 成本参考 */}
      <div className="mt-8 p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">{_("options.aiConfig.cost.title")}</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-4">
          {_("options.aiConfig.cost.example")}
        </p>

        <div className="space-y-3 text-sm">
          {/* DeepSeek */}
          <div>
            <div className="font-semibold text-gray-800 dark:text-gray-200">
              {_("options.aiConfig.cost.deepseek.title")}
            </div>
            <ul className="ml-4 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
              <li>• {_("options.aiConfig.cost.deepseek.inputUncached")}</li>
              <li>• {_("options.aiConfig.cost.deepseek.inputCached")}</li>
              <li>• {_("options.aiConfig.cost.deepseek.output")}</li>
              <li className="font-medium text-blue-600 dark:text-blue-400">
                → {_("options.aiConfig.cost.deepseek.estimate")}
              </li>
            </ul>
          </div>

          {/* OpenAI */}
          <div>
            <div className="font-semibold text-gray-800 dark:text-gray-200">
              {_("options.aiConfig.cost.openai.title")}
            </div>
            <ul className="ml-4 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
              <li>• {_("options.aiConfig.cost.openai.input")}</li>
              <li>• {_("options.aiConfig.cost.openai.output")}</li>
              <li className="font-medium text-blue-600 dark:text-blue-400">
                → {_("options.aiConfig.cost.openai.estimate")}
              </li>
            </ul>
          </div>

          {/* Anthropic */}
          <div>
            <div className="font-semibold text-gray-800 dark:text-gray-200">
              {_("options.aiConfig.cost.anthropic.title")}
            </div>
            <ul className="ml-4 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
              <li>• {_("options.aiConfig.cost.anthropic.input")}</li>
              <li>• {_("options.aiConfig.cost.anthropic.output")}</li>
              <li className="font-medium text-blue-600 dark:text-blue-400">
                → {_("options.aiConfig.cost.anthropic.estimate")}
              </li>
            </ul>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-600 dark:text-gray-400">
          {_("options.aiConfig.cost.note")}
        </p>
      </div>

      {/* AI 使用场景说明 */}
      <div className="mt-8 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">🎯 {_("options.aiConfig.usageScenarios")}</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          {_("options.aiConfig.scenariosIntro")}
        </p>
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li>
            <strong className="text-purple-600 dark:text-purple-400">{_("options.aiConfig.scenarios.analysis")}</strong>
            <span className="ml-2">{_("options.aiConfig.scenarios.analysisDesc")}</span>
          </li>
          <li>
            <strong className="text-purple-600 dark:text-purple-400">{_("options.aiConfig.scenarios.profile")}</strong>
            <span className="ml-2">{_("options.aiConfig.scenarios.profileDesc")}</span>
          </li>
          <li>
            <strong className="text-purple-600 dark:text-purple-400">{_("options.aiConfig.scenarios.recommendation")}</strong>
            <span className="ml-2">{_("options.aiConfig.scenarios.recommendationDesc")}</span>
          </li>
        </ul>
      </div>

      {/* 本地 AI 配置说明 */}
      <div className="mt-8 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
        <h3 className="font-semibold mb-2">🔒 {_("options.aiConfig.localAI")}</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          {_("options.aiConfig.localAIHint")}
        </p>
        <div className="space-y-3 text-sm">
          <div>
            <div className="font-semibold text-gray-800 dark:text-gray-200">
              Ollama（推荐）
            </div>
            <ul className="ml-4 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
              <li>• {_("options.aiConfig.localAIDetails.ollama.feature1")}</li>
              <li>• {_("options.aiConfig.localAIDetails.ollama.feature2")}</li>
              <li>• {_("options.aiConfig.localAIDetails.ollama.feature3")}</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-gray-800 dark:text-gray-200">
              Chrome AI（实验性）
            </div>
            <ul className="ml-4 mt-1 space-y-1 text-gray-700 dark:text-gray-300">
              <li>• {_("options.aiConfig.localAIDetails.chromeAI.feature1")}</li>
              <li>• {_("options.aiConfig.localAIDetails.chromeAI.feature2")}</li>
              <li>• {_("options.aiConfig.localAIDetails.chromeAI.feature3")}</li>
            </ul>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
            💡 {_("options.aiConfig.localAIDetails.hint")}
          </p>
        </div>
      </div>

      {/* TF-IDF 算法引擎说明 */}
      <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
        <h3 className="font-semibold mb-2">📊 {_("options.aiConfig.algorithmEngine")}</h3>
        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
          {_("options.aiConfig.tfidf.intro")}
        </p>
        <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <li>
            <strong className="text-gray-800 dark:text-gray-200">{_("options.aiConfig.tfidf.advantage1")}</strong>
            <span className="ml-2">{_("options.aiConfig.tfidf.advantage1Desc")}</span>
          </li>
          <li>
            <strong className="text-gray-800 dark:text-gray-200">{_("options.aiConfig.tfidf.advantage2")}</strong>
            <span className="ml-2">{_("options.aiConfig.tfidf.advantage2Desc")}</span>
          </li>
          <li>
            <strong className="text-gray-800 dark:text-gray-200">{_("options.aiConfig.tfidf.advantage3")}</strong>
            <span className="ml-2">{_("options.aiConfig.tfidf.advantage3Desc")}</span>
          </li>
        </ul>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
          💡 {_("options.aiConfig.tfidf.note")}
        </p>
      </div>
    </div>
  )
}