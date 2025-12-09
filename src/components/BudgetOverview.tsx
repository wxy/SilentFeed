import { useState, useEffect } from "react"
import { useI18n } from "@/i18n/helpers"
import { getAIConfig } from "@/storage/ai-config"
import { getCurrentMonthUsage } from "@/utils/budget-utils"

/**
 * Phase 12.4: 月度预算总览组件
 * 
 * 显示所有 AI Provider 的月度预算使用情况，按货币分组
 */
export function BudgetOverview() {
  const { _ } = useI18n()
  const [budgets, setBudgets] = useState<{
    USD: { total: number; used: number }
    CNY: { total: number; used: number }
  }>({
    USD: { total: 0, used: 0 },
    CNY: { total: 0, used: 0 }
  })

  useEffect(() => {
    const loadBudgetData = async () => {
      const config = await getAIConfig()
      const providerBudgets = config.providerBudgets || {}

      // 加载使用情况
      const openaiUsage = await getCurrentMonthUsage('openai')
      const deepseekUsage = await getCurrentMonthUsage('deepseek')

      // 按货币汇总
      setBudgets({
        USD: {
          total: providerBudgets.openai || 0,
          used: openaiUsage.amount
        },
        CNY: {
          total: providerBudgets.deepseek || 0,
          used: deepseekUsage.amount
        }
      })
    }

    loadBudgetData()

    // 监听配置变化
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName === 'sync' && changes.aiConfig) {
        loadBudgetData()
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  /**
   * 渲染单个货币的预算卡片
   */
  const renderBudgetCard = (currency: 'USD' | 'CNY') => {
    const data = budgets[currency]
    const symbol = currency === 'USD' ? '$' : '¥'
    const providerName = currency === 'USD' ? 'OpenAI' : 'DeepSeek'
    
    if (data.total === 0) {
      // 未设置预算时显示提示
      return (
        <div key={currency} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {currency} ({providerName})
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {_("options.aiConfig.budgetOverview.noBudgetSet")}
            </span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {_("options.aiConfig.budgetOverview.setBudgetHint")}
          </p>
        </div>
      )
    }

    const usageRate = data.total > 0 ? (data.used / data.total) : 0
    const progressColor = 
      usageRate >= 0.9 ? 'bg-red-500' :
      usageRate >= 0.7 ? 'bg-yellow-500' :
      'bg-green-500'

    return (
      <div key={currency} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {currency}
          </span>
          <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {symbol}{data.used.toFixed(2)} / {symbol}{data.total}
          </span>
        </div>
        {/* 进度条 */}
        <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
          <div 
            className={`h-full transition-all ${progressColor}`}
            style={{ width: `${Math.min(100, usageRate * 100)}%` }}
          />
        </div>
        {/* 百分比 */}
        <div className="mt-1 text-xs text-right text-gray-500 dark:text-gray-400">
          {(usageRate * 100).toFixed(1)}%
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 rounded-lg">
      <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">
        💰 {_("options.aiConfig.budgetOverview.title")}
      </h3>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
        {_("options.aiConfig.budgetOverview.description")}
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderBudgetCard('USD')}
        {renderBudgetCard('CNY')}
      </div>
    </div>
  )
}
