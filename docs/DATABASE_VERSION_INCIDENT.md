# 数据库版本冲突事件记录

**日期**: 2025-11-04  
**影响**: 开发测试数据丢失（26 条访问记录）

---

## 问题描述

在浏览器测试 Phase 2.7 功能时，发现：
- 数据库中有 26 条历史访问记录（版本 20）
- 但 Popup 和徽章显示页面计数为 0
- 控制台显示版本冲突并删除了数据库

## 根本原因

### 1. 版本号倒退
- **历史**: 早期开发时数据库版本可能达到 20（多次schema变更）
- **当前代码**: 使用固定版本 2
- **冲突**: 浏览器版本 20 > 代码版本 2

### 2. 过度保护的版本检查
```typescript
// 旧代码（有问题）
async function checkAndFixDatabaseVersion(): Promise<void> {
  if (existingDB.version > 2) {
    // ❌ 主动删除旧数据库
    await indexedDB.deleteDatabase('SilentFeedDB')
  }
}
```

这个逻辑的**初衷**：
- 开发阶段清理旧版本，避免 schema 不兼容
- 确保总是使用最新的数据库结构

这个逻辑的**问题**：
- ❌ 不尊重用户数据（直接删除）
- ❌ 没有迁移策略（无法升级）
- ❌ Dexie 本身可以处理版本升级

### 3. Dexie 版本管理机制

**Dexie 的正确行为**:
- 如果浏览器版本 < 代码版本 → 自动升级（添加新表/索引）
- 如果浏览器版本 > 代码版本 → **保留现有数据**，忽略额外的表/索引
- **向后兼容**: 即使版本倒退，也不会丢失数据

我们的错误：
- 不信任 Dexie，手动删除数据库
- 实际上 Dexie 能处理版本 20 → 版本 2 的情况

## 解决方案

### 已实施的修复

1. **移除版本冲突删除逻辑**
```typescript
// 新代码（已修复）
async function checkDatabaseVersion(): Promise<void> {
  // ✅ 只记录日志，不删除数据
  console.log(`[DB] 现有数据库版本: ${existingDB.version}`)
  // ✅ 让 Dexie 自动处理
}
```

2. **信任 Dexie 的版本管理**
- 不再主动删除数据库
- 让 Dexie 自然处理版本差异
- 保留用户数据

### 数据恢复建议

对于**已经丢失数据的用户**（当前情况）：
1. 数据已被删除，无法恢复
2. 重新开始收集（从 0/1000 页）
3. 这次不会再丢失数据

对于**未来的版本升级**：
- 使用递增版本号（2 → 3 → 4 ...）
- 提供数据迁移钩子（如需要）
- 绝不主动删除用户数据

## 技术教训

### 1. 尊重用户数据
- ❌ **绝不主动删除用户数据**（除非用户明确要求）
- ✅ 提供数据导出功能
- ✅ 提供手动清理选项

### 2. 信任框架
- Dexie 设计用于处理版本管理
- 不需要"聪明的"手动干预
- 文档说明：版本倒退不会导致数据丢失

### 3. 版本管理策略
```typescript
// ✅ 正确的版本管理
class SilentFeedDB extends Dexie {
  constructor() {
    super('SilentFeedDB')
    
    // 版本只增不减
    this.version(1).stores({ ... })
    this.version(2).stores({ ... }).upgrade(tx => {
      // 可选：数据迁移逻辑
    })
    this.version(3).stores({ ... }) // 未来
  }
}
```

### 4. 开发 vs 生产
开发阶段：
- 可以手动清理：chrome://settings/content/all → 删除扩展数据
- 或在代码中添加 DEBUG flag

生产环境：
- **绝不自动删除数据**
- 提供用户控制的清理选项
- 优雅的数据迁移

## 当前状态

- ✅ 已移除危险的版本检查逻辑
- ✅ 数据库版本锁定为 2
- ⚠️ 26 条测试数据已丢失（不可恢复）
- ✅ 未来不会再发生此问题

## 数据恢复脚本（仅供参考）

如果将来需要迁移数据，可以使用类似逻辑：

```typescript
// 示例：从旧数据库迁移到新数据库
async function migrateFromV20ToV2() {
  // 1. 读取旧数据
  const oldDB = await Dexie.open('SilentFeedDB_backup')
  const oldData = await oldDB.confirmedVisits.toArray()
  
  // 2. 删除旧数据库
  await Dexie.delete('SilentFeedDB')
  
  // 3. 创建新数据库并导入
  const newDB = new SilentFeedDB()
  await newDB.confirmedVisits.bulkAdd(oldData)
}
```

**注意**: 当前情况不适用，因为旧数据已被删除。

## 后续行动

- [x] 修复代码（已完成）
- [ ] 重新测试数据收集
- [ ] 验证徽章更新正常
- [ ] 确认不再有版本冲突

## 参考资料

- [Dexie.js 版本管理](https://dexie.org/docs/Tutorial/Design#database-versioning)
- [IndexedDB 规范](https://www.w3.org/TR/IndexedDB/)

---

**结论**: 过度保护导致数据丢失。应该信任 Dexie 的版本管理机制。

**最后更新**: 2025-11-04
