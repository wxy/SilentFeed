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
  isPreferred?: boolean // Phase 12: 是否为首选 Provider
  // Phase 12.4: 预算相关
  monthlyBudget?: number // 月度预算限制（provider 原生货币）
  currentSpent?: number // 本月已消费（provider 原生货币）
  currency?: 'USD' | 'CNY' // 货币单位
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
  supportsReasoning = false,
  isPreferred = false,
  monthlyBudget,
  currentSpent,
  currency
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
        border rounded-lg p-4 transition-all flex flex-col
        ${available ? 'border-green-200 dark:border-green-800' : 'border-gray-200 dark:border-gray-700'}
        ${isActive ? 'ring-2 ring-blue-500 shadow-lg' : 'hover:shadow-md'}
        bg-white dark:bg-gray-800
      `}
    >
      {/* 卡片头部 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-1">
          {/* 状态图标，鼠标悬停显示帮助光标 */}
          <span 
            className="text-2xl cursor-help" 
            title={statusText}
          >
            {statusIcon}
          </span>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {providerName}
          </h3>
        </div>
        {/* 类型和特性图标右对齐 */}
        <div className="flex items-center gap-1">
          <span className="text-sm cursor-help" title={typeText}>{typeIcon}</span>
          {supportsReasoning && (
            <span className="text-sm cursor-help" title={_("options.aiConfig.card.supportsReasoning")}>🔬</span>
          )}
          {isPreferred && (
            <span className="text-sm cursor-help" title={type === 'local' ? _("options.aiConfig.card.preferredLocal") : _("options.aiConfig.card.preferredRemote")}>⭐</span>
          )}
          {isActive && (
            <span className="text-sm cursor-help" title={_("options.aiConfig.card.active")}>🔵</span>
          )}
        </div>
      </div>

      {/* 状态详情 - 直接显示，不需要展开 */}
      <div className="flex-1">
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

        {/* Phase 12.4: 预算显示 */}
        {monthlyBudget !== undefined && currentSpent !== undefined && currency && (
          <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-700/50 rounded">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">💰 {_("options.aiConfig.card.budget")}</span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {currency === 'USD' ? '$' : '¥'}{currentSpent.toFixed(2)} / {currency === 'USD' ? '$' : '¥'}{monthlyBudget}
              </span>
            </div>
            {/* 预算进度条 */}
            <div className="mt-1 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  (currentSpent / monthlyBudget) >= 0.9 ? 'bg-red-500' :
                  (currentSpent / monthlyBudget) >= 0.7 ? 'bg-yellow-500' :
                  'bg-green-500'
                }`}
                style={{ width: `${Math.min(100, (currentSpent / monthlyBudget) * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 操作按钮 - 固定在底部 */}
      <div className="flex gap-2 mt-auto pt-3">
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
