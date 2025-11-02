/**
 * 翻译 key 的 TypeScript 类型定义
 * 
 * 这个文件会在运行 i18n:extract 后自动生成
 * 提供类型安全的翻译 key
 */

export type TranslationKey = 
  | "app.name"
  | "app.shortName"
  | "popup.welcome"
  | "popup.learning"
  | "popup.progress"
  | "popup.stage.explorer"
  | "popup.stage.learner"
  | "popup.stage.grower"
  | "popup.stage.master"
  | "popup.hint"
  | "popup.settings"
  | "common.loading"
  | "common.error"
  | "common.success"
  | "common.cancel"
  | "common.confirm"

/**
 * 翻译函数类型
 */
export type TranslateFn = (key: TranslationKey, options?: any) => string
