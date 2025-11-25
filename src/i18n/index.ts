import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"

// 导入翻译文件
import zhCN from "../../public/locales/zh-CN/translation.json"
import en from "../../public/locales/en/translation.json"

/**
 * i18n 配置
 * 
 * 支持语言：简体中文（zh-CN）、英文（en）
 * 默认语言：en（英文）
 * 语言检测顺序：localStorage → 浏览器语言 → HTML 标签
 * 
 * 语言策略：
 * - 简体中文用户（zh-CN）→ 中文
 * - 其他所有语言用户 → 英文
 */
i18n
  .use(LanguageDetector) // 自动检测用户语言
  .use(initReactI18next) // React 集成
  .init({
    resources: {
      "zh-CN": { translation: zhCN },
      "en": { translation: en }
    },
    
    // 默认语言（非简体中文用户都使用英文）
    fallbackLng: "en",
    
    // 支持的语言列表（只有简体中文会匹配，其他都回退到英文）
    supportedLngs: ["zh-CN", "en"],
    
    // 语言检测配置
    detection: {
      // 检测顺序：用户设置 → 浏览器语言 → HTML 标签
      order: ["localStorage", "navigator", "htmlTag"],
      // 缓存用户选择
      caches: ["localStorage"],
      // localStorage key
      lookupLocalStorage: "i18nextLng"
    },
    
    // 插值配置
    interpolation: {
      escapeValue: false // React 已经处理 XSS
    },
    
    // 开发模式调试
    debug: false, // 开发日志保持中文，不需要 i18n 调试信息
    
    // 命名空间
    defaultNS: "translation",
    
    // 缺失 key 时的处理
    saveMissing: false, // 不自动保存缺失的 key（手动管理）
    
    // 返回对象而不是字符串（用于嵌套）
    returnObjects: false
  })

export default i18n

/**
 * 获取当前语言的显示名称
 */
export function getCurrentLanguageName(): string {
  const lang = i18n.language
  const names: Record<string, string> = {
    "zh-CN": "简体中文",
    "en": "English"
  }
  return names[lang] || names["en"]
}

/**
 * 切换语言
 */
export function changeLanguage(lng: string): void {
  console.log(`切换语言到: ${lng}`)
  i18n.changeLanguage(lng)
}
