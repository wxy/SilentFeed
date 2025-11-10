import { useState, useEffect } from "react"

import "@/i18n"
import { useI18n } from "@/i18n/helpers"
import i18n from "@/i18n"
import { RecommendationStats } from "@/components/settings/RecommendationStats"
import { CollectionStats } from "@/components/settings/CollectionStats"
import { AIConfig } from "@/components/settings/AIConfig"
import { getUIStyle, setUIStyle, watchUIStyle, type UIStyle } from "@/storage/ui-config"
import "./style.css"
import "@/styles/sketchy.css"

// 开发环境下加载调试工具
if (process.env.NODE_ENV === 'development') {
  import('./debug/generate-interest-changes').then(() => {
    console.log('🔧 开发调试工具已加载到 Options 页面')
  }).catch(error => {
    console.error('❌ 加载调试工具失败:', error)
  })
}

type TabKey = "general" | "rss" | "ai" | "recommendations" | "data"

/**
 * Feed AI Muter - 设置页面
 * 使用标签页布局，支持语言下拉选择，支持 URL 状态保持
 */
function IndexOptions() {
  const { _ } = useI18n()
  
  // 从 URL 参数获取初始标签，默认为 general
  const getInitialTab = (): TabKey => {
    const urlParams = new URLSearchParams(window.location.search)
    const tab = urlParams.get('tab') as TabKey
    return ['general', 'rss', 'ai', 'recommendations', 'data'].includes(tab) ? tab : 'general'
  }

  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab)
  const [uiStyle, setUiStyleState] = useState<UIStyle>("sketchy")

  // 加载 UI 风格
  useEffect(() => {
    const loadUIStyle = async () => {
      const style = await getUIStyle()
      setUiStyleState(style)
    }
    loadUIStyle()

    // 监听 UI 风格变化
    const unwatch = watchUIStyle((newStyle) => {
      setUiStyleState(newStyle)
    })

    return () => unwatch()
  }, [])

  // 切换 UI 风格
  const handleUIStyleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const style = e.target.value as UIStyle
    await setUIStyle(style)
  }

  // 当标签改变时更新 URL
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('tab', activeTab)
    window.history.replaceState({}, '', url.toString())
  }, [activeTab])

  // 监听浏览器前进后退按钮
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(getInitialTab())
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // 获取当前语言设置
  const currentLanguage = localStorage.getItem("i18nextLng") || "auto"

  // 切换语言
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value
    if (lang === "auto") {
      // 删除本地存储，让系统自动检测
      localStorage.removeItem("i18nextLng")
      // 重新检测语言
      const browserLang = navigator.language.toLowerCase()
      const detectedLang = browserLang.startsWith("zh") ? "zh-CN" : "en"
      i18n.changeLanguage(detectedLang)
    } else {
      i18n.changeLanguage(lang)
    }
  }

  // 标签配置
  const tabs: { key: TabKey; icon: string }[] = [
    { key: "general", icon: "⚙️" },
    { key: "rss", icon: "📡" },
    { key: "ai", icon: "🤖" },
    { key: "recommendations", icon: "📊" },
    { key: "data", icon: "📊" }
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* 头部 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold">{_("app.name")}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {_("options.title")}
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* 左侧标签导航 */}
          <nav className="w-48 flex-shrink-0">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key
                const baseClass = "w-full px-4 py-3 text-left text-sm font-medium transition-colors flex items-center gap-3"
                const activeClass = "bg-green-500 text-white dark:bg-green-600"
                const inactiveClass = "hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`${baseClass} ${isActive ? activeClass : inactiveClass}`}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span>{_(`options.tabs.${tab.key}`)}</span>
                  </button>
                )
              })}
            </div>
          </nav>

          {/* 右侧内容区域 */}
          <div className="flex-1">
            {/* 常规设置 */}
            {activeTab === "general" && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-semibold mb-2">
                  {_("options.general.title")}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                  {_("options.general.languageDescription")}
                </p>

                <div className="space-y-6">
                  {/* 语言选择下拉框 */}
                  <div>
                    <label
                      htmlFor="language-select"
                      className="block text-sm font-medium mb-2"
                    >
                      {_("options.general.language")}
                    </label>
                    <select
                      id="language-select"
                      value={currentLanguage}
                      onChange={handleLanguageChange}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                    >
                      <option value="auto">
                        {_("options.general.languageAuto")}
                      </option>
                      <option value="zh-CN">
                        {_("options.general.languageZh")}
                      </option>
                      <option value="en">
                        {_("options.general.languageEn")}
                      </option>
                      {/* 预留未来语言选项 */}
                      {/* <option value="fr">{_("options.general.languageFr")}</option> */}
                      {/* <option value="ja">{_("options.general.languageJa")}</option> */}
                    </select>
                  </div>

                  {/* UI 风格选择 */}
                  <div>
                    <label
                      htmlFor="ui-style-select"
                      className="block text-sm font-medium mb-2"
                    >
                      {_("options.general.uiStyle")}
                    </label>
                    <select
                      id="ui-style-select"
                      value={uiStyle}
                      onChange={handleUIStyleChange}
                      className="w-full px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent transition-colors"
                    >
                      <option value="sketchy">
                        {_("options.general.uiStyleSketchy")}
                      </option>
                      <option value="normal">
                        {_("options.general.uiStyleNormal")}
                      </option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      {_("options.general.uiStyleDescription")}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* RSS 源管理 - 预留 */}
            {activeTab === "rss" && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 opacity-50">
                <h2 className="text-lg font-semibold mb-2">
                  {_("options.rss.title")}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {_("options.rss.description")}
                </p>
                <div className="py-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    {_("options.rss.disabled")}
                  </p>
                </div>
              </div>
            )}

            {/* AI 配置 - Phase 4.1 */}
            {activeTab === "ai" && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <AIConfig />
              </div>
            )}

            {/* 推荐统计 - Phase 2.7 */}
            {activeTab === "recommendations" && <RecommendationStats />}

            {/* 采集统计 - Phase 2.7+ */}
            {activeTab === "data" && <CollectionStats />}
          </div>
        </div>
      </div>

      {/* 页脚 */}
      <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>
          {_("app.name")} - {_("app.shortName")}
        </p>
      </div>
    </div>
  )
}

export default IndexOptions
