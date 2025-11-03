import { useState } from "react"

import "@/i18n"
import { useI18n } from "@/i18n/helpers"
import i18n from "@/i18n"
import { RecommendationStats } from "@/components/settings/RecommendationStats"
import { DataStats } from "@/components/settings/DataStats"
import "./style.css"

type TabKey = "general" | "rss" | "ai" | "recommendations" | "data"

/**
 * Feed AI Muter - 设置页面
 * 使用标签页布局，支持语言下拉选择
 */
function IndexOptions() {
  const { _ } = useI18n()
  const [activeTab, setActiveTab] = useState<TabKey>("general")

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
    { key: "data", icon: "�" }
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

            {/* AI 配置 - 预留 */}
            {activeTab === "ai" && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 opacity-50">
                <h2 className="text-lg font-semibold mb-2">
                  {_("options.ai.title")}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {_("options.ai.description")}
                </p>
                <div className="py-8 text-center">
                  <p className="text-gray-500 dark:text-gray-400">
                    {_("options.ai.disabled")}
                  </p>
                </div>
              </div>
            )}

            {/* 推荐统计 - Phase 2.7 */}
            {activeTab === "recommendations" && <RecommendationStats />}

            {/* 数据统计 - Phase 2.7 */}
            {activeTab === "data" && <DataStats />}
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
