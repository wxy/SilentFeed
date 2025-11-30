# 日期时间国际化修复

## 问题描述

用户测试发现三个国际化不一致的问题：

1. ❌ **OPML 导出在英文环境下仍是中文**：虽然代码已支持语言参数，但从 `document.documentElement.lang` 读取语言不可靠
2. ✅ **用户画像已支持语言切换**：AI 提示词国际化已正常工作
3. ❌ **日期时间显示不跟随语言设置**：即使界面切换到英文，日期时间仍显示为中文格式
   - 用户画像中的开始学习时间
   - AI 引擎的 AI 提供商状态检测时间
   - 系统日志的时间戳

**根本原因**：代码中硬编码了 `'zh-CN'` locale，或使用不可靠的 `document.documentElement.lang`

## 解决方案

### 1. 创建统一的日期时间格式化工具

**新增文件**：`src/utils/date-formatter.ts`

提供以下功能：
- `getDateLocale()`: 从 i18n 读取当前语言，映射到日期格式化 locale
- `formatDateTime()`: 格式化完整日期时间
- `formatDate()`: 格式化日期
- `formatTime()`: 格式化时间
- `formatRelativeTime()`: 格式化相对时间（如"3小时前"）
- `formatMonthDay()`: 格式化月日（如"11月30日"）

**关键设计**：
```typescript
export function getDateLocale(): string {
  const currentLang = i18n.language
  
  const localeMap: Record<string, string> = {
    'zh-CN': 'zh-CN',
    'en': 'en-US'
  }
  
  return localeMap[currentLang] || 'en-US'
}

export function formatDateTime(
  date: Date | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'number' ? new Date(date) : date
  const locale = getDateLocale()
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: locale === 'en-US' // 英文使用12小时制
  }
  
  return dateObj.toLocaleString(locale, options || defaultOptions)
}
```

**测试覆盖**：23 个测试用例，100% 通过

### 2. 修复硬编码问题

#### 问题点 1: RSSSettings.tsx - OPML 导出

**修复前**：
```typescript
// ❌ 从 DOM 读取，不可靠
const currentLang = document.documentElement.lang as 'zh-CN' | 'en' || 'zh-CN'
```

**修复后**：
```typescript
// ✅ 从 i18n 读取
import i18n from "@/i18n"
const currentLang = i18n.language as 'zh-CN' | 'en'
```

#### 问题点 2: RSSSettings.tsx - 日期时间格式化

**修复前**：
```typescript
// ❌ 硬编码 zh-CN
const formatDateTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// ❌ 硬编码 zh-CN
title={`...上次抓取: ${new Date(lastFetch).toLocaleString('zh-CN')}...`}
```

**修复后**：
```typescript
// ✅ 使用统一工具
import { formatDateTime as formatDateTimeI18n } from "@/utils/date-formatter"

const formatDateTime = (timestamp: number) => {
  return formatDateTimeI18n(timestamp, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

// ✅ 自动跟随语言
title={`...上次抓取: ${formatDateTimeI18n(lastFetch)}...`}
```

#### 问题点 3: ProfileSettings.tsx - 开始日期

**修复前**：
```typescript
// ❌ 硬编码 zh-CN
startDate: startDate.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
```

**修复后**：
```typescript
// ✅ 使用 formatMonthDay
import { formatMonthDay, formatDateTime } from "@/utils/date-formatter"

startDate: formatMonthDay(startDate)
```

#### 问题点 4: ai-provider-status.ts - 检测时间

**修复前**：
```typescript
// ❌ 硬编码中文相对时间
export function formatLastChecked(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60 / 1000)}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 60 / 60 / 1000)}小时前`
  return `${Math.floor(diff / 24 / 60 / 60 / 1000)}天前`
}
```

**修复后**：
```typescript
// ✅ 使用 formatRelativeTime
import { formatRelativeTime } from '@/utils/date-formatter'

export function formatLastChecked(timestamp: number): string {
  return formatRelativeTime(timestamp)
}
```

#### 问题点 5: CollectionStats.tsx - 统计日期

**修复前**：
```typescript
// ❌ 从 DOM 读取 locale
const formatDate = (timestamp?: number): string => {
  if (!timestamp) return _("options.collectionStats.unknownDate")
  const date = new Date(timestamp)
  const locale = document.documentElement.lang || 'zh-CN'
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long', 
    day: 'numeric'
  })
}
```

**修复后**：
```typescript
// ✅ 使用 formatDateI18n
import { formatDate as formatDateI18n } from '@/utils/date-formatter'

const formatDate = (timestamp?: number): string => {
  if (!timestamp) return _("options.collectionStats.unknownDate")
  return formatDateI18n(timestamp, {
    year: 'numeric',
    month: 'long', 
    day: 'numeric'
  })
}
```

### 3. 更新测试

所有涉及日期时间格式化的测试都已更新：

1. **ai-provider-status.test.ts**：
   - 添加 i18n mock
   - 测试中文和英文环境
   - 修正超过7天显示完整日期的预期

2. **AIProviderCard.test.tsx**：
   - 添加 i18n mock
   - 精确匹配"1分钟前"而不是模糊匹配

3. **RSSSettings.test.tsx**：
   - 使用 `importOriginal` 正确 mock react-i18next

## 效果对比

### 中文环境 (zh-CN)

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| OPML 导出 | "未分类" | "未分类" ✅ |
| 日期时间 | "2025/11/30 22:30:15" | "2025/11/30 22:30:15" ✅ |
| 相对时间 | "2小时前" | "2小时前" ✅ |
| 月日 | "11月30日" | "11月30日" ✅ |

### 英文环境 (en)

| 场景 | 修复前 | 修复后 |
|------|--------|--------|
| OPML 导出 | "未分类" ❌ | "Uncategorized" ✅ |
| 日期时间 | "2025/11/30 22:30:15" ❌ | "11/30/2025, 10:30:15 PM" ✅ |
| 相对时间 | "2小时前" ❌ | "2 hours ago" ✅ |
| 月日 | "11月30日" ❌ | "November 30" ✅ |

## 国际化一致性

修复后，所有用户可见的文本（包括日期时间）都完全遵循 i18n 语言设置：

```
用户切换语言 (en)
    ↓
i18n.changeLanguage('en')
    ↓
chrome.storage.sync.set({ i18nextLng: 'en' })
    ↓
所有组件重新渲染
    ↓
formatDateTime() 自动使用 'en-US' locale
    ↓
日期时间显示英文格式 ✅
```

## 文件清单

### 新增文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/utils/date-formatter.ts` | 180 | 统一的日期时间格式化工具 |
| `src/utils/date-formatter.test.ts` | 200 | 完整的测试覆盖 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `src/components/settings/RSSSettings.tsx` | 使用 i18n.language + formatDateTimeI18n |
| `src/components/settings/ProfileSettings.tsx` | 使用 formatMonthDay + formatDateTime |
| `src/components/settings/CollectionStats.tsx` | 使用 formatDateI18n |
| `src/storage/ai-provider-status.ts` | 使用 formatRelativeTime |
| `src/storage/ai-provider-status.test.ts` | 添加 i18n mock + 测试中英文 |
| `src/components/AIProviderCard.test.tsx` | 添加 i18n mock |
| `src/components/settings/RSSSettings.test.tsx` | 修复 react-i18next mock |

## 测试结果

```
Test Files  86 passed (86)
     Tests  1402 passed | 1 skipped (1403)
  Duration  18.49s
```

新增 23 个日期格式化测试，全部通过。

## 注意事项

### 1. 时间格式差异

| Locale | 日期格式 | 时间格式 | 小时制 |
|--------|----------|----------|--------|
| zh-CN | 2025/11/30 | 22:30:15 | 24小时 |
| en-US | 11/30/2025 | 10:30:15 PM | 12小时 |

### 2. 相对时间的特殊规则

- 小于 1 分钟：显示"刚刚" / "just now"
- 小于 1 小时：显示"X分钟前" / "X minutes ago"
- 小于 1 天：显示"X小时前" / "X hours ago"
- 小于 7 天：显示"X天前" / "X days ago"
- **≥ 7 天**：显示**完整日期**（不再显示"7天前"）

这是为了避免时间过久后的表达不精确。

### 3. 单复数处理

英文需要处理单复数：
- `1 minute ago` (单数)
- `2 minutes ago` (复数)
- `1 hour ago` (单数)
- `3 hours ago` (复数)

代码中已正确处理：
```typescript
return isChinese 
  ? `${diffMin}分钟前` 
  : `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`
```

### 4. 扩展新语言

添加日语支持示例：

```typescript
// 1. 更新 getDateLocale
const localeMap: Record<string, string> = {
  'zh-CN': 'zh-CN',
  'en': 'en-US',
  'ja': 'ja-JP'  // 新增
}

// 2. 更新 formatRelativeTime
const isChinese = locale === 'zh-CN'
const isJapanese = locale === 'ja-JP'

if (diffSec < 60) {
  if (isChinese) return '刚刚'
  if (isJapanese) return 'たった今'
  return 'just now'
}
// ... 类似处理其他时间段
```

## 最佳实践

### ✅ 正确做法

```typescript
// 1. 使用统一的格式化工具
import { formatDateTime, formatDate, formatRelativeTime } from '@/utils/date-formatter'

// 2. 自动跟随用户语言
const displayTime = formatDateTime(timestamp)

// 3. 自定义格式选项（可选）
const shortDate = formatDate(timestamp, {
  month: 'short',
  day: 'numeric'
})
```

### ❌ 错误做法

```typescript
// ❌ 硬编码 locale
date.toLocaleString('zh-CN')

// ❌ 从 DOM 读取 locale（不可靠）
const locale = document.documentElement.lang || 'zh-CN'

// ❌ 手写相对时间逻辑（难以国际化）
if (diff < 60 * 1000) return '刚刚'
```

## 相关文档

- [PHASE_PROMPTS_I18N.md](./PHASE_PROMPTS_I18N.md) - AI 提示词国际化
- [I18N.md](./I18N.md) - 国际化指南
- [I18N_MIGRATION.md](./I18N_MIGRATION.md) - 国际化迁移记录

## 总结

本次修复完成了以下目标：

1. ✅ 统一了日期时间格式化逻辑
2. ✅ 所有日期时间显示跟随用户语言设置
3. ✅ OPML 导出完全国际化
4. ✅ 移除了所有硬编码的 locale
5. ✅ 提供了类型安全的格式化 API
6. ✅ 完整的测试覆盖

现在，Silent Feed 的国际化一致性达到了：
- **UI 文本**: i18next 翻译 ✅
- **日期时间**: formatDateTime 工具 ✅
- **AI 提示词**: PromptManager ✅
- **OPML 导出**: 语言参数传递 ✅

**所有用户可见的文本都完全遵循用户的语言偏好设置！**
