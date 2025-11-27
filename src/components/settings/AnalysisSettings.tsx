/**
 * 分析配置组件
 * Phase 9: 统一管理推荐系统和订阅源的分析引擎配置
 * 
 * 设计理念：
 * - AI 引擎（AIConfig）：定义 AI 能力（API、本地AI、推理）
 * - 分析配置（本组件）：选择如何使用 AI（推荐用什么、订阅源用什么）
 */

import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import {
  getRecommendationConfig,
  saveRecommendationConfig,
  type RecommendationConfig
} from "@/storage/recommendation-config"
import type { RecommendationAnalysisEngine, FeedAnalysisEngine, AnalysisEngineCapability } from "@/types/analysis-engine"
import { checkEngineCapability } from "@/utils/analysis-engine-capability"
import { getAdaptiveMetrics, type AdaptiveMetrics } from "@/core/recommender/adaptive-count"
import { logger } from "@/utils/logger"
import { getPageCount } from "@/storage/db"
import { LEARNING_COMPLETE_PAGES } from "@/constants/progress"

const recSettingsLogger = logger.withTag("AnalysisConfig")

export function AnalysisSettings() {
  const { t: _ } = useTranslation()
  const [config, setConfig] = useState<RecommendationConfig>({
    analysisEngine: 'remoteAI',
    feedAnalysisEngine: 'remoteAI', // Phase 9: 订阅源分析引擎
    useReasoning: false, // deprecated, 保留向后兼容
    useLocalAI: false,   // deprecated, 保留向后兼容
    maxRecommendations: 3,
    batchSize: 1,
    qualityThreshold: 0.6,
    tfidfThreshold: 0.1
  })
  const [metrics, setMetrics] = useState<AdaptiveMetrics | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isLearningStage, setIsLearningStage] = useState(false)
  const [pageCount, setPageCount] = useState(0)
  
  // Phase 9: 订阅源的默认分析引擎
  const [feedAnalysisEngine, setFeedAnalysisEngine] = useState<FeedAnalysisEngine>('remoteAI')
  
  // Phase 9: 引擎可用性状态
  const [engineCapability, setEngineCapability] = useState<Record<RecommendationAnalysisEngine | 'keyword', AnalysisEngineCapability>>({
    remoteAI: { available: false },
    remoteAIWithReasoning: { available: false },
    localAI: { available: false },
    keyword: { available: true, reason: 'TF-IDF' }
  })

  const getCapabilityStatus = (capability?: AnalysisEngineCapability): string | undefined => {
    if (!capability?.details || typeof capability.details !== 'object') {
      return undefined
    }
    const status = (capability.details as { status?: unknown }).status
    return typeof status === 'string' ? status : undefined
  }

  useEffect(() => {
    loadConfig()
    loadMetrics()
    checkEngineAvailability()
    checkLearningStage()
  }, [])
  
  /**
   * 检查是否处于学习阶段
   */
  const checkLearningStage = async () => {
    try {
      const currentPageCount = await getPageCount()
      setPageCount(currentPageCount)
      setIsLearningStage(currentPageCount < LEARNING_COMPLETE_PAGES)
    } catch (error) {
      recSettingsLogger.error('检查学习阶段失败:', error)
    }
  }

  /**
   * Phase 9: 检测各引擎的可用性
   */
  const checkEngineAvailability = async () => {
    const [remoteAI, remoteAIWithReasoning, localAI, keyword] = await Promise.all([
      checkEngineCapability('remoteAI'),
      checkEngineCapability('remoteAIWithReasoning'),
      checkEngineCapability('localAI'),
      checkEngineCapability('keyword')
    ])
    
    setEngineCapability({
      remoteAI,
      remoteAIWithReasoning,
      localAI,
      keyword
    })
  }

  const loadConfig = async () => {
    try {
      const loaded = await getRecommendationConfig()
      setConfig(loaded)
      setFeedAnalysisEngine(loaded.feedAnalysisEngine || 'remoteAI')
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
      await saveRecommendationConfig({
        ...config,
        feedAnalysisEngine
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch (error) {
      recSettingsLogger.error("保存失败:", error)
      alert("保存失败，请重试")
    } finally {
      setIsSaving(false)
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

  const localEngineStatus = getCapabilityStatus(engineCapability.localAI)
  const localUnavailableMessage = (() => {
    switch (localEngineStatus) {
      case 'not-enabled':
        return _("options.analysisEngine.localAIStatus.notEnabled")
      case 'missing-endpoint':
        return _("options.analysisEngine.localAIStatus.missingEndpoint")
      case 'missing-model':
        return _("options.analysisEngine.localAIStatus.missingModel")
      case 'ollama-offline':
        return _("options.analysisEngine.localAIStatus.ollamaOffline")
      case 'chrome-ai-offline':
        return _("options.analysisEngine.localAIStatus.chromeOffline")
      default:
        return _("options.analysisEngine.localAIStatus.generic")
    }
  })()
  const isLocalAvailable = engineCapability.localAI.available
  const showLocalSelectionWarning = config.analysisEngine === 'localAI' && !isLocalAvailable
  const showFeedLocalWarning = feedAnalysisEngine === 'localAI' && !isLocalAvailable

  return (
    <div className="space-y-6">
      {/* 文章推荐引擎 */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium">{_("options.analysisEngine.recommendationTitle")}</h3>
          
          {/* 当前推荐引擎指示 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">{_("options.recommendation.currentMode")}</span>
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-sm font-medium">
              {_(`options.analysisEngine.options.${config.analysisEngine}`)}
            </span>
          </div>
        </div>
        
        {/* Phase 9: 分析引擎选择（4选1单选） */}
        <div className="space-y-3">
          {/* 远程 AI（标准） */}
          <label className={`flex items-start gap-4 p-4 border-2 rounded-lg transition-all cursor-pointer ${
            config.analysisEngine === 'remoteAI'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          } ${!engineCapability.remoteAI.available ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="radio"
              name="analysisEngine"
              value="remoteAI"
              checked={config.analysisEngine === 'remoteAI'}
              onChange={(e) => setConfig({ ...config, analysisEngine: e.target.value as RecommendationAnalysisEngine })}
              disabled={!engineCapability.remoteAI.available}
              className="mt-1 w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {_("options.analysisEngine.options.remoteAI")}
                {config.analysisEngine === 'remoteAI' && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-blue-500 text-white rounded">{_("options.analysisEngine.currentLabel")}</span>
                )}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {_("options.analysisEngine.desc.remoteAI")}
              </div>
              {!engineCapability.remoteAI.available && (
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-2 flex items-start gap-1">
                  <span>⚠️</span>
                  <span>{_("options.analysisEngine.unavailable.remoteAI")}</span>
                </div>
              )}
            </div>
          </label>

          {/* 远程 AI（推理模式） */}
          <label className={`flex items-start gap-4 p-4 border-2 rounded-lg transition-all cursor-pointer ${
            config.analysisEngine === 'remoteAIWithReasoning'
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-md'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          } ${!engineCapability.remoteAIWithReasoning.available ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="radio"
              name="analysisEngine"
              value="remoteAIWithReasoning"
              checked={config.analysisEngine === 'remoteAIWithReasoning'}
              onChange={(e) => setConfig({ ...config, analysisEngine: e.target.value as RecommendationAnalysisEngine })}
              disabled={!engineCapability.remoteAIWithReasoning.available}
              className="mt-1 w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {_("options.analysisEngine.options.remoteAIWithReasoning")}
                {config.analysisEngine === 'remoteAIWithReasoning' && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-purple-500 text-white rounded">{_("options.analysisEngine.currentLabel")}</span>
                )}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {_("options.analysisEngine.desc.remoteAIWithReasoning")}
              </div>
              {!engineCapability.remoteAIWithReasoning.available && (
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-2 flex items-start gap-1">
                  <span>⚠️</span>
                  <span>{_("options.analysisEngine.unavailable.remoteAIWithReasoning")}</span>
                </div>
              )}
            </div>
          </label>

          {/* 本地 AI */}
          <label className={`flex items-start gap-4 p-4 border-2 rounded-lg transition-all cursor-pointer ${
            config.analysisEngine === 'localAI'
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20 shadow-md'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          } ${!engineCapability.localAI.available ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="radio"
              name="analysisEngine"
              value="localAI"
              checked={config.analysisEngine === 'localAI'}
              onChange={(e) => setConfig({ ...config, analysisEngine: e.target.value as RecommendationAnalysisEngine })}
              disabled={!engineCapability.localAI.available}
              className="mt-1 w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {_("options.analysisEngine.options.localAI")}
                {config.analysisEngine === 'localAI' && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-green-500 text-white rounded">{_("options.analysisEngine.currentLabel")}</span>
                )}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {_("options.analysisEngine.desc.localAI")}
              </div>
              {!isLocalAvailable && (
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-2 flex items-start gap-1">
                  <span>⚠️</span>
                  <span>{localUnavailableMessage}</span>
                </div>
              )}
            </div>
          </label>

        </div>
        {showLocalSelectionWarning && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <div className="text-sm text-amber-800 dark:text-amber-200 font-medium">
              {_("options.analysisEngine.localAINotReadyTitle")}
            </div>
            <div className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              {localUnavailableMessage}
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {_("options.analysisEngine.localAINotReadyHint")}
            </div>
          </div>
        )}
        
        {/* 无可用 AI 时的提示 */}
        {!engineCapability.remoteAI.available && !engineCapability.remoteAIWithReasoning.available && !engineCapability.localAI.available && (
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div className="flex-1">
                <div className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                  {_("options.analysisEngine.noAIAvailable.title")}
                </div>
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  {_("options.analysisEngine.noAIAvailable.description")}
                </div>
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  💡 {_("options.analysisEngine.noAIAvailable.hint")}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {_("options.analysisEngine.hint.recommendation")}
        </p>
      </div>

      {/* Phase 9: 文章分析引擎配置 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium">{_("options.analysisEngine.feedTitle")}</h3>
          
          {/* 当前分析引擎指示 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">{_("options.recommendation.currentMode")}</span>
            <span className="px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded text-sm font-medium">
              {_(`options.analysisEngine.options.${feedAnalysisEngine}`)}
            </span>
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {_("options.analysisEngine.feedDescription")}
        </p>
        
        <div className="space-y-3">
          {/* 远程 AI */}
          <label className={`flex items-start gap-4 p-4 border-2 rounded-lg transition-all cursor-pointer ${
            feedAnalysisEngine === 'remoteAI'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          } ${!engineCapability.remoteAI.available ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="radio"
              name="feedAnalysisEngine"
              value="remoteAI"
              checked={feedAnalysisEngine === 'remoteAI'}
              onChange={(e) => setFeedAnalysisEngine(e.target.value as FeedAnalysisEngine)}
              disabled={!engineCapability.remoteAI.available}
              className="mt-1 w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {_("options.analysisEngine.options.remoteAI")}
                {feedAnalysisEngine === 'remoteAI' && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-blue-500 text-white rounded">{_("options.analysisEngine.currentLabel")}</span>
                )}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {_("options.analysisEngine.desc.remoteAI")}
              </div>
              {!engineCapability.remoteAI.available && (
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-2 flex items-start gap-1">
                  <span>⚠️</span>
                  <span>{_("options.analysisEngine.unavailable.remoteAI")}</span>
                </div>
              )}
            </div>
          </label>

          {/* 本地 AI */}
          <label className={`flex items-start gap-4 p-4 border-2 rounded-lg transition-all cursor-pointer ${
            feedAnalysisEngine === 'localAI'
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20 shadow-md'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          } ${!engineCapability.localAI.available ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <input
              type="radio"
              name="feedAnalysisEngine"
              value="localAI"
              checked={feedAnalysisEngine === 'localAI'}
              onChange={(e) => setFeedAnalysisEngine(e.target.value as FeedAnalysisEngine)}
              disabled={!engineCapability.localAI.available}
              className="mt-1 w-4 h-4"
            />
            <div className="flex-1">
              <div className="font-semibold text-gray-900 dark:text-gray-100">
                {_("options.analysisEngine.options.localAI")}
                {feedAnalysisEngine === 'localAI' && (
                  <span className="ml-2 text-xs px-2 py-0.5 bg-green-500 text-white rounded">{_("options.analysisEngine.currentLabel")}</span>
                )}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {_("options.analysisEngine.desc.localAI")}
              </div>
              {!isLocalAvailable && (
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-2 flex items-start gap-1">
                  <span>⚠️</span>
                  <span>{localUnavailableMessage}</span>
                </div>
              )}
            </div>
          </label>
        </div>
        {showFeedLocalWarning && (
          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <div className="text-sm text-amber-800 dark:text-amber-200 font-medium">
              {_("options.analysisEngine.localAINotReadyTitle")}
            </div>
            <div className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              {localUnavailableMessage}
            </div>
            <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
              {_("options.analysisEngine.localAINotReadyHint")}
            </div>
          </div>
        )}
        
        {/* 无可用 AI 时的提示 */}
        {!engineCapability.remoteAI.available && !engineCapability.localAI.available && (
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-xl">⚠️</span>
              <div className="flex-1">
                <div className="font-medium text-amber-900 dark:text-amber-100 mb-1">
                  {_("options.analysisEngine.noAIAvailable.title")}
                </div>
                <div className="text-sm text-amber-700 dark:text-amber-300">
                  {_("options.analysisEngine.noAIAvailable.description")}
                </div>
                <div className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                  💡 {_("options.analysisEngine.noAIAvailable.hint")}
                </div>
              </div>
            </div>
          </div>
        )}
        
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          {_("options.analysisEngine.hint.feed")}
        </p>
      </div>

      {/* 智能推荐数量 */}
      <div>
        <h3 className="text-lg font-medium mb-3">{_("options.recommendation.smartCount")}</h3>
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
                  {_("options.recommendation.learningStageHint", { current: pageCount, total: LEARNING_COMPLETE_PAGES })}
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  {_("options.recommendation.learningStageNote")}
                </p>
              </div>
            </div>
          </div>
        ) : (
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
        )}
      </div>

      {/* 保存按钮 */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-colors"
        >
          {isSaving ? _("options.recommendation.saving") : _("options.recommendation.save")}
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
