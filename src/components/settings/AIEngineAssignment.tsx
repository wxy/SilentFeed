import { useI18n } from "@/i18n/helpers"
import { useState, useEffect } from "react"
import {
  AI_ENGINE_PRESETS,
  getDefaultEngineAssignment,
  type AIEngineAssignment,
  type PresetName,
  type AIEngineConfig
} from "@/types/ai-engine-assignment"

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

  // 初始化时检测当前配置匹配的预设
  useEffect(() => {
    setSelectedPreset(detectPreset())
  }, [value])

  // 预设选择处理
  const handlePresetSelect = (presetName: PresetName) => {
    setSelectedPreset(presetName)
    onChange(AI_ENGINE_PRESETS[presetName].config)
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
           isLocalProvider(value.feedAnalysis.provider)
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
  const renderPresetCard = (presetName: PresetName) => {
    const preset = AI_ENGINE_PRESETS[presetName]
    const isSelected = selectedPreset === presetName
    
    return (
      <button
        key={presetName}
        onClick={() => handlePresetSelect(presetName)}
        disabled={disabled}
        className={`
          w-full p-4 rounded-lg border-2 text-left transition-all
          ${isSelected 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' 
            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
          }
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        `}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">{preset.icon}</span>
              <span className="font-medium">{_(`options.aiConfig.aiEngineAssignment.presets.${presetName}.name`)}</span>
              {preset.recommended && (
                <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                  {_("options.aiConfig.aiEngineAssignment.recommended")}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              {_(`options.aiConfig.aiEngineAssignment.presets.${presetName}.description`)}
            </p>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                💰 {_(`options.aiConfig.aiEngineAssignment.presets.${presetName}.estimatedCost`)}
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {_(`options.aiConfig.aiEngineAssignment.presets.${presetName}.performanceImpact`)}
              </span>
            </div>
          </div>
          {isSelected && (
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
    <div className="space-y-6">
      {/* 预设选择卡片 */}
      <div>
        <h3 className="text-lg font-medium mb-3">
          🎯 {_("options.aiConfig.aiEngineAssignment.quickPresets")}
        </h3>
        <div className="grid gap-3">
          {renderPresetCard("privacy")}
          {renderPresetCard("intelligence")}
          {renderPresetCard("economic")}
          {renderCustomCard()}
        </div>
      </div>

      {/* 高级配置折叠按钮 */}
      <div>
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
                      <span>{_("options.aiConfig.aiEngineAssignment.tasks.feedAnalysis")}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {renderEngineSelect("feedAnalysis", value.feedAnalysis, true)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {renderReasoningCheckbox("feedAnalysis", value.feedAnalysis, true)}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {_("options.aiConfig.aiEngineAssignment.notes.highFrequency")}
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span>👤</span>
                      <span>{_("options.aiConfig.aiEngineAssignment.tasks.profileGeneration")}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {renderEngineSelect("profileGeneration", value.profileGeneration, true)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {renderReasoningCheckbox("profileGeneration", value.profileGeneration, true)}
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
    </div>
  )
}
