import { useI18n } from "@/i18n/helpers"
import { useState, useEffect } from "react"
import {
  AI_ENGINE_PRESETS,
  getDefaultEngineAssignment,
  type AIEngineAssignment,
  type PresetName,
  type AIEngineConfig
} from "@/types/ai-engine-assignment"
import {
  hasAnyAIAvailable,
  getRecommendedPreset,
  saveAIConfig,
  getAIConfig,
  type AIAvailabilityStatus
} from "@/storage/ai-config"
import { saveProviderStatus, getAllProviderStatus, type AIProvidersStatus } from "@/storage/ai-provider-status"

interface AIEngineAssignmentProps {
  value: AIEngineAssignment
  onChange: (assignment: AIEngineAssignment) => void
  disabled?: boolean
}

/**
 * AI 引擎分配配置组件
 * Phase 8: 为不同用途分配不同的 AI 引擎
 */
export function AIEngineAssignmentComponent({
  value,
  onChange,
  disabled = false
}: AIEngineAssignmentProps) {
  const { _ } = useI18n()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<PresetName | "custom">("intelligence")
  const [aiStatus, setAiStatus] = useState<AIAvailabilityStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 检测 AI 可用性并处理预设切换
  // 考虑配置和实际测试结果两个维度
  const checkAIStatusAndAdjustPreset = async () => {
    try {
      // 获取配置状态
      const configStatus = await hasAnyAIAvailable()
      
      // 获取实际测试状态
      const providerStatuses = await getAllProviderStatus()
      
      // 增强的可用性判断：配置存在 AND (未测试 OR 测试通过)
      // 远程 AI：检查每个配置的 provider
      const availableRemoteProviders = configStatus.remoteProviders.filter(provider => {
        const status = providerStatuses[provider]
        // 如果没有测试记录，假设可用（用户刚配置）
        // 如果有测试记录，检查是否可用
        return !status || status.available !== false
      })
      const hasRemoteActual = availableRemoteProviders.length > 0
      
      // 本地 AI：检查 ollama 状态
      const ollamaStatus = providerStatuses['ollama']
      // 如果配置了本地 AI，且（未测试 OR 测试通过），则可用
      const hasLocalActual = configStatus.hasLocal && (!ollamaStatus || ollamaStatus.available !== false)
      
      // 构建实际可用状态
      const actualStatus: AIAvailabilityStatus = {
        hasAny: hasRemoteActual || hasLocalActual,
        hasRemote: hasRemoteActual,
        hasLocal: hasLocalActual,
        remoteProviders: availableRemoteProviders
      }
      
      const previousStatus = aiStatus
      setAiStatus(actualStatus)
      
      // 如果有 AI 且当前未选择预设，自动选择推荐预设
      if (actualStatus.hasAny && selectedPreset === "custom") {
        const recommended = await getRecommendedPreset()
        if (recommended) {
          // 验证推荐的预设是否实际可用
          const presetAvailable = 
            (recommended === 'privacy' && actualStatus.hasLocal) ||
            ((recommended === 'intelligence' || recommended === 'economic') && actualStatus.hasRemote)
          
          if (presetAvailable) {
            setSelectedPreset(recommended)
          }
        }
      }
      
      // 检查当前选中的预设是否仍然可用
      // 如果不可用，自动切换到其他可用预设
      if (previousStatus && selectedPreset !== "custom") {
        const presetRequirements = {
          privacy: actualStatus.hasLocal,
          intelligence: actualStatus.hasRemote,
          economic: actualStatus.hasRemote
        }
        
        const currentPresetAvailable = presetRequirements[selectedPreset as PresetName]
        
        if (!currentPresetAvailable) {
          // 当前预设不可用，寻找替代方案
          let newPreset: PresetName | null = null
          
          if (actualStatus.hasRemote) {
            // 优先选择智能优先
            newPreset = 'intelligence'
          } else if (actualStatus.hasLocal) {
            // 否则选择隐私优先
            newPreset = 'privacy'
          }
          
          if (newPreset) {
            await handlePresetSelect(newPreset)
          } else {
            // 没有可用的预设，切换到自定义
            setSelectedPreset('custom')
          }
        }
      }
      
      return actualStatus
    } catch (error) {
      console.error('检测 AI 状态失败:', error)
      return null
    }
  }

  // 初始加载时检测 AI 可用性
  useEffect(() => {
    const loadInitialStatus = async () => {
      setIsLoading(true)
      await checkAIStatusAndAdjustPreset()
      setIsLoading(false)
    }
    
    loadInitialStatus()
  }, [])

  // 监听 storage 变化，实时更新 AI 可用性状态
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      // 监听 AI 配置变化（sync 区域）
      if (areaName === 'sync' && changes.aiConfig) {
        checkAIStatusAndAdjustPreset()
      }
      // 监听 provider 状态变化（local 区域，key 是 aiProvidersStatus）
      if (areaName === 'local' && changes.aiProvidersStatus) {
        checkAIStatusAndAdjustPreset()
      }
    }
    
    chrome.storage.onChanged.addListener(handleStorageChange)
    
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [selectedPreset, aiStatus]) // 依赖 selectedPreset 和 aiStatus 以便在切换时能正确判断

  // 初始化时检测当前配置匹配的预设
  useEffect(() => {
    setSelectedPreset(detectPreset())
  }, [value])

  // 预设选择处理
  const handlePresetSelect = async (presetName: PresetName) => {
    setSelectedPreset(presetName)
    const presetConfig = AI_ENGINE_PRESETS[presetName].config
    onChange(presetConfig)
    
    // 同时保存到 storage 确保持久化
    try {
      const currentConfig = await getAIConfig()
      await saveAIConfig({
        ...currentConfig,
        engineAssignment: presetConfig
      })
      
      // 根据预设类型更新 provider 状态
      if (presetName === 'privacy') {
        // 隐私优先：标记本地 AI 为活跃
        if (aiStatus?.hasLocal) {
          await saveProviderStatus({
            providerId: 'ollama',
            type: 'local',
            available: true,
            lastChecked: Date.now()
          })
        }
      } else {
        // 智能/经济优先：标记远程 AI 为活跃
        if (aiStatus?.hasRemote && aiStatus.remoteProviders.length > 0) {
          const preferredProvider = currentConfig.preferredRemoteProvider || aiStatus.remoteProviders[0]
          await saveProviderStatus({
            providerId: preferredProvider,
            type: 'remote',
            available: true,
            lastChecked: Date.now()
          })
        }
      }
    } catch (error) {
      console.error('保存预设配置失败:', error)
    }
  }

  // 检测当前配置是否匹配某个预设
  const detectPreset = (): PresetName | "custom" => {
    if (!value) return "intelligence" // 默认选中智能优先
    
    for (const [key, preset] of Object.entries(AI_ENGINE_PRESETS)) {
      const presetConfig = preset.config
      
      // 深度比较每个任务的配置
      const matches = Object.entries(presetConfig).every(([taskKey, taskConfig]) => {
        const currentConfig = value[taskKey as keyof AIEngineAssignment]
        if (!currentConfig) return false
        
        // 比较 provider 和 useReasoning
        return (
          currentConfig.provider === taskConfig.provider &&
          (currentConfig.useReasoning ?? false) === (taskConfig.useReasoning ?? false)
        )
      })
      
      if (matches) {
        return key as PresetName
      }
    }
    return "custom"
  }

  // 检测是否需要显示性能警告
  const shouldShowPerformanceWarning = (): boolean => {
    // Phase 12: 同时检测 local 抽象和 ollama 具体类型
    const isLocalProvider = (provider: string) => provider === "local" || provider === "ollama"
    return isLocalProvider(value.pageAnalysis.provider) || 
           isLocalProvider(value.articleAnalysis.provider)
  }

  // 渲染引擎选择下拉框
  const renderEngineSelect = (
    taskKey: keyof AIEngineAssignment,
    config: AIEngineConfig,
    allowReasoning: boolean
  ) => {
    return (
      <select
        value={config.provider}
        onChange={(e) => {
          const newConfig = { ...config, provider: e.target.value as any }
          onChange({ ...value, [taskKey]: newConfig })
          setSelectedPreset("custom")
        }}
        disabled={disabled}
        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm"
      >
        <optgroup label={_("options.aiConfig.aiEngineAssignment.engineGroups.abstract")}>
          <option value="remote">🌐 {_("options.aiConfig.aiEngineAssignment.engines.remote")}</option>
          <option value="local">💻 {_("options.aiConfig.aiEngineAssignment.engines.local")}</option>
        </optgroup>
        <optgroup label={_("options.aiConfig.aiEngineAssignment.engineGroups.specific")}>
          <option value="deepseek">DeepSeek</option>
          <option value="openai">OpenAI</option>
          <option value="ollama">本地 Ollama</option>
        </optgroup>
      </select>
    )
  }

  // 渲染推理复选框
  const renderReasoningCheckbox = (
    taskKey: keyof AIEngineAssignment,
    config: AIEngineConfig,
    allowReasoning: boolean
  ) => {
    if (!allowReasoning) {
      return <span className="text-gray-400 text-xs">-</span>
    }
    
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={config.useReasoning || false}
          onChange={(e) => {
            const newConfig = { ...config, useReasoning: e.target.checked }
            onChange({ ...value, [taskKey]: newConfig })
            setSelectedPreset("custom")
          }}
          disabled={disabled}
          className="w-4 h-4 cursor-pointer"
        />
        <span className="text-lg">🔬</span>
      </label>
    )
  }

  // 渲染预设卡片
  const renderPresetCard = (presetName: PresetName, isDisabled: boolean = false) => {
    const preset = AI_ENGINE_PRESETS[presetName]
    const isSelected = selectedPreset === presetName
    const isActuallyDisabled = disabled || isDisabled
    
    return (
      <button
        key={presetName}
        onClick={() => !isActuallyDisabled && handlePresetSelect(presetName)}
        disabled={isActuallyDisabled}
        className={`
          w-full p-4 rounded-lg border-2 text-left transition-all
          ${isSelected 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
            : isActuallyDisabled
              ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }
          ${isActuallyDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{preset.icon}</span>
              <span className="font-medium">{_(`options.aiConfig.aiEngineAssignment.presets.${presetName}.name`)}</span>
              {preset.recommended && !isDisabled && (
                <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                  {_("options.aiConfig.aiEngineAssignment.recommended")}
                </span>
              )}
              {isDisabled && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                  {presetName === 'privacy' 
                    ? _("options.aiConfig.aiEngineAssignment.requiresLocal")
                    : _("options.aiConfig.aiEngineAssignment.requiresRemote")
                  }
                </span>
              )}
            </div>
            <p className={`text-sm mb-2 ${isDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-600 dark:text-gray-400'}`}>
              {_(`options.aiConfig.aiEngineAssignment.presets.${presetName}.description`)}
            </p>
            <div className="flex items-center gap-4 text-xs">
              <span className={isDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}>
                💰 {_(`options.aiConfig.aiEngineAssignment.presets.${presetName}.estimatedCost`)}
              </span>
              <span className={isDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-gray-500 dark:text-gray-400'}>
                {_(`options.aiConfig.aiEngineAssignment.presets.${presetName}.performanceImpact`)}
              </span>
            </div>
          </div>
          {isSelected && !isDisabled && (
            <div className="ml-2">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">✓</span>
              </div>
            </div>
          )}
        </div>
      </button>
    )
  }

  // 渲染自定义预设卡片（始终可见，可点击展开高级配置）
  const renderCustomCard = () => {
    const isSelected = selectedPreset === "custom"
    
    return (
      <button
        type="button"
        onClick={() => {
          // 点击自定义卡片时，展开高级配置
          setShowAdvanced(true)
          // 如果当前不是自定义状态，不改变配置（让用户自己修改）
        }}
        disabled={disabled}
        className={`
          w-full p-4 rounded-lg border-2 text-left transition-all
          ${isSelected 
            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' 
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">⚙️</span>
              <span className="font-medium">{_("options.aiConfig.aiEngineAssignment.presets.custom.name")}</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {isSelected 
                ? _("options.aiConfig.aiEngineAssignment.presets.custom.description")
                : _("options.aiConfig.aiEngineAssignment.presets.custom.hint")
              }
            </p>
          </div>
          {isSelected && (
            <div className="ml-2">
              <div className="w-6 h-6 bg-purple-500 rounded-full flex items-center justify-center">
                <span className="text-white text-sm">✓</span>
              </div>
            </div>
          )}
        </div>
      </button>
    )
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg">
      {/* 标题 */}
      <h3 className="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">
        🚀 {_("options.aiConfig.aiEngineAssignment.title")}
      </h3>
      
      {/* 加载中 */}
      {isLoading && (
        <div className="text-center py-8">
          <div className="text-2xl mb-2">⏳</div>
          <p className="text-gray-500 dark:text-gray-400">检测 AI 配置中...</p>
        </div>
      )}
      
      {/* 无 AI 配置时的提示 */}
      {!isLoading && aiStatus && !aiStatus.hasAny && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                {_("options.analysisEngine.noAIAvailable.title")}
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                {_("options.analysisEngine.noAIAvailable.description")}
              </p>
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                💡 {_("options.analysisEngine.noAIAvailable.hint")}
              </p>
            </div>
          </div>
        </div>
      )}
      
      {/* 有 AI 配置时显示预设和高级配置 */}
      {!isLoading && aiStatus?.hasAny && (
        <>
          {/* 预设选择卡片 */}
          <div className="mb-6">
            <h4 className="text-lg font-medium mb-3 text-gray-800 dark:text-gray-200">
              🎯 {_("options.aiConfig.aiEngineAssignment.quickPresets")}
            </h4>
            <div className="grid gap-3">
              {/* 始终显示所有预设，根据 AI 可用性禁用不可用选项 */}
              {renderPresetCard("privacy", !aiStatus.hasLocal)}
              {renderPresetCard("intelligence", !aiStatus.hasRemote)}
              {renderPresetCard("economic", !aiStatus.hasRemote)}
              {renderCustomCard()}
            </div>
          </div>

          {/* 高级配置折叠按钮 */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 flex items-center gap-1"
        >
          <span>{showAdvanced ? '▼' : '▶'}</span>
          {_("options.aiConfig.aiEngineAssignment.advancedConfig")}
        </button>
      </div>

      {/* 详细配置表格（高级） */}
      {showAdvanced && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm font-medium">
            📊 {_("options.aiConfig.aiEngineAssignment.detailedConfig")}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left">{_("options.aiConfig.aiEngineAssignment.table.task")}</th>
                  <th className="px-4 py-2 text-left">{_("options.aiConfig.aiEngineAssignment.table.engine")}</th>
                  <th className="px-4 py-2 text-left">{_("options.aiConfig.aiEngineAssignment.table.reasoning")}</th>
                  <th className="px-4 py-2 text-left">{_("options.aiConfig.aiEngineAssignment.table.note")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                <tr>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>📖</span>
                      <span>{_("options.aiConfig.aiEngineAssignment.tasks.pageAnalysis")}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {renderEngineSelect("pageAnalysis", value.pageAnalysis, true)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {renderReasoningCheckbox("pageAnalysis", value.pageAnalysis, true)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {_("options.aiConfig.aiEngineAssignment.notes.highFrequency")}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>📰</span>
                      <span>{_("options.aiConfig.aiEngineAssignment.tasks.articleAnalysis")}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {renderEngineSelect("articleAnalysis", value.articleAnalysis, true)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {renderReasoningCheckbox("articleAnalysis", value.articleAnalysis, true)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {_("options.aiConfig.aiEngineAssignment.notes.highFrequency")}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>🧩</span>
                      <span>{_("options.aiConfig.aiEngineAssignment.tasks.lowFrequencyTasks")}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {renderEngineSelect("lowFrequencyTasks", value.lowFrequencyTasks, true)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {renderReasoningCheckbox("lowFrequencyTasks", value.lowFrequencyTasks, true)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {_("options.aiConfig.aiEngineAssignment.notes.lowFrequency")}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 性能警告 */}
      {shouldShowPerformanceWarning() && (
        <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div className="flex-1">
              <p className="font-medium text-yellow-800 dark:text-yellow-200 mb-1">
                {_("options.aiConfig.aiEngineAssignment.performanceWarning.title")}
              </p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
                {_("options.aiConfig.aiEngineAssignment.performanceWarning.description")}
              </p>
              <ul className="text-sm text-yellow-600 dark:text-yellow-400 space-y-1">
                <li>• {_("options.aiConfig.aiEngineAssignment.performanceWarning.impact1")}</li>
                <li>• {_("options.aiConfig.aiEngineAssignment.performanceWarning.impact2")}</li>
                <li>• {_("options.aiConfig.aiEngineAssignment.performanceWarning.impact3")}</li>
              </ul>
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mt-2">
                💡 {_("options.aiConfig.aiEngineAssignment.performanceWarning.suggestion")}
              </p>
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  )
}
