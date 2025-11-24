import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import type { NotificationConfig } from "@/core/recommender/notification"

/**
 * 通知设置组件
 * Phase 8: 从 RecommendationSettings 提取的通知设置部分
 * 作为独立组件在"偏好设置"标签中使用
 */
export function NotificationSettings() {
  const { _ } = useI18n()
  const [config, setConfig] = useState<NotificationConfig>({
    enabled: false,
    quietHours: { start: 22, end: 8 },
    minInterval: 60
  })

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const result = await chrome.storage.local.get("notification-config")
      const savedConfig = result["notification-config"] as NotificationConfig | undefined
      if (savedConfig) {
        setConfig(savedConfig)
      }
    } catch (error) {
      console.error('加载通知配置失败:', error)
    }
  }

  const handleToggleEnabled = async (enabled: boolean) => {
    const newConfig = { ...config, enabled }
    setConfig(newConfig)
    await chrome.storage.local.set({ "notification-config": newConfig })
  }

  const handleQuietHoursChange = async (start: number, end: number) => {
    const newConfig = {
      ...config,
      quietHours: { start, end }
    }
    setConfig(newConfig)
    await chrome.storage.local.set({ "notification-config": newConfig })
  }

  return (
    <div className="space-y-6">
      {/* 启用通知 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">
            🔔 {_('options.general.enableNotifications')}
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {_('options.general.notificationsDesc')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => handleToggleEnabled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 dark:peer-focus:ring-green-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-green-600"></div>
        </label>
      </div>

      {config.enabled && (
        <>
          {/* 提示信息 */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              {_('options.general.notificationsHint')}
            </p>
          </div>

          {/* 静默时段 */}
          <div>
            <h3 className="text-sm font-medium mb-3">
              🌙 {_('options.general.quietHours')}
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  {_('options.general.quietStart')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={config.quietHours?.start ?? 22}
                  onChange={(e) => handleQuietHoursChange(
                    parseInt(e.target.value),
                    config.quietHours?.end ?? 8
                  )}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">
                  {_('options.general.quietEnd')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="23"
                  value={config.quietHours?.end ?? 8}
                  onChange={(e) => handleQuietHoursChange(
                    config.quietHours?.start ?? 22,
                    parseInt(e.target.value)
                  )}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {_('options.general.quietHint')}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
