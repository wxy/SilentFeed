import "@/i18n"
import { useI18n } from "@/i18n/helpers"
import i18n from "@/i18n"
import "./style.css"

/**
 * Feed AI Muter - 设置页面
 * 提供语言选择和预留配置区域
 */
function IndexOptions() {
  const { _ } = useI18n()

  // 获取当前语言设置
  const currentLanguage = localStorage.getItem("i18nextLng") || "auto"

  // 切换语言
  const handleLanguageChange = (lang: string) => {
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      {/* 头部 */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold">{_("app.name")}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {_("options.title")}
          </p>
        </div>
      </div>

      {/* 主体内容 */}
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* 常规设置 */}
        <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>⚙️</span>
            <span>{_("options.general.title")}</span>
          </h2>
          
          <div className="space-y-4">
            {/* 语言选择 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {_("options.general.language")}
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => handleLanguageChange("auto")}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    currentLanguage === "auto"
                      ? "bg-green-500 text-white dark:bg-green-600"
                      : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {_("options.general.languageAuto")}
                </button>
                <button
                  onClick={() => handleLanguageChange("zh-CN")}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    currentLanguage === "zh-CN"
                      ? "bg-green-500 text-white dark:bg-green-600"
                      : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {_("options.general.languageZh")}
                </button>
                <button
                  onClick={() => handleLanguageChange("en")}
                  className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                    currentLanguage === "en"
                      ? "bg-green-500 text-white dark:bg-green-600"
                      : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {_("options.general.languageEn")}
                </button>
              </div>
            </div>

            {/* 主题显示 */}
            <div>
              <label className="block text-sm font-medium mb-2">
                {_("options.general.theme")}
              </label>
              <div className="py-2 px-4 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm">
                {_("options.general.themeAuto")}
              </div>
            </div>
          </div>
        </section>

        {/* RSS 源管理 - 预留 */}
        <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 opacity-50">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>📡</span>
            <span>{_("options.rss.title")}</span>
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {_("options.rss.disabled")}
          </p>
        </section>

        {/* AI 配置 - 预留 */}
        <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 opacity-50">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>🤖</span>
            <span>{_("options.ai.title")}</span>
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {_("options.ai.disabled")}
          </p>
        </section>

        {/* 数据与隐私 - 预留 */}
        <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 opacity-50">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span>�</span>
            <span>{_("options.privacy.title")}</span>
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {_("options.privacy.disabled")}
          </p>
        </section>
      </div>

      {/* 页脚 */}
      <div className="max-w-4xl mx-auto px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        <p>{_("app.name")} - {_("app.shortName")}</p>
      </div>
    </div>
  )
}

export default IndexOptions
