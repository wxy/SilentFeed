import { useState } from "react"
import type { AIProviderStatus } from "@/storage/ai-provider-status"
import { formatLatency, formatLastChecked, getStatusIcon } from "@/storage/ai-provider-status"
import { useI18n } from "@/i18n/helpers"

export interface AIProviderCardProps {
  providerId: string
  providerName: string
  status: AIProviderStatus | null
  onCheck: () => Promise<void>
  onConfigure: () => void
  checking: boolean
  isActive?: boolean // 是否为当前正在使用的 Provider
  supportsReasoning?: boolean // 是否支持推理能力
}

/**
 * AI Provider 状态卡片组件
 */
export function AIProviderCard({
  providerId,
  providerName,
  status,
  onCheck,
  onConfigure,
  checking,
  isActive = false,
  supportsReasoning = false
}: AIProviderCardProps) {
  const { _ } = useI18n()
  // 状态判断
  const available = status?.available ?? false
  const hasConfig = status !== null
  const lastChecked = status?.lastChecked
  const latency = status?.latency
  const error = status?.error
  const type = status?.type || 'remote'

  // 状态图标和颜色
  const statusIcon = status ? getStatusIcon(status) : '⚪'
  const statusText = available ? _("options.aiConfig.card.statusAvailable") : (hasConfig ? _("options.aiConfig.card.statusUnavailable") : _("options.aiConfig.card.statusNotConfigured"))
  const statusColorClass = available 
    ? 'text-green-600 dark:text-green-400'
    : hasConfig
      ? 'text-red-600 dark:text-red-400'
      : 'text-gray-500 dark:text-gray-400'

  // 类型图标
  const typeIcon = type === 'local' ? '💻' : '☁️'
  const typeText = type === 'local' ? _("options.aiConfig.card.typeLocal") : _("options.aiConfig.card.typeRemote")

  return (
    <div
      className={`
        border rounded-lg p-4 transition-all
        ${available ? 'border-green-200 dark:border-green-800' : 'border-gray-200 dark:border-gray-700'}
        ${isActive ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'}
        bg-white dark:bg-gray-800
      `}
    >
      {/* 卡片头部 */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">{statusIcon}</span>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {providerName}
            </h3>
            <span className="text-sm" title={typeText}>{typeIcon}</span>
            {supportsReasoning && (
              <span className="text-sm" title={_("options.aiConfig.card.supportsReasoning")}>🔬</span>
            )}
            {isActive && (
              <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                {_("options.aiConfig.card.active")}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${statusColorClass}`}>
              {statusText}
            </span>
          </div>
        </div>
      </div>

      {/* 状态详情 - 直接显示，不需要展开 */}
      {hasConfig && (
        <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
          {latency !== undefined && (
            <div className="flex items-center gap-2">
              <span>🕒</span>
              <span>{_("options.aiConfig.card.latency", { value: formatLatency(latency) })}</span>
            </div>
          )}
          
          {lastChecked && (
            <div className="flex items-center gap-2">
              <span>📅</span>
              <span>{_("options.aiConfig.card.lastChecked", { time: formatLastChecked(lastChecked) })}</span>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onCheck()
          }}
          disabled={checking}
          className={`
            flex-1 px-3 py-1.5 text-sm rounded
            ${checking 
              ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
              : 'bg-blue-500 hover:bg-blue-600 text-white'
            }
            transition-colors
          `}
        >
          {checking ? _("options.aiConfig.card.checking") : _("options.aiConfig.card.check")}
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation()
            onConfigure()
          }}
          className="flex-1 px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
        >
          {_("options.aiConfig.card.configure")}
        </button>
      </div>
    </div>
  )
}
