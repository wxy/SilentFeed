/**
 * 推荐设置组件
 * Phase 6: 推荐引擎配置界面
 * 
 * 设计理念：简洁实用，合并统计信息
 */

import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  getRecommendationConfig,
  saveRecommendationConfig,
  type RecommendationConfig
} from "@/storage/recommendation-config"
import { getAdaptiveMetrics, type AdaptiveMetrics } from "@/core/recommender/adaptive-count"
import { useRecommendationStore } from "@/stores/recommendationStore"
import { logger } from "@/utils/logger"

const recSettingsLogger = logger.withTag("RecommendationSettings")

export function RecommendationSettings() {
  const { t: _ } = useTranslation()
  const { generateRecommendations, isLoading: isGenerating } = useRecommendationStore()
  const [config, setConfig] = useState<RecommendationConfig>({
    useReasoning: false,
    useLocalAI: false,
    maxRecommendations: 3,
    batchSize: 1,
    qualityThreshold: 0.6,
    tfidfThreshold: 0.1
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
  }, [])

  const loadConfig = async () => {
    try {
      const loaded = await getRecommendationConfig()
      setConfig(loaded)
    } catch (error) {
      recSettingsLogger.error("加载配置失败:", error)
    }
  }

  const loadMetrics = async () => {
    try {
      const loaded = await getAdaptiveMetrics()
      setMetrics(loaded)
    } catch (error) {
      recSettingsLogger.error("加载指标失败:", error)
    }
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      await saveRecommendationConfig(config)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (error) {
      recSettingsLogger.error("保存失败:", error)
      alert("保存失败，请重试")
    } finally {
      setIsSaving(false)
    }
  }

  const handleGenerateRecommendations = async () => {
    try {
      await generateRecommendations()
    } catch (error) {
      recSettingsLogger.error("生成推荐失败:", error)
    }
  }

  const handleResetRecommendations = async () => {
    if (!confirm(_("options.recommendation.resetConfirm"))) {
      return
    }

    try {
      const { resetRecommendationData } = await import("@/storage/db")
      await resetRecommendationData()
      
      // 重新加载统计数据
      await loadMetrics()
      
      alert(_("options.recommendation.resetSuccess"))
    } catch (error) {
      recSettingsLogger.error("重置推荐数据失败:", error)
      alert(_("options.recommendation.resetFailed", { error: String(error) }))
    }
  }

  return (
    <div className="space-y-6">
      {/* 推荐设置 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">{_("options.recommendation.title")}</h3>
          
          {/* 当前推荐模式指示 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">{_("options.recommendation.currentMode")}</span>
            {config.useReasoning ? (
              <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-sm font-medium">
                {_("options.recommendation.reasoningAI")}
              </span>
            ) : (
              <span className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 rounded text-sm font-medium">
                {_("options.recommendation.standardAI")}
              </span>
            )}
          </div>
        </div>
        
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
              <div className="font-medium">{_("options.recommendation.enableReasoning")}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {_("options.recommendation.reasoningDesc")}
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
              <div className="font-medium">{_("options.recommendation.useLocalAI")}</div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {_("options.recommendation.localAIDesc")}
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
        <h3 className="text-lg font-medium mb-3">{_("options.recommendation.smartCount")}</h3>
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">{_("options.recommendation.currentCount")}</span>
            <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              {_("options.recommendation.countItems", { count: config.maxRecommendations })}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
            {_("options.recommendation.countHint")}
          </p>
        </div>
      </div>

      {/* 推荐统计 */}
      {metrics && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium">{_("options.recommendation.stats")}</h3>
            <button
              onClick={handleResetRecommendations}
              className="px-3 py-1 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
              title={_("options.recommendation.resetDataTitle")}
            >
              {_("options.recommendation.resetData")}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {metrics.totalRecommendations}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {_("options.recommendation.totalRecommendations")}
              </div>
            </div>
            
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {metrics.clickCount}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {_("options.recommendation.readCount")}
              </div>
            </div>
            
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-700 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {metrics.dismissCount}
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {_("options.recommendation.dismissCount")}
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
          {isSaving ? _("options.recommendation.saving") : _("options.recommendation.save")}
        </button>

        <button
          onClick={handleGenerateRecommendations}
          disabled={isGenerating}
          className="px-6 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
        >
          {isGenerating ? _("options.recommendation.generating") : _("options.recommendation.generateNow")}
        </button>

        {saveSuccess && (
          <span className="text-green-600 dark:text-green-400 text-sm">
            {_("options.recommendation.saveSuccess")}
          </span>
        )}
      </div>
    </div>
  )
}
