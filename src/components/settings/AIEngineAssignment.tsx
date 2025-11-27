import { useI18n } from "@/i18n/helpers"
import { useState } from "react"
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

  // 预设选择处理
  const handlePresetSelect = (presetName: PresetName) => {
    setSelectedPreset(presetName)
    onChange(AI_ENGINE_PRESETS[presetName].config)
  }

  // 检测当前配置是否匹配某个预设
  const detectPreset = (): PresetName | "custom" => {
    for (const [key, preset] of Object.entries(AI_ENGINE_PRESETS)) {
      const presetConfig = preset.config
      if (
        JSON.stringify(presetConfig) === JSON.stringify(value)
      ) {
        return key as PresetName
      }
    }
    return "custom"
  }

  return (
    <div className="space-y-6">
      {/* 预设选择卡片 */}
      <div>
        <h3 className="text-lg font-medium mb-3">
          🎯 {_("options.aiEngineAssignment.quickPresets")}
        </h3>
        <div className="grid gap-3">
          {/* 三个预设卡片将在下一步添加 */}
        </div>
      </div>

      {/* 详细配置表格（高级） - 将在后续添加 */}
    </div>
  )
}
