import { useI18n } from "@/i18n/helpers"
import { logger } from "@/utils/logger"

const i18nLogger = logger.withTag("LanguageSwitcher")

/**
 * 语言切换组件
 * 允许用户手动选择界面语言
 */
export function LanguageSwitcher() {
  const { _, i18n } = useI18n()
  
  const languages = [
    { code: "zh-CN", name: "简体中文" },
    { code: "en", name: "English" }
  ]
  
  const changeLanguage = (lng: string) => {
    i18nLogger.info(`切换语言到: ${lng}`)
    i18n.changeLanguage(lng)
    localStorage.setItem("i18nextLng", lng)
  }
  
  return (
    <select
      value={i18n.language}
      onChange={(e) => changeLanguage(e.target.value)}
      className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      aria-label={_("common.selectLanguage")}
    >
      {languages.map(lang => (
        <option key={lang.code} value={lang.code}>
          {lang.name}
        </option>
      ))}
    </select>
  )
}
