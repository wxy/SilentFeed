/**
 * 推荐设置组件
 * Phase 6: 推荐引擎配置界面
 * 
 * 设计理念：简洁实用，合并统计信息
 */

import { useState, useEffect } from "react"
import {
  getRecommendationConfig,
  saveRecommendationConfig,
  type RecommendationConfig
} from "@/storage/recommendation-config"
import { getAdaptiveMetrics, type AdaptiveMetrics } from "@/core/recommender/adaptive-count"
import type { NotificationConfig } from "@/core/recommender/notification"

export function RecommendationSettings() {
  const [config, setConfig] = useState<RecommendationConfig>({
    useReasoning: false,
    useLocalAI: false,
    maxRecommendations: 3
  })
  const [notificationConfig, setNotificationConfig] = useState<NotificationConfig>({
    enabled: true,
    quietHours: {
      start: 22,
      end: 8
    },
    minInterval: 60
  })
  const [metrics, setMetrics] = useState<AdaptiveMetrics | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  
  // TODO: Phase 6.2 - 检查AI配置状态
  // const [hasAIConfig, setHasAIConfig] = useState(false)
  // const [hasLocalAI, setHasLocalAI] = useState(false)

  useEffect(() => {
    loadConfig()
    loadMetrics()
    loadNotificationConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const loaded = await getRecommendationConfig()
      setConfig(loaded)
    } catch (error) {
      console.error("[推荐设置] 加载配置失败:", error)
    }
  }

  const loadNotificationConfig = async () => {
    try {
      const result = await chrome.storage.local.get("notification-config")
      if (result["notification-config"]) {
        setNotificationConfig(result["notification-config"])
      }
    } catch (error) {
      console.error("[推荐设置] 加载通知配置失败:", error)
    }
  }

  const loadMetrics = async () => {
    try {
      const loaded = await getAdaptiveMetrics()
      setMetrics(loaded)
    } catch (error) {
      console.error("[推荐设置] 加载指标失败:", error)
    }
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      await saveRecommendationConfig(config)
      await chrome.storage.local.set({ "notification-config": notificationConfig })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (error) {
      console.error("[推荐设置] 保存失败:", error)
      alert("保存失败，请重试")
    } finally {
      setIsSaving(false)
    }
  }

  const handleTestNotification = async () => {
    try {
      console.log("[推荐设置] 触发测试通知...")
      const response = await chrome.runtime.sendMessage({ type: "TEST_NOTIFICATION" })
      
      if (response.success) {
        console.log("[推荐设置] ✅ 测试通知已发送")
        alert("✅ 测试通知已发送！请检查系统通知中心")
      } else {
        console.error("[推荐设置] ❌ 测试通知失败:", response.error)
        alert("❌ 测试通知失败，请查看控制台")
      }
    } catch (error) {
      console.error("[推荐设置] 测试通知异常:", error)
      alert("❌ 测试通知失败: " + String(error))
    }
  }

  return (
    <div className="space-y-6">
      {/* 推荐设置 */}
      <div>
        <h3 className="text-lg font-medium mb-4">推荐设置</h3>
        
        <div className="space-y-3">
          {/* 推理模式 - TODO: 检查AI配置后启用禁用逻辑 */}
          <label className="flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={config.useReasoning}
              onChange={(e) => setConfig({ ...config, useReasoning: e.target.checked })}
              className="mt-1"
              // disabled={!hasAIConfig} // TODO: Phase 6.2 - 未配置AI时禁用
            />
            <div className="flex-1">
              <div className="font-medium">🧠 启用推理模式</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                使用 DeepSeek-R1 等推理模型，生成更深入的推荐理由（成本 2-5倍）
              </div>
              {/* TODO: Phase 6.2 - 显示未配置提示
              {!hasAIConfig && (
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  ⚠️ 需要先在 AI 设置中配置 API
                </div>
              )}
              */}
            </div>
          </label>

          {/* 本地 AI - TODO: 检查本地AI能力后启用禁用逻辑 */}
          <label className="flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={config.useLocalAI}
              onChange={(e) => setConfig({ ...config, useLocalAI: e.target.checked })}
              className="mt-1"
              // disabled={!hasLocalAI} // TODO: Phase 6.2 - 未检测到本地AI时禁用
            />
            <div className="flex-1">
              <div className="font-medium">🔒 使用本地 AI</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                使用 Ollama 或 Chrome AI，隐私保护但占用性能
              </div>
              {/* TODO: Phase 6.2 - 显示未检测到提示
              {!hasLocalAI && (
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                  ⚠️ 未检测到本地 AI 服务
                </div>
              )}
              */}
            </div>
          </label>
        </div>
      </div>

      {/* 智能推荐数量 */}
      <div>
        <h3 className="text-lg font-medium mb-3">智能推荐数量</h3>
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">当前推荐数量</span>
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {config.maxRecommendations} 条
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
            系统根据点击率、不想读率和弹窗打开频率自动调整（1-5条）
          </p>
        </div>
      </div>

      {/* 通知设置 */}
      <div>
        <h3 className="text-lg font-medium mb-4">推荐通知</h3>
        
        <div className="space-y-3">
          {/* 启用通知 */}
          <label className="flex items-start gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
            <input
              type="checkbox"
              checked={notificationConfig.enabled}
              onChange={(e) => setNotificationConfig({ ...notificationConfig, enabled: e.target.checked })}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="font-medium">🔔 启用推荐通知</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                当有新推荐时发送系统通知（克制设计，不会过度打扰）
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                💡 Chrome 扩展通知无需额外授权。如果看不到通知，请检查系统通知设置（macOS 用户需打开通知中心侧边栏）
              </div>
            </div>
          </label>

          {/* 静默时段 */}
          {notificationConfig.enabled && (
            <div className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800">
              <div className="font-medium mb-3">🌙 静默时段</div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">开始时间</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={notificationConfig.quietHours?.start || 22}
                    onChange={(e) => setNotificationConfig({
                      ...notificationConfig,
                      quietHours: {
                        ...notificationConfig.quietHours!,
                        start: parseInt(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-sm text-gray-600 dark:text-gray-400 block mb-1">结束时间</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={notificationConfig.quietHours?.end || 8}
                    onChange={(e) => setNotificationConfig({
                      ...notificationConfig,
                      quietHours: {
                        ...notificationConfig.quietHours!,
                        end: parseInt(e.target.value)
                      }
                    })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                在此时段不发送通知（24小时制）
              </p>
            </div>
          )}

          {/* 测试通知按钮 */}
          {notificationConfig.enabled && (
            <button
              onClick={handleTestNotification}
              className="w-full px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors text-sm"
              title="测试推荐通知功能"
            >
              🔔 测试通知
            </button>
          )}
        </div>
      </div>

      {/* 推荐统计 */}
      {metrics && (
        <div>
          <h3 className="text-lg font-medium mb-3">推荐统计</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {metrics.totalRecommendations}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                推荐总数
              </div>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {metrics.clickCount}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                阅读数
              </div>
            </div>
            
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {metrics.dismissCount}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                不想读
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 保存按钮 */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
        >
          {isSaving ? "保存中..." : "保存设置"}
        </button>

        {saveSuccess && (
          <span className="text-green-600 dark:text-green-400 text-sm">
            ✓ 保存成功
          </span>
        )}
      </div>
    </div>
  )
}
