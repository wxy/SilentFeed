import { useTranslation } from "react-i18next"

/**
 * 简化的翻译函数
 * 使用 _() 替代 t()，更简洁
 * 
 * @example
 * ```tsx
 * import { useI18n } from "@/i18n/helpers"
 * 
 * function MyComponent() {
 *   const { _ } = useI18n()
 *   return <div>{_("popup.welcome")}</div>
 * }
 * ```
 */
export function useI18n() {
  const { t, i18n } = useTranslation()
  
  // 创建简化的翻译函数，确保返回 string
  const _ = (key: string, options?: any): string => {
    return t(key, options) as string
  }
  
  return { _, i18n, t }
}

/**
 * 在非 React 组件中使用翻译
 * 
 * @example
 * ```ts
 * import { translate as _ } from "@/i18n/helpers"
 * 
 * const message = _("errors.networkError")
 * ```
 */
export function translate(key: string, options?: any): string {
  // 动态导入 i18n 实例
  const i18n = require("./index").default
  return i18n.t(key, options) as string
}

// 导出为 _ 别名
export const _ = translate
