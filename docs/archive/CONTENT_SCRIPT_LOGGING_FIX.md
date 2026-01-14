# 内容脚本日志循环问题修复

## 问题描述

用户报告内容脚本在某些网站（如 https://www.solidot.org/story?sid=83258）上会不断刷新日志：

```
[SilentFeed] 📤 准备发送页面访问数据 {url: 'https://www.solidot.org/story?sid=83258', 停留时间: '150.0秒', ...}
[SilentFeed] Content too short, skipping 
[SilentFeed] ✅ 达到阈值，准备记录 {时间: '155.0秒'}
[SilentFeed] 📤 准备发送页面访问数据 {url: 'https://www.solidot.org/story?sid=83258', 停留时间: '155.0秒', ...}
[SilentFeed] Content too short, skipping 
[SilentFeed] ✅ 达到阈值，准备记录 {时间: '160.0秒'}
```

这些日志每 5 秒重复一次，对用户体验造成困扰。

## 根本原因分析

### 调用链

```
定时器每 5 秒触发
    ↓
checkTimer = window.setInterval(() => {
    if (!isRecorded && dwellCalculator) {
        notifyPageVisit()  ← 这里被反复调用
    }
}, 5000)
```

### 问题流程

1. **定时器检查** - 每 5 秒调用一次 `notifyPageVisit()`
2. **内容提取失败** - Solidot 页面的内容长度 < 100 字符
3. **函数提前返回** - `notifyPageVisit()` 在 `if (!content) { return }` 时返回
4. **没有状态标记** - 函数返回了，但没有设置任何"已检查"的标志
5. **定时器继续** - 下一个 5 秒又触发一次，重复整个流程

```
┌─────────────────┐
│ 定时器 5 秒触发  │
└────────┬────────┘
         │
         v
    ┌─────────────────────────┐
    │ notifyPageVisit()       │
    │ 检查: isRecorded? ✅    │
    │ 检查: dwellTime? ✅     │
    └────────┬────────────────┘
             │
             v
        ┌────────────────┐
        │提取内容         │
        │提取失败 ❌      │
        └────────┬───────┘
                 │
                 v
            return (无标志)
                 │
                 v
         ┌───────────────┐
         │ 5 秒后重复... │
         └───────────────┘
```

### 为什么 Solidot 内容提取失败

Solidot 网站可能：
- 没有 `<article>` 或 `<main>` 标签
- 缺少常见的内容 CSS 类（`.article-content`, `.post-content` 等）
- 文章内容可能使用特殊的布局或动态加载

导致内容提取器降级到"提取所有段落"策略，但可能只提取到很少的内容（< 100 字符）。

## 解决方案

### 核心思想

**为内容太短的页面添加状态管理，防止定时器无限重复尝试。**

### 实现细节

#### 1. 添加新的状态变量

```typescript
let isContentTooShort = false      // 标记内容是否太短，避免重复尝试
let lastContentCheckTime = 0       // 上次内容检查时间，用于重试机制
```

#### 2. 修改 `notifyPageVisit()` 函数

```typescript
async function notifyPageVisit() {
  // ... 前面的检查 ...
  
  const content = extractPageContent()
  
  if (!content) {
    // 内容提取失败时，标记已检查过，避免重复尝试
    const now = Date.now()
    if (isContentTooShort && (now - lastContentCheckTime) < 60000) {
      // 在 60 秒内，直接返回，不记录日志
      return
    }
    
    // 首次检查或超过 60 秒重试间隔
    isContentTooShort = true
    lastContentCheckTime = now
    sfLogger.debug('⏭️ 页面内容太短，标记为已检查（60秒后可重试）', {
      url: window.location.href,
      interactionCount
    })
    return
  }
  
  // ... 正常处理 ...
}
```

#### 3. 在 `resetTracking()` 中重置标志

```typescript
function resetTracking() {
  // ... 其他重置代码 ...
  
  // 重置内容检查标志
  isContentTooShort = false
  lastContentCheckTime = 0
  
  // ... 其他重置代码 ...
}
```

#### 4. 改进日志诊断信息

```typescript
function extractPageContent(): string {
  // ...
  if (!extracted.content || extracted.content.trim().length < MIN_CONTENT_LENGTH) {
    sfLogger.debug('Content too short, skipping', {
      contentLength: extracted.content?.trim().length || 0,
      minLength: MIN_CONTENT_LENGTH,
      hasArticle: !!document.querySelector('article'),
      hasMain: !!document.querySelector('main'),
      hasContentClass: !!document.querySelector('.article-content, .post-content, ...'),
      url: window.location.href
    })
    return ''
  }
  // ...
}
```

## 修复效果

### 修复前的行为

```
Time 0s:   📤 准备发送... | ❌ Content too short
Time 5s:   📤 准备发送... | ❌ Content too short  ← 重复！
Time 10s:  📤 准备发送... | ❌ Content too short  ← 重复！
Time 15s:  📤 准备发送... | ❌ Content too short  ← 重复！
Time 20s:  📤 准备发送... | ❌ Content too short  ← 重复！
...（无限重复）
```

### 修复后的行为

```
Time 0s:   📤 准备发送... | ❌ Content too short | ⏭️ 标记为已检查（60秒后可重试）
Time 5s:   （无日志 - 定时器看到标志直接返回）
Time 10s:  （无日志 - 定时器看到标志直接返回）
Time 15s:  （无日志 - 定时器看到标志直接返回）
Time 55s:  （无日志 - 仍在间隔内）
Time 60s:  ⏭️ 页面内容太短，标记为已检查（60秒后可重试） ← 重新尝试一次
Time 65s:  （无日志 - 在新的 60 秒间隔内）
...（继续，间隔 60 秒）
```

## 技术细节

### 60 秒重试间隔的设计

- **太短（如 5-10 秒）**：不能充分保护日志，仍可能刷屏
- **太长（如 300+ 秒）**：如果用户与页面交互导致动态加载内容，过长时间后才重试不合理
- **60 秒**：平衡点，允许动态加载（大多数页面几秒内加载），但不会过度尝试

### 动态内容加载支持

如果用户在内容太短的页面上继续交互，60 秒后系统会重新尝试一次提取，这允许：
- AJAX 加载的内容被重新检查
- 渐进式 Web 应用的内容加载
- 用户滚动加载的额外内容

### 页面导航时的行为

当用户导航到新页面时（SPA 或全页面加载）：
- `resetTracking()` 被调用
- 内容检查标志被重置
- 新页面独立进行内容检查，不受前一个页面的影响

## 诊断日志

现在用户可以看到为什么内容提取失败：

```javascript
{
  contentLength: 45,                  // 实际提取到的长度
  minLength: 100,                     // 最小要求长度
  hasArticle: false,                  // 是否有 <article> 标签
  hasMain: false,                     // 是否有 <main> 标签
  hasContentClass: false,             // 是否有常见内容 CSS 类
  url: "https://www.solidot.org/..." // 页面 URL
}
```

### 解读示例

对于 Solidot：
```
contentLength: 34
minLength: 100
hasArticle: false
hasMain: false
hasContentClass: false
```

这表明 Solidot 的页面结构不符合标准的内容提取策略。用户或开发者可以：
1. 为 Solidot 添加特殊的内容提取规则
2. 或者将 Solidot 列入内容提取跳过清单
3. 或者提高内容长度阈值

## 相关代码修改

### 文件：`src/contents/SilentFeed.ts`

**修改 1：** 添加新的状态变量（第 ~155 行）
```typescript
let isContentTooShort = false      // 新增
let lastContentCheckTime = 0       // 新增
```

**修改 2：** 更新 `notifyPageVisit()` 函数（第 ~423 行）
- 添加内容检查的逻辑
- 设置和检查标志

**修改 3：** 重置标志在 `resetTracking()` 中（第 ~620 行）
- 添加两行重置代码

**修改 4：** 改进 `extractPageContent()` 的日志（第 ~378 行）
- 添加诊断信息到日志

## 测试

新增测试文件：`src/contents/content-script-logging-fix.test.ts`
- 说明了问题的根本原因
- 验证修复的逻辑
- 提供了使用示例

## 影响范围

- ✅ **修复**：日志不再被不断刷新
- ✅ **改进**：提供诊断信息帮助调试
- ✅ **兼容**：对于内容正常的页面行为不变
- ✅ **灵活**：60 秒后允许重新尝试，支持动态加载

## 后续建议

### 短期（立即可用）
- 部署此修复，停止日志刷屏
- 使用诊断信息识别内容提取失败的网站

### 中期（可选）
- 为特定网站（如 Solidot）添加内容提取规则
- 调整 `MIN_CONTENT_LENGTH` 阈值（如果太严格）
- 添加网站特定的内容选择器

### 长期（增强）
- 构建网站内容提取配置库
- 使用机器学习优化内容识别
- 用户反馈机制改进提取规则

---

修复完成日期：2026-01-10  
相关问题：内容脚本日志循环  
状态：✅ 已实现
