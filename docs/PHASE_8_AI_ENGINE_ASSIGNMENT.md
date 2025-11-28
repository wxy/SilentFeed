# Phase 8: AI 引擎分配功能 ✅

> **功能目标**: 允许用户为不同用途分配不同的 AI 引擎，优化成本、性能和隐私的平衡
>
> **状态**: ✅ **已完成** (2025年11月28日)  
> **开发周期**: Phase 8 (2025年11月27-28日)  
> **创建时间**: 2025年11月27日

---

## 📊 完成情况

### 实施步骤

- ✅ **Step 1**: 类型定义 (24 tests passed)
- ✅ **Step 2**: 存储层 (20 tests passed)
- ✅ **Step 3**: UI 组件 + i18n (21 tests passed)
- ✅ **Step 4**: 业务逻辑集成 (1308 tests passed)
- ✅ **Step 5**: 浏览器测试验证
- ✅ **Step 6**: 文档更新

### 测试状态

- **单元测试**: ✅ 1308 passed | 2 skipped
- **覆盖率**: ✅ 73.08% (行) | 63.05% (分支) | 74.37% (函数)
- **构建**: ✅ 成功 (2672ms)
- **浏览器测试**: ✅ 用户验证通过

### 提交记录

- **Commit**: `8f03c8d` (feat/ai-first-optimization)
- **文件**: 13 files changed (+1554, -115)
- **核心文件**: AICapabilityManager.ts, AIEngineAssignment.tsx, ProfileSettings.tsx, RSSSettings.tsx

### 相关文档

- ✅ [实现计划](./PHASE_8_STEP_4_INTEGRATION.md)
- ✅ [完成报告](./PHASE_8_STEP_4_COMPLETION.md)
- ✅ [Bug 修复记录](./PHASE_8_BUGFIX.md)
- ✅ [UI 优化记录](./PHASE_8_UI_POLISH.md)
- ✅ [完成状态总结](./PHASE_8_STATUS.md)
- ✅ [PRD 更新](./PRD.md#93-ai-集成)
- ✅ [TDD 更新](./TDD.md#54-ai-引擎任务路由机制phase-8)
- ✅ [用户指南更新](./USER_GUIDE_ZH.md#ai-引擎分配)

---

## 📋 需求概述

### 核心问题

Silent Feed 的 AI 有 4 个不同用途，调用频率和精度要求各异：

| 用途 | 调用频率 | 成本敏感度 | 精度要求 | 推理价值 |
|------|---------|-----------|---------|---------|
| 📖 学习文章 | 极高（每页） | 极高 | 中 | 低 |
| 📰 订阅分析 | 高（每篇） | 高 | 中 | 低 |
| 👤 用户画像 | 低（100页/次） | 中 | 高 | 高 |
| 🎯 推荐理由 | 中（每次推荐） | 中 | 高 | 高 |

### 解决方案

提供 **3 种预设方案** + **细粒度配置**，让用户根据需求自由选择：

1. **🔒 隐私优先** - 全部本地 AI（数据不外传，需要高性能设备）
2. **🧠 智能优先** - 远程 AI + 合理推理（推荐，质量最佳）
3. **💰 经济优先** - 远程 AI 标准模式（成本最低）

---

## 🎯 功能设计

### 1. 数据结构

#### AIEngineAssignment 接口

```typescript
/**
 * AI 引擎分配配置
 */
export interface AIEngineAssignment {
  /** 学习文章（浏览历史分析） */
  pageAnalysis: {
    provider: AIProvider
    model?: string
    useReasoning: false  // 强制关闭推理
  }
  
  /** 订阅源文章分析 */
  feedAnalysis: {
    provider: AIProvider
    model?: string
    useReasoning: false  // 强制关闭推理
  }
  
  /** 用户画像生成 */
  profileGeneration: {
    provider: AIProvider
    model?: string
    useReasoning?: boolean  // 可选推理
  }
  
  /** 推荐理由生成 */
  recommendation: {
    provider: AIProvider
    model?: string
    useReasoning?: boolean  // 可选推理
  }
}

type AIProvider = 'ollama' | 'deepseek' | 'openai' | 'keyword'
```

#### 预设方案定义

```typescript
export const AI_ENGINE_PRESETS = {
  privacy: {
    name: "隐私优先",
    icon: "🔒",
    description: "全部本地AI，数据不外传",
    estimatedCost: "¥0/月",
    performanceImpact: "🔥🔥🔥 高",
    config: { /* 全部 ollama */ }
  },
  
  intelligence: {
    name: "智能优先",
    icon: "🧠",
    description: "远程AI + 推理引擎，质量最佳",
    recommended: true,
    estimatedCost: "¥5-8/月",
    performanceImpact: "🔥 低",
    config: { /* 远程 + 低频推理 */ }
  },
  
  economic: {
    name: "经济优先",
    icon: "💰",
    description: "远程AI标准模式，省钱够用",
    estimatedCost: "¥0.5-1/月",
    performanceImpact: "✅ 无",
    config: { /* 全部远程标准 */ }
  }
}
```

### 2. UI 设计

#### 预设选择卡片

```
┌───────────────────────────────────────────────────┐
│ 🎯 快速预设                                        │
├───────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────┐   │
│ │ 🔒 隐私优先                    ¥0/月        │   │
│ │ 全部本地AI，数据不外传    🔥🔥🔥 高性能消耗 │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ ┌─────────────────────────────────────────────┐   │
│ │ 🧠 智能优先 [推荐]            ¥5-8/月       │ ← 默认
│ │ 远程AI+推理引擎，质量最佳  ✅ 零本机负担    │   │
│ └─────────────────────────────────────────────┘   │
│                                                   │
│ ┌─────────────────────────────────────────────┐   │
│ │ 💰 经济优先                    ¥0.5-1/月    │   │
│ │ 远程AI标准模式，省钱够用   ✅ 零本机负担    │   │
│ └─────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────┘
```

#### 详细配置表格

```
┌────────────────────────────────────────────────────┐
│ 📊 详细配置（高级）                [展开/收起]      │
├──────────┬──────────┬──────────┬─────────┬────────┤
│ 任务     │ AI引擎   │ 模型     │ 推理    │ 说明   │
├──────────┼──────────┼──────────┼─────────┼────────┤
│📖学习文章 │DeepSeek▼│ -chat    │ -       │高频    │
│📰订阅分析 │DeepSeek▼│ -chat    │ -       │高频    │
│👤用户画像 │DeepSeek▼│ -chat    │[✓]      │低频准确│
│🎯推荐理由 │DeepSeek▼│ -chat    │[✓]      │中频准确│
├──────────┴──────────┴──────────┴─────────┼────────┤
│               预估成本: ¥5-8/月           │        │
└───────────────────────────────────────────┴────────┘
```

### 3. 性能警告

当选择本地 AI 用于高频任务时，显示警告：

```tsx
<div className="p-3 bg-yellow-50 rounded-lg">
  <div className="flex items-start gap-2">
    <span className="text-xl">⚠️</span>
    <div>
      <p className="font-medium text-yellow-800">性能影响提醒</p>
      <p className="text-sm text-yellow-700">
        学习文章使用本地AI会导致：
      </p>
      <ul className="text-sm text-yellow-600 mt-1">
        <li>• 每次浏览等待 3-5 秒</li>
        <li>• CPU 占用 30-50%</li>
        <li>• 电池续航显著下降</li>
      </ul>
      <p className="text-sm text-yellow-800 font-medium mt-2">
        建议: 高频任务使用远程AI，每月仅需 ¥0.5
      </p>
    </div>
  </div>
</div>
```

---

## 🔧 实现步骤

### Step 1: 类型定义
- [ ] 创建 `src/types/ai-engine-assignment.ts`
- [ ] 定义 `AIEngineAssignment` 接口
- [ ] 定义预设方案常量

### Step 2: 存储层
- [ ] 扩展 `src/storage/ai-config.ts`
- [ ] 添加 `engineAssignment` 字段到 AIConfig
- [ ] 提供默认值（智能优先）

### Step 3: UI 组件
- [ ] 创建 `src/components/settings/AIEngineAssignment.tsx`
- [ ] 实现预设选择卡片
- [ ] 实现详细配置表格
- [ ] 添加性能警告提示

### Step 4: 业务逻辑
- [ ] 更新 `AICapabilityManager` 使用引擎分配
- [ ] 为不同用途选择对应的 AI 引擎
- [ ] 添加成本统计

### Step 5: 测试
- [ ] 单元测试：预设配置正确性
- [ ] 单元测试：引擎选择逻辑
- [ ] 集成测试：不同预设的实际效果
- [ ] 浏览器测试：UI 交互和保存

### Step 6: 文档
- [ ] 更新 `docs/AI_ARCHITECTURE.md`
- [ ] 添加用户指南
- [ ] 更新 PRD.md

---

## 📊 预设方案对比

| 方案 | 学习 | 订阅 | 画像 | 推荐 | 月成本 | 性能影响 |
|------|------|------|------|------|--------|---------|
| 🔒 隐私 | 本地 | 本地 | 本地 | 本地 | ¥0 | 🔥🔥🔥 |
| 🧠 智能 | 远程 | 远程 | 远程+推理 | 远程+推理 | ¥5-8 | 🔥 低 |
| 💰 经济 | 远程 | 远程 | 远程 | 远程 | ¥0.5-1 | ✅ 无 |

---

## ✅ 验收标准

### 功能验收
- [ ] 用户可以选择预设方案
- [ ] 用户可以自定义每个用途的 AI 引擎
- [ ] 配置保存并在重启后恢复
- [ ] 实时显示预估成本

### 体验验收
- [ ] 预设切换即时生效
- [ ] 性能警告及时显示
- [ ] 配置说明清晰易懂
- [ ] 推荐方案明显标识

### 技术验收
- [ ] 类型安全（TypeScript）
- [ ] 测试覆盖率 ≥ 70%
- [ ] 无性能回退
- [ ] 向后兼容（旧配置自动迁移）

---

## 🚀 后续优化

### Phase 8.1: 成本追踪
- 实时统计各引擎的调用次数和成本
- 提供月度成本报告
- 预算预警功能

### Phase 8.2: 智能推荐
- 根据用户使用模式推荐最优配置
- 自动检测性能瓶颈并建议调整

### Phase 8.3: A/B 测试
- 对比不同配置的推荐质量
- 数据驱动优化默认预设

---

**文档版本**: v1.0  
**最后更新**: 2025年11月27日  
**维护者**: Silent Feed Team
