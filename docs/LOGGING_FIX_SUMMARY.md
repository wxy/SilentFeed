# 内容脚本日志循环问题修复 - 快速总结

## 问题

内容脚本在某些网站（如 Solidot）上不断刷新日志，每 5 秒重复：
```
📤 准备发送页面访问数据
Content too short, skipping
✅ 达到阈值，准备记录
```

## 原因

定时器每 5 秒调用 `notifyPageVisit()`，但当内容提取失败时，函数只是返回，**没有设置任何标志**，导致定时器继续重复。

## 修复

在 `src/contents/SilentFeed.ts` 中：

### 1. 添加状态变量（第 ~155 行）
```typescript
let isContentTooShort = false      // 标记内容太短
let lastContentCheckTime = 0       // 记录检查时间
```

### 2. 修改 `notifyPageVisit()` 函数
当内容为空时，检查是否在重试间隔内（60 秒）：
- 如果在间隔内：直接返回，不记录日志 → **防止刷屏**
- 如果超过间隔：允许重新尝试一次 → **支持动态加载**

### 3. 重置 `resetTracking()` 中的标志
页面导航时重置，新页面独立处理

### 4. 改进日志诊断信息
添加内容长度、是否有 `<article>` 标签等信息，帮助诊断

## 效果

| 修改前 | 修改后 |
|--------|--------|
| 日志每 5 秒刷新一次 | 首次记录一次，60 秒后如果仍然太短再记录一次 |
| 无诊断信息 | 提供详细的诊断信息 |
| 用户困惑 | 清楚地看到为什么页面被跳过 |

## 日志示例

**修改前**（每 5 秒重复）：
```
[SilentFeed] 📤 准备发送页面访问数据 {url: '...', 停留时间: '150.0秒', ...}
[SilentFeed] Content too short, skipping
[SilentFeed] 📤 准备发送页面访问数据 {url: '...', 停留时间: '155.0秒', ...}
[SilentFeed] Content too short, skipping
[SilentFeed] 📤 准备发送页面访问数据 {url: '...', 停留时间: '160.0秒', ...}
[SilentFeed] Content too short, skipping
```

**修改后**（只记录一次）：
```
[SilentFeed] 📤 准备发送页面访问数据 {url: '...', 停留时间: '30.0秒', ...}
[SilentFeed] Content too short, skipping {contentLength: 45, minLength: 100, hasArticle: false, ...}
[SilentFeed] ⏭️ 页面内容太短，标记为已检查（60秒后可重试）
（后续无日志，直到 60 秒后重新检查）
```

## 文件修改

| 文件 | 修改内容 |
|------|---------|
| `src/contents/SilentFeed.ts` | 添加状态变量，修改 `notifyPageVisit()` 和 `resetTracking()` |
| `src/contents/content-script-logging-fix.test.ts` | 新增测试文件（说明文档） |
| `docs/CONTENT_SCRIPT_LOGGING_FIX.md` | 新增详细文档 |

## 技术亮点

✅ **防止日志刷屏** - 内容太短的页面在 60 秒内只记录一次  
✅ **支持动态加载** - 60 秒后允许重新检查，支持 AJAX/SPA 内容加载  
✅ **改进诊断** - 提供详细的日志，帮助识别问题  
✅ **不影响正常页面** - 内容充足的页面行为完全不变  
✅ **兼容性强** - 与现有功能无冲突  

## 下一步

1. ✅ **部署** - 立即部署此修复
2. 📊 **监控** - 收集数据看是否还有其他网站有类似问题
3. 🔧 **优化** - 如果发现其他网站需要，可添加特定的内容提取规则

---

修复状态：✅ 完成  
影响：消除不必要的日志刷屏，改进用户体验
