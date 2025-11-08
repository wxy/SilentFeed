import React, { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import {
  getAIConfig,
  saveAIConfig,
  validateApiKey,
  type AIProviderType,
  type AIConfig as AIConfigData
} from "@/storage/ai-config"

/**
 * AI 配置组件
 * 
 * 功能：
 * 1. 选择 AI 提供商（OpenAI/Anthropic/DeepSeek）
 * 2. 输入和保存 API Key（加密存储）
 * 3. 测试连接
 * 4. 显示配置状态
 */

interface ProviderOption {
  value: AIProviderType | null
  label: string
  description: string
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: null,
    label: "未配置",
    description: "使用免费的关键词分析（准确度较低）"
  },
  {
    value: "openai",
    label: "OpenAI (GPT-4o-mini)",
    description: "快速、准确、成本适中（$0.15/1M tokens）"
  },
  {
    value: "anthropic",
    label: "Anthropic (Claude-3-Haiku)",
    description: "高质量、稍贵（$0.25/1M tokens）"
  },
  {
    value: "deepseek",
    label: "DeepSeek",
    description: "国内友好、最便宜（$0.14/1M tokens）"
  }
]

export function AIConfig() {
  const { _ } = useI18n()
  
  // 状态
  const [provider, setProvider] = useState<AIProviderType | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [enabled, setEnabled] = useState(false)
  const [monthlyBudget, setMonthlyBudget] = useState<number>(5) // 默认 $5/月
  
  // UI 状态
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  
  // 加载配置
  useEffect(() => {
    loadConfig()
  }, [])
  
  /**
   * 从存储加载配置
   */
  async function loadConfig() {
    try {
      const config = await getAIConfig()
      setProvider(config.provider)
      setApiKey(config.apiKey || "")
      setEnabled(config.enabled)
      setMonthlyBudget(config.monthlyBudget ?? 5)
    } catch (error) {
      console.error("[AIConfig] Failed to load config:", error)
    }
  }
  
  /**
   * 保存配置
   */
  async function handleSave() {
    if (!provider || !apiKey.trim()) {
      setTestResult({
        success: false,
        message: "请选择提供商并输入 API Key"
      })
      return
    }
    
    setSaving(true)
    setTestResult(null)
    
    try {
      const config: AIConfigData = {
        provider,
        apiKey: apiKey.trim(),
        enabled: true,
        monthlyBudget
      }
      
      await saveAIConfig(config)
      
      setTestResult({
        success: true,
        message: "配置保存成功！"
      })
    } catch (error) {
      setTestResult({
        success: false,
        message: `保存失败：${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setSaving(false)
    }
  }
  
  /**
   * 测试连接
   */
  async function handleTestConnection() {
    if (!provider || !apiKey.trim()) {
      setTestResult({
        success: false,
        message: "请先选择提供商并输入 API Key"
      })
      return
    }
    
    setTesting(true)
    setTestResult(null)
    
    try {
      // TODO: 实际测试 API 连接
      // 现在只是简单验证格式
      const isValid = validateApiKey(provider, apiKey)
      
      if (isValid) {
        setTestResult({
          success: true,
          message: "API Key 格式正确（实际连接测试将在 Sprint 2 实现）"
        })
      } else {
        setTestResult({
          success: false,
          message: "API Key 格式不正确"
        })
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: `测试失败：${error instanceof Error ? error.message : String(error)}`
      })
    } finally {
      setTesting(false)
    }
  }
  
  // validateApiKey 函数已从 ai-config.ts 导入，这里不需要重复定义
  
  /**
   * 禁用 AI
   */
  async function handleDisable() {
    try {
      await saveAIConfig({
        provider: null,
        apiKey: "",
        enabled: false
      })
      
      setProvider(null)
      setApiKey("")
      setEnabled(false)
      setTestResult({
        success: true,
        message: "已禁用 AI，将使用关键词分析"
      })
    } catch (error) {
      setTestResult({
        success: false,
        message: `禁用失败：${error instanceof Error ? error.message : String(error)}`
      })
    }
  }
  
  return (
    <div className="ai-config space-y-6 p-6">
      {/* 标题 */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
          🤖 AI 配置
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          配置远程 AI 服务以获得更准确的内容分析
        </p>
      </div>
      
      {/* Provider 选择 */}
      <div className="space-y-2">
        <label
          htmlFor="provider"
          className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          AI 提供商
        </label>
        
        <select
          id="provider"
          value={provider || ""}
          onChange={(e) => setProvider((e.target.value as AIProviderType) || null)}
          className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100">
          {PROVIDER_OPTIONS.map((option) => (
            <option key={option.value || "none"} value={option.value || ""}>
              {option.label}
            </option>
          ))}
        </select>
        
        {/* Provider 说明 */}
        {provider && (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {PROVIDER_OPTIONS.find((o) => o.value === provider)?.description}
          </p>
        )}
      </div>
      
      {/* API Key 输入 */}
      {provider && (
        <div className="space-y-2">
          <label
            htmlFor="apiKey"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            API Key
          </label>
          
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={`输入你的 ${PROVIDER_OPTIONS.find((o) => o.value === provider)?.label} API Key`}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
          />
          
          <p className="text-xs text-gray-500 dark:text-gray-400">
            API Key 将加密存储在浏览器本地，不会上传到服务器
          </p>
        </div>
      )}
      
      {/* 预算控制 */}
      {provider && (
        <div className="space-y-2">
          <label
            htmlFor="budget"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            月度预算限制
          </label>
          
          <div className="flex items-center gap-2">
            <span className="text-gray-600 dark:text-gray-400">$</span>
            <input
              id="budget"
              type="number"
              min="1"
              max="100"
              step="1"
              value={monthlyBudget}
              onChange={(e) => setMonthlyBudget(Math.max(1, Number(e.target.value)))}
              className="w-32 rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              / 月
            </span>
          </div>
          
          <p className="text-xs text-gray-500 dark:text-gray-400">
            💡 超出预算后将自动降级到免费的关键词分析
          </p>
          <p className="text-xs text-orange-600 dark:text-orange-400">
            ⚠️ 建议设置合理预算以避免意外费用（推荐 $5-10）
          </p>
        </div>
      )}
      
      {/* 操作按钮 */}
      <div className="flex gap-3">
        {provider && (
          <>
            <button
              onClick={handleTestConnection}
              disabled={testing || !apiKey.trim()}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
              {testing ? "测试中..." : "测试连接"}
            </button>
            
            <button
              onClick={handleSave}
              disabled={saving || !apiKey.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
              {saving ? "保存中..." : "保存配置"}
            </button>
            
            {enabled && (
              <button
                onClick={handleDisable}
                className="rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200 dark:bg-red-900 dark:text-red-300 dark:hover:bg-red-800">
                禁用 AI
              </button>
            )}
          </>
        )}
      </div>
      
      {/* 测试结果 */}
      {testResult && (
        <div
          className={`rounded-lg p-4 ${
            testResult.success
              ? "bg-green-50 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-red-50 text-red-800 dark:bg-red-900 dark:text-red-200"
          }`}>
          <p className="text-sm">
            {testResult.success ? "✅" : "❌"} {testResult.message}
          </p>
        </div>
      )}
      
      {/* 提示信息 */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900">
        <h3 className="font-medium text-blue-900 dark:text-blue-100">
          ℹ️ 关于 AI 分析
        </h3>
        <ul className="mt-2 space-y-1 text-sm text-blue-800 dark:text-blue-200">
          <li>
            • <strong>配置后</strong>：优先使用 AI 分析（更准确，需付费）
          </li>
          <li>
            • <strong>不配置</strong>：使用免费的关键词分析（可用但准确度较低）
          </li>
          <li>
            • <strong>降级策略</strong>：API 失败或超预算时自动降级到关键词分析
          </li>
          <li>
            • <strong>隐私保护</strong>：所有数据处理在本地，API Key 加密存储
          </li>
        </ul>
      </div>
      
      {/* 成本参考 */}
      {provider && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="font-medium text-gray-900 dark:text-gray-100">
            💰 成本参考
          </h3>
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">
            假设每天浏览 50 个页面，每个页面平均 1000 tokens：
          </p>
          <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-400">
            <li>• OpenAI: 约 $0.50 / 月</li>
            <li>• Anthropic: 约 $0.75 / 月</li>
            <li>• DeepSeek: 约 $0.20 / 月</li>
          </ul>
        </div>
      )}
    </div>
  )
}
