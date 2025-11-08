# FeedAIMuter 渐进式开发计划

## 开发理念

**每一步都可见、可测、可用**

- ✅ 每个功能都有明确的验收标准
- ✅ 每个功能都可以在浏览器中直接体验
- ✅ 每个功能都有配套的测试
- ✅ 每个功能完成后更新文档

---

## 阶段 0: 基础框架 ✅ (已完成)

### 目标
建立项目基础和测试体系

### 已完成
- ✅ 项目初始化 (Plasmo + React + TypeScript)
- ✅ 测试体系 (Vitest + Testing Library)
- ✅ 开发规范 (copilot-instructions)
- ✅ 文档体系 (PRD, TDD, TESTING)
- ✅ 扩展可以构建和加载

### 验收标准
- ✅ `npm run build` 成功
- ✅ `npm test` 全部通过
- ✅ 可在 Chrome 中加载扩展

---

## 阶段 1: Hello World 扩展 ✅ (已完成)

### 目标
让用户能看到一个有基本 UI 的扩展

### 功能列表

#### 1.1 创建 Popup 界面 ✅ (已完成)
**文件**: `src/popup.tsx`

**功能**:
- 显示扩展名称和图标
- 显示欢迎消息
- 显示当前状态 (未初始化)
- 显示初始化进度 0/1000

**验收标准**:
- ✅ 点击扩展图标后弹出界面
- ✅ 界面显示 "Feed AI Muter" 标题
- ✅ 显示 🌱 图标和 "0/1000 页" 文字
- ✅ 界面自适应明暗主题
- ✅ 有测试覆盖（100%）

**实际实现**:
- ✅ 产品简称：RSS 静音器
- ✅ 大号图标（text-8xl）带脉动动画
- ✅ 进度条在下方，清晰可见
- ✅ 完整测试（21个测试用例）
- ✅ PR: #待创建

#### 1.1.5 国际化支持 ✅ (已完成)
**文件**: `src/i18n/*`, `scripts/translate.js`

**功能**:
- 使用 react-i18next 实现国际化
- 支持简体中文和英文
- 使用 _() 函数包裹用户可见文本
- 自动翻译脚本（DeepSeek API）
- 翻译跟踪系统

**验收标准**:
- ✅ 支持中英文切换
- ✅ 自动检测用户语言
- ✅ 提取脚本可用
- ✅ 翻译脚本可用
- ✅ 现有界面完全翻译
- ✅ 开发日志保持中文，用户消息国际化

**用户体验**:
```
┌─────────────────────────────┐
│  🌱 FeedAIMuter              │
├─────────────────────────────┤
│  欢迎使用智能 RSS 阅读器      │
│                              │
│  ╔═══════════════════════╗   │
│  ║ ░░░░░░░░░░░░░░░░░░░░░ ║ 0/1000 │
│  ╚═══════════════════════╝   │
│                              │
│  📖 开始浏览，我会学习你的    │
│     兴趣...                   │
│                              │
│  [设置]                       │
└─────────────────────────────┘
```

#### 1.2 创建设置页面 ✅ (已完成)
**文件**: `src/options.tsx`

**功能**:
- ✅ 语言选择下拉列表（跟随浏览器/中文/英文）
- ✅ 标签页布局（常规、RSS 源管理、AI、数据与隐私）
- ✅ 使用主题样式，自适应明暗主题
- ✅ 预留设置分区，显示禁用状态

**验收标准**:
- ✅ Popup 点击设置可跳转
- ✅ 语言选择下拉框正常工作
- ✅ 标签切换流畅，激活状态明显
- ✅ 自适应明暗主题
- ✅ 预留四个设置分区
- ✅ 测试覆盖率达标（21 个测试）

**设计规格**:
```
┌─────────────────────────────────────────────────┐
│  Feed AI Muter - 设置                             │
├─────────────┬───────────────────────────────────┤
│  ⚙️ 常规    │  常规设置                          │
│  📡 RSS 源  │  选择界面显示语言                   │
│  🤖 AI      │                                    │
│  🔒 隐私    │  语言: [下拉选择 ▼]                │
│             │                                    │
│             │                                    │
│             │                                    │
└─────────────┴───────────────────────────────────┘
```

#### 1.3 徽章进度系统 ✅ (已完成)
**文件**: `src/background.ts`

**功能**:
- 使用 Chrome Badge API 在图标上显示进度
- 徽章文本使用不同阶段的 emoji 代表进度
  - 🌱 (0-250 页): 探索者
  - 🌿 (251-600 页): 学习者
  - 🌳 (601-1000 页): 成长者
  - 🌲 (1000+ 页): 大师
- 暂时使用默认图标（未来可自定义）

**验收标准**:
- ✅ 扩展图标上显示徽章文本（emoji）
- ✅ 徽章随页面计数自动更新
- ✅ 不同阶段使用不同的 emoji
- ✅ 有测试覆盖

**实际实现**:
- ✅ Badge 文本设置函数
- ✅ 进度阶段计算逻辑
- ✅ 与 popup 进度同步
- ✅ PR: #待创建

### 本阶段完成总结

**Phase 1: Hello World 扩展** 已全部完成！🎉

完成的功能：
- ✅ Popup 界面（进度展示、欢迎消息）
- ✅ 国际化支持（中英双语）
- ✅ 设置页面（标签页布局、语言切换）
- ✅ 徽章系统（进度可视化）

技术指标：
- 测试覆盖率: > 70%
- 国际化覆盖: 100%
- 构建成功率: 100%

版本发布：
- **v0.1.0** - Phase 1 MVP Release
  - 基础 UI 框架
  - 国际化支持
  - 设置页面
  - 进度徽章系统

### 下一步
进入 **阶段 2: 页面访问监听**，开始收集用户浏览数据

---

## 阶段 2: 页面访问监听 ✅ (已完成)

**实际时间**: ~5 小时（含测试和 bug 修复）
**完成日期**: 2025-11-02
**版本**: v0.2.7

### 目标
建立页面访问数据收集系统，为用户画像构建准备数据基础

### 完成成果
- ✅ Content Script 监听系统（DwellTimeCalculator 集成）
- ✅ 数据存储系统（IndexedDB + Dexie.js）
- ✅ 两阶段 UI（冷启动 + 推荐）
- ✅ 徽章系统（进度和推荐数显示）
- ✅ 设置页扩展（5 个标签页）
- ✅ 推荐状态管理（Zustand）
- ✅ **架构修复**: Content Script → Background 消息传递
- ✅ **测试增强**: 143 个测试，覆盖率 77.94%
- ✅ **代码优化**: 移除 ~50 个调试语句

### 关键 Bug 修复
1. ⚠️ **CRITICAL**: Content Script IndexedDB 隔离问题（数据写入错误上下文）
2. ⚠️ **HIGH**: 数据库版本冲突导致数据删除
3. ⚠️ **MEDIUM**: RecommendationStats 接口字段不匹配

### 技术文档
- `docs/PHASE_2_BROWSER_TESTING_ISSUES.md`
- `docs/DATABASE_VERSION_INCIDENT.md`
- `docs/ARCHITECTURE_FIX_CONTENT_SCRIPT_DB.md`
- `docs/PHASE_2_FINAL_TESTING_GUIDE.md`
- `docs/PHASE_2.7_FINAL_SUMMARY.md`

### 功能列表

#### 2.1 Content Script 监听系统 ✅ (已完成)
**文件**: `src/contents/page-tracker.ts`

**功能**:
- 自动注入到所有 HTTP/HTTPS 页面
- 使用 DwellTimeCalculator 计算停留时间
- 监听用户交互（scroll, click, keypress, mousemove）
- 达到 30 秒阈值后保存到 confirmedVisits 表
- 提供详细的调试日志用于浏览器测试
- **生产优化**: 环境感知日志 + 资源清理系统

**验收标准**:
- ✅ 访问网页时自动注入 Content Script
- ✅ 正确计算有效停留时间（激活 + 交互）
- ✅ 30 秒无交互停止计时
- ✅ 达到 30 秒阈值后保存到数据库
- ✅ 避免重复记录
- ✅ 有完整测试覆盖（99/99 测试通过）
- ✅ 生产环境日志静默
- ✅ 记录后资源完全释放

**实际实现**:
- ✅ PageTracker Content Script（302 行）
- ✅ 集成 DwellTimeCalculator
- ✅ 保存到 confirmedVisits 表
- ✅ 环境感知日志系统（logger.ts）
- ✅ 资源清理机制（cleanup 函数）
- ✅ 处理页面卸载
- ✅ 通知 background 更新徽章
- ✅ PR: feature/phase-2.2-dwell-time (已合并)

#### 2.2 DwellTimeCalculator（停留时间计算器）✅ (已完成)
**文件**: `src/core/tracker/DwellTimeCalculator.ts`

**功能**:
- 页面激活状态监听（visibilitychange）
- 用户交互检测（scroll, click, keypress, mousemove）
- 智能停留时间计算（激活 + 交互）
- 30 秒交互超时机制
- **生产优化**: stop() 机制 + 环境感知日志

**验收标准**:
- ✅ 正确计算有效停留时间
- ✅ 页面失活时停止计时
- ✅ 30 秒无交互停止计时
- ✅ 新交互后恢复计时
- ✅ 有完整测试覆盖（26 个单元测试）
- ✅ 支持停止后不再计算

**实际实现**:
- ✅ DwellTimeCalculator 类（202 行）
- ✅ 完整测试套件（419 行，26 个测试）
- ✅ 环境感知日志（logger.debug）
- ✅ stop() 方法和 isStopped 标志
- ✅ PR: feature/phase-2.2-dwell-time (已合并)

#### 2.3 动态停留阈值系统 ⏸️ (暂缓)
**文件**: `src/core/tracker/DwellTimeThresholdManager.ts`

**说明**: Phase 2.1/2.2 使用固定 30 秒阈值，动态阈值系统推迟到后续版本实现

**原设计**:
- 三阶段自适应算法
  - 阶段 1（0-100 页）: 固定 30 秒
  - 阶段 2（101-1000 页）: 自适应计算
  - 阶段 3（1000+ 页）: 持续优化
- 用户可配置范围（15-120 秒）
- 每 100 页重新计算一次

**当前实现**: 
- ✅ 使用固定 30 秒阈值
- ⏸️ 动态算法待实现

#### 2.4 页面过滤引擎 (待开始)
**文件**: `src/core/tracker/PageFilter.ts`

**功能**:
- URL 模式过滤（内网、特殊协议）
- 域名黑名单（邮件、银行、医疗）
- 内容特征过滤（字数、标题、搜索结果页）
- 用户自定义排除规则

**验收标准**:
- [ ] 自动排除内网地址（localhost, 192.168.*, 10.*）
- [ ] 排除敏感域名（邮件、银行等）
- [ ] 排除非内容页面（登录页、404、搜索结果）
- [ ] 支持用户添加自定义排除规则
- [ ] 有完整测试覆盖

**当前状态**: 待实现（将在 PageTracker 中集成）

#### 2.5 内容提取和基础分析 (待开始)
**文件**: `src/core/extractor/`, `src/core/analyzer/`

**功能**:
- 元数据提取（title, description, keywords）
- 正文摘要提取（前 2000 字）
- TF-IDF 关键词提取（Top 20）
- 简单主题分类（规则引擎）
- 语言检测（中文/英文）

**验收标准**:
- [ ] 正确提取页面元数据
- [ ] 智能提取正文内容（article/main/启发式）
- [ ] 生成 Top 20 关键词
- [ ] 分类基础主题（技术、设计、科学等）
- [ ] 检测文本语言
- [ ] 有完整测试覆盖

#### 2.6 数据存储系统 ✅ (已完成)
**文件**: `src/storage/db.ts`, `src/storage/types.ts`, `src/storage/repositories/`

**功能**:
- IndexedDB（Dexie.js）4 张表
  - pendingVisits（临时记录）
  - confirmedVisits（正式记录）
  - settings（用户设置）
  - statistics（统计缓存）
- 数据生命周期管理
  - 原始内容 90 天后删除
  - 分析结果永久保留
- 用户数据控制
  - 清空访问历史
  - 重置画像（Phase 3）
  - 完全重置

**验收标准**:
- ✅ 数据库正确创建和初始化
- ✅ 类型定义完整（PendingVisit, ConfirmedVisit, UserSettings, Statistics）
- ✅ 提供辅助函数（getSettings, updateSettings, getPageCount）
- ✅ 有完整测试覆盖（12 个测试）

**实际实现**:
- ✅ FeedAIMuterDB 类（4 张表）
- ✅ 完整的类型系统
- ✅ 数据库初始化逻辑
- ✅ 测试覆盖率 100%

#### 2.7 实时反馈界面 (待开始)
**更新**: `src/popup.tsx`, `src/options.tsx`, `src/background.ts`

**设计理念**: 推荐是核心，数据收集是手段

**功能**:

##### Popup 界面（两个阶段）

**阶段 1: 冷启动阶段（0-1000 页）**
- 显示收集进度
  - 🌱🌿🌳🌲 成长树图标（随进度变化）
  - 进度条：`637/1000 页`
  - 提示文本："正在学习你的兴趣..."
- **不显示**主题分布（对用户意义不大）

**阶段 2: 推荐阶段（1000+ 页）**
- 显示推荐列表（倒序，最新在上）
  - 每条显示：标题、来源、推荐时间
  - 状态图标：✅ 已读 / 📌 未读
  - 点击打开原文
- 快速统计
  - "本周推荐 X 条，已读 Y 条（Z%）"
  - 一键"标记全部已读"

##### 徽章系统

**冷启动阶段（0-1000 页）**
- 显示成长树 emoji：🌱 → 🌿 → 🌳 → 🌲
- 表示收集进度

**推荐阶段（1000+ 页）**
- 显示数字徽章：`3/10`（已读/推荐）
- 表示未读推荐数

##### 设置页 - 数据统计标签

**推荐效果统计**（主要）
- 📊 推荐总数 / 已读数 / 阅读率
- 📈 近 7 天推荐趋势图（简单折线图）
- ⭐ 最受欢迎的推荐来源（Top 5）

**数据收集统计**（次要）
- 📚 累计分析页面数
- 💾 数据规模统计
  - 总记录数
  - 存储占用（MB）
  - 平均停留时间
- 🗂️ 按域名统计（Top 10）

**用户操作**
- 🧹 清空推荐历史
- 🔄 重置用户画像
- ⚠️ 清空所有数据

**验收标准**:
- [ ] Popup 在冷启动阶段显示进度和树图标
- [ ] Popup 在推荐阶段显示推荐列表
- [ ] 推荐条目可标记已读/未读
- [ ] 徽章在冷启动显示树，推荐阶段显示数字
- [ ] 设置页显示推荐效果统计（主要）
- [ ] 设置页显示数据收集统计（次要）
- [ ] 统计数据实时更新
- [ ] 有完整测试覆盖

**技术实现**:
- 使用 Zustand 管理状态（推荐列表、阅读状态）
- IndexedDB 新增表：`recommendations`
  - id, url, title, source, recommendedAt, isRead, clickedAt
- Background 定时更新徽章
- Popup 使用虚拟滚动（推荐列表可能很长）

**UI 设计原则**:
- 冷启动：鼓励用户继续浏览
- 推荐阶段：聚焦推荐内容，淡化数据收集
- 克制设计：不显示过多统计数据

### 本阶段文档
- [x] `docs/PHASE_2_DESIGN.md` - 详细设计文档
- [x] `docs/PHASE_2_BROWSER_TESTING.md` - 浏览器测试指南
- [x] `docs/PHASE_2_PRODUCTION_OPTIMIZATION.md` - 生产环境优化总结
- [x] 更新 `docs/DEVELOPMENT_PLAN.md` - 开发计划
- [ ] 更新 `docs/TDD.md` - 技术设计文档

### 完成标准
- [x] Phase 2.1 Content Script 系统（PageTracker）
- [x] Phase 2.2 DwellTimeCalculator
- [x] Phase 2.6 数据存储系统
- [ ] Phase 2.4 页面过滤引擎
- [ ] Phase 2.5 内容提取和分析
- [ ] Phase 2.7 实时反馈界面
- [ ] 所有验收标准通过
- [ ] 测试覆盖率 ≥ 70%
- [ ] 浏览器实测通过
- [ ] 代码已合并到 master
- [ ] 文档已更新

---

## 阶段 3: 用户画像构建 ✅ (已完成)

### 目标
分析用户浏览行为，构建兴趣画像

### 功能列表

#### 3.1 文本分析引擎 ✅ (已完成)
**文件**: `src/core/analyzer/TextAnalyzer.ts`

**功能**:
- ✅ TF-IDF 关键词提取
- ✅ 中英文分词（特别优化中文词组提取）
- ✅ 停用词过滤
- ✅ 语言检测

**验收标准**:
- ✅ 支持中英文内容分析
- ✅ 关键词提取准确率高
- ✅ 中文分词算法优化（词组级别）
- ✅ 有完整测试覆盖

#### 3.2 用户画像构建器 ✅ (已完成)
**文件**: `src/core/profile/ProfileBuilder.ts`, `src/core/profile/ProfileManager.ts`

**功能**:
- ✅ 从页面访问构建画像
- ✅ 主题分类（技术、生活、娱乐等）
- ✅ 时间衰减算法
- ✅ 兴趣权重计算

**验收标准**:
- ✅ 画像数据结构完善
- ✅ 主题分类准确
- ✅ 权重计算合理
- ✅ 支持增量更新

#### 3.3 画像可视化 ✅ (已完成)
**文件**: `src/components/settings/UserProfileDisplay.tsx`

**功能**:
- ✅ 显示主导兴趣主题
- ✅ 显示主题占比和权重
- ✅ 三层优势策略（绝对、相对、领先）
- ✅ 关键词云展示
- ✅ 分析进度显示

**验收标准**:
- ✅ 界面清晰易懂
- ✅ 数据可视化效果好
- ✅ 支持明暗主题
- ✅ 响应式设计

#### 3.4 兴趣演化追踪 ✅ (超出计划完成)
**文件**: `src/core/profile/InterestSnapshotManager.ts`

**功能**:
- ✅ 兴趣变化检测
- ✅ 历史快照记录
- ✅ 演化时间线展示
- ✅ 变化原因分析

#### 3.5 智能自动更新 ✅ (超出计划完成)
**文件**: `src/core/profile/ProfileUpdateScheduler.ts`

**功能**:
- ✅ 智能更新调度
- ✅ 性能优化策略
- ✅ 避免频繁计算
- ✅ 优先级管理

### 本阶段文档
- ✅ 已更新 `docs/DEVELOPMENT_PLAN.md`
- ✅ 代码内文档完善
- ✅ 测试文档完整

---

## 阶段 4: AI 能力集成 🤖 (当前阶段)

**目标**：建立灵活的 AI 分析能力，支持远程 API 和降级策略

**开发原则**：
1. ✅ **UI 优先** - 先做配置界面，能看到变化
2. ✅ **远程 API 优先** - OpenAI/Anthropic/DeepSeek
3. ✅ **渐进测试** - 每个功能都能立即测试
4. ✅ **不考虑迁移** - 丢弃旧数据，重新开始

**预计时间**: 10-14 天

---

### Sprint 1: UI 基础（2-3天）✨ 可见变化

#### 4.1 AI 配置界面（1天）
**文件**: `src/components/settings/AIConfig.tsx`

**功能**:
- 设置页面新增 "AI 配置" 标签
- 远程 API 配置表单（OpenAI/Anthropic/DeepSeek）
- API Key 输入和保存（chrome.storage.sync 加密）
- 测试连接按钮

**UI 设计**:
```
设置 → AI 配置

┌─────────────────────────────────────────────────┐
│ 远程 AI 服务（可选，需要 API Key）              │
├─────────────────────────────────────────────────┤
│ 提供商: [未配置 ▼]                              │
│         └─ OpenAI                               │
│         └─ Anthropic (Claude)                   │
│         └─ DeepSeek                             │
│                                                 │
│ [配置 API Key...]                               │
│                                                 │
│ ℹ️ 配置后将优先使用远程 AI（更准确，需付费）    │
└─────────────────────────────────────────────────┘
```

**验收标准**:
- [ ] 能看到 AI 配置界面
- [ ] 能选择 AI 提供商
- [ ] 能输入和保存 API Key
- [ ] 测试连接按钮正常工作
- [ ] 数据加密存储

#### 4.2 AI 状态卡片（半天）
**文件**: `src/components/settings/CollectionStats.tsx`

**功能**:
- 数据管理页面新增 "AI 状态" 卡片
- 显示当前配置的 AI 提供商
- 显示连接状态
- 显示本月使用统计

**验收标准**:
- [ ] 能看到 AI 状态卡片
- [ ] 显示当前提供商和连接状态
- [ ] 显示使用统计

#### 4.3 分析结果展示优化（半天）
**文件**: `src/components/settings/UserProfileDisplay.tsx`

**功能**:
- 用户画像页面新增 "AI 分析质量" 指标
- 显示 AI 分析 vs 关键词分析的占比
- 显示平均置信度

**验收标准**:
- [ ] 能看到分析质量指标
- [ ] 数据准确显示

---

### Sprint 2: AI 抽象层（1-2天）🏗 基础设施

#### 4.4 数据类型定义（半天）
**文件**: `src/core/ai/types.ts`

**功能**:
```typescript
export interface UnifiedAnalysisResult {
  // 通用字段
  topicProbabilities: Record<Topic, number>
  confidence: number
  provider: string
  
  // AI 特有（可选）
  entities?: Entity[]
  sentiment?: Sentiment
  
  // 兼容字段
  keywords: string[]
  topics: string[]
  language: string
}

export interface AIProvider {
  name: string
  isAvailable(): Promise<boolean>
  analyzeContent(text: string): Promise<UnifiedAnalysisResult>
}
```

**验收标准**:
- [ ] 类型定义完整
- [ ] 兼容现有 AnalysisResult

#### 4.5 OpenAI Provider（1天）
**文件**: `src/core/ai/providers/OpenAIProvider.ts`

**功能**:
- 实现第一个真实的 AI Provider
- 使用 GPT-4o-mini（便宜快速）
- Prompt 工程

**验收标准**:
- [ ] OpenAI API 调用成功
- [ ] 返回统一格式数据
- [ ] 错误处理完善
- [ ] 有测试覆盖

**测试**:
```javascript
const provider = new OpenAIProvider('sk-xxx')
const result = await provider.analyzeContent('React 是...')
console.log(result.topicProbabilities)
```

#### 4.6 降级方案（半天）
**文件**: `src/core/ai/providers/FallbackKeywordProvider.ts`

**功能**:
- 包装现有 TextAnalyzer 为 AIProvider
- 关键词 → 概率云转换

**验收标准**:
- [ ] 降级方案正常工作
- [ ] 格式转换正确

---

### Sprint 3: 集成到页面分析（1天）🔗 打通流程

#### 4.7 AICapabilityManager（半天）
**文件**: `src/core/ai/AICapabilityManager.ts`

**功能**:
- 管理 AI Provider 列表
- 自动选择可用的 Provider
- 降级策略

**优先级逻辑**:
```typescript
1. 用户配置的远程 API（如果有）
2. 降级到关键词分析（始终可用）
```

**验收标准**:
- [ ] Provider 管理正常
- [ ] 降级策略正确
- [ ] 有测试覆盖

#### 4.8 集成到 page-tracker（半天）
**文件**: `src/contents/page-tracker.ts`

**功能**:
- 替换现有的 TextAnalyzer 调用
- 使用 AICapabilityManager

**验收标准**:
- [ ] 新页面使用 AI 分析
- [ ] 降级方案正常工作
- [ ] 数据库保存正确

**测试流程**:
1. 配置 OpenAI API Key
2. 浏览新页面
3. 检查 IndexedDB，看到 AI 分析结果
4. 移除 API Key，看到降级到关键词分析

---

### Sprint 4: 更多远程 API（2天）🚀 扩展能力

#### 4.9 Anthropic Provider（1天）
**文件**: `src/core/ai/providers/AnthropicProvider.ts`

**功能**:
- 使用 Claude-3-Haiku（最便宜）
- API 调用和解析

**验收标准**:
- [ ] Anthropic API 调用成功
- [ ] 格式转换正确

#### 4.10 DeepSeek Provider（1天）
**文件**: `src/core/ai/providers/DeepSeekProvider.ts`

**功能**:
- 使用 deepseek-chat
- API 调用和解析

**验收标准**:
- [ ] DeepSeek API 调用成功
- [ ] 格式转换正确

---

### Sprint 5: 用户画像升级（2天）📊 数据优化

#### 4.11 ProfileBuilder 升级（1天）
**文件**: `src/core/profile/ProfileBuilder.ts`

**功能**:
- 使用 topicProbabilities 替代 keywords
- 概率云加权聚合

**验收标准**:
- [ ] 新算法正常工作
- [ ] 画像更准确
- [ ] 兼容旧数据

#### 4.12 UI 展示优化（1天）
**文件**: `src/components/settings/UserProfileDisplay.tsx`

**功能**:
- 显示 AI 分析的实体
- 显示情感倾向
- 显示置信度

**验收标准**:
- [ ] 实体展示清晰
- [ ] 数据准确

---

### Sprint 6: 成本控制（1天）💰 可选功能

#### 4.13 成本追踪（半天）
**文件**: `src/core/ai/CostTracker.ts`

**功能**:
- 记录 API 使用
- 计算成本

**验收标准**:
- [ ] 成本记录准确
- [ ] 数据库存储正常

#### 4.14 成本统计 UI（半天）
**文件**: `src/components/settings/AIConfig.tsx`

**功能**:
- 显示本月使用
- 显示预算进度

**验收标准**:
- [ ] UI 显示正确
- [ ] 数据实时更新

---

### 本阶段文档
- [ ] `docs/PHASE_4_AI_INTEGRATION.md` - 详细设计文档
- [ ] 更新 `docs/DEVELOPMENT_PLAN.md`
- [ ] 更新 `docs/TDD.md`

### 完成标准
- [ ] 所有 UI 组件完成
- [ ] OpenAI Provider 工作正常
- [ ] Anthropic Provider 工作正常
- [ ] DeepSeek Provider 工作正常
- [ ] 降级方案正常
- [ ] 用户画像升级完成
- [ ] 成本追踪功能完成
- [ ] 测试覆盖率 ≥ 80%
- [ ] 浏览器实测通过
- [ ] 文档已更新

---

## 阶段 5: RSS 自动发现 (原阶段 4)

### 目标
自动检测网页的 RSS 源并提示订阅

### 功能列表

#### 4.1 RSS 检测
**文件**: `src/contents/rss-detector.ts`

**功能**:
- 检测 `<link rel="alternate">` 标签
- 尝试常见 RSS URL 模式
- 验证 RSS 有效性

#### 4.2 订阅管理
**文件**: `src/core/rss/RSSManager.ts`

**功能**:
- OPML 导入/导出
- 源健康检测
- 自动订阅/取消

#### 4.3 订阅 UI
**更新**: `src/popup.tsx`

**功能**:
- 显示已订阅源列表
- 显示"发现新源"提示
- 一键订阅/取消订阅

### 本阶段文档
- [ ] `docs/PHASE_4_RSS_DISCOVERY.md`

---

## 阶段 5: AI 推荐引擎 (预计 4 小时)

### 目标
实现基础推荐算法和 AI 集成

### 功能列表

#### 5.1 规则引擎推荐
**文件**: `src/core/recommender/RuleBasedRecommender.ts`

**功能**:
- TF-IDF 相似度匹配
- 时效性评分
- 预筛选算法

#### 5.2 AI 适配器
**文件**: `src/core/ai/AIAdapter.ts`

**功能**:
- 支持 OpenAI API
- 支持 Anthropic API
- 支持 DeepSeek API
- Prompt 工程

#### 5.3 推荐展示
**更新**: `src/popup.tsx`

**功能**:
- 显示推荐列表
- 显示推荐理由
- 反馈按钮 (喜欢/忽略/稍后)

### 本阶段文档
- [ ] `docs/PHASE_5_RECOMMENDATION.md`

---

## 阶段 6: 通知机制 (预计 2 小时)

### 目标
智能推送重要内容

### 功能列表

#### 6.1 通知策略
**文件**: `src/core/notification/NotificationManager.ts`

**功能**:
- 重要性评分
- 用户状态检测
- 每日配额管理

#### 6.2 扩展图标状态
**文件**: `src/background/badge-manager.ts`

**功能**:
- 显示未读数字徽章
- 图标动画 (可选)

### 本阶段文档
- [ ] `docs/PHASE_6_NOTIFICATION.md`

---

## 阶段 7: 优化与发布 (预计 3 小时)

### 目标
完善体验，准备发布

### 功能列表

#### 7.1 性能优化
- 批量处理
- 缓存策略
- 懒加载

#### 7.2 用户引导
- 首次使用教程
- 帮助文档
- 反馈渠道

#### 7.3 Chrome Web Store 准备
- 截图和宣传图
- 商店描述
- 隐私政策

### 本阶段文档
- [ ] `docs/PHASE_7_POLISH.md`
- [ ] `docs/PUBLISHING.md`

---

## 开发节奏建议

### 每个阶段的流程

1. **开始前** (5 分钟)
   - 阅读阶段文档
   - 创建功能分支: `git checkout -b feature/phase-N`

2. **开发中** (主要时间)
   - 编写测试 (TDD)
   - 实现功能
   - 频繁提交: `git commit -m "feat: xxx"`

3. **完成后** (10 分钟)
   - 运行测试: `npm test`
   - 检查覆盖率: `npm run test:coverage`
   - 更新文档
   - 合并到 master: `git merge feature/phase-N`
   - 推送: `git push`

### 每日开发建议

- **每次 1-2 小时**: 完成一个小功能
- **立即验证**: 在浏览器中测试
- **及时提交**: 不积累太多未提交代码

---

## 当前状态

- ✅ **阶段 0**: 基础框架 (已完成)
- ✅ **阶段 1**: Hello World 扩展 (已完成) - **v0.1.0**
- ✅ **阶段 2**: 页面访问监听 (已完成) - **v0.2.7**
- ✅ **阶段 3**: 用户画像构建 (已完成) - **v0.3.4**
- 🎯 **阶段 4**: RSS 自动发现 (下一步)
- ⏸️ **阶段 5-7**: 等待开始

---

## 估计时间

| 阶段 | 预计时间 | 累计时间 | 状态 |
|------|---------|---------|------|
| 阶段 0 | 2 小时 | 2 小时 | ✅ |
| 阶段 1 | 1 小时 | 3 小时 | ✅ |
| 阶段 2 | 2 小时 | 5 小时 | ✅ (实际 ~5 小时) |
| 阶段 3 | 3 小时 | 8 小时 | ✅ (实际 ~4 小时) |
| 阶段 4 | 2 小时 | 10 小时 | ⏸️ |
| 阶段 5 | 4 小时 | 14 小时 | ⏸️ |
| 阶段 6 | 2 小时 | 16 小时 | ⏸️ |
| 阶段 7 | 3 小时 | 19 小时 | ⏸️ |

**MVP 总计**: 约 19 小时 (2-3 周业余时间)
**已完成**: 9 小时 (47%) 🎉

---

## 下一步

**Phase 3 已完成！** ✅

### Phase 3.4 完成总结

- ✅ **核心功能**: 文本分析引擎、用户画像构建器、画像可视化全部完成
- ✅ **超出预期**: 兴趣演化追踪系统、智能自动更新调度器
- ✅ **技术突破**: 中文分词算法优化、三层兴趣优势策略  
- ✅ **完整UI**: 关键词云、兴趣时间线、数据管理功能
- ✅ **性能优化**: 智能画像更新策略，避免频繁计算
- ✅ **数据架构**: 兴趣快照系统，支持历史追踪

实现功能超出原始计划，为后续 RSS 发现和 AI 推荐奠定坚实基础。

### 准备进入 **阶段 4: AI 能力集成** 🤖

**战略调整**：在 RSS 发现之前引入 AI 能力，提升内容分析质量

**核心理念**：
- 🎯 AI 优先于关键词 - 更精准的语义理解
- 🔄 渐进式开发 - UI 优先，远程 API 优先
- � 成本可控 - 免费方案 + 可选付费
- 🔒 隐私优先 - 用户完全控制

**预计时间**: 10-14 天
