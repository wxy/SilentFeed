import { useState, useEffect } from "react"

import "@/i18n"
import { useI18n } from "@/i18n/helpers"
import i18n from "@/i18n"
import { changeLanguage as changeLanguageHelper } from "@/i18n"
import ChromeStorageBackend from "@/i18n/chrome-storage-backend"
import { CollectionStats } from "@/components/settings/CollectionStats"
import { AIConfig } from "@/components/settings/AIConfig"
import { RSSSettings } from "@/components/settings/RSSSettings"
import { NotificationSettings } from "@/components/settings/NotificationSettings"
import { ProfileSettings } from "@/components/settings/ProfileSettings"
import { getUIStyle, setUIStyle, watchUIStyle, getUIConfig, updateUIConfig, type UIStyle } from "@/storage/ui-config"
import { useTheme } from "@/hooks/useTheme"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import "@/styles/global.css"
import "@/styles/sketchy.css"

type TabKey = "preferences" | "feeds" | "ai-engine" | "profile" | "data"

/**
 * Silent Feed - 设置页面
 * 使用标签页布局，支持语言下拉选择，支持 URL 状态保持
 * 
 * Phase 8: 设置页重组
 * - preferences: 偏好设置（语言、UI风格、通知）
 * - feeds: 订阅源管理
 * - ai-engine: AI 引擎配置（基础设施层）
 * - analysis: 内容分析配置
 * - profile: 用户画像
 * - data: 系统数据（采集统计）
 */
function IndexOptions() {
  const { _ } = useI18n()
  useTheme() // 自动跟随系统主题
  
  // 设置页面标题
  useEffect(() => {
    document.title = _("options.title") || "Silent Feed - Settings"
  }, [_])
  
  // 从 URL 参数或 hash 获取初始标签，默认为 preferences
  const getInitialTab = (): TabKey => {
    // 优先从 hash 读取（支持 #rss 这种格式）
    const hash = window.location.hash.slice(1) as TabKey
    if (['preferences', 'feeds', 'ai-engine', 'profile', 'data'].includes(hash)) {
      return hash
    }
    
    // 其次从 URL 参数读取
    const urlParams = new URLSearchParams(window.location.search)
    const tab = urlParams.get('tab') as TabKey
    return ['preferences', 'feeds', 'ai-engine', 'profile', 'data'].includes(tab) ? tab : 'preferences'
  }

  const [activeTab, setActiveTab] = useState<TabKey>(getInitialTab)
  const [uiStyle, setUiStyleState] = useState<UIStyle>("normal")
  const [autoTranslate, setAutoTranslate] = useState(false)

  // 加载 UI 风格和自动翻译设置
  useEffect(() => {
    const loadUIConfig = async () => {
      const config = await getUIConfig()
      setUiStyleState(config.style)
      setAutoTranslate(config.autoTranslate)
    }
    loadUIConfig()

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
  
  // 切换自动翻译
  const handleAutoTranslateChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const enabled = e.target.checked
    setAutoTranslate(enabled)
    await updateUIConfig({ autoTranslate: enabled })
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

  // 获取当前语言设置（从 chrome.storage.sync）
  const [currentLanguage, setCurrentLanguage] = useState<string>("auto")
  
  useEffect(() => {
    const loadLanguage = async () => {
      try {
        const savedLng = await ChromeStorageBackend.loadLanguage()
        setCurrentLanguage(savedLng || "auto")
      } catch (error) {
        console.warn('[Options] Failed to load language:', error)
        setCurrentLanguage("auto")
      }
    }
    loadLanguage()
  }, [])

  // 切换语言
  const handleLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value
    if (lang === "auto") {
      // 删除保存的语言偏好，让系统自动检测
      try {
        await ChromeStorageBackend.removeLanguage()
        setCurrentLanguage("auto")  // 立即更新 UI
      } catch (error) {
        console.warn('[Options] Failed to remove language preference:', error)
      }
      // 重新检测语言
      const browserLang = navigator.language.toLowerCase()
      const detectedLang = browserLang.startsWith("zh") ? "zh-CN" : "en"
      await i18n.changeLanguage(detectedLang)
    } else {
      // 使用 changeLanguageHelper 自动保存到 chrome.storage
      await changeLanguageHelper(lang)
      setCurrentLanguage(lang)  // 立即更新 UI
      await changeLanguageHelper(lang)
    }
  }

  // 标签配置
  const tabs: { key: TabKey; icon: string }[] = [
    { key: "preferences", icon: "⚙️" },
    { key: "feeds", icon: "📡" },
    { key: "ai-engine", icon: "🤖" },
    { key: "profile", icon: "👤" },
    { key: "data", icon: "📊" }
  ]

  const isSketchyStyle = uiStyle === "sketchy"
  const currentLang = i18n.language // 获取当前语言

  return (
    <ErrorBoundary>
      <div className={isSketchyStyle ? "min-h-screen sketchy-container sketchy-paper-texture text-gray-900 dark:text-gray-100" : "min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-cyan-50/20 dark:from-gray-900 dark:via-indigo-950/20 dark:to-cyan-950/10 text-gray-900 dark:text-gray-100"} lang={currentLang}>
        {/* SVG 滤镜定义 */}
        {isSketchyStyle && (
          <svg className="sketchy-svg-filters" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <filter id="sketchy-stroke" x="-30%" y="-30%" width="160%" height="160%">
                <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="3" result="noise" />
                <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="displaced" />
                <feMorphology operator="dilate" radius="0.2" in="displaced" result="thickened" />
                <feMorphology operator="erode" radius="0.15" in="thickened" result="thinned" />
                <feGaussianBlur stdDeviation="0.25" in="thinned" result="blurred" />
                <feComponentTransfer in="blurred">
                  <feFuncA type="linear" slope="1.15" />
                </feComponentTransfer>
              </filter>
            </defs>
          </svg>
        )}
        
        {/* 头部 */}
        <div className={isSketchyStyle ? "border-b border-gray-200 dark:border-gray-700 px-6 py-4" : "bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50 shadow-sm"}>
          <div className="max-w-6xl mx-auto px-6 py-6">
            <h1 className={isSketchyStyle ? "sketchy-title text-3xl" : "text-2xl font-bold bg-gradient-to-r from-indigo-600 to-cyan-600 dark:from-indigo-400 dark:to-cyan-400 bg-clip-text text-transparent"}>{_("app.name")}</h1>
            <p className={isSketchyStyle ? "sketchy-text mt-2" : "text-sm text-gray-600 dark:text-gray-400 mt-2"}>
              {_("options.title")}
            </p>
            {isSketchyStyle && <div className="sketchy-divider mt-4"></div>}
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex gap-8">
            {/* 左侧标签导航 */}
            <nav className="w-48 flex-shrink-0">
              <div className={isSketchyStyle ? "sketchy-card" : "bg-white/60 dark:bg-gray-800/60 backdrop-blur-md rounded-xl border border-gray-200/50 dark:border-gray-700/50 overflow-hidden shadow-lg"}>
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.key
                  const baseClass = "w-full px-4 py-3 text-left text-sm font-medium transition-all duration-200 flex items-center gap-3"
                  const activeClass = isSketchyStyle 
                    ? "bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200" 
                    : "bg-gradient-to-r from-indigo-500 to-cyan-500 text-white dark:from-indigo-600 dark:to-cyan-600 shadow-md"
                  const inactiveClass = isSketchyStyle
                    ? "hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                    : "hover:bg-gray-100/80 dark:hover:bg-gray-700/80 border-b border-gray-200/30 dark:border-gray-700/30 last:border-b-0"
                  const sketchyClass = isSketchyStyle && isActive ? "sketchy-text font-semibold" : ""
                  
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`${baseClass} ${isActive ? activeClass : inactiveClass} ${sketchyClass}`}
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
              {/* 偏好设置 - Phase 8 */}
              {activeTab === "preferences" && (
                <div className={isSketchyStyle ? "sketchy-card p-6" : "bg-white/60 dark:bg-gray-800/60 backdrop-blur-md rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-6 shadow-lg"}>
                  <h2 className={isSketchyStyle ? "sketchy-title text-xl mb-2" : "text-lg font-semibold mb-2 bg-gradient-to-r from-indigo-600 to-cyan-600 dark:from-indigo-400 dark:to-cyan-400 bg-clip-text text-transparent"}>
                    {_("options.general.preferencesTitle")}
                  </h2>
                  <p className={isSketchyStyle ? "sketchy-text mb-6" : "text-sm text-gray-600 dark:text-gray-400 mb-6"}>
                    {_("options.general.languageDescription")}
                  </p>

                  <div className="space-y-8">
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
                        className="w-full px-4 py-2 bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm border border-gray-300/50 dark:border-gray-600/50 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm"
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
                        className="w-full px-4 py-2 bg-white/80 dark:bg-gray-700/80 backdrop-blur-sm border border-gray-300/50 dark:border-gray-600/50 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm"
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

                    {/* 自动翻译开关 - Phase 翻译功能 */}
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={autoTranslate}
                          onChange={handleAutoTranslateChange}
                          className="w-4 h-4 text-indigo-600 bg-white/80 dark:bg-gray-700/80 border-gray-300 dark:border-gray-600 rounded focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                        <span className="text-sm font-medium">
                          {_("options.general.autoTranslate")}
                        </span>
                      </label>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 ml-7">
                        {_("options.general.autoTranslateDesc")}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 ml-7">
                        {_("options.general.autoTranslateWarning")}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-7">
                        {_("options.general.autoTranslateHint")}
                      </p>
                    </div>

                    {/* 分隔线 */}
                    <div className="border-t border-gray-200 dark:border-gray-700 my-6"></div>

                    {/* 通知设置 - Phase 8: 新增 */}
                    <div>
                      <h3 className="text-sm font-medium mb-4">
                        {_("options.general.notifications")}
                      </h3>
                      <NotificationSettings />
                    </div>
                  </div>
                </div>
              )}

              {/* 订阅源管理 - Phase 5.1 */}
              {activeTab === "feeds" && (
                <div className={isSketchyStyle ? "sketchy-card p-6" : "bg-white/60 dark:bg-gray-800/60 backdrop-blur-md rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-6 shadow-lg"}>
                  <RSSSettings isSketchyStyle={isSketchyStyle} />
                </div>
              )}

              {/* AI 引擎配置 - Phase 4.1 + Phase 8 扩展 */}
              {activeTab === "ai-engine" && (
                <div className={isSketchyStyle ? "sketchy-card" : "bg-white/60 dark:bg-gray-800/60 backdrop-blur-md rounded-xl border border-gray-200/50 dark:border-gray-700/50 shadow-lg"}>
                  <AIConfig />
                </div>
              )}

              {/* 用户画像 - Phase 6 */}
              {activeTab === "profile" && (
                <div className={isSketchyStyle ? "sketchy-card p-6" : "bg-white/60 dark:bg-gray-800/60 backdrop-blur-md rounded-xl border border-gray-200/50 dark:border-gray-700/50 p-6 shadow-lg"}>
                  <ProfileSettings />
                </div>
              )}

              {/* 我的数据 - Phase 2.7+ */}
              {activeTab === "data" && <CollectionStats />}
            </div>
          </div>
        </div>

        {/* 页脚 */}
        <div className="max-w-6xl mx-auto px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>
            {_("app.name")} v{chrome.runtime.getManifest().version}
          </p>
        </div>
      </div>
    </ErrorBoundary>
  )
}

export default IndexOptions
