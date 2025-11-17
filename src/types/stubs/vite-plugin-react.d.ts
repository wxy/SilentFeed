/**
 * Vite React Plugin 类型桩
 *
 * 仅用于 TypeScript 编译阶段，屏蔽上游 d.ts 与当前 TS 版本的语法不兼容问题。
 */
declare module "@vitejs/plugin-react" {
  import type { Plugin, UserConfig } from "vite"

  /** 插件配置（按需扩展） */
  export interface ReactPluginOptions {
    include?: string | RegExp | Array<string | RegExp>
    exclude?: string | RegExp | Array<string | RegExp>
    jsxRuntime?: "classic" | "automatic"
    jsxImportSource?: string
    babel?: Record<string, unknown>
    tsDecorators?: boolean
    fastRefresh?: boolean
  }

  /** 默认导出插件工厂 */
  export default function react(options?: ReactPluginOptions): Plugin

  /** 兼容 Vitest 对插件 API 的扩展 */
  export function viteReact(): Plugin

  /** 允许以 CJS 形式导出 */
  export const viteReactForCjs: Plugin

  /** 提供扩展 API 与 Babel 选项类型 */
  export type Options = ReactPluginOptions
  export type BabelOptions = Record<string, unknown>
  export interface ReactBabelOptions extends BabelOptions {
    plugins?: Array<string | [string, Record<string, unknown>]>
    presets?: Array<string | [string, Record<string, unknown>]>
  }

  export interface ViteReactPluginApi {
    name: string
    config?: (config: UserConfig) => UserConfig | void
  }
}
