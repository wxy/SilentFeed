import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import ChromeStorageBackend from "./chrome-storage-backend"

// 导入翻译文件
import zhCN from "../../public/locales/zh-CN/translation.json"
import en from "../../public/locales/en/translation.json"

/**
 * i18n 配置
 * 
 * 支持语言：简体中文（zh-CN）、英文（en）
 * 默认语言：en（英文，国际化标准）
 * 语言检测顺序：chrome.storage.sync → 浏览器语言
 * 
 * 语言策略：
 * - 简体中文用户（zh-CN）→ 中文
 * - 其他所有语言用户 → 英文
 */

// 初始化语言（从 chrome.storage 读取）
async function initLanguage() {
  try {
    const savedLng = await ChromeStorageBackend.loadLanguage()
    if (savedLng) {
      await i18n.changeLanguage(savedLng)
    }
  } catch (error) {
    console.warn('[i18n] Failed to load saved language, using default:', error)
  }
}

i18n
  .use(LanguageDetector) // 自动检测用户语言
  .use(initReactI18next) // React 集成
  .init({
    resources: {
      "zh-CN": { translation: zhCN },
      "en": { translation: en }
    },
    
    // 默认语言：英文（国际化标准）
    fallbackLng: "en",
    
    // 支持的语言列表（只有简体中文会匹配，其他都回退到英文）
    supportedLngs: ["zh-CN", "en"],
    
    // 语言检测配置（只使用浏览器检测，不使用 localStorage）
    detection: {
      // 检测顺序：浏览器语言（chrome.storage 通过 initLanguage 加载）
      order: ["navigator", "htmlTag"],
      // 不缓存到 localStorage（使用 chrome.storage.sync）
      caches: [],
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

// 初始化时加载保存的语言
initLanguage()

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
 * 切换语言（保存到 chrome.storage.sync）
 */
export async function changeLanguage(lng: string): Promise<void> {
  // 1. 更新 i18n
  await i18n.changeLanguage(lng)
  
  // 2. 保存到 chrome.storage.sync
  try {
    await ChromeStorageBackend.saveLanguage(lng)
  } catch (error) {
    console.error('[i18n] Failed to save language preference:', error)
  }
}
