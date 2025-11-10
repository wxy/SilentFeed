# UI 主题改进功能文档

**完成日期**: 2025-11-10
**分支**: feature/ui-theme-improvements

## 功能概述

为 FeedAIMuter 扩展添加完整的明暗主题支持，解决手绘风格在暗色环境下的适配问题，并提供用户可控的主题选择。

## 问题背景

### 原有问题

1. **手绘风格缺少暗色主题**
   - 手绘风格（sketchy）只有明亮主题
   - 在系统暗色模式下显示效果差，可读性低
   - 用户无法手动选择主题

2. **主题冲突**
   - `style.css` 使用 `@media (prefers-color-scheme: dark)` 自动切换
   - 与手动主题选择产生冲突
   - 无法实现用户强制覆盖系统主题

3. **样式文件组织混乱**
   - `style.css` 在 src 根目录
   - `sketchy.css` 在 src/styles 目录
   - 缺少统一的样式管理

## 解决方案

### 1. 主题模式系统

#### 数据模型
```typescript
// src/storage/ui-config.ts
export type ThemeMode = "auto" | "light" | "dark"

// 存储到 chrome.storage.sync
{
  ui_style: "sketchy" | "normal",
  theme_mode: "auto" | "light" | "dark"
}
```

#### 主题应用逻辑
```typescript
// src/hooks/useTheme.ts
export function useTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>("auto")
  const [appliedTheme, setAppliedTheme] = useState<"light" | "dark">("light")
  
  // auto 模式：跟随系统
  // light/dark 模式：强制应用
  
  // 应用到 DOM: document.documentElement.classList.add/remove("dark")
}
```

### 2. CSS 主题系统重构

#### 修复主题冲突

**之前**（使用 media query）:
```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg-base: 10 10 10;
  }
}
```

**之后**（使用 .dark 类）:
```css
.dark {
  --bg-base: 10 10 10;
}
```

这样可以通过 JavaScript 完全控制主题，避免与系统主题冲突。

#### 手绘风格暗色主题

为所有 sketchy 样式类添加暗色变体：

```css
/* src/styles/sketchy.css */

.dark .sketchy-container {
  background: var(--sketchy-paper-night);
}

.dark .sketchy-title {
  color: var(--sketchy-ink-dark);
}

.dark .sketchy-button {
  background: var(--sketchy-paper-dark-night);
  color: var(--sketchy-ink-dark);
  box-shadow: 
    2px 2px 0 rgba(255, 255, 255, 0.1),
    -1px -1px 0 rgba(0, 0, 0, 0.3);
}

/* ... 其他样式类 */
```

### 3. 样式文件重组

**重组前**:
```
src/
├── style.css          # 全局样式
└── styles/
    └── sketchy.css    # 手绘风格
```

**重组后**:
```
src/
└── styles/
    ├── global.css     # 全局样式（重命名）
    └── sketchy.css    # 手绘风格
```

### 4. UI 集成

#### 设置页面添加主题选择器

```tsx
// src/options.tsx

import { useTheme } from "@/hooks/useTheme"

function IndexOptions() {
  const { themeMode, setThemeMode } = useTheme()
  
  return (
    <select value={themeMode} onChange={(e) => setThemeMode(e.target.value)}>
      <option value="auto">🌗 跟随系统</option>
      <option value="light">☀️ 明亮主题</option>
      <option value="dark">🌙 暗色主题</option>
    </select>
  )
}
```

#### Popup 页面应用主题

```tsx
// src/popup.tsx

import { useTheme } from "@/hooks/useTheme"

function IndexPopup() {
  useTheme() // 自动应用主题到 DOM
  // ...
}
```

## 技术实现

### 文件变更

#### 新增文件

1. **src/hooks/useTheme.ts** (84 lines)
   - React Hook 管理主题状态
   - 监听存储变化
   - 监听系统主题变化（auto 模式）
   - 应用主题到 DOM

2. **src/hooks/useTheme.test.ts** (357 lines)
   - 18 个测试用例
   - 覆盖所有主题模式切换场景
   - 测试系统主题跟随
   - 测试错误处理

#### 修改文件

1. **src/storage/ui-config.ts** (+58 lines)
   ```typescript
   // 新增类型
   export type ThemeMode = "auto" | "light" | "dark"
   
   // 新增函数
   export async function getThemeMode(): Promise<ThemeMode>
   export async function setThemeMode(mode: ThemeMode): Promise<void>
   export function watchThemeMode(callback: (mode: ThemeMode) => void)
   export function getAppliedTheme(mode: ThemeMode): "light" | "dark"
   export function watchSystemTheme(callback: (isDark: boolean) => void)
   ```

2. **src/storage/ui-config.test.ts** (+155 lines)
   - 新增 12 个主题模式测试
   - 测试存储读写
   - 测试监听器机制
   - 测试系统主题检测

3. **src/styles/global.css** (原 style.css，修改 35 lines)
   - 移除 `@media (prefers-color-scheme: dark)`
   - 改用 `.dark` 类控制暗色主题
   - 保持所有 CSS 变量定义

4. **src/styles/sketchy.css** (+35 lines)
   - 为所有 sketchy 类添加 `.dark` 变体
   - 调整暗色下的颜色、阴影、边框
   - 保持手绘风格的视觉特点

5. **src/options.tsx** (+32 lines)
   - 导入 `useTheme` hook
   - 添加主题模式选择器
   - 添加主题说明文案

6. **src/popup.tsx** (+2 lines)
   - 导入 `useTheme` hook
   - 调用 hook 应用主题

7. **public/locales/zh-CN/translation.json** (+5 keys)
   ```json
   {
     "options.general.themeMode": "主题模式",
     "options.general.themeModeAuto": "🌗 跟随系统",
     "options.general.themeModeLight": "☀️ 明亮主题",
     "options.general.themeModeDark": "🌙 暗色主题",
     "options.general.themeModeDescription": "选择明暗主题，或跟随系统设置自动切换"
   }
   ```

8. **public/locales/en/translation.json** (自动生成)
   - 通过 `npm run i18n:translate` 生成英文翻译

### 测试覆盖

**新增测试**: +30 个
- `src/storage/ui-config.test.ts`: +12 tests
- `src/hooks/useTheme.test.ts`: +18 tests

**测试总数**: 583 个（100% 通过）

**覆盖场景**:
- ✅ 主题模式存储（auto/light/dark）
- ✅ 主题模式切换
- ✅ 系统主题检测
- ✅ 系统主题变化响应
- ✅ DOM 类应用（add/remove "dark"）
- ✅ 存储变化监听
- ✅ 组件卸载清理
- ✅ 错误处理

## 用户体验

### 主题选择流程

1. **打开设置页面** (Options)
2. **选择 General 标签**
3. **找到主题模式选项**
4. **选择期望的主题**:
   - 🌗 跟随系统 - 自动跟随操作系统设置
   - ☀️ 明亮主题 - 强制使用明亮主题
   - 🌙 暗色主题 - 强制使用暗色主题

### 主题应用

主题立即生效，无需刷新：
- 设置页面实时更新
- Popup 页面实时更新
- 所有界面元素同步变化

### 跨标签同步

使用 `chrome.storage.sync`:
- 主题设置在所有标签页同步
- 打开的多个 popup 同步更新
- 切换主题后所有窗口即时响应

## 界面效果

### 标准风格（Normal）

**明亮主题**:
- 白色背景
- 深色文字
- 绿色主色调

**暗色主题**:
- 深灰背景
- 浅色文字
- 亮绿色主色调

### 手绘风格（Sketchy）

**明亮主题**:
- 米白色纸张纹理
- 深色墨水笔触
- 手绘边框和阴影

**暗色主题** ✨ (新增):
- 深色纸张纹理
- 浅色墨水笔触
- 调整后的手绘效果
- 保持手绘风格特点

## 技术亮点

### 1. 主题冲突解决

**问题**: `@media (prefers-color-scheme: dark)` 与手动主题选择冲突

**解决**: 
- 移除 media query
- 使用 `.dark` 类完全控制
- JavaScript 管理 DOM 类

### 2. 系统主题跟随

```typescript
// auto 模式下监听系统主题变化
const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

mediaQuery.addEventListener("change", (e) => {
  const isDark = e.matches
  callback(isDark)
})
```

### 3. React Hook 设计

```typescript
export function useTheme() {
  // 状态管理
  const [themeMode, setThemeModeState] = useState<ThemeMode>("auto")
  const [appliedTheme, setAppliedTheme] = useState<"light" | "dark">("light")
  
  // 初始化
  useEffect(() => { /* 从存储加载 */ }, [])
  
  // 监听存储变化
  useEffect(() => { /* watchThemeMode */ }, [])
  
  // 监听系统主题（仅 auto 模式）
  useEffect(() => { /* watchSystemTheme */ }, [themeMode])
  
  // 应用到 DOM
  useEffect(() => { /* add/remove .dark */ }, [appliedTheme])
  
  return { themeMode, appliedTheme, isDark, setThemeMode }
}
```

### 4. 清理机制

所有监听器都返回清理函数：
```typescript
export function watchThemeMode(callback) {
  const listener = (changes) => { /* ... */ }
  chrome.storage.onChanged.addListener(listener)
  
  return () => {
    chrome.storage.onChanged.removeListener(listener)
  }
}
```

## 性能考虑

### 存储优化

- 使用 `chrome.storage.sync` 自动同步
- 单一键值存储主题模式
- 避免频繁写入

### DOM 操作优化

- 只在主题变化时操作 DOM
- 使用 `classList` API 高效修改
- 避免重绘和重排

### 监听器管理

- 组件卸载时清理监听器
- 避免内存泄漏
- 系统主题监听仅在 auto 模式开启

## 已知限制

### 1. 首次加载闪烁

**现象**: 页面加载时可能短暂显示错误主题

**原因**: React 组件挂载后才应用主题

**缓解**: 
- 使用 `auto` 模式可以减少闪烁
- 后续可以考虑 SSR 或预加载优化

### 2. 跨上下文限制

**问题**: Content Script 和 Background 无法直接使用 React Hook

**解决**: 
- 仅在 Popup 和 Options 使用 hook
- Content Script 如需主题，直接读取存储
- Background 不需要主题

## 后续优化

### 短期

- [ ] 添加主题切换动画
- [ ] 优化首次加载闪烁
- [ ] 添加主题预览功能

### 长期

- [ ] 支持自定义主题颜色
- [ ] 导入/导出主题配置
- [ ] 更多手绘风格变体
- [ ] 高对比度主题（无障碍）

## 总结

本次主题改进功能完整解决了手绘风格暗色适配问题，提供了用户可控的主题选择，并优化了样式文件组织。所有功能都经过完整测试，确保稳定性和可靠性。

**完成指标**:
- ✅ 手绘风格暗色主题支持
- ✅ 主题模式选择器（auto/light/dark）
- ✅ 系统主题跟随功能
- ✅ 样式文件重组
- ✅ 30 个新增测试
- ✅ 583 个测试全部通过
- ✅ 国际化支持（中英文）
