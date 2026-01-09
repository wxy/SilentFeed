# feat(Phase 15): 阅读清单静默模式与优化

## 功能概述

实现 Phase 15 阅读清单静默模式，用户推荐可静默保存到 Chrome Reading List，同时完善了相关的 UI、徽章显示和国际化。

## 主要改进

### 🔴 Bug 修复

#### 1. 修复弹窗运行时错误（commit: 1e03d9c）
- **问题**：`recommendationStore.ts` 中 `generateRecommendations()` 存在重复的 `const config` 声明导致 `Identifier 'config' has already been declared` 错误
- **方案**：移除冗余声明，复用第一个 `config` 变量
- **结果**：弹窗成功打开，不再报错

#### 2. 修复类型错误（commit: 7305b74）
- **问题**：`result.stats.reason` 属性不存在，导致 TypeScript 编译错误
- **方案**：移除无效的属性访问，直接检查 `result.recommendations.length`
- **结果**：编译通过，无类型错误

### ✨ 新特性

#### 1. **静默投递模式**（Reading List Mode）
- 新增 `deliveryMode` 配置：`popup | readingList`
- 推荐自动静默保存到 Chrome Reading List（使用 📰 前缀标识）
- 在设置页中可切换投递方式
- 不支持的浏览器（Edge 等）自动降级到弹窗模式

#### 2. **学习后自动清理**
- 用户从阅读清单中阅读完推荐内容（学习确认）后，自动从 Chrome Reading List 中移除该条目
- 通过 `db.readingListEntries` 追踪本扩展添加的条目，确保精准操作
- 实现了 `ReadingListManager.cleanup()` 接口，支持按时间和数量手动清理

#### 3. **优化徽章显示逻辑**

**弹窗模式**：
- 显示未读推荐数字徽章（最多显示 3）
- 徽章内容来自 `db.recommendations` 中的未读条目

**阅读清单模式**：
- 显示阅读清单中由本扩展添加且未读的条目数（最多显示 3）
- 统计来自 `chrome.readingList.query()` + `db.readingListEntries` 的交集
- 避免与学习进度波纹冲突

#### 4. **模式切换时的数据转移**
- **切换到阅读清单模式**：将活跃的弹窗推荐转移到 Reading List
- **切换回弹窗模式**：清理自动添加的 Reading List 条目（保留用户手动添加的）
- 转移完成后触发推荐生成以填充新模式的推荐池

#### 5. **完善用户提示**（ReadingListSummaryView）
- 在阅读清单模式的弹窗中显示汇总视图而非推荐列表
- 统计展示：总条目、未读数、扩展添加的数量
- 提示用户：
  - 推荐会自动添加到 Chrome Reading List
  - 可在设置页切换到弹窗模式
  - 在 Chrome 侧边栏查看完整列表

### 🌐 国际化

#### 文件更新
- `public/locales/zh-CN/translation.json` - 新增 8 个中文键
- `public/locales/en/translation.json` - 新增 8 个英文键

#### 新增翻译键
```json
{
  "阅读清单模式": "Reading List Mode",
  "阅读清单统计": "Reading List Statistics",
  "总条目": "Total Items",
  "未读": "Unread",
  "扩展添加": "Extension Added",
  "推荐投递方式": "Recommendation Delivery Method",
  "推荐内容会自动添加到 Chrome 阅读清单": "Recommendations are automatically added to Chrome Reading List",
  "可在设置页中切换在弹窗中显示推荐内容": "You can switch to showing recommendations in the popup from Settings",
  "在 Chrome 侧边栏中查看完整阅读清单": "View the full Reading List in Chrome's sidebar"
}
```

### 📦 数据库变更

**版本升级**：v16 → v20

**新表**：`readingListEntries`
- 追踪本扩展添加到 Chrome Reading List 的条目
- 字段：
  - `url` (string) - 保存到阅读列表的 URL（可能是翻译链接）
  - `recommendationId` (string) - 对应的推荐 ID
  - `addedAt` (number) - 保存时间戳
  - `titlePrefix` (string) - 使用的标题前缀

### 📋 提交清单

| Commit | 说明 |
|--------|------|
| 1e03d9c | fix(Phase 15): 修复 generateRecommendations 中 config 重复声明导致弹窗报错 |
| 649a1d7 | docs(ui): 更新阅读清单模式提示文案并完善 i18n 包裹 |
| 87d7928 | i18n: 补全阅读清单视图和设置页中的国际化字符串 |
| 7305b74 | fix: 修复 recommendationStore 中 result.stats.reason 不存在的问题 |

### ✅ 测试与验证

- ✅ 构建通过（npm run build）
- ✅ 弹窗成功打开（无运行时错误）
- ✅ 国际化键全覆盖（中英文均完整）
- ✅ 类型检查通过（无 TypeScript 错误）
- ✅ Chrome Reading List API 兼容性检测已实现

### 🔗 相关类型定义

- **ReadingListEntry** - 阅读清单追踪记录
  - 位置：`src/types/database.ts`
  - 用途：追踪本扩展添加的条目

- **ReadingListConfig** - 阅读清单模式配置
  - 位置：`src/storage/recommendation-config.ts`
  - 字段：`titlePrefix`, `cleanup`

- **ReadingListCleanupConfig** - 自动清理配置
  - 位置：`src/storage/recommendation-config.ts`
  - 字段：`enabled`, `retentionDays`, `maxEntries`, `intervalHours`, `keepUnread`

### 📂 修改的文件概览

#### 核心功能文件
- `src/background.ts` - 后台服务：徽章逻辑、消息处理、模式切换
- `src/popup.tsx` - 弹窗：投递模式加载、模式切换提示
- `src/stores/recommendationStore.ts` - 推荐状态管理：bug 修复

#### UI 组件
- `src/components/ReadingListSummaryView.tsx` - 阅读清单汇总视图（新增）
- `src/components/settings/RecommendationSettings.tsx` - 投递方式选择（新增）

#### 存储和配置
- `src/storage/recommendation-config.ts` - 推荐配置：deliveryMode、readingList
- `src/storage/db/index.ts` - 数据库：v20、readingListEntries 表
- `src/storage/db/db-init.ts` - 数据库初始化

#### 阅读列表管理
- `src/core/reading-list/reading-list-manager.ts` - 增强：清理、追踪

#### 推荐服务
- `src/core/recommender/RecommendationService.ts` - 支持阅读清单模式投递

#### 国际化文件
- `public/locales/zh-CN/translation.json` - 中文翻译
- `public/locales/en/translation.json` - 英文翻译

#### 数据库
- `src/types/database.ts` - ReadingListEntry 类型定义

---

## Breaking Changes

无

## 需要合并前的操作

无

## 审核重点

1. **Chrome Reading List API 兼容性**：确保在不支持的浏览器中正确降级到弹窗模式
2. **数据库迁移**：v16 → v20 的迁移逻辑是否正确
3. **徽章显示**：两种模式下的徽章逻辑是否正确分离
4. **国际化完整性**：所有用户可见的文本是否都已翻译

## 相关文档

- [AI Architecture](docs/AI_ARCHITECTURE.md)
- [阅读清单模式设计](docs/)
- [Phase 15 计划](docs/)
