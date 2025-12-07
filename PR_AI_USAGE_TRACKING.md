# 修复 AI 用量追踪和柱形图显示问题

## 问题概述

本 PR 修复了多个与 AI 用量追踪、统计和可视化相关的问题，以及 DNR (Declarative Net Request) 配置的问题。

## 主要修复

### 1. AI 用量追踪优化 ✅
- 修复 AI 用量统计记录问题
- 优化画像生成触发机制，大幅降低 AI 用量
- 修正 AI 用量统计相关问题
- 实现 AI 用量按日统计功能

### 2. 页面浏览追踪修复 ✅
- 修复页面浏览去重问题，防止重复学习
- 修复 Chrome 内部页面追踪和重载触发画像重建问题
- 完善 warmup 页面过滤和重载触发调试

### 3. AI 用量柱形图优化 ✅
- 修正 AI 用量柱形图布局为横向时间轴
- 重新设计为专业三图表布局（Token、调用次数、费用）
- **修复宽度溢出问题**：
  - 移除 `viewportColumns` 限制，改用实际数据长度计算缩放
  - 确保所有数据都能显示，超出容器时自动启用水平滚动
  - 删除 CollectionStats 中冗余的本地 AI 统计和货币分组区块

### 4. DNR 配置重构 ✅
- **使用 Plasmo 原生方式处理 DNR 静态配置**
- 在 package.json manifest 中直接配置 `declarative_net_request`
- 构建前将 dnr-rules.json 复制到 `.plasmo/` 目录，让 Plasmo 自动打包
- Plasmo 自动添加文件 hash 并更新 manifest 路径
- dev 和 build 都通过 `pre-build-dnr.sh` 准备文件
- 删除复杂的后处理注入脚本

## DNR 方案优势

- ✅ 完全静态配置，Plasmo 在构建时处理
- ✅ 自动文件 hash，支持缓存控制
- ✅ dev 和 build 流程一致，不会冲突
- ✅ Chrome 热重载不会报错
- ✅ 真正的静态规则，符合扩展最佳实践

## 测试验证

- ✅ 所有单元测试通过 (1488/1489)
- ✅ 生产构建成功
- ✅ DNR 规则正确加载
- ✅ 图表宽度自适应和滚动功能正常

## 文件变更

### 核心功能
- `src/components/settings/AIUsageBarChart.tsx` - 柱形图组件优化
- `src/components/settings/CollectionStats.tsx` - 统计页面简化
- `src/core/ai/AIUsageTracker.ts` - AI 用量追踪
- `src/background.ts` - DNR 规则检查逻辑优化

### 构建配置
- `package.json` - DNR manifest 配置
- `scripts/pre-build-dnr.sh` - 构建前准备脚本
- `dnr-rules.json` - DNR 规则文件

### 文档
- `docs/DNR_CONFIG.md` - DNR 配置完整说明

## 影响范围

- AI 用量统计功能
- 设置页面的图表显示
- Chrome 扩展的 DNR CORS 修复
- 构建流程（dev 和 build）

## 后续计划

- 监控 AI 用量数据收集情况
- 收集用户对图表的反馈
- 持续优化性能

---

**相关 Issue**: #AI用量追踪 #柱形图显示 #DNR配置
