# Phase 15 问题排除指南 (Troubleshooting Guide)

当手动测试时若遇到问题，按此指南排查。

## 🔴 问题 1: 推荐未能添加到清单

### 症状
- 切换到"阅读清单"模式后，推荐没有出现在 Chrome 阅读清单中
- 但没有任何错误提示

### 排查步骤

1. **检查浏览器支持**
   ```
   打开浏览器控制台 → 执行:
   chrome.readingList.query({})
   ```
   - 如果报错 "chrome.readingList is not defined"
   - 原因: 浏览器版本不支持（Chrome 120+ 才支持）
   - 解决: 升级 Chrome 到 120 以上版本

2. **检查扩展权限**
   ```
   右键扩展 → 扩展选项 → 权限
   ```
   - 需要有 "readingList" 权限
   - 检查 `manifest.json` 中是否有这个权限

3. **检查后台日志**
   ```
   右键扩展 → 检查后台 → 打开控制台
   ```
   - 查找 "转移到阅读清单" 或 "添加到阅读列表失败" 的日志
   - 如果看到 "添加失败"，记下错误信息

4. **检查推荐是否符合条件**
   ```
   推荐需要满足:
   - 状态: active (或不存在 status 字段)
   - 是否已读: isRead === false
   - 反馈: feedback !== 'dismissed' && feedback !== 'later'
   ```
   - 如果推荐被标记为已读或已删除，不会被转移

### 可能的原因和解决方案

| 原因 | 解决方案 |
|-----|--------|
| 浏览器不支持 | 升级到 Chrome 120+ |
| 推荐已读或已删除 | 检查推荐状态 |
| 权限不足 | 重新安装扩展 |
| API 调用失败 | 查看后台控制台日志 |

---

## 🟡 问题 2: URL 类型不对（翻译 vs 原文）

### 症状
- 推荐添加到清单后，点击链接打开的不是预期的网站
- 应该打开翻译页面的打开了原文
- 或相反

### 排查步骤

1. **检查翻译配置**
   ```
   选项页 → AI 配置 → 查看:
   - "翻译网页" 是否启用?
   - "自动翻译" 是否启用?
   ```

2. **检查推荐的翻译数据**
   ```
   后台控制台执行:
   const db = (await import('@/storage/db')).db
   const rec = await db.recommendations.get('recommendation-id')
   console.log(rec.translation)
   ```
   - 如果 `translation` 为 null，说明推荐未被翻译
   - 则应该使用原文链接

3. **检查订阅源翻译设置**
   ```
   RSS 设置 → 查看该订阅源是否禁用了翻译
   ```
   - 如果订阅源禁用翻译，即使全局启用也会使用原文

4. **重现问题**
   ```
   1. 在弹窗中查看推荐的 URL（悬停查看）
   2. 切换到清单模式
   3. 检查清单中的推荐 URL 是否相同
   ```

### 预期行为

```
如果启用翻译且推荐已翻译:
  弹窗中的 URL: https://translate.google.com/translate?...
  清单中的 URL: https://translate.google.com/translate?...  (应相同)
  ✅ 一致

如果禁用翻译或推荐未翻译:
  弹窗中的 URL: https://example.com
  清单中的 URL: https://example.com  (应相同)
  ✅ 一致
```

### 可能的原因

| 原因 | 检查方法 |
|-----|--------|
| 翻译配置被修改 | 查看选项页 AI 配置 |
| 推荐未被翻译 | 检查推荐的 translation 字段 |
| 订阅源禁用翻译 | 检查 RSS 设置 |
| 规范化 URL 不匹配 | 查看后台日志中的 URL 规范化过程 |

---

## 🔴 问题 3: 从清单切换回弹窗时，推荐未能恢复

### 症状
- 从清单切换回弹窗后
- 之前转移的推荐没有回到弹窗中
- 清单中的 🤫 标记条目仍然存在

### 排查步骤

1. **检查清单中的条目**
   ```
   Chrome 书签 → 阅读清单
   - 查看是否仍有 🤫 标记的条目
   - 如果有，说明删除失败
   ```

2. **检查映射关系**
   ```
   后台控制台执行:
   const db = (await import('@/storage/db')).db
   const mappings = await db.readingListEntries.toArray()
   console.log(mappings)
   ```
   - 应该为空（如果成功切换回弹窗）
   - 如果不为空，说明清理失败

3. **检查推荐的 displayLocation**
   ```
   const recommendations = await db.recommendations.toArray()
   const inReadingList = recommendations.filter(r => r.displayLocation === 'readingList')
   console.log(inReadingList)
   ```
   - 应该为空（都应该改为 'popup'）
   - 如果不为空，说明状态更新失败

4. **检查后台日志**
   ```
   右键扩展 → 检查后台 → 控制台
   ```
   - 查找 "恢复推荐到弹窗模式" 或 "删除阅读列表条目失败" 的日志

### 可能的原因和解决方案

| 原因 | 解决方案 |
|-----|--------|
| 清单删除 API 失败 | 检查后台日志中的错误信息 |
| 数据库映射关系损坏 | 手动清理清单中的 🤫 条目 |
| 推荐 ID 查询失败 | 检查 normalizeUrlForTracking() 的逻辑 |

### 手动恢复步骤

如果自动恢复失败：

1. 打开 Chrome 书签 → 阅读清单
2. 找到带有 🤫 前缀的条目
3. 右键删除
4. 打开扩展选项 → 高级 → 重新初始化数据库（如果有此选项）

---

## 🟡 问题 4: 切换时推荐缺失或重复

### 症状
- 从弹窗切换到清单后，推荐数量不对
- 或者出现重复的条目

### 排查步骤

1. **检查初始推荐数量**
   ```
   切换前在弹窗中记下有多少条活跃推荐
   ```

2. **检查转移日志**
   ```
   后台控制台执行:
   chrome.runtime.getBackgroundPage().then(bg => {
     console.log(bg.chrome.storage.local.get('transfer-log')
   })
   ```
   - 或在后台检查最近的日志信息

3. **查询已转移推荐**
   ```
   const db = (await import('@/storage/db')).db
   const inRL = await db.recommendations
     .where('displayLocation')
     .equals('readingList')
     .count()
   console.log('清单中的推荐数:', inRL)
   ```

4. **查询清单中的条目数**
   ```
   chrome.readingList.query({}).then(entries => {
     const ours = entries.filter(e => e.title.startsWith('🤫'))
     console.log('清单中由扩展管理的条目:', ours.length)
   })
   ```

### 预期结果

```
活跃推荐数 === displayLocation === 'readingList' 的数量 === 清单中 🤫 条目数
```

如果不相等，说明转移过程中出现了问题。

### 可能的原因

| 原因 | 检查方法 |
|-----|--------|
| 转移过程中新推荐生成 | 检查转移耗时和日志时间戳 |
| 某个推荐转移失败 | 查看后台日志中的失败记录 |
| 映射关系不完整 | 查询 readingListEntries 表 |

---

## 🟢 问题 5: 性能问题（切换很慢）

### 症状
- 从弹窗切换到清单时需要等待很长时间
- UI 冻结或无响应

### 排查步骤

1. **测量转移耗时**
   ```
   后台控制台查看日志的时间戳
   ```

2. **检查推荐数量**
   ```
   const db = (await import('@/storage/db')).db
   const activeCount = await db.recommendations.toArray().then(
     recs => recs.filter(r => !r.isRead && r.feedback !== 'dismissed')
   )
   console.log('需要转移的推荐数:', activeCount.length)
   ```
   - 如果超过 100 条，可能需要分批处理

3. **检查是否有其他后台任务**
   ```
   后台检查是否同时在进行:
   - 推荐生成
   - 翻译
   - 数据库迁移
   ```

### 优化建议

- 推荐数量很多时（>100），可以分批转移
- 考虑添加进度指示
- 可以在后续版本中优化数据库查询

---

## 🔍 常用调试命令

### 查看所有后台日志
```javascript
// 在扩展的后台 DevTools 中执行
const entries = performance.getEntriesByType('measure')
entries.forEach(e => console.log(`${e.name}: ${e.duration.toFixed(2)}ms`))
```

### 查看推荐数据库状态
```javascript
const db = (await import('@/storage/db')).db

// 活跃推荐
const active = await db.recommendations.where('isRead').equals(false).count()
console.log('活跃推荐:', active)

// 清单中的推荐
const inRL = await db.recommendations.where('displayLocation').equals('readingList').count()
console.log('清单中:', inRL)

// 弹窗中的推荐
const inPopup = await db.recommendations.where('displayLocation').equals('popup').count()
console.log('弹窗中:', inPopup)

// 映射关系
const mappings = await db.readingListEntries.count()
console.log('映射关系:', mappings)
```

### 清理调试数据
```javascript
// 清空所有映射关系
const db = (await import('@/storage/db')).db
await db.readingListEntries.clear()

// 重置所有推荐的 displayLocation
await db.recommendations.toCollection().modify(rec => {
  rec.displayLocation = 'popup'
})
```

### 查看后台错误日志
```
右键扩展 → "检查后台" → "控制台" 选项卡
查找 ERROR 或 WARN 级别的日志
```

---

## 📋 完整测试清单

使用此清单验证所有功能：

### 基础测试
- [ ] 切换到清单模式：推荐出现在 Chrome 阅读清单
- [ ] 推荐带有 🤫 前缀
- [ ] 推荐数量正确
- [ ] 切换回弹窗模式：推荐恢复
- [ ] 清单中的 🤫 条目被删除

### 翻译测试
- [ ] 启用翻译：推荐用翻译链接
- [ ] 禁用翻译：推荐用原文链接
- [ ] 切换模式前后，URL 类型保持一致

### 错误恢复测试
- [ ] 某个推荐转移失败时，其他推荐正常转移
- [ ] 恢复时某个推荐失败，不影响其他恢复

### 边界条件测试
- [ ] 清单中没有推荐时切换：无错误
- [ ] 推荐都已读时切换：转移 0 条
- [ ] 推荐都被删除时切换：转移 0 条

---

## 📞 联系与反馈

如果问题未在本指南中覆盖，请：

1. 收集后台日志（右键扩展 → 检查后台 → 复制所有日志）
2. 记录操作步骤（最小化重现）
3. 报告问题时附上日志和步骤

关键信息:
- Chrome 版本
- 扩展版本 (在 manifest.json 中查看)
- 操作系统
- 推荐数量
- 错误信息

